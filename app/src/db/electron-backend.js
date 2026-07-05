/**
 * AI Image Studio – Electron (SQLite via IPC) backend
 *
 * Each function delegates to window.electronAPI.db.* / fs.* IPC methods.
 * Return values are normalised to match the Dexie backend exactly.
 */

export function createElectronBackend(electronAPI) {
  const { db, fs } = electronAPI;

  // ── helpers ─────────────────────────────────────────────────────────

  /** Convert a Blob to an ArrayBuffer for IPC transport. */
  async function blobToBuffer(blob) {
    if (!blob) return null;
    if (blob instanceof ArrayBuffer) return blob;
    if (blob instanceof Uint8Array) return blob.buffer;
    return await blob.arrayBuffer();
  }

  /** Read a file from disk and return a Blob (or null). */
  async function readBlob(readFn, mime) {
    try {
      const result = await readFn;
      if (!result) return null;
      // result is expected to be { buffer: ArrayBuffer, mime?: string } or just ArrayBuffer
      if (result instanceof ArrayBuffer) {
        return new Blob([result], { type: mime || 'image/png' });
      }
      if (result.buffer) {
        return new Blob([result.buffer], { type: result.mime || mime || 'image/png' });
      }
      return null;
    } catch {
      return null;
    }
  }

  // ── open ────────────────────────────────────────────────────────────

  async function open() {
    // Database is initialised in the main process — no-op here.
    console.log('[db:electron] SQLite backend ready (main process)');
  }

  // ── images ──────────────────────────────────────────────────────────

  async function addImage(image) {
    // Separate blobs from metadata
    const { imageBlob, thumbnailBlob, ...metadata } = image;

    // Insert metadata into SQLite
    const result = await db.addImage(metadata);
    const newId = typeof result === 'number' ? result : result.id;

    // Persist blobs to file system
    if (imageBlob) {
      const buffer = await blobToBuffer(imageBlob);
      const mime = imageBlob.type || 'image/png';
      await fs.saveImage(newId, buffer, mime);
    }
    if (thumbnailBlob) {
      const buffer = await blobToBuffer(thumbnailBlob);
      await fs.saveThumbnail(newId, buffer);
    }

    // Dexie returns just the auto-increment id number
    return newId;
  }

  async function getImages(opts = {}) {
    // Translate Dexie-style status filter for the SQLite layer:
    // Dexie excludes pending/failed by default unless includeAllStatus is true.
    const sqlOpts = { ...opts };
    if (opts.status === undefined && opts.includeAllStatus !== true) {
      // SQLite can't do "NOT IN" easily via the existing query layer,
      // so we fetch and filter in JS.
      delete sqlOpts.includeAllStatus;
    }
    let rows = await db.getImages(sqlOpts);

    // Apply Dexie-style status filtering on the result set
    if (opts.status === undefined && opts.includeAllStatus !== true) {
      rows = rows.filter((r) => r.status !== 'pending' && r.status !== 'failed');
    }

    // Load thumbnail blobs from file system for gallery display
    for (const row of rows) {
      try {
        const thumbResult = await fs.readThumbnail(row.id);
        if (thumbResult && thumbResult.buffer) {
          const arrayBuf = new Uint8Array(thumbResult.buffer).buffer;
          row.thumbnailBlob = new Blob([arrayBuf], { type: thumbResult.mimeType || 'image/jpeg' });
          row.thumbnailUrl = URL.createObjectURL(row.thumbnailBlob);
        }
        row.hasImage = true;
      } catch (e) {
        // thumbnail not available
      }
    }

    return rows;
  }

  async function getImage(id) {
    const row = await db.getImage(id);
    if (!row) return null;

    // Attach blobs from file system
    const [imageBlob, thumbnailBlob] = await Promise.all([
      readBlob(fs.readImage(id), row.mimeType || 'image/png'),
      readBlob(fs.readThumbnail(id), 'image/png'),
    ]);
    if (imageBlob) row.imageBlob = imageBlob;
    if (thumbnailBlob) row.thumbnailBlob = thumbnailBlob;

    return row;
  }

  async function updateImage(id, changes) {
    // If blob changes are included, persist them to the file system
    const { imageBlob, thumbnailBlob, ...metaChanges } = changes;
    if (imageBlob) {
      const buffer = await blobToBuffer(imageBlob);
      const mime = imageBlob.type || 'image/png';
      await fs.saveImage(id, buffer, mime);
    }
    if (thumbnailBlob) {
      const buffer = await blobToBuffer(thumbnailBlob);
      await fs.saveThumbnail(id, buffer);
    }
    if (Object.keys(metaChanges).length > 0) {
      await db.updateImage(id, metaChanges);
    }
  }

  async function deleteImage(id) {
    await db.deleteImage(id);
    try { await fs.deleteImage(id); } catch { /* file may not exist */ }
  }

  async function deleteImages(ids) {
    await db.deleteImages(ids);
    try { await fs.deleteImages(ids); } catch { /* best effort */ }
  }

  async function searchImages(keyword) {
    return await db.searchImages(keyword);
  }

  async function toggleImageFavorite(id) {
    return await db.toggleImageFavorite(id);
  }

  async function moveImages(ids, folderId) {
    return await db.moveImages(ids, folderId);
  }

  async function getImageStats() {
    const stats = await db.getImageStats();
    // Normalise field names to match Dexie backend: hot→hotZone, cold→coldZone
    return {
      total: stats.total,
      hotZone: stats.hot ?? stats.hotZone ?? 0,
      coldZone: stats.cold ?? stats.coldZone ?? 0,
      favorites: stats.favorites,
    };
  }

  // ── batches ─────────────────────────────────────────────────────────

  async function addBatch(batch) {
    const result = await db.addBatch(batch);
    // Dexie returns the auto-increment id number
    return typeof result === 'number' ? result : result.id;
  }

  async function getBatches(opts = {}) {
    // preload.cjs passes sessionId directly, not as opts object
    const sessionId = opts.sessionId ?? null;
    return await db.getBatches(sessionId);
  }

  async function getBatch(id) {
    // Not exposed in preload — fetch all and filter
    const all = await db.getBatches(null);
    return all.find((b) => b.id === id) || null;
  }

  async function deleteBatch(id) {
    // preload doesn't expose deleteBatch — update to mark or ignore
    // For now, batches are immutable; deletion is a no-op in Electron mode.
    console.warn('[db:electron] deleteBatch not supported via IPC');
  }

  // ── sessions ────────────────────────────────────────────────────────

  async function addSession(_session = {}) {
    // preload addSession() takes no args; main process generates createdAt
    const result = await db.addSession();
    return typeof result === 'number' ? result : result.id;
  }

  async function getSessions() {
    return await db.getSessions();
  }

  async function getSession(id) {
    // Not exposed in preload — fetch all and filter
    const all = await db.getSessions();
    return all.find((s) => s.id === id) || null;
  }

  // ── folders ─────────────────────────────────────────────────────────

  async function addFolder(folder) {
    const result = await db.addFolder(folder);
    return typeof result === 'number' ? result : result.id;
  }

  async function getFolders(parentId = null) {
    // preload getFolders() returns all folders; filter in JS
    const all = await db.getFolders();
    if (parentId !== null) {
      return all.filter((f) => f.parentId === parentId);
    }
    return all;
  }

  async function getFolder(id) {
    // Not exposed in preload — fetch all and filter
    const all = await db.getFolders();
    return all.find((f) => f.id === id) || null;
  }

  async function updateFolder(id, changes) {
    return await db.updateFolder(id, changes);
  }

  async function deleteFolder(id) {
    return await db.deleteFolder(id);
  }

  // ── tasks ───────────────────────────────────────────────────────────

  async function addTask(task) {
    const result = await db.addTask(task);
    return typeof result === 'number' ? result : result.id;
  }

  async function getTasks(opts = {}) {
    return await db.getTasks(opts);
  }

  async function getTask(id) {
    // Not exposed in preload — fetch all and filter
    const all = await db.getTasks({});
    return all.find((t) => t.id === id) || null;
  }

  async function updateTask(id, changes) {
    return await db.updateTask(id, changes);
  }

  async function deleteTask(id) {
    return await db.deleteTask(id);
  }

  async function getTaskStats() {
    const stats = await db.getTaskStats();
    // Normalise: SQLite returns {total, queued, running, completed, failed, cancelled}
    // Dexie returns {total, active, queued, completed, failed}
    return {
      total: stats.total ?? 0,
      active: stats.running ?? stats.active ?? 0,
      queued: stats.queued ?? 0,
      completed: stats.completed ?? 0,
      failed: stats.failed ?? 0,
    };
  }

  // ── settings ────────────────────────────────────────────────────────

  async function getSetting(key, defaultValue = null) {
    const value = await db.getSetting(key);
    return value !== undefined ? value : defaultValue;
  }

  async function setSetting(key, value) {
    return await db.setSetting(key, value);
  }

  async function getAllSettings() {
    return await db.getAllSettings();
  }

  // ── casePackages ────────────────────────────────────────────────────

  async function addCasePackage(pkg) {
    const result = await db.addCasePackage(pkg);
    return typeof result === 'number' ? result : result.id;
  }

  async function getCasePackages(imageId) {
    // preload getCasePackages() takes no args; filter in JS
    const all = await db.getCasePackages();
    if (imageId) {
      return all.filter((p) => p.imageId === imageId);
    }
    return all;
  }

  async function updateCasePackage(id, changes) {
    return await db.updateCasePackage(id, changes);
  }

  async function deleteCasePackage(id) {
    return await db.deleteCasePackage(id);
  }

  // ── return backend interface ────────────────────────────────────────

  return {
    open,
    // images
    addImage, getImages, getImage, updateImage, deleteImage, deleteImages,
    searchImages, toggleImageFavorite, moveImages, getImageStats,
    // batches
    addBatch, getBatches, getBatch, deleteBatch,
    // sessions
    addSession, getSessions, getSession,
    // folders
    addFolder, getFolders, getFolder, updateFolder, deleteFolder,
    // tasks
    addTask, getTasks, getTask, updateTask, deleteTask, getTaskStats,
    // settings
    getSetting, setSetting, getAllSettings,
    // casePackages
    addCasePackage, getCasePackages, updateCasePackage, deleteCasePackage,
    // Proxy for legacy direct-table access (e.g. db.casePackages.update)
    raw: {
      casePackages: { update: (id, changes) => updateCasePackage(id, changes) },
    },
  };
}
