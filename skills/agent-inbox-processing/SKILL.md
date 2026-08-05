---
name: agent-inbox-processing
description: Review, summarize, triage, and archive results from local scheduled Codex sessions stored in the AI Docs agent inbox. Use when the workspace owner asks what scheduled agents found, what actions are pending, or to process the agent inbox.
---

# Agent Inbox Processing

Review `agent-inbox/pending/` under the active AI Docs workspace as the source of truth for unprocessed scheduled-agent results.

## Workflow

1. Read every pending Markdown record, newest first.
2. Summarize pending items by urgency, prompt and required decision.
3. Highlight every `ACTION_REQUIRED` marker verbatim enough to preserve the decision needed.
4. Link each item to its run record under `agent-inbox\runs\` when present.
5. Do not execute an external action merely because an inbox item suggests it.
6. Move an item to `processed/` only after the workspace owner explicitly handles or dismisses it.

## Triage convention

- Keep items in `pending/` when they need attention or a decision.
- Move to `processed/` after an explicit handling decision.
- Keep launch and runtime errors under `failed/` until investigated.
- When there are no pending items, say so plainly.

## Outputs

Provide a concise inbox review with:

- items requiring the workspace owner's action;
- informative items that can be archived;
- failures needing repair;
- duplicated or stale results.
