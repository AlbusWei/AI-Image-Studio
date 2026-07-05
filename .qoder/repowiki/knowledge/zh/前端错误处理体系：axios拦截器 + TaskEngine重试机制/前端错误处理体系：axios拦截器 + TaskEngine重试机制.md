---
kind: error_handling
name: 前端错误处理体系：axios拦截器 + TaskEngine重试机制
category: error_handling
scope:
    - '**'
source_files:
    - app/src/services/api/client.js
    - app/src/services/task-engine.js
    - app/src/services/notification.js
---

## 1. 使用的系统/方法
- **HTTP 层**：基于 axios 的 `app/src/services/api/client.js`，通过请求/响应拦截器统一归一化错误对象（包含 `message`、`status`、`data`、`originalError`），并内置指数退避自动重试（最多 3 次，仅对 5xx / 网络错误）。
- **任务调度层**：`app/src/services/task-engine.js` 的 `TaskEngine` 在 `_runTask` 中捕获执行异常，根据 `_isRetryableError` 判断是否可重试（5xx、含 "Network" 的消息），再次指数退避后入队重试；超过最大重试次数则持久化为 `failed` 状态并通过事件与通知上报。
- **用户反馈层**：`app/src/services/notification.js` 封装浏览器 Notification API，在任务完成/失败时弹出系统通知，内部 try/catch 包裹防止通知失败影响主流程。
- **UI 层**：组件内未集中定义自定义 Error 类型或全局 error boundary，主要依赖 Promise reject 向上传播，由调用方 `.catch` 或 try/catch 消费。未发现 `panic/recover` 或中间件式错误处理。

## 2. 关键文件与包
- `app/src/services/api/client.js` — axios 实例、拦截器、重试、AbortController 支持
- `app/src/services/task-engine.js` — 任务队列、状态机、重试、进度、IndexedDB 持久化
- `app/src/services/notification.js` — 浏览器通知包装（成功/失败/通用）
- `app/src/db/database.js` — IndexedDB 存取（错误更新被 `_updateStatus` 吞掉并 console.error）
- `app/src/services/storage.js`、`app/src/services/api/*-adapter.js` — 业务服务层，直接 await apiGet/apiPost 并向上抛出

## 3. 架构与约定
- **错误归一化**：所有 HTTP 错误经 response interceptor 统一为 `{ message, status, data, originalError }` 对象再 reject，避免上层感知 axios 细节。
- **分层重试**：HTTP 层做轻量级 5xx 重试；TaskEngine 再做一次业务级重试，两者配合覆盖网络抖动与后端瞬时故障。
- **可取消性**：每个任务持有 AbortController，cancel/pause 会 abort signal 并 reject 对应 Promise，避免悬挂请求。
- **状态即错误源**：任务最终错误写入 DB 的 `error` 字段（err.message），UI 通过订阅 `task:failed` 事件展示。
- **静默降级**：通知、DB 状态更新等副作用出错仅 `console.error`，不中断主流程。

## 4. 开发者应遵循的规则
- 发起 HTTP 请求一律使用 `apiGet/apiPost/apiPut/apiDelete`，不要直接 import axios；需要禁用重试时在 opts 传入 `_noRetry: true`。
- 长耗时同步生成接口（如 Qwen）使用 `longRunningClient`（timeout=5min），普通接口用默认 client（60s）。
- 提交后台任务通过 `TaskEngine.submit({ execute })`，在 `execute(ctx)` 中检查 `ctx.signal.aborted` 及时退出。
- 需要区分“可重试”与“不可重试”错误时，在错误消息中包含语义信息（如含 "Network" 会被识别为可重试）；或直接在业务层 catch 后 resolve/reject 明确结果。
- 不要抛出自定义 Error 子类——当前代码库未定义统一错误类型，上层消费端按 `err.message` 和 `err.status` 判断即可。
- UI 层如需本地错误提示，建议复用 `notification.notifyInfo` 或通过 store 暴露的错误字段渲染，而非 alert/console。
