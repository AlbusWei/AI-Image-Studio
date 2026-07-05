/**
 * stats command — Gallery statistics overview
 *
 * Usage: node bin/ais.mjs stats
 *
 * Success output: stats JSON object (total, favorites, byModel, etc.)
 */

import { apiClient } from '../../src/services/api/index.js';

const EXIT = { OK: 0, ERROR: 1 };

/**
 * Execute the stats command.
 * @param {Object} opts - parsed commander options
 * @param {Object} ctx - { port, quiet } from preflight
 */
export async function statsAction(opts, ctx) {
  const outputResult = (data) => process.stdout.write(JSON.stringify(data, null, 2) + '\n');
  const outputError = (err, exitCode = EXIT.ERROR) => {
    process.stderr.write(JSON.stringify(err) + '\n');
    process.exitCode = exitCode;
  };

  try {
    const res = await apiClient.get('/db/images/stats');
    outputResult(res.data);
  } catch (err) {
    outputError({ error: 'STATS_FAILED', message: err.message });
  }
}
