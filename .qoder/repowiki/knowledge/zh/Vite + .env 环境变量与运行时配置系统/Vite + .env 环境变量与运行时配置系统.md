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
    - app/src/stores/useSettingsStore.js
    - app/src/services/api/llm-adapter.js
---

## 1. 系统概览
本项目采用 Vite 原生 .env 环境变量机制作为唯一的配置来源，未引入任何第三方配置库。所有配置通过 VITE_ 前缀暴露给前端代码，敏感凭据则通过自定义 Vite 插件在服务端代理层读取，避免泄露到浏览器 bundle。

## 2. 关键文件与包
- app/.env：集中定义所有 VITE_* 变量（API Key、Base URL、OSS 参数、LLM 模型名等）
- app/vite.config.js：注册 apiProxyPlugin，将 Node 侧的 loadEnv 加载的环境注入开发服务器中间件
- app/src/server/api-proxy.js：自定义 Vite 插件，使用 vite.loadEnv 在 dev server 启动时读取 .env，为 /api/qwen、/api/evolink、/api/oss、/api/llm 四个路由注入 Bearer Token / OSS 签名头
- app/src/stores/useSettingsStore.js：应用级运行时配置（存储策略、扩展 LLM 参数、通用设置），以 IndexedDB 持久化，默认值从 import.meta.env.VITE_* 填充
- app/src/services/api/llm-adapter.js：构造期读取 VITE_EXPANSION_LLM_MODEL 决定默认 LLM 模型

## 3. 架构与约定
- 环境变量命名规范：全部使用 VITE_ 前缀，由 Vite 自动注入到 import.meta.env；服务端代理层通过 loadEnv(mode, root, '') 读取同名键。
- 双通道读取：
  - 前端只读非敏感常量（Bucket、Region、Model 名）→ import.meta.env.VITE_*
  - 密钥类配置（API Key、AccessKeySecret）仅由 api-proxy.js 在服务端读取并注入请求头，绝不进入客户端代码。
- 配置分层：
  - 构建期常量：.env 中的 VITE_* 变量
  - 运行时用户配置：useSettingsStore 管理的 modelConfigs / storageConfig / expansionConfig / generalConfig，默认值来自环境变量，最终落盘 IndexedDB
- 代理即配置边界：所有外部 API 调用统一走 /api/* 代理，目标 Base URL 同样来自 .env，便于按环境切换后端地址。

## 4. 开发者应遵循的规则
1. 新增配置一律写入 app/.env，并以 VITE_ 开头；不要直接引用 process.env。
2. 涉及密钥（API Key、Secret）的配置只允许在 src/server/api-proxy.js 中通过 loadEnv 读取并注入请求头，禁止在前端模块中直接使用。
3. 需要暴露给前端的非敏感配置才使用 import.meta.env.VITE_xxx，并在 useSettingsStore 的 DEFAULT_* 对象中提供回退默认值。
4. 修改 .env 后需重启 dev server，因为 loadEnv 仅在插件初始化时执行一次。
5. 如需新增外部服务代理，复制现有 /api/qwen 路由模板，在 configureServer 中追加中间件并声明对应 VITE_* 键。