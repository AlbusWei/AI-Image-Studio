# CLI 端口发现：环境变量 + 命令行参数

CLI 需要知道 api-server 的监听端口才能发起 HTTP 请求。开发模式下端口固定 19527（`main.cjs` 第 100 行 `port: isDev ? 19527 : 0`），但生产模式（打包后的 Electron app）端口由操作系统随机分配。

**决策：** CLI 按以下优先级确定端口：`--port` 参数 > `AIS_PORT` 环境变量 > 端口文件（`%APPDATA%/ai-image-studio/.api-port`）> 默认 19527。api-server 启动时增加写端口文件的逻辑（仅生产模式需要）。

**Considered Options:**

- **仅环境变量 + --port：** 简单但生产模式下用户需要手动查端口（从 Electron 日志或 DevTools）。
- **仅端口文件：** 自动但需要改 api-server.cjs。
- **仅开发模式：** 最简单但生产环境不可用。

选择分层 fallback 的理由：开发时直接跑默认值零配置；生产时 api-server 自动写端口文件实现零配置；--port 和环境变量作为手动覆盖的逃生通道。
