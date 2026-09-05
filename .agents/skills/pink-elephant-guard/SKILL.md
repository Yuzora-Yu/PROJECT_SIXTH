---
name: pink-elephant-guard
description: Prevent rejected, removed, corrected, or forbidden concepts from resurfacing as the topic of a final deliverable. Use after requests such as 「これは消して」「その案はなし」「入れないで」「そこじゃない」 when revising copy, visuals, dialogue, summaries, labels, UI, or other viewer-facing output; do not use when comparison, compliance, safety, accessibility, or change history explicitly requires naming the excluded item.
---

# Pink Elephant Guard / ピンクの象ガード

## Purpose

When a conversation contains rejected, removed, corrected, or forbidden ideas, keep that history out of the viewer-facing final deliverable unless the user explicitly needs it to remain visible.

The goal is not to censor words. The goal is to rebuild the deliverable from the current intended state so the result reads naturally, without deletion scars, excuses, negative phrasing, or visual remnants of discarded ideas.

## Trigger

Apply this skill when all of the following are true:

1. The conversation contains a rejected, removed, corrected, or forbidden element.
2. The user is creating or revising a viewer- or user-facing final deliverable.
3. The final deliverable does not need to explain the revision history.

Strong trigger examples include:

- 「これは消して」
- 「その案はなし」
- 「入れないで」
- 「そこじゃない」
- 「企画から外れました」
- 「前の設定は使いません」

Trigger by meaning, not only by exact string matching.

## Do not apply implicitly

Do not hide excluded material when the task requires it, including:

- comparison of alternatives
- change logs, minutes, audits, or incident analysis
- legal, contractual, advertising, or compliance disclosure
- safety, medical, allergen, accessibility, or risk information
- explicit user-requested “does not contain / does not use” claims
- ordinary new creation with no correction history

When priorities conflict, use this order:

1. Required legal, safety, contractual, or accessibility information
2. Content the user explicitly requires in the final surface
3. The user's latest confirmed current state
4. Earlier ideas and revision history

## Internal state model

Before generating, separate the conversation into four buckets:

- `TARGET_STATE`: what should now exist and be communicated
- `REJECTED_HISTORY`: discarded ideas, deleted items, incorrect prior facts, and reasons for removal
- `VISIBLE_EXCEPTIONS`: excluded/history-related information that must remain visible for comparison, disclosure, safety, or explicit user intent
- `SURFACE`: the viewer-facing surfaces to inspect, such as title, body, dialogue, image, UI, narration, labels, CTA, or final frame

Ask a question only when whether absence itself should be a selling point materially changes the deliverable and cannot be inferred. Otherwise, prefer the latest current state and proceed.

## Procedure

### 1. Build a Clean Brief

Create an internal brief using only:

- `TARGET_STATE`
- permitted facts
- medium and format
- tone
- required structure
- `VISIBLE_EXCEPTIONS` only where needed

MUST:

- describe what should exist in positive terms
- fill any gap left by deletion with content, structure, composition, actions, or information that serves the current goal
- keep rejection reasons and discarded alternatives out of the generation brief

Do not turn the brief into a long negative prompt such as “do not mention X.”

### 2. Regenerate from the current state

Generate the draft from the Clean Brief as the production source of truth.

Do not repair the previous draft by merely deleting a few words. Rebuild the deliverable with the current state as its subject.

### 3. Run the Pink Elephant Scan

Inspect the entire `SURFACE` for five leak classes:

1. **Literal leak** — rejected terms, spelling variants, labels, visible text, or named objects
2. **Semantic leak** — synonyms, paraphrases, negations, euphemisms, superordinate concepts, or equivalent meaning
3. **Rationale leak** — deletion reasons or revision language such as “instead,” “previously,” or “we removed”
4. **Attention leak** — absence, comparison, or the rejected idea becoming the title, opening, CTA, conclusion, or main topic
5. **Visual leak** — silhouettes, fragments, shadows, containers, handles, placeholders, or compositional traces of a removed visual element

Allow `VISIBLE_EXCEPTIONS` only in the specified location, purpose, and scope.

### 4. If the scan fails, discard and regenerate

If any leak is found, do not patch only the leaking word or object.

Discard the contaminated draft, return to the Clean Brief, regenerate, and scan again. The structure itself may still be centered on the rejected concept.

## Medium-specific requirements

### Text

- Scan title, opening, body, CTA, footnotes, and conclusion.
- Do not add revision explanations such as “discontinued,” “removed,” or “no longer available” unless the task explicitly requires them.
- Do not expose change history unless requested.

### Image-generation prompts

- Positively specify the current subject, shape, placement, material, lighting, and spatial relationships.
- Do not restate rejected objects as a long negative prompt.
- Check text, labels, background props, and composition for semantic or visual remnants.
- Do not claim pixel-level verification unless the actual generated image was inspected.

### Video-generation prompts

- Define current subjects, causality, action, camera, editing, audio, text, and final frame.
- Do not keep rejected events in the script as “events that do not happen.”
- Check audio for rejected dialogue, alarms, or other remnants.
- Do not claim frame/audio verification unless the actual generated video was inspected.

### UI and labels

- Do not leave a removed feature name as a blank label, disabled label, or placeholder.
- Change-history and admin audit surfaces may be treated as non-trigger cases.
- Keep required user-facing error, safety, and state information.

## Acceptance criteria

A result passes when all are true:

- No rejected term appears outside `VISIBLE_EXCEPTIONS`.
- No rejected meaning survives through synonym, negation, paraphrase, or euphemism.
- No removal rationale, change explanation, or unnecessary emphasis on absence remains.
- Title, opening, CTA, and conclusion focus on the current goal.
- Checked image/video surfaces contain no visible or audible remnants within the actually inspected scope.
- Exceptions stay within their required location, purpose, and scope.
- Uninspected media is not reported as inspected.
- The result stands naturally on the current state alone and does not look like an edited-away draft.

## Output behavior

Return a finished deliverable built from `TARGET_STATE`.

If the user asks for “完成稿だけ” or equivalent, return only the deliverable and do not append the scan report.

For full rationale, examples, test history, limitations, and safety notes, see `references/specification.md`.
