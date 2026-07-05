/**
 * AI Image Studio – HTTP backend (browser mode via Electron SQLite API)
 *
 * When the app runs in a plain browser (no Electron IPC), this backend
 * forwards every database operation to the Electron api-server's /api/db/*
 * REST endpoints. The Vite dev server proxies /api/db to the Electron
 * main process, so the browser sees the same SQLite data as the Electron
 * window.
 *
 * Binary blobs (image files, thumbnails) use a two-step approach:
 *   1. POST JSON metadata → get { id }
 *   2. PUT raw binary to /api/db/images/file/:id (and thumbnail/:id)
 */

const API_BASE = '/api/db';

// ─── Helpers ───────────────────────────────────────────────────────────

async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

async function apiPost(path, body = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

async function apiPutBinary(path, blob) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': blob.type || 'image/png' },
    body: blob,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

/** Convert a Blob to ArrayBuffer (for compatibility). */
async function blobToArrayBuffer(blob) {
  if (!blob) return null;
  if (blob instanceof ArrayBuffer) return blob;
  if (blob instanceof Uint8Array) return blob.buffer;
  return await blob.arrayBuffer();
}

/** Fetch a binary resource as a Blob. */
async function fetchBlob(path, fallbackMime = 'image/png') {
  try {
    const res = await fetch(`${API_BASE}${path}`);
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  }
}

// ─── Backend Factory ───────────────────────────────────────────────────

export function createHttpBackend() {

  async function open() {
    // Verify the API server is reachable
    const res = await fetch(`${API_BASE}/settings/getAll`);
    if (!res.ok) throw new Error('HTTP DB API not available');
    console.log('[db:http] Connected to Electron SQLite API');
  }

  // ── images ──────────────────────────────────────────────────────────

  async function addImage(image) {
    const { imageBlob, thumbnailBlob, ...metadata } = image;

    // Step 1: create metadata record
    const { id } = await apiPost('/images/add', { image: metadata });

    // Step 2: upload binary blobs
    if (imageBlob) {
      const blob = imageBlob instanceof Blob ? imageBlob : new Blob([await blobToArrayBuffer(imageBlob)], { type: 'image/png' });
      await apiPutBinary(`/images/file/${id}`, blob);
    }
    if (thumbnailBlob) {
      const blob = thumbnailBlob instanceof Blob ? thumbnailBlob : new Blob([await blobToArrayBuffer(thumbnailBlob)], { type: 'image/jpeg' });
      await apiPutBinary(`/images/thumbnail/${id}`, blob);
    }

    return id;
  }

  async function getImages(opts = {}) {
    const rows = await apiPost('/images/list', { opts });
    // Apply Dexie-style status filtering (mirrors electron-backend behavior)
    let result = rows;
    if (opts.status === undefined && opts.includeAllStatus !== true) {
      result = rows.filter((r) => r.status !== 'pending' && r.status !== 'failed');
    }

    // Load thumbnail (or full image as fallback) blobs for gallery display.
    // This mirrors the electron-backend which reads thumbnails from the file system.
    for (const row of result) {
      try {
        if (row.hasThumbnail) {
          const blob = await fetchBlob(`/images/thumbnail/${row.id}`, 'image/jpeg');
          if (blob) {
            row.thumbnailBlob = blob;
            row.thumbnailUrl = URL.createObjectURL(blob);
          }
        } else if (row.hasImage) {
          // No thumbnail on disk — ask server to generate one from the original
          try {
            const genRes = await fetch(`${API_BASE}/images/generateThumbnail/${row.id}`, { method: 'POST' });
            if (genRes.ok) {
              const blob = await fetchBlob(`/images/thumbnail/${row.id}`, 'image/jpeg');
              if (blob) {
                row.thumbnailBlob = blob;
                row.thumbnailUrl = URL.createObjectURL(blob);
                row.hasThumbnail = true;
                continue;
              }
            }
          } catch { /* thumbnail generation failed, fall through */ }
          // Fallback: use the full image as display source
          const blob = await fetchBlob(`/images/file/${row.id}`, row.mimeType || 'image/png');
          if (blob) {
            row.imageBlob = blob;
            row.blobUrl = URL.createObjectURL(blob);
          }
        }
      } catch {
        // best effort — Gallery will fall back to sourceUrl proxy
      }
    }

    return result;
  }

  async function getImage(id) {
    const row = await apiGet(`/images/get/${id}`);
    if (!row || row.error) return null;

    // Attach binary blobs
    if (row.hasImage) {
      const blob = await fetchBlob(`/images/file/${id}`, row.mimeType || 'image/png');
      if (blob) {
        row.imageBlob = blob;
        row.blobUrl = URL.createObjectURL(blob);
      }
    }
    if (row.hasThumbnail) {
      const blob = await fetchBlob(`/images/thumbnail/${id}`, 'image/jpeg');
      if (blob) {
        row.thumbnailBlob = blob;
        row.thumbnailUrl = URL.createObjectURL(blob);
      }
    }

    return row;
  }

  async function updateImage(id, changes) {
    const { imageBlob, thumbnailBlob, ...metaChanges } = changes;
    if (imageBlob) {
      const blob = imageBlob instanceof Blob ? imageBlob : new Blob([await blobToArrayBuffer(imageBlob)], { type: 'image/png' });
      await apiPutBinary(`/images/file/${id}`, blob);
    }
    if (thumbnailBlob) {
      const blob = thumbnailBlob instanceof Blob ? thumbnailBlob : new Blob([await blobToArrayBuffer(thumbnailBlob)], { type: 'image/jpeg' });
      await apiPutBinary(`/images/thumbnail/${id}`, blob);
    }
    if (Object.keys(metaChanges).length > 0) {
      await apiPost('/images/update', { id, changes: metaChanges });
    }
  }

  async function deleteImage(id) {
    await apiPost('/images/delete', { id });
  }

  async function deleteImages(ids) {
    await apiPost('/images/deleteMany', { ids });
  }

  async function searchImages(keyword) {
    return await apiPost('/images/search', { keyword });
  }

  async function toggleImageFavorite(id) {
    return await apiPost('/images/toggleFavorite', { id });
  }

  async function moveImages(ids, folderId) {
    return await apiPost('/images/move', { ids, folderId });
  }

  async function getImageStats() {
    const stats = await apiGet('/images/stats');
    return {
      total: stats.total,
      hotZone: stats.hot ?? stats.hotZone ?? 0,
      coldZone: stats.cold ?? stats.coldZone ?? 0,
      favorites: stats.favorites,
    };
  }

  // ── batches ─────────────────────────────────────────────────────────

  async function addBatch(batch) {
    const { id } = await apiPost('/batches/add', { batch });
    return id;
  }

  async function getBatches(opts = {}) {
    const sessionId = opts.sessionId ?? opts ?? null;
    return await apiPost('/batches/list', { sessionId });
  }

  async function getBatch(id) {
    const all = await apiPost('/batches/list', { sessionId: null });
    return all.find((b) => b.id === id) || null;
  }

  async function deleteBatch(id) {
    console.warn('[db:http] deleteBatch not supported');
  }

  // ── sessions ────────────────────────────────────────────────────────

  async function addSession(_session = {}) {
    const { id } = await apiPost('/sessions/add');
    return id;
  }

  async function getSessions() {
    return await apiGet('/sessions/list');
  }

  async function getSession(id) {
    const all = await getSessions();
    return all.find((s) => s.id === id) || null;
  }

  // ── folders ─────────────────────────────────────────────────────────

  async function addFolder(folder) {
    const { id } = await apiPost('/folders/add', { folder });
    return id;
  }

  async function getFolders(parentId = null) {
    const all = await apiGet('/folders/list');
    if (parentId !== null) {
      return all.filter((f) => f.parentId === parentId);
    }
    return all;
  }

  async function getFolder(id) {
    const all = await apiGet('/folders/list');
    return all.find((f) => f.id === id) || null;
  }

  async function updateFolder(id, changes) {
    return await apiPost('/folders/update', { id, changes });
  }

  async function deleteFolder(id) {
    return await apiPost('/folders/delete', { id });
  }

  // ── tasks ───────────────────────────────────────────────────────────

  async function addTask(task) {
    const { id } = await apiPost('/tasks/add', { task });
    return id;
  }

  async function getTasks(opts = {}) {
    return await apiPost('/tasks/list', { filter: opts });
  }

  async function getTask(id) {
    const all = await apiPost('/tasks/list', { filter: {} });
    return all.find((t) => t.id === id) || null;
  }

  async function updateTask(id, changes) {
    return await apiPost('/tasks/update', { id, changes });
  }

  async function deleteTask(id) {
    return await apiPost('/tasks/delete', { id });
  }

  async function getTaskStats() {
    const stats = await apiGet('/tasks/stats');
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
    const { value } = await apiGet(`/settings/get/${encodeURIComponent(key)}`);
    return value !== null && value !== undefined ? value : defaultValue;
  }

  async function setSetting(key, value) {
    return await apiPost('/settings/set', { key, value });
  }

  async function getAllSettings() {
    return await apiGet('/settings/getAll');
  }

  // ── casePackages ────────────────────────────────────────────────────

  async function addCasePackage(pkg) {
    const { id } = await apiPost('/casePackages/add', { pkg });
    return id;
  }

  async function getCasePackages(imageId) {
    const all = await apiGet('/casePackages/list');
    if (imageId) {
      return all.filter((p) => p.imageId === imageId);
    }
    return all;
  }

  async function updateCasePackage(id, changes) {
    return await apiPost('/casePackages/update', { id, changes });
  }

  async function deleteCasePackage(id) {
    return await apiPost('/casePackages/delete', { id });
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
    // Proxy for legacy direct-table access
    raw: {
      casePackages: { update: (id, changes) => updateCasePackage(id, changes) },
    },
  };
}
