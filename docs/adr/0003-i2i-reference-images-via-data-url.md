# I2I 参考图使用 base64 data URL 传递

CLI 的 I2I（图生图）流程需要把本地参考图传给远程模型 API。现有 adapter 的 `generateImage2Image` 方法接受 `imageUrls` 参数（URL 字符串数组）。

**决策：** CLI 读取本地文件，转为 base64 data URL（`data:image/png;base64,...`），直接传给 adapter。不复用 Electron 的 `blobUrlToDataUrl`（依赖浏览器 FileReader），而是用 Node.js 原生的 `fs.readFileSync` + `Buffer.toString('base64')`。

现有代码已验证此路径可行：GPTImageAdapter 的 `toDataUrl()` 辅助函数会将 base64 字符串包装为 data URL；`useGenerationStore` 的 `blobUrlToDataUrl()` 也在做同样的转换。EvoLink API 和 DashScope API 都接受 data URL 作为图片输入。

**Considered Options:**

- **上传到 OSS 拿公网 URL：** 可靠但增加延迟和复杂度，且需要 OSS 配置。
- **上传到 api-server 的 FileManager：** api-server 的 `saveImport` 存到本地磁盘，但返回的是本地路径，远程 API 无法访问。

选择 base64 data URL 的理由：零网络开销、零额外依赖、adapter 已支持。限制是图片大小——大图片（>10MB）的 base64 编码会让 HTTP 请求体膨胀，但参考图通常是普通尺寸，不构成问题。
