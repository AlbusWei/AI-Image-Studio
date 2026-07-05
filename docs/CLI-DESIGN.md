# CLI 设计文档 — AI Image Studio Command Line Interface

## 概述

CLI（ais）是 AI Image Studio 的命令行入口，让 QoderWork agent 或终端用户通过 Bash 命令执行生图、查询、管理等操作。CLI 作为薄客户端，通过 HTTP 调用 Electron api-server 已暴露的 REST API，复用现有 adapter 类，零重复代码。

**调用方式：**
```bash
# 开发模式
node app/bin/ais.mjs <command> [options]

# 通过 npm script（后续添加）
npm run cli -- <command> [options]
```

---

## 全局参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--port <port>` | api-server 端口 | `AIS_PORT` 环境变量，或 19527 |
| `--json` | 强制 JSON 输出 | 默认就是 JSON |
| `--quiet` | 抑制 stderr 进度信息 | false |
| `--help` | 显示帮助 | — |

---

## 命令清单

### gen — 生成图片

**核心命令。** 提交生图任务，阻塞等待完成，输出结果 JSON。

```bash
node bin/ais.mjs gen --prompt "一只橘猫坐在窗台" --model qwen-image-3
node bin/ais.mjs gen --prompt "cyberpunk city" --model gpt-image-2 --size 16:9 --quality 2K
node bin/ais.mjs gen --prompt "watercolor flower" --model nanobanana-2 --expand
node bin/ais.mjs gen --prompt "style transfer" --model qwen-image-3 --image ./ref.jpg
node bin/ais.mjs gen --prompt "4 variations" --model gpt-image-2 --count 4
```

**参数：**

| 参数 | 必填 | 说明 | 默认值 |
|------|------|------|--------|
| `--prompt <text>` | 是 | 提示词 | — |
| `--model <id>` | 否 | 模型：`qwen-image-3` / `gpt-image-2` / `nanobanana-2` | `qwen-image-3` |
| `--size <ratio>` | 否 | 尺寸比例：`1:1` / `16:9` / `9:16` / `3:4` / `4:3` / `auto` | `1:1` |
| `--count <n>` | 否 | 一次生成数量（1-4，取决于模型） | 1 |
| `--quality <level>` | 否 | 质量档位（模型相关） | 模型默认 |
| `--expand` | 否 | 调用 LLM 扩写 prompt | false |
| `--image <path>` | 否 | 参考图本地路径（可多次指定） | — |
| `--seed <n>` | 否 | 种子值（-1 = 随机） | -1 |
| `--negative <text>` | 否 | 负面提示词（仅 Qwen） | — |
| `--no-prompt-extend` | 否 | 禁用 Qwen 内置 prompt_extend | false |
| `--folder <name>` | 否 | 自动归入指定文件夹（不存在则创建） | — |

**成功输出（stdout JSON）：**

单张：
```json
{
  "id": 42,
  "model": "qwen-image-3",
  "prompt": "A cute orange cat sitting on windowsill...",
  "originalPrompt": "一只橘猫坐在窗台",
  "filePath": "C:/Users/.../originals/42.png",
  "sourceUrl": "https://dashscope-result-bj.oss.../xxx.png",
  "width": 1024,
  "height": 1024,
  "batchId": 15,
  "duration": 45000
}
```

多张（--count > 1）：
```json
[
  { "id": 42, "model": "...", ... },
  { "id": 43, "model": "...", ... }
]
```

**失败输出（stderr JSON + exit code 1）：**
```json
{
  "error": "GENERATION_FAILED",
  "message": "Qwen T2I failed: [QwenAPI InvalidParameter] prompt contains sensitive content",
  "model": "qwen-image-3",
  "prompt": "..."
}
```

**gen 完整流程：**
1. 解析参数，加载 `.env`（dotenv）
2. 如果 `--expand`：调用 `LLMAdapter.expandPrompt()`，取第一个变体作为最终 prompt
3. 如果 `--image`：读取本地文件 → `fs.readFileSync` → `Buffer.toString('base64')` → 包装为 `data:image/png;base64,...`
4. 根据 `--model` 创建 adapter 实例
5. 判断 T2I 还是 I2I（有无 --image）
6. 调用 adapter 的 `generateText2Image` 或 `generateImage2Image`（阻塞等待）
7. 拿到 `{ images: [{ url }, ...] }` 结果
8. 对每张图片：
   a. `fetch(url)` 下载二进制
   b. POST `/api/db/images/add` 创建元数据记录
   c. PUT `/api/db/images/file/:id` 上传图片二进制
   d. PUT `/api/db/images/thumbnail/:id` 上传缩略图（或 POST generateThumbnail）
9. 如果 `--folder`：检查文件夹是否存在，不存在则 POST `/api/db/folders/add`，然后 POST `/api/db/images/move`
10. 输出 JSON 到 stdout，exit code 0

---

### expand — Prompt 扩写

调用 LLM（Qwen-max）将简短描述扩写为多个高质量提示词变体。

```bash
node bin/ais.mjs expand --prompt "日落海边"
node bin/ais.mjs expand --prompt "a cat" --style "watercolor"
```

**参数：**

| 参数 | 必填 | 说明 |
|------|------|------|
| `--prompt <text>` | 是 | 原始描述 |
| `--style <style>` | 否 | 风格偏好 |
| `--model <target>` | 否 | 目标生图模型（LLM 会考虑模型特点） |

**输出（stdout JSON）：**
```json
{
  "original": "日落海边",
  "variations": [
    "Golden sunset over a calm ocean, warm light reflecting...",
    "Dramatic sunset with fiery clouds over the sea...",
    "Soft pastel sunset at a tropical beach..."
  ]
}
```

---

### list — 查询图片列表

```bash
node bin/ais.mjs list
node bin/ais.mjs list --model gpt-image-2 --limit 10
node bin/ais.mjs list --favorite --folder "项目A"
node bin/ais.mjs list --search "猫咪"
```

**参数：**

| 参数 | 说明 |
|------|------|
| `--model <id>` | 按模型过滤 |
| `--folder <name>` | 按文件夹名过滤 |
| `--favorite` | 仅收藏 |
| `--search <keyword>` | 搜索 prompt/元数据 |
| `--limit <n>` | 返回数量上限（默认 20） |
| `--offset <n>` | 分页偏移 |

**输出（stdout JSON 数组）：**
```json
[
  {
    "id": 42,
    "model": "qwen-image-3",
    "prompt": "...",
    "favorite": false,
    "width": 1024,
    "height": 1024,
    "createdAt": 1719936000000,
    "hasImage": true,
    "hasThumbnail": true
  }
]
```

---

### get — 图片详情

```bash
node bin/ais.mjs get 42
```

**输出（stdout JSON）：**
包含完整元数据：prompt、params、seed、model、尺寸、创建时间、sourceUrl、filePath、收藏状态、所属文件夹等。

---

### stats — 统计概览

```bash
node bin/ais.mjs stats
```

**输出（stdout JSON）：**
```json
{
  "total": 156,
  "favorites": 23,
  "hot": 156,
  "warm": 0,
  "cold": 0,
  "totalSize": 524288000,
  "byModel": {
    "qwen-image-3": 89,
    "gpt-image-2": 45,
    "nanobanana-2": 22
  }
}
```

---

### delete — 删除图片

```bash
node bin/ais.mjs delete 42
node bin/ais.mjs delete 42 43 44
```

**输出：**
```json
{ "deleted": [42, 43, 44], "count": 3 }
```

---

### move — 移动图片到文件夹

```bash
node bin/ais.mjs move 42 43 --folder "项目A"
```

**输出：**
```json
{ "moved": [42, 43], "folder": { "id": 5, "name": "项目A" } }
```

---

### favorite — 收藏切换

```bash
node bin/ais.mjs favorite 42
```

**输出：**
```json
{ "id": 42, "favorite": true }
```

---

### folders — 文件夹管理

```bash
node bin/ais.mjs folders list
node bin/ais.mjs folders add "新文件夹"
node bin/ais.mjs folders add "子文件夹" --parent 3
node bin/ais.mjs folders rename 5 "新名称"
node bin/ais.mjs folders delete 5
```

---

### tasks — 任务管理

```bash
node bin/ais.mjs tasks list
node bin/ais.mjs tasks stats
```

---

### batch — 批量生成

```bash
node bin/ais.mjs batch --file prompts.txt --model qwen-image-3
node bin/ais.mjs batch --file prompts.txt --model gpt-image-2 --size 16:9
```

**输入文件 `prompts.txt` 格式：** 每行一个 prompt，空行和 `#` 开头的注释行忽略。

```
# 风景系列
日落时分的富士山，水彩画风格
星空下的冰岛黑沙滩
威尼斯运河的清晨，油画质感
```

**输出（stdout JSON 数组）：**
```json
[
  { "prompt": "日落时分的富士山...", "id": 50, "status": "completed" },
  { "prompt": "星空下的冰岛...", "id": 51, "status": "completed" },
  { "prompt": "威尼斯运河...", "id": 52, "status": "failed", "error": "..." }
]
```

**行为：** 顺序执行，逐条调用 gen 流程。某条失败不影响后续。最终汇总成功/失败数量。

---

## 环境兼容性

### Node.js 环境适配

CLI 在 Node.js 环境运行，需要处理以下与浏览器/Electron 环境的差异：

1. **axios baseURL：** `client.js` 的 interceptor 依赖 `window.electronAPI`，Node.js 无 window。CLI 需在 import 前设置 axios 全局 baseURL 为 `http://127.0.0.1:${port}/api`。

2. **环境变量：** `LLMAdapter` 使用 `import.meta.env.VITE_EXPANSION_LLM_MODEL`，Node.js 不支持。CLI 使用 dotenv 加载 `app/.env` 文件。

3. **ESM 兼容：** `app/package.json` 已设置 `"type": "module"`，CLI `.mjs` 文件可直接 import adapter。

4. **AbortController/AbortSignal：** Node.js 15+ 原生支持，无需 polyfill。

### 端口发现优先级

1. `--port <port>` 命令行参数
2. `AIS_PORT` 环境变量
3. 默认 19527（开发模式）

---

## 错误码定义

| exit code | 含义 |
|-----------|------|
| 0 | 成功 |
| 1 | 一般错误（API 失败、参数无效等） |
| 2 | api-server 不可达（ECONNREFUSED） |
| 3 | 模型 API 错误（内容违规、配额不足） |
| 4 | 文件操作失败（下载/上传失败） |
