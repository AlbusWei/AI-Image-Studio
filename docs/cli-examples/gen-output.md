# gen — 输出格式

## 成功输出（stdout）

### 单张生成

```json
{
  "id": 42,
  "model": "qwen-image-3",
  "prompt": "A cute orange cat sitting on windowsill, soft morning light, detailed fur texture, photorealistic style",
  "originalPrompt": "一只橘猫坐在窗台",
  "filePath": null,
  "sourceUrl": "https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/xxx.png",
  "width": 1024,
  "height": 1024,
  "batchId": 15,
  "duration": 45000
}
```

- `id`：数据库中的图片 ID
- `originalPrompt`：仅在使用了 `--expand` 扩写时出现，否则省略
- `filePath`：由 Electron file-manager 填充，CLI 直接调用时为 `null`
- `duration`：生成耗时（毫秒）

### 多张生成（`--count > 1`）

```json
[
  {
    "id": 42,
    "model": "gpt-image-2",
    "prompt": "cyberpunk city at night",
    "sourceUrl": "https://...",
    "width": 1920,
    "height": 1088,
    "batchId": 16,
    "duration": 62000
  },
  {
    "id": 43,
    "model": "gpt-image-2",
    "prompt": "cyberpunk city at night",
    "sourceUrl": "https://...",
    "width": 1920,
    "height": 1088,
    "batchId": 16,
    "duration": 62000
  }
]
```

### 持久化失败时（图片仍可用但 id 为空）

```json
{
  "id": null,
  "model": "qwen-image-3",
  "prompt": "...",
  "sourceUrl": "https://...",
  "width": 1024,
  "height": 1024,
  "batchId": 17,
  "duration": 38000,
  "error": "Failed to upload image binary"
}
```

## 错误输出（stderr，exit code 非 0）

### 参数错误（exit code 1）

```json
{
  "error": "INVALID_PARAMS",
  "message": "--prompt is required"
}
```

```json
{
  "error": "INVALID_PARAMS",
  "message": "Unknown model: foo-model. Valid: qwen-image-3, gpt-image-2, nanobanana-2"
}
```

```json
{
  "error": "INVALID_PARAMS",
  "message": "--count 5 out of range [1-4] for gpt-image-2"
}
```

### 生成失败 — 模型 API 错误（exit code 3）

```json
{
  "error": "GENERATION_FAILED",
  "message": "Qwen T2I failed: [QwenAPI InvalidParameter] prompt contains sensitive content",
  "model": "qwen-image-3",
  "prompt": "..."
}
```

### 生成失败 — 其他错误（exit code 1）

```json
{
  "error": "GENERATION_FAILED",
  "message": "Adapter returned no images",
  "model": "qwen-image-3",
  "prompt": "..."
}
```

### 参考图读取失败（exit code 4）

```json
{
  "error": "FILE_ERROR",
  "message": "Failed to read reference image: Reference image not found: C:\\path\\to\\missing.jpg"
}
```
