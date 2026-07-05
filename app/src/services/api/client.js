/**
 * Unified HTTP client (axios) for AI Image Studio.
 *
 * - baseURL = /api/ (routes through Vite proxy)
 * - Request/response interceptors for error normalisation
 * - Automatic retry with exponential backoff (up to 3 attempts)
 * - AbortController support for request cancellation
 */

import axios from 'axios';

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;

/**
 * Create the main axios instance.
 */
const apiClient = axios.create({
  baseURL: '/api',
  timeout: 60000, // 60s default timeout
  headers: {
    'Content-Type': 'application/json',
  },
});

/** Extended-timeout client for synchronous image generation APIs (Qwen etc.). */
export const longRunningClient = axios.create({
  baseURL: '/api',
  timeout: 300000, // 5 minutes for sync image APIs
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Apply shared interceptors to any axios instance.
 */
function applyInterceptors(instance, retryTarget) {
  instance.interceptors.request.use(
    (config) => {
      if (!config.signal) {
        config.signal = config._signal || undefined;
      }
      return config;
    },
    (error) => Promise.reject(error)
  );

  instance.interceptors.response.use(
    (response) => response,
    async (error) => {
      const config = error.config;
      if (axios.isCancel(error) || error.code === 'ERR_CANCELED') {
        return Promise.reject(error);
      }
      // Skip axios-level retry if caller handles retries externally (e.g. postWithRetry)
      if (config._noRetry) {
        const normalised = {
          message: error.response?.data?.message || error.message || 'Unknown API error',
          status: error.response?.status || 0,
          data: error.response?.data || null,
          originalError: error,
        };
        return Promise.reject(normalised);
      }
      config._retryCount = config._retryCount || 0;
      const status = error.response?.status;
      const isRetryable =
        (!status || status >= 500) && config._retryCount < MAX_RETRIES;
      if (isRetryable) {
        config._retryCount += 1;
        const backoff = INITIAL_BACKOFF_MS * Math.pow(2, config._retryCount - 1);
        await new Promise((resolve) => setTimeout(resolve, backoff));
        return retryTarget(config);
      }
      const normalised = {
        message: error.response?.data?.message || error.message || 'Unknown API error',
        status: status || 0,
        data: error.response?.data || null,
        originalError: error,
      };
      return Promise.reject(normalised);
    }
  );
}

applyInterceptors(apiClient, apiClient);
applyInterceptors(longRunningClient, longRunningClient);

// ────────────────────────────────────────────────────────────────────────────
// Convenience helpers
// ────────────────────────────────────────────────────────────────────────────

/**
 * GET request with optional AbortController signal.
 * @param {string} url
 * @param {Object} [params] - query params
 * @param {AbortSignal} [signal]
 */
export async function apiGet(url, params, signal) {
  const res = await apiClient.get(url, { params, signal });
  return res.data;
}

/**
 * POST request.
 * @param {string} url
 * @param {*} data - request body
 * @param {AbortSignal} [signal]
 * @param {Object} [opts] - { timeout }
 */
export async function apiPost(url, data, signal, opts = {}) {
  const client = opts.timeout && opts.timeout > 60000 ? longRunningClient : apiClient;
  const res = await client.post(url, data, { signal, timeout: opts.timeout, _noRetry: opts._noRetry });
  return res.data;
}

/**
 * PUT request.
 */
export async function apiPut(url, data, signal) {
  const res = await apiClient.put(url, data, { signal });
  return res.data;
}

/**
 * DELETE request.
 */
export async function apiDelete(url, signal) {
  const res = await apiClient.delete(url, { signal });
  return res.data;
}

/**
 * Create an AbortController and return its signal + abort function.
 */
export function createCancellable() {
  const controller = new AbortController();
  return {
    signal: controller.signal,
    cancel: (reason) => controller.abort(reason),
  };
}

/**
 * Rewrite an external image URL to go through the CORS proxy.
 * - data: URLs, blob: URLs, and already-proxied URLs are returned as-is.
 * - http(s) URLs are wrapped with /api/proxy-image?url=encodeURIComponent(...)
 *
 * @param {string} url - original image URL
 * @returns {string} proxy-safe URL
 */
export function proxyImageUrl(url) {
  if (!url) return url;
  if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('/api/proxy-image')) return url;
  return `/api/proxy-image?url=${encodeURIComponent(url)}`;
}

export default apiClient;
