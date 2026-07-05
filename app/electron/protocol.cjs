/**
 * Custom protocol handler — app:// scheme
 *
 * 将 app://images/originals/{id}.png 等请求映射到本地文件系统，
 * 让 renderer 进程可以像访问 HTTP 资源一样访问本地图片。
 *
 * 使用 Electron 25+ 的 protocol.handle API。
 */

const { protocol } = require('electron');
const path = require('path');
const fs = require('fs');

/**
 * 注册 app:// 为特权 scheme。
 * 必须在 app ready 之前调用，否则 contextIsolation 环境下无法使用。
 */
function registerAppSchemePrivileges() {
  const { protocol: protocolModule } = require('electron');
  if (protocolModule.registerSchemesAsPrivileged) {
    protocolModule.registerSchemesAsPrivileged([
      {
        scheme: 'app',
        privileges: {
          standard: true,
          secure: true,
          supportFetchAPI: true,
          corsEnabled: true,
          stream: true,
        },
      },
    ]);
    console.log('[Protocol] Registered app:// as privileged scheme');
  }
}

/**
 * 注册 app:// 自定义协议。
 *
 * @param {import('./file-manager').FileManager} fileManager
 */
function registerAppProtocol(fileManager) {
  protocol.handle('app', async (request) => {
    // request.url 示例: app://images/originals/abc123.png
    const url = new URL(request.url);
    const pathname = decodeURIComponent(url.pathname);

    // ─── 安全检查：防止路径遍历攻击 ──────────────────────────────
    if (pathname.includes('..')) {
      console.warn('[app://] Blocked path traversal attempt:', pathname);
      return new Response('Forbidden', { status: 403 });
    }

    // ─── 路由映射 ────────────────────────────────────────────────
    let localPath;
    if (pathname.startsWith('/images/originals/')) {
      const id = path.basename(pathname, path.extname(pathname));
      localPath = fileManager.getImagePath(id);
    } else if (pathname.startsWith('/images/thumbnails/')) {
      const id = path.basename(pathname, path.extname(pathname));
      localPath = fileManager.getThumbnailPath(id);
    } else {
      return new Response('Not Found', { status: 404 });
    }

    if (!localPath || !fs.existsSync(localPath)) {
      return new Response('Not Found', { status: 404 });
    }

    // ─── 读取文件并返回 Response ─────────────────────────────────
    const buffer = fs.readFileSync(localPath);
    const ext = path.extname(localPath).toLowerCase();
    const mimeTypes = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
    };
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    return new Response(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=86400',
      },
    });
  });

  console.log('[Protocol] app:// protocol registered');
}

module.exports = { registerAppProtocol, registerAppSchemePrivileges };
