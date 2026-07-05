/**
 * OSS Sync Engine — 增量同步引擎
 *
 * 将本地生成的图片自动备份到阿里云 OSS。
 * - syncStatus 状态机：pending → uploading → synced / failed
 * - 每 5 分钟自动扫描待同步队列
 * - 相同 fileHash 已 synced 则跳过（去重）
 * - 失败项下次自动重试（最多 MAX_RETRIES 次）
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { getDb, scheduleSave } = require('./database/index.cjs');
const queries = require('./database/queries.cjs');

// ─── 常量 ──────────────────────────────────────────────────────────────────────
const SYNC_INTERVAL_MS = 5 * 60 * 1000;   // 5 分钟
const MAX_RETRIES      = 5;                // 最大重试次数
const MULTIPART_THRESH = 10 * 1024 * 1024; // 10 MB 以上走分片上传

let syncTimer   = null;
let isSyncing   = false;
let fileManager = null;

// ─── 工具函数 ──────────────────────────────────────────────────────────────────

/**
 * 计算文件 MD5 hash
 * @param {string} filePath
 * @returns {Promise<string|null>}
 */
function computeFileHash(filePath) {
  return new Promise((resolve) => {
    try {
      const hash = crypto.createHash('md5');
      const stream = fs.createReadStream(filePath);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', () => resolve(null));
    } catch (_) {
      resolve(null);
    }
  });
}

/**
 * 从 images 表中获取指定 syncStatus 的记录（原始行，包含 filePath）
 * @param {string} status
 * @returns {Array}
 */
function queryImagesBySyncStatus(status) {
  const db = getDb();
  if (!db) return [];
  const stmt = db.prepare(
    'SELECT id, filePath, fileHash, syncStatus, ossKey FROM images WHERE syncStatus = ? ORDER BY createdAt ASC'
  );
  stmt.bind([status]);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

/**
 * 获取所有已 synced 的 fileHash 集合（用于去重）
 * @returns {Set<string>}
 */
function getSyncedHashSet() {
  const db = getDb();
  if (!db) return new Set();
  const result = db.exec(
    "SELECT fileHash FROM images WHERE syncStatus = 'synced' AND fileHash IS NOT NULL"
  );
  const set = new Set();
  if (result && result[0]) {
    for (const row of result[0].values) {
      if (row[0]) set.add(row[0]);
    }
  }
  return set;
}

/**
 * 直接更新 images 行的同步相关字段（绕过 queries.updateImage 避免 JSON data 列读写开销）
 */
function updateSyncFields(id, fields) {
  const db = getDb();
  if (!db) return;
  const sets = [];
  const vals = [];
  for (const [key, value] of Object.entries(fields)) {
    sets.push(`${key} = ?`);
    // Defensive: sql.js only accepts primitives; JSON-stringify objects
    vals.push(value !== null && value !== undefined && typeof value === 'object'
      ? JSON.stringify(value) : (value ?? null));
  }
  if (sets.length === 0) return;
  vals.push(id);
  db.run(`UPDATE images SET ${sets.join(', ')} WHERE id = ?`, vals);
  scheduleSave();
}

/**
 * 增加 retryCount（存在 data JSON 字段中）
 */
function incrementRetryCount(id) {
  const db = getDb();
  if (!db) return;
  const stmt = db.prepare('SELECT data FROM images WHERE id = ?');
  stmt.bind([id]);
  let data = {};
  if (stmt.step()) {
    const row = stmt.getAsObject();
    if (row.data) {
      try { data = JSON.parse(row.data); } catch (_) { /* ignore */ }
    }
  }
  stmt.free();
  data.ossRetryCount = (data.ossRetryCount || 0) + 1;
  db.run('UPDATE images SET data = ? WHERE id = ?', [JSON.stringify(data), id]);
  scheduleSave();
  return data.ossRetryCount;
}

/**
 * 读取 retryCount
 */
function getRetryCount(id) {
  const db = getDb();
  if (!db) return 0;
  const stmt = db.prepare('SELECT data FROM images WHERE id = ?');
  stmt.bind([id]);
  let count = 0;
  if (stmt.step()) {
    const row = stmt.getAsObject();
    if (row.data) {
      try {
        const data = JSON.parse(row.data);
        count = data.ossRetryCount || 0;
      } catch (_) { /* ignore */ }
    }
  }
  stmt.free();
  return count;
}

// ─── OSS 配置 ──────────────────────────────────────────────────────────────────

/**
 * 读取 OSS 配置（从 settings 表，key='oss'）
 * @returns {Promise<object|null>}
 */
async function getOssConfig() {
  try {
    const config = queries.getSetting('oss');
    if (!config || typeof config !== 'object') return null;
    // 必须包含核心字段
    if (!config.region || !config.accessKeyId || !config.accessKeySecret || !config.bucket) {
      return null;
    }
    return config;
  } catch (_) {
    return null;
  }
}

/**
 * 保存 OSS 配置
 * @param {object} config - { region, accessKeyId, accessKeySecret, bucket, prefix }
 */
async function setOssConfig(config) {
  queries.setSetting('oss', config);
}

/**
 * 创建 ali-oss 客户端实例
 * @param {object} config
 * @returns {import('ali-oss')}
 */
function createOssClient(config) {
  const OSS = require('ali-oss');
  return new OSS({
    region:          config.region,
    accessKeyId:     config.accessKeyId,
    accessKeySecret: config.accessKeySecret,
    bucket:          config.bucket,
    secure:          true,
    timeout:         60 * 1000, // 60s
  });
}

// ─── 上传逻辑 ──────────────────────────────────────────────────────────────────

/**
 * 上传单个文件到 OSS
 * @param {object} client  - ali-oss 客户端
 * @param {string} ossKey  - OSS 对象 key
 * @param {string} filePath - 本地文件路径
 * @returns {Promise<{url: string}>}
 */
async function uploadFile(client, ossKey, filePath) {
  const fileSize = fs.statSync(filePath).size;

  if (fileSize > MULTIPART_THRESH) {
    // 大文件走分片上传（断点续传可选）
    const result = await client.multipartUpload(ossKey, filePath, {
      partSize: 2 * 1024 * 1024, // 2 MB 分片
      parallel: 4,
    });
    return { url: result.res?.requestUrls?.[0] || `oss://${ossKey}` };
  }

  const result = await client.put(ossKey, filePath);
  return { url: result.url || result.res?.requestUrls?.[0] || `oss://${ossKey}` };
}

/**
 * 根据本地 filePath 推导扩展名
 */
function getExtFromPath(filePath) {
  if (!filePath) return 'png';
  const ext = path.extname(filePath).replace('.', '').toLowerCase();
  return ['png', 'jpg', 'jpeg', 'webp'].includes(ext) ? ext : 'png';
}

// ─── 同步核心 ──────────────────────────────────────────────────────────────────

/**
 * 执行一轮增量同步
 * @returns {Promise<{uploaded: number, failed: number, skipped: number}>}
 */
async function runSyncRound() {
  const result = { uploaded: 0, failed: 0, skipped: 0 };

  // 1. 读取 OSS 配置
  const config = await getOssConfig();
  if (!config) {
    // 无配置，静默跳过
    return result;
  }

  // 2. 获取待同步记录
  const pendingRows = queryImagesBySyncStatus('pending');
  // 同时收集 failed 但 retryCount < MAX_RETRIES 的记录
  const failedRows = queryImagesBySyncStatus('failed').filter((row) => {
    const retries = getRetryCount(row.id);
    return retries < MAX_RETRIES;
  });

  const allRows = [...pendingRows, ...failedRows];
  if (allRows.length === 0) return result;

  // 3. 获取已同步 hash 集合（去重）
  const syncedHashes = getSyncedHashSet();

  // 4. 创建 OSS 客户端
  let client;
  try {
    client = createOssClient(config);
  } catch (err) {
    console.error('[OssSync] Failed to create OSS client:', err.message);
    return result;
  }

  const prefix = config.prefix ? config.prefix.replace(/\/+$/, '') : 'ai-image-studio';

  // 5. 逐条处理
  for (const row of allRows) {
    const { id, filePath: dbFilePath } = row;

    try {
      // 解析本地文件路径（优先用 DB 记录的 filePath，其次用 fileManager 查找）
      let localPath = dbFilePath;
      if (!localPath || !fs.existsSync(localPath)) {
        if (fileManager) {
          localPath = fileManager.getImagePath(id);
        }
        if (!localPath || !fs.existsSync(localPath)) {
          // 文件不存在，标记失败
          updateSyncFields(id, { syncStatus: 'failed' });
          result.failed++;
          continue;
        }
      }

      // 计算文件 hash
      const hash = await computeFileHash(localPath);
      if (!hash) {
        updateSyncFields(id, { syncStatus: 'failed' });
        result.failed++;
        continue;
      }

      // 去重：如果相同 hash 已经 synced，直接标记
      if (syncedHashes.has(hash)) {
        updateSyncFields(id, { syncStatus: 'synced', fileHash: hash });
        result.skipped++;
        continue;
      }

      // 标记 uploading
      updateSyncFields(id, { syncStatus: 'uploading', fileHash: hash });

      // 构建 OSS key
      const ext = getExtFromPath(localPath);
      const ossKey = `${prefix}/${id}.${ext}`;

      // 上传
      const uploadResult = await uploadFile(client, ossKey, localPath);

      // 上传成功
      updateSyncFields(id, {
        syncStatus: 'synced',
        ossKey:     ossKey,
        ossUrl:     uploadResult.url || null,
        fileHash:   hash,
      });
      syncedHashes.add(hash); // 加入去重集合
      result.uploaded++;

    } catch (err) {
      console.error(`[OssSync] Upload failed for image ${id}:`, err.message);
      updateSyncFields(id, { syncStatus: 'failed' });
      incrementRetryCount(id);
      result.failed++;
    }
  }

  return result;
}

// ─── 对外接口 ──────────────────────────────────────────────────────────────────

/**
 * 初始化定时同步
 * @param {Function} getDbFn   - 获取 DB 实例的函数（保留兼容，实际直接 require）
 * @param {object}   fm       - FileManager 实例
 */
function initOssSync(getDbFn, fm) {
  fileManager = fm || null;
  console.log('[OssSync] Initialized, interval:', SYNC_INTERVAL_MS / 1000, 's');

  // 启动时立即跑一轮（延迟 10s 等系统稳定）
  setTimeout(() => {
    triggerSync().catch((err) =>
      console.error('[OssSync] Initial sync failed:', err.message)
    );
  }, 10_000);

  // 定时触发
  if (syncTimer) clearInterval(syncTimer);
  syncTimer = setInterval(() => {
    triggerSync().catch((err) =>
      console.error('[OssSync] Periodic sync failed:', err.message)
    );
  }, SYNC_INTERVAL_MS);
}

/**
 * 手动触发一次同步（防并发）
 * @returns {Promise<{uploaded: number, failed: number, skipped: number}>}
 */
async function triggerSync() {
  if (isSyncing) {
    console.log('[OssSync] Sync already in progress, skipping');
    return { uploaded: 0, failed: 0, skipped: 0 };
  }
  isSyncing = true;
  try {
    const result = await runSyncRound();
    if (result.uploaded > 0 || result.failed > 0 || result.skipped > 0) {
      console.log('[OssSync] Round complete:', result);
    }
    return result;
  } finally {
    isSyncing = false;
  }
}

/**
 * 获取同步状态统计
 * @returns {Promise<{pending: number, uploading: number, synced: number, failed: number, total: number}>}
 */
async function getSyncStatus() {
  const db = getDb();
  if (!db) {
    return { pending: 0, uploading: 0, synced: 0, failed: 0, total: 0 };
  }

  const result = db.exec(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN syncStatus = 'pending'   THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN syncStatus = 'uploading' THEN 1 ELSE 0 END) as uploading,
      SUM(CASE WHEN syncStatus = 'synced'    THEN 1 ELSE 0 END) as synced,
      SUM(CASE WHEN syncStatus = 'failed'    THEN 1 ELSE 0 END) as failed
    FROM images
  `);

  if (!result || result.length === 0) {
    return { pending: 0, uploading: 0, synced: 0, failed: 0, total: 0 };
  }

  const row = result[0].values[0];
  return {
    total:     row[0] || 0,
    pending:   row[1] || 0,
    uploading: row[2] || 0,
    synced:    row[3] || 0,
    failed:    row[4] || 0,
  };
}

/**
 * 停止定时器
 */
function stopOssSync() {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
    console.log('[OssSync] Stopped');
  }
}

// ─── 网络恢复重试 ──────────────────────────────────────────────────────────────

/**
 * 当网络恢复时触发同步（由 main 进程 online 事件调用）
 */
function onNetworkResume() {
  console.log('[OssSync] Network resumed, triggering sync');
  triggerSync().catch((err) =>
    console.error('[OssSync] Network-resume sync failed:', err.message)
  );
}

module.exports = {
  initOssSync,
  triggerSync,
  getSyncStatus,
  getOssConfig,
  setOssConfig,
  stopOssSync,
  onNetworkResume,
};
