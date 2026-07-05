/**
 * batch command — read prompts from a text file and generate images sequentially.
 *
 * Reuses genAction from gen.mjs in collectMode so each call returns a result
 * object instead of writing to stdout.  Results are accumulated into a JSON
 * array printed once at the end.
 *
 * Usage:
 *   node bin/ais.mjs batch --file prompts.txt --model qwen-image-3
 *   node bin/ais.mjs batch --file prompts.txt --model gpt-image-2 --size 16:9
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { genAction } from './gen.mjs';

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Read a prompts file and return non-empty, non-comment lines.
 * @param {string} filePath
 * @returns {string[]}
 */
function readPromptsFile(filePath) {
  const absPath = resolve(filePath);
  if (!existsSync(absPath)) {
    throw new Error(`Prompts file not found: ${absPath}`);
  }
  const content = readFileSync(absPath, 'utf-8');
  return content
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'));
}

// ─── Main batch action ──────────────────────────────────────────────────────

/**
 * Execute the batch command.
 * @param {Object} opts - parsed commander options
 * @param {Object} ctx  - { port, quiet } from preflight
 */
export async function batchAction(opts, ctx) {
  const { quiet } = ctx;
  const log = (...args) => { if (!quiet) process.stderr.write(args.join(' ') + '\n'); };

  // ── 1. Validate & read file ──────────────────────────────────────────────
  if (!opts.file) {
    process.stderr.write(JSON.stringify({
      error: 'INVALID_PARAMS',
      message: '--file is required (path to prompts text file)',
    }) + '\n');
    process.exitCode = 1;
    return;
  }

  let prompts;
  try {
    prompts = readPromptsFile(opts.file);
  } catch (err) {
    process.stderr.write(JSON.stringify({
      error: 'FILE_ERROR',
      message: err.message,
    }) + '\n');
    process.exitCode = 4;
    return;
  }

  if (prompts.length === 0) {
    log('[batch] No prompts found in file');
    process.stdout.write('[]\n');
    return;
  }

  log(`[batch] Loaded ${prompts.length} prompt(s) from ${opts.file}`);

  // ── 2. Sequential generation ─────────────────────────────────────────────
  const results = [];
  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < prompts.length; i++) {
    const prompt = prompts[i];
    log(`[batch] Processing ${i + 1}/${prompts.length}: "${prompt.slice(0, 80)}${prompt.length > 80 ? '...' : ''}"`);

    // Build gen-compatible opts — spread shared params, inject current prompt
    const genOpts = {
      prompt,
      model: opts.model,
      size: opts.size,
      count: '1',  // batch mode: one image per prompt
      quality: opts.quality,
      expand: opts.expand,
      seed: opts.seed,
      negative: opts.negative,
      promptExtend: opts.promptExtend,
      folder: opts.folder,
      // image / i2i not applicable in batch text-file mode
    };

    const collectCtx = { ...ctx, collectMode: true, quiet: true };

    try {
      const collected = await genAction(genOpts, collectCtx);

      if (collected && collected.ok) {
        const data = collected.data;
        // data may be a single object or an array
        const images = Array.isArray(data) ? data : [data];
        for (const img of images) {
          results.push({
            prompt,
            id: img.id ?? null,
            status: 'completed',
          });
          succeeded++;
        }
        const firstId = images[0]?.id;
        log(`[batch] ✓ Image ${firstId ?? '(no id)'} generated successfully`);
      } else {
        // genAction returned an error in collectMode
        const errMsg = collected?.error?.message || 'Unknown error';
        results.push({ prompt, id: null, status: 'failed', error: errMsg });
        failed++;
        log(`[batch] ✗ Failed: ${errMsg}`);
      }
    } catch (err) {
      // Unexpected exception
      results.push({ prompt, id: null, status: 'failed', error: err.message });
      failed++;
      log(`[batch] ✗ Failed: ${err.message}`);
    }
  }

  // ── 3. Output results ────────────────────────────────────────────────────
  process.stdout.write(JSON.stringify(results, null, 2) + '\n');

  // Summary to stderr
  log(`[batch] Complete: ${succeeded}/${prompts.length} succeeded, ${failed} failed`);
}
