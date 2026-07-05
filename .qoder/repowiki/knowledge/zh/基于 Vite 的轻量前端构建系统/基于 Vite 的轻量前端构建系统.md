---
kind: build_system
name: 基于 Vite 的轻量前端构建系统
category: build_system
scope:
    - '**'
source_files:
    - app/package.json
    - app/vite.config.js
    - app/src/server/api-proxy.js
    - app/.env
---

本项目采用极简的前端构建方案，围绕 Vite + React 展开，未引入 Makefile、Dockerfile、CI/CD 流水线或发布脚本等重型构建基础设施。

1. 使用的系统与工具
- 构建与开发服务器：Vite 6（`app/vite.config.js`），插件 `@vitejs/plugin-react` 提供 JSX/TSX 支持。
- 包管理与依赖：npm（`app/package.json`、`app/package-lock.json`），项目标记为 `private`，版本 `0.1.0`，`type: module`。
- 本地开发脚本：`dev` 启动 Vite dev server（host 127.0.0.1、端口 5173、strictPort）；`build` 执行生产打包；`preview` 预览产物。
- 自定义插件：通过 `src/server/api-proxy.js` 作为 Vite 插件注入，用于开发期 API 代理。
- 运行时依赖：React 18、react-router-dom、zustand、axios、dexie、ali-oss、immer、lucide-react、react-hotkeys-hook 等。
- 开发时依赖：dotenv（配合 `app/.env` 注入环境变量）。

2. 关键文件与位置
- `app/package.json`：定义入口脚本、依赖与版本。
- `app/vite.config.js`：注册 React 插件与自定义 api-proxy 插件，配置 dev server host/port/strictPort。
- `app/src/server/api-proxy.js`：Vite 自定义插件实现，承担开发期后端 API 转发职责。
- `app/.env`：开发环境变量（由 dotenv 在 dev 阶段加载）。
- `app/dist/`：`vite build` 产物的输出目录（已存在于仓库中）。

3. 架构与约定
- 单包结构：所有源码位于 `app/src`，无 monorepo 或多包拆分。
- 构建即静态站点：`vite build` 产出纯静态资源，部署到任意静态托管即可。
- 开发期代理：通过 Vite 插件而非独立 Node 服务完成 API 转发，简化本地联调链路。
- 无跨平台编译：仅面向浏览器端 JS/CSS/HTML，不涉及 C/C++/Rust 等 native 扩展或交叉编译。

4. 开发者应遵循的规则
- 新增依赖后统一通过 npm 安装并更新 `package.json` / `package-lock.json`，避免手动编辑 lock 文件。
- 环境变量统一写入 `app/.env`，并在需要时于 dev 脚本中启用 dotenv（当前 vite.config 未显式加载，需确保 dev 流程能读取）。
- 如需调整 dev server 行为（host/port/strictPort），集中修改 `app/vite.config.js`，不要散落在各脚本中。
- 自定义 Vite 插件放在 `app/src/server/` 下并通过 `plugins` 数组注册，保持构建配置单一事实来源。
- 由于仓库未包含 CI/Make/Docker 等自动化构建工件，任何发布或持续集成流程需在外部另行补充，不应假设已有现成流水线。