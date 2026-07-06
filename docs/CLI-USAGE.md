# CLI 用法指南 — AI Image Studio

## 概述

CLI（`ais`）是 AI Image Studio 的命令行工具，让 QoderWork agent 或终端用户通过命令执行生图、查询、管理等操作。

**前提条件：** Electron 应用（或至少 api-server 进程）需要在运行。

## 调用方式

```bash
node app/bin/ais.mjs <command> [options]
```

## 全局参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--port <port>` | api-server 端口 | `AIS_PORT` 环境变量，或 19527 |
| `--json` | 强制 JSON 输出 | 默认启用 |
| `--quiet` | 抑制进度信息 | false |
| `--help` | 显示帮助 | — |

## 快速入门

```bash
# 生成一张图片
node app/bin/ais.mjs gen --prompt "一只橘猫坐在窗台"

# 用 GPT 生成 16:9 图片
node app/bin/ais.mjs gen --prompt "cyberpunk city" --model gpt-image-2 --size 16:9

# 查询最近生成的图片
node app/bin/ais.mjs list

# 查看统计
node app/bin/ais.mjs stats

# 批量生成
node app/bin/ais.mjs batch --file prompts.txt
```

---

## 命令参考

### gen — 生成图片

核心命令。提交生图任务，阻塞等待完成，输出结果 JSON。

```bash
node app/bin/ais.mjs gen --prompt <text> [options]
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

**示例：**

```bash
# 文生图（T2I）
node app/bin/ais.mjs gen --prompt "一只橘猫坐在窗台" --model qwen-image-3

# 指定尺寸和质量
node app/bin/ais.mjs gen --prompt "cyberpunk city" --model gpt-image-2 --size 16:9 --quality 2K

# 使用 LLM 扩写 prompt
node app/bin/ais.mjs gen --prompt "watercolor flower" --model nanobanana-2 --expand

# 图生图（I2I）— 传入参考图
node app/bin/ais.mjs gen --prompt "style transfer" --model qwen-image-3 --image ./ref.jpg

# 一次生成多张
node app/bin/ais.mjs gen --prompt "4 variations" --model gpt-image-2 --count 4
```

**成功输出（单张）：**

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

多张（`--count > 1`）时输出 JSON 数组。

**失败输出（stderr，exit code 1）：**

```json
{
  "error": "GENERATION_FAILED",
  "message": "Qwen T2I failed: [QwenAPI InvalidParameter] prompt contains sensitive content",
  "model": "qwen-image-3",
  "prompt": "..."
}
```

---

### expand — Prompt 扩写

调用 LLM 将简短描述扩写为多个高质量提示词变体。

```bash
node app/bin/ais.mjs expand --prompt <text> [options]
```

| 参数 | 必填 | 说明 |
|------|------|------|
| `--prompt <text>` | 是 | 原始描述 |
| `--style <style>` | 否 | 风格偏好 |
| `--model <target>` | 否 | 目标生图模型（LLM 会考虑模型特点） |

**输出：**

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
node app/bin/ais.mjs list [options]
```

| 参数 | 说明 |
|------|------|
| `--model <id>` | 按模型过滤 |
| `--folder <name>` | 按文件夹名过滤 |
| `--favorite` | 仅收藏 |
| `--search <keyword>` | 搜索 prompt/元数据 |
| `--limit <n>` | 返回数量上限（默认 20） |
| `--offset <n>` | 分页偏移 |

**示例：**

```bash
node app/bin/ais.mjs list --model gpt-image-2 --limit 10
node app/bin/ais.mjs list --favorite --folder "项目A"
node app/bin/ais.mjs list --search "猫咪"
```

**输出：**

```json
[
  {
    "id": 42, "model": "qwen-image-3", "prompt": "...",
    "favorite": false, "width": 1024, "height": 1024,
    "createdAt": 1719936000000, "hasImage": true, "hasThumbnail": true
  }
]
```

---

### get — 图片详情

```bash
node app/bin/ais.mjs get <id>
```

输出完整元数据 JSON，包含 prompt、params、seed、model、尺寸、创建时间、sourceUrl、filePath、收藏状态、所属文件夹等。

---

### stats — 统计概览

```bash
node app/bin/ais.mjs stats
```

**输出：**

```json
{
  "total": 156, "favorites": 23,
  "hot": 156, "warm": 0, "cold": 0,
  "totalSize": 524288000,
  "byModel": { "qwen-image-3": 89, "gpt-image-2": 45, "nanobanana-2": 22 }
}
```

---

### batch — 批量生成

```bash
node app/bin/ais.mjs batch --file <path> [options]
```

| 参数 | 必填 | 说明 |
|------|------|------|
| `--file <path>` | 是 | prompt 文件路径 |

此外接受 `gen` 的所有参数（`--model`、`--size`、`--folder` 等），应用于全部 prompt。

**输入文件格式（每行一个 prompt，`#` 开头为注释，空行忽略）：**

```
# 风景系列
日落时分的富士山，水彩画风格
星空下的冰岛黑沙滩
威尼斯运河的清晨，油画质感
```

**示例：**

```bash
node app/bin/ais.mjs batch --file prompts.txt --model qwen-image-3 --folder "批量任务"
```

**输出：**

```json
[
  { "prompt": "日落时分的富士山...", "id": 50, "status": "completed" },
  { "prompt": "星空下的冰岛...", "id": 51, "status": "completed" },
  { "prompt": "威尼斯运河...", "id": 52, "status": "failed", "error": "..." }
]
```

> 顺序执行，某条失败不影响后续。

---

### delete — 删除图片

```bash
node app/bin/ais.mjs delete <id> [id...]
```

支持批量删除。输出：`{ "deleted": [42, 43, 44], "count": 3 }`

---

### move — 移动图片到文件夹

```bash
node app/bin/ais.mjs move <id> [id...] --folder <name>
```

输出：`{ "moved": [42, 43], "folder": { "id": 5, "name": "项目A" } }`

---

### favorite — 收藏切换

```bash
node app/bin/ais.mjs favorite <id>
```

输出：`{ "id": 42, "favorite": true }`

---

### folders — 文件夹管理

```bash
node app/bin/ais.mjs folders list              # 列出所有文件夹
node app/bin/ais.mjs folders add "新文件夹"      # 创建文件夹
node app/bin/ais.mjs folders add "子文件夹" --parent 3  # 创建子文件夹
node app/bin/ais.mjs folders rename 5 "新名称"   # 重命名
node app/bin/ais.mjs folders delete 5           # 删除
```

---

### tasks — 任务管理

```bash
node app/bin/ais.mjs tasks list    # 查看任务列表
node app/bin/ais.mjs tasks stats   # 查看任务统计
```

---

## 端口配置

优先级（从高到低）：

1. `--port <port>` 命令行参数
2. `AIS_PORT` 环境变量
3. 默认 19527

## 错误码

| exit code | 含义 |
|-----------|------|
| 0 | 成功 |
| 1 | 一般错误（API 失败、参数无效） |
| 2 | api-server 不可达 |
| 3 | 模型 API 错误（内容违规、配额不足） |
| 4 | 文件操作失败 |

---

## 典型工作流

### Agent 生图场景

```bash
# 1. 生成图片
node app/bin/ais.mjs gen --prompt "sunset over mountains" --model qwen-image-3

# 2. 查看结果
node app/bin/ais.mjs list --limit 5

# 3. 收藏满意的
node app/bin/ais.mjs favorite 42

# 4. 归入文件夹
node app/bin/ais.mjs move 42 --folder "风景系列"
```

### 批量生图场景

```bash
# 准备 prompts.txt（每行一个 prompt，# 开头为注释）
# 然后执行
node app/bin/ais.mjs batch --file prompts.txt --model qwen-image-3 --folder "批量任务"
```
