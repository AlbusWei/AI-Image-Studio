---
kind: logging_system
name: 无结构化日志系统 — 仅使用 console.* 调试输出
category: logging_system
scope:
    - '**'
source_files:
    - app/src/main.jsx
    - app/src/db/database.js
    - app/src/components/Lightbox.jsx
    - app/src/pages/Gallery.jsx
    - app/src/pages/Workbench.jsx
    - app/src/server/api-proxy.js
---

本仓库未实现任何专门的日志系统。前端应用（React + Vite）在所有业务模块中直接使用浏览器原生 `console.log` / `console.error` / `console.warn` 进行调试输出，未发现引入任何第三方日志框架（如 pino、winston、debug、loglevel、sentry 等），package.json 的 dependencies/devDependencies 中也无任何日志相关依赖。

现有日志模式特征：
- 通过字符串前缀 `[模块名]` 区分来源，例如 `[db]`、`[main]`、`[Lightbox]`、`[Gallery]`、`[Workbench]`、`[api-proxy]`、`[ErrorBoundary]`。
- 错误路径统一用 `console.error`，关键流程节点用 `console.log`，警告用 `console.warn`。
- 没有统一的 logger 实例、日志级别配置、结构化字段或远程上报机制。
- 后端代理 `app/src/server/api-proxy.js` 同样以 `console.log` 打印请求/响应摘要。

由于缺乏集中式日志基础设施，当前无法支持按级别过滤、持久化存储、性能分析或错误聚合上报。若后续需要，可考虑在 `src/services/` 下新增 `logger.js` 封装并统一替换所有 `console.*` 调用。