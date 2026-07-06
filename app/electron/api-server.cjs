/**
 * API Server — Electron main 进程内嵌 HTTP 代理服务器
 *
 * 将 Vite dev server 的 API proxy 中间件迁移到 Electron main 进程，
 * 生产环境不再依赖 Vite dev server。
 *
 * 路由：
 *   /api/qwen/*        → Qwen DashScope API
 *   /api/evolink/*     → EvoLink API (GPT-image-2, Nano Banana 2)
 *   /api/oss/*         → 阿里云 OSS
 *   /api/llm/*         → Expansion LLM (DashScope compatible)
 *   /api/proxy-image   → 外部图片 CORS 代理
 *   /api/db/*          → SQLite database REST API
 */

const http = require('http');
const path = require('path');
const dotenv = require('dotenv');
const sharp = (() => { try { return require('sharp'); } catch { return null; } })();

// ─── 加载 .env ────────────────────────────────────────────────────────
// 多候选路径策略：兼容 Electron / CLI / 打包后等各种运行环境
const fs = require('fs');
const envCandidates = [
  path.join(__dirname, '.env'),
  path.join(__dirname, '..', '.env'),
  path.join(__dirname, '..', 'app', '.env'),
  path.join(__dirname, 'app', '.env'),
];
// Electron 环境时追加 app.getAppPath()
if (process.versions.electron) {
  const electronApp = require('electron').app;
  if (electronApp && typeof electronApp.getAppPath === 'function') {
    envCandidates.unshift(path.join(electronApp.getAppPath(), '.env'));
  }
}
let envPath;
for (const p of envCandidates) {
  if (fs.existsSync(p)) { envPath = p; break; }
}
if (!envPath) envPath = envCandidates[1]; // fallback

const envResult = dotenv.config({ path: envPath });
const env = envResult.parsed || {};

// ─── 诊断日志 ──────────────────────────────────────────────────────
console.log('[api-server][DIAG] __dirname:', __dirname);
console.log('[api-server][DIAG] envPath:', envPath);
console.log('[api-server][DIAG] candidates checked:', envCandidates.join(', '));
console.log('[api-server][DIAG] dotenv parsed VITE_QWEN_API_BASE:', JSON.stringify(env.VITE_QWEN_API_BASE));
// API Key 脱敏：只显示前 4 位
const _maskedKey = env.VITE_QWEN_API_KEY ? env.VITE_QWEN_API_KEY.slice(0, 4) + '***' : '(MISSING)';
console.log('[api-server][DIAG] dotenv parsed VITE_QWEN_API_KEY:', _maskedKey);
if (envResult.error) {
  console.error('[api-server][DIAG] dotenv error:', envResult.error.message);
}
console.log('[api-server][DIAG] all env keys:', Object.keys(env).filter(k => k.startsWith('VITE_')).join(', ') || '(none)');
// ────────────────────────────────────────────────────────────────

const QWEN_API_KEY = (env.VITE_QWEN_API_KEY || '').trim();
const QWEN_API_BASE = (env.VITE_QWEN_API_BASE || '').trim();
const EVOLINK_API_KEY = (env.VITE_EVOLINK_API_KEY || '').trim();
const EVOLINK_API_BASE = (env.VITE_EVOLINK_API_BASE || '').trim();
const OSS_ACCESS_KEY_ID = (env.VITE_OSS_ACCESS_KEY_ID || '').trim();
const OSS_ACCESS_KEY_SECRET = (env.VITE_OSS_ACCESS_KEY_SECRET || '').trim();
const OSS_BUCKET = (env.VITE_OSS_BUCKET || '').trim();
const OSS_REGION = (env.VITE_OSS_REGION || '').trim();
const LLM_KEY = (env.VITE_EXPANSION_LLM_KEY || '').trim();
const LLM_BASE = (env.VITE_EXPANSION_LLM_BASE || '').trim();

// ─── 启动时校验 ──────────────────────────────────────────────────────
if (!QWEN_API_BASE) {
  console.error('[api-server][ERROR] VITE_QWEN_API_BASE is EMPTY after dotenv!');
  console.error('[api-server][ERROR] envPath =', envPath);
  console.error('[api-server][ERROR] Please verify .env file exists and contains VITE_QWEN_API_BASE');
}
if (!QWEN_API_KEY) {
  console.error('[api-server][ERROR] VITE_QWEN_API_KEY is EMPTY after dotenv!');
}
// ────────────────────────────────────────────────────────────────────

// ─── 工具函数 ─────────────────────────────────────────────────────────

/**
 * 读取请求体为 Buffer。
 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/**
 * 读取请求体并解析为 JSON。
 */
async function readJson(req) {
  const buf = await readBody(req);
  if (buf.length === 0) return {};
  return JSON.parse(buf.toString('utf-8'));
}

/**
 * 发送 JSON 响应。
 */
function sendJson(res, data, status = 200) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

/**
 * 发送错误响应。
 */
function sendError(res, err, status = 500) {
  console.error('[api-server][db] Error:', err.message || err);
  sendJson(res, { error: err.message || String(err) }, status);
}

/**
 * 拼接 base + remaining path，确保只有一个 `/` 分隔。
 */
function buildTargetUrl(base, remainingPath) {
  if (!base) {
    throw new Error(`[api-server] buildTargetUrl: base is empty! Cannot construct URL for path "${remainingPath}". Check that the corresponding environment variable is set in .env at ${envPath}.`);
  }
  const cleanBase = base.replace(/\/+$/, '');
  const cleanPath = remainingPath.startsWith('/') ? remainingPath : '/' + remainingPath;
  return cleanBase + cleanPath;
}

/**
 * 通用代理：将请求转发到 targetUrl，注入额外 headers，回传响应。
 */
async function proxyRequest(req, res, targetUrl, extraHeaders = {}) {
  console.log('[api-server] →', req.method, targetUrl);
  try {
    const method = req.method;
    const body = ['POST', 'PUT', 'PATCH'].includes(method)
      ? await readBody(req)
      : undefined;

    // 构建请求头：保留 content-type，注入额外头
    const headers = { ...extraHeaders };
    if (req.headers['content-type']) {
      headers['Content-Type'] = req.headers['content-type'];
    }
    if (body) {
      headers['Content-Length'] = body.length;
      console.log('[api-server] Request body size:', body.length, 'bytes');
    }

    console.log('[api-server] Headers:', Object.keys(headers).join(', '));

    const response = await fetch(targetUrl, { method, headers, body });

    console.log('[api-server] ← Response status:', response.status);

    // 回传状态码与响应头
    res.statusCode = response.status;
    const skipHeaders = [
      'transfer-encoding',
      'connection',
      'access-control-allow-origin',
      // fetch 自动解压了 body，不能再转发 content-encoding
      'content-encoding',
      // 解压后 content-length 不对，让客户端自行处理
      'content-length',
    ];
    response.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (!skipHeaders.includes(lower)) {
        res.setHeader(key, value);
      }
    });
    console.log('[api-server] Content-Type:', response.headers.get('content-type'));

    // 回传 body（已被 fetch 解压）
    const arrayBuffer = await response.arrayBuffer();
    const responseBody = Buffer.from(arrayBuffer);
    console.log('[api-server] Response size:', responseBody.length, 'bytes');
    res.end(responseBody);
  } catch (err) {
    console.error(`[api-server] ✗ Error proxying ${req.method} ${targetUrl}:`, err.message);
    console.error('[api-server] Error stack:', err.stack);
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Proxy error', message: err.message }));
  }
}

// ─── 路由处理 ─────────────────────────────────────────────────────────

/**
 * 从 req.url 中提取查询字符串之后的路径部分。
 */
function parsePath(rawUrl) {
  const qIdx = rawUrl.indexOf('?');
  return qIdx === -1 ? rawUrl : rawUrl.substring(0, qIdx);
}

/**
 * 匹配路由前缀，返回去掉前缀后的剩余路径（含查询字符串）。
 * 例: matchRoute('/api/qwen/foo?bar=1', '/api/qwen') → '/foo?bar=1'
 *      matchRoute('/api/qwen', '/api/qwen') → '/'
 */
function matchRoute(rawUrl, prefix) {
  const urlPath = parsePath(rawUrl);
  if (urlPath === prefix || urlPath === prefix + '/') {
    const query = rawUrl.includes('?') ? rawUrl.substring(rawUrl.indexOf('?')) : '';
    return '/' + query;
  }
  if (urlPath.startsWith(prefix + '/')) {
    return rawUrl.substring(prefix.length);
  }
  return null;
}

/**
 * 从路径中提取 :id 参数（数字）。
 * 例: extractIdFromPath('/images/file/42', '/images/file/') → 42
 */
function extractIdFromPath(path, prefix) {
  const rest = path.slice(prefix.length);
  const id = parseInt(rest, 10);
  return isNaN(id) ? null : id;
}

// ─── DB API 路由 ───────────────────────────────────────────────────────

/**
 * 创建 DB API 路由处理器。
 * @param {object} queries - queries.cjs 导出的函数集合
 * @param {object} fileManager - FileManager 实例
 * @returns {function} handleDbRequest 函数
 */
/**
 * 从图片行中清理 blob: URL。
 * blob: URL 是浏览器内存中的临时 URL，跨会话无效。
 * 持久化到 SQLite data JSON 列后会在下次加载时返回过期 URL，
 * 导致 http-backend 误以为已有有效缩略图而跳过加载。
 */
function sanitizeImageRow(row) {
  if (row.blobUrl && row.blobUrl.startsWith('blob:')) delete row.blobUrl;
  if (row.thumbnailUrl && row.thumbnailUrl.startsWith('blob:')) delete row.thumbnailUrl;
  return row;
}

function createDbRouter(queries, fileManager) {

  async function handleDbRequest(req, res) {
    const urlPath = parsePath(req.url);
    const method = req.method;

    try {
      // ── Images ──────────────────────────────────────────────────────

      if (urlPath === '/api/db/images/add' && method === 'POST') {
        const body = await readJson(req);
        const result = queries.addImage(body.image || body);
        const id = typeof result === 'number' ? result : result.id;
        return sendJson(res, { id });
      }

      if (urlPath === '/api/db/images/update' && method === 'POST') {
        const { id, changes } = await readJson(req);
        const result = queries.updateImage(id, changes);
        return sendJson(res, result ?? { ok: true });
      }

      if (urlPath === '/api/db/images/delete' && method === 'POST') {
        const { id } = await readJson(req);
        const result = queries.deleteImage(id);
        // 同时删除文件
        if (fileManager) {
          try { await fileManager.deleteImage(id); } catch (_) {}
        }
        return sendJson(res, result ?? { ok: true });
      }

      if (urlPath === '/api/db/images/deleteMany' && method === 'POST') {
        const { ids } = await readJson(req);
        const result = queries.deleteImages(ids);
        if (fileManager) {
          try { await fileManager.deleteImages(ids); } catch (_) {}
        }
        return sendJson(res, result ?? { ok: true });
      }

      if (urlPath.startsWith('/api/db/images/get/') && method === 'GET') {
        const id = parseInt(urlPath.slice('/api/db/images/get/'.length), 10);
        if (isNaN(id)) return sendJson(res, { error: 'Invalid id' }, 400);
        const row = queries.getImage(id);
        if (!row) return sendJson(res, { error: 'Not found' }, 404);
        sanitizeImageRow(row);
        // 标记是否有文件（供客户端决定是否下载 blob）
        row.hasImage = !!(fileManager && fileManager.getImagePath(id));
        row.hasThumbnail = !!(fileManager && fileManager.getThumbnailPath(id));
        return sendJson(res, row);
      }

      if (urlPath === '/api/db/images/list' && method === 'POST') {
        const { opts } = await readJson(req);
        const rows = queries.getImages(opts || {});
        // Clean stale blob: URLs and attach hasImage / hasThumbnail flags
        // so the client knows whether binary files exist on disk.
        for (const row of rows) {
          sanitizeImageRow(row);
          if (fileManager) {
            row.hasImage = !!fileManager.getImagePath(row.id);
            row.hasThumbnail = !!fileManager.getThumbnailPath(row.id);
          }
        }
        return sendJson(res, rows);
      }

      if (urlPath === '/api/db/images/search' && method === 'POST') {
        const { keyword } = await readJson(req);
        const rows = queries.searchImages(keyword);
        for (const row of rows) sanitizeImageRow(row);
        return sendJson(res, rows);
      }

      if (urlPath === '/api/db/images/stats' && method === 'GET') {
        const stats = queries.getImageStats();
        return sendJson(res, stats);
      }

      if (urlPath === '/api/db/images/toggleFavorite' && method === 'POST') {
        const { id } = await readJson(req);
        const result = queries.toggleImageFavorite(id);
        return sendJson(res, result ?? { ok: true });
      }

      if (urlPath === '/api/db/images/move' && method === 'POST') {
        const { ids, folderId } = await readJson(req);
        const result = queries.moveImages(ids, folderId);
        return sendJson(res, result ?? { ok: true });
      }

      // ── Image file upload (PUT raw binary) ──────────────────────────

      if (urlPath.startsWith('/api/db/images/file/') && method === 'PUT') {
        const id = parseInt(urlPath.slice('/api/db/images/file/'.length), 10);
        if (isNaN(id)) return sendJson(res, { error: 'Invalid id' }, 400);
        if (!fileManager) return sendJson(res, { error: 'FileManager not available' }, 503);
        const buf = await readBody(req);
        const mime = req.headers['content-type'] || 'image/png';
        await fileManager.saveImage(id, buf, mime);
        return sendJson(res, { ok: true, size: buf.length });
      }

      if (urlPath.startsWith('/api/db/images/thumbnail/') && method === 'PUT') {
        const id = parseInt(urlPath.slice('/api/db/images/thumbnail/'.length), 10);
        if (isNaN(id)) return sendJson(res, { error: 'Invalid id' }, 400);
        if (!fileManager) return sendJson(res, { error: 'FileManager not available' }, 503);
        const buf = await readBody(req);
        await fileManager.saveThumbnail(id, buf);
        return sendJson(res, { ok: true, size: buf.length });
      }

      // ── Image file download (GET binary) ────────────────────────────

      if (urlPath.startsWith('/api/db/images/file/') && method === 'GET') {
        const id = parseInt(urlPath.slice('/api/db/images/file/'.length), 10);
        if (isNaN(id)) return sendJson(res, { error: 'Invalid id' }, 400);
        if (!fileManager) return sendJson(res, { error: 'FileManager not available' }, 503);
        const result = await fileManager.readImage(id);
        if (!result) return sendJson(res, { error: 'File not found' }, 404);
        res.statusCode = 200;
        res.setHeader('Content-Type', result.mimeType || 'image/png');
        res.setHeader('Content-Length', result.buffer.length);
        return res.end(result.buffer);
      }

      if (urlPath.startsWith('/api/db/images/thumbnail/') && method === 'GET') {
        const id = parseInt(urlPath.slice('/api/db/images/thumbnail/'.length), 10);
        if (isNaN(id)) return sendJson(res, { error: 'Invalid id' }, 400);
        if (!fileManager) return sendJson(res, { error: 'FileManager not available' }, 503);
        const result = await fileManager.readThumbnail(id);
        if (!result) return sendJson(res, { error: 'Thumbnail not found' }, 404);
        res.statusCode = 200;
        res.setHeader('Content-Type', result.mimeType || 'image/jpeg');
        res.setHeader('Content-Length', result.buffer.length);
        return res.end(result.buffer);
      }

      // ── Thumbnail auto-generation ────────────────────────────────────
      // Generate a thumbnail from the original image if one doesn't exist.
      // Used by the http-backend to fill missing thumbnails on-the-fly.
      if (urlPath.startsWith('/api/db/images/generateThumbnail/') && method === 'POST') {
        const id = parseInt(urlPath.slice('/api/db/images/generateThumbnail/'.length), 10);
        if (isNaN(id)) return sendJson(res, { error: 'Invalid id' }, 400);
        if (!fileManager) return sendJson(res, { error: 'FileManager not available' }, 503);
        // Check if thumbnail already exists
        if (fileManager.getThumbnailPath(id)) {
          return sendJson(res, { ok: true, alreadyExists: true });
        }
        // Read original image
        const original = await fileManager.readImage(id);
        if (!original) return sendJson(res, { error: 'Original image not found' }, 404);
        if (!sharp) {
          // sharp not available — copy original as thumbnail (suboptimal but functional)
          await fileManager.saveThumbnail(id, original.buffer);
          return sendJson(res, { ok: true, fallback: 'copy' });
        }
        try {
          const thumbBuffer = await sharp(original.buffer)
            .resize(200, 200, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 80 })
            .toBuffer();
          await fileManager.saveThumbnail(id, thumbBuffer);
          return sendJson(res, { ok: true, size: thumbBuffer.length });
        } catch (err) {
          console.error('[api-server] Thumbnail generation failed:', err.message);
          return sendJson(res, { error: err.message }, 500);
        }
      }

      // ── Batches ─────────────────────────────────────────────────────

      if (urlPath === '/api/db/batches/add' && method === 'POST') {
        const body = await readJson(req);
        const result = queries.addBatch(body.batch || body);
        const id = typeof result === 'number' ? result : result.id;
        return sendJson(res, { id });
      }

      if (urlPath === '/api/db/batches/list' && method === 'POST') {
        const { sessionId } = await readJson(req);
        const rows = queries.getBatches(sessionId ?? null);
        return sendJson(res, rows);
      }

      // ── Sessions ────────────────────────────────────────────────────

      if (urlPath === '/api/db/sessions/add' && method === 'POST') {
        const result = queries.addSession();
        const id = typeof result === 'number' ? result : result.id;
        return sendJson(res, { id });
      }

      if (urlPath === '/api/db/sessions/list' && method === 'GET') {
        const rows = queries.getSessions();
        return sendJson(res, rows);
      }

      // ── Folders ─────────────────────────────────────────────────────

      if (urlPath === '/api/db/folders/add' && method === 'POST') {
        const body = await readJson(req);
        const result = queries.addFolder(body.folder || body);
        const id = typeof result === 'number' ? result : result.id;
        return sendJson(res, { id });
      }

      if (urlPath === '/api/db/folders/list' && method === 'GET') {
        const rows = queries.getFolders();
        return sendJson(res, rows);
      }

      if (urlPath === '/api/db/folders/update' && method === 'POST') {
        const { id, changes } = await readJson(req);
        const result = queries.updateFolder(id, changes);
        return sendJson(res, result ?? { ok: true });
      }

      if (urlPath === '/api/db/folders/delete' && method === 'POST') {
        const { id } = await readJson(req);
        const result = queries.deleteFolder(id);
        return sendJson(res, result ?? { ok: true });
      }

      // ── Tasks ───────────────────────────────────────────────────────

      if (urlPath === '/api/db/tasks/add' && method === 'POST') {
        const body = await readJson(req);
        const result = queries.addTask(body.task || body);
        const id = typeof result === 'number' ? result : result.id;
        return sendJson(res, { id });
      }

      if (urlPath === '/api/db/tasks/update' && method === 'POST') {
        const { id, changes } = await readJson(req);
        const result = queries.updateTask(id, changes);
        return sendJson(res, result ?? { ok: true });
      }

      if (urlPath === '/api/db/tasks/list' && method === 'POST') {
        const { filter } = await readJson(req);
        const rows = queries.getTasks(filter || {});
        return sendJson(res, rows);
      }

      if (urlPath === '/api/db/tasks/delete' && method === 'POST') {
        const { id } = await readJson(req);
        const result = queries.deleteTask(id);
        return sendJson(res, result ?? { ok: true });
      }

      if (urlPath === '/api/db/tasks/stats' && method === 'GET') {
        const stats = queries.getTaskStats();
        return sendJson(res, stats);
      }

      // ── Settings ────────────────────────────────────────────────────

      if (urlPath === '/api/db/settings/getAll' && method === 'GET') {
        const settings = queries.getAllSettings();
        return sendJson(res, settings);
      }

      if (urlPath === '/api/db/settings/set' && method === 'POST') {
        const { key, value } = await readJson(req);
        const result = queries.setSetting(key, value);
        return sendJson(res, result ?? { ok: true });
      }

      if (urlPath.startsWith('/api/db/settings/get/') && method === 'GET') {
        const key = decodeURIComponent(urlPath.slice('/api/db/settings/get/'.length));
        const value = queries.getSetting(key);
        return sendJson(res, { key, value: value !== undefined ? value : null });
      }

      // ── Case Packages ───────────────────────────────────────────────

      if (urlPath === '/api/db/casePackages/add' && method === 'POST') {
        const body = await readJson(req);
        const result = queries.addCasePackage(body.pkg || body);
        const id = typeof result === 'number' ? result : result.id;
        return sendJson(res, { id });
      }

      if (urlPath === '/api/db/casePackages/list' && method === 'GET') {
        const rows = queries.getCasePackages();
        return sendJson(res, rows);
      }

      if (urlPath === '/api/db/casePackages/update' && method === 'POST') {
        const { id, changes } = await readJson(req);
        const result = queries.updateCasePackage(id, changes);
        return sendJson(res, result ?? { ok: true });
      }

      if (urlPath === '/api/db/casePackages/delete' && method === 'POST') {
        const { id } = await readJson(req);
        const result = queries.deleteCasePackage(id);
        return sendJson(res, result ?? { ok: true });
      }

      // ── DB 404 ──────────────────────────────────────────────────────
      return sendJson(res, { error: 'Unknown DB endpoint', path: urlPath }, 404);

    } catch (err) {
      console.error(`[api-server][db] ${req.method} ${urlPath} failed:`, err.message || err);
      if (err.stack) console.error('[api-server][db] Stack:', err.stack);
      return sendError(res, err);
    }
  }

  return handleDbRequest;
}

// ─── 主路由处理 ────────────────────────────────────────────────────────

function createRequestHandler(dbRouter) {

  async function handleRequest(req, res) {
    const rawUrl = req.url;

    // ─── CORS headers (for browser dev mode) ────────────────────────
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      return res.end();
    }

    // ─── DB API (SQLite) ────────────────────────────────────────────
    if (dbRouter && rawUrl.startsWith('/api/db')) {
      return dbRouter(req, res);
    }

    // ─── Qwen DashScope ──────────────────────────────────────────
    const qwenRemain = matchRoute(rawUrl, '/api/qwen');
    if (qwenRemain !== null) {
      try {
        const targetUrl = buildTargetUrl(QWEN_API_BASE, qwenRemain);
        return proxyRequest(req, res, targetUrl, {
          Authorization: `Bearer ${QWEN_API_KEY}`,
        });
      } catch (err) {
        console.error('[api-server][qwen]', err.message);
        res.statusCode = 502;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ error: 'Configuration error', message: err.message }));
      }
    }

    // ─── EvoLink (GPT-image-2 & Nano Banana 2) ──────────────────
    const evolinkRemain = matchRoute(rawUrl, '/api/evolink');
    if (evolinkRemain !== null) {
      try {
        const targetUrl = buildTargetUrl(EVOLINK_API_BASE, evolinkRemain);
        console.log('[api-server][evolink] targetUrl:', targetUrl);
        return proxyRequest(req, res, targetUrl, {
          Authorization: `Bearer ${EVOLINK_API_KEY}`,
        });
      } catch (err) {
        console.error('[api-server][evolink]', err.message);
        res.statusCode = 502;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ error: 'Configuration error', message: err.message }));
      }
    }

    // ─── Alibaba Cloud OSS ───────────────────────────────────────
    const ossRemain = matchRoute(rawUrl, '/api/oss');
    if (ossRemain !== null) {
      try {
        const ossHost = `${OSS_BUCKET}.${OSS_REGION}.aliyuncs.com`;
        const ossBase = `https://${ossHost}`;
        const targetUrl = buildTargetUrl(ossBase, ossRemain);
        return proxyRequest(req, res, targetUrl, {
          'x-oss-access-key-id': OSS_ACCESS_KEY_ID,
          'x-oss-access-key-secret': OSS_ACCESS_KEY_SECRET,
          Host: ossHost,
        });
      } catch (err) {
        console.error('[api-server][oss]', err.message);
        res.statusCode = 502;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ error: 'Configuration error', message: err.message }));
      }
    }

    // ─── Expansion LLM ───────────────────────────────────────────
    const llmRemain = matchRoute(rawUrl, '/api/llm');
    if (llmRemain !== null) {
      try {
        const targetUrl = buildTargetUrl(LLM_BASE, llmRemain);
        console.log('[api-server][llm] targetUrl:', targetUrl);
        return proxyRequest(req, res, targetUrl, {
          Authorization: `Bearer ${LLM_KEY}`,
        });
      } catch (err) {
        console.error('[api-server][llm]', err.message);
        res.statusCode = 502;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ error: 'Configuration error', message: err.message }));
      }
    }

    // ─── Image Proxy (CORS) ──────────────────────────────────────
    const proxyRemain = matchRoute(rawUrl, '/api/proxy-image');
    if (proxyRemain !== null) {
      const fullUrl = `http://localhost${rawUrl}`;
      const parsed = new URL(fullUrl);
      const imageUrl = parsed.searchParams.get('url');
      if (!imageUrl) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Missing url parameter' }));
        return;
      }
      console.log('[api-server][proxy-image] Fetching:', imageUrl);
      try {
        const response = await fetch(imageUrl);
        if (!response.ok) {
          res.statusCode = response.status;
          res.end(`Upstream error: ${response.status} ${response.statusText}`);
          return;
        }
        const contentType = response.headers.get('content-type');
        if (contentType) res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        const buffer = Buffer.from(await response.arrayBuffer());
        console.log('[api-server][proxy-image] ←', response.status, contentType, buffer.length, 'bytes');
        res.end(buffer);
      } catch (err) {
        console.error('[api-server][proxy-image] Error:', err.message);
        res.statusCode = 500;
        res.end('Failed to fetch image');
      }
      return;
    }

    // ─── 404 ─────────────────────────────────────────────────────
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Not Found', path: rawUrl }));
  }

  return handleRequest;
}

// ─── 启动 ─────────────────────────────────────────────────────────────

/**
 * 启动 API 代理服务器。
 * @param {object} [opts]
 * @param {object} [opts.fileManager]  - FileManager 实例，用于图片文件读写
 * @param {number} [opts.port]        - 监听端口（0 = 随机端口）
 * @returns {Promise<number>} 实际监听的端口号
 */
function startApiServer(opts = {}) {
  const { fileManager = null, port = 0 } = opts;

  // 懒加载 queries（仅在有 fileManager 时才启用 DB 路由）
  let dbRouter = null;
  try {
    const queries = require('./database/queries.cjs');
    dbRouter = createDbRouter(queries, fileManager);
    console.log('[api-server] DB API routes enabled');
  } catch (err) {
    console.warn('[api-server] Could not load queries.cjs, DB routes disabled:', err.message);
  }

  const handler = createRequestHandler(dbRouter);

  return new Promise((resolve, reject) => {
    const server = http.createServer(handler);
    server.listen(port, '127.0.0.1', () => {
      const actualPort = server.address().port;
      console.log(`[api-server] Listening on 127.0.0.1:${actualPort}`);
      console.log('[api-server] Proxy routes: /api/qwen, /api/evolink, /api/oss, /api/llm, /api/proxy-image');
      if (dbRouter) {
        console.log('[api-server] DB route: /api/db/*');
      }
      resolve(actualPort);
    });
    server.on('error', reject);
  });
}

module.exports = { startApiServer };
