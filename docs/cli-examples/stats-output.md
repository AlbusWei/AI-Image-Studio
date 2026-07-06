# stats — 输出格式

## 成功输出（stdout）

返回统计对象，字段取决于数据库中的实际聚合结果。典型输出：

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

- `total`：图片总数
- `favorites`：收藏数
- `hot` / `warm` / `cold`：各存储区域的图片数
- `totalSize`：总占用字节数
- `byModel`：按模型分类的数量

## 错误输出（stderr，exit code 1）

```json
{
  "error": "STATS_FAILED",
  "message": "Network error: connection refused"
}
```
