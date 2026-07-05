/**
 * QwenAdapter – Qwen Image 3 (DashScope) API adapter
 *
 * Qwen's API is synchronous: POST returns the result directly (no polling).
 * Image generation can take 30s–120s+ so we use a long timeout (5 min).
 *
 * Model names:
 *   T2I: pre-qwen-image-3.0-preprocess-0703-t2iv1
 *   I2I: pre-qwen-image-3.0-preprocess-0703-i2iv1
 *
 * T2I size must be multiples of 16, I2I size multiples of 32.
 * Response image URL is valid for 24 hours – callers should download & cache.
 */

import { apiPost } from './client';

const T2I_MODEL = 'pre-qwen-image-3.0-preprocess-0703-t2iv1';
const I2I_MODEL = 'pre-qwen-image-3.0-preprocess-0703-i2iv1';

/** 5-minute timeout for synchronous Qwen generation calls. */
const QWEN_TIMEOUT_MS = 300_000;

/**
 * Ensure the size string uses valid dimensions (multiples of base).
 * @param {string} size - e.g. "1024*1024"
 * @param {number} base - 16 for T2I, 32 for I2I
 */
function normaliseSize(size, base) {
  if (!size) return '1024*1024';
  const parts = size.split('*').map(Number);
  if (parts.length !== 2 || parts.some(isNaN)) return '1024*1024';
  const w = Math.round(parts[0] / base) * base;
  const h = Math.round(parts[1] / base) * base;
  return `${w}*${h}`;
}

/**
 * Extract a useful error message from a DashScope error response.
 * DashScope errors look like: { code: '...', message: '...', request_id: '...' }
 */
function extractDashScopeError(data) {
  if (!data) return null;
  // The normalised error from the client interceptor
  const inner = data.data || data;
  if (inner.code || inner.message) {
    return `[QwenAPI ${inner.code || 'ERROR'}] ${inner.message || 'Unknown error'} (request_id: ${inner.request_id || 'n/a'})`;
  }
  return null;
}

export class QwenAdapter {
  /**
   * Text-to-image generation.
   * @param {string} prompt
   * @param {Object} params - { size, n, seed, negative_prompt, prompt_extend, prompt_extend_mode, watermark }
   * @param {AbortSignal} [signal]
   * @param {Function} [onProgress] - optional progress callback (percent)
   * @returns {Promise<{ images: Array<{ url: string }> }>}
   */
  async generateText2Image(prompt, params = {}, signal, onProgress) {
    const size = normaliseSize(params.size, 16);

    // Build parameters – only include seed when it's a non-negative integer
    const parameters = {
      prompt_extend: params.prompt_extend ?? true,
      prompt_extend_mode: params.prompt_extend_mode ?? 'direct',
      n: params.n ?? 1,
      size,
      negative_prompt: params.negative_prompt ?? '',
      watermark: params.watermark ?? false,
    };
    // If seed is negative (meaning random), omit it so the API uses its own random
    if (params.seed !== undefined && params.seed >= 0) {
      parameters.seed = params.seed;
    }

    const body = {
      model: T2I_MODEL,
      input: {
        messages: [
          {
            role: 'user',
            content: [{ text: prompt }],
          },
        ],
      },
      parameters,
    };

    console.log('[QwenAdapter] T2I request:', { prompt: prompt.slice(0, 80), size, n: parameters.n, seed: parameters.seed ?? 'random' });
    if (onProgress) onProgress(10);

    try {
      const data = await apiPost('/qwen/', body, signal, { timeout: QWEN_TIMEOUT_MS });
      if (onProgress) onProgress(90);
      const result = this._parseResponse(data);
      if (onProgress) onProgress(100);
      console.log('[QwenAdapter] T2I success:', result.images.length, 'image(s)');
      return result;
    } catch (err) {
      const detail = extractDashScopeError(err) || err.message;
      console.error('[QwenAdapter] T2I error:', detail);
      throw new Error(`Qwen T2I failed: ${detail}`);
    }
  }

  /**
   * Image-to-image generation.
   * @param {string} prompt
   * @param {string[]} imageUrls - 1-3 reference image URLs
   * @param {Object} params
   * @param {AbortSignal} [signal]
   * @param {Function} [onProgress]
   * @returns {Promise<{ images: Array<{ url: string }> }>}
   */
  async generateImage2Image(prompt, imageUrls, params = {}, signal, onProgress) {
    if (!imageUrls || imageUrls.length === 0) {
      throw new Error('QwenAdapter.generateImage2Image requires at least 1 reference image');
    }

    const size = normaliseSize(params.size, 32);
    // Limit to max 3 images
    const refs = imageUrls.slice(0, 3);

    // Build parameters – only include seed when it's a non-negative integer
    const parameters = {
      prompt_extend: params.prompt_extend ?? true,
      prompt_extend_mode: params.prompt_extend_mode ?? 'direct',
      n: params.n ?? 1,
      size,
      negative_prompt: params.negative_prompt ?? '',
      watermark: params.watermark ?? false,
    };
    // If seed is negative (meaning random), omit it so the API uses its own random
    if (params.seed !== undefined && params.seed >= 0) {
      parameters.seed = params.seed;
    }

    // Build content array: images first, then text
    const content = [
      ...refs.map((url) => ({ image: url })),
      { text: prompt },
    ];

    const body = {
      model: I2I_MODEL,
      input: {
        messages: [
          {
            role: 'user',
            content,
          },
        ],
      },
      parameters,
    };

    console.log('[QwenAdapter] I2I request:', { prompt: prompt.slice(0, 80), size, refs: refs.length, seed: parameters.seed ?? 'random' });
    if (onProgress) onProgress(10);

    try {
      const data = await apiPost('/qwen/', body, signal, { timeout: QWEN_TIMEOUT_MS });
      if (onProgress) onProgress(90);
      const result = this._parseResponse(data);
      if (onProgress) onProgress(100);
      console.log('[QwenAdapter] I2I success:', result.images.length, 'image(s)');
      return result;
    } catch (err) {
      const detail = extractDashScopeError(err) || err.message;
      console.error('[QwenAdapter] I2I error:', detail);
      throw new Error(`Qwen I2I failed: ${detail}`);
    }
  }

  /**
   * Parse the DashScope response into a normalised format.
   * Response shape: { output: { choices: [{ message: { content: [{ image: "url" }] } }] } }
   */
  _parseResponse(data) {
    try {
      const choices = data?.output?.choices;
      if (!choices || choices.length === 0) {
        throw new Error('Qwen API returned no choices');
      }

      const images = [];
      for (const choice of choices) {
        const contentArr = choice?.message?.content;
        if (Array.isArray(contentArr)) {
          for (const item of contentArr) {
            if (item.image) {
              images.push({ url: item.image });
            }
          }
        }
      }

      if (images.length === 0) {
        throw new Error('Qwen API returned no images in response');
      }

      return { images };
    } catch (err) {
      console.error('[QwenAdapter] Response parse error:', err, data);
      throw new Error(`Qwen API response parse error: ${err.message}`);
    }
  }
}
