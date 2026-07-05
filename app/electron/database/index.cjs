/**
 * Database initialization and lifecycle management
 * Uses sql.js (WASM) for SQLite in Electron main process
 */

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

let db = null;
let dbPath = '';
let flushTimer = null;

/**
 * Initialize the database: load from disk or create new, run schema DDL
 * @param {string} userDataPath - Electron app.getPath('userData')
 * @returns {Promise<import('sql.js').Database>}
 */
async function initDatabase(userDataPath) {
  const SQL = await initSqlJs({
    locateFile: (file) => path.join(__dirname, '..', '..', 'node_modules', 'sql.js', 'dist', file),
  });
  dbPath = path.join(userDataPath, 'ai-image-studio.db');

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // Enable WAL mode for better concurrency (may not work in sql.js, ignore errors)
  try { db.run('PRAGMA journal_mode=WAL'); } catch (_) { /* noop */ }

  // Run schema
  const schema = require('./schema.cjs');
  db.run(schema.getDDL());

  // Persist immediately after schema setup
  saveDatabase();

  return db;
}

/**
 * Get the current database instance
 * @returns {import('sql.js').Database|null}
 */
function getDb() {
  return db;
}

/**
 * Schedule a debounced save (300ms) after write operations
 */
function scheduleSave() {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(saveDatabase, 300);
}

/**
 * Synchronously flush the database to disk
 */
function saveDatabase() {
  if (!db) return;
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  } catch (err) {
    console.error('[DB] saveDatabase failed:', err);
  }
}

/**
 * Close the database: cancel pending flush, save, and close
 */
function closeDatabase() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  saveDatabase();
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = { initDatabase, getDb, scheduleSave, saveDatabase, closeDatabase };
