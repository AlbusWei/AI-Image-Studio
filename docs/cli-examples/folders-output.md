# folders — 输出格式

## folders list

### 成功输出（stdout）

```json
[
  {
    "id": 1,
    "name": "风景系列",
    "parentId": null
  },
  {
    "id": 2,
    "name": "人物",
    "parentId": null
  },
  {
    "id": 3,
    "name": "子文件夹",
    "parentId": 1
  }
]
```

无文件夹时返回 `[]`。

## folders add

### 成功输出（stdout）

```json
{
  "id": 5,
  "name": "新文件夹"
}
```

## folders rename

### 成功输出（stdout）

```json
{
  "id": 5,
  "name": "新名称",
  "ok": true
}
```

## folders delete

### 成功输出（stdout）

```json
{
  "id": 5,
  "deleted": true
}
```

## 错误输出（stderr，exit code 1）

### 缺少名称

```json
{
  "error": "INVALID_PARAMS",
  "message": "Folder name is required"
}
```

### ID 无效

```json
{
  "error": "INVALID_PARAMS",
  "message": "Invalid folder ID: abc"
}
```

### 操作失败

```json
{
  "error": "FOLDERS_LIST_FAILED",
  "message": "Network error: connection refused"
}
```

```json
{
  "error": "FOLDERS_ADD_FAILED",
  "message": "..."
}
```

```json
{
  "error": "FOLDERS_RENAME_FAILED",
  "message": "..."
}
```

```json
{
  "error": "FOLDERS_DELETE_FAILED",
  "message": "..."
}
```
