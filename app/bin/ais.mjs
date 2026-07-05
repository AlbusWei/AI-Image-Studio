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
import { initEnvironment } from './setup.mjs';

// ─── 环境初始化（必须在 import adapter 之前） ─────────────────────────────
initEnvironment();

// ─── 常量 ─────────────────────────────────────────────────────────────────

const DEFAULT_PORT = 19527;
const APPDATA = process.env.APPDATA || join(homedir(), 'AppData', 'Roaming');
const PORT_FILE = join(APPDATA, 'ai-image-studio', '.api-port');

/** Exit codes */
const EXIT = {
  OK: 0,
  ERROR: 1,
  SERVER_UNREACHABLE: 2,
  MODEL_API_ERROR: 3,
  FILE_ERROR: 4,
};

// ─── 端口发现 ──────────────────────────────────────────────────────────────

/**
 * 按优先级解析 api-server 端口：
 * 1. --port 命令行参数
 * 2. AIS_PORT 环境变量
 * 3. 端口文件 (%APPDATA%/ai-image-studio/.api-port)
 * 4. 默认 19527
 */
function resolvePort(cliPort) {
  if (cliPort) return Number(cliPort);

  const envPort = process.env.AIS_PORT;
  if (envPort) return Number(envPort);

  try {
    const content = readFileSync(PORT_FILE, 'utf-8').trim();
    if (content) return Number(content);
  } catch {
    // 端口文件不存在，忽略
  }

  return DEFAULT_PORT;
}

// ─── 连接检测 ──────────────────────────────────────────────────────────────

/**
 * 检测 api-server 是否可达。
 * @param {number} port
 * @returns {Promise<boolean>}
 */
function checkServerReachable(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/api/db/images?limit=1`, (res) => {
      res.resume(); // 消费响应数据
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(3000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

// ─── 输出辅助函数 ──────────────────────────────────────────────────────────

/** JSON 输出到 stdout */
function outputResult(data) {
  process.stdout.write(JSON.stringify(data, null, 2) + '\n');
}

/**
 * JSON 错误输出到 stderr + exit。
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
  process.exit(exitCode);
}

/** 静默模式感知的 stderr 日志 */
function logStderr(quiet, ...args) {
  if (!quiet) process.stderr.write(args.join(' ') + '\n');
}

// ─── CLI 定义 ──────────────────────────────────────────────────────────────

const program = new Command();

program
  .name('ais')
  .description('AI Image Studio CLI — 通过命令行与 AI Image Studio 交互')
  .version('0.1.0')
  .option('--port <port>', 'api-server 端口 (默认: AIS_PORT 环境变量或 19527)')
  .option('--json', '强制 JSON 输出 (默认已启用)', true)
  .option('--quiet', '抑制 stderr 进度信息', false);

/**
 * 命令 action 的通用前置处理：解析端口 + 检测连接。
 * 返回 { port, quiet }。连接失败时直接 exit(2)。
 */
async function preflight(options) {
  const port = resolvePort(options.port);
  const quiet = options.quiet || false;

  logStderr(quiet, `[ais] Connecting to api-server at 127.0.0.1:${port}...`);

  const reachable = await checkServerReachable(port);
  if (!reachable) {
    outputError({
      error: 'SERVER_UNREACHABLE',
      message: `Cannot connect to api-server at 127.0.0.1:${port}. Is the Electron app running?`,
      port,
    }, EXIT.SERVER_UNREACHABLE);
  }

  return { port, quiet };
}

// ─── 命令注册 ──────────────────────────────────────────────────────────────

// gen — 生成图像
program
  .command('gen')
  .description('生成图像 (指定 prompt 和模型)')
  .option('-p, --prompt <text>', '生成提示词')
  .option('-m, --model <id>', '模型 ID (qwen-image-3 | gpt-image-2 | nanobanana-2)', 'qwen-image-3')
  .option('-n, --num <count>', '生成数量', '1')
  .option('--ratio <ratio>', '宽高比')
  .option('-o, --output <path>', '输出文件路径')
  .action(async (opts, cmd) => {
    const { port, quiet } = await preflight(cmd.parent.opts());
    // TODO: 后续 task 实现完整逻辑
    outputResult({
      command: 'gen',
      status: 'not_implemented',
      message: 'gen 命令尚未实现，将在后续版本中添加。',
      port,
    });
  });

// expand — 扩写提示词
program
  .command('expand')
  .description('使用 LLM 扩写提示词')
  .argument('<prompt>', '原始提示词')
  .option('-m, --model <id>', '目标生成模型')
  .action(async (prompt, opts, cmd) => {
    const { port, quiet } = await preflight(cmd.parent.opts());
    outputResult({
      command: 'expand',
      status: 'not_implemented',
      message: 'expand 命令尚未实现，将在后续版本中添加。',
      prompt,
      port,
    });
  });

// list — 列出图像
program
  .command('list')
  .description('列出图库中的图像')
  .option('-f, --folder <name>', '按文件夹筛选')
  .option('--favorite', '仅显示收藏')
  .option('--limit <n>', '返回数量', '20')
  .option('--offset <n>', '偏移量', '0')
  .action(async (opts, cmd) => {
    const { port, quiet } = await preflight(cmd.parent.opts());
    outputResult({
      command: 'list',
      status: 'not_implemented',
      message: 'list 命令尚未实现，将在后续版本中添加。',
      port,
    });
  });

// get — 获取单张图像详情
program
  .command('get')
  .description('获取图像详情')
  .argument('<id>', '图像 ID')
  .action(async (id, opts, cmd) => {
    const { port } = await preflight(cmd.parent.opts());
    outputResult({
      command: 'get',
      status: 'not_implemented',
      message: 'get 命令尚未实现，将在后续版本中添加。',
      id,
      port,
    });
  });

// stats — 统计信息
program
  .command('stats')
  .description('获取图库统计信息')
  .action(async (opts, cmd) => {
    const { port } = await preflight(cmd.parent.opts());
    outputResult({
      command: 'stats',
      status: 'not_implemented',
      message: 'stats 命令尚未实现，将在后续版本中添加。',
      port,
    });
  });

// delete — 删除图像
program
  .command('delete')
  .description('删除图像')
  .argument('<id>', '图像 ID')
  .option('--confirm', '跳过确认提示')
  .action(async (id, opts, cmd) => {
    const { port } = await preflight(cmd.parent.opts());
    outputResult({
      command: 'delete',
      status: 'not_implemented',
      message: 'delete 命令尚未实现，将在后续版本中添加。',
      id,
      port,
    });
  });

// move — 移动图像到文件夹
program
  .command('move')
  .description('移动图像到指定文件夹')
  .argument('<id>', '图像 ID')
  .argument('<folder>', '目标文件夹')
  .action(async (id, folder, opts, cmd) => {
    const { port } = await preflight(cmd.parent.opts());
    outputResult({
      command: 'move',
      status: 'not_implemented',
      message: 'move 命令尚未实现，将在后续版本中添加。',
      id,
      folder,
      port,
    });
  });

// favorite — 切换收藏
program
  .command('favorite')
  .description('切换图像收藏状态')
  .argument('<id>', '图像 ID')
  .option('--unset', '取消收藏')
  .action(async (id, opts, cmd) => {
    const { port } = await preflight(cmd.parent.opts());
    outputResult({
      command: 'favorite',
      status: 'not_implemented',
      message: 'favorite 命令尚未实现，将在后续版本中添加。',
      id,
      port,
    });
  });

// folders — 管理文件夹
program
  .command('folders')
  .description('列出或管理文件夹')
  .option('--create <name>', '创建新文件夹')
  .action(async (opts, cmd) => {
    const { port } = await preflight(cmd.parent.opts());
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
    const { port } = await preflight(cmd.parent.opts());
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
    const { port } = await preflight(cmd.parent.opts());
    outputResult({
      command: 'batch',
      status: 'not_implemented',
      message: 'batch 命令尚未实现，将在后续版本中添加。',
      port,
    });
  });

// ─── 解析并执行 ────────────────────────────────────────────────────────────

program.parseAsync(process.argv).catch((err) => {
  outputError({
    error: 'CLI_ERROR',
    message: err.message,
  });
});
