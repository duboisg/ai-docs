# Scheduled prompt configuration

Store one JSON object per file under `scheduled-prompts/` in the active AI Docs workspace.

```json
{
  "id": "weekly-review",
  "name": "Weekly review",
  "enabled": true,
  "cron": "0 16 * * 5",
  "timezone": "America/Toronto",
  "model": "gpt-5.6-luna",
  "prompt": "Review my open commitments and prepare a concise weekly review.",
  "delivery": "agent-inbox"
}
```

Required fields:

- `id`: stable kebab-case identifier.
- `name`: short display name.
- `enabled`: boolean.
- `cron`: standard five-field CRON (`minute hour day-of-month month day-of-week`).
- `timezone`: Windows timezone ID or `America/Toronto`.
- `model`: exact Codex model slug for this prompt. The heartbeat passes it explicitly to `codex exec --model`; it never falls back silently to the global default.
- `prompt`: complete natural-language instruction for the isolated Codex session.

Optional field:

- `delivery`: currently informational; use `agent-inbox`.

The heartbeat runs every 30 minutes. Every CRON occurrence elapsed since its last successful heartbeat is added to a durable catch-up queue; no elapsed occurrence is replaced by a newer one. The queue is drained chronologically, at a maximum of three isolated Codex sessions per heartbeat by default. Prefer schedules aligned to `:00` or `:30` for the most predictable latency.
