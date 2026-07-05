/**
 * GPTImageAdapter – GPT-image-2 via EvoLink async API
 *
 * Unified endpoint: POST /v1/images/generations
 *   - T2I:  { model, prompt, size, n, quality?, resolution?, seed? }
 *   - I2I:  + image_urls: ["url1", ...] (1-16 reference images)
 *   - Edit: + image_urls: ["url"] + mask_url: "url"
 *
 * Polling: GET /v1/tasks/{task_id}
 *
 * Polling strategy:
 *   - Initial interval: 2 s
 *   - Exponential growth: 2 → 4 → 8 → 10 (capped) seconds
 *   - Maximum total wait: 5 minutes
 *   - Supports cancellation via AbortSignal
 */

import { apiPost, apiGet } from './client';

const POLL_INITIAL_MS = 2000;
const POLL_MAX_INTERVAL_MS = 10000;
const POLL_TOTAL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const SUBMIT_MAX_RETRIES = 3;
const SUBMIT_BACKOFF_MS = 2000; // 2s, 4s, 8s
const MAX_IMAGE_URLS = 16;

/**
 * POST with retry: handles network errors + proxy 5xx/502.
 * Retries up to SUBMIT_MAX_RETRIES times with exponential backoff.
 * @param {string} url
 * @param {Object} body
 * @param {AbortSignal} [signal]
 * @param {string} [label] - for log messages
 */
async function postWithRetry(url, body, signal, label = 'Submit') {
  for (let attempt = 0; attempt <= SUBMIT_MAX_RETRIES; attempt++) {
    try {
      // _noRetry: true disables axios interceptor retry (postWithRetry handles retries itself)
      return await apiPost(url, body, signal, { _noRetry: true });
    } catch (err) {
      const status = err.status || err.response?.status || 0;
      const isRetryable = !signal?.aborted && (
        status === 0 ||
        status >= 500 ||
        /network|fetch|timeout|ECONN/i.test(err.message)
      );
      if (isRetryable && attempt < SUBMIT_MAX_RETRIES) {
        const waitMs = SUBMIT_BACKOFF_MS * Math.pow(2, attempt);
        console.warn(`[GPTImageAdapter] ${label} failed (status=${status}, attempt=${attempt + 1}/${SUBMIT_MAX_RETRIES + 1}), retrying in ${waitMs}ms...`, err.message);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      throw err;
    }
  }
}

/**
 * Poll with exponential backoff until a condition is met or timeout.
 * @param {Function} checkFn - async () => result; return null to keep polling, non-null to stop
 * @param {Function} [onProgress] - (percent) => void
 * @param {AbortSignal} [signal]
 * @returns {Promise<*>} result from checkFn
 */
async function pollWithBackoff(checkFn, onProgress, signal) {
  const start = Date.now();
  let interval = POLL_INITIAL_MS;
  let attempt = 0;

  while (Date.now() - start < POLL_TOTAL_TIMEOUT_MS) {
    if (signal?.aborted) {
      throw new Error('Generation cancelled');
    }

    const result = await checkFn();
    if (result !== null) return result;

    // Report estimated progress (logarithmic, max 90%)
    if (onProgress) {
      const elapsed = Date.now() - start;
      const progress = Math.min(90, Math.round((elapsed / POLL_TOTAL_TIMEOUT_MS) * 90));
      onProgress(progress);
    }

    // Wait with exponential backoff capped at max interval
    const waitMs = Math.min(interval, POLL_MAX_INTERVAL_MS);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    interval = Math.min(interval * 2, POLL_MAX_INTERVAL_MS);
    attempt++;
  }

  throw new Error(`GPT-image-2: polling timed out after ${POLL_TOTAL_TIMEOUT_MS / 1000}s`);
}

/**
 * Parse image results from the task query response.
 * Completed tasks return `results` as an array of URL strings.
 */
function parseImageData(results) {
  return (results || []).map((url) => ({ url }));
}

/**
 * Parse a submit/edit response from EvoLink into a normalised result.
 *
 * EvoLink may return any of these shapes:
 *   - { id, status }               → async task, need polling
 *   - { task_id }                  → async task (alternative key)
 *   - { data: [{ url|b64_json }] } → inline (synchronous) result
 *   - { error: { message } }       → upstream error
 *   - { created, data: [...] }     → OpenAI-standard sync result
 *
 * @param {Object} data - raw JSON response
 * @param {string} label - for log messages
 * @returns {{ taskId?: string, images?: Array<{url:string}> }}
 */
function parseSubmitResponse(data, label = 'Submit') {
  // Log the full response structure for debugging
  console.log(`[GPTImageAdapter] ${label} response keys:`, Object.keys(data));
  console.log(`[GPTImageAdapter] ${label} response:`, JSON.stringify(data, null, 2));

  // 1. Upstream error (sometimes returned with HTTP 200)
  if (data.error) {
    const msg = data.error.message || data.error.code || JSON.stringify(data.error);
    throw new Error(`GPT-image-2 ${label.toLowerCase()}: ${msg}`);
  }

  // 2. Async task – EvoLink uses `id`, but also check `task_id` for compat
  const taskId = data.id || data.task_id;
  if (taskId) {
    console.log(`[GPTImageAdapter] ${label} task submitted, id: ${taskId}, status: ${data.status}`);
    if (data.status === 'completed' || data.status === 'succeeded') {
      // Already done – parse results (may be in `results` or `data`)
      const results = data.results || data.data;
      return { images: parseImageData(results) };
    }
    return { taskId };
  }

  // 3. Inline / synchronous result (OpenAI-standard `data` array)
  if (Array.isArray(data.data) && data.data.length > 0) {
    console.log(`[GPTImageAdapter] ${label} inline result, images: ${data.data.length}`);
    // data.data may contain objects with { url } or { b64_json }
    const images = data.data.map((item) => ({
      url: typeof item === 'string' ? item : (item.url || `data:image/png;base64,${item.b64_json}`),
    }));
    return { images };
  }

  // 4. If we got here, the response doesn't match any known format
  throw new Error(
    `GPT-image-2 ${label.toLowerCase()}: unexpected response format – ` +
    `keys=[${Object.keys(data).join(', ')}], ` +
    `body=${JSON.stringify(data).slice(0, 500)}`
  );
}

/**
 * Ensure a base64 string is wrapped as a data URL.
 * @param {string} base64
 * @returns {string} data URL
 */
function toDataUrl(base64) {
  if (!base64) return base64;
  return base64.startsWith('data:') ? base64 : `data:image/png;base64,${base64}`;
}

export class GPTImageAdapter {
  /**
   * Submit a text-to-image generation task.
   * @param {string} prompt
   * @param {Object} params - { size, quality, n, resolution, imageUrls, seed }
   * @param {AbortSignal} [signal]
   * @returns {Promise<{ taskId: string } | { images: Array }>}
   */
  async submitGeneration(prompt, params = {}, signal) {
    const body = {
      model: 'gpt-image-2',
      prompt: typeof prompt === 'string' ? prompt : JSON.stringify(prompt),
      size: params.size || 'auto',
      n: params.n || 1,
    };

    // quality is optional – omit 'auto' as the API may not recognise it
    if (params.quality && params.quality !== 'auto') {
      body.quality = params.quality;
    }

    // resolution: "1K" | "2K" | "4K" (used with size aspect ratio)
    if (params.resolution) {
      body.resolution = params.resolution;
    }

    // If reference images provided, add as image_urls (I2I path via same endpoint)
    if (params.imageUrls && params.imageUrls.length > 0) {
      body.image_urls = params.imageUrls.slice(0, MAX_IMAGE_URLS);
    }

    if (params.seed >= 0) {
      body.seed = params.seed;
    }

    console.log('[GPTImageAdapter] Submit generation request:');
    console.log('  Body:', JSON.stringify(body, null, 2));

    try {
      const data = await postWithRetry('/evolink/v1/images/generations', body, signal, 'Generation');
      return parseSubmitResponse(data, 'Generation');
    } catch (err) {
      console.error('[GPTImageAdapter] Generation submit failed:', err);
      throw err;
    }
  }

  /**
   * Poll for task completion using exponential backoff.
   * @param {string} taskId
   * @param {Function} [onProgress] - callback(percent)
   * @param {AbortSignal} [signal]
   * @returns {Promise<{ images: Array<{ url: string }> }>}
   */
  async pollResult(taskId, onProgress, signal) {
    console.log('[GPTImageAdapter] Polling task:', taskId);

    return await pollWithBackoff(async () => {
      // Task query endpoint: GET /v1/tasks/{task_id}
      const data = await apiGet(`/evolink/v1/tasks/${taskId}`, null, signal);
      console.log('[GPTImageAdapter] Poll response keys:', Object.keys(data));
      console.log('[GPTImageAdapter] Poll response:', JSON.stringify(data, null, 2));

      // Upstream error at poll level
      if (data.error && !data.status) {
        const msg = data.error.message || JSON.stringify(data.error);
        throw new Error(`GPT-image-2 poll error: ${msg}`);
      }

      // Report progress from server if available
      if (onProgress && typeof data.progress === 'number') {
        onProgress(Math.min(90, data.progress));
      }

      // Completed: check multiple status values and result locations
      if (data.status === 'completed' || data.status === 'succeeded') {
        console.log('[GPTImageAdapter] Task completed:', taskId);
        // Results may be in `results`, `data`, or `output`
        const rawResults = data.results || data.data || data.output;
        // Items may be plain URL strings or objects with { url, b64_json }
        const images = (rawResults || []).map((item) => ({
          url: typeof item === 'string' ? item : (item.url || `data:image/png;base64,${item.b64_json}`),
        }));
        return { images };
      }

      if (data.status === 'failed' || data.status === 'error') {
        const msg = data.error?.message || data.message || 'GPT-image-2 generation failed';
        console.error('[GPTImageAdapter] Task failed:', data.error || data.message);
        throw new Error(msg);
      }

      // Still pending/processing – return null to continue polling
      console.log('[GPTImageAdapter] Task status:', data.status, 'progress:', data.progress);
      return null;
    }, onProgress, signal);
  }

  /**
   * Combined: submit + poll for text-to-image.
   * @param {string} prompt
   * @param {Object} params
   * @param {AbortSignal} [signal]
   * @param {Function} [onProgress]
   * @param {Function} [onTaskSubmitted] - (taskId: string) => void, called when task_id is obtained
   * @returns {Promise<{ images: Array<{ url: string }> }>}
   */
  async generateText2Image(prompt, params = {}, signal, onProgress, onTaskSubmitted) {
    if (onProgress) onProgress(5);
    const submitResult = await this.submitGeneration(prompt, params, signal);

    // If images were returned directly (inline result)
    if (submitResult.images) {
      if (onProgress) onProgress(100);
      return submitResult;
    }

    // Async task: notify caller with task_id before polling
    if (submitResult.taskId) {
      console.log('[GPTImageAdapter] Task submitted, notifying caller. taskId:', submitResult.taskId);
      if (onTaskSubmitted) onTaskSubmitted(submitResult.taskId);
    }

    // Poll for completion
    const result = await this.pollResult(submitResult.taskId, onProgress, signal);
    if (onProgress) onProgress(100);
    return result;
  }

  /**
   * Image-to-image generation (reference images + prompt).
   * Uses the same unified endpoint with image_urls field.
   * @param {string} prompt
   * @param {string[]} imageUrls - array of image URLs (1-16)
   * @param {Object} params - { size, quality, n, resolution, seed }
   * @param {AbortSignal} [signal]
   * @param {Function} [onProgress]
   * @param {Function} [onTaskSubmitted] - (taskId: string) => void
   * @returns {Promise<{ images: Array<{ url: string }> }>}
   */
  async generateImage2Image(prompt, imageUrls, params = {}, signal, onProgress, onTaskSubmitted) {
    const body = {
      model: 'gpt-image-2',
      prompt: typeof prompt === 'string' ? prompt : JSON.stringify(prompt),
      size: params.size || 'auto',
      n: params.n || 1,
      image_urls: imageUrls.slice(0, MAX_IMAGE_URLS),
    };

    if (params.quality && params.quality !== 'auto') {
      body.quality = params.quality;
    }
    if (params.resolution) {
      body.resolution = params.resolution;
    }
    if (params.seed >= 0) {
      body.seed = params.seed;
    }

    console.log('[GPTImageAdapter] Submit I2I:');
    console.log('  Body:', JSON.stringify({ ...body, image_urls: `[${body.image_urls.length} images]` }, null, 2));
    if (onProgress) onProgress(5);

    try {
      const data = await postWithRetry('/evolink/v1/images/generations', body, signal, 'I2I');
      const submitResult = parseSubmitResponse(data, 'I2I');

      if (submitResult.images) {
        if (onProgress) onProgress(100);
        return submitResult;
      }

      // Async task: notify caller
      if (submitResult.taskId) {
        console.log('[GPTImageAdapter] I2I task submitted, notifying caller. taskId:', submitResult.taskId);
        if (onTaskSubmitted) onTaskSubmitted(submitResult.taskId);
      }

      const result = await this.pollResult(submitResult.taskId, onProgress, signal);
      if (onProgress) onProgress(100);
      return result;
    } catch (err) {
      console.error('[GPTImageAdapter] I2I submit failed:', err);
      throw err;
    }
  }

  /**
   * Submit an image edit (with mask for inpainting).
   * Uses the unified /v1/images/generations endpoint with image_urls + mask_url.
   * @param {string} prompt
   * @param {string} imageBase64 - base64 encoded source image
   * @param {string|null} maskBase64 - base64 encoded mask (optional)
   * @param {Object} params - { size, quality, n, resolution }
   * @param {AbortSignal} [signal]
   * @returns {Promise<{ taskId: string } | { images: Array }>}
   */
  async submitImageEdit(prompt, imageBase64, maskBase64, params = {}, signal) {
    // Convert base64 to data URLs (EvoLink may accept data URLs; if not, OSS upload needed)
    const imageUrl = toDataUrl(imageBase64);
    const maskUrl = maskBase64 ? toDataUrl(maskBase64) : null;

    const body = {
      model: 'gpt-image-2',
      prompt: typeof prompt === 'string' ? prompt : JSON.stringify(prompt),
      size: params.size || 'auto',
      n: params.n || 1,
      image_urls: [imageUrl],
    };

    if (params.quality && params.quality !== 'auto') {
      body.quality = params.quality;
    }
    if (params.resolution) {
      body.resolution = params.resolution;
    }

    if (maskUrl) {
      body.mask_url = maskUrl;
    }

    console.log('[GPTImageAdapter] Submit edit:', {
      prompt: typeof prompt === 'string' ? prompt.slice(0, 80) : '[complex]',
      hasMask: !!maskBase64,
      resolution: params.resolution,
    });

    // Unified endpoint: /v1/images/generations (NOT /v1/images/edits)
    const data = await postWithRetry('/evolink/v1/images/generations', body, signal, 'Edit');
    return parseSubmitResponse(data, 'Edit');
  }

  /**
   * Combined: submit + poll for image edit.
   * @param {string} prompt
   * @param {string} imageBase64
   * @param {string|null} maskBase64
   * @param {Object} params
   * @param {AbortSignal} [signal]
   * @param {Function} [onProgress]
   * @param {Function} [onTaskSubmitted] - (taskId: string) => void
   * @returns {Promise<{ images: Array<{ url: string }> }>}
   */
  async editImage(prompt, imageBase64, maskBase64, params = {}, signal, onProgress, onTaskSubmitted) {
    if (onProgress) onProgress(5);
    const submitResult = await this.submitImageEdit(prompt, imageBase64, maskBase64, params, signal);

    if (submitResult.images) {
      if (onProgress) onProgress(100);
      return submitResult;
    }

    // Async task: notify caller with task_id before polling
    if (submitResult.taskId) {
      console.log('[GPTImageAdapter] Edit task submitted, notifying caller. taskId:', submitResult.taskId);
      if (onTaskSubmitted) onTaskSubmitted(submitResult.taskId);
    }

    const result = await this.pollResult(submitResult.taskId, onProgress, signal);
    if (onProgress) onProgress(100);
    return result;
  }
}
