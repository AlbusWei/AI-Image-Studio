/**
 * IPC handlers — exposes all SQLite query functions to the renderer process
 * Each handler maps to a 'db:*' channel
 */

const { ipcMain } = require('electron');
const queries = require('./database/queries.cjs');
const ossSync = require('./oss-sync.cjs');

function registerIpcHandlers() {
  // ── images ──────────────────────────────────────────────────────────
  ipcMain.handle('db:images:add',          (_e, image)             => queries.addImage(image));
  ipcMain.handle('db:images:update',       (_e, id, changes)       => queries.updateImage(id, changes));
  ipcMain.handle('db:images:delete',       (_e, id)                => queries.deleteImage(id));
  ipcMain.handle('db:images:deleteMany',   (_e, ids)               => queries.deleteImages(ids));
  ipcMain.handle('db:images:get',          (_e, id)                => queries.getImage(id));
  ipcMain.handle('db:images:list',         (_e, opts)              => queries.getImages(opts));
  ipcMain.handle('db:images:search',       (_e, keyword)           => queries.searchImages(keyword));
  ipcMain.handle('db:images:stats',        ()                      => queries.getImageStats());
  ipcMain.handle('db:images:toggleFavorite', (_e, id)              => queries.toggleImageFavorite(id));
  ipcMain.handle('db:images:move',         (_e, ids, folderId)     => queries.moveImages(ids, folderId));

  // ── batches ─────────────────────────────────────────────────────────
  ipcMain.handle('db:batches:add',         (_e, batch)             => queries.addBatch(batch));
  ipcMain.handle('db:batches:list',        (_e, sessionId)         => queries.getBatches(sessionId));

  // ── sessions ────────────────────────────────────────────────────────
  ipcMain.handle('db:sessions:add',        ()                      => queries.addSession());
  ipcMain.handle('db:sessions:list',       ()                      => queries.getSessions());

  // ── folders ─────────────────────────────────────────────────────────
  ipcMain.handle('db:folders:add',         (_e, folder)            => queries.addFolder(folder));
  ipcMain.handle('db:folders:list',        ()                      => queries.getFolders());
  ipcMain.handle('db:folders:update',      (_e, id, changes)       => queries.updateFolder(id, changes));
  ipcMain.handle('db:folders:delete',      (_e, id)                => queries.deleteFolder(id));

  // ── tasks ───────────────────────────────────────────────────────────
  ipcMain.handle('db:tasks:add',           (_e, task)              => queries.addTask(task));
  ipcMain.handle('db:tasks:update',        (_e, id, changes)       => queries.updateTask(id, changes));
  ipcMain.handle('db:tasks:list',          (_e, filter)            => queries.getTasks(filter));
  ipcMain.handle('db:tasks:delete',        (_e, id)                => queries.deleteTask(id));
  ipcMain.handle('db:tasks:stats',         ()                      => queries.getTaskStats());

  // ── settings ────────────────────────────────────────────────────────
  ipcMain.handle('db:settings:getAll',     ()                      => queries.getAllSettings());
  ipcMain.handle('db:settings:set',        (_e, key, value)        => queries.setSetting(key, value));
  ipcMain.handle('db:settings:get',        (_e, key)               => queries.getSetting(key));

  // ── casePackages ────────────────────────────────────────────────────
  ipcMain.handle('db:casePackages:add',    (_e, pkg)               => queries.addCasePackage(pkg));
  ipcMain.handle('db:casePackages:list',   ()                      => queries.getCasePackages());
  ipcMain.handle('db:casePackages:update', (_e, id, changes)       => queries.updateCasePackage(id, changes));
  ipcMain.handle('db:casePackages:delete', (_e, id)                => queries.deleteCasePackage(id));

  // ── OSS sync ─────────────────────────────────────────────────────────
  ipcMain.handle('oss:sync:trigger',  ()         => ossSync.triggerSync());
  ipcMain.handle('oss:sync:status',   ()         => ossSync.getSyncStatus());
  ipcMain.handle('oss:config:get',    ()         => ossSync.getOssConfig());
  ipcMain.handle('oss:config:set',    (_e, cfg)  => ossSync.setOssConfig(cfg));
}

module.exports = { registerIpcHandlers };
