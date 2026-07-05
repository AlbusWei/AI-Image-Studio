/**
 * gen command — AI Image Studio CLI core generation command
 *
 * Flow:
 *   1. Validate & parse options
 *   2. Optionally expand prompt via LLM
 *   3. Read reference images as base64 data URLs
 *   4. Create adapter, call T2I or I2I
 *   5. Download results, persist to DB (metadata + file + thumbnail)
 *   6. Optionally assign to folder
 *   7. Output JSON to stdout
 */

import { readFileSync, existsSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import {
  getModelAdapter,
  getLLMAdapter,
  apiClient,
} from '../../src/services/api/index.js';
import { MODELS } from '../../src/constants/models.js';

// ─── Exit codes ─────────────────────────────────────────────────────────────

const EXIT = {
  OK: 0,
  ERROR: 1,
  MODEL_API_ERROR: 3,
  FILE_ERROR: 4,
};

// ─── Size mapping ───────────────────────────────────────────────────────────

/**
 * Map CLI --size ratio to Qwen pixel format.
 * All dimensions are multiples of 16 (T2I requirement).
 */
const QWEN_SIZE_MAP = {
  '1:1':  '1024*1024',
  '16:9': '1920*1088',
  '9:16': '1088*1920',
  '3:4':  '832*1120',
  '4:3':  '1120*832',
  'auto': '1024*1024',
};

/**
 * Map CLI --size ratio to GPT/NanoBanana ratio string.
 * These adapters accept ratio strings or 'auto' directly.
 */
const RATIO_SIZE_MAP = {
  '1:1':  '1:1',
  '16:9': '16:9',
  '9:16': '9:16',
  '3:4':  '3:4',
  '4:3':  '4:3',
  'auto': 'auto',
};

// ─── MIME type mapping ──────────────────────────────────────────────────────

const MIME_MAP = {
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif':  'image/gif',
  '.bmp':  'image/bmp',
  '.tiff': 'image/tiff',
  '.tif':  'image/tiff',
};

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Convert a local file path to a base64 data URL.
 * @param {string} filePath
 * @returns {string} data URL
 */
function fileToDataUrl(filePath) {
  const absPath = resolve(filePath);
  if (!existsSync(absPath)) {
    throw new Error(`Reference image not found: ${absPath}`);
  }
  const buffer = readFileSync(absPath);
  const ext = extname(absPath).toLowerCase();
  const mime = MIME_MAP[ext] || 'image/png';
  const base64 = buffer.toString('base64');
  return `data:${mime};base64,${base64}`;
}

/**
 * Download an image from a URL and return the buffer with MIME type.
 * @param {string} url
 * @returns {Promise<{ buffer: Buffer, mime: string }>}
 */
async function downloadImage(url) {
  // Handle data URLs directly
  if (url.startsWith('data:')) {
    const mime = url.split(';')[0].split(':')[1] || 'image/png';
    const base64 = url.split(',')[1];
    return { buffer: Buffer.from(base64, 'base64'), mime };
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download image: HTTP ${response.status} from ${url.slice(0, 120)}`);
  }
  const mime = response.headers.get('content-type') || 'image/png';
  const arrayBuffer = await response.arrayBuffer();
  return { buffer: Buffer.from(arrayBuffer), mime };
}

/**
 * Build adapter-specific params from CLI options.
 * @param {string} modelId
 * @param {Object} opts - CLI options
 * @returns {Object} params for adapter
 */
function buildAdapterParams(modelId, opts) {
  const size = opts.size || '1:1';

  if (modelId === 'qwen-image-3') {
    return {
      size: QWEN_SIZE_MAP[size] || QWEN_SIZE_MAP['1:1'],
      n: parseInt(opts.count, 10) || 1,
      seed: opts.seed !== undefined ? parseInt(opts.seed, 10) : -1,
      negative_prompt: opts.negative || '',
      prompt_extend: opts.promptExtend !== false,
      watermark: false,
    };
  }

  // GPT-image-2 and NanoBanana-2 use ratio strings
  const params = {
    size: RATIO_SIZE_MAP[size] || size,
    n: parseInt(opts.count, 10) || 1,
  };

  if (opts.quality) {
    params.quality = opts.quality;
  }

  if (modelId === 'gpt-image-2' && opts.seed !== undefined && parseInt(opts.seed, 10) >= 0) {
    params.seed = parseInt(opts.seed, 10);
  }

  return params;
}

/**
 * Persist a generated image to the DB:
 *   1. POST /api/db/images/add — create metadata record
 *   2. PUT /api/db/images/file/:id — upload binary
 *   3. POST /api/db/images/generateThumbnail/:id — generate thumbnail
 *
 * @param {Object} imageMeta - { model, prompt, sourceUrl, width, height, batchId, ... }
 * @param {Buffer} imageBuffer - image binary
 * @param {string} mimeType - MIME type for the upload
 * @param {Function} logStderr - stderr logger
 * @returns {Promise<Object>} persisted image record
 */
async function persistImage(imageMeta, imageBuffer, mimeType, logStderr) {
  // 1. Create metadata record
  const addRes = await apiClient.post('/db/images/add', { image: imageMeta });
  const imageId = addRes.data.id;
  logStderr(`[gen] Image record created, id: ${imageId}`);

  // 2. Upload binary
  await apiClient.put(`/db/images/file/${imageId}`, imageBuffer, {
    headers: { 'Content-Type': mimeType },
    timeout: 60000,
  });
  logStderr(`[gen] Image file uploaded (${imageBuffer.length} bytes)`);

  // 3. Generate thumbnail
  await apiClient.post(`/db/images/generateThumbnail/${imageId}`);
  logStderr('[gen] Thumbnail generated');

  return { id: imageId, ...imageMeta };
}

/**
 * Resolve a folder by name: find existing or create new.
 * @param {string} folderName
 * @returns {Promise<number>} folderId
 */
async function resolveFolder(folderName) {
  // List existing folders
  const listRes = await apiClient.get('/db/folders/list');
  const folders = listRes.data || [];
  const existing = folders.find(f => f.name === folderName);
  if (existing) return existing.id;

  // Create new folder
  const createRes = await apiClient.post('/db/folders/add', { folder: { name: folderName } });
  return createRes.data.id;
}

/**
 * Parse width/height from a size string like "1024*1024" or a ratio like "16:9".
 * Returns estimated pixel dimensions for the output JSON.
 * @param {string} sizeStr
 * @returns {{ width: number, height: number }}
 */
function parseSizeToDimensions(sizeStr) {
  // Pixel format: "1024*1024"
  if (sizeStr && sizeStr.includes('*')) {
    const [w, h] = sizeStr.split('*').map(Number);
    if (!isNaN(w) && !isNaN(h)) return { width: w, height: h };
  }
  // Ratio format: estimate from common sizes
  const ratioDims = {
    '1:1': [1024, 1024], '16:9': [1920, 1088], '9:16': [1088, 1920],
    '3:4': [832, 1120], '4:3': [1120, 832], 'auto': [1024, 1024],
  };
  if (ratioDims[sizeStr]) return { width: ratioDims[sizeStr][0], height: ratioDims[sizeStr][1] };
  return { width: 1024, height: 1024 };
}

// ─── Main gen action ────────────────────────────────────────────────────────

/**
 * Execute the gen command.
 * @param {Object} opts - parsed commander options
 * @param {Object} ctx - { port, quiet } from preflight
 */
export async function genAction(opts, ctx) {
  const { quiet } = ctx;
  const log = (...args) => { if (!quiet) process.stderr.write(args.join(' ') + '\n'); };
  const outputResult = (data) => process.stdout.write(JSON.stringify(data, null, 2) + '\n');
  const outputError = (err, exitCode = EXIT.ERROR) => {
    process.stderr.write(JSON.stringify(err) + '\n');
    process.exitCode = exitCode;
  };

  // ── 1. Validate required options ──────────────────────────────────────────
  if (!opts.prompt) {
    return outputError({
      error: 'INVALID_PARAMS',
      message: '--prompt is required',
    }, EXIT.ERROR);
  }

  const modelId = opts.model || 'qwen-image-3';
  const modelConfig = MODELS[modelId];
  if (!modelConfig) {
    return outputError({
      error: 'INVALID_PARAMS',
      message: `Unknown model: ${modelId}. Valid: ${Object.keys(MODELS).join(', ')}`,
    }, EXIT.ERROR);
  }

  const size = opts.size || '1:1';
  const validSizes = ['1:1', '16:9', '9:16', '3:4', '4:3', 'auto'];
  if (!validSizes.includes(size)) {
    return outputError({
      error: 'INVALID_PARAMS',
      message: `Invalid --size: ${size}. Valid: ${validSizes.join(', ')}`,
    }, EXIT.ERROR);
  }

  // Validate count against model capabilities
  const count = parseInt(opts.count, 10) || 1;
  const [minCount, maxCount] = modelConfig.capabilities.countRange;
  if (count < minCount || count > maxCount) {
    return outputError({
      error: 'INVALID_PARAMS',
      message: `--count ${count} out of range [${minCount}-${maxCount}] for ${modelId}`,
    }, EXIT.ERROR);
  }

  // Validate model-specific options
  if (opts.negative && !modelConfig.capabilities.negativePrompt) {
    log(`[gen] Warning: --negative is not supported by ${modelId}, ignoring`);
  }
  if (opts.promptExtend === false && !modelConfig.capabilities.promptExtend) {
    // --no-prompt-extend only relevant for Qwen
  }
  if (opts.quality && !modelConfig.capabilities.qualitySupport) {
    log(`[gen] Warning: --quality is not supported by ${modelId}, ignoring`);
  }

  let originalPrompt = opts.prompt;
  let finalPrompt = originalPrompt;

  // ── 2. Expand prompt (optional) ──────────────────────────────────────────
  if (opts.expand) {
    log('[gen] Expanding prompt via LLM...');
    try {
      const llm = getLLMAdapter();
      // LLMAdapter constructor uses import.meta.env which may be undefined in Node;
      // fallback is 'qwen-max', but allow override from process.env
      if (process.env.VITE_EXPANSION_LLM_MODEL) {
        llm.model = process.env.VITE_EXPANSION_LLM_MODEL;
      }
      const variants = await llm.expandPrompt(originalPrompt, { model: modelId });
      if (variants && variants.length > 0) {
        finalPrompt = variants[0];
        log(`[gen] Expanded prompt: "${finalPrompt.slice(0, 100)}..."`);
      } else {
        log('[gen] LLM returned no variants, using original prompt');
      }
    } catch (err) {
      log(`[gen] Warning: prompt expansion failed: ${err.message}, using original prompt`);
    }
  }

  // ── 3. Read reference images ─────────────────────────────────────────────
  const imagePaths = opts.image || [];
  const imageUrls = [];
  if (imagePaths.length > 0) {
    if (!modelConfig.capabilities.image2image) {
      return outputError({
        error: 'INVALID_PARAMS',
        message: `Model ${modelId} does not support image-to-image generation`,
      }, EXIT.ERROR);
    }
    const maxRefs = modelConfig.capabilities.maxRefs;
    if (imagePaths.length > maxRefs) {
      return outputError({
        error: 'INVALID_PARAMS',
        message: `Too many reference images (${imagePaths.length}), max for ${modelId} is ${maxRefs}`,
      }, EXIT.ERROR);
    }
    for (const imgPath of imagePaths) {
      try {
        const dataUrl = fileToDataUrl(imgPath);
        imageUrls.push(dataUrl);
        log(`[gen] Loaded reference image: ${imgPath}`);
      } catch (err) {
        return outputError({
          error: 'FILE_ERROR',
          message: `Failed to read reference image: ${err.message}`,
        }, EXIT.FILE_ERROR);
      }
    }
  }

  // ── 4. Build adapter params & invoke generation ───────────────────────────
  const adapterParams = buildAdapterParams(modelId, { ...opts, count: String(count) });
  const adapter = getModelAdapter(modelId);
  const isI2I = imageUrls.length > 0;

  log(`[gen] Model: ${modelId}, mode: ${isI2I ? 'I2I' : 'T2I'}, size: ${size}, count: ${count}`);
  log(`[gen] Prompt: "${finalPrompt.slice(0, 120)}"`);

  const startTime = Date.now();
  let genResult;

  try {
    if (isI2I) {
      log(`[gen] Reference images: ${imageUrls.length}`);
      genResult = await adapter.generateImage2Image(
        finalPrompt, imageUrls, adapterParams,
        undefined, // signal
        (pct) => log(`[gen] Generation progress: ${pct}%`),
        (taskId) => log(`[gen] Task submitted: ${taskId}`),
      );
    } else {
      genResult = await adapter.generateText2Image(
        finalPrompt, adapterParams,
        undefined, // signal
        (pct) => log(`[gen] Generation progress: ${pct}%`),
        (taskId) => log(`[gen] Task submitted: ${taskId}`),
      );
    }
  } catch (err) {
    // Distinguish model API errors from general/network errors
    const isModelApiError = (err.status && err.status >= 400 && err.status < 500) ||
      /content|violation|sensitive|quota|rate.?limit|banned|blocked/i.test(err.message || '');
    const exitCode = isModelApiError ? EXIT.MODEL_API_ERROR : EXIT.ERROR;
    return outputError({
      error: 'GENERATION_FAILED',
      message: err.message,
      model: modelId,
      prompt: finalPrompt,
    }, exitCode);
  }

  const genDuration = Date.now() - startTime;

  if (!genResult?.images?.length) {
    return outputError({
      error: 'GENERATION_FAILED',
      message: 'Adapter returned no images',
      model: modelId,
      prompt: finalPrompt,
    }, EXIT.ERROR);
  }

  log(`[gen] Generation completed in ${genDuration}ms, ${genResult.images.length} image(s)`);

  // ── 5. Create batch record ───────────────────────────────────────────────
  let batchId = null;
  try {
    const batchRes = await apiClient.post('/db/batches/add', {
      batch: {
        model: modelId,
        prompt: finalPrompt,
        sessionId: null,
      },
    });
    batchId = batchRes.data.id;
    log(`[gen] Batch created, id: ${batchId}`);
  } catch (err) {
    log(`[gen] Warning: failed to create batch record: ${err.message}`);
  }

  // ── 6. Download & persist each image ─────────────────────────────────────
  const { width, height } = parseSizeToDimensions(adapterParams.size);
  const persistedImages = [];

  for (let i = 0; i < genResult.images.length; i++) {
    const img = genResult.images[i];
    log(`[gen] Processing image ${i + 1}/${genResult.images.length}...`);

    try {
      // Download
      const { buffer: imageBuffer, mime } = await downloadImage(img.url);
      log(`[gen] Downloaded ${imageBuffer.length} bytes (${mime})`);

      // Build metadata
      const meta = {
        model: modelId,
        prompt: finalPrompt,
        sourceUrl: img.url,
        width,
        height,
        batchId,
        status: 'completed',
        storageZone: 'hot',
        blobSize: imageBuffer.length,
        originalPrompt: originalPrompt !== finalPrompt ? originalPrompt : undefined,
        duration: genDuration,
        seed: adapterParams.seed,
        aspectRatio: size,
        params: adapterParams,
      };

      // Persist to DB
      const record = await persistImage(meta, imageBuffer, mime, log);
      persistedImages.push({
        id: record.id,
        model: modelId,
        prompt: finalPrompt,
        originalPrompt: originalPrompt !== finalPrompt ? originalPrompt : undefined,
        filePath: null, // filled by Electron file-manager
        sourceUrl: img.url,
        width,
        height,
        batchId,
        duration: genDuration,
      });
    } catch (err) {
      log(`[gen] Warning: failed to persist image ${i + 1}: ${err.message}`);
      // Still include in output with error note
      persistedImages.push({
        id: null,
        model: modelId,
        prompt: finalPrompt,
        sourceUrl: img.url,
        width,
        height,
        batchId,
        duration: genDuration,
        error: err.message,
      });
    }
  }

  // ── 7. Folder assignment (optional) ──────────────────────────────────────
  if (opts.folder && persistedImages.length > 0) {
    try {
      const folderId = await resolveFolder(opts.folder);
      const imageIds = persistedImages.map(img => img.id).filter(Boolean);
      if (imageIds.length > 0) {
        await apiClient.post('/db/images/move', { ids: imageIds, folderId });
        log(`[gen] Moved ${imageIds.length} image(s) to folder "${opts.folder}"`);
      }
    } catch (err) {
      log(`[gen] Warning: failed to assign folder: ${err.message}`);
    }
  }

  // ── 8. Output result ─────────────────────────────────────────────────────
  if (persistedImages.length === 1) {
    outputResult(persistedImages[0]);
  } else {
    outputResult(persistedImages);
  }
}
