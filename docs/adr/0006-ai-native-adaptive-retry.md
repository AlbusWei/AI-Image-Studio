# Batch retry strategy is AI-native adaptive, not rule-based

Generated images may fail QA evaluation or hit model errors. The retry strategy determines how the system recovers.

**Decision:** Retry is AI-native — the agent diagnoses each failure using VLM feedback and its own reasoning, then decides the recovery approach per-attempt. System errors (infrastructure broken) take a debug-and-fix path. Task errors (bad output) inject failure context into the next attempt's prompt. Max 3 attempts per image. The agent reasons about what to change rather than following hardcoded rules.

**Considered Options:**
- **Fixed-count retry with static prompt changes:** Retry N times, each time appending generic fixes like "higher quality, better anatomy". Predictable but wastes attempts on wrong fixes.
- **Rule-based branching:** If error contains "hands" → add "perfect hands"; if "text" → add "correct spelling". Brittle — can't handle novel failure modes.

Hardcoded rules can't anticipate the diversity of AI image generation failures. An agent with VLM feedback can see what's actually wrong and reason about what to change. The same diagnosis ability that makes a good QA evaluator makes a good retry strategist.

**Consequences:**
- Each retry attempt is different — the agent uses attempt history to avoid repeating failed strategies.
- The distinction between system errors and task errors is critical and must be made before deciding recovery.
- 3-attempt maximum prevents infinite loops while allowing meaningful adaptation.
