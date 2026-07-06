# QA Rubrics — VLM Evaluation Design

This document defines how a worker evaluates generated images using vision-language model capabilities. The evaluation is semantic and multi-dimensional — not a checklist of pixel-level rules.

## Core Dimensions (always evaluate)

### Prompt Fidelity (1-10)

How closely does the image match the prompt's intent?

- **10:** Every element described in the prompt is present, correctly rendered, and positioned as described. The image could be used as the prompt's illustration.
- **7:** Main subject and setting are correct. Minor details may be missing or slightly off (e.g., "golden hour lighting" rendered as neutral daylight).
- **4:** The general theme is recognizable but key elements are wrong or missing. The image feels like a loose interpretation.
- **1:** The image bears little resemblance to the prompt's intent.

**What to look for:** Subject identity, scene composition, style keywords (watercolor, photorealistic, anime), color palette, mood/atmosphere, specific objects or characters mentioned.

### Technical Quality (1-10)

Is the image free of common AI generation artifacts?

- **10:** Clean, sharp, no visible artifacts. Looks like professional output.
- **7:** Minor imperfections that don't distract (slight texture noise, very subtle blurring in background).
- **4:** Noticeable artifacts — extra fingers, warped geometry, texture inconsistencies, color banding — that draw the eye.
- **1:** Severely degraded — obvious deformities, rendering glitches, or incoherent visual elements.

**What to look for:** Hands/fingers (count them), facial symmetry, text rendering (if any), geometric consistency (straight lines where expected), texture coherence, edge quality.

### Aesthetic Appeal (1-10)

Is the image visually compelling? Would someone want to look at it?

- **10:** Striking composition, excellent use of color and light, emotionally resonant. Portfolio-worthy.
- **7:** Pleasant and well-composed. Would work for most commercial or editorial uses.
- **4:** Functional but bland. Looks like "stock AI art" — technically okay but no visual personality.
- **1:** Ugly, unsettling, or visually chaotic in ways the prompt didn't intend.

**What to look for:** Composition (rule of thirds, leading lines, balance), color harmony, lighting quality, depth/dimension, emotional impact, visual storytelling.

### Structural Integrity (1-10)

Do complex structures in the image make sense?

- **10:** Architecture, anatomy, text, and spatial relationships are all correct and internally consistent.
- **7:** Most structures are correct; one or two minor inconsistencies in background elements.
- **4:** Major structural problems — a building with impossible geometry, a person with limbs going the wrong way, text that's gibberish.
- **1:** The image contains elements that are physically impossible or nonsensical in ways that dominate the composition.

**What to look for:** Anatomical correctness (for people/animals), architectural plausibility, perspective consistency, text legibility and correctness, object relationships (is the cup on the table or floating?).

**Note:** This dimension only applies when the image contains evaluable structures. A pure abstract/landscape may not have structural elements to assess — in that case, default to 8 and note "no complex structures to evaluate."

## Conditional Dimensions (evaluate when relevant)

### Text Rendering (1-10) — when the prompt requests text in the image

- Are all requested text strings present?
- Is the spelling correct?
- Is the font style appropriate for the context?
- Is the text legible and well-integrated into the composition?

### Style Consistency (1-10) — when generating a series or matching a reference

- Does the style match across the series?
- Are color palettes, line weights, and rendering techniques consistent?

### UI/Layout Fidelity (1-10) — when the prompt describes a UI mockup or layout

- Are UI elements (buttons, cards, navigation) rendered correctly?
- Is the layout logical and usable?
- Are labels and icons coherent?

## Scoring Protocol

1. **Evaluate all core dimensions.** Score each 1-10 with a one-sentence justification.

2. **Evaluate applicable conditional dimensions.** Skip dimensions that don't apply to this image.

3. **Compute overall score:**
   - If no conditional dimensions: `overall = mean(core dimensions)`
   - If conditional dimensions apply: `overall = mean(all applicable dimensions)`

4. **Pass/fail threshold:** overall >= 7 = pass. Below 7 = fail.

5. **Borderline protocol (overall 5-7):** Run a second evaluation focusing only on the two lowest-scoring dimensions. If the second pass agrees within 1 point, accept the first verdict. If the second pass scores significantly differently (2+ points), take the more conservative score.

## Evaluation Prompt Template

When performing QA, structure your evaluation like this:

```
I am evaluating a generated image against its prompt.

**Original prompt:** "{prompt}"

**Evaluation:**

### Prompt Fidelity: {score}/10
{one-sentence justification}

### Technical Quality: {score}/10
{one-sentence justification}

### Aesthetic Appeal: {score}/10
{one-sentence justification}

### Structural Integrity: {score}/10
{one-sentence justification}

{conditional dimensions if applicable}

**Overall: {score}/10**
**Verdict: {PASS/FAIL}**

{If FAIL: specific, visual, concrete description of what went wrong and what to change in the prompt}
```

## Adapting Rubrics to Task Context

The rubrics above are the default. The dispatcher may pass task-specific rubric overrides:

- **Strict text rendering:** If the task involves text-heavy images (posters, menus), raise the text rendering weight or make it a hard gate (text must be >= 7 regardless of overall).
- **Relaxed structural integrity:** For abstract or surrealist prompts, lower the structural integrity expectation.
- **Custom dimensions:** The user's task description may define custom evaluation criteria (e.g., "brand consistency" for marketing images). Add these as additional dimensions.

The worker should adapt the rubric to the task context rather than rigidly applying defaults. If the prompt is "abstract expressionist painting", structural integrity is largely irrelevant — weight aesthetic appeal higher.

## Anti-Patterns to Avoid

- **Don't be a perfectionist.** A 7/10 image is good. Not every image needs to be a masterpiece. The goal is "fit for purpose", not "gallery-ready".
- **Don't penalize style.** If the prompt asks for "childlike crayon drawing", low technical quality is intentional, not a defect. Adjust technical quality scoring to match the requested style.
- **Don't hallucinate defects.** If you can't clearly see a problem, don't invent one. "I think there might be an extra finger somewhere" is not a valid failure reason — either you can see it or you can't.
- **Don't over-weight one dimension.** A 3 in one dimension and 9s in others still averages to 7.5 — that's a pass. Only fail for genuinely poor overall results.
