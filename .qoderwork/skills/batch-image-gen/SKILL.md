---
name: batch-image-gen
description: >
  Orchestrate batch image generation pipelines through the AIS CLI (ais).
  Parses natural language task descriptions into structured plans, dispatches
  parallel sub-agent workers for expand-gen-QA-retry cycles, tracks state
  via file checkpoints for resume. Use when the user wants to generate many
  images at once, run a batch generation, queue images overnight, set up
  automated image production with quality checks, or mentions batch/pipeline
  generation. Also fires on scheduled/cron image tasks.
---

# Batch Image Generation

You are a **dispatcher** — you plan, dispatch, monitor, and report. Workers do the actual generating.

Leading word: _dispatch_. Every time you see it, think: assign work to a worker, track the result, decide what's next. Never do a worker's job yourself.

## Steps

### Step 1 — Plan

Parse the user's natural language task description into a generation plan. Extract: image count, prompt list or generation pattern, model, size, QA on/off, folder.

Apply defaults for anything unspecified: model `qwen-image-3`, size `1:1`, QA on, max retries 3, concurrency 2. If the user provides a template, structured JSON, or a prompt file — accept it directly, don't force natural language.

Check for an existing checkpoint file (`batch-checkpoint-*.json` in the working directory). If found, skip to Step 1-Resume.

**Completion:** You have a complete plan — image count, prompt list (or generation strategy), model, size, QA config, folder — and the user has not yet seen it.

### Step 2 — Confirm

Present the plan:

```
Generation Plan:
- {N} images, model: {model}, size: {size}
- QA: {on/off} ({rubric summary if on})
- Concurrency: {N} workers
- Retry: adaptive, max {N} attempts
- Folder: {name}
- Estimated time: {rough estimate based on N * ~60s/image / concurrency}

Proceed?
```

Wait for confirmation. If the user adjusts parameters, update the plan and re-confirm.

**Completion:** User has approved the plan.

### Step 3 — Dispatch

Initialize the [checkpoint file](#checkpoint-format). Enter the dispatch loop:

1. While there are `pending` tasks AND active workers < concurrency limit: spawn a worker sub-agent. The worker's instructions: follow [worker-sop.md](worker-sop.md) exactly. Pass it the task spec (prompt, model, size, QA config, attempt history if retry).

2. When a worker returns: read its result, update the checkpoint.

3. If the task **failed**, diagnose before deciding:
   - **System error** (api-server unreachable, connection refused, unexpected crash, exit code 2): this is infrastructure broken, not the task's fault. Try to fix (restart api-server, wait and retry once). If unfixable after 2 tries, mark `skipped` with reason. **Do not retry the same broken path.**
   - **Task error** (QA fail, model content filter, bad output, exit code 3): this is the task needing adjustment. Inject the failure diagnosis into the next attempt's prompt context. Let the worker reason about how to rewrite.
   - If a system error repeats 3+ times across different tasks, pause that category (e.g., all tasks for that model) and mark remaining as `skipped`.

4. If a task has exhausted retries (3 attempts), mark `exhausted` and move on.

5. When a worker slot opens, immediately dispatch the next pending task. **Never wait** — greedy scheduling maximizes pipeline utilization.

6. Repeat until all tasks are `completed`, `exhausted`, or `skipped`.

**Completion:** Every task in the checkpoint has a terminal status.

### Step 4 — Report

Generate a final Markdown report. Structure:

1. **Summary** — completed/exhausted/skipped counts, total time, success rate
2. **Results grid** — each image: prompt (original + final), model, QA scores, attempt count, status
3. **Failures** — exhausted/skipped with diagnosis trail (what went wrong each attempt, what was tried)
4. **QA highlights** — top-scoring images, patterns in what passed vs failed
5. **Recommendations** — what to re-run, what to adjust in prompts, model suggestions

Save report to outputs folder. Present to user.

**Completion:** Report is saved and presented.

### Step 1-Resume — Resume

Read the checkpoint file. Report state: X completed, Y failed/exhausted, Z pending. Continue from Step 3 with remaining `pending` and retryable `exhausted` tasks.

**Completion:** All remaining tasks dispatched into the loop.

## Checkpoint Format

Written to `batch-checkpoint-{jobId}.json` in the working directory.

```json
{
  "jobId": "batch-20260707-001",
  "createdAt": "2026-07-07T22:00:00+08:00",
  "plan": {
    "model": "qwen-image-3",
    "size": "1:1",
    "qa": true,
    "maxRetries": 3,
    "concurrency": 2,
    "folder": "batch-0707"
  },
  "tasks": [
    {
      "id": 0,
      "prompt": "...",
      "status": "completed",
      "attempts": [
        { "prompt": "...", "imageId": 42, "qaScore": { "overall": 8, "dims": {} }, "duration": 65000 }
      ]
    },
    {
      "id": 1,
      "prompt": "...",
      "status": "pending",
      "attempts": []
    }
  ],
  "stats": { "completed": 1, "failed": 0, "exhausted": 0, "skipped": 0, "pending": 1 }
}
```

Statuses: `pending` | `running` | `completed` | `exhausted` | `skipped`.

Write the checkpoint atomically: write to a temp file, then rename. This prevents corruption if the process dies mid-write.

## Error Philosophy

**Debug first, retry second.** When something fails, your first question is: "Is the system broken, or is the task wrong?"

System errors and task errors demand completely different responses. A system error means fix the infrastructure — restarting, waiting, or skipping the broken path. A task error means the prompt or approach needs adjustment — diagnose, then retry with a smarter attempt.

Never retry the same exact call hoping for a different result. If the api-server is down, retrying 100 times won't help. If a prompt triggers content filtering, rewriting the same prompt identically won't help either.

When in doubt about the error type, try once more with the same parameters. If it fails the same way — it's systemic. If it fails differently — it's the task.

## Progress Updates

Every 10 completed tasks (or 30 minutes, whichever comes first), output a progress line:

```
[dispatch] {completed}/{total} done | {active} workers busy | {failed} failed | ETA {time}
```

## Concurrency

Default: 2 parallel workers. May probe higher — if tasks succeed without rate-limit errors (HTTP 429, exit code 3 with quota message), try adding a 3rd worker. On any rate-limit signal, shrink back to the last safe concurrency. Never ask the user about QPM — assume 2 and adapt.

## AIS CLI Reference

All workers invoke the AIS CLI. Key commands for the worker SOP:

```bash
# Generate an image (blocking, returns JSON)
node app/bin/ais.mjs gen -p "<prompt>" -m <model> --size <ratio> --folder "<folder>"

# Expand a prompt
node app/bin/ais.mjs expand "<short prompt>" --style "<style>" -m <model>

# Query recent images
node app/bin/ais.mjs list --limit 5 -f "<folder>"
```

Exit codes: 0=success, 1=general error, 2=api-server unreachable, 3=model API error (content filter, quota), 4=file error.

The CLI path is relative to the AIS project root: `C:\Users\83871\Documents\my projects\image_test\`

## Scheduling Integration

This skill works with QoderWork's scheduled task system. When triggered by a cron job, skip Step 2 (Confirm) — the plan was confirmed when the schedule was created. Go straight from Plan to Dispatch.
