/**
 * delete command — Delete one or more images by ID
 *
 * Usage:
 *   node bin/ais.mjs delete 42
 *   node bin/ais.mjs delete 42 43 44
 *
 * Success output: { deleted: [42, 43, 44], count: 3 }
 */

import { apiClient } from '../../src/services/api/index.js';

const EXIT = { OK: 0, ERROR: 1 };

/**
 * Execute the delete command.
 * @param {string[]} ids - one or more image IDs (positional arguments)
 * @param {Object} opts - parsed commander options
 * @param {Object} ctx - { port, quiet } from preflight
 */
export async function deleteAction(ids, opts, ctx) {
  const outputResult = (data) => process.stdout.write(JSON.stringify(data, null, 2) + '\n');
  const outputError = (err, exitCode = EXIT.ERROR) => {
    process.stderr.write(JSON.stringify(err) + '\n');
    process.exitCode = exitCode;
  };

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
    if (parsedIds.length === 1) {
      await apiClient.post('/db/images/delete', { id: parsedIds[0] });
    } else {
      await apiClient.post('/db/images/deleteMany', { ids: parsedIds });
    }
    outputResult({ deleted: parsedIds, count: parsedIds.length });
  } catch (err) {
    outputError({ error: 'DELETE_FAILED', message: err.message });
  }
}
