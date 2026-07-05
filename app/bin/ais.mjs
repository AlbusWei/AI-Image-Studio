#!/usr/bin/env node

/**
 * AI Image Studio CLI (ais)
 *
 * Usage: node app/bin/ais.mjs <command> [options]
 *
 * 通过 api-server (运行在 Electron 主进程) 与 AI Image Studio 交互。
 * 所有输出默认为 JSON 格式。
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import http from 'node:http';
import { Command } from 'commander';
import { initEnvironment, configureApiClient } from './setup.mjs';

// ─── 环境初始化（必须在 import adapter 之前） ─────────────────────────────
initEnvironment();

// ─── 常量 ─────────────────────────────────────────────────────────────────

const DEFAULT_PORT = 19527;

/** Exit codes */
const EXIT = {
  OK: 0,
  ERROR: 1,
  SERVER_UNREACHABLE: 2,
  MODEL_API_ERROR: 3,
  FILE_ERROR: 4,
};

// ─── 端口解析 ──────────────────────────────────────────────────────────────

/**
 * 解析 api-server 端口：CLI --port 参数或默认值。
 */
function resolvePort(cliPort) {
  const n = Number(cliPort);
  if (Number.isInteger(n) && n >= 1 && n <= 65535) return n;
  return DEFAULT_PORT;
}

// ─── 输出辅助函数 ──────────────────────────────────────────────────────────

/** JSON 输出到 stdout */
function outputResult(data) {
  process.stdout.write(JSON.stringify(data, null, 2) + '\n');
}

/**
 * JSON 错误输出到 stderr + 设置 exit code。
 * 使用 process.exitCode 而非 process.exit()，让 stderr I/O 有机会 flush。
 * @param {Object} error - { error, message, code, ... }
 * @param {number} [exitCode=1]
 */
function outputError(error, exitCode = EXIT.ERROR) {
  const payload = {
    error: error.error || 'ERROR',
    message: error.message || String(error),
    ...(error.details && { details: error.details }),
  };
  process.stderr.write(JSON.stringify(payload) + '\n');
  process.exitCode = exitCode; // 不强制退出，让 event loop 自然 drain
}

/** 静默模式感知的 stderr 日志 */
function logStderr(quiet, ...args) {
  if (!quiet) process.stderr.write(args.join(' ') + '\n');
}

// ─── CLI 定义 ──────────────────────────────────────────────────────────────

const program = new Command();
program.exitOverride();

program
  .name('ais')
  .description('AI Image Studio CLI — 通过命令行与 AI Image Studio 交互')
  .version('0.1.0')
  .option('--port <port>', 'api-server 端口 (默认: AIS_PORT 环境变量或 19527)')
  .option('--json', '强制 JSON 输出 (默认已启用, reserved for future use)', true)
  .option('--quiet', '抑制 stderr 进度信息', false);

/**
 * 命令 action 的通用前置处理：配置 axios + 解析端口 + 检测连接。
 * 返回 { port, quiet }，失败时返回 null（调用方需守卫）。
 */
async function preflight(options) {
  const port = resolvePort(options.port);
  const quiet = options.quiet || false;

  await configureApiClient(port);

  const reachable = await checkServerReachable(port);
  if (!reachable) {
    outputError({
      error: 'SERVER_UNREACHABLE',
      message: `Cannot connect to api-server at 127.0.0.1:${port}. Is the Electron app running?`,
      details: { port },
    }, EXIT.SERVER_UNREACHABLE);
    return null;
  }

  return { port, quiet };
}

function checkServerReachable(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/api/db/images?limit=1`, (res) => {
      res.resume();
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(3000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

// ─── 命令注册 ──────────────────────────────────────────────────────────────

// gen — 生成图像
program
  .command('gen')
  .description('生成图像 (T2I / I2I，支持 Qwen、GPT-image-2、Nano Banana 2)')
  .requiredOption('-p, --prompt <text>', '生成提示词')
  .option('-m, --model <id>', '模型 ID (qwen-image-3 | gpt-image-2 | nanobanana-2)', 'qwen-image-3')
  .option('--size <ratio>', '尺寸比例 (1:1 | 16:9 | 9:16 | 3:4 | 4:3 | auto)', '1:1')
  .option('--count <n>', '一次生成数量 (1-4，取决于模型)', '1')
  .option('--quality <level>', '质量档位 (模型相关，如 low/medium/high)')
  .option('--expand', '调用 LLM 扩写 prompt', false)
  .option('--image <path...>', '参考图本地路径 (可多次指定)')
  .option('--seed <n>', '种子值 (-1 = 随机)', '-1')
  .option('--negative <text>', '负面提示词 (仅 Qwen 支持)')
  .option('--no-prompt-extend', '禁用 Qwen 内置 prompt_extend')
  .option('--folder <name>', '自动归入指定文件夹 (不存在则创建)')
  .action(async (opts, cmd) => {
    const ctx = await preflight(cmd.parent.opts());
    if (!ctx) return;
    const { genAction } = await import('./commands/gen.mjs');
    await genAction(opts, ctx);
  });

// expand — 扩写提示词
program
  .command('expand')
  .description('使用 LLM 扩写提示词')
  .argument('<prompt>', '原始提示词')
  .option('-s, --style <style>', '风格偏好')
  .option('-m, --model <id>', '目标生成模型')
  .action(async (prompt, opts, cmd) => {
    const ctx = await preflight(cmd.parent.opts());
    if (!ctx) return;
    const { expandAction } = await import('./commands/expand.mjs');
    await expandAction(prompt, opts, ctx);
  });

// list — 列出图像
program
  .command('list')
  .description('列出图库中的图像')
  .option('-m, --model <id>', '按模型筛选')
  .option('-f, --folder <name>', '按文件夹筛选')
  .option('--favorite', '仅显示收藏')
  .option('--search <keyword>', '搜索 prompt/元数据')
  .option('--limit <n>', '返回数量', '20')
  .option('--offset <n>', '偏移量', '0')
  .action(async (opts, cmd) => {
    const ctx = await preflight(cmd.parent.opts());
    if (!ctx) return;
    const { listAction } = await import('./commands/list.mjs');
    await listAction(opts, ctx);
  });

// get — 获取单张图像详情
program
  .command('get')
  .description('获取图像详情')
  .argument('<id>', '图像 ID')
  .action(async (id, opts, cmd) => {
    const ctx = await preflight(cmd.parent.opts());
    if (!ctx) return;
    const { getAction } = await import('./commands/get.mjs');
    await getAction(id, opts, ctx);
  });

// stats — 统计信息
program
  .command('stats')
  .description('获取图库统计信息')
  .action(async (opts, cmd) => {
    const ctx = await preflight(cmd.parent.opts());
    if (!ctx) return;
    const { statsAction } = await import('./commands/stats.mjs');
    await statsAction(opts, ctx);
  });

// delete — 删除图像
program
  .command('delete')
  .description('删除图像 (支持单个或多个 ID)')
  .argument('<ids...>', '一个或多个图像 ID')
  .option('--confirm', '跳过确认提示')
  .action(async (ids, opts, cmd) => {
    const ctx = await preflight(cmd.parent.opts());
    if (!ctx) return;
    const { deleteAction } = await import('./commands/delete.mjs');
    await deleteAction(ids, opts, ctx);
  });

// move — 移动图像到文件夹
program
  .command('move')
  .description('移动图像到指定文件夹')
  .argument('<ids...>', '一个或多个图像 ID')
  .requiredOption('--folder <name>', '目标文件夹名称')
  .action(async (ids, opts, cmd) => {
    const ctx = await preflight(cmd.parent.opts());
    if (!ctx) return;
    const { moveAction } = await import('./commands/move.mjs');
    await moveAction(ids, opts, ctx);
  });

// favorite — 切换收藏
program
  .command('favorite')
  .description('切换图像收藏状态')
  .argument('<id>', '图像 ID')
  .action(async (id, opts, cmd) => {
    const ctx = await preflight(cmd.parent.opts());
    if (!ctx) return;
    const { favoriteAction } = await import('./commands/favorite.mjs');
    await favoriteAction(id, opts, ctx);
  });

// folders — 管理文件夹
program
  .command('folders')
  .description('列出或管理文件夹')
  .option('--create <name>', '创建新文件夹')
  .action(async (opts, cmd) => {
    const ctx = await preflight(cmd.parent.opts());
    if (!ctx) return;
    const { port } = ctx;
    outputResult({
      command: 'folders',
      status: 'not_implemented',
      message: 'folders 命令尚未实现，将在后续版本中添加。',
      port,
    });
  });

// tasks — 查看任务
program
  .command('tasks')
  .description('查看任务中心状态')
  .option('--id <taskId>', '查看指定任务详情')
  .action(async (opts, cmd) => {
    const ctx = await preflight(cmd.parent.opts());
    if (!ctx) return;
    const { port } = ctx;
    outputResult({
      command: 'tasks',
      status: 'not_implemented',
      message: 'tasks 命令尚未实现，将在后续版本中添加。',
      port,
    });
  });

// batch — 批量操作
program
  .command('batch')
  .description('批量生成图像 (从文件读取 prompts)')
  .option('-f, --file <path>', '包含 prompts 的 JSON 文件路径')
  .option('-m, --model <id>', '模型 ID', 'qwen-image-3')
  .option('--concurrency <n>', '并发数', '2')
  .action(async (opts, cmd) => {
    const ctx = await preflight(cmd.parent.opts());
    if (!ctx) return;
    const { port } = ctx;
    outputResult({
      command: 'batch',
      status: 'not_implemented',
      message: 'batch 命令尚未实现，将在后续版本中添加。',
      port,
    });
  });

// ─── 解析并执行 ────────────────────────────────────────────────────────────

program.parseAsync(process.argv).catch((err) => {
  // exitOverride 会将 process.exit() 转为抛出 CommanderError；
  // help/version 等正常退出不需要输出错误信息，仅设置 exitCode
  if (err.code && /^(commander\.|ERR_COMMANDER)/.test(err.code)) {
    process.exitCode = err.exitCode ?? 0;
    return;
  }
  outputError({
    error: 'CLI_ERROR',
    message: err.message,
  });
});
