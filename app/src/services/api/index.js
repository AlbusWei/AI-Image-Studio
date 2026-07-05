/**
 * API layer – unified exports
 */

import { QwenAdapter } from './qwen-adapter.js';
import { GPTImageAdapter } from './gpt-image-adapter.js';
import { NanoBananaAdapter } from './nano-banana-adapter.js';
import { LLMAdapter } from './llm-adapter.js';
import apiClient from './client.js';

export { apiClient };
export { apiGet, apiPost, apiPut, apiDelete, createCancellable, proxyImageUrl } from './client.js';
export { QwenAdapter, GPTImageAdapter, NanoBananaAdapter, LLMAdapter };

/**
 * Factory: get the appropriate adapter instance for a model id.
 * @param {string} modelId - 'qwen-image-3' | 'gpt-image-2' | 'nanobanana-2'
 * @returns {QwenAdapter | GPTImageAdapter | NanoBananaAdapter}
 */
export function getModelAdapter(modelId) {
  switch (modelId) {
    case 'qwen-image-3':
      return new QwenAdapter();
    case 'gpt-image-2':
      return new GPTImageAdapter();
    case 'nanobanana-2':
      return new NanoBananaAdapter();
    default:
      throw new Error(`Unknown model adapter: ${modelId}`);
  }
}

/** Singleton LLM adapter for prompt expansion and chat. */
let _llmAdapter = null;
export function getLLMAdapter() {
  if (!_llmAdapter) _llmAdapter = new LLMAdapter();
  return _llmAdapter;
}
