/**
 * FileManager — 文件系统存储层
 *
 * 负责图片原图、缩略图、导入图片的读写与删除，
 * 以及存储统计信息的获取。
 *
 * 目录结构：
 *   {userDataPath}/ai-image-studio/images/
 *     ├── originals/   — 生成的原图
 *     ├── thumbnails/  — 缩略图
 *     └── imports/     — 用户导入的参考图
 */

const fs = require('fs');
const path = require('path');

class FileManager {
  constructor(userDataPath) {
    this.basePath = path.join(userDataPath, 'ai-image-studio', 'images');
    this.originalsPath = path.join(this.basePath, 'originals');
    this.thumbnailsPath = path.join(this.basePath, 'thumbnails');
    this.importsPath = path.join(this.basePath, 'imports');

    // 确保目录存在
    [this.originalsPath, this.thumbnailsPath, this.importsPath].forEach((dir) => {
      fs.mkdirSync(dir, { recursive: true });
    });

    console.log('[FileManager] Initialized at', this.basePath);
  }

  // ─── 原图 ──────────────────────────────────────────────────────

  async saveImage(id, buffer, mimeType = 'image/png') {
    const ext = mimeType.includes('jpeg') || mimeType.includes('jpg') ? 'jpg' : 'png';
    const filePath = path.join(this.originalsPath, `${id}.${ext}`);
    fs.writeFileSync(filePath, buffer);
    return filePath;
  }

  async readImage(id) {
    for (const ext of ['png', 'jpg', 'jpeg', 'webp']) {
      const filePath = path.join(this.originalsPath, `${id}.${ext}`);
      if (fs.existsSync(filePath)) {
        return {
          buffer: fs.readFileSync(filePath),
          mimeType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
          filePath,
        };
      }
    }
    return null;
  }

  // ─── 缩略图 ────────────────────────────────────────────────────

  async saveThumbnail(id, buffer) {
    const filePath = path.join(this.thumbnailsPath, `${id}.jpg`);
    fs.writeFileSync(filePath, buffer);
    return filePath;
  }

  async readThumbnail(id) {
    const filePath = path.join(this.thumbnailsPath, `${id}.jpg`);
    if (fs.existsSync(filePath)) {
      return {
        buffer: fs.readFileSync(filePath),
        mimeType: 'image/jpeg',
        filePath,
      };
    }
    return null;
  }

  // ─── 删除 ──────────────────────────────────────────────────────

  async deleteImage(id) {
    for (const ext of ['png', 'jpg', 'jpeg', 'webp']) {
      const origPath = path.join(this.originalsPath, `${id}.${ext}`);
      if (fs.existsSync(origPath)) fs.unlinkSync(origPath);
    }
    const thumbPath = path.join(this.thumbnailsPath, `${id}.jpg`);
    if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
  }

  async deleteImages(ids) {
    for (const id of ids) await this.deleteImage(id);
  }

  // ─── 导入图片 ──────────────────────────────────────────────────

  async saveImport(id, buffer, ext = 'png') {
    const filePath = path.join(this.importsPath, `${id}.${ext}`);
    fs.writeFileSync(filePath, buffer);
    return filePath;
  }

  // ─── 路径查询（供 app:// 协议使用）───────────────────────────────

  getImagePath(id) {
    for (const ext of ['png', 'jpg', 'jpeg', 'webp']) {
      const filePath = path.join(this.originalsPath, `${id}.${ext}`);
      if (fs.existsSync(filePath)) return filePath;
    }
    return null;
  }

  getThumbnailPath(id) {
    const filePath = path.join(this.thumbnailsPath, `${id}.jpg`);
    return fs.existsSync(filePath) ? filePath : null;
  }

  // ─── 存储统计 ──────────────────────────────────────────────────

  async getStorageStats() {
    const stats = {
      originals: { count: 0, size: 0 },
      thumbnails: { count: 0, size: 0 },
      imports: { count: 0, size: 0 },
    };

    for (const dir of ['originals', 'thumbnails', 'imports']) {
      const dirPath = path.join(this.basePath, dir);
      if (fs.existsSync(dirPath)) {
        const files = fs.readdirSync(dirPath);
        stats[dir].count = files.length;
        stats[dir].size = files.reduce((total, f) => {
          try {
            return total + fs.statSync(path.join(dirPath, f)).size;
          } catch {
            return total;
          }
        }, 0);
      }
    }

    return stats;
  }
}

// ─── IPC Handlers 注册 ────────────────────────────────────────────────

function registerFileIpcHandlers(ipcMain, fileManager) {
  ipcMain.handle('fs:image:save', async (_event, id, buffer, mimeType) => {
    return fileManager.saveImage(id, Buffer.from(buffer), mimeType);
  });

  ipcMain.handle('fs:image:read', async (_event, id) => {
    const result = await fileManager.readImage(id);
    if (result) {
      return {
        buffer: Array.from(result.buffer),
        mimeType: result.mimeType,
        filePath: result.filePath,
      };
    }
    return null;
  });

  ipcMain.handle('fs:image:delete', async (_event, id) => {
    return fileManager.deleteImage(id);
  });

  ipcMain.handle('fs:image:deleteMany', async (_event, ids) => {
    return fileManager.deleteImages(ids);
  });

  ipcMain.handle('fs:thumbnail:save', async (_event, id, buffer) => {
    return fileManager.saveThumbnail(id, Buffer.from(buffer));
  });

  ipcMain.handle('fs:thumbnail:read', async (_event, id) => {
    const result = await fileManager.readThumbnail(id);
    if (result) {
      return {
        buffer: Array.from(result.buffer),
        mimeType: result.mimeType,
        filePath: result.filePath,
      };
    }
    return null;
  });

  ipcMain.handle('fs:stats', async () => {
    return fileManager.getStorageStats();
  });

  ipcMain.handle('fs:import:save', async (_event, id, buffer, ext) => {
    return fileManager.saveImport(id, Buffer.from(buffer), ext);
  });

  console.log('[FileManager] IPC handlers registered');
}

module.exports = { FileManager, registerFileIpcHandlers };
