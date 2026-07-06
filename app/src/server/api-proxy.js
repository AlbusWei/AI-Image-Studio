/**
 * Vite plugin: API proxy middleware for AI Image Studio
 *
 * Routes:
 *   /api/qwen/*   -> Qwen DashScope API (injects Bearer token)
 *   /api/evolink/* -> EvoLink API (injects Bearer token)
 *   /api/oss/*    -> Alibaba Cloud OSS (injects OSS access headers)
 *   /api/llm/*   -> Expansion LLM / DashScope compatible (injects Bearer token)
 *
 * Keys are read from process.env (loaded by Vite from .env file) so they
 * never leak into the client bundle.
 */

import { resolve as resolvePath, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadEnv } from 'vite';

// Resolve app root reliably from this file's location (src/server/ -> app/)
const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolvePath(__dirname, '..', '..');

/**
 * Read the raw request body as a Buffer (for POST / PUT).
 *
 * Vite's dev server may install its own body-parsing middleware (e.g. via
 * `body-parser`) BEFORE our custom middleware runs.  When that happens the
 * request stream is already consumed and `req.body` holds the parsed Buffer.
 * We check for that case first and fall back to manual stream reading only
 * when `req.body` is not available.
 */
function readBody(req) {
  // Vite (connect + body-parser) may have already read the body
  if (req.body) {
    if (Buffer.isBuffer(req.body)) return req.body;
    if (typeof req.body === 'string') return Buffer.from(req.body, 'utf-8');
    return Buffer.from(JSON.stringify(req.body), 'utf-8');
  }

  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/**
 * Build a clean target URL from a base and a remaining path.
 * Strips trailing slash from base and ensures exactly one slash between parts.
 */
function buildTargetUrl(base, path) {
  if (!base) {
    throw new Error(`[api-proxy] buildTargetUrl: base is empty! Cannot construct URL for path "${path}". Check that the corresponding environment variable (e.g. VITE_QWEN_API_BASE) is set in .env.`);
  }
  const cleanBase = base.replace(/\/+$/, '');
  const cleanPath = path.startsWith('/') ? path : '/' + path;
  return cleanBase + cleanPath;
}

/**
 * Generic proxy helper: forwards a request to `targetUrl`, injects extra
 * headers, and pipes the response back to the Vite dev client.
 */
async function proxyRequest(req, res, targetUrl, extraHeaders = {}) {
  console.log('[api-proxy] →', req.method, targetUrl);
  try {
    const method = req.method;
    const body = ['POST', 'PUT', 'PATCH'].includes(method)
      ? await readBody(req)
      : undefined;

    // Build headers: forward original content-type, drop host/origin
    const headers = { ...extraHeaders };
    if (req.headers['content-type']) {
      headers['Content-Type'] = req.headers['content-type'];
    }
    // Always use actual body length, never forward original Content-Length
    // (original may be chunked or otherwise inaccurate after reading)
    if (body) {
      headers['Content-Length'] = body.length;
      console.log('[api-proxy] Request body size:', body.length, 'bytes');
    }

    console.log('[api-proxy] Headers:', Object.keys(headers).join(', '));

    const response = await fetch(targetUrl, {
      method,
      headers,
      body,
    });

    console.log('[api-proxy] ← Response status:', response.status);

    // Relay status & headers
    res.statusCode = response.status;
    const skipHeaders = [
      'transfer-encoding', 'connection',
      'access-control-allow-origin',
      // fetch auto-decompresses the body, so we must NOT forward content-encoding
      // otherwise the browser will try to decompress an already-decompressed body
      'content-encoding',
      // content-length is wrong after decompression; let express/chunked handle it
      'content-length',
    ];
    response.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (!skipHeaders.includes(lower)) {
        res.setHeader(key, value);
      }
    });
    console.log('[api-proxy] Content-Type:', response.headers.get('content-type'));

    // Relay body (already decompressed by fetch)
    const arrayBuffer = await response.arrayBuffer();
    const responseBody = Buffer.from(arrayBuffer);
    console.log('[api-proxy] Response size:', responseBody.length, 'bytes');
    res.end(responseBody);
  } catch (err) {
    console.error(`[api-proxy] ✗ Error proxying ${req.method} ${targetUrl}:`, err.message);
    console.error('[api-proxy] Error stack:', err.stack);
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Proxy error', message: err.message }));
  }
}

/**
 * Factory – returns the Vite plugin object.
 */
export default function apiProxyPlugin() {
  return {
    name: 'ai-image-studio-api-proxy',

    configureServer(server) {
      const envDir = APP_ROOT;
      const env = loadEnv(server.config.mode, envDir, '');

      // ─── 诊断日志 ─────────────────────────────────────────────────
      console.log('[api-proxy][DIAG] server.config.root:', server.config.root);
      console.log('[api-proxy][DIAG] envDir (resolved):', envDir);
      console.log('[api-proxy][DIAG] server.config.mode:', server.config.mode);
      console.log('[api-proxy][DIAG] loadEnv returned VITE_QWEN_API_BASE:', JSON.stringify(env.VITE_QWEN_API_BASE));
      console.log('[api-proxy][DIAG] loadEnv returned VITE_QWEN_API_KEY:', env.VITE_QWEN_API_KEY ? '(present)' : '(MISSING)');
      console.log('[api-proxy][DIAG] all VITE_ env keys:', Object.keys(env).filter(k => k.startsWith('VITE_')).join(', ') || '(none)');
      // ──────────────────────────────────────────────────────────────

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

      // ─── 启动时校验 ───────────────────────────────────────────────
      if (!QWEN_API_BASE) {
        console.error('[api-proxy][ERROR] VITE_QWEN_API_BASE is EMPTY after loadEnv!');
        console.error('[api-proxy][ERROR] server.config.root =', server.config.root);
        console.error('[api-proxy][ERROR] server.config.mode =', server.config.mode);
        console.error('[api-proxy][ERROR] Please verify .env file exists at:', resolvePath(envDir, '.env'));
      }
      if (!QWEN_API_KEY) {
        console.error('[api-proxy][ERROR] VITE_QWEN_API_KEY is EMPTY after loadEnv!');
      }

      // ─── Qwen DashScope ──────────────────────────────────────────────
      server.middlewares.use('/api/qwen', async (req, res, next) => {
        try {
          const targetUrl = buildTargetUrl(QWEN_API_BASE, req.url);
          await proxyRequest(req, res, targetUrl, {
            Authorization: `Bearer ${QWEN_API_KEY}`,
          });
        } catch (err) {
          console.error('[api-proxy][qwen]', err.message);
          res.statusCode = 502;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Configuration error', message: err.message }));
        }
      });

      // ─── EvoLink (GPT-image-2 & Nano Banana 2) ──────────────────────
      server.middlewares.use('/api/evolink', async (req, res, next) => {
        try {
          const targetUrl = buildTargetUrl(EVOLINK_API_BASE, req.url);
          console.log('[api-proxy][evolink] EVOLINK_API_BASE:', EVOLINK_API_BASE);
          console.log('[api-proxy][evolink] req.url:', req.url);
          console.log('[api-proxy][evolink] targetUrl:', targetUrl);
          await proxyRequest(req, res, targetUrl, {
            Authorization: `Bearer ${EVOLINK_API_KEY}`,
          });
        } catch (err) {
          console.error('[api-proxy][evolink]', err.message);
          res.statusCode = 502;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Configuration error', message: err.message }));
        }
      });

      // ─── Alibaba Cloud OSS ───────────────────────────────────────────
      server.middlewares.use('/api/oss', async (req, res, next) => {
        try {
          // OSS REST endpoint: https://{bucket}.{region}.aliyuncs.com
          const ossHost = `${OSS_BUCKET}.${OSS_REGION}.aliyuncs.com`;
          const ossBase = `https://${ossHost}`;
          const targetUrl = buildTargetUrl(ossBase, req.url);
          await proxyRequest(req, res, targetUrl, {
            // OSS uses a signature-based auth; for dev we forward access key
            // and let the client build the full Authorization header when needed.
            'x-oss-access-key-id': OSS_ACCESS_KEY_ID,
            'x-oss-access-key-secret': OSS_ACCESS_KEY_SECRET,
            Host: ossHost,
          });
        } catch (err) {
          console.error('[api-proxy][oss]', err.message);
          res.statusCode = 502;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Configuration error', message: err.message }));
        }
      });

      // ─── Expansion LLM (DashScope compatible / OpenAI-style) ────────
      server.middlewares.use('/api/llm', async (req, res, next) => {
        try {
          const targetUrl = buildTargetUrl(LLM_BASE, req.url);
          console.log('[api-proxy][llm] LLM_BASE:', LLM_BASE);
          console.log('[api-proxy][llm] req.url:', req.url);
          console.log('[api-proxy][llm] targetUrl:', targetUrl);
          console.log('[api-proxy][llm] has LLM_KEY:', !!LLM_KEY);
          await proxyRequest(req, res, targetUrl, {
            Authorization: `Bearer ${LLM_KEY}`,
          });
        } catch (err) {
          console.error('[api-proxy][llm]', err.message);
          res.statusCode = 502;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Configuration error', message: err.message }));
        }
      });

      // ─── Image Proxy (bypass CORS for external image URLs) ─────────
      server.middlewares.use('/api/proxy-image', async (req, res, next) => {
        const url = new URL(req.url, 'http://localhost');
        const imageUrl = url.searchParams.get('url');
        if (!imageUrl) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Missing url parameter' }));
          return;
        }
        console.log('[api-proxy][proxy-image] Fetching:', imageUrl);
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
          console.log('[api-proxy][proxy-image] ←', response.status, contentType, buffer.length, 'bytes');
          res.end(buffer);
        } catch (err) {
          console.error('[api-proxy][proxy-image] Error:', err.message);
          res.statusCode = 500;
          res.end('Failed to fetch image');
        }
      });

      // log active routes
      console.log('[api-proxy] Proxy routes active: /api/qwen, /api/evolink, /api/oss, /api/llm, /api/proxy-image');
    },
  };
}
