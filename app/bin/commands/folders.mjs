/**
 * folders command — 文件夹管理 (list / add / rename / delete)
 *
 * Usage:
 *   node bin/ais.mjs folders list
 *   node bin/ais.mjs folders add <name> [--parent <id>]
 *   node bin/ais.mjs folders rename <id> <newName>
 *   node bin/ais.mjs folders delete <id>
 *
 * Success output: JSON object/array
 */

import { apiClient } from '../../src/services/api/index.js';

const EXIT = { OK: 0, ERROR: 1 };

// ─── 输出辅助 ─────────────────────────────────────────────────────────────

function outputResult(data) {
  process.stdout.write(JSON.stringify(data, null, 2) + '\n');
}

function outputError(err, exitCode = EXIT.ERROR) {
  const payload = {
    error: err.error || 'ERROR',
    message: err.message || String(err),
  };
  process.stderr.write(JSON.stringify(payload) + '\n');
  process.exitCode = exitCode;
}

// ─── Action handlers ──────────────────────────────────────────────────────

async function foldersListAction(opts) {
  try {
    const res = await apiClient.get('/db/folders/list');
    outputResult(res.data || []);
  } catch (err) {
    outputError({ error: 'FOLDERS_LIST_FAILED', message: err.message });
  }
}

async function foldersAddAction(name, opts) {
  if (!name || !name.trim()) {
    return outputError({ error: 'INVALID_PARAMS', message: 'Folder name is required' });
  }

  const body = { folder: { name: name.trim() } };
  if (opts.parent !== undefined) {
    const parentId = parseInt(opts.parent, 10);
    if (!Number.isInteger(parentId) || parentId <= 0) {
      return outputError({ error: 'INVALID_PARAMS', message: `Invalid parent ID: ${opts.parent}` });
    }
    body.folder.parentId = parentId;
  }

  try {
    const res = await apiClient.post('/db/folders/add', body);
    const data = res.data || {};
    outputResult({ id: data.id, name: name.trim() });
  } catch (err) {
    outputError({ error: 'FOLDERS_ADD_FAILED', message: err.message });
  }
}

async function foldersRenameAction(id, newName, opts) {
  const folderId = parseInt(id, 10);
  if (!Number.isInteger(folderId) || folderId <= 0) {
    return outputError({ error: 'INVALID_PARAMS', message: `Invalid folder ID: ${id}` });
  }
  if (!newName || !newName.trim()) {
    return outputError({ error: 'INVALID_PARAMS', message: 'New name is required' });
  }

  try {
    const res = await apiClient.post('/db/folders/update', {
      id: folderId,
      changes: { name: newName.trim() },
    });
    outputResult({ id: folderId, name: newName.trim(), ok: res.data?.ok ?? true });
  } catch (err) {
    outputError({ error: 'FOLDERS_RENAME_FAILED', message: err.message });
  }
}

async function foldersDeleteAction(id, opts) {
  const folderId = parseInt(id, 10);
  if (!Number.isInteger(folderId) || folderId <= 0) {
    return outputError({ error: 'INVALID_PARAMS', message: `Invalid folder ID: ${id}` });
  }

  try {
    const res = await apiClient.post('/db/folders/delete', { id: folderId });
    outputResult({ id: folderId, deleted: res.data?.ok ?? true });
  } catch (err) {
    outputError({ error: 'FOLDERS_DELETE_FAILED', message: err.message });
  }
}

// ─── 命令注册 ──────────────────────────────────────────────────────────────

/**
 * Register folders command and subcommands on the given program.
 * @param {import('commander').Command} program
 * @param {Function} preflight - preflight(options) => ctx | null
 */
export function registerFoldersCommand(program, preflight) {
  const folders = program
    .command('folders')
    .description('文件夹管理 (list / add / rename / delete)');

  folders
    .command('list')
    .description('列出所有文件夹')
    .action(async (opts, cmd) => {
      const ctx = await preflight(cmd.parent.parent.opts());
      if (!ctx) return;
      await foldersListAction(opts);
    });

  folders
    .command('add')
    .description('创建新文件夹')
    .argument('<name>', '文件夹名称')
    .option('--parent <id>', '父文件夹 ID')
    .action(async (name, opts, cmd) => {
      const ctx = await preflight(cmd.parent.parent.opts());
      if (!ctx) return;
      await foldersAddAction(name, opts);
    });

  folders
    .command('rename')
    .description('重命名文件夹')
    .argument('<id>', '文件夹 ID')
    .argument('<newName>', '新名称')
    .action(async (id, newName, opts, cmd) => {
      const ctx = await preflight(cmd.parent.parent.opts());
      if (!ctx) return;
      await foldersRenameAction(id, newName, opts);
    });

  folders
    .command('delete')
    .description('删除文件夹')
    .argument('<id>', '文件夹 ID')
    .action(async (id, opts, cmd) => {
      const ctx = await preflight(cmd.parent.parent.opts());
      if (!ctx) return;
      await foldersDeleteAction(id, opts);
    });
}
