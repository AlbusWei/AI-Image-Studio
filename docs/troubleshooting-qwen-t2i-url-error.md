# Qwen T2I 生成报错调查记录

> 日期：2026-07-07  
> 环境：Windows 25H2 / PowerShell  
> 影响范围：浏览器模式（Vite dev server）+ CLI 模式（Electron api-server）

---

## 1. 问题描述

- **错误信息**：`Qwen T2I failed: [QwenAPI ERROR] Failed to parse URL from / (request_id: n/a)`
- **触发场景**：浏览器模式（Vite dev server）和 CLI 模式下调用 Qwen 文生图 API 时均触发
- **症状**：`/api/v1/models` 请求正常返回，`/api/v1/generate` 请求返回 500

---

## 2. 请求链路追踪

两条独立的请求路径最终都调用同一个 `buildTargetUrl` 函数：

### 路径 A：浏览器 (Vite dev proxy)

```
Browser (QwenAdapter)
  → apiPost('/qwen/', body)
  → longRunningClient.post (baseURL: '/api')
  → Vite proxy middleware (mount: /api/qwen)
  → connect strips prefix → req.url = '/'
  → buildTargetUrl(QWEN_API_BASE, '/')
  → fetch(targetUrl)   ← 此处报错
```

### 路径 B：CLI → Electron api-server

```
CLI (gen.mjs)
  → adapter.generateText2Image
  → apiPost('/qwen/', body)
  → longRunningClient.post (baseURL: http://127.0.0.1:PORT/api)
  → Electron api-server
  → matchRoute('/api/qwen/', '/api/qwen') → '/'
  → buildTargetUrl(QWEN_API_BASE, '/')
  → fetch(targetUrl)   ← 此处报错
```

---

## 3. 根因分析

### 直接原因

`QWEN_API_BASE` 在运行时为**空字符串**，导致：

```js
buildTargetUrl("", "/")  // 返回 "/"
fetch("/")               // Node.js 抛出 TypeError: Failed to parse URL from /
```

### 根本原因

| 文件 | 问题 |
|------|------|
| `api-proxy.js`（浏览器模式） | `server.config.root` 指向 `image_test/`（项目根）而非 `image_test/app/`（.env 所在目录），`loadEnv` 在错误目录中找不到 `.env` 文件 |
| `api-server.cjs`（Electron/CLI 模式） | `__dirname` 运行时不指向 `app/electron/`，`path.join(__dirname, '..', '.env')` 解析到 `image_test/.env`（不存在），实际 `.env` 在 `image_test/app/.env` |

### 关键诊断证据

- `.env` 文件内容正确：
  ```
  VITE_QWEN_API_BASE=https://poc-dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation
  ```
- **浏览器诊断日志**：`loadEnv` 只返回 `VITE_ELE_MODE` 一个变量（来自 `process.env`，非 `.env` 文件），其他 12 个 `VITE_` 变量全部 `undefined`
- **CLI 诊断日志**：`envPath: C:\Users\83871\Documents\my projects\image_test\.env`（错误路径），`dotenv error: ENOENT`

---

## 4. 修复方案

### 4.1 api-proxy.js（浏览器模式）

使用 `import.meta.url` + `fileURLToPath` + `resolve` 从插件文件自身位置（`src/server/`）向上两级推导 `APP_ROOT`：

```js
import { fileURLToPath } from 'url'
import { resolve } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const APP_ROOT = resolve(__dirname, '..', '..')  // src/server → app/

// 用 APP_ROOT 替代 server.config.root
const env = loadEnv(mode, APP_ROOT)
```

### 4.2 api-server.cjs（Electron/CLI 模式）

使用**多候选路径策略**，列出所有可能的 `.env` 位置逐一检查：

```js
const candidates = [
  path.join(__dirname, '.env'),
  path.join(__dirname, '..', '.env'),
  path.join(__dirname, '..', 'app', '.env'),
  path.join(__dirname, 'app', '.env'),
]

// Electron 环境额外检查
try {
  const { app } = require('electron')
  candidates.push(path.join(app.getAppPath(), '.env'))
} catch {}

const envPath = candidates.find(p => fs.existsSync(p))
```

不依赖 `__dirname` 的具体值，适配所有启动场景。

### 4.3 两处共同添加的防御性措施

- `buildTargetUrl` 添加 base 为空时的防御性校验（抛出明确错误而非默默返回 `/`）
- 启动时环境变量非空校验（fail-fast + 清晰错误信息）
- 诊断日志（启动时输出 envDir、envPath、已加载的变量列表）

---

## 5. 代码审查发现（待处理）

| # | 问题 | 严重性 | 说明 |
|---|------|--------|------|
| 1 | `electron-builder.yml` 未包含 `.env` | **严重** | 生产打包后 `.env` 不会被打入 asar 包，所有 API 配置丢失 |
| 2 | `require('electron')` 在 CLI 下不会 throw | **中等** | `app` 为 undefined 但 require 成功，当前靠 TypeError 触发 fallback，语义不清晰 |
| 3 | 诊断日志明文输出 API Key | **中等** | `VITE_QWEN_API_KEY` 值直接打印到终端 |
| 4 | `buildTargetUrl` 不校验 URL 格式 | **低** | 配置写错时报错不直观 |
| 5 | `/api/proxy-image` 存在 SSRF 风险 | **低** | 可请求内网地址（169.254.169.254 等） |

---

## 6. 经验教训

1. **Vite 插件中 `server.config.root` 不一定指向 `vite.config.js` 所在目录**，取决于 Vite 启动时的 CWD 和配置。不能假设它等同于 `.env` 所在目录。

2. **Electron/Node.js 中 `__dirname` 在不同启动方式下可能指向不同位置**。直接模式、asar 打包模式、CLI 调用模式下 `__dirname` 的值各不相同。

3. **环境变量加载失败时应该 fail-fast 而非静默降级为空字符串**。空字符串传给下游函数只会让错误在更远的地方以更难理解的方式爆发。

4. **`loadEnv` 只返回部分变量（而非全部为空）是一个强信号**，说明 `.env` 文件根本没被加载到——返回的变量来自 `process.env` 而非文件。

---

## 7. 涉及文件清单

| 文件 | 作用 |
|------|------|
| `app/.env` | 环境变量配置源 |
| `app/src/server/api-proxy.js` | Vite dev proxy，`buildTargetUrl` 第一处 |
| `app/electron/api-server.cjs` | Electron API server，`buildTargetUrl` 第二处 |
| `app/src/services/api/client.js` | axios 实例、baseURL、拦截器 |
| `app/src/services/api/qwen-adapter.js` | Qwen T2I/I2I 适配器 |
| `app/vite.config.js` | Vite 配置，注册 apiProxyPlugin |
| `app/bin/setup.mjs` | CLI 环境初始化，加载 .env |
| `app/electron-builder.yml` | Electron 打包配置 |
