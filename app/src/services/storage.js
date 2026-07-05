/**
 * StorageService – image storage (hot zone: IndexedDB, cold zone: OSS)
 *
 * Hot zone: images stored as Blobs in IndexedDB for fast access.
 * Cold zone: images uploaded to Alibaba Cloud OSS for long-term storage.
 *
 * Thumbnail generation uses the Canvas API (max 200px dimension).
 */

import OSS from 'ali-oss';
import * as db from '../db/database';
import { useSettingsStore } from '../stores/useSettingsStore';
import { proxyImageUrl } from './api/client';

const THUMBNAIL_MAX_DIMENSION = 200;

/**
 * Build an ali-oss client from the current settings store config.
 * Reads config lazily so it always reflects the latest saved values.
 */
function getOSSClient(overrides = {}) {
  const st = useSettingsStore.getState();
  const cfg = st.storageConfig || {};

  const bucket = overrides.bucket || cfg.ossBucket || '';
  const region = overrides.region || cfg.ossRegion || '';
  const accessKeyId = overrides.accessKeyId || cfg.ossAccessKeyId || '';
  const accessKeySecret = overrides.accessKeySecret || cfg.ossAccessKeySecret || '';

  if (!bucket || !region || !accessKeyId || !accessKeySecret) {
    throw new Error('OSS 配置不完整，请先在设置中填写 Bucket / Region / AccessKey');
  }

  return new OSS({
    region,
    accessKeyId,
    accessKeySecret,
    bucket,
    // Browser-friendly settings
    secure: true,
    sts: false,
  });
}

class StorageServiceClass {
  /**
   * Save an image to local IndexedDB (hot zone).
   * @param {Blob|string} imageData - Blob or URL to fetch
   * @param {Object} metadata - { model, prompt, params, width, height, ... }
   *   metadata.existingId - if provided, update this existing record instead of creating new
   * @returns {Promise<{ localId: number, thumbnailBlob: Blob }>}
   */
  async saveImage(imageData, metadata = {}) {
    const { existingId, ...restMeta } = metadata;

    // Resolve blob from URL if needed
    let blob;
    if (typeof imageData === 'string') {
      const fetchUrl = proxyImageUrl(imageData);
      const resp = await fetch(fetchUrl);
      blob = await resp.blob();
    } else {
      blob = imageData;
    }

    // Generate thumbnail
    const thumbnailBlob = await this._generateThumbnail(blob);

    // Create runtime blob URLs for immediate display
    const blobUrl = URL.createObjectURL(blob);
    const thumbnailUrl = thumbnailBlob ? URL.createObjectURL(thumbnailBlob) : null;

    let id;
    if (existingId) {
      // Update existing record (e.g. pending task record from generate flow)
      id = existingId;
      await db.updateImage(id, {
        ...restMeta,
        blobUrl,
        thumbnailUrl,
        blobSize: blob.size,
        imageBlob: blob,
        thumbnailBlob,
        status: restMeta.status || 'completed',
      });
    } else {
      // Insert new record
      id = await db.addImage({
        ...restMeta,
        storageZone: 'hot',
        blobUrl,
        thumbnailUrl,
        blobSize: blob.size,
        imageBlob: blob,
        thumbnailBlob,
        createdAt: Date.now(),
      });
    }

    return { localId: id, thumbnailBlob };
  }

  /**
   * Get an image blob by its DB id (hot zone).
   * @param {number} id
   * @returns {Promise<Blob|null>}
   */
  async getImage(id) {
    const record = await db.getImage(id);
    if (!record) return null;

    // Try blobUrl first (fastest, same-session only)
    if (record.blobUrl) {
      try {
        const resp = await fetch(record.blobUrl);
        return await resp.blob();
      } catch { /* blobUrl stale (page refresh), fall through */ }
    }

    // Try stored imageBlob (survives page refresh)
    if (record.imageBlob instanceof Blob) {
      // Refresh the blobUrl for subsequent accesses
      const freshBlobUrl = URL.createObjectURL(record.imageBlob);
      await db.updateImage(id, { blobUrl: freshBlobUrl });
      return record.imageBlob;
    }

    // Fallback: fetch the original URL through the CORS proxy and cache the blob
    const remoteUrl = record.sourceUrl || record.url;
    if (remoteUrl && (remoteUrl.startsWith('http://') || remoteUrl.startsWith('https://'))) {
      try {
        const proxyUrl = proxyImageUrl(remoteUrl);
        const resp = await fetch(proxyUrl);
        if (resp.ok) {
          const blob = await resp.blob();
          // Cache both blob and blobUrl for subsequent accesses
          const cachedBlobUrl = URL.createObjectURL(blob);
          await db.updateImage(id, {
            blobUrl: cachedBlobUrl,
            imageBlob: blob,
            blobSize: blob.size,
          });
          return blob;
        }
      } catch (err) {
        console.warn('[StorageService] getImage proxy fetch failed:', err);
      }
    }

    return null;
  }

  /**
   * Get a thumbnail blob by image id.
   * @param {number} id
   * @returns {Promise<Blob|null>}
   */
  async getThumbnail(id) {
    const record = await db.getImage(id);
    if (!record) return null;

    // Try stored thumbnailBlob first (survives page refresh)
    if (record.thumbnailBlob instanceof Blob) {
      return record.thumbnailBlob;
    }

    // Fallback: try thumbnailUrl (same-session blob URL)
    if (record.thumbnailUrl) {
      try {
        const resp = await fetch(record.thumbnailUrl);
        return await resp.blob();
      } catch {
        return null;
      }
    }

    return null;
  }

  /**
   * Delete an image (both DB record and blob references).
   * @param {number} id
   */
  async deleteImage(id) {
    const record = await db.getImage(id);
    if (record) {
      // Revoke blob URLs to free memory
      if (record.blobUrl) URL.revokeObjectURL(record.blobUrl);
      if (record.thumbnailUrl) URL.revokeObjectURL(record.thumbnailUrl);
    }
    await db.deleteImage(id);
  }

  /**
   * Upload an image blob to Alibaba Cloud OSS (cold zone).
   * Uses ali-oss SDK for proper OSS authentication.
   * @param {Blob} blob
   * @param {string} key - OSS object key (path)
   * @param {Object} [ossConfigOverrides] - optional { bucket, region, accessKeyId, accessKeySecret }
   * @returns {Promise<string>} OSS URL
   */
  async uploadToOSS(blob, key, ossConfigOverrides = {}) {
    try {
      const client = getOSSClient(ossConfigOverrides);
      // ali-oss put() accepts a Blob/File directly in browser
      const result = await client.put(key, blob, {
        headers: { 'Content-Type': blob.type || 'image/png' },
      });
      console.log('[StorageService] OSS upload success:', result.url || result.name);
      return result.url || `https://${client.options.bucket}.${client.options.region}.aliyuncs.com/${key}`;
    } catch (err) {
      console.error('[StorageService] OSS upload failed:', err);
      throw new Error(`OSS 上传失败: ${err.message}`);
    }
  }

  /**
   * Download an image from OSS.
   * Uses ali-oss SDK for proper OSS authentication.
   * @param {string} key - OSS object key
   * @param {Object} [ossConfigOverride]
   * @returns {Promise<Blob>}
   */
  async downloadFromOSS(key, ossConfigOverride = {}) {
    try {
      const client = getOSSClient(ossConfigOverride);
      const result = await client.get(key);
      // result.content is a Buffer in Node, but in browser it's a Uint8Array/Blob
      if (result.content instanceof Blob) {
        return result.content;
      }
      // Wrap Uint8Array into a Blob
      return new Blob([result.content], { type: 'image/png' });
    } catch (err) {
      console.error('[StorageService] OSS download failed:', err);
      throw new Error(`OSS 下载失败: ${err.message}`);
    }
  }

  /**
   * Test OSS connection by calling headBucket.
   * @param {Object} [ossConfigOverride] - { bucket, region, accessKeyId, accessKeySecret }
   * @returns {Promise<{ ok: boolean, msg: string }>}
   */
  async checkOSSConnection(ossConfigOverride = {}) {
    try {
      const client = getOSSClient(ossConfigOverride);
      const start = Date.now();
      await client.headBucket();
      const ms = Date.now() - start;
      return { ok: true, msg: `OSS 连接正常 (${ms}ms)` };
    } catch (err) {
      console.error('[StorageService] OSS connection test failed:', err);
      const msg = err.status === 403
        ? 'AccessKey 无权限访问该 Bucket'
        : err.status === 404
          ? 'Bucket 不存在'
          : `连接失败: ${err.message}`;
      return { ok: false, msg };
    }
  }

  /**
   * Move an image from hot zone to cold zone (OSS).
   * @param {number} imageId
   * @returns {Promise<string>} OSS URL
   */
  async moveToColdZone(imageId) {
    const blob = await this.getImage(imageId);
    if (!blob) throw new Error('Image blob not found in hot zone');

    const key = `images/${imageId}/${Date.now()}.png`;
    const ossUrl = await this.uploadToOSS(blob, key);

    // Update DB record
    await db.updateImage(imageId, {
      storageZone: 'cold',
      ossKey: key,
      ossUrl,
    });

    // Free local blob (keep thumbnail for fast preview)
    const record = await db.getImage(imageId);
    if (record?.blobUrl) {
      URL.revokeObjectURL(record.blobUrl);
      await db.updateImage(imageId, { blobUrl: null });
    }

    return ossUrl;
  }

  /**
   * Bring an image from cold zone back to hot zone.
   * @param {number} imageId
   */
  async moveToHotZone(imageId) {
    const record = await db.getImage(imageId);
    if (!record?.ossKey) throw new Error('Image not in cold zone');

    const blob = await this.downloadFromOSS(record.ossKey);
    const blobUrl = URL.createObjectURL(blob);

    await db.updateImage(imageId, {
      storageZone: 'hot',
      blobUrl,
      blobSize: blob.size,
    });
  }

  /**
   * Check hot zone usage and migrate oldest images to cold zone
   * when usage exceeds the configured threshold.
   * @param {number} [thresholdMB] - hot zone capacity in MB (from settings)
   * @returns {Promise<number>} number of images migrated
   */
  async checkAndMigrate(thresholdMB) {
    // Resolve threshold from settings if not provided
    if (!thresholdMB) {
      try {
        const st = useSettingsStore.getState();
        // hotCapacity is in GB in settings
        thresholdMB = (st.storageConfig?.hotCapacity || 100) * 1024;
      } catch {
        thresholdMB = 100 * 1024; // default 100 GB
      }
    }

    const thresholdBytes = thresholdMB * 1024 * 1024;

    // Get all hot-zone images sorted by createdAt ascending (oldest first)
    const hotImages = await db.getImages({});
    const hotZoneImages = hotImages
      .filter((img) => img.storageZone === 'hot')
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

    // Calculate current hot zone usage
    let currentBytes = hotZoneImages.reduce((sum, img) => sum + (img.blobSize || 0), 0);

    if (currentBytes <= thresholdBytes) {
      return 0; // No migration needed
    }

    console.log(`[StorageService] Hot zone usage ${(currentBytes / 1024 / 1024).toFixed(1)}MB exceeds threshold ${thresholdMB}MB, starting migration...`);

    let migrated = 0;
    for (const img of hotZoneImages) {
      if (currentBytes <= thresholdBytes) break;

      try {
        await this.moveToColdZone(img.id);
        currentBytes -= (img.blobSize || 0);
        migrated++;
        console.log(`[StorageService] Migrated image ${img.id} to cold zone`);
      } catch (err) {
        console.error(`[StorageService] Failed to migrate image ${img.id}:`, err);
        // Continue with next image
      }
    }

    console.log(`[StorageService] Migration complete: ${migrated} image(s) moved to cold zone`);
    return migrated;
  }

  /**
   * Get storage statistics.
   * @returns {Promise<{ hotZone: number, coldZone: number, total: number, usedBytes: number }>}
   */
  async getStorageStats() {
    const stats = await db.getImageStats();
    const allImages = await db.getImages({});
    const usedBytes = allImages.reduce((sum, img) => sum + (img.blobSize || 0), 0);

    return {
      ...stats,
      usedBytes,
      usedMB: Math.round((usedBytes / (1024 * 1024)) * 100) / 100,
    };
  }

  // ── Private helpers ────────────────────────────────────────────────────

  /**
   * Generate a thumbnail from an image Blob using Canvas API.
   * @param {Blob} blob
   * @returns {Promise<Blob|null>}
   */
  async _generateThumbnail(blob) {
    try {
      const img = await this._loadImage(blob);
      const { width, height } = this._calculateThumbnailSize(img);

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      ctx.drawImage(img, 0, 0, width, height);

      // Convert canvas to blob
      return new Promise((resolve) => {
        canvas.toBlob(
          (thumbnailBlob) => resolve(thumbnailBlob),
          blob.type || 'image/jpeg',
          0.8
        );
      });
    } catch (err) {
      console.error('[StorageService] Thumbnail generation failed:', err);
      return null;
    }
  }

  /**
   * Load an image element from a Blob.
   * @param {Blob} blob
   * @returns {Promise<HTMLImageElement>}
   */
  _loadImage(blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = (err) => {
        URL.revokeObjectURL(url);
        reject(err);
      };
      img.src = url;
    });
  }

  /**
   * Calculate thumbnail dimensions maintaining aspect ratio.
   * @param {HTMLImageElement} img
   * @returns {{ width: number, height: number }}
   */
  _calculateThumbnailSize(img) {
    const maxDim = THUMBNAIL_MAX_DIMENSION;
    const { naturalWidth: w, naturalHeight: h } = img;

    if (w <= maxDim && h <= maxDim) {
      return { width: w, height: h };
    }

    const ratio = Math.min(maxDim / w, maxDim / h);
    return {
      width: Math.round(w * ratio),
      height: Math.round(h * ratio),
    };
  }
}

export const StorageService = new StorageServiceClass();
export default StorageService;
