# SQLite 数据库层

<cite>
**本文引用的文件**
- [app/electron/database/index.cjs](file://app/electron/database/index.cjs)
- [app/electron/database/queries.cjs](file://app/electron/database/queries.cjs)
- [app/electron/database/schema.cjs](file://app/electron/database/schema.cjs)
- [app/src/db/database.js](file://app/src/db/database.js)
- [app/src/db/dexie-backend.js](file://app/src/db/dexie-backend.js)
- [app/src/db/electron-backend.js](file://app/src/db/electron-backend.js)
- [app/electron/main.cjs](file://app/electron/main.cjs)
- [app/electron/preload.cjs](file://app/electron/preload.cjs)
- [app/electron/ipc-handlers.cjs](file://app/electron/ipc-handlers.cjs)
- [app/electron/file-manager.cjs](file://app/electron/file-manager.cjs)
</cite>

## 更新摘要
**变更内容**
- 增强了 Electron 后端的缩略图 blob 处理功能，支持 ArrayBuffer、TypedArray 和 Node.js Buffer 格式
- 改进了 MIME 类型处理机制，确保正确的图像格式识别
- 优化了二进制数据传输的兼容性，提升 IPC 通信稳定性

## 目录
1. [简介](#简介)
2. [项目结构](#项目结构)
3. [核心组件](#核心组件)
4. [架构总览](#架构总览)
5. [详细组件分析](#详细组件分析)
6. [依赖关系分析](#依赖关系分析)
7. [性能与一致性](#性能与一致性)
8. [故障排查指南](#故障排查指南)
9. [结论](#结论)
10. [附录：数据模型](#附录数据模型)

## 简介
本仓库的"SQLite 数据库层"采用策略模式，在 Electron 环境下通过 sql.js（WASM）运行 SQLite，并在渲染进程通过 IPC 调用主进程的查询封装；在非 Electron 环境（浏览器）下则回退到 Dexie（IndexedDB）。该设计使得上层业务代码无需感知底层存储差异。

**更新** 增强了缩略图 blob 处理的兼容性，现在支持多种二进制数据格式并具备更完善的 MIME 类型处理能力。

## 项目结构
围绕数据库层的文件组织如下：
- 主进程侧（Electron main）
  - 初始化与生命周期管理：index.cjs
  - SQL 查询封装：queries.cjs
  - 表结构与索引定义：schema.cjs
  - 文件系统管理：file-manager.cjs
  - 应用启动、IPC 注册与关闭流程：main.cjs、ipc-handlers.cjs、preload.cjs
- 渲染进程侧（Renderer）
  - 统一门面与后端选择：database.js
  - Dexie 后端实现：dexie-backend.js
  - Electron 后端实现（IPC 代理）：electron-backend.js

```mermaid
graph TB
subgraph "渲染进程"
DBFacade["database.js<br/>统一门面"]
DexieBackend["dexie-backend.js<br/>Dexie( IndexedDB )"]
ElectronBackend["electron-backend.js<br/>IPC 代理 + Blob 处理"]
end
subgraph "主进程"
Preload["preload.cjs<br/>暴露 electronAPI"]
IPC["ipc-handlers.cjs<br/>db:* 通道映射"]
Queries["queries.cjs<br/>SQL 封装"]
Schema["schema.cjs<br/>DDL 定义"]
IndexCJS["index.cjs<br/>sql.js 实例/持久化"]
FileManager["file-manager.cjs<br/>文件系统 + Buffer 处理"]
end
DBFacade --> |Electron| ElectronBackend
DBFacade --> |Browser| DexieBackend
ElectronBackend --> Preload
Preload --> IPC
IPC --> Queries
Queries --> IndexCJS
Queries --> Schema
ElectronBackend --> FileManager
FileManager --> IPC
```

**图表来源**
- [app/src/db/database.js:1-98](file://app/src/db/database.js#L1-L98)
- [app/src/db/dexie-backend.js:1-310](file://app/src/db/dexie-backend.js#L1-L310)
- [app/src/db/electron-backend.js:1-346](file://app/src/db/electron-backend.js#L1-L346)
- [app/electron/preload.cjs:1-88](file://app/electron/preload.cjs#L1-L88)
- [app/electron/ipc-handlers.cjs:1-63](file://app/electron/ipc-handlers.cjs#L1-L63)
- [app/electron/database/queries.cjs:1-721](file://app/electron/database/queries.cjs#L1-L721)
- [app/electron/database/schema.cjs:1-115](file://app/electron/database/schema.cjs#L1-L115)
- [app/electron/database/index.cjs:1-93](file://app/electron/database/index.cjs#L1-L93)
- [app/electron/file-manager.cjs:1-196](file://app/electron/file-manager.cjs#L1-L196)

**章节来源**
- [app/src/db/database.js:1-98](file://app/src/db/database.js#L1-L98)
- [app/electron/main.cjs:70-126](file://app/electron/main.cjs#L70-L126)

## 核心组件
- 门面与后端选择（database.js）
  - 根据 window.electronAPI.db 是否存在自动选择 Electron 或 Dexie 后端
  - 提供统一的函数导出，屏蔽底层差异
- Electron 后端（electron-backend.js）
  - 将渲染进程调用转换为 IPC 请求，并归一化返回值以匹配 Dexie 行为
  - **增强** 负责图片二进制与缩略图的 ArrayBuffer、TypedArray、Buffer 格式转换
  - **改进** 实现了完善的 MIME 类型处理和错误恢复机制
- 主进程数据库层（index.cjs + queries.cjs + schema.cjs）
  - index.cjs：加载 sql.js、创建/打开数据库、WAL 模式尝试、延迟持久化与关闭
  - schema.cjs：定义 images、batches、sessions、folders、tasks、settings、casePackages 七张表及索引
  - queries.crs：面向业务的 CRUD、统计、搜索等 SQL 封装，并对 JSON data 列进行打包/解包
- 文件系统管理器（file-manager.cjs）
  - **新增** 增强的 Buffer.from() 处理，支持跨进程二进制数据传输
  - 统一管理原图、缩略图和导入文件的存储与读取

**章节来源**
- [app/src/db/database.js:22-30](file://app/src/db/database.js#L22-L30)
- [app/src/db/electron-backend.js:8-44](file://app/src/db/electron-backend.js#L8-L44)
- [app/electron/database/index.cjs:19-45](file://app/electron/database/index.cjs#L19-L45)
- [app/electron/database/schema.cjs:6-112](file://app/electron/database/schema.cjs#L6-L112)
- [app/electron/database/queries.cjs:1-116](file://app/electron/database/queries.cjs#L1-L116)
- [app/electron/file-manager.cjs:143-196](file://app/electron/file-manager.cjs#L143-L196)

## 架构总览
下图展示了从渲染进程发起一次"获取图片列表"的端到端调用链，包括增强的 blob 处理流程。

```mermaid
sequenceDiagram
participant UI as "渲染进程<br/>业务代码"
participant Facade as "database.js"
participant EB as "electron-backend.js"
participant PL as "preload.cjs"
participant IPC as "ipc-handlers.cjs"
participant Q as "queries.cjs"
participant IDX as "index.cjs(sql.js)"
participant SCH as "schema.cjs"
participant FM as "file-manager.cjs"
UI->>Facade : getImages(opts)
Facade->>EB : getImages(opts)
EB->>PL : ipcRenderer.invoke('db : images : list', opts)
PL-->>IPC : 'db : images : list'
IPC->>Q : getImages(opts)
Q->>IDX : prepare/exec SQL
IDX-->>Q : rows
Q-->>IPC : 结果集
IPC-->>PL : 返回
PL-->>EB : 返回
EB->>FM : fs.readThumbnail(id)
FM-->>EB : {buffer, mimeType}
EB->>EB : 构建 Blob (支持 ArrayBuffer/TypedArray)
EB-->>UI : 归一化后的结果
```

**图表来源**
- [app/src/db/database.js:34-43](file://app/src/db/database.js#L34-L43)
- [app/src/db/electron-backend.js:71-103](file://app/src/db/electron-backend.js#L71-L103)
- [app/electron/preload.cjs:13](file://app/electron/preload.cjs#L13)
- [app/electron/ipc-handlers.cjs:17](file://app/electron/ipc-handlers.cjs#L17)
- [app/electron/database/queries.cjs:217-257](file://app/electron/database/queries.cjs#L217-L257)
- [app/electron/database/index.cjs:19-45](file://app/electron/database/index.cjs#L19-L45)
- [app/electron/database/schema.cjs:6-112](file://app/electron/database/schema.cjs#L6-L112)
- [app/electron/file-manager.cjs:172-182](file://app/electron/file-manager.cjs#L172-L182)

## 详细组件分析

### 增强的 Blob 处理与缓冲区转换（electron-backend.js）
**更新** Electron 后端现在提供了全面的二进制数据处理能力：

- **blobToBuffer 辅助函数**
  - 支持 ArrayBuffer、Uint8Array 和 Blob 类型的输入
  - 自动检测数据类型并进行相应转换
  - 为 IPC 传输提供标准化的 ArrayBuffer 输出

- **readBlob 增强函数**
  - 智能处理多种返回格式：ArrayBuffer、对象包装的 buffer+mimeType
  - 自动推断 MIME 类型，默认使用 'image/png'
  - 完善的错误处理和异常恢复机制

- **缩略图处理优化**
  - 在 getImages 中批量加载缩略图时，正确处理 Uint8Array 到 ArrayBuffer 的转换
  - 支持动态 MIME 类型设置，默认为 'image/jpeg'
  - 自动生成 URL.createObjectURL 用于前端显示

```mermaid
flowchart TD
Start(["接收二进制数据"]) --> CheckType{"检查数据类型"}
CheckType --> |ArrayBuffer| ReturnAB["直接返回 ArrayBuffer"]
CheckType --> |Uint8Array| ConvertAB["转换为 ArrayBuffer"]
CheckType --> |Blob| AsyncConvert["异步转换为 ArrayBuffer"]
CheckType --> |其他| Error["抛出错误"]
ReturnAB --> ProcessMIME["处理 MIME 类型"]
ConvertAB --> ProcessMIME
AsyncConvert --> ProcessMIME
ProcessMIME --> CreateBlob["创建 Blob 对象"]
CreateBlob --> ReturnResult["返回结果"]
Error --> ReturnNull["返回 null"]
```

**图表来源**
- [app/src/db/electron-backend.js:13-37](file://app/src/db/electron-backend.js#L13-L37)

**章节来源**
- [app/src/db/electron-backend.js:13-37](file://app/src/db/electron-backend.js#L13-L37)
- [app/src/db/electron-backend.js:87-103](file://app/src/db/electron-backend.js#L87-L103)

### 增强的文件系统 IPC 处理（file-manager.cjs）
**更新** 文件系统管理器现在具备更强的 Buffer 处理能力：

- **Buffer.from() 安全转换**
  - 所有 IPC 接收的二进制数据都通过 Buffer.from(buffer) 进行转换
  - 确保跨进程数据传输的兼容性和安全性
  - 支持各种 ArrayBuffer 视图类型的输入

- **MIME 类型智能处理**
  - 原图读取时自动检测文件扩展名并设置正确的 MIME 类型
  - 缩略图固定使用 'image/jpeg' 格式
  - 导入文件支持自定义扩展名参数

- **增强的错误处理**
  - 文件不存在时的优雅降级
  - 磁盘 I/O 错误的捕获和处理
  - 完整的日志记录便于调试

**章节来源**
- [app/electron/file-manager.cjs:143-196](file://app/electron/file-manager.cjs#L143-L196)
- [app/electron/file-manager.cjs:34-73](file://app/electron/file-manager.cjs#L34-L73)

### 主进程数据库初始化与生命周期（index.cjs）
- 使用 sql.js 初始化数据库实例，优先从用户数据目录加载已有 .db 文件，否则新建
- 尝试开启 WAL 模式（兼容处理），随后执行 schema.cjs 提供的 DDL
- 提供 scheduleSave/saveDatabase/closeDatabase 等接口，写入后 300ms 防抖落盘，关闭时强制保存并释放资源

```mermaid
flowchart TD
Start(["initDatabase(userDataPath)"]) --> LoadSQL["加载 sql.js WASM"]
LoadSQL --> EnsureDir["确保用户数据目录存在"]
EnsureDir --> Exists{"是否已存在 db 文件?"}
Exists --> |是| ReadFile["读取文件为 Buffer"]
Exists --> |否| NewDB["创建空数据库"]
ReadFile --> OpenDB["new SQL.Database(buffer)"]
NewDB --> OpenDB
OpenDB --> TryWAL["PRAGMA journal_mode=WAL (忽略错误)"]
TryWAL --> RunSchema["执行 schema.cjs.getDDL()"]
RunSchema --> SaveNow["立即 saveDatabase()"]
SaveNow --> ReturnDB["返回 db 实例"]
```

**图表来源**
- [app/electron/database/index.cjs:19-45](file://app/electron/database/index.cjs#L19-L45)
- [app/electron/database/schema.cjs:6-112](file://app/electron/database/schema.cjs#L6-L112)

**章节来源**
- [app/electron/database/index.cjs:19-93](file://app/electron/database/index.cjs#L19-L93)

### 表结构与索引（schema.cjs）
- 七张核心表：images、batches、sessions、folders、tasks、settings、casePackages
- 针对常用查询字段建立复合/单列索引，如 folderId+createdAt、status+createdAt、favorite、model、batchId、storageZone 等
- 大量扩展字段通过 JSON data 列存储，避免频繁变更表结构

**章节来源**
- [app/electron/database/schema.cjs:6-112](file://app/electron/database/schema.cjs#L6-L112)

### 查询封装与数据建模（queries.cjs）
- 统一的数据打包/解包
  - packImageData/unpackImageRow：将非索引字段合并入 data JSON 列，读取时反序列化并合并到行对象
  - buildImageUpdateClauses：动态生成 UPDATE SET 子句，区分索引列与 data JSON 更新
- 典型操作
  - addImage/updateImage/deleteImage/getImages/searchImages/toggleImageFavorite/moveImages
  - batches/sessions/folders/tasks/settings/casePackages 的增删改查与统计
- 写操作均触发 scheduleSave() 进行延迟持久化

```mermaid
classDiagram
class Queries {
+addImage(image)
+updateImage(id, changes)
+deleteImage(id)
+getImages(opts)
+searchImages(keyword)
+toggleImageFavorite(id)
+moveImages(ids, folderId)
+getImageStats()
+addBatch(batch)
+getBatches(sessionId)
+addSession()
+getSessions()
+addFolder(folder)
+getFolders()
+updateFolder(id, changes)
+deleteFolder(id)
+addTask(task)
+updateTask(id, changes)
+getTasks(filter)
+deleteTask(id)
+getTaskStats()
+getAllSettings()
+setSetting(key, value)
+getSetting(key)
+addCasePackage(pkg)
+getCasePackages()
+updateCasePackage(id, changes)
+deleteCasePackage(id)
}
class IndexCJS {
+getDb()
+scheduleSave()
+saveDatabase()
+closeDatabase()
}
class Schema {
+getDDL()
}
Queries --> IndexCJS : "使用"
Queries --> Schema : "DDL"
```

**图表来源**
- [app/electron/database/queries.cjs:1-721](file://app/electron/database/queries.cjs#L1-L721)
- [app/electron/database/index.cjs:51-93](file://app/electron/database/index.cjs#L51-L93)
- [app/electron/database/schema.cjs:6-112](file://app/electron/database/schema.cjs#L6-L112)

**章节来源**
- [app/electron/database/queries.cjs:1-721](file://app/electron/database/queries.cjs#L1-L721)

### 渲染进程后端选择与归一化（database.js + electron-backend.js + dexie-backend.js）
- database.js 作为门面，根据运行时环境选择后端，并导出一致的 API
- electron-backend.js 负责：
  - **增强** 将 Blob/ArrayBuffer/TypedArray 与文件系统交互（图片与缩略图）
  - **改进** 对返回值做归一化（例如自增 ID、统计字段名对齐）
  - 对部分能力缺失（如 deleteBatch）给出降级处理
- dexie-backend.js 提供 IndexedDB 等价实现，保持相同方法签名与返回形态

```mermaid
sequenceDiagram
participant App as "业务代码"
participant DBF as "database.js"
participant EBE as "electron-backend.js"
participant PL as "preload.cjs"
participant IPC as "ipc-handlers.cjs"
participant Q as "queries.cjs"
participant FM as "file-manager.cjs"
App->>DBF : addImage({imageBlob,...})
DBF->>EBE : addImage(...)
EBE->>EBE : 分离 metadata 与 blobs
EBE->>EBE : blobToBuffer() 转换
EBE->>Q : db.addImage(metadata)
Q-->>EBE : {id}
EBE->>PL : fs.saveImage(id, buffer, mime)
PL->>IPC : 'fs : image : save'
IPC->>FM : Buffer.from(buffer)
FM-->>IPC : 文件路径
IPC-->>PL : 返回
PL-->>EBE : 返回
EBE-->>App : 返回 id
```

**图表来源**
- [app/src/db/database.js:22-30](file://app/src/db/database.js#L22-L30)
- [app/src/db/electron-backend.js:48-69](file://app/src/db/electron-backend.js#L48-L69)
- [app/electron/preload.cjs:54-55](file://app/electron/preload.cjs#L54-L55)
- [app/electron/ipc-handlers.cjs:12](file://app/electron/ipc-handlers.cjs#L12)
- [app/electron/database/queries.cjs:122-163](file://app/electron/database/queries.cjs#L122-L163)
- [app/electron/file-manager.cjs:144-146](file://app/electron/file-manager.cjs#L144-L146)

**章节来源**
- [app/src/db/database.js:1-98](file://app/src/db/database.js#L1-L98)
- [app/src/db/electron-backend.js:1-346](file://app/src/db/electron-backend.js#L1-L346)
- [app/src/db/dexie-backend.js:1-310](file://app/src/db/dexie-backend.js#L1-L310)

### 应用启动与 IPC 注册（main.cjs + preload.cjs + ipc-handlers.cjs）
- main.cjs 在 app.whenReady 中：
  - 初始化数据库（index.cjs）
  - 注册数据库 IPC handlers（ipc-handlers.cjs）
  - **新增** 初始化文件系统存储层（file-manager.cjs）
  - **新增** 注册文件操作 IPC handlers
  - 注册 app:// 自定义协议
  - 启动 API 代理与 OSS 同步
  - 创建主窗口，并在首次页面加载完成后执行迁移
- preload.cjs 向渲染进程暴露 electronAPI.db 与 electronAPI.fs
- ipc-handlers.cjs 将 db:* 通道映射到 queries.cjs 的具体函数

**章节来源**
- [app/electron/main.cjs:70-126](file://app/electron/main.cjs#L70-L126)
- [app/electron/preload.cjs:1-88](file://app/electron/preload.cjs#L1-L88)
- [app/electron/ipc-handlers.cjs:1-63](file://app/electron/ipc-handlers.cjs#L1-L63)

## 依赖关系分析
- 模块耦合
  - queries.cjs 强依赖 index.cjs 的 getDb/scheduleSave
  - queries.cjs 依赖 schema.cjs 的 DDL
  - electron-backend.js 依赖 preload.cjs 暴露的 IPC 通道
  - electron-backend.js **新增** 依赖 file-manager.cjs 进行文件系统操作
  - database.js 同时依赖两个后端工厂，按环境选择
- 外部依赖
  - sql.js（WASM）用于在主进程内运行 SQLite
  - Dexie 用于浏览器环境的 IndexedDB 抽象

```mermaid
graph LR
DatabaseJS["database.js"] --> ElectronBackend["electron-backend.js"]
DatabaseJS --> DexieBackend["dexie-backend.js"]
ElectronBackend --> Preload["preload.cjs"]
ElectronBackend --> FileManager["file-manager.cjs"]
Preload --> IPC["ipc-handlers.cjs"]
IPC --> Queries["queries.cjs"]
Queries --> IndexCJS["index.cjs"]
Queries --> Schema["schema.cjs"]
FileManager --> IPC
```

**图表来源**
- [app/src/db/database.js:1-98](file://app/src/db/database.js#L1-L98)
- [app/src/db/electron-backend.js:1-346](file://app/src/db/electron-backend.js#L1-L346)
- [app/src/db/dexie-backend.js:1-310](file://app/src/db/dexie-backend.js#L1-L310)
- [app/electron/preload.cjs:1-88](file://app/electron/preload.cjs#L1-L88)
- [app/electron/ipc-handlers.cjs:1-63](file://app/electron/ipc-handlers.cjs#L1-L63)
- [app/electron/database/queries.cjs:1-721](file://app/electron/database/queries.cjs#L1-L721)
- [app/electron/database/index.cjs:1-93](file://app/electron/database/index.cjs#L1-L93)
- [app/electron/database/schema.cjs:1-115](file://app/electron/database/schema.cjs#L1-L115)
- [app/electron/file-manager.cjs:1-196](file://app/electron/file-manager.cjs#L1-L196)

## 性能与一致性
- 延迟持久化
  - 所有写操作通过 scheduleSave() 触发 300ms 防抖落盘，减少频繁 I/O
  - closeDatabase() 会强制保存并释放资源，保障退出一致性
- WAL 模式
  - 尝试启用 PRAGMA journal_mode=WAL，提升并发读性能（在 sql.js 中可能不可用，已做容错）
- 索引优化
  - 高频过滤/排序字段建立索引，如 folderId+createdAt、status+createdAt、favorite、model、batchId、storageZone
- 大数据量建议
  - 分页：getImages 支持 limit/offset
  - 批量删除：deleteImages 使用 IN 占位符批量处理
  - 大对象：二进制文件走文件系统，不在 SQLite 中存 BLOB，降低数据库体积
- **新增** 二进制数据处理优化
  - 智能类型检测和转换，避免不必要的内存复制
  - 流式处理大型缩略图，减少内存峰值占用
  - 缓存常用的 MIME 类型映射，提升处理速度

**章节来源**
- [app/electron/database/index.cjs:58-93](file://app/electron/database/index.cjs#L58-L93)
- [app/electron/database/queries.cjs:201-207](file://app/electron/database/queries.cjs#L201-L207)
- [app/electron/database/schema.cjs:35-41](file://app/electron/database/schema.cjs#L35-L41)
- [app/src/db/electron-backend.js:13-37](file://app/src/db/electron-backend.js#L13-L37)

## 故障排查指南
- 数据库未初始化或路径问题
  - 检查 initDatabase 是否正确传入 userDataPath，并确保目录可写
  - 确认 schema.cjs 的 DDL 已成功执行
- 写入未持久化
  - 确认 write 操作后是否触发了 scheduleSave()
  - 若应用异常退出，检查 before-quit 是否调用了 closeDatabase()
- WAL 模式无效
  - 在 sql.js 环境中可能被忽略，属预期行为；不影响基本功能
- 搜索结果不符合预期
  - searchImages 基于 prompt 与 data JSON 的 LIKE 模糊匹配，注意大小写与通配符
- **新增** 图片/缩略图读取失败
  - 检查 electron-backend.js 的 readBlob/readThumbnail 逻辑与文件系统路径一致
  - 确认 Buffer.from() 转换是否正确处理了各种 ArrayBuffer 视图类型
  - 验证 MIME 类型设置是否符合实际文件格式
- **新增** 二进制数据传输问题
  - 检查 IPC 通道是否正确传递了 ArrayBuffer 数据
  - 确认 file-manager.cjs 中的 Buffer.from() 调用是否成功
  - 验证前端 Blob 对象的 type 属性是否正确设置
- 统计字段不一致
  - Electron 与 Dexie 后端对 stats 字段做了归一化，若自定义统计请参照对应实现

**章节来源**
- [app/electron/database/index.cjs:19-45](file://app/electron/database/index.cjs#L19-L45)
- [app/electron/database/index.cjs:80-93](file://app/electron/database/index.cjs#L80-L93)
- [app/electron/database/queries.cjs:259-269](file://app/electron/database/queries.cjs#L259-L269)
- [app/src/db/electron-backend.js:22-37](file://app/src/db/electron-backend.js#L22-L37)
- [app/src/db/electron-backend.js:144-153](file://app/src/db/electron-backend.js#L144-L153)
- [app/electron/file-manager.cjs:144-196](file://app/electron/file-manager.cjs#L144-L196)

## 结论
该数据库层通过"门面 + 双后端 + IPC 代理"的设计，实现了跨环境一致的访问体验。主进程侧使用 sql.js 与精心设计的 DDL/索引，配合延迟持久化策略，兼顾了性能与可靠性；渲染进程侧通过严格的 IPC 边界与返回值归一化，保证了前后端契约稳定。

**更新** 最新的增强功能显著提升了二进制数据处理能力，特别是缩略图处理方面，现在能够无缝支持 ArrayBuffer、TypedArray 和 Node.js Buffer 等多种数据格式，并具备完善的 MIME 类型处理机制。这些改进确保了在不同环境和场景下的稳定性和兼容性，为应用程序提供了更加健壮的数据存储解决方案。

整体架构清晰、可扩展性强，适合在桌面应用中承载结构化元数据与轻量级附件。

## 附录：数据模型
```mermaid
erDiagram
IMAGES {
integer id PK
integer batchId
integer folderId
text model
text prompt
integer favorite
text status
text storageZone
text filePath
text thumbnailPath
integer blobSize
integer width
integer height
text sourceUrl
text ossUrl
text ossKey
text taskId
text syncStatus
text fileHash
integer createdAt
text data
}
BATCHES {
integer id PK
integer sessionId
text model
text prompt
integer createdAt
}
SESSIONS {
integer id PK
integer createdAt
}
FOLDERS {
integer id PK
text name
integer parentId
integer createdAt
}
TASKS {
text id PK
text type
text status
text model
text prompt
integer progress
integer retryCount
integer createdAt
text data
}
SETTINGS {
text key PK
text value
}
CASEPACKAGES {
integer id PK
integer imageId
integer createdAt
text data
}
IMAGES ||--o{ BATCHES : "batchId"
BATCHES ||--o{ SESSIONS : "sessionId"
IMAGES ||--o{ FOLDERS : "folderId"
IMAGES ||--o{ TASKS : "taskId"
CASEPACKAGES ||--|| IMAGES : "imageId"
```

**图表来源**
- [app/electron/database/schema.cjs:6-112](file://app/electron/database/schema.cjs#L6-L112)