---
kind: dependency_management
name: 前端依赖管理（npm + Vite）
category: dependency_management
scope:
    - '**'
source_files:
    - app/package.json
    - app/package-lock.json
---

本项目采用 npm 作为包管理器，通过 `app/package.json` 声明运行时与开发时依赖，并使用 `app/package-lock.json`（lockfileVersion 3）锁定精确版本，确保构建可重复。核心依赖集中在 React 18、Vite 6、Zustand 状态库、Dexie 本地数据库以及阿里云 OSS SDK 等；无私有仓库或 vendoring 策略，所有包均从 npm 官方源解析。

- 工具链：Vite 6 作为开发与构建工具，`@vitejs/plugin-react` 提供 JSX/TSX 支持，`dotenv` 用于加载 `.env`。
- 版本策略：统一使用 `^` 语义化版本范围，允许小版本自动升级；锁文件提交至仓库以保障团队一致性。
- 脚本约定：`dev`/`build`/`preview` 三个标准脚本，分别对应 Vite 的 dev server、生产构建与预览。
- 无额外约束：未发现 `.npmrc`、私有 registry、pnpm/yarn 替代方案或子模块隔离，依赖管理保持最小化配置。