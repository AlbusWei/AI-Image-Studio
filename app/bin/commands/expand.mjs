/**
 * expand command — Prompt expansion via LLM
 *
 * Usage: node bin/ais.mjs expand <prompt> [--style <style>] [--model <target>]
 *
 * Success output: { "original": "...", "variations": [...] }
 */

import { getLLMAdapter } from '../../src/services/api/index.js';

const EXIT = { OK: 0, ERROR: 1 };

/**
 * Execute the expand command.
 * @param {string} prompt - original prompt (positional argument)
 * @param {Object} opts - parsed commander options
 * @param {Object} ctx - { port, quiet } from preflight
 */
export async function expandAction(prompt, opts, ctx) {
  const { quiet } = ctx;
  const log = (...args) => { if (!quiet) process.stderr.write(args.join(' ') + '\n'); };
  const outputResult = (data) => process.stdout.write(JSON.stringify(data, null, 2) + '\n');
  const outputError = (err, exitCode = EXIT.ERROR) => {
    process.stderr.write(JSON.stringify(err) + '\n');
    process.exitCode = exitCode;
  };

  if (!prompt) {
    return outputError({ error: 'INVALID_PARAMS', message: 'prompt argument is required' });
  }

  try {
    const llm = getLLMAdapter();

    const context = {};
    if (opts.model) context.model = opts.model;
    if (opts.style) context.style = opts.style;

    log('[expand] Expanding prompt via LLM...');
    const controller = new AbortController();
    const sigintHandler = () => controller.abort();
    process.once('SIGINT', sigintHandler);
    try {
      const variations = await llm.expandPrompt(prompt, context, controller.signal);

      if (!variations || variations.length === 0) {
        return outputError({ error: 'EXPAND_FAILED', message: 'LLM returned no variations' });
      }

      outputResult({ original: prompt, variations });
    } finally {
      process.removeListener('SIGINT', sigintHandler);
    }
  } catch (err) {
    outputError({ error: 'EXPAND_FAILED', message: err.message });
  }
}
