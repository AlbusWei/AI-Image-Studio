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

function createWindow() {
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

  // 7. 启动 API 代理服务器
  try {
    apiServerPort = await startApiServer();
    console.log('[Main] API server started on port', apiServerPort);
  } catch (err) {
    console.error('[Main] Failed to start API server:', err);
  }

  // 8. 初始化 OSS 增量同步引擎
  initOssSync(getDb, fileManager);

  // 网络恢复时自动重试失败的同步项
  powerMonitor.on('resume', onNetworkResume);

  // 9. 创建主窗口
  const mainWindow = createWindow();

  // 10. 窗口加载完成后执行一次性 IndexedDB → SQLite 迁移
  mainWindow.webContents.once('did-finish-load', () => {
    runMigration(mainWindow, getDb, fileManager);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  stopOssSync();
  closeDatabase();
});
