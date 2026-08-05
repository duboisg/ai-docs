# Scheduled prompts

This folder is the local configuration registry for the Scheduled Prompt Heartbeat.

- Put one enabled JSON file per recurring prompt in this folder.
- The heartbeat evaluates standard five-field CRON expressions every 30 minutes.
- A due prompt is launched in its own `codex exec` session from the active AI Docs workspace.
- Runtime state is written under `state/`; do not edit it manually.
- Every prompt must specify its target `model`; the heartbeat never falls back silently to the global Codex default.

Use the `scheduled-prompt-management` skill to create, modify, pause, test or remove prompt files.

Run the management scripts from the cloned repository root, set `AI_DOCS_WORKSPACE`, or pass `-WorkspacePath` explicitly.

The effective precision is the heartbeat interval. If a CRON expression matches while the heartbeat is not running, every missed occurrence is recorded durably and caught up in chronological order. To avoid flooding the machine after a long absence, the heartbeat launches at most three queued occurrences per run; the rest remain queued until a later heartbeat.
