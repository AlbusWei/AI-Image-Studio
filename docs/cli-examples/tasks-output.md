# tasks — 输出格式

## tasks list

### 成功输出（stdout）

返回任务数组，无任务时返回 `[]`。

```json
[
  {
    "id": 10,
    "type": "generation",
    "status": "completed",
    "prompt": "日落时分的富士山",
    "model": "qwen-image-3",
    "createdAt": 1719936000000,
    "completedAt": 1719936045000
  },
  {
    "id": 11,
    "type": "generation",
    "status": "running",
    "prompt": "星空下的冰岛黑沙滩",
    "model": "qwen-image-3",
    "createdAt": 1719936100000,
    "completedAt": null
  }
]
```

支持 `--status` 和 `--type` 筛选：

```bash
node app/bin/ais.mjs tasks list --status running
node app/bin/ais.mjs tasks list --type generation
```

## tasks stats

### 成功输出（stdout）

返回统计对象，字段取决于实际聚合结果。

```json
{
  "total": 50,
  "queued": 2,
  "running": 1,
  "completed": 45,
  "failed": 2
}
```

## 错误输出（stderr，exit code 1）

```json
{
  "error": "TASKS_LIST_FAILED",
  "message": "Network error: connection refused"
}
```

```json
{
  "error": "TASKS_STATS_FAILED",
  "message": "Network error: connection refused"
}
```
