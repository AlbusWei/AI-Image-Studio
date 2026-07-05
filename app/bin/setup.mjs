/**
 * CLI Node.js 环境初始化模块
 *
 * 在 import adapter 代码之前执行，完成以下工作：
 * 1. 用 dotenv 加载 app/.env
 * 2. 设置 globalThis.window mock（让 resolveApiBase 不报错）
 * 3. 导出 initEnv(port) 供 ais.mjs 调用
 */

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * 初始化 CLI 运行环境。
 * 必须在 import adapter/client 代码之前调用。
 */
export function initEnvironment() {
  // 1. 加载 .env 文件
  const envPath = resolve(__dirname, '..', '.env');
  const result = dotenv.config({ path: envPath, quiet: true });
  if (result.error) {
    process.stderr.write(`[ais] Warning: failed to load .env from ${envPath}\n`);
  }

  // 2. Mock window 对象 — 让 client.js 的 resolveApiBase() 不报错
  //    resolveApiBase 检查 window.electronAPI?.getApiPort
  //    electronAPI 为 null 时，optional chaining 返回 undefined，fallback 到 '/api'
  //    interceptor 中 base === '/api' 时不会覆盖 config.baseURL
  if (typeof globalThis.window === 'undefined') {
    globalThis.window = { electronAPI: null };
  }
}

/**
 * 在 import adapter 之后调用，设置 axios 实例的 baseURL。
 * @param {number} port - api-server 端口
 */
export async function configureApiClient(port) {
  const baseURL = `http://127.0.0.1:${port}/api`;

  // 动态 import — 必须在 initEnvironment() 之后
  const { default: apiClient, longRunningClient } = await import('../src/services/api/client.js');

  apiClient.defaults.baseURL = baseURL;
  longRunningClient.defaults.baseURL = baseURL;

  return { apiClient, longRunningClient };
}
