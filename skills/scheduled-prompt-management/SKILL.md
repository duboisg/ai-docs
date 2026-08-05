---
name: scheduled-prompt-management
description: Create, inspect, modify, test, pause, resume, and remove local recurring Codex prompts run by the AI Docs Scheduled Prompt Heartbeat. Use when the workspace owner asks to schedule recurring work, change a scheduled prompt, list schedules, or manage the local heartbeat task.
---

# Scheduled Prompt Management

Manage local JSON configuration files under `scheduled-prompts/` in the active AI Docs workspace. Do not use an MCP server for this workflow.

## Workflow

1. Read `references/config-schema.md` before creating or changing a prompt.
2. Interpret the user's natural-language intent. Ask one concise question only when cadence, timezone, or desired result cannot be inferred safely.
3. Select an explicit model appropriate to the task and create or modify exactly one JSON prompt file using `apply_patch`.
4. Explain the model, CRON expression, timezone and effective 30-minute precision.
5. Use `scripts/heartbeat.ps1 -DryRun` to verify detection without launching Codex.
6. For first-time setup, use `scripts/install-heartbeat-task.ps1` only when the workspace owner has asked to install or enable the Windows Scheduled Task.

## Safety

- Keep `enabled` false for examples and drafts until the workspace owner asks to activate them.
- Require an explicit `model` value; do not rely on Codex's global model default.
- Never use a scheduled prompt to bypass Codex trust boundaries.
- Scheduled sessions use ordinary `codex exec` with normal project instructions and approval behaviour.
- Do not manually edit `scheduled-prompts/state/`.
- One due prompt launches one isolated Codex session. Do not bundle unrelated prompts.
- Every elapsed CRON occurrence is kept in the durable backlog and caught up chronologically; the heartbeat rate-limits launches rather than dropping missed work.

## Operations

- Create: add a new JSON file with a stable kebab-case `id`.
- Change: preserve the `id`; change the CRON, text or enabled state explicitly requested.
- Pause/resume: change only `enabled`.
- Remove: delete only after the workspace owner explicitly asks; prefer pause when intent is uncertain.
- Test: run `scripts/heartbeat.ps1 -DryRun`; use `-NowUtc` only for controlled verification.

## Task setup

The task is named `AI Docs Scheduled Prompt Heartbeat`. It runs every 30 minutes with the Windows `/IT` option, so it executes only while the configured user is logged in. It does not run when the user is disconnected.
