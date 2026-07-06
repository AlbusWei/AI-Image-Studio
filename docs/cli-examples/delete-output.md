# delete — 输出格式

## 成功输出（stdout）

```json
{
  "deleted": [42, 43, 44],
  "count": 3
}
```

- `deleted`：已删除的图片 ID 数组
- `count`：删除数量

## 错误输出（stderr，exit code 1）

### ID 无效

```json
{
  "error": "INVALID_PARAMS",
  "message": "Invalid image ID(s): abc"
}
```

### 删除失败

```json
{
  "error": "DELETE_FAILED",
  "message": "Network error: connection refused"
}
```
