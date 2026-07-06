# expand — 输出格式

## 成功输出（stdout）

```json
{
  "original": "日落海边",
  "variations": [
    "Golden sunset over a calm ocean, warm light reflecting on gentle waves, photorealistic, cinematic composition",
    "Dramatic sunset with fiery clouds over the sea, deep orange and purple hues, wide angle lens",
    "Soft pastel sunset at a tropical beach, palm tree silhouettes, dreamy atmosphere, watercolor style"
  ]
}
```

- `original`：用户输入的原始提示词
- `variations`：LLM 生成的扩写变体数组（通常 3 条）

## 错误输出（stderr，exit code 1）

### 缺少参数

```json
{
  "error": "INVALID_PARAMS",
  "message": "prompt argument is required"
}
```

### 扩写失败

```json
{
  "error": "EXPAND_FAILED",
  "message": "LLM returned no variations"
}
```

```json
{
  "error": "EXPAND_FAILED",
  "message": "LLM adapter connection timeout"
}
```
