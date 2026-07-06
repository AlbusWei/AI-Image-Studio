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
node app/bin/ais.mjs gen -p "一只橘猫坐在窗台"                              # 生成图片
node app/bin/ais.mjs gen -p "cyberpunk city" -m gpt-image-2 --size 16:9    # GPT 16:9
node app/bin/ais.mjs expand "日落海边"                                      # 扩写提示词
node app/bin/ais.mjs list                                                  # 查询图片
node app/bin/ais.mjs stats                                                 # 统计概览
node app/bin/ais.mjs batch -f prompts.txt                                  # 批量生成
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
| `-p, --prompt <text>` | 是 | 提示词 | — |
| `-m, --model <id>` | 否 | 模型：`qwen-image-3` / `gpt-image-2` / `nanobanana-2` | `qwen-image-3` |
| `--size <ratio>` | 否 | 尺寸比例：`1:1` / `16:9` / `9:16` / `3:4` / `4:3` / `auto` | `1:1` |
| `--count <n>` | 否 | 一次生成数量（1-4，取决于模型） | 1 |
| `--quality <level>` | 否 | 质量档位（模型相关） | 模型默认 |
| `--expand` | 否 | 调用 LLM 扩写 prompt | false |
| `--image <path...>` | 否 | 参考图本地路径（可多次指定） | — |
| `--seed <n>` | 否 | 种子值（-1 = 随机） | -1 |
| `--negative <text>` | 否 | 负面提示词（仅 Qwen） | — |
| `--no-prompt-extend` | 否 | 禁用 Qwen 内置 prompt_extend | false |
| `--folder <name>` | 否 | 自动归入指定文件夹（不存在则创建） | — |

**示例：**

```bash
# 文生图
node app/bin/ais.mjs gen -p "一只橘猫坐在窗台"
# 指定尺寸 + 模型
node app/bin/ais.mjs gen -p "cyberpunk city" -m gpt-image-2 --size 16:9
# LLM 扩写 + 生成
node app/bin/ais.mjs gen -p "watercolor flower" --expand
# 图生图
node app/bin/ais.mjs gen -p "style transfer" --image ./ref.jpg
# 多张 + 归入文件夹
node app/bin/ais.mjs gen -p "4 variations" --count 4 --folder "风景系列"
```

> 📋 完整输出格式见 [cli-examples/gen-output.md](cli-examples/gen-output.md)

### expand — Prompt 扩写

调用 LLM 将简短描述扩写为多个高质量提示词变体。

```bash
node app/bin/ais.mjs expand <prompt> [options]
```

**参数：**

| 参数 | 必填 | 说明 |
|------|------|------|
| `<prompt>` | 是 | 原始描述（位置参数） |
| `-s, --style <style>` | 否 | 风格偏好 |
| `-m, --model <id>` | 否 | 目标生图模型（LLM 会考虑模型特点） |

**示例：**

```bash
node app/bin/ais.mjs expand "日落海边"
node app/bin/ais.mjs expand "a cat" --style "watercolor"
```

> 📋 完整输出格式见 [cli-examples/expand-output.md](cli-examples/expand-output.md)

### list — 查询图片列表

```bash
node app/bin/ais.mjs list [options]
```

**参数：**

| 参数 | 说明 |
|------|------|
| `-m, --model <id>` | 按模型过滤 |
| `-f, --folder <name>` | 按文件夹名过滤 |
| `--favorite` | 仅收藏 |
| `--search <keyword>` | 搜索 prompt/元数据 |
| `--limit <n>` | 返回数量上限（默认 20） |
| `--offset <n>` | 分页偏移 |

**示例：**

```bash
node app/bin/ais.mjs list -m gpt-image-2 --limit 10
node app/bin/ais.mjs list --favorite -f "项目A"
node app/bin/ais.mjs list --search "猫咪"
```

> 📋 完整输出格式见 [cli-examples/list-output.md](cli-examples/list-output.md)

### get — 图片详情

```bash
node app/bin/ais.mjs get <id>
```

> 📋 完整输出格式见 [cli-examples/get-output.md](cli-examples/get-output.md)

### stats — 统计概览

```bash
node app/bin/ais.mjs stats
```

> 📋 完整输出格式见 [cli-examples/stats-output.md](cli-examples/stats-output.md)

### batch — 批量生成

```bash
node app/bin/ais.mjs batch -f <path> [options]
```

**参数：**

| 参数 | 必填 | 说明 |
|------|------|------|
| `-f, --file <path>` | 是 | prompt 文件路径 |

此外接受 `gen` 的大部分参数（`--model`、`--size`、`--folder`、`--expand` 等），应用于全部 prompt。

**输入文件格式（每行一个 prompt，`#` 开头为注释，空行忽略）：**

```
# 风景系列
日落时分的富士山，水彩画风格
星空下的冰岛黑沙滩
威尼斯运河的清晨，油画质感
```

**示例：**

```bash
node app/bin/ais.mjs batch -f prompts.txt -m qwen-image-3
node app/bin/ais.mjs batch -f prompts.txt -m gpt-image-2 --size 16:9 --folder "批量任务"
```

> 📋 完整输出格式见 [cli-examples/batch-output.md](cli-examples/batch-output.md)

### delete — 删除图片

```bash
node app/bin/ais.mjs delete <id> [id...]
```

支持批量删除：`node app/bin/ais.mjs delete 42 43 44`

> 📋 完整输出格式见 [cli-examples/delete-output.md](cli-examples/delete-output.md)

### move — 移动图片到文件夹

```bash
node app/bin/ais.mjs move <id> [id...] --folder <name>
```

> 📋 完整输出格式见 [cli-examples/move-output.md](cli-examples/move-output.md)

### favorite — 收藏切换

```bash
node app/bin/ais.mjs favorite <id>
```

每次调用翻转收藏状态（true → false 或 false → true）。

> 📋 完整输出格式见 [cli-examples/favorite-output.md](cli-examples/favorite-output.md)

### folders — 文件夹管理

```bash
# 列出所有文件夹
node app/bin/ais.mjs folders list

# 创建文件夹
node app/bin/ais.mjs folders add "新文件夹"

# 创建子文件夹（--parent 指定父文件夹 ID）
node app/bin/ais.mjs folders add "子文件夹" --parent 3

# 重命名
node app/bin/ais.mjs folders rename 5 "新名称"

# 删除
node app/bin/ais.mjs folders delete 5
```

> 📋 完整输出格式见 [cli-examples/folders-output.md](cli-examples/folders-output.md)

### tasks — 任务管理

```bash
# 查看任务列表
node app/bin/ais.mjs tasks list

# 按状态筛选
node app/bin/ais.mjs tasks list --status running

# 按类型筛选
node app/bin/ais.mjs tasks list --type generation

# 查看任务统计
node app/bin/ais.mjs tasks stats
```

> 📋 完整输出格式见 [cli-examples/tasks-output.md](cli-examples/tasks-output.md)

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
node app/bin/ais.mjs gen -p "sunset over mountains"

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
node app/bin/ais.mjs batch -f prompts.txt --folder "批量任务"
```

### 先扩写再生成

```bash
node app/bin/ais.mjs expand "日落海边" --style "水彩"
# 选择满意的变体进行生成
node app/bin/ais.mjs gen -p "Golden sunset over a calm ocean, watercolor style"
```

