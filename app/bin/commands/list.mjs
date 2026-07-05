/**
 * list command — Query image list from the gallery
 *
 * Usage: node bin/ais.mjs list [--model <id>] [--folder <name>] [--favorite]
 *        [--search <keyword>] [--limit <n>] [--offset <n>]
 *
 * Success output: JSON array of image records
 */

import { apiClient } from '../../src/services/api/index.js';

const EXIT = { OK: 0, ERROR: 1 };

/**
 * Execute the list command.
 * @param {Object} opts - parsed commander options
 * @param {Object} ctx - { port, quiet } from preflight
 */
export async function listAction(opts, ctx) {
  const { quiet } = ctx;
  const log = (...args) => { if (!quiet) process.stderr.write(args.join(' ') + '\n'); };
  const outputResult = (data) => process.stdout.write(JSON.stringify(data, null, 2) + '\n');
  const outputError = (err, exitCode = EXIT.ERROR) => {
    process.stderr.write(JSON.stringify(err) + '\n');
    process.exitCode = exitCode;
  };

  try {
    let images;

    if (opts.search) {
      log('[list] Searching images with keyword:', opts.search);
      const res = await apiClient.post('/db/images/search', { keyword: opts.search });
      images = res.data || [];
    } else {
      const listOpts = {
        limit: parseInt(opts.limit, 10) || 20,
        offset: parseInt(opts.offset, 10) || 0,
      };
      if (opts.model) listOpts.model = opts.model;
      if (opts.favorite) listOpts.favorite = true;

      if (opts.folder) {
        log('[list] Resolving folder:', opts.folder);
        const folderRes = await apiClient.get('/db/folders/list');
        const folders = folderRes.data || [];
        const folder = folders.find(f => f.name === opts.folder);
        if (!folder) {
          return outputError({ error: 'NOT_FOUND', message: `Folder not found: ${opts.folder}` });
        }
        listOpts.folderId = folder.id;
      }

      log('[list] Listing images...');
      const res = await apiClient.post('/db/images/list', { opts: listOpts });
      images = res.data || [];
    }

    outputResult(images);
  } catch (err) {
    outputError({ error: 'LIST_FAILED', message: err.message });
  }
}
