# batch — 输出格式

## 成功输出（stdout）

返回 JSON 数组，每条对应一个 prompt 的处理结果。

```json
[
  {
    "prompt": "日落时分的富士山，水彩画风格",
    "id": 50,
    "status": "completed"
  },
  {
    "prompt": "星空下的冰岛黑沙滩",
    "id": 51,
    "status": "completed"
  },
  {
    "prompt": "威尼斯运河的清晨，油画质感",
    "id": null,
    "status": "failed",
    "error": "Qwen T2I failed: prompt contains sensitive content"
  }
]
```

- 顺序执行，某条失败不影响后续
- `id` 为 `null` 表示该条生成失败
- 执行完成后 stderr 会输出汇总：`[batch] Complete: 2/3 succeeded, 1 failed`

### 空文件时

```json
[]
```

## 错误输出（stderr，exit code 非 0）

### 缺少 --file 参数（exit code 1）

```json
{
  "error": "INVALID_PARAMS",
  "message": "--file is required (path to prompts text file)"
}
```

### 文件读取失败（exit code 4）

```json
{
  "error": "FILE_ERROR",
  "message": "Prompts file not found: C:\\path\\to\\prompts.txt"
}
```
