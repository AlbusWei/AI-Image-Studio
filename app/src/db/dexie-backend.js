/**
 * AI Image Studio – Dexie (IndexedDB) backend
 *
 * Extracted from database.js — all logic preserved verbatim.
 * Exported via createDexieBackend() factory.
 */

import Dexie from 'dexie';

export function createDexieBackend() {
  const db = new Dexie('AIImageStudio');

  db.version(1).stores({
    images:
      '++id, batchId, folderId, model, favorite, createdAt, storageZone, [folderId+createdAt]',
    batches: '++id, sessionId, model, prompt, createdAt',
    sessions: '++id, createdAt',
    folders: '++id, name, parentId, createdAt',
    tasks: '++id, type, status, model, createdAt, [status+createdAt]',
    settings: 'key',
    casePackages: '++id, imageId, createdAt',
  });

  // ── open ────────────────────────────────────────────────────────────
  async function open() {
    await db.open();
    console.log('[db:dexie] AIImageStudio database opened successfully');
  }

  // ── images ──────────────────────────────────────────────────────────

  async function addImage(image) {
    return await db.images.add({
      ...image,
      favorite: image.favorite ?? false,
      storageZone: image.storageZone ?? 'hot',
      createdAt: image.createdAt ?? Date.now(),
    });
  }

  async function getImages(opts = {}) {
    let collection = db.images.orderBy(opts.orderBy || 'createdAt');

    if (opts.folderId !== undefined) {
      collection = db.images.where('folderId').equals(opts.folderId);
    }
    if (opts.model) {
      collection = collection.filter((img) => img.model === opts.model);
    }
    if (opts.favorite !== undefined) {
      collection = collection.filter((img) => img.favorite === opts.favorite);
    }
    if (opts.status !== undefined) {
      collection = collection.filter((img) => img.status === opts.status);
    } else if (opts.includeAllStatus !== true) {
      collection = collection.filter((img) => img.status !== 'pending' && img.status !== 'failed');
    }

    let arr = await collection.reverse().toArray();

    if (opts.offset) arr = arr.slice(opts.offset);
    if (opts.limit) arr = arr.slice(0, opts.limit);

    return arr;
  }

  async function getImage(id) {
    return await db.images.get(id);
  }

  async function updateImage(id, changes) {
    return await db.images.update(id, changes);
  }

  async function deleteImage(id) {
    return await db.images.delete(id);
  }

  async function deleteImages(ids) {
    return await db.images.bulkDelete(ids);
  }

  async function searchImages(keyword) {
    const lower = keyword.toLowerCase();
    return await db.images
      .filter((img) => {
        if (img.status === 'pending' || img.status === 'failed') return false;
        if (img.prompt && img.prompt.toLowerCase().includes(lower)) return true;
        if (img.model && img.model.toLowerCase().includes(lower)) return true;
        if (img.tags && Array.isArray(img.tags) && img.tags.some((t) => t.toLowerCase().includes(lower))) return true;
        return false;
      })
      .reverse()
      .toArray();
  }

  async function toggleImageFavorite(id) {
    const img = await db.images.get(id);
    if (img) {
      await db.images.update(id, { favorite: !img.favorite });
      return !img.favorite;
    }
    return false;
  }

  async function moveImages(ids, folderId) {
    return await db.images.bulkUpdate(
      ids.map((id) => ({ key: id, changes: { folderId } }))
    );
  }

  async function getImageStats() {
    const all = await db.images.toArray();
    return {
      total: all.length,
      hotZone: all.filter((i) => i.storageZone === 'hot').length,
      coldZone: all.filter((i) => i.storageZone === 'cold').length,
      favorites: all.filter((i) => i.favorite).length,
    };
  }

  // ── batches ─────────────────────────────────────────────────────────

  async function addBatch(batch) {
    return await db.batches.add({
      ...batch,
      createdAt: batch.createdAt ?? Date.now(),
    });
  }

  async function getBatches(opts = {}) {
    let query = db.batches.orderBy('createdAt').reverse();
    if (opts.sessionId) {
      query = db.batches.where('sessionId').equals(opts.sessionId);
    }
    let arr = await query.toArray();
    if (opts.limit) arr = arr.slice(0, opts.limit);
    return arr;
  }

  async function getBatch(id) {
    return await db.batches.get(id);
  }

  async function deleteBatch(id) {
    return await db.batches.delete(id);
  }

  // ── sessions ────────────────────────────────────────────────────────

  async function addSession(session = {}) {
    return await db.sessions.add({
      ...session,
      createdAt: session.createdAt ?? Date.now(),
    });
  }

  async function getSessions() {
    return await db.sessions.orderBy('createdAt').reverse().toArray();
  }

  async function getSession(id) {
    return await db.sessions.get(id);
  }

  // ── folders ─────────────────────────────────────────────────────────

  async function addFolder(folder) {
    return await db.folders.add({
      ...folder,
      parentId: folder.parentId ?? null,
      createdAt: folder.createdAt ?? Date.now(),
    });
  }

  async function getFolders(parentId = null) {
    if (parentId !== null) {
      return await db.folders.where('parentId').equals(parentId).toArray();
    }
    return await db.folders.toArray();
  }

  async function getFolder(id) {
    return await db.folders.get(id);
  }

  async function updateFolder(id, changes) {
    return await db.folders.update(id, changes);
  }

  async function deleteFolder(id) {
    const images = await db.images.where('folderId').equals(id).toArray();
    await Promise.all(images.map((img) => db.images.update(img.id, { folderId: null })));
    const subFolders = await db.folders.where('parentId').equals(id).toArray();
    for (const sub of subFolders) {
      await deleteFolder(sub.id);
    }
    return await db.folders.delete(id);
  }

  // ── tasks ───────────────────────────────────────────────────────────

  async function addTask(task) {
    return await db.tasks.add({
      ...task,
      status: task.status ?? 'queued',
      createdAt: task.createdAt ?? Date.now(),
    });
  }

  async function getTasks(opts = {}) {
    let query = db.tasks.orderBy('createdAt').reverse();
    if (opts.status) {
      query = db.tasks.where('status').equals(opts.status);
    }
    let arr = await query.toArray();
    if (opts.limit) arr = arr.slice(0, opts.limit);
    return arr;
  }

  async function getTask(id) {
    return await db.tasks.get(id);
  }

  async function updateTask(id, changes) {
    return await db.tasks.update(id, changes);
  }

  async function deleteTask(id) {
    return await db.tasks.delete(id);
  }

  async function getTaskStats() {
    const all = await db.tasks.toArray();
    return {
      total: all.length,
      active: all.filter((t) => t.status === 'running').length,
      queued: all.filter((t) => t.status === 'queued').length,
      completed: all.filter((t) => t.status === 'completed').length,
      failed: all.filter((t) => t.status === 'failed').length,
    };
  }

  // ── settings ────────────────────────────────────────────────────────

  async function getSetting(key, defaultValue = null) {
    const row = await db.settings.get(key);
    return row ? row.value : defaultValue;
  }

  async function setSetting(key, value) {
    return await db.settings.put({ key, value });
  }

  async function getAllSettings() {
    const rows = await db.settings.toArray();
    return rows.reduce((acc, { key, value }) => {
      acc[key] = value;
      return acc;
    }, {});
  }

  // ── casePackages ────────────────────────────────────────────────────

  async function addCasePackage(pkg) {
    return await db.casePackages.add({
      ...pkg,
      createdAt: pkg.createdAt ?? Date.now(),
    });
  }

  async function getCasePackages(imageId) {
    if (imageId) {
      return await db.casePackages.where('imageId').equals(imageId).toArray();
    }
    return await db.casePackages.orderBy('createdAt').reverse().toArray();
  }

  async function updateCasePackage(id, changes) {
    return await db.casePackages.update(id, changes);
  }

  async function deleteCasePackage(id) {
    return await db.casePackages.delete(id);
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
    // raw Dexie instance (for legacy direct-table access)
    raw: db,
  };
}
