const { contextBridge, ipcRenderer } = require('electron');

// 暴露安全的 IPC 接口给 renderer 进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 数据库操作 — 全部 30 个函数通过 IPC 调用 main 进程 SQLite
  db: {
    // images
    addImage:            (image)         => ipcRenderer.invoke('db:images:add', image),
    updateImage:         (id, changes)   => ipcRenderer.invoke('db:images:update', id, changes),
    deleteImage:         (id)            => ipcRenderer.invoke('db:images:delete', id),
    deleteImages:        (ids)           => ipcRenderer.invoke('db:images:deleteMany', ids),
    getImage:            (id)            => ipcRenderer.invoke('db:images:get', id),
    getImages:           (opts)          => ipcRenderer.invoke('db:images:list', opts),
    searchImages:        (keyword)       => ipcRenderer.invoke('db:images:search', keyword),
    getImageStats:       ()              => ipcRenderer.invoke('db:images:stats'),
    toggleImageFavorite: (id)            => ipcRenderer.invoke('db:images:toggleFavorite', id),
    moveImages:          (ids, folderId) => ipcRenderer.invoke('db:images:move', ids, folderId),
    // batches
    addBatch:            (batch)         => ipcRenderer.invoke('db:batches:add', batch),
    getBatches:          (sessionId)     => ipcRenderer.invoke('db:batches:list', sessionId),
    // sessions
    addSession:          ()              => ipcRenderer.invoke('db:sessions:add'),
    getSessions:         ()              => ipcRenderer.invoke('db:sessions:list'),
    // folders
    addFolder:           (folder)        => ipcRenderer.invoke('db:folders:add', folder),
    getFolders:          ()              => ipcRenderer.invoke('db:folders:list'),
    updateFolder:        (id, changes)   => ipcRenderer.invoke('db:folders:update', id, changes),
    deleteFolder:        (id)            => ipcRenderer.invoke('db:folders:delete', id),
    // tasks
    addTask:             (task)          => ipcRenderer.invoke('db:tasks:add', task),
    updateTask:          (id, changes)   => ipcRenderer.invoke('db:tasks:update', id, changes),
    getTasks:            (filter)        => ipcRenderer.invoke('db:tasks:list', filter),
    deleteTask:          (id)            => ipcRenderer.invoke('db:tasks:delete', id),
    getTaskStats:        ()              => ipcRenderer.invoke('db:tasks:stats'),
    // settings
    getAllSettings:      ()              => ipcRenderer.invoke('db:settings:getAll'),
    setSetting:          (key, value)    => ipcRenderer.invoke('db:settings:set', key, value),
    getSetting:          (key)           => ipcRenderer.invoke('db:settings:get', key),
    // casePackages
    addCasePackage:      (pkg)           => ipcRenderer.invoke('db:casePackages:add', pkg),
    getCasePackages:     ()              => ipcRenderer.invoke('db:casePackages:list'),
    updateCasePackage:   (id, changes)   => ipcRenderer.invoke('db:casePackages:update', id, changes),
    deleteCasePackage:   (id)            => ipcRenderer.invoke('db:casePackages:delete', id),
  },

  // 文件系统操作
  fs: {
    saveImage: (id, buffer, mime) =>
      ipcRenderer.invoke('fs:image:save', id, buffer, mime),
    readImage: (id) =>
      ipcRenderer.invoke('fs:image:read', id),
    deleteImage: (id) =>
      ipcRenderer.invoke('fs:image:delete', id),
    deleteImages: (ids) =>
      ipcRenderer.invoke('fs:image:deleteMany', ids),
    saveThumbnail: (id, buffer) =>
      ipcRenderer.invoke('fs:thumbnail:save', id, buffer),
    readThumbnail: (id) =>
      ipcRenderer.invoke('fs:thumbnail:read', id),
    saveImport: (id, buffer, ext) =>
      ipcRenderer.invoke('fs:import:save', id, buffer, ext),
    getStats: () =>
      ipcRenderer.invoke('fs:stats'),
  },

  // API 代理端口（main 进程启动后通过 IPC 获取）
  getApiPort: () => ipcRenderer.invoke('app:getApiPort'),

  // OSS 同步操作
  oss: {
    triggerSync:  ()          => ipcRenderer.invoke('oss:sync:trigger'),
    getSyncStatus: ()         => ipcRenderer.invoke('oss:sync:status'),
    getConfig:    ()          => ipcRenderer.invoke('oss:config:get'),
    setConfig:    (config)    => ipcRenderer.invoke('oss:config:set', config),
  },

  // 应用信息
  isElectron: true,
  getAppPath: () => ipcRenderer.invoke('app:getPath'),
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
});
