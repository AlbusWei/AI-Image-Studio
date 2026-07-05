# AI Image Studio

AI 图像创作工作室 — 集成 Qwen Image 3 / GPT-image-2 / Nano Banana 2 三大模型

## 技术栈

- React 18 + Vite 6 (前端)
- Electron (桌面应用壳子)
- sql.js (SQLite WASM 数据库)
- Zustand + Immer (状态管理)
- ali-oss (阿里云 OSS 备份)

## 开发模式

### 浏览器开发（仅前端，使用 IndexedDB）
```bash
cd app
npm run dev
```
访问 http://127.0.0.1:5173

### Electron 桌面应用开发（完整功能，使用 SQLite + 文件系统）
```bash
cd app
npm run electron:dev
```
将同时启动 Vite dev server 和 Electron 窗口。

## 生产构建

### 浏览器版本
```bash
cd app
npx vite build
```
输出到 `dist/` 目录。

### Electron 安装包
```bash
cd app
npm run electron:build
```
输出 Windows NSIS 安装包到 `release/` 目录。

## 数据存储

### Electron 模式
- 数据库: `{userData}/ai-image-studio.db` (SQLite)
- 图片: `{userData}/images/originals/` 和 `{userData}/images/thumbnails/`
- 首次启动自动从 IndexedDB 迁移数据

### 浏览器模式
- 使用 IndexedDB (Dexie.js)
- 数据存储在浏览器缓存中

## 环境变量

在 `app/.env` 中配置 API 密钥：
```
VITE_QWEN_API_KEY=your-key
VITE_QWEN_API_BASE=https://dashscope.aliyuncs.com/compatible-mode/v1
VITE_EVOLINK_API_KEY=your-key
VITE_EVOLINK_API_BASE=https://api.evolink.ai/v1
VITE_OSS_REGION=oss-cn-hangzhou
VITE_OSS_ACCESS_KEY_ID=your-key
VITE_OSS_ACCESS_KEY_SECRET=your-secret
VITE_OSS_BUCKET=your-bucket
```

## 项目结构
```
app/
├── electron/              # Electron main 进程
│   ├── main.cjs           # 入口，窗口创建 + 模块初始化
│   ├── preload.cjs        # contextBridge 安全 API
│   ├── api-server.cjs     # 内嵌 API 代理服务器
│   ├── file-manager.cjs   # 图片文件系统管理
│   ├── protocol.cjs       # app:// 自定义协议
│   ├── ipc-handlers.cjs   # IPC channel 注册
│   ├── migration.cjs      # IndexedDB → SQLite 迁移
│   ├── oss-sync.cjs       # OSS 增量备份引擎
│   └── database/          # SQLite 数据库层
│       ├── index.cjs      # sql.js 初始化 + 持久化
│       ├── schema.cjs     # 7张表 DDL
│       └── queries.cjs    # 30个查询函数
├── src/                   # Renderer 进程 (React)
│   ├── db/
│   │   ├── database.js    # 策略模式 facade
│   │   ├── dexie-backend.js    # IndexedDB 后端
│   │   └── electron-backend.js # SQLite IPC 后端
│   ├── stores/            # 5个 Zustand stores
│   ├── services/          # API adapters + 存储
│   ├── pages/             # Workbench + Gallery + Settings
│   └── components/        # UI 组件
├── electron-builder.yml   # 打包配置
└── .env                   # 环境变量
```
