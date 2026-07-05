/**
 * SQLite query layer — mirrors all 30 export functions from src/db/database.js
 * Each write operation calls scheduleSave() for debounced persistence
 */

const { getDb, scheduleSave } = require('./index.cjs');

// ============================================================
// Helpers
// ============================================================

/**
 * Columns stored as top-level SQLite columns in the images table
 */
const IMAGE_INDEXED_COLS = [
  'id', 'batchId', 'folderId', 'model', 'prompt', 'favorite',
  'status', 'storageZone', 'filePath', 'thumbnailPath', 'blobSize',
  'width', 'height', 'sourceUrl', 'ossUrl', 'ossKey', 'taskId',
  'syncStatus', 'fileHash', 'createdAt'
];

/**
 * Fields packed into the JSON `data` column
 */
const IMAGE_DATA_FIELDS = [
  'params', 'tags', 'negativePrompt', 'imageType', 'style', 'quality',
  'seed', 'steps', 'cfgScale', 'aspectRatio', 'resolution',
  'referenceImages', 'maskDataUrl', 'maskBlob',
  'originalPrompt', 'expandedPrompt', 'apiResponseId',
  'cost', 'duration', 'errorCode'
];

/**
 * Pack non-indexed fields from an image object into a JSON string
 */
function packImageData(image) {
  const data = {};
  for (const key of IMAGE_DATA_FIELDS) {
    if (image[key] !== undefined) {
      // Skip blob-like values — they are handled by the file system layer
      if (key === 'maskBlob' && image[key] instanceof ArrayBuffer) continue;
      data[key] = image[key];
    }
  }
  // Also capture any extra unknown keys not in the indexed set
  for (const key of Object.keys(image)) {
    if (!IMAGE_INDEXED_COLS.includes(key) && !IMAGE_DATA_FIELDS.includes(key) && key !== 'imageBlob' && key !== 'thumbnailBlob') {
      data[key] = image[key];
    }
  }
  return Object.keys(data).length > 0 ? JSON.stringify(data) : null;
}

/**
 * Unpack a row from the images table: merge indexed cols + parsed data JSON
 */
function unpackImageRow(row) {
  if (!row) return null;
  const result = { ...row };
  // Convert favorite INTEGER → boolean
  result.favorite = !!result.favorite;
  // Parse and merge data JSON
  if (result.data) {
    try {
      const extra = JSON.parse(result.data);
      Object.assign(result, extra);
    } catch (_) { /* ignore parse errors */ }
  }
  delete result.data;
  return result;
}

/**
 * sql.js returns results as { columns: string[], values: any[][] }
 * Convert to array of plain objects
 */
function resultToObjects(stmt) {
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

/**
 * Build a dynamic UPDATE SET clause for the images table
 * Only updates columns that are present in `changes`
 */
function buildImageUpdateClauses(changes) {
  const indexedSets = [];
  const indexedVals = [];
  let dataMerge = null;

  for (const [key, value] of Object.entries(changes)) {
    if (IMAGE_INDEXED_COLS.includes(key) && key !== 'id') {
      indexedSets.push(`${key} = ?`);
      indexedVals.push(key === 'favorite' ? (value ? 1 : 0) : value);
    }
  }

  // Collect data-field changes to merge into JSON data column
  const dataChanges = {};
  let hasDataChanges = false;
  for (const [key, value] of Object.entries(changes)) {
    if (!IMAGE_INDEXED_COLS.includes(key) && key !== 'imageBlob' && key !== 'thumbnailBlob') {
      dataChanges[key] = value;
      hasDataChanges = true;
    }
  }
  if (hasDataChanges) {
    dataMerge = dataChanges;
  }

  return { indexedSets, indexedVals, dataMerge };
}

// ============================================================
// images
// ============================================================

function addImage(image) {
  const db = getDb();
  const now = Date.now();
  const dataJson = packImageData(image);

  const stmt = db.prepare(`
    INSERT INTO images
      (batchId, folderId, model, prompt, favorite, status, storageZone,
       filePath, thumbnailPath, blobSize, width, height,
       sourceUrl, ossUrl, ossKey, taskId, syncStatus, fileHash, createdAt, data)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run([
    image.batchId ?? null,
    image.folderId ?? null,
    image.model ?? null,
    image.prompt ?? '',
    image.favorite ? 1 : 0,
    image.status ?? 'completed',
    image.storageZone ?? 'hot',
    image.filePath ?? null,
    image.thumbnailPath ?? null,
    image.blobSize ?? 0,
    image.width ?? 0,
    image.height ?? 0,
    image.sourceUrl ?? null,
    image.ossUrl ?? null,
    image.ossKey ?? null,
    image.taskId ?? null,
    image.syncStatus ?? 'pending',
    image.fileHash ?? null,
    image.createdAt ?? now,
    dataJson
  ]);
  stmt.free();

  const idResult = db.exec('SELECT last_insert_rowid() as id');
  const newId = idResult[0].values[0][0];

  scheduleSave();
  return { id: newId, createdAt: image.createdAt ?? now };
}

function updateImage(id, changes) {
  const db = getDb();
  const { indexedSets, indexedVals, dataMerge } = buildImageUpdateClauses(changes);

  if (dataMerge) {
    // Need to read existing data, merge, then update
    const existingStmt = db.prepare('SELECT data FROM images WHERE id = ?');
    existingStmt.bind([id]);
    let existingData = {};
    if (existingStmt.step()) {
      const row = existingStmt.getAsObject();
      if (row.data) {
        try { existingData = JSON.parse(row.data); } catch (_) { /* ignore */ }
      }
    }
    existingStmt.free();

    const mergedData = { ...existingData, ...dataMerge };
    indexedSets.push('data = ?');
    indexedVals.push(JSON.stringify(mergedData));
  }

  if (indexedSets.length === 0) return;

  indexedVals.push(id);
  const sql = `UPDATE images SET ${indexedSets.join(', ')} WHERE id = ?`;
  db.run(sql, indexedVals);
  scheduleSave();
}

function deleteImage(id) {
  const db = getDb();
  db.run('DELETE FROM images WHERE id = ?', [id]);
  scheduleSave();
}

function deleteImages(ids) {
  if (!ids || ids.length === 0) return;
  const db = getDb();
  const placeholders = ids.map(() => '?').join(',');
  db.run(`DELETE FROM images WHERE id IN (${placeholders})`, ids);
  scheduleSave();
}

function getImage(id) {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM images WHERE id = ?');
  stmt.bind([id]);
  const rows = resultToObjects(stmt);
  return rows.length > 0 ? unpackImageRow(rows[0]) : null;
}

function getImages(opts = {}) {
  const db = getDb();
  const conditions = [];
  const params = [];

  if (opts.folderId !== undefined && opts.folderId !== null) {
    conditions.push('folderId = ?');
    params.push(opts.folderId);
  }
  if (opts.model) {
    conditions.push('model = ?');
    params.push(opts.model);
  }
  if (opts.favorite !== undefined) {
    conditions.push('favorite = ?');
    params.push(opts.favorite ? 1 : 0);
  }
  if (opts.status) {
    conditions.push('status = ?');
    params.push(opts.status);
  }
  if (opts.batchId !== undefined && opts.batchId !== null) {
    conditions.push('batchId = ?');
    params.push(opts.batchId);
  }
  if (opts.storageZone) {
    conditions.push('storageZone = ?');
    params.push(opts.storageZone);
  }

  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
  const orderBy = 'ORDER BY createdAt DESC';
  const limit = opts.limit ? `LIMIT ${parseInt(opts.limit, 10)}` : '';
  const offset = opts.offset ? `OFFSET ${parseInt(opts.offset, 10)}` : '';

  const sql = `SELECT * FROM images ${where} ${orderBy} ${limit} ${offset}`.trim();
  const stmt = db.prepare(sql);
  if (params.length > 0) stmt.bind(params);
  const rows = resultToObjects(stmt);
  return rows.map(unpackImageRow);
}

function searchImages(keyword) {
  if (!keyword || keyword.trim() === '') return [];
  const db = getDb();
  const pattern = `%${keyword}%`;
  const stmt = db.prepare(
    'SELECT * FROM images WHERE prompt LIKE ? OR data LIKE ? ORDER BY createdAt DESC LIMIT 100'
  );
  stmt.bind([pattern, pattern]);
  const rows = resultToObjects(stmt);
  return rows.map(unpackImageRow);
}

function getImageStats() {
  const db = getDb();
  const result = db.exec(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN favorite = 1 THEN 1 ELSE 0 END) as favorites,
      SUM(CASE WHEN storageZone = 'hot' THEN 1 ELSE 0 END) as hot,
      SUM(CASE WHEN storageZone = 'warm' THEN 1 ELSE 0 END) as warm,
      SUM(CASE WHEN storageZone = 'cold' THEN 1 ELSE 0 END) as cold,
      SUM(blobSize) as totalSize
    FROM images
  `);
  if (!result || result.length === 0) {
    return { total: 0, favorites: 0, hot: 0, warm: 0, cold: 0, totalSize: 0 };
  }
  const row = result[0].values[0];
  return {
    total: row[0] || 0,
    favorites: row[1] || 0,
    hot: row[2] || 0,
    warm: row[3] || 0,
    cold: row[4] || 0,
    totalSize: row[5] || 0
  };
}

function toggleImageFavorite(id) {
  const db = getDb();
  db.run('UPDATE images SET favorite = NOT favorite WHERE id = ?', [id]);
  scheduleSave();
  // Return the new state
  const result = db.exec('SELECT favorite FROM images WHERE id = ' + id);
  if (result && result[0].values.length > 0) {
    return !!result[0].values[0][0];
  }
  return false;
}

function moveImages(ids, folderId) {
  if (!ids || ids.length === 0) return;
  const db = getDb();
  const placeholders = ids.map(() => '?').join(',');
  db.run(
    `UPDATE images SET folderId = ? WHERE id IN (${placeholders})`,
    [folderId, ...ids]
  );
  scheduleSave();
}

// ============================================================
// batches
// ============================================================

function addBatch(batch) {
  const db = getDb();
  const now = Date.now();
  const stmt = db.prepare(
    'INSERT INTO batches (sessionId, model, prompt, createdAt) VALUES (?, ?, ?, ?)'
  );
  stmt.run([batch.sessionId ?? null, batch.model ?? '', batch.prompt ?? '', batch.createdAt ?? now]);
  stmt.free();

  const idResult = db.exec('SELECT last_insert_rowid() as id');
  const newId = idResult[0].values[0][0];
  scheduleSave();
  return { id: newId };
}

function getBatches(sessionId) {
  const db = getDb();
  let stmt;
  if (sessionId !== undefined && sessionId !== null) {
    stmt = db.prepare('SELECT * FROM batches WHERE sessionId = ? ORDER BY createdAt DESC');
    stmt.bind([sessionId]);
  } else {
    stmt = db.prepare('SELECT * FROM batches ORDER BY createdAt DESC');
  }
  return resultToObjects(stmt);
}

// ============================================================
// sessions
// ============================================================

function addSession() {
  const db = getDb();
  const now = Date.now();
  const stmt = db.prepare('INSERT INTO sessions (createdAt) VALUES (?)');
  stmt.run([now]);
  stmt.free();

  const idResult = db.exec('SELECT last_insert_rowid() as id');
  const newId = idResult[0].values[0][0];
  scheduleSave();
  return { id: newId, createdAt: now };
}

function getSessions() {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM sessions ORDER BY createdAt DESC');
  return resultToObjects(stmt);
}

// ============================================================
// folders
// ============================================================

function addFolder(folder) {
  const db = getDb();
  const now = Date.now();
  const stmt = db.prepare(
    'INSERT INTO folders (name, parentId, createdAt) VALUES (?, ?, ?)'
  );
  stmt.run([folder.name, folder.parentId ?? null, folder.createdAt ?? now]);
  stmt.free();

  const idResult = db.exec('SELECT last_insert_rowid() as id');
  const newId = idResult[0].values[0][0];
  scheduleSave();
  return { id: newId };
}

function getFolders() {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM folders ORDER BY name ASC');
  return resultToObjects(stmt);
}

function updateFolder(id, changes) {
  const db = getDb();
  const sets = [];
  const vals = [];
  for (const [key, value] of Object.entries(changes)) {
    if (['name', 'parentId'].includes(key)) {
      sets.push(`${key} = ?`);
      vals.push(value);
    }
  }
  if (sets.length === 0) return;
  vals.push(id);
  db.run(`UPDATE folders SET ${sets.join(', ')} WHERE id = ?`, vals);
  scheduleSave();
}

function deleteFolder(id) {
  const db = getDb();
  // Recursively collect child folder IDs
  const toDelete = [id];
  const collectChildren = (parentId) => {
    const result = db.exec(`SELECT id FROM folders WHERE parentId = ${parentId}`);
    if (result && result[0]) {
      for (const row of result[0].values) {
        toDelete.push(row[0]);
        collectChildren(row[0]);
      }
    }
  };
  collectChildren(id);

  const placeholders = toDelete.map(() => '?').join(',');
  // Unlink images in these folders (set folderId to null)
  db.run(
    `UPDATE images SET folderId = NULL WHERE folderId IN (${placeholders})`,
    [...toDelete]
  );
  db.run(`DELETE FROM folders WHERE id IN (${placeholders})`, toDelete);
  scheduleSave();
}

// ============================================================
// tasks
// ============================================================

function addTask(task) {
  const db = getDb();
  const now = Date.now();
  const dataFields = {};
  const DATA_KEYS = ['params', 'error', 'result', 'errorDetails', 'subTasks'];
  for (const key of DATA_KEYS) {
    if (task[key] !== undefined) dataFields[key] = task[key];
  }
  // Also capture any extra keys not in the schema columns
  const TASK_COLS = ['id', 'type', 'status', 'model', 'prompt', 'progress', 'retryCount', 'createdAt'];
  for (const key of Object.keys(task)) {
    if (!TASK_COLS.includes(key) && !DATA_KEYS.includes(key)) {
      dataFields[key] = task[key];
    }
  }
  const dataJson = Object.keys(dataFields).length > 0 ? JSON.stringify(dataFields) : null;

  db.run(`
    INSERT OR REPLACE INTO tasks (id, type, status, model, prompt, progress, retryCount, createdAt, data)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    task.id,
    task.type ?? '',
    task.status ?? 'queued',
    task.model ?? '',
    task.prompt ?? '',
    task.progress ?? 0,
    task.retryCount ?? 0,
    task.createdAt ?? now,
    dataJson
  ]);
  scheduleSave();
  return { id: task.id };
}

function updateTask(id, changes) {
  const db = getDb();
  const TASK_COLS = ['id', 'type', 'status', 'model', 'prompt', 'progress', 'retryCount', 'createdAt'];
  const indexedSets = [];
  const indexedVals = [];
  const dataChanges = {};
  let hasDataChanges = false;

  for (const [key, value] of Object.entries(changes)) {
    if (TASK_COLS.includes(key) && key !== 'id') {
      indexedSets.push(`${key} = ?`);
      indexedVals.push(value);
    } else if (key !== 'id') {
      dataChanges[key] = value;
      hasDataChanges = true;
    }
  }

  if (hasDataChanges) {
    // Read existing data
    const existingStmt = db.prepare('SELECT data FROM tasks WHERE id = ?');
    existingStmt.bind([id]);
    let existingData = {};
    if (existingStmt.step()) {
      const row = existingStmt.getAsObject();
      if (row.data) {
        try { existingData = JSON.parse(row.data); } catch (_) { /* ignore */ }
      }
    }
    existingStmt.free();
    const merged = { ...existingData, ...dataChanges };
    indexedSets.push('data = ?');
    indexedVals.push(JSON.stringify(merged));
  }

  if (indexedSets.length === 0) return;
  indexedVals.push(id);
  db.run(`UPDATE tasks SET ${indexedSets.join(', ')} WHERE id = ?`, indexedVals);
  scheduleSave();
}

function getTasks(filter = {}) {
  const db = getDb();
  const conditions = [];
  const params = [];

  if (filter.status) {
    conditions.push('status = ?');
    params.push(filter.status);
  }
  if (filter.type) {
    conditions.push('type = ?');
    params.push(filter.type);
  }

  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
  const sql = `SELECT * FROM tasks ${where} ORDER BY createdAt DESC`;
  const stmt = db.prepare(sql);
  if (params.length > 0) stmt.bind(params);

  const rows = resultToObjects(stmt);
  return rows.map(row => {
    const result = { ...row };
    if (result.data) {
      try { Object.assign(result, JSON.parse(result.data)); } catch (_) { /* ignore */ }
    }
    delete result.data;
    return result;
  });
}

function deleteTask(id) {
  const db = getDb();
  db.run('DELETE FROM tasks WHERE id = ?', [id]);
  scheduleSave();
}

function getTaskStats() {
  const db = getDb();
  const result = db.exec('SELECT status, COUNT(*) FROM tasks GROUP BY status');
  const stats = { total: 0, queued: 0, running: 0, completed: 0, failed: 0, cancelled: 0 };
  if (result && result[0]) {
    for (const row of result[0].values) {
      stats[row[0]] = row[1];
      stats.total += row[1];
    }
  }
  return stats;
}

// ============================================================
// settings (KV store)
// ============================================================

function getAllSettings() {
  const db = getDb();
  const stmt = db.prepare('SELECT key, value FROM settings');
  const rows = resultToObjects(stmt);
  const settings = {};
  for (const row of rows) {
    try {
      settings[row.key] = JSON.parse(row.value);
    } catch (_) {
      settings[row.key] = row.value;
    }
  }
  return settings;
}

function setSetting(key, value) {
  const db = getDb();
  db.run(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
    [key, JSON.stringify(value)]
  );
  scheduleSave();
}

function getSetting(key) {
  const db = getDb();
  const stmt = db.prepare('SELECT value FROM settings WHERE key = ?');
  stmt.bind([key]);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    try { return JSON.parse(row.value); } catch (_) { return row.value; }
  }
  stmt.free();
  return undefined;
}

// ============================================================
// casePackages (knowledge base)
// ============================================================

function addCasePackage(pkg) {
  const db = getDb();
  const now = Date.now();
  const dataFields = {};
  const DATA_KEYS = ['prompt', 'expandedPrompt', 'annotation', 'tags', 'params', 'imageUrl', 'notes', 'title'];
  for (const key of DATA_KEYS) {
    if (pkg[key] !== undefined) dataFields[key] = pkg[key];
  }
  // Also capture extra keys
  const PKG_COLS = ['id', 'imageId', 'createdAt'];
  for (const key of Object.keys(pkg)) {
    if (!PKG_COLS.includes(key) && !DATA_KEYS.includes(key)) {
      dataFields[key] = pkg[key];
    }
  }
  const dataJson = Object.keys(dataFields).length > 0 ? JSON.stringify(dataFields) : null;

  const stmt = db.prepare(
    'INSERT INTO casePackages (imageId, createdAt, data) VALUES (?, ?, ?)'
  );
  stmt.run([pkg.imageId ?? null, pkg.createdAt ?? now, dataJson]);
  stmt.free();

  const idResult = db.exec('SELECT last_insert_rowid() as id');
  const newId = idResult[0].values[0][0];
  scheduleSave();
  return { id: newId };
}

function getCasePackages() {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM casePackages ORDER BY createdAt DESC');
  const rows = resultToObjects(stmt);
  return rows.map(row => {
    const result = { ...row };
    if (result.data) {
      try { Object.assign(result, JSON.parse(result.data)); } catch (_) { /* ignore */ }
    }
    delete result.data;
    return result;
  });
}

function updateCasePackage(id, changes) {
  const db = getDb();
  const PKG_COLS = ['id', 'imageId', 'createdAt'];
  const indexedSets = [];
  const indexedVals = [];
  const dataChanges = {};
  let hasDataChanges = false;

  for (const [key, value] of Object.entries(changes)) {
    if (PKG_COLS.includes(key) && key !== 'id') {
      indexedSets.push(`${key} = ?`);
      indexedVals.push(value);
    } else if (key !== 'id') {
      dataChanges[key] = value;
      hasDataChanges = true;
    }
  }

  if (hasDataChanges) {
    const existingStmt = db.prepare('SELECT data FROM casePackages WHERE id = ?');
    existingStmt.bind([id]);
    let existingData = {};
    if (existingStmt.step()) {
      const row = existingStmt.getAsObject();
      if (row.data) {
        try { existingData = JSON.parse(row.data); } catch (_) { /* ignore */ }
      }
    }
    existingStmt.free();
    const merged = { ...existingData, ...dataChanges };
    indexedSets.push('data = ?');
    indexedVals.push(JSON.stringify(merged));
  }

  if (indexedSets.length === 0) return;
  indexedVals.push(id);
  db.run(`UPDATE casePackages SET ${indexedSets.join(', ')} WHERE id = ?`, indexedVals);
  scheduleSave();
}

function deleteCasePackage(id) {
  const db = getDb();
  db.run('DELETE FROM casePackages WHERE id = ?', [id]);
  scheduleSave();
}

module.exports = {
  // images
  addImage, updateImage, deleteImage, deleteImages,
  getImage, getImages, searchImages, getImageStats,
  toggleImageFavorite, moveImages,
  // batches
  addBatch, getBatches,
  // sessions
  addSession, getSessions,
  // folders
  addFolder, getFolders, updateFolder, deleteFolder,
  // tasks
  addTask, updateTask, getTasks, deleteTask, getTaskStats,
  // settings
  getAllSettings, setSetting, getSetting,
  // casePackages
  addCasePackage, getCasePackages, updateCasePackage, deleteCasePackage
};
