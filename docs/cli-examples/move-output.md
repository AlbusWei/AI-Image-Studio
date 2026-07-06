# move — 输出格式

## 成功输出（stdout）

```json
{
  "moved": [42, 43],
  "folder": {
    "id": 5,
    "name": "项目A"
  }
}
```

- `moved`：已移动的图片 ID 数组
- `folder`：目标文件夹信息（如文件夹不存在会自动创建）

## 错误输出（stderr，exit code 1）

### 缺少 --folder 参数

```json
{
  "error": "INVALID_PARAMS",
  "message": "--folder <name> is required"
}
```

### ID 无效

```json
{
  "error": "INVALID_PARAMS",
  "message": "Invalid image ID(s): abc"
}
```

### 移动失败

```json
{
  "error": "MOVE_FAILED",
  "message": "Network error: connection refused"
}
```
