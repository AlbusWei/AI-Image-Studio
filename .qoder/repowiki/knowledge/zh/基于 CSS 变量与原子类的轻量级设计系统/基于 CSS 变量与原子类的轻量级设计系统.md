---
kind: frontend_style
name: 基于 CSS 变量与原子类的轻量级设计系统
category: frontend_style
scope:
    - '**'
source_files:
    - app/src/styles.css
    - app/src/components/ui/spark-tokens.css
    - app/src/components/ui/Button.jsx
    - app/src/components/ui/FormControls.jsx
    - app/src/main.jsx
---

## 1. 体系概览
本项目采用「CSS 自定义属性（Design Tokens）+ 全局原子类 + 少量 UI 组件封装」的轻量前端样式方案，未引入 Tailwind、styled-components、Emotion 等第三方样式框架。整体风格受 Linear 暗色美学启发，通过 `:root` 集中管理种子 token，并在 `[data-theme="light"]` 下提供亮色主题切换能力。

## 2. 核心文件与包
- `app/src/styles.css`：全局 Design Token 定义、基础 reset、通用组件原语（Button / Input / Card / Badge / Toast / Tabs / Toggle / Checkbox 等）、布局与排版原子类、动画与滚动条样式。
- `app/src/components/ui/spark-tokens.css`：将内部 token 以 `--spark-*` 前缀重新导出，作为“Spark 命名约定”桥接层，由 `main.jsx` 统一导入。
- `app/src/components/ui/Button.jsx`、`FormControls.jsx`：对原生元素做最小封装，仅负责组合已有 CSS class（如 `btn btn-primary btn-sm`），不内联样式逻辑。
- `app/src/main.jsx`：入口中按顺序引入 `styles.css` 与 `spark-tokens.css`，确保 token 在应用启动时可用。
- 依赖方面仅使用 React + Vite + lucide-react 图标库，无额外 CSS-in-JS 或 UI 库。

## 3. 架构与约定
- **Token 分层**
  - Seed tokens：`--seed-bg`、`--seed-fg`、`--seed-primary`、`--seed-accent`、`--seed-surface`、`--seed-radius` 等最底层值。
  - 语义化 token：`--bg-base`、`--text-primary`、`--accent-primary`、`--border-default`、`--radius-md`、`--sp-*`、`--fs-*`、`--shadow-*`、`--z-*` 等。
  - Alpha 调色板：`--alpha-3` ~ `--alpha-85` 及状态色 alpha 变体，统一控制透明度层级。
  - Spark 桥接：`--spark-color-*`、`--spark-spacing-*`、`--spark-font-*`、`--spark-shadow-*` 映射到内部 token，供外部/未来组件库消费。
- **主题策略**：通过 `data-theme="light"` 覆盖 `:root` 中的关键 token，实现一键亮/暗主题切换；默认暗色主题。
- **组件原语**：在 `styles.css` 中以 BEM 风格 class（`.btn`、`.input`、`.card`、`.badge`、`.toast`、`.tabs`、`.toggle`、`.checkbox` 等）暴露可复用视觉形态；React 组件仅做 class 拼接与 props → variant/size 映射。
- **原子类**：提供常用 flex/grid/spacing/typography/utility 类（`.flex`、`.gap-2`、`.p-4`、`.text-secondary`、`.truncate` 等），用于页面快速拼装布局。
- **无障碍与交互**：统一 `:focus-visible` 描边、`::selection` 高亮、`kbd` 键帽样式、tooltip 纯 CSS 实现、skeleton shimmer 动画等。
- **构建与加载**：Vite 直接打包静态 CSS，无 CSS Modules / CSS-in-JS 编译步骤；`main.jsx` 同步 import 保证首屏样式可用。

## 4. 开发者应遵循的规则
1. **优先使用 token**：颜色、间距、圆角、字号、阴影、z-index 一律通过 CSS 变量引用，禁止硬编码十六进制值。
2. **新增样式走 token 层**：若需新颜色/尺寸，先在 `:root` 补充 seed 与语义化 token，再在组件中使用。
3. **组件封装保持“薄”**：React 组件只负责 class 组合与 props 映射，不要写内联样式或动态 style 对象。
4. **主题兼容**：新增 token 时需同时考虑 `[data-theme="light"]` 下的覆盖值，避免亮色模式下对比度异常。
5. **原子类优先于重复样式**：布局与排版尽量复用 `.flex`、`.gap-*`、`.p-*`、`.text-*` 等原子类，减少重复 CSS。
6. **Spark 命名约定**：对外暴露或未来组件库消费时，使用 `--spark-*` 前缀的 token，保持命名空间隔离。
7. **无障碍基线**：按钮/开关/复选框等交互元素需提供 `aria-*` 属性，并使用统一的 `:focus-visible` 样式。