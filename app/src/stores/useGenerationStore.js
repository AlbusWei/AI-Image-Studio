/**
 * useGenerationStore – workbench generation state
 *
 * Manages: current model, prompt, expanded prompts, reference images,
 * generation parameters, results, batch history, and generating flag.
 *
 * Generation flow:
 *   1. User triggers generate()
 *   2. A task is submitted to TaskEngine with an execute function
 *   3. TaskEngine runs the adapter, reports progress via events
 *   4. On completion, results are stored in IndexedDB and state
 */

import { create } from 'zustand';
import { produce } from 'immer';
import { v4 as uuidv4 } from 'uuid';
import { MODELS } from '../constants/models';
import { getModelAdapter, getLLMAdapter } from '../services/api';
import TaskEngine from '../services/task-engine';
import { addBatch, addImage, updateImage } from '../db/database';
import { StorageService } from '../services/storage';

/**
 * Convert a blob:// URL to a data: URL (base64) so it can be sent to external APIs.
 * Non-blob URLs (http/https/data) are returned as-is.
 * @param {string} url
 * @returns {Promise<string>}
 */
async function blobUrlToDataUrl(url) {
  if (!url || !url.startsWith('blob:')) return url;
  try {
    const resp = await fetch(url);
    const blob = await resp.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.warn('[GenerationStore] Failed to convert blob URL to data URL:', err);
    return url; // fallback to original
  }
}

export const useGenerationStore = create((set, get) => ({
  // ── State ──────────────────────────────────────────────────────────────
  currentModel: 'qwen-image-3',
  prompt: '',
  expandedPrompts: [],
  referenceImages: [], // { id, url, name, blob, role }
  params: { ...MODELS['qwen-image-3'].defaultParams },
  results: [], // current batch results: { id, url, prompt, params, ... }
  batchHistory: [], // { batchId, prompt, model, images[], createdAt }
  isGenerating: false,
  generatingProgress: 0, // 0-100
  currentBatchId: null,
  generationError: null,

  // ── Actions ────────────────────────────────────────────────────────────

  /** Switch the active model and reset params to defaults. */
  setModel(modelId) {
    const model = MODELS[modelId];
    if (!model) return;
    set(
      produce((state) => {
        state.currentModel = modelId;
        state.params = { ...model.defaultParams };
        state.expandedPrompts = [];
        state.referenceImages = [];
        state.results = [];
        state.generationError = null;
      })
    );
  },

  /** Update the prompt text. */
  setPrompt(text) {
    set({ prompt: text });
  },

  /** Add a reference image for img2img workflows. */
  addReferenceImage(image) {
    const model = MODELS[get().currentModel];
    const maxRefs = model?.capabilities?.maxRefs ?? 1;
    set(
      produce((state) => {
        if (state.referenceImages.length < maxRefs) {
          state.referenceImages.push({
            id: uuidv4(),
            url: image.url || URL.createObjectURL(image.blob),
            name: image.name || 'reference',
            blob: image.blob || null,
            role: image.role || 'general',
          });
        }
      })
    );
  },

  /** Remove a reference image by id. */
  removeReferenceImage(imageId) {
    set(
      produce((state) => {
        state.referenceImages = state.referenceImages.filter(
          (img) => img.id !== imageId
        );
      })
    );
  },

  /** Update the role of a reference image. */
  setReferenceImageRole(imageId, role) {
    set(
      produce((state) => {
        const ref = state.referenceImages.find((img) => img.id === imageId);
        if (ref) ref.role = role;
      })
    );
  },

  /** Update a single generation parameter. */
  setParam(key, value) {
    set(
      produce((state) => {
        state.params[key] = value;
      })
    );
  },

  /**
   * Trigger image generation via TaskEngine.
   * Creates a batch, submits a task, adapter runs in the background.
   */
  async generate() {
    const { currentModel, prompt, referenceImages, params } = get();
    if (!prompt.trim() && referenceImages.length === 0) return;

    set({ isGenerating: true, generatingProgress: 0, results: [], generationError: null });

    try {
      const adapter = getModelAdapter(currentModel);
      const batchId = await addBatch({
        sessionId: null,
        model: currentModel,
        prompt,
        createdAt: Date.now(),
      });

      set({ currentBatchId: batchId });

      // Build the task execution function
      const execute = async (ctx) => {
        const { signal, onProgress } = ctx;

        let result;
        const isI2I = referenceImages.length > 0 && typeof adapter.generateImage2Image === 'function';

        // Track pending image DB id so we can update instead of re-inserting
        let pendingImageId = null;

        // Callback: called when async adapter obtains a task_id
        // Persists the task state to IndexedDB immediately so it survives page refresh
        const onTaskSubmitted = async (taskId) => {
          console.log('[GenerationStore] Task submitted, saving pending record to DB. taskId:', taskId);
          try {
            pendingImageId = await addImage({
              batchId,
              folderId: null,
              model: currentModel,
              prompt,
              url: null,
              thumbnailUrl: null,
              params: { ...params },
              favorite: false,
              storageZone: 'hot',
              status: 'pending',
              taskId,
              createdAt: Date.now(),
            });
          } catch (dbErr) {
            console.warn('[GenerationStore] Failed to save pending task to DB:', dbErr);
          }
        };

        if (isI2I) {
          // Convert blob URLs to data URLs for external API compatibility (EvoLink requires real URLs)
          const imageUrls = await Promise.all(
            referenceImages.map((r) => blobUrlToDataUrl(r.url))
          );
          try {
            result = await adapter.generateImage2Image(prompt, imageUrls, params, signal, onProgress, onTaskSubmitted);
          } catch (adapterErr) {
            // Mark pending record as failed if task was submitted but polling failed
            if (pendingImageId) {
              try {
                await updateImage(pendingImageId, { status: 'failed', error: adapterErr.message });
              } catch (_) { /* best effort */ }
            }
            throw adapterErr;
          }
        } else {
          try {
            result = await adapter.generateText2Image(prompt, params, signal, onProgress, onTaskSubmitted);
          } catch (adapterErr) {
            if (pendingImageId) {
              try {
                await updateImage(pendingImageId, { status: 'failed', error: adapterErr.message });
              } catch (_) { /* best effort */ }
            }
            throw adapterErr;
          }
        }

        // result = { images: [{ url }, ...] }
        const images = result.images || [];

        // Persist each image: download blob + thumbnail + store in IndexedDB
        const resultImages = [];
        for (let i = 0; i < images.length; i++) {
          const img = images[i];
          const imgPrompt = typeof prompt === 'string' ? prompt : JSON.stringify(prompt);

          try {
            // StorageService.saveImage downloads the blob, generates a thumbnail,
            // and stores both the Blob objects and blob URLs in IndexedDB.
            // If this is the first image and we have a pending record, update it.
            const existingId = (i === 0 && pendingImageId) ? pendingImageId : undefined;
            const { localId } = await StorageService.saveImage(img.url, {
              existingId,
              batchId,
              folderId: null,
              model: currentModel,
              prompt: imgPrompt,
              params: { ...params },
              favorite: false,
              status: 'completed',
              width: img.width,
              height: img.height,
              sourceUrl: img.url,  // keep remote URL as backup
              storageZone: 'hot',
            });

            // Try optional OSS upload (best-effort, non-blocking)
            try {
              const blob = await StorageService.getImage(localId);
              if (blob) {
                const ossKey = `images/${localId}/${Date.now()}.png`;
                const ossUrl = await StorageService.uploadToOSS(blob, ossKey);
                if (ossUrl) {
                  await updateImage(localId, { ossUrl, ossKey });
                  console.log('[GenerationStore] OSS upload success:', ossUrl);
                }
              }
            } catch (ossErr) {
              console.warn('[GenerationStore] OSS upload skipped (non-critical):', ossErr.message);
            }

            resultImages.push({
              id: localId,
              url: img.url,
              prompt: imgPrompt,
              params: { ...params },
            });
          } catch (saveErr) {
            console.warn('[GenerationStore] saveImage failed, fallback to URL-only:', saveErr);
            // Fallback: save remote URL only (old behavior)
            let imgId;
            if (i === 0 && pendingImageId) {
              try {
                await updateImage(pendingImageId, {
                  url: img.url,
                  thumbnailUrl: img.url,
                  status: 'completed',
                  width: img.width,
                  height: img.height,
                });
                imgId = pendingImageId;
              } catch (dbErr) {
                imgId = await addImage({
                  batchId,
                  folderId: null,
                  model: currentModel,
                  prompt: imgPrompt,
                  url: img.url,
                  thumbnailUrl: img.url,
                  params: { ...params },
                  favorite: false,
                  storageZone: 'hot',
                  status: 'completed',
                  createdAt: Date.now(),
                  width: img.width,
                  height: img.height,
                });
              }
            } else {
              imgId = await addImage({
                batchId,
                folderId: null,
                model: currentModel,
                prompt: imgPrompt,
                url: img.url,
                thumbnailUrl: img.url,
                params: { ...params },
                favorite: false,
                storageZone: 'hot',
                status: 'completed',
                createdAt: Date.now(),
                width: img.width,
                height: img.height,
              });
            }
            resultImages.push({
              id: imgId,
              url: img.url,
              prompt: imgPrompt,
              params: { ...params },
            });
          }
        }

        return { images: resultImages, batchId };
      };

      // Submit to TaskEngine
      const taskResult = await TaskEngine.submit({
        type: 'generation',
        model: currentModel,
        prompt,
        params,
        execute,
      });

      // On success, update store with results
      const resultImages = taskResult?.images || [];

      set(
        produce((state) => {
          state.results = resultImages;
          state.generatingProgress = 100;
          state.batchHistory.unshift({
            batchId,
            prompt,
            model: currentModel,
            images: resultImages,
            createdAt: Date.now(),
          });
        })
      );

      return taskResult;
    } catch (err) {
      console.error('[GenerationStore] generate error:', err);
      set({ generationError: err.message });
      throw err;
    } finally {
      set({ isGenerating: false });
    }
  },

  /**
   * Use the LLM to expand the current prompt into multiple variations.
   */
  async expandPrompt() {
    const { prompt, currentModel } = get();
    if (!prompt.trim()) return;

    try {
      const llm = getLLMAdapter();
      const expanded = await llm.expandPrompt(prompt, { model: currentModel });
      set({ expandedPrompts: expanded });
      return expanded;
    } catch (err) {
      console.error('[GenerationStore] expandPrompt error:', err);
      throw err;
    }
  },

  /** Select an expanded prompt as the active prompt. */
  selectExpandedPrompt(text) {
    set({ prompt: text, expandedPrompts: [] });
  },

  /** Toggle favorite on a result image. */
  async favoriteImage(imageId) {
    const img = get().results.find((r) => r.id === imageId);
    if (img) {
      const newVal = !img.favorite;
      await updateImage(imageId, { favorite: newVal });
      set(
        produce((state) => {
          const r = state.results.find((r) => r.id === imageId);
          if (r) r.favorite = newVal;
        })
      );
    }
  },

  /** Remove an image from the current results (and DB). */
  async discardImage(imageId) {
    const { deleteImage: dbDelete } = await import('../db/database');
    await dbDelete(imageId);
    set(
      produce((state) => {
        state.results = state.results.filter((r) => r.id !== imageId);
      })
    );
  },

  /** Re-run generation with the same parameters. */
  async regenerate() {
    await get().generate();
  },

  /** Clear all generation state. */
  clearGeneration() {
    set({
      prompt: '',
      expandedPrompts: [],
      referenceImages: [],
      results: [],
      isGenerating: false,
      generatingProgress: 0,
      currentBatchId: null,
      generationError: null,
    });
  },
}));
