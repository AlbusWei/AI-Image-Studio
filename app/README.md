# AI Image Studio

AI 图像创作工作室 — 集成 Qwen Image 3 / GPT-image-2 / Nano Banana 2 三大模型

## 技术栈

- React 18 + Vite 6 (前端)
- Electron (桌面应用壳子)
- sql.js (SQLite WASM 数据库)
- Zustand + Immer (状态管理)
- ali-oss (阿里云 OSS 备份)

## 开发模式

### 启动（Electron 桌面应用）
```bash
cd app
npm run dev
```
同时启动 Vite dev server 和 Electron 窗口。数据存储在 SQLite + 文件系统，持久化到本地磁盘。

> `npm run electron:dev` 是 `npm run dev` 的别名，效果完全相同。

### 仅浏览器模式（备用，数据存 IndexedDB）
```bash
cd app
npm run browser:dev
```
访问 http://127.0.0.1:5173 — 数据仅存浏览器缓存，清缓存即丢失。

## 构建脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 开发模式，同时启动 Vite + Electron |
| `npm run electron:dev` | 同 `dev` |
| `npm run browser:dev` | 仅启动 Vite dev server（浏览器模式） |
| `npm run build` | 前端生产构建（输出到 `dist/`） |
| `npm run build:unpack` | Electron 免安装构建（`release/win-unpacked/`） |
| `npm run build:resources` | 同 `build:unpack`，生成 unpacked 目录 |
| `npm run electron:build` | Electron 安装包构建（输出 Windows NSIS 安装包到 `release/`） |
| `npm run preview` | Vite preview server |

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
├── bin/                   # CLI 命令行工具
│   ├── ais.mjs            # CLI 入口 (commander)
│   ├── setup.mjs          # 环境初始化 (dotenv + axios)
│   └── commands/          # 12 个命令实现
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

## CLI 命令行工具

项目内置 CLI 工具 `ais`，支持通过命令行执行生图、查询、管理等操作。

```bash
# 调用方式
node bin/ais.mjs <command> [options]

# 查看帮助
node bin/ais.mjs --help
```

前置条件：需要 Electron 应用（或至少 api-server）在运行。

详细用法参见 [CLI 用法指南](../docs/CLI-USAGE.md)。
