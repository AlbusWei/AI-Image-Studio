# CLI 定位为薄客户端，复用 renderer 侧 adapter

Studio 需要一个 CLI 工具作为 QoderWork agent 与 Studio 交互的桥梁，让 agent 能通过 Bash 执行生图任务并将结果持久化到本地数据库。

**决策：** CLI 定位为薄客户端，通过 HTTP 调用 Electron api-server 已暴露的 REST API（`127.0.0.1:19527/api`）。模型调用逻辑直接 import `app/src/services/api/` 下的 adapter 类（QwenAdapter、GPTImageAdapter、NanoBananaAdapter、LLMAdapter），不重复实现。

**Considered Options:**

- **独立工具：** CLI 自带 API 调用逻辑 + SQLite 读写，不依赖 Electron app 运行。好处是随时可用，代价是维护两套 adapter 逻辑（轮询、重试、参数校验），且 adapter 改动需要同步两处。
- **混合模式：** 薄客户端 + standalone fallback。先做薄客户端跑通流程，再提供独立模式。复杂度更高，延后实现。

选择薄客户端的核心理由：api-server 已经提供了完整的 REST API（CRUD + 模型代理 + 文件存储），adapter 改了 CLI 自动生效，零重复代码。前提是 Electron app（或至少 api-server 进程）需要在运行。

**Consequences:**

- CLI 依赖 api-server 在运行——开发模式下端口固定 19527，生产模式下端口随机（需要端口发现机制）。
- adapter 使用 ESM + `import.meta.env`（Vite 特性），CLI 在 Node.js 环境需要处理兼容（dotenv 加载 `.env`，手动设置 axios baseURL）。
- CLI 和 renderer 共享代码库（`app/bin/` 目录），package.json 的 `type: "module"` 已满足 ESM 要求。
