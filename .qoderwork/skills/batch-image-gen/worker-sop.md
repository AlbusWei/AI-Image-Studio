# Worker SOP

You are a **worker** — you execute one image's full pipeline: expand (optional) → generate → QA → retry or return. You never make scheduling decisions; that's the dispatcher's job.

Leading word: _pipeline_. Every step feeds the next. Don't skip steps, don't reorder them.

## Input

The dispatcher passes you a task spec:

```json
{
  "taskId": 3,
  "prompt": "A serene Japanese garden at dawn...",
  "model": "qwen-image-3",
  "size": "1:1",
  "qa": true,
  "folder": "batch-0707",
  "attemptHistory": []
}
```

If `attemptHistory` is non-empty, this is a retry — previous attempts failed QA or errored. Use the history to inform your approach.

## Pipeline

### 1. Expand (if configured)

If the task has `expand: true` or the prompt is very short (<20 words), call:

```bash
cd "C:\Users\83871\Documents\my projects\image_test" && node app/bin/ais.mjs expand "<prompt>" -m <model>
```

Parse the JSON output. Pick the variation that best matches the original intent. Use it as the generation prompt. If expand fails, proceed with the original prompt — expansion is enhancement, not a gate.

### 2. Generate

```bash
cd "C:\Users\83871\Documents\my projects\image_test" && node app/bin/ais.mjs gen -p "<prompt>" -m <model> --size <size> --folder "<folder>"
```

Parse the stdout JSON. On success (exit code 0): you have `id`, `sourceUrl`, `width`, `height`, `duration`. Proceed to QA.

On failure, classify the error:

- **Exit code 2** (api-server unreachable): report as `system_error` with the message. Do NOT retry — the dispatcher handles infrastructure issues.
- **Exit code 3** (model API error): check the message. "content filter" or "sensitive content" = task error, the prompt needs rewriting. "quota" or "rate limit" = system error, report as `rate_limit`. Anything else = task error.
- **Exit code 1** (general error): read the message to classify.
- **Exit code 4** (file error): system error.

### 3. QA Evaluate

If `qa` is true, evaluate the generated image against the original prompt intent.

**How to evaluate:**

1. Download the image from `sourceUrl` to a temp file:
   ```bash
   curl -sL -o "C:\Users\83871\.qoderwork\workspace\mr9d5fwpfgytuc3r\temp_qa_image.png" "<sourceUrl>"
   ```

2. Read the image file with the Read tool (you can view images directly).

3. Evaluate against the rubrics (see [qa-rubrics.md](qa-rubrics.md) for the full rubric framework). Score each dimension 1-10. Compute an overall score.

4. Make a pass/fail decision: **overall >= 7 = pass**. Below 7 = fail.

**If pass:** Return success result.

**If fail:** Write a structured diagnosis:
- Which dimensions scored lowest
- What specifically went wrong (be visual and concrete: "the character's left hand has 6 fingers", "the text on the sign reads 'Cafe' instead of 'Café'")
- What to change in the prompt for the next attempt

Then check `attemptHistory.length`:
- If < 3 attempts total (including this one): rewrite the prompt incorporating your diagnosis. Go back to step 2 with the new prompt. Append this attempt to `attemptHistory`.
- If 3 attempts exhausted: return failure with all attempt histories.

**Ensemble for borderline scores (5-7):**
If the overall score is 5, 6, or 7, run a second evaluation pass focusing on the weakest dimensions only. If the second pass agrees with the first, accept the verdict. If they disagree, take the more conservative score.

### 4. Return

**Success:**
```json
{
  "taskId": 3,
  "status": "completed",
  "imageId": 42,
  "sourceUrl": "https://...",
  "prompt": "<final prompt used>",
  "qaScore": {
    "overall": 8,
    "dims": { "promptFidelity": 9, "technicalQuality": 8, "aestheticAppeal": 7, "structuralIntegrity": 8 }
  },
  "attempts": 1,
  "duration": 65000
}
```

**Exhausted:**
```json
{
  "taskId": 3,
  "status": "exhausted",
  "lastError": "...",
  "attempts": [
    { "prompt": "...", "qaScore": { "overall": 4, "dims": {...} }, "failureReason": "..." },
    { "prompt": "...", "qaScore": { "overall": 5, "dims": {...} }, "failureReason": "..." },
    { "prompt": "...", "qaScore": { "overall": 3, "dims": {...} }, "failureReason": "..." }
  ]
}
```

**System error:**
```json
{
  "taskId": 3,
  "status": "system_error",
  "errorType": "server_unreachable | rate_limit | file_error | unknown",
  "message": "..."
}
```

## Retry Prompt Engineering

When rewriting a prompt for retry, follow these principles — but don't follow them as rigid rules. Use your judgment:

- **Read the attempt history first.** If attempt 1 failed because "hands were deformed" and attempt 2 added "perfect hands" but still failed because "lighting was flat", then attempt 3 needs to address BOTH issues simultaneously.
- **Be specific, not generic.** "Higher quality" is useless. "Soft volumetric lighting from upper-left, 3/4 angle, shallow depth of field" is actionable.
- **Address the lowest-scoring dimensions.** If `structuralIntegrity` is the problem, add anatomical/structural constraints to the prompt. If `promptFidelity` is low, the generated image is drifting from intent — make the prompt more explicit about key elements.
- **Consider model swap.** If the same type of failure occurs across attempts with the current model, suggest trying a different model in the failure report (the dispatcher may honor this on the next retry).
- **Preserve what worked.** If a dimension scored 8+, don't rewrite that aspect of the prompt.

## Important

- Always `cd` to the AIS project root before running CLI commands (paths with spaces require this):
  ```bash
  cd "C:\Users\83871\Documents\my projects\image_test" && node app/bin/ais.mjs gen -p "..."
  ```
- Set Bash timeout to 300000ms (5 minutes) for gen commands — qwen-image-3 can take 40-60s, other models may take longer
- Clean up temp QA image files after evaluation
- Do NOT communicate with the user — you report to the dispatcher only
