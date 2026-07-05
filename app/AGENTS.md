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
