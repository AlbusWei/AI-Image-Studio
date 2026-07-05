/**
 * migration.cjs — 一次性 IndexedDB → SQLite + 文件系统迁移
 *
 * 在 Electron 首次启动时自动检测 Dexie (IndexedDB) 中是否有数据，
 * 如有则逐表迁移到 SQLite，并将图片 Blob 写入文件系统。
 *
 * 约束：
 *   - 纯 main 进程操作 + webContents.executeJavaScript 读取 IDB
 *   - 迁移失败不阻止应用启动（整体 try/catch）
 *   - 迁移完成后保留 IndexedDB 数据作为回退
 */

const queries = require('./database/queries.cjs');
const { saveDatabase } = require('./database/index.cjs');

// ─── 常量 ────────────────────────────────────────────────────────────

const IDB_DB_NAME = 'AIImageStudio';
const IMAGE_BATCH_SIZE = 10;

// ─── 工具函数 ────────────────────────────────────────────────────────

/**
 * 通过 webContents.executeJavaScript 从 renderer 的 IndexedDB 读取所有表数据（不含 Blob）
 */
async function readIdbMetadata(wc) {
  return await wc.executeJavaScript(`(async () => {
    const DB_NAME = '${IDB_DB_NAME}';
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME);
      req.onerror = () => reject(new Error('IDB open failed'));
      req.onsuccess = async (e) => {
        const idb = e.target.result;
        const names = Array.from(idb.objectStoreNames);
        if (!names.length) { idb.close(); return resolve(null); }

        const data = {};
        for (const name of names) {
          data[name] = await new Promise((res, rej) => {
            const tx = idb.transaction(name, 'readonly');
            const store = tx.objectStore(name);
            const all = store.getAll();
            all.onsuccess = () => res(all.result || []);
            all.onerror = () => rej(all.error);
          });
        }
        idb.close();
        resolve(data);
      };
    });
  })()`);
}

/**
 * 从 IDB 读取单张图片的 imageBlob + thumbnailBlob，以 ArrayBuffer 形式传回
 * （ArrayBuffer 是 transferable，IPC 传输零拷贝）
 */
async function readImageBlobs(wc, imageId) {
  return await wc.executeJavaScript(`(async () => {
    const DB_NAME = '${IDB_DB_NAME}';
    return new Promise((resolve) => {
      const req = indexedDB.open(DB_NAME);
      req.onerror = () => resolve(null);
      req.onsuccess = (e) => {
        const idb = e.target.result;
        if (!idb.objectStoreNames.contains('images')) {
          idb.close(); return resolve(null);
        }
        const tx = idb.transaction('images', 'readonly');
        const store = tx.objectStore('images');
        const getReq = store.get(${imageId});
        getReq.onsuccess = () => {
          const img = getReq.result;
          idb.close();
          if (!img) return resolve(null);
          const result = {};
          const promises = [];
          if (img.imageBlob && img.imageBlob.size > 0) {
            promises.push(
              img.imageBlob.arrayBuffer().then(ab => { result.imageBuf = ab; })
            );
          }
          if (img.thumbnailBlob && img.thumbnailBlob.size > 0) {
            promises.push(
              img.thumbnailBlob.arrayBuffer().then(ab => { result.thumbBuf = ab; })
            );
          }
          Promise.all(promises).then(() => resolve(result));
        };
        getReq.onerror = () => { idb.close(); resolve(null); };
      };
    });
  })()`);
}

/**
 * 从图片对象中提取非索引字段，打包为 JSON 字符串（对应 SQLite images.data 列）
 */
const INDEXED_COLS = new Set([
  'id', 'batchId', 'folderId', 'model', 'prompt', 'favorite',
  'status', 'storageZone', 'filePath', 'thumbnailPath', 'blobSize',
  'width', 'height', 'sourceUrl', 'ossUrl', 'ossKey', 'taskId',
  'syncStatus', 'fileHash', 'createdAt',
  'imageBlob', 'thumbnailBlob'
]);

function packImageData(image) {
  const data = {};
  for (const key of Object.keys(image)) {
    if (!INDEXED_COLS.has(key)) {
      // Skip ArrayBuffer/blob-like values
      if (image[key] instanceof ArrayBuffer) continue;
      data[key] = image[key];
    }
  }
  return Object.keys(data).length > 0 ? JSON.stringify(data) : null;
}

/**
 * Sanitise a value for sql.js bind — objects/arrays become JSON strings,
 * undefined becomes null.
 */
function safeBind(v) {
  if (v === null || v === undefined) return null;
  const t = typeof v;
  if (t === 'number' || t === 'string') return v;
  if (t === 'boolean') return v ? 1 : 0;
  if (t === 'bigint') return Number(v);
  if (v instanceof Uint8Array || v instanceof ArrayBuffer) return v;
  try { return JSON.stringify(v); } catch (_) { return String(v); }
}

/**
 * 直接插入一条 images 记录（保留原始 ID，绕过 AUTOINCREMENT）
 */
function insertImageWithId(img) {
  const { getDb } = require('./database/index.cjs');
  const db = getDb();
  const dataJson = packImageData(img);

  db.run(`
    INSERT OR REPLACE INTO images
      (id, batchId, folderId, model, prompt, favorite, status, storageZone,
       filePath, thumbnailPath, blobSize, width, height,
       sourceUrl, ossUrl, ossKey, taskId, syncStatus, fileHash, createdAt, data)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    img.id,
    safeBind(img.batchId),
    safeBind(img.folderId),
    safeBind(img.model),
    img.prompt ?? '',
    img.favorite ? 1 : 0,
    img.status ?? 'completed',
    img.storageZone ?? 'hot',
    safeBind(img.filePath),
    safeBind(img.thumbnailPath),
    img.blobSize ?? 0,
    img.width ?? 0,
    img.height ?? 0,
    safeBind(img.sourceUrl),
    safeBind(img.ossUrl),
    safeBind(img.ossKey),
    safeBind(img.taskId),
    img.syncStatus ?? 'pending',
    safeBind(img.fileHash),
    img.createdAt ?? Date.now(),
    dataJson
  ]);
}

// ─── 主迁移流程 ──────────────────────────────────────────────────────

async function runMigration(mainWindow, getDb, fileManager) {
  const db = getDb();
  if (!db) return;

  // 1. 检查是否已完成迁移
  const marker = queries.getSetting('migration_complete');
  if (marker) {
    console.log('[Migration] Already completed, skipping');
    return;
  }

  const wc = mainWindow.webContents;

  try {
    console.log('[Migration] Checking IndexedDB for existing data...');

    // 2. 从 IDB 读取所有元数据（不含 Blob）
    const idb = await readIdbMetadata(wc);

    if (!idb) {
      console.log('[Migration] No IndexedDB data found, nothing to migrate');
      return;
    }

    const sessions     = idb.sessions     || [];
    const batches      = idb.batches      || [];
    const folders      = idb.folders      || [];
    const tasks        = idb.tasks        || [];
    const settings     = idb.settings     || [];
    const casePackages = idb.casePackages || [];
    const images       = idb.images       || [];

    const totalRecords = sessions.length + batches.length + folders.length
                       + tasks.length + settings.length + casePackages.length
                       + images.length;

    if (totalRecords === 0) {
      console.log('[Migration] IndexedDB is empty, nothing to migrate');
      return;
    }

    console.log(`[Migration] Found: ${images.length} images, ${batches.length} batches, ` +
      `${sessions.length} sessions, ${folders.length} folders, ${tasks.length} tasks, ` +
      `${settings.length} settings, ${casePackages.length} casePackages`);

    // ── 3. 迁移 sessions ──────────────────────────────────────────
    for (const s of sessions) {
      db.run('INSERT OR REPLACE INTO sessions (id, createdAt) VALUES (?, ?)',
        [s.id, s.createdAt ?? Date.now()]);
    }
    console.log(`[Migration] Migrated ${sessions.length} sessions`);

    // ── 4. 迁移 folders ───────────────────────────────────────────
    for (const f of folders) {
      db.run('INSERT OR REPLACE INTO folders (id, name, parentId, createdAt) VALUES (?, ?, ?, ?)',
        [f.id, f.name, f.parentId ?? null, f.createdAt ?? Date.now()]);
    }
    console.log(`[Migration] Migrated ${folders.length} folders`);

    // ── 5. 迁移 batches ───────────────────────────────────────────
    for (const b of batches) {
      db.run('INSERT OR REPLACE INTO batches (id, sessionId, model, prompt, createdAt) VALUES (?, ?, ?, ?, ?)',
        [b.id, b.sessionId ?? null, b.model ?? '', b.prompt ?? '', b.createdAt ?? Date.now()]);
    }
    console.log(`[Migration] Migrated ${batches.length} batches`);

    // ── 6. 迁移 images（分批，逐张处理 Blob）────────────────────
    let imagesProcessed = 0;

    for (let i = 0; i < images.length; i += IMAGE_BATCH_SIZE) {
      const batch = images.slice(i, i + IMAGE_BATCH_SIZE);

      for (const img of batch) {
        // 6a. 插入 SQLite 记录（保留原始 ID）
        insertImageWithId(img);

        // 6b. 从 IDB 读取该图片的 Blob 并写入文件系统
        try {
          const blobs = await readImageBlobs(wc, img.id);
          if (blobs) {
            if (blobs.imageBuf && blobs.imageBuf.byteLength > 0) {
              const mimeType = img.imageType || 'image/png';
              const filePath = await fileManager.saveImage(
                img.id, Buffer.from(blobs.imageBuf), mimeType
              );
              db.run('UPDATE images SET filePath = ?, blobSize = ? WHERE id = ?',
                [filePath, blobs.imageBuf.byteLength, img.id]);
            }
            if (blobs.thumbBuf && blobs.thumbBuf.byteLength > 0) {
              const thumbPath = await fileManager.saveThumbnail(
                img.id, Buffer.from(blobs.thumbBuf)
              );
              db.run('UPDATE images SET thumbnailPath = ? WHERE id = ?',
                [thumbPath, img.id]);
            }
          }
        } catch (blobErr) {
          console.warn(`[Migration] Failed to save blobs for image ${img.id}:`, blobErr.message);
        }

        imagesProcessed++;
      }

      // 每批持久化一次 SQLite
      saveDatabase();
      console.log(`[Migration] Images progress: ${imagesProcessed}/${images.length}`);
    }

    console.log(`[Migration] Migrated ${imagesProcessed} images`);

    // ── 7. 迁移 tasks（ID 转 string）─────────────────────────────
    for (const t of tasks) {
      const DATA_KEYS = ['params', 'error', 'result', 'errorDetails', 'subTasks'];
      const TASK_COLS = new Set(['id', 'type', 'status', 'model', 'prompt', 'progress', 'retryCount', 'createdAt']);
      const dataFields = {};

      for (const key of DATA_KEYS) {
        if (t[key] !== undefined) dataFields[key] = t[key];
      }
      for (const key of Object.keys(t)) {
        if (!TASK_COLS.has(key) && !DATA_KEYS.includes(key)) {
          dataFields[key] = t[key];
        }
      }
      const dataJson = Object.keys(dataFields).length > 0 ? JSON.stringify(dataFields) : null;

      db.run(`
        INSERT OR REPLACE INTO tasks (id, type, status, model, prompt, progress, retryCount, createdAt, data)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        String(t.id),
        t.type ?? '',
        t.status ?? 'queued',
        t.model ?? '',
        t.prompt ?? '',
        t.progress ?? 0,
        t.retryCount ?? 0,
        t.createdAt ?? Date.now(),
        dataJson
      ]);
    }
    console.log(`[Migration] Migrated ${tasks.length} tasks`);

    // ── 8. 迁移 settings ──────────────────────────────────────────
    // Dexie 存原始值，SQLite queries.setSetting 统一 JSON.stringify
    // 因此所有值都需要 JSON.stringify 一次以保持一致性
    for (const s of settings) {
      // 跳过迁移标记本身（后面会写入）
      if (s.key === 'migration_complete' || s.key === 'migration_date' || s.key === 'migration_stats') continue;
      db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
        [s.key, JSON.stringify(s.value)]);
    }
    console.log(`[Migration] Migrated ${settings.length} settings`);

    // ── 9. 迁移 casePackages ──────────────────────────────────────
    for (const pkg of casePackages) {
      const PKG_COLS = new Set(['id', 'imageId', 'createdAt']);
      const dataFields = {};
      for (const key of Object.keys(pkg)) {
        if (!PKG_COLS.has(key)) {
          dataFields[key] = pkg[key];
        }
      }
      const dataJson = Object.keys(dataFields).length > 0 ? JSON.stringify(dataFields) : null;

      db.run('INSERT OR REPLACE INTO casePackages (id, imageId, createdAt, data) VALUES (?, ?, ?, ?)',
        [pkg.id, pkg.imageId ?? null, pkg.createdAt ?? Date.now(), dataJson]);
    }
    console.log(`[Migration] Migrated ${casePackages.length} casePackages`);

    // ── 10. 标记迁移完成 ──────────────────────────────────────────
    queries.setSetting('migration_complete', true);
    queries.setSetting('migration_date', new Date().toISOString());
    queries.setSetting('migration_stats', {
      images: images.length,
      batches: batches.length,
      sessions: sessions.length,
      folders: folders.length,
      tasks: tasks.length,
      settings: settings.length,
      casePackages: casePackages.length
    });

    saveDatabase();
    console.log('[Migration] ✓ Migration completed successfully');

  } catch (err) {
    console.error('[Migration] Migration failed (app will continue normally):', err);
  }
}

module.exports = { runMigration };
