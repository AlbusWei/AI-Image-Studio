/**
 * AI Image Studio – database facade (strategy pattern)
 *
 * At startup initDatabase() picks a backend:
 *   • Electron  → SQLite via IPC  (electron-backend.js)
 *   • Browser   → Dexie / IndexedDB (dexie-backend.js)
 *
 * Every named export delegates to the active backend so that
 * Zustand stores, services and pages require **zero changes**.
 */

import { createDexieBackend } from './dexie-backend';
import { createElectronBackend } from './electron-backend';
import { createHttpBackend } from './http-backend';

/** @type {object|null} */
let backend = null;

/**
 * Initialise the database layer.  Call once at app startup.
 * Priority:
 *   1. Electron IPC  → SQLite via preload bridge
 *   2. HTTP backend  → SQLite via Electron api-server (browser tab)
 *   3. Dexie         → IndexedDB (standalone browser, no Electron running)
 */
export async function initDatabase() {
  if (window.electronAPI?.db) {
    backend = createElectronBackend(window.electronAPI);
    await backend.open();
    console.log('[DB] Using Electron IPC backend');
  } else {
    // Try HTTP backend (Electron api-server must be running on port 19527)
    try {
      const httpBackend = createHttpBackend();
      await httpBackend.open();
      backend = httpBackend;
      console.log('[DB] Using HTTP backend (SQLite via Electron api-server)');
    } catch (e) {
      console.warn('[DB] HTTP backend unavailable, falling back to Dexie:', e.message);
      backend = createDexieBackend();
      await backend.open();
      console.log('[DB] Using Dexie / IndexedDB backend');
    }
  }
  return backend.raw;
}

// ── images ──────────────────────────────────────────────────────────────

export function addImage(image)                  { return backend.addImage(image); }
export function getImages(opts)                  { return backend.getImages(opts); }
export function getImage(id)                     { return backend.getImage(id); }
export function updateImage(id, changes)         { return backend.updateImage(id, changes); }
export function deleteImage(id)                  { return backend.deleteImage(id); }
export function deleteImages(ids)                { return backend.deleteImages(ids); }
export function searchImages(keyword)            { return backend.searchImages(keyword); }
export function toggleImageFavorite(id)          { return backend.toggleImageFavorite(id); }
export function moveImages(ids, folderId)        { return backend.moveImages(ids, folderId); }
export function getImageStats()                  { return backend.getImageStats(); }

// ── batches ─────────────────────────────────────────────────────────────

export function addBatch(batch)                  { return backend.addBatch(batch); }
export function getBatches(opts)                 { return backend.getBatches(opts); }
export function getBatch(id)                     { return backend.getBatch(id); }
export function deleteBatch(id)                  { return backend.deleteBatch(id); }

// ── sessions ────────────────────────────────────────────────────────────

export function addSession(session)              { return backend.addSession(session); }
export function getSessions()                    { return backend.getSessions(); }
export function getSession(id)                   { return backend.getSession(id); }

// ── folders ─────────────────────────────────────────────────────────────

export function addFolder(folder)                { return backend.addFolder(folder); }
export function getFolders(parentId)             { return backend.getFolders(parentId); }
export function getFolder(id)                    { return backend.getFolder(id); }
export function updateFolder(id, changes)        { return backend.updateFolder(id, changes); }
export function deleteFolder(id)                 { return backend.deleteFolder(id); }

// ── tasks ───────────────────────────────────────────────────────────────

export function addTask(task)                    { return backend.addTask(task); }
export function getTasks(opts)                   { return backend.getTasks(opts); }
export function getTask(id)                      { return backend.getTask(id); }
export function updateTask(id, changes)          { return backend.updateTask(id, changes); }
export function deleteTask(id)                   { return backend.deleteTask(id); }
export function getTaskStats()                   { return backend.getTaskStats(); }

// ── settings ────────────────────────────────────────────────────────────

export function getSetting(key, defaultValue)    { return backend.getSetting(key, defaultValue); }
export function setSetting(key, value)           { return backend.setSetting(key, value); }
export function getAllSettings()                 { return backend.getAllSettings(); }

// ── casePackages ────────────────────────────────────────────────────────

export function addCasePackage(pkg)              { return backend.addCasePackage(pkg); }
export function getCasePackages(imageId)         { return backend.getCasePackages(imageId); }
export function updateCasePackage(id, changes)   { return backend.updateCasePackage(id, changes); }
export function deleteCasePackage(id)            { return backend.deleteCasePackage(id); }

// ── default export ──────────────────────────────────────────────────────
// Legacy direct-table access (e.g. `db.casePackages.update(id, changes)` in KnowledgeBase).
// In Dexie mode this is the raw Dexie instance; in Electron mode it's a compatible proxy.

export default new Proxy({}, {
  get(_target, prop) {
    if (backend?.raw) return backend.raw[prop];
    return undefined;
  },
});
