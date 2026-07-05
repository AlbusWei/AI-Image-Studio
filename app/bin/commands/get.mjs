/**
 * get command — Get image detail by ID
 *
 * Usage: node bin/ais.mjs get <id>
 *
 * Success output: full image metadata JSON object
 */

import { apiClient } from '../../src/services/api/index.js';

const EXIT = { OK: 0, ERROR: 1 };

/**
 * Execute the get command.
 * @param {string} id - image ID (positional argument)
 * @param {Object} opts - parsed commander options
 * @param {Object} ctx - { port, quiet } from preflight
 */
export async function getAction(id, opts, ctx) {
  const outputResult = (data) => process.stdout.write(JSON.stringify(data, null, 2) + '\n');
  const outputError = (err, exitCode = EXIT.ERROR) => {
    process.stderr.write(JSON.stringify(err) + '\n');
    process.exitCode = exitCode;
  };

  const imageId = parseInt(id, 10);
  if (!Number.isInteger(imageId) || imageId <= 0) {
    return outputError({ error: 'INVALID_PARAMS', message: `Invalid image ID: ${id}` });
  }

  try {
    const res = await apiClient.get(`/db/images/get/${imageId}`);
    if (!res.data) {
      return outputError({ error: 'NOT_FOUND', message: `Image not found: ${imageId}` });
    }
    outputResult(res.data);
  } catch (err) {
    outputError({ error: 'GET_FAILED', message: err.message });
  }
}
