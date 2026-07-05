/**
 * Model configuration constants for AI Image Studio.
 *
 * Each model entry defines capabilities, supported sizes, and default
 * generation parameters.
 */

export const MODELS = {
  'qwen-image-3': {
    id: 'qwen-image-3',
    name: 'Qwen Image 3',
    provider: 'Alibaba',
    capabilities: {
      text2image: true,
      image2image: true,
      maxRefs: 3,
      inpainting: false,
      countRange: [1, 1],
      qualitySupport: false,
      promptExtend: true, // built-in model feature
      negativePrompt: true,
      seedControl: true,
    },
    sizes: [
      '1024*1024',
      '1280*720',
      '720*1280',
      '2048*2048',
      '1536*1024',
      '1024*1536',
    ],
    defaultParams: {
      size: '1024*1024',
      n: 1,
      prompt_extend: true,
      prompt_extend_mode: 'direct',
      seed: -1, // -1 = random
    },
  },

  'gpt-image-2': {
    id: 'gpt-image-2',
    name: 'GPT-image-2',
    provider: 'OpenAI (EvoLink)',
    capabilities: {
      text2image: true,
      image2image: true,
      maxRefs: 16,
      inpainting: true,
      countRange: [1, 10],
      qualitySupport: true,
      promptExtend: false,
      negativePrompt: false,
      seedControl: false,
    },
    sizes: [
      'auto', '1:1', '1:2', '2:1', '1:3', '3:1',
      '2:3', '3:2', '3:4', '4:3', '4:5', '5:4',
      '9:16', '16:9', '9:21', '21:9',
    ],
    qualities: ['low', 'medium', 'high'],
    defaultParams: {
      size: 'auto',
      quality: 'medium',
      n: 1,
    },
  },

  'nanobanana-2': {
    id: 'nanobanana-2',
    name: 'Nano Banana 2',
    provider: 'EvoLink',
    capabilities: {
      text2image: true,
      image2image: true,
      maxRefs: 14,
      inpainting: false,
      countRange: [1, 1],
      qualitySupport: true, // 0.5K, 1K, 2K (default), 4K
      promptExtend: false,
      negativePrompt: false,
      seedControl: false,
    },
    sizes: [
      'auto', '1:1', '2:3', '3:2', '3:4', '4:3',
      '4:5', '5:4', '9:16', '16:9', '21:9',
      '1:4', '4:1', '1:8', '8:1',
    ],
    qualities: ['0.5K', '1K', '2K', '4K'],
    defaultParams: {
      size: 'auto',
      quality: '2K',
      n: 1,
    },
  },
};

/** Ordered list of model ids for UI display. */
export const MODEL_ORDER = ['qwen-image-3', 'gpt-image-2', 'nanobanana-2'];

/** Get model config by id. */
export function getModelById(id) {
  return MODELS[id] || null;
}

/** Get list of models that support a given capability. */
export function getModelsByCapability(capability) {
  return MODEL_ORDER.filter((id) => MODELS[id].capabilities[capability]);
}
