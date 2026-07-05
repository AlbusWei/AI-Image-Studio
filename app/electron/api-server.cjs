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
 */

const http = require('http');
const path = require('path');
const dotenv = require('dotenv');

// ─── 加载 .env ────────────────────────────────────────────────────────

const envPath = path.join(__dirname, '..', '.env');
const env = dotenv.config({ path: envPath }).parsed || {};

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
 * 拼接 base + remaining path，确保只有一个 `/` 分隔。
 */
function buildTargetUrl(base, remainingPath) {
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

async function handleRequest(req, res) {
  const rawUrl = req.url;

  // ─── Qwen DashScope ──────────────────────────────────────────
  const qwenRemain = matchRoute(rawUrl, '/api/qwen');
  if (qwenRemain !== null) {
    const targetUrl = buildTargetUrl(QWEN_API_BASE, qwenRemain);
    return proxyRequest(req, res, targetUrl, {
      Authorization: `Bearer ${QWEN_API_KEY}`,
    });
  }

  // ─── EvoLink (GPT-image-2 & Nano Banana 2) ──────────────────
  const evolinkRemain = matchRoute(rawUrl, '/api/evolink');
  if (evolinkRemain !== null) {
    const targetUrl = buildTargetUrl(EVOLINK_API_BASE, evolinkRemain);
    console.log('[api-server][evolink] targetUrl:', targetUrl);
    return proxyRequest(req, res, targetUrl, {
      Authorization: `Bearer ${EVOLINK_API_KEY}`,
    });
  }

  // ─── Alibaba Cloud OSS ───────────────────────────────────────
  const ossRemain = matchRoute(rawUrl, '/api/oss');
  if (ossRemain !== null) {
    const ossHost = `${OSS_BUCKET}.${OSS_REGION}.aliyuncs.com`;
    const ossBase = `https://${ossHost}`;
    const targetUrl = buildTargetUrl(ossBase, ossRemain);
    return proxyRequest(req, res, targetUrl, {
      'x-oss-access-key-id': OSS_ACCESS_KEY_ID,
      'x-oss-access-key-secret': OSS_ACCESS_KEY_SECRET,
      Host: ossHost,
    });
  }

  // ─── Expansion LLM ───────────────────────────────────────────
  const llmRemain = matchRoute(rawUrl, '/api/llm');
  if (llmRemain !== null) {
    const targetUrl = buildTargetUrl(LLM_BASE, llmRemain);
    console.log('[api-server][llm] targetUrl:', targetUrl);
    return proxyRequest(req, res, targetUrl, {
      Authorization: `Bearer ${LLM_KEY}`,
    });
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

// ─── 启动 ─────────────────────────────────────────────────────────────

/**
 * 启动 API 代理服务器，监听随机端口。
 * @returns {Promise<number>} 实际监听的端口号
 */
function startApiServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handleRequest);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      console.log(`[api-server] Listening on 127.0.0.1:${port}`);
      console.log('[api-server] Proxy routes: /api/qwen, /api/evolink, /api/oss, /api/llm, /api/proxy-image');
      resolve(port);
    });
    server.on('error', reject);
  });
}

module.exports = { startApiServer };
