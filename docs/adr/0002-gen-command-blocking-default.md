# gen 命令默认阻塞等待，输出 JSON

CLI 的 `gen` 命令需要统一处理两种 API 模式：Qwen Image 3 是同步 API（POST 直接等结果，耗时 30s–120s+），GPT-image-2 和 Nano Banana 2 是异步 API（提交后轮询 `/v1/tasks/{task_id}`，耗时类似）。

**决策：** `gen` 命令默认阻塞——提交后持续等待直到生成完成，输出完整结果（JSON 格式，包含 id、model、prompt、filePath、sourceUrl 等字段）。进程退出码 0 表示成功，非零表示失败。

选择阻塞的核心理由：QoderWork agent 通过 Bash 工具执行命令，阻塞模式下一条命令拿到结果，agent 可以直接解析 stdout JSON。如果采用立即返回 taskId + 手动 poll 的模式，agent 需要多步操作（submit → poll → check → 循环），增加 skill 复杂度和出错概率。

**Consequences:**

- Qwen 同步调用可能阻塞 2 分钟+，Bash 工具需要有足够长的超时（QoderWork 默认 2 分钟，需要调大或设置 --timeout）。
- 异步模型（GPT/NB）的轮询在 CLI 内部完成，对调用者透明。
- 后续可扩展 `--async` flag：立即返回 taskId，agent 用 `tasks get <id>` 手动查询状态。初版不实现。
