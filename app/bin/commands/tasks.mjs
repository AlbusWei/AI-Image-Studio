/**
 * tasks command — 任务管理 (list / stats)
 *
 * Usage:
 *   node bin/ais.mjs tasks list
 *   node bin/ais.mjs tasks stats
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

async function tasksListAction(opts) {
  try {
    const filter = {};
    if (opts.status) filter.status = opts.status;
    if (opts.type) filter.type = opts.type;

    const res = await apiClient.post('/db/tasks/list', { filter });
    outputResult(res.data || []);
  } catch (err) {
    outputError({ error: 'TASKS_LIST_FAILED', message: err.message });
  }
}

async function tasksStatsAction(opts) {
  try {
    const res = await apiClient.get('/db/tasks/stats');
    outputResult(res.data || {});
  } catch (err) {
    outputError({ error: 'TASKS_STATS_FAILED', message: err.message });
  }
}

// ─── 命令注册 ──────────────────────────────────────────────────────────────

/**
 * Register tasks command and subcommands on the given program.
 * @param {import('commander').Command} program
 * @param {Function} preflight - preflight(options) => ctx | null
 */
export function registerTasksCommand(program, preflight) {
  const tasks = program
    .command('tasks')
    .description('任务管理 (list / stats)');

  tasks
    .command('list')
    .description('列出任务')
    .option('--status <status>', '按状态筛选 (queued / running / completed / failed / cancelled)')
    .option('--type <type>', '按类型筛选')
    .action(async (opts, cmd) => {
      const ctx = await preflight(cmd.parent.parent.opts());
      if (!ctx) return;
      await tasksListAction(opts);
    });

  tasks
    .command('stats')
    .description('查看任务统计')
    .action(async (opts, cmd) => {
      const ctx = await preflight(cmd.parent.parent.opts());
      if (!ctx) return;
      await tasksStatsAction(opts);
    });
}
