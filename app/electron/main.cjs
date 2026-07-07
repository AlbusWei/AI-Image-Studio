const { app, BrowserWindow, ipcMain, powerMonitor } = require('electron');
const path = require('path');

const { FileManager, registerFileIpcHandlers } = require('./file-manager.cjs');
const { registerAppProtocol, registerAppSchemePrivileges } = require('./protocol.cjs');
const { startApiServer } = require('./api-server.cjs');
const { initDatabase, closeDatabase, getDb } = require('./database/index.cjs');
const { registerIpcHandlers } = require('./ipc-handlers.cjs');
const { initOssSync, stopOssSync, onNetworkResume } = require('./oss-sync.cjs');
const { runMigration } = require('./migration.cjs');

// 必须在 app ready 之前注册特权 scheme
registerAppSchemePrivileges();

const isDev = !app.isPackaged;

/** @type {number|null} API server 实际端口 */
let apiServerPort = null;
/** @type {string|null} 页面首次加载完成的 URL，用于区分首次加载与后续 SPA 导航 */
let lastUrl = null;
/** @type {boolean} IndexedDB → SQLite 迁移是否已执行 */
let migrationDone = false;

function createWindow(getDbRef, fileManagerRef) {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    title: 'AI Image Studio',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://127.0.0.1:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  // 将渲染进程 console 输出转发到主进程终端（dev 模式）
  if (isDev) {
    mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      const levelMap = { 0: 'LOG', 1: 'WARN', 2: 'ERROR', 3: 'INFO' };
      const tag = levelMap[level] || 'LOG';
      const src = sourceId ? ` (${sourceId}:${line})` : '';
      console.log(`[Renderer:${tag}]${src} ${message}`);
    });
  }

  // 页面加载完成：记录 URL + 首次加载时执行 IndexedDB → SQLite 迁移
  mainWindow.webContents.on('did-finish-load', () => {
    const url = mainWindow.webContents.getURL();
    if (lastUrl !== url) {
      lastUrl = url;
      console.log('[Main] Page loaded:', url);
    }
    if (!migrationDone) {
      migrationDone = true;
      runMigration(mainWindow, getDbRef, fileManagerRef);
    }
  });

  mainWindow.webContents.on('did-navigate-in-page', (_event, url) => {
    if (lastUrl !== url) {
      lastUrl = url;
      console.log('[Main] Page navigated:', url);
    }
  });

  return mainWindow;
}

// ─── app.whenReady ────────────────────────────────────────────────────

app.whenReady().then(async () => {
  // 1. 初始化 SQLite 数据库
  try {
    await initDatabase(app.getPath('userData'));
    console.log('[Main] SQLite database initialized');
  } catch (err) {
    console.error('[Main] Failed to init database:', err);
  }

  // 2. 注册数据库 IPC handlers
  registerIpcHandlers();

  // 3. 初始化文件系统存储层
  const fileManager = new FileManager(app.getPath('userData'));

  // 4. 注册文件操作 IPC handlers
  registerFileIpcHandlers(ipcMain, fileManager);

  // 5. 注册 app:// 自定义协议
  registerAppProtocol(fileManager);

  // 6. 注册通用 IPC handlers
  ipcMain.handle('app:getPath', () => app.getPath('userData'));
  ipcMain.handle('app:getVersion', () => app.getVersion());
  ipcMain.handle('app:getApiPort', () => apiServerPort);
  // Synchronous port getter for preload (sendSync, zero race condition)
  ipcMain.on('app:getApiPortSync', (event) => { event.returnValue = apiServerPort; });

  // 7. 启动 API 代理服务器
  try {
    apiServerPort = await startApiServer({ fileManager, port: isDev ? 19527 : 0 });
    console.log('[Main] API server started on port', apiServerPort);
  } catch (err) {
    console.error('[Main] Failed to start API server:', err);
  }

  // 8. 初始化 OSS 增量同步引擎
  initOssSync(getDb, fileManager);

  // 网络恢复时自动重试失败的同步项
  powerMonitor.on('resume', onNetworkResume);

  // 9. 创建主窗口
  const mainWindow = createWindow(getDb, fileManager);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(getDb, fileManager);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  stopOssSync();
  closeDatabase();
});
