/**
 * favorite command — Toggle favorite state of an image
 *
 * Usage:
 *   node bin/ais.mjs favorite 42
 *
 * Success output: { id: 42, favorite: true }
 */

import { apiClient } from '../../src/services/api/index.js';

const EXIT = { OK: 0, ERROR: 1 };

/**
 * Execute the favorite command.
 * @param {string} id - image ID (positional argument)
 * @param {Object} opts - parsed commander options
 * @param {Object} ctx - { port, quiet } from preflight
 */
export async function favoriteAction(id, opts, ctx) {
  const outputResult = (data) => process.stdout.write(JSON.stringify(data, null, 2) + '\n');
  const outputError = (err, exitCode = EXIT.ERROR) => {
    process.stderr.write(JSON.stringify(err) + '\n');
    process.exitCode = exitCode;
  };

  const imageId = parseInt(id, 10);
  if (!Number.isInteger(imageId) || imageId <= 0) {
    return outputError({
      error: 'INVALID_PARAMS',
      message: `Invalid image ID: ${id}`,
    });
  }

  try {
    const res = await apiClient.post('/db/images/toggleFavorite', { id: imageId });
    // API returns boolean (new favorite state)
    const favorite = typeof res.data === 'boolean' ? res.data : !!res.data;
    outputResult({ id: imageId, favorite });
  } catch (err) {
    outputError({ error: 'FAVORITE_FAILED', message: err.message });
  }
}
