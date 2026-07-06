# AGENTS.md

## Project

AI Image Studio — Electron 桌面应用，集成 Qwen Image 3 / GPT-image-2 / Nano Banana 2 三大图像生成模型。

## Tech Stack

- **Frontend:** React 18 + Vite 6 + Zustand + Immer
- **Desktop:** Electron 43
- **Database:** sql.js (SQLite WASM) / IndexedDB (Dexie.js, 浏览器模式)
- **Storage:** ali-oss (阿里云 OSS 增量备份)

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | 开发模式（Vite + Electron） |
| `npm run build` | 前端生产构建 |
| `npm run build:unpack` | Electron 免安装构建 |
| `npm run electron:build` | Electron 安装包构建 |

## Editing Rules

- Prefer editing source files over generated preview output.
- Preserve existing layout intent, copy, data, interaction flow, and responsive behavior unless the user asks for a redesign.
- Keep Canvas selection/source attributes when present, including `data-qoder-id` and `data-qoder-source`.
- Apply visual changes through tokens, CSS variables, Tailwind classes, or component styles.
- Do not replace the whole page with a new template unless explicitly requested.
- After meaningful edits, run the available typecheck/build/test command for this project and report any remaining risk.
# AGENTS.md

<!-- QODERWORK_CANVAS_HANDOFF_START -->
## QoderWork Canvas Handoff

This project was handed off from QoderWork Canvas to Qoder.

### Context

- Source: QoderWork Canvas
- Generated at: 2026-07-05T04:05:26.172Z
- Project root: react-vite
- Canvas frame id: ai-image-studio
- Canvas frame title: AI Image Studio
- Canvas frame kind: localhost
- Route: /

### Development

- Suggested dev command: `npm run dev`
- Last known dev URL: http://127.0.0.1:5173/

### Source Files

- react-vite/react-vite/src/App.jsx (entry)
- react-vite/react-vite/src/main.jsx (entry)
- react-vite/react-vite/src/styles.css (style)
- react-vite/react-vite/src/pages/Workbench.jsx#Workbench (route)
- react-vite/react-vite/src/pages/Gallery.jsx#Gallery (route)
- react-vite/react-vite/src/pages/KnowledgeBase.jsx#KnowledgeBase (route)
- react-vite/react-vite/src/pages/TaskCenter.jsx#TaskCenter (route)
- react-vite/react-vite/src/pages/Settings.jsx#Settings (route)
- react-vite/react-vite/src/pages/SetupWizard.jsx#SetupWizard (route)
- react-vite/react-vite/package.json (config)

### Editing Rules

- Prefer editing source files over generated preview output.
- Preserve existing layout intent, copy, data, interaction flow, and responsive behavior unless the user asks for a redesign.
- Keep Canvas selection/source attributes when present, including `data-qoder-id` and `data-qoder-source`.
- Apply visual changes through tokens, CSS variables, Tailwind classes, or component styles.
- Do not replace the whole page with a new template unless explicitly requested.
- After meaningful edits, run the available typecheck/build/test command for this project and report any remaining risk.
<!-- QODERWORK_CANVAS_HANDOFF_END -->

## CLI (Command Line Interface)

### 架构

CLI 是独立的 Node.js 进程，通过 HTTP 与 Electron main 进程中的 api-server 通信。

```
CLI (ais.mjs)
  │  HTTP (localhost:19527/api/*)
  ▼
api-server (api-server.cjs)  ←→  SQLite / 文件系统 / OSS
```

- **CLI 不直接访问数据库或文件系统**，所有操作通过 api-server REST 端点完成
- api-server 随 Electron 主进程启动，监听 `127.0.0.1:19527`
- CLI 复用前端 `src/services/api/` 中的 adapter 层（client.js + 各模型 adapter）

### 目录结构

```
bin/
├── ais.mjs          # CLI 入口 (commander)
├── setup.mjs        # 环境初始化 (dotenv + window mock + axios baseURL)
└── commands/
    ├── gen.mjs      # 生成图片 (T2I/I2I)
    ├── expand.mjs   # Prompt 扩写
    ├── list.mjs     # 查询图片列表
    ├── get.mjs      # 图片详情
    ├── stats.mjs    # 统计概览
    ├── batch.mjs    # 批量生成 (从文件读取 prompts)
    ├── delete.mjs   # 删除图片
    ├── move.mjs     # 移动到文件夹
    ├── favorite.mjs # 收藏切换
    ├── folders.mjs  # 文件夹管理 (list/add/rename/delete)
    └── tasks.mjs    # 任务管理 (list/stats)
```

### 调用方式

```bash
node bin/ais.mjs <command> [options]
```

**前置条件：** Electron 应用（或至少 api-server）必须在运行。

### 端口配置

| 优先级 | 来源 | 说明 |
|--------|------|------|
| 1 | `--port <port>` | CLI 命令行参数 |
| 2 | 默认 `19527` | 与 api-server 默认端口一致 |

### 命令详情

| 命令 | 用法 | 关键参数 | 说明 |
|------|------|----------|------|
| `gen` | `gen -p <text>` | `-p/--prompt`, `-m/--model`, `--size`, `--count`, `--seed`, `--image`, `--expand`, `--folder` | 生成图片（T2I/I2I），支持三大模型 |
| `expand` | `expand <prompt>` | `<prompt>` (位置参数), `-s/--style`, `-m/--model` | 调用 LLM 扩写提示词 |
| `list` | `list` | `-m/--model`, `-f/--folder`, `--favorite`, `--search`, `--limit`, `--offset` | 查询图片列表 |
| `get` | `get <id>` | `<id>` (位置参数) | 获取单张图片详情 |
| `stats` | `stats` | — | 图库统计概览 |
| `batch` | `batch -f <path>` | `-f/--file`, `-m/--model`, `--size`, `--expand`, `--folder` | 从文本文件批量读取 prompts 生成 |
| `delete` | `delete <ids...>` | `<ids...>` (位置参数), `--confirm` | 删除一张或多张图片 |
| `move` | `move <ids...> --folder <name>` | `<ids...>`, `--folder` (必填) | 移动图片到文件夹 |
| `favorite` | `favorite <id>` | `<id>` (位置参数) | 切换收藏状态（toggle） |
| `folders` | `folders list/add/rename/delete` | 子命令各异 | 文件夹 CRUD 管理 |
| `tasks` | `tasks list/stats` | `--status`, `--type` | 查看任务列表与统计 |

### 全局参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--port <port>` | api-server 端口 | 19527 |
| `--quiet` | 抑制 stderr 进度信息 | false |
| `--help` | 显示帮助 | — |

### 快速入门示例

```bash
# 生成图片
node bin/ais.mjs gen -p "一只橘猫坐在窗台"

# GPT-image-2 + 16:9
node bin/ais.mjs gen -p "cyberpunk city" -m gpt-image-2 --size 16:9

# 扩写提示词
node bin/ais.mjs expand "日落海边"

# 查询列表
node bin/ais.mjs list --limit 10

# 批量生成
node bin/ais.mjs batch -f prompts.txt --folder "风景系列"
```

详细用法参见 [CLI 用法指南](../docs/CLI-USAGE.md)
