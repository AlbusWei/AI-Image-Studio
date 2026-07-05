/**
 * SQLite schema for AI Image Studio
 * 7 tables + indexes, compatible with sql.js (WASM)
 */

function getDDL() {
  return `
-- ============================================================
-- images: main image storage, indexed columns + JSON data column
-- ============================================================
CREATE TABLE IF NOT EXISTS images (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  batchId       INTEGER,
  folderId      INTEGER,
  model         TEXT,
  prompt        TEXT,
  favorite      INTEGER DEFAULT 0,
  status        TEXT    DEFAULT 'completed',
  storageZone   TEXT    DEFAULT 'hot',
  filePath      TEXT,
  thumbnailPath TEXT,
  blobSize      INTEGER,
  width         INTEGER,
  height        INTEGER,
  sourceUrl     TEXT,
  ossUrl        TEXT,
  ossKey        TEXT,
  taskId        TEXT,
  syncStatus    TEXT    DEFAULT 'pending',
  fileHash      TEXT,
  createdAt     INTEGER,
  data          TEXT
);

CREATE INDEX IF NOT EXISTS idx_images_folder_created ON images(folderId, createdAt DESC);
CREATE INDEX IF NOT EXISTS idx_images_model          ON images(model);
CREATE INDEX IF NOT EXISTS idx_images_favorite       ON images(favorite);
CREATE INDEX IF NOT EXISTS idx_images_status         ON images(status);
CREATE INDEX IF NOT EXISTS idx_images_batch          ON images(batchId);
CREATE INDEX IF NOT EXISTS idx_images_storage        ON images(storageZone);

-- ============================================================
-- batches: group of images generated in one request
-- ============================================================
CREATE TABLE IF NOT EXISTS batches (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  sessionId INTEGER,
  model     TEXT,
  prompt    TEXT,
  createdAt INTEGER
);

CREATE INDEX IF NOT EXISTS idx_batches_session ON batches(sessionId);

-- ============================================================
-- sessions: workbench session
-- ============================================================
CREATE TABLE IF NOT EXISTS sessions (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  createdAt INTEGER
);

-- ============================================================
-- folders: gallery folder tree
-- ============================================================
CREATE TABLE IF NOT EXISTS folders (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  name      TEXT,
  parentId  INTEGER,
  createdAt INTEGER
);

CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parentId);

-- ============================================================
-- tasks: async task queue
-- ============================================================
CREATE TABLE IF NOT EXISTS tasks (
  id         TEXT    PRIMARY KEY,
  type       TEXT,
  status     TEXT    DEFAULT 'queued',
  model      TEXT,
  prompt     TEXT,
  progress   INTEGER DEFAULT 0,
  retryCount INTEGER DEFAULT 0,
  createdAt  INTEGER,
  data       TEXT
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status, createdAt);

-- ============================================================
-- settings: key-value store
-- ============================================================
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- ============================================================
-- casePackages: knowledge base packages
-- ============================================================
CREATE TABLE IF NOT EXISTS casePackages (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  imageId   INTEGER,
  createdAt INTEGER,
  data      TEXT
);

CREATE INDEX IF NOT EXISTS idx_case_packages_image ON casePackages(imageId);
`;
}

module.exports = { getDDL };
