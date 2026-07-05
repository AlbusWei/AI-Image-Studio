import { Stack, H1, H2, Grid, Stat, Table, Tag, Text, Divider, Row, Callout, Timeline } from 'qoder/canvas';

const tasks = [
  ['Task 1', 'Electron 壳子搭建', 'main.cjs + preload.cjs + BrowserWindow', 'completed', 'success'],
  ['Task 2', 'API 代理迁移', 'api-server.cjs 内嵌 Express，5 条路由', 'completed', 'success'],
  ['Task 3', 'SQLite 数据库层', 'schema + queries + ipc-handlers (720行)', 'completed', 'success'],
  ['Task 4', '文件系统存储层', 'file-manager.cjs + protocol.cjs (app://)', 'completed', 'success'],
  ['Task 5', 'database.js 透明切换', '策略模式 + dexie-backend + electron-backend', 'completed', 'success'],
  ['Task 6', 'OSS 增量备份', 'oss-sync.cjs 状态机 + 定时 + 断点续传', 'completed', 'success'],
  ['Task 7', '数据迁移工具', 'migration.cjs IndexedDB→SQLite+FS', 'completed', 'success'],
  ['Task 8', '打包与分发', 'electron-builder.yml + NSIS + WASM 路径', 'completed', 'success'],
];

const files = [
  ['electron/main.cjs', '106行', 'Main 进程入口，集成全部模块初始化'],
  ['electron/preload.cjs', '81行', 'contextBridge 安全 API (db/fs/oss)'],
  ['electron/database/schema.cjs', '114行', '7张表 DDL + 6 个索引'],
  ['electron/database/queries.cjs', '720行', '30 个 SQLite 查询函数实现'],
  ['electron/database/index.cjs', '92行', 'sql.js 初始化 + debounced flush'],
  ['electron/ipc-handlers.cjs', '62行', '30+ db:* IPC channel 注册'],
  ['electron/file-manager.cjs', '195行', '图片文件 CRUD + 目录管理'],
  ['electron/protocol.cjs', '92行', 'app:// 自定义协议注册'],
  ['electron/api-server.cjs', '249行', '内嵌 HTTP 代理，5 条 API 路由'],
  ['electron/oss-sync.cjs', '445行', '增量同步引擎 + multipartUpload'],
  ['electron/migration.cjs', '351行', 'IDB→SQLite 一次性迁移工具'],
  ['src/db/database.js', '72行', '策略模式 facade，35 个函数委托'],
  ['src/db/dexie-backend.js', '250行', 'Dexie (IndexedDB) 后端实现'],
  ['src/db/electron-backend.js', '269行', 'Electron IPC 后端 + Blob 适配'],
  ['electron-builder.yml', '-', 'NSIS 安装包配置 + asar + WASM'],
];

const architecture = [
  ['SQLite (sql.js WASM)', '元数据存储', '7张表，真分页，FTS5 全文搜索'],
  ['文件系统', '图片存储', '{userData}/images/{originals,thumbnails}/'],
  ['app:// 协议', 'Renderer 访问', '<img src="app://images/..."> 直接读取'],
  ['IPC contextBridge', '进程通信', '30+ db:* + fs:* + oss:* channels'],
  ['策略模式', 'database.js', 'window.electronAPI ? SQLite : Dexie'],
  ['ali-oss SDK', '云端备份', '增量同步 + MD5 去重 + 断点续传'],
];

const timeline = [
  { title: 'Electron 壳子', description: 'Bill: main.cjs + preload.cjs 搭建' },
  { title: 'SQLite + API 代理 + 文件系统', description: 'Jay + Felix + Robin 并行实现核心层' },
  { title: 'database.js 适配', description: 'Taylor: 策略模式 + 双后端 + Blob 桥接' },
  { title: 'OSS 备份', description: 'Robin: 增量同步引擎 + 定时 + 重试' },
  { title: '数据迁移', description: 'Felix: IndexedDB → SQLite + 文件系统' },
  { title: '打包配置', description: 'Bill: electron-builder + WASM 路径修复' },
  { title: '全面验证', description: 'Chris: 11 文件语法 + Vite build + 集成检查 ALL PASS' },
];

export default function ElectronMigrationReport() {
  return (
    <Stack gap={24}>
      <H1>Electron 桌面应用持久化架构迁移</H1>
      <Text tone="secondary">8 个任务全部完成 — IndexedDB 到 SQLite + 文件系统的完整迁移</Text>

      <Grid columns={5} gap={12}>
        <Stat value="8/8" label="任务完成" tone="success" />
        <Stat value="15" label="新建/修改文件" tone="info" />
        <Stat value="3,098" label="新增代码行" tone="primary" />
        <Stat value="30" label="数据库函数" tone="success" />
        <Stat value="0" label="Store 改动" tone="success" />
      </Grid>

      <Divider />

      <H2>架构概览</H2>
      <Table
        headers={['组件', '职责', '关键实现']}
        rows={architecture}
        density="compact"
      />

      <Callout tone="info">
        核心设计原则：database.js 的 30 个导出函数签名不变，5 个 Zustand Store 零改动。运行时检测 window.electronAPI 选择 SQLite 或 Dexie 后端。
      </Callout>

      <Divider />

      <H2>任务执行时间线</H2>
      <Timeline events={timeline} />

      <Divider />

      <H2>任务交付状态</H2>
      <Table
        headers={['编号', '任务名称', '核心产出', '状态']}
        rows={tasks.map(t => [t[0], t[1], t[2], t[3]])}
        rowTone={tasks.map(t => t[4])}
        density="compact"
      />

      <Divider />

      <H2>文件清单</H2>
      <Grid columns={1} gap={4}>
        {files.map(([file, lines, desc]) => (
          <Row key={file} gap={8} align="center">
            <Tag tone="primary">{file}</Tag>
            <Tag tone="info">{lines}</Tag>
            <Text tone="secondary" size="small">{desc}</Text>
          </Row>
        ))}
      </Grid>

      <Divider />

      <H2>关键技术决策</H2>
      <Table
        headers={['决策', '选择', '理由']}
        rows={[
          ['SQLite 引擎', 'sql.js (WASM)', '零原生编译，Windows 无需 Build Tools'],
          ['图片存储', '文件系统', '避免 SQLite 存大 Blob，文件可外部访问'],
          ['图片访问', 'app:// 协议', 'renderer 直接 fetch 本地文件，无需 IPC'],
          ['全文搜索', 'FTS5 + trigram', '替代全表扫描，支持中文子串匹配'],
          ['API 代理', 'main 进程内嵌 HTTP', '复用现有 proxy 逻辑，生产环境可用'],
          ['持久化策略', 'debounced flush 300ms', '平衡性能与数据安全'],
        ]}
        density="compact"
      />

      <Divider />

      <H2>验证结果</H2>
      <Grid columns={3} gap={12}>
        <Stat value="11/11" label="Electron .cjs 语法检查" tone="success" />
        <Stat value="3/3" label="Renderer .js 语法检查" tone="success" />
        <Stat value="PASS" label="Vite Build" tone="success" />
      </Grid>

      <Callout tone="success">
        全部验证通过：11 个 Electron 模块语法检查、3 个 Renderer 数据库文件语法检查、Vite 生产构建、electron-builder 配置加载均无错误。
      </Callout>

      <Divider />

      <H2>风险与注意事项</H2>
      <Table
        headers={['风险', '严重度', '缓解措施']}
        rows={[
          ['sql.js WASM 体积 ~1MB', '低', 'Electron 本地加载，可接受'],
          ['fs.writeFileSync 持久化', '中', '300ms debounce + before-quit flush'],
          ['Blob instanceof 跨进程', '高', 'electron-backend.js 统一 new Blob() 重建'],
          ['FTS5 中文搜索召回率', '中', '可叠加 LIKE 做 fallback'],
        ]}
        rowTone={['info', 'warning', 'danger', 'warning']}
        density="compact"
      />

      <Callout tone="info">
        开发命令：cd app && npm run electron:dev | 打包命令：npm run electron:build
      </Callout>
    </Stack>
  );
}
