---
kind: configuration_system
name: Vite + .env 环境变量与运行时配置系统
category: configuration_system
scope:
    - '**'
source_files:
    - app/.env
    - app/vite.config.js
    - app/src/server/api-proxy.js
    - app/electron/api-server.cjs
    - app/electron-builder.yml
    - app/src/stores/useSettingsStore.js
    - app/src/services/api/llm-adapter.js
---

## 1. 系统概览
本项目采用 Vite 原生 .env 环境变量机制作为唯一的配置来源，未引入任何第三方配置库。所有配置通过 VITE_ 前缀暴露给前端代码，敏感凭据则通过自定义 Vite 插件（开发环境）和 Electron 内嵌 HTTP 服务器（生产环境）在服务端读取，避免泄露到浏览器 bundle。

## 2. 关键文件与包
- app/.env：集中定义所有 VITE_* 变量（API Key、Base URL、OSS 参数、LLM 模型名等）
- app/vite.config.js：注册 apiProxyPlugin，将 Node 侧的 loadEnv 加载的环境注入开发服务器中间件
- app/src/server/api-proxy.js：自定义 Vite 插件，使用 vite.loadEnv 在 dev server 启动时读取 .env。**重要变更**：不再使用 `server.config.root` 作为 envDir，而是通过 `import.meta.url` + `fileURLToPath` + `resolve` 从插件文件自身位置向上两级推导 `APP_ROOT`（定位到 `app/`），确保 loadEnv 始终读取正确的 .env 文件
- app/electron/api-server.cjs：Electron 主进程内嵌 HTTP 代理服务器，使用 dotenv 模块加载 .env。**重要变更**：采用多候选路径策略查找 .env（依次检查 `__dirname`、`__dirname/..`、`__dirname/../app`、`__dirname/app`），Electron 环境时额外追加 `app.getAppPath()` 路径，确保在 CLI / 打包后 / 开发模式等各种运行环境下均能正确定位 .env
- app/electron-builder.yml：构建配置，files 中已添加 `.env`，确保打包后的应用包含环境变量文件
- app/src/stores/useSettingsStore.js：应用级运行时配置（存储策略、扩展 LLM 参数、通用设置），以 IndexedDB 持久化，默认值从 import.meta.env.VITE_* 填充
- app/src/services/api/llm-adapter.js：构造期读取 VITE_EXPANSION_LLM_MODEL 决定默认 LLM 模型

## 3. 架构与约定
- 环境变量命名规范：全部使用 VITE_ 前缀，由 Vite 自动注入到 import.meta.env；服务端代理层通过 loadEnv(mode, APP_ROOT, '') 读取同名键。
- 双通道读取：
  - 前端只读非敏感常量（Bucket、Region、Model 名）→ import.meta.env.VITE_*
  - 密钥类配置（API Key、AccessKeySecret）仅由 api-proxy.js（开发环境）和 api-server.cjs（生产环境）在服务端读取并注入请求头，绝不进入客户端代码。
- 配置分层：
  - 构建期常量：.env 中的 VITE_* 变量
  - 运行时用户配置：useSettingsStore 管理的 modelConfigs / storageConfig / expansionConfig / generalConfig，默认值来自环境变量，最终落盘 IndexedDB
- 代理即配置边界：所有外部 API 调用统一走 /api/* 代理，目标 Base URL 同样来自 .env，便于按环境切换后端地址。

## 4. 安全增强
- **buildTargetUrl 防御性校验**：当 base 为空时抛出明确错误，提示检查 .env 中对应变量，避免拼出无效 URL。
- **validateBaseUrl 启动时 URL 合法性检查**：在服务器启动阶段即对 VITE_QWEN_API_BASE、VITE_EVOLINK_API_BASE、VITE_EXPANSION_LLM_BASE 执行 `new URL()` 校验，不合法时打印错误日志，提前暴露配置问题。
- **诊断日志 API Key 脱敏**：使用 `maskKey` 函数（取前 4 位 + `***`）处理日志中的 API Key，避免完整密钥泄露到控制台。
- **SSRF 防护**：`/api/proxy-image` 路由拦截内网地址（127.0.0.1、localhost、169.254.169.254、0.0.0.0、10.x、192.168.x、172.x），返回 403，防止服务端被利用访问内部网络。
- **electron-builder.yml 包含 .env**：files 配置中显式添加 `.env`，确保打包后的 Electron 应用能正确加载环境变量。

## 5. 开发者应遵循的规则
1. 新增配置一律写入 app/.env，并以 VITE_ 开头；不要直接引用 process.env。
2. 涉及密钥（API Key、Secret）的配置只允许在服务端代理层（api-proxy.js 或 api-server.cjs）中读取并注入请求头，禁止在前端模块中直接使用。
3. 需要暴露给前端的非敏感配置才使用 import.meta.env.VITE_xxx，并在 useSettingsStore 的 DEFAULT_* 对象中提供回退默认值。
4. 修改 .env 后需重启 dev server，因为 loadEnv 仅在插件初始化时执行一次。
5. 如需新增外部服务代理，复制现有 /api/qwen 路由模板，在 configureServer（Vite 插件）或 createRequestHandler（Electron 服务器）中追加路由并声明对应 VITE_* 键。
6. **Vite 插件中加载 .env 时，不要依赖 `server.config.root`**——它不一定指向 `app/` 目录（例如 monorepo 或嵌套项目结构下可能指向其他位置）。应使用 `import.meta.url` + `fileURLToPath` + `resolve` 从插件文件自身位置推导 `APP_ROOT` 的绝对路径。
7. **Electron 主进程中 `__dirname` 不可靠**——不同启动方式（开发模式 `electron .`、打包后 `.exe`、CLI 调用）下 `__dirname` 可能指向不同位置。应使用多候选路径策略或 `app.getAppPath()` 定位 `.env` 等关键文件。