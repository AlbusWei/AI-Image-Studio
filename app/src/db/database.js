/**
 * AI Image Studio – IndexedDB database layer (Dexie.js)
 *
 * Tables:
 *   images       – generated / uploaded images
 *   batches      – a group of images generated from one prompt
 *   sessions     – work sessions
 *   folders      – user-created folders for organising images
 *   tasks        – background task records
 *   settings     – key/value app settings
 *   casePackages – saved image + prompt packages
 */

import Dexie from 'dexie';

// ────────────────────────────────────────────────────────────────────────────
// Database schema
// ────────────────────────────────────────────────────────────────────────────

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

// ────────────────────────────────────────────────────────────────────────────
// Images
// ────────────────────────────────────────────────────────────────────────────

/**
 * Add a new image record.
 * @param {Object} image - { batchId, folderId, model, prompt, url, thumbnailUrl,
 *   params, favorite, storageZone, createdAt, width, height, ... }
 * @returns {number} new id
 */
export async function addImage(image) {
  return await db.images.add({
    ...image,
    favorite: image.favorite ?? false,
    storageZone: image.storageZone ?? 'hot',
    createdAt: image.createdAt ?? Date.now(),
  });
}

/**
 * Retrieve images with optional filters.
 * @param {Object} [opts] - { folderId, model, favorite, limit, offset, orderBy }
 */
export async function getImages(opts = {}) {
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
  // Filter by status: default to showing only completed images
  if (opts.status !== undefined) {
    collection = collection.filter((img) => img.status === opts.status);
  } else if (opts.includeAllStatus !== true) {
    // By default, exclude pending and failed records
    collection = collection.filter((img) => img.status !== 'pending' && img.status !== 'failed');
  }

  // Reverse to get newest first by default
  let arr = await collection.reverse().toArray();

  if (opts.offset) arr = arr.slice(opts.offset);
  if (opts.limit) arr = arr.slice(0, opts.limit);

  return arr;
}

/** Get a single image by id. */
export async function getImage(id) {
  return await db.images.get(id);
}

/** Update fields on an image. */
export async function updateImage(id, changes) {
  return await db.images.update(id, changes);
}

/** Delete a single image. */
export async function deleteImage(id) {
  return await db.images.delete(id);
}

/** Delete multiple images by ids. */
export async function deleteImages(ids) {
  return await db.images.bulkDelete(ids);
}

/** Search images by keyword in prompt, model, and tags (simple substring match). */
export async function searchImages(keyword) {
  const lower = keyword.toLowerCase();
  return await db.images
    .filter((img) => {
      // Exclude pending/failed records from search results
      if (img.status === 'pending' || img.status === 'failed') return false;
      if (img.prompt && img.prompt.toLowerCase().includes(lower)) return true;
      if (img.model && img.model.toLowerCase().includes(lower)) return true;
      if (img.tags && Array.isArray(img.tags) && img.tags.some((t) => t.toLowerCase().includes(lower))) return true;
      return false;
    })
    .reverse()
    .toArray();
}

/** Toggle favorite on an image. */
export async function toggleImageFavorite(id) {
  const img = await db.images.get(id);
  if (img) {
    await db.images.update(id, { favorite: !img.favorite });
    return !img.favorite;
  }
  return false;
}

/** Move images to a folder. */
export async function moveImages(ids, folderId) {
  return await db.images.bulkUpdate(
    ids.map((id) => ({ key: id, changes: { folderId } }))
  );
}

/** Count images by storage zone. */
export async function getImageStats() {
  const all = await db.images.toArray();
  return {
    total: all.length,
    hotZone: all.filter((i) => i.storageZone === 'hot').length,
    coldZone: all.filter((i) => i.storageZone === 'cold').length,
    favorites: all.filter((i) => i.favorite).length,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Batches
// ────────────────────────────────────────────────────────────────────────────

/** Add a batch record. */
export async function addBatch(batch) {
  return await db.batches.add({
    ...batch,
    createdAt: batch.createdAt ?? Date.now(),
  });
}

/** Get batches (newest first), optionally filtered by session. */
export async function getBatches(opts = {}) {
  let query = db.batches.orderBy('createdAt').reverse();
  if (opts.sessionId) {
    query = db.batches.where('sessionId').equals(opts.sessionId);
  }
  let arr = await query.toArray();
  if (opts.limit) arr = arr.slice(0, opts.limit);
  return arr;
}

/** Get a single batch. */
export async function getBatch(id) {
  return await db.batches.get(id);
}

/** Delete a batch (does NOT delete associated images). */
export async function deleteBatch(id) {
  return await db.batches.delete(id);
}

// ────────────────────────────────────────────────────────────────────────────
// Sessions
// ────────────────────────────────────────────────────────────────────────────

export async function addSession(session = {}) {
  return await db.sessions.add({
    ...session,
    createdAt: session.createdAt ?? Date.now(),
  });
}

export async function getSessions() {
  return await db.sessions.orderBy('createdAt').reverse().toArray();
}

export async function getSession(id) {
  return await db.sessions.get(id);
}

// ────────────────────────────────────────────────────────────────────────────
// Folders
// ────────────────────────────────────────────────────────────────────────────

export async function addFolder(folder) {
  return await db.folders.add({
    ...folder,
    parentId: folder.parentId ?? null,
    createdAt: folder.createdAt ?? Date.now(),
  });
}

export async function getFolders(parentId = null) {
  if (parentId !== null) {
    return await db.folders.where('parentId').equals(parentId).toArray();
  }
  return await db.folders.toArray();
}

export async function getFolder(id) {
  return await db.folders.get(id);
}

export async function updateFolder(id, changes) {
  return await db.folders.update(id, changes);
}

export async function deleteFolder(id) {
  // Also move images out of this folder (set folderId to null)
  const images = await db.images.where('folderId').equals(id).toArray();
  await Promise.all(images.map((img) => db.images.update(img.id, { folderId: null })));
  // Delete sub-folders recursively
  const subFolders = await db.folders.where('parentId').equals(id).toArray();
  for (const sub of subFolders) {
    await deleteFolder(sub.id);
  }
  return await db.folders.delete(id);
}

// ────────────────────────────────────────────────────────────────────────────
// Tasks
// ────────────────────────────────────────────────────────────────────────────

export async function addTask(task) {
  return await db.tasks.add({
    ...task,
    status: task.status ?? 'queued',
    createdAt: task.createdAt ?? Date.now(),
  });
}

export async function getTasks(opts = {}) {
  let query = db.tasks.orderBy('createdAt').reverse();
  if (opts.status) {
    query = db.tasks.where('status').equals(opts.status);
  }
  let arr = await query.toArray();
  if (opts.limit) arr = arr.slice(0, opts.limit);
  return arr;
}

export async function getTask(id) {
  return await db.tasks.get(id);
}

export async function updateTask(id, changes) {
  return await db.tasks.update(id, changes);
}

export async function deleteTask(id) {
  return await db.tasks.delete(id);
}

export async function getTaskStats() {
  const all = await db.tasks.toArray();
  return {
    total: all.length,
    active: all.filter((t) => t.status === 'running').length,
    queued: all.filter((t) => t.status === 'queued').length,
    completed: all.filter((t) => t.status === 'completed').length,
    failed: all.filter((t) => t.status === 'failed').length,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Settings (key/value)
// ────────────────────────────────────────────────────────────────────────────

export async function getSetting(key, defaultValue = null) {
  const row = await db.settings.get(key);
  return row ? row.value : defaultValue;
}

export async function setSetting(key, value) {
  return await db.settings.put({ key, value });
}

export async function getAllSettings() {
  const rows = await db.settings.toArray();
  return rows.reduce((acc, { key, value }) => {
    acc[key] = value;
    return acc;
  }, {});
}

// ────────────────────────────────────────────────────────────────────────────
// Case Packages
// ────────────────────────────────────────────────────────────────────────────

export async function addCasePackage(pkg) {
  return await db.casePackages.add({
    ...pkg,
    createdAt: pkg.createdAt ?? Date.now(),
  });
}

export async function getCasePackages(imageId) {
  if (imageId) {
    return await db.casePackages.where('imageId').equals(imageId).toArray();
  }
  return await db.casePackages.orderBy('createdAt').reverse().toArray();
}

export async function deleteCasePackage(id) {
  return await db.casePackages.delete(id);
}

// ────────────────────────────────────────────────────────────────────────────
// Initialisation helper
// ────────────────────────────────────────────────────────────────────────────

/**
 * Open the database and run any pending migrations.
 * Call once at app startup.
 */
export async function initDatabase() {
  try {
    await db.open();
    console.log('[db] AIImageStudio database opened successfully');
    return db;
  } catch (err) {
    console.error('[db] Failed to open database:', err);
    throw err;
  }
}

export default db;
