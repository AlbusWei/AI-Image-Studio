# favorite — 输出格式

## 成功输出（stdout）

```json
{
  "id": 42,
  "favorite": true
}
```

- `favorite`：切换后的收藏状态（布尔值）
- 每次调用会翻转当前状态（true → false 或 false → true）

## 错误输出（stderr，exit code 1）

### ID 无效

```json
{
  "error": "INVALID_PARAMS",
  "message": "Invalid image ID: abc"
}
```

### 操作失败

```json
{
  "error": "FAVORITE_FAILED",
  "message": "Network error: connection refused"
}
```
