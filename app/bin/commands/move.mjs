/**
 * move command — Move one or more images to a folder
 *
 * Usage:
 *   node bin/ais.mjs move 42 43 --folder "项目A"
 *
 * Success output: { moved: [42, 43], folder: { id: 5, name: "项目A" } }
 */

import { apiClient } from '../../src/services/api/index.js';

const EXIT = { OK: 0, ERROR: 1 };

/**
 * Execute the move command.
 * @param {string[]} ids - one or more image IDs (positional arguments)
 * @param {Object} opts - parsed commander options (must include --folder)
 * @param {Object} ctx - { port, quiet } from preflight
 */
export async function moveAction(ids, opts, ctx) {
  const { quiet } = ctx;
  const log = (...args) => { if (!quiet) process.stderr.write(args.join(' ') + '\n'); };
  const outputResult = (data) => process.stdout.write(JSON.stringify(data, null, 2) + '\n');
  const outputError = (err, exitCode = EXIT.ERROR) => {
    process.stderr.write(JSON.stringify(err) + '\n');
    process.exitCode = exitCode;
  };

  // Validate --folder
  if (!opts.folder) {
    return outputError({
      error: 'INVALID_PARAMS',
      message: '--folder <name> is required',
    });
  }

  // Parse and validate IDs
  const parsedIds = ids.map(raw => parseInt(raw, 10));
  const invalid = parsedIds.filter(id => !Number.isInteger(id) || id <= 0);
  if (invalid.length > 0 || parsedIds.length === 0) {
    return outputError({
      error: 'INVALID_PARAMS',
      message: `Invalid image ID(s): ${ids.filter((_, i) => {
        const n = parseInt(ids[i], 10);
        return !Number.isInteger(n) || n <= 0;
      }).join(', ')}`,
    });
  }

  try {
    // 1. Find folder by name
    const listRes = await apiClient.get('/db/folders/list');
    const folders = listRes.data || [];
    let folder = folders.find(f => f.name === opts.folder);

    // 2. Create folder if not found
    if (!folder) {
      log(`[move] Folder "${opts.folder}" not found, creating...`);
      const createRes = await apiClient.post('/db/folders/add', { folder: { name: opts.folder } });
      folder = { id: createRes.data.id, name: opts.folder };
    }

    // 3. Move images
    await apiClient.post('/db/images/move', { ids: parsedIds, folderId: folder.id });

    outputResult({
      moved: parsedIds,
      folder: { id: folder.id, name: folder.name },
    });
  } catch (err) {
    outputError({ error: 'MOVE_FAILED', message: err.message });
  }
}
