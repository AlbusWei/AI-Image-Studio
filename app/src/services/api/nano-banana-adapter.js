/**
 * NanoBananaAdapter – Nano Banana 2 via EvoLink async API
 *
 * Model: gemini-3.1-flash-image-preview
 * Endpoint: POST /v1/images/generations
 * Polling:  GET /v1/tasks/{task_id}
 *
 * Polling strategy:
 *   - Initial interval: 2 s, exponential growth to max 10 s
 *   - Maximum total wait: 5 minutes
 *   - Supports cancellation via AbortSignal
 */

import { apiPost, apiGet } from './client';

const POLL_INITIAL_MS = 2000;
const POLL_MAX_INTERVAL_MS = 10000;
const POLL_TOTAL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const SUBMIT_MAX_RETRIES = 3;
const SUBMIT_BACKOFF_MS = 2000; // 2s, 4s, 8s

/**
 * Map UI quality levels to Nano Banana 2 API quality values.
 * UI uses: low, medium, high
 * API accepts: 0.5K, 1K, 2K, 4K (default 2K)
 */
const QUALITY_MAP = {
  low: '1K',
  medium: '2K',
  high: '4K',
};

function mapQuality(q) {
  if (!q) return undefined;
  return QUALITY_MAP[q] || q; // pass through valid values like '0.5K', '2K'
}

/**
 * POST with retry: handles network errors + proxy 5xx/502.
 * Retries up to SUBMIT_MAX_RETRIES times with exponential backoff.
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
        console.warn(`[NanoBananaAdapter] ${label} failed (status=${status}, attempt=${attempt + 1}/${SUBMIT_MAX_RETRIES + 1}), retrying in ${waitMs}ms...`, err.message);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      throw err;
    }
  }
}

/**
 * Poll with exponential backoff until a condition is met or timeout.
 */
async function pollWithBackoff(checkFn, onProgress, signal) {
  const start = Date.now();
  let interval = POLL_INITIAL_MS;

  while (Date.now() - start < POLL_TOTAL_TIMEOUT_MS) {
    if (signal?.aborted) {
      throw new Error('Generation cancelled');
    }

    const result = await checkFn();
    if (result !== null) return result;

    if (onProgress) {
      const elapsed = Date.now() - start;
      const progress = Math.min(90, Math.round((elapsed / POLL_TOTAL_TIMEOUT_MS) * 90));
      onProgress(progress);
    }

    const waitMs = Math.min(interval, POLL_MAX_INTERVAL_MS);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    interval = Math.min(interval * 2, POLL_MAX_INTERVAL_MS);
  }

  throw new Error(`Nano Banana 2: polling timed out after ${POLL_TOTAL_TIMEOUT_MS / 1000}s`);
}

/**
 * Parse a submit response from EvoLink into a normalised result.
 * Handles: { id }, { task_id }, { data: [...] }, { error: {} }
 */
function parseSubmitResponse(data, label = 'Submit') {
  console.log(`[NanoBananaAdapter] ${label} response keys:`, Object.keys(data));
  console.log(`[NanoBananaAdapter] ${label} response:`, JSON.stringify(data, null, 2));

  // 1. Upstream error
  if (data.error) {
    const msg = data.error.message || data.error.code || JSON.stringify(data.error);
    throw new Error(`Nano Banana 2 ${label.toLowerCase()}: ${msg}`);
  }

  // 2. Async task
  const taskId = data.id || data.task_id;
  if (taskId) {
    console.log(`[NanoBananaAdapter] ${label} task submitted, id: ${taskId}, status: ${data.status}`);
    if (data.status === 'completed' || data.status === 'succeeded') {
      const results = data.results || data.data;
      return { images: parseResults(results) };
    }
    return { taskId };
  }

  // 3. Inline result
  if (Array.isArray(data.data) && data.data.length > 0) {
    console.log(`[NanoBananaAdapter] ${label} inline result, images: ${data.data.length}`);
    return { images: parseResults(data.data) };
  }

  throw new Error(
    `Nano Banana 2 ${label.toLowerCase()}: unexpected response format – ` +
    `keys=[${Object.keys(data).join(', ')}], ` +
    `body=${JSON.stringify(data).slice(0, 500)}`
  );
}

/**
 * Parse result items – supports plain URL strings and objects with { url, b64_json }.
 */
function parseResults(items) {
  return (items || []).map((item) => ({
    url: typeof item === 'string' ? item : (item.url || `data:image/png;base64,${item.b64_json}`),
  }));
}

export class NanoBananaAdapter {
  /**
   * Submit a text-to-image generation task.
   */
  async submitGeneration(prompt, params = {}, signal) {
    const body = {
      model: 'gemini-3.1-flash-image-preview',
      prompt,
    };

    if (params.size && params.size !== 'auto') {
      body.size = params.size;
    }
    const t2iQuality = mapQuality(params.quality);
    if (t2iQuality) {
      body.quality = t2iQuality;
    }

    console.log('[NanoBananaAdapter] Submit T2I:', JSON.stringify(body, null, 2));

    try {
      const data = await postWithRetry('/evolink/v1/images/generations', body, signal, 'T2I');
      return parseSubmitResponse(data, 'T2I');
    } catch (err) {
      console.error('[NanoBananaAdapter] T2I submit failed:', err);
      throw err;
    }
  }

  /**
   * Poll for task completion using exponential backoff.
   */
  async pollResult(taskId, onProgress, signal) {
    console.log('[NanoBananaAdapter] Polling task:', taskId);

    return await pollWithBackoff(async () => {
      const data = await apiGet(`/evolink/v1/tasks/${taskId}`, null, signal);
      console.log('[NanoBananaAdapter] Poll response keys:', Object.keys(data));
      console.log('[NanoBananaAdapter] Poll response:', JSON.stringify(data, null, 2));

      // Upstream error at poll level
      if (data.error && !data.status) {
        const msg = data.error.message || JSON.stringify(data.error);
        throw new Error(`Nano Banana 2 poll error: ${msg}`);
      }

      if (onProgress && typeof data.progress === 'number') {
        onProgress(Math.min(90, data.progress));
      }

      // Completed
      if (data.status === 'completed' || data.status === 'succeeded') {
        console.log('[NanoBananaAdapter] Task completed:', taskId);
        const rawResults = data.results || data.data || data.output;
        return { images: parseResults(rawResults) };
      }

      // Failed
      if (data.status === 'failed' || data.status === 'error') {
        const msg = data.error?.message || data.message || 'Nano Banana 2 generation failed';
        console.error('[NanoBananaAdapter] Task failed:', data.error || data.message);
        throw new Error(msg);
      }

      // Still pending/processing
      console.log('[NanoBananaAdapter] Task status:', data.status, 'progress:', data.progress);
      return null;
    }, onProgress, signal);
  }

  /**
   * Combined: submit + poll for text-to-image.
   * @param {Function} [onTaskSubmitted] - (taskId: string) => void
   */
  async generateText2Image(prompt, params = {}, signal, onProgress, onTaskSubmitted) {
    if (onProgress) onProgress(5);
    const submitResult = await this.submitGeneration(prompt, params, signal);

    if (submitResult.images) {
      if (onProgress) onProgress(100);
      return submitResult;
    }

    // Async task: notify caller with task_id before polling
    if (submitResult.taskId) {
      console.log('[NanoBananaAdapter] Task submitted, notifying caller. taskId:', submitResult.taskId);
      if (onTaskSubmitted) onTaskSubmitted(submitResult.taskId);
    }

    const result = await this.pollResult(submitResult.taskId, onProgress, signal);
    if (onProgress) onProgress(100);
    return result;
  }

  /**
   * Image-to-image generation (submit reference image with prompt).
   * @param {Function} [onTaskSubmitted] - (taskId: string) => void
   */
  async generateImage2Image(prompt, imageUrls, params = {}, signal, onProgress, onTaskSubmitted) {
    const body = {
      model: 'gemini-3.1-flash-image-preview',
      prompt,
      image_urls: imageUrls,
    };

    if (params.size && params.size !== 'auto') {
      body.size = params.size;
    }
    const i2iQuality = mapQuality(params.quality);
    if (i2iQuality) {
      body.quality = i2iQuality;
    }

    console.log('[NanoBananaAdapter] Submit I2I:', JSON.stringify(body, null, 2));
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
        console.log('[NanoBananaAdapter] I2I task submitted, notifying caller. taskId:', submitResult.taskId);
        if (onTaskSubmitted) onTaskSubmitted(submitResult.taskId);
      }

      const result = await this.pollResult(submitResult.taskId, onProgress, signal);
      if (onProgress) onProgress(100);
      return result;
    } catch (err) {
      console.error('[NanoBananaAdapter] I2I submit failed:', err);
      throw err;
    }
  }
}
