# get — 输出格式

## 成功输出（stdout）

返回完整的图片元数据对象，字段取决于数据库中存储的内容。典型输出：

```json
{
  "id": 42,
  "model": "qwen-image-3",
  "prompt": "A cute orange cat sitting on windowsill, soft morning light",
  "originalPrompt": "一只橘猫坐在窗台",
  "sourceUrl": "https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/xxx.png",
  "width": 1024,
  "height": 1024,
  "seed": -1,
  "aspectRatio": "1:1",
  "favorite": false,
  "folderId": null,
  "batchId": 15,
  "status": "completed",
  "storageZone": "hot",
  "blobSize": 524288,
  "duration": 45000,
  "params": {
    "size": "1024*1024",
    "n": 1,
    "seed": -1,
    "negative_prompt": "",
    "prompt_extend": true,
    "watermark": false
  },
  "createdAt": 1719936000000,
  "hasImage": true,
  "hasThumbnail": true
}
```

## 错误输出（stderr，exit code 1）

### ID 无效

```json
{
  "error": "INVALID_PARAMS",
  "message": "Invalid image ID: abc"
}
```

### 图片不存在

```json
{
  "error": "NOT_FOUND",
  "message": "Image not found: 999"
}
```

### 查询失败

```json
{
  "error": "GET_FAILED",
  "message": "Network error: connection refused"
}
```
