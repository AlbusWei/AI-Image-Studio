# list — 输出格式

## 成功输出（stdout）

返回 JSON 数组，无结果时返回 `[]`。

```json
[
  {
    "id": 42,
    "model": "qwen-image-3",
    "prompt": "A cute orange cat sitting on windowsill",
    "favorite": false,
    "width": 1024,
    "height": 1024,
    "createdAt": 1719936000000,
    "hasImage": true,
    "hasThumbnail": true
  },
  {
    "id": 41,
    "model": "gpt-image-2",
    "prompt": "cyberpunk city at night",
    "favorite": true,
    "width": 1920,
    "height": 1088,
    "createdAt": 1719849600000,
    "hasImage": true,
    "hasThumbnail": true
  }
]
```

- 结果按创建时间倒序排列
- `--limit` 控制返回数量（默认 20）
- `--offset` 用于分页

## 错误输出（stderr，exit code 1）

### 文件夹不存在

```json
{
  "error": "NOT_FOUND",
  "message": "Folder not found: 项目A"
}
```

### 查询失败

```json
{
  "error": "LIST_FAILED",
  "message": "Network error: connection refused"
}
```
