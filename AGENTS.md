# AGENTS.md

## Purpose

This repository is the workspace owner's operational workspace and personal-AI control plane.

Use it to do real work, operate configured capabilities, create task artifacts, and leave work resumable.

This repo is working memory, not durable knowledge. Durable knowledge belongs in the second brain and is handled only through the appropriate MCP or workflow. If a task reveals something likely to matter long-term, mention it briefly as a possible knowledge candidate; do not promote it automatically.

## Core Rules

* Do not claim to have checked anything unless you actually accessed it.
* Never ask for secrets in chat; request secure credential placement instead.
* Preserve user-created files and unrelated worktree changes.
* Use configured MCP servers and skills when they fit.
* Do not simulate unavailable capabilities.
* Prefer the smallest structure that supports the task.
* Be concise, factual, and action-oriented.

## Browser Routing

* When the workspace owner asks for the "browser agent" or the browser-agent MCP, use the workspace-owned `browser_agent` MCP tools directly.
* Do not treat an empty `agent.browsers.list()` result from the bundled Browser plugin as evidence that the separate `browser_agent` MCP is unavailable. Check the `mcp__browser_agent__*` tool surface independently.
* Use explicit `tab_id` values and stop before submitting forms or other sensitive external actions unless the workspace owner authorized that exact submission.

## Starting Work

For non-trivial work, choose a project context and a task folder.

Project task:

```text
outputs/<project-name>/<short-task-slug>/
```

One-off task:

```text
outputs/_one-offs/<short-task-slug>/
```

Use an existing project when the match is clear. Create a new project only for distinct long-term outcomes likely to accumulate related tasks, artifacts, decisions, or follow-up work.

A project has:

```text
outputs/<project-name>/README.md
outputs/<project-name>/LOG.md
outputs/<project-name>/<short-task-slug>/
```

Do not create a project per conversation, deliverable, investigation, or phase. Those usually belong as task folders inside a project.

If one-offs start forming a real project, propose promotion instead of silently reorganizing them.

## Workspace

* `mcp-servers/`: reusable external capabilities.
* `skills/`: reusable procedures.
* `outputs/README.md`: project registry.
* `outputs/<project-name>/`: registered project.
* `outputs/<project-name>/<short-task-slug>/`: project task work.
* `outputs/_one-offs/<short-task-slug>/`: unclassified task work.

Use lowercase kebab-case for new folders.

Do not scan unrelated folders unless needed.

Do not create dashboards, trackers, taxonomies, templates, or status systems unless they solve a current problem.

## Projects

Each project has:

* `README.md`: current state and source of truth.
* `LOG.md`: meaningful history, not a command transcript.

Keep this checkpoint near the top of `README.md`:

```md
Last touched: YYYY-MM-DD
Resume here: ...
Next action: ...
```

When starting project work, read `README.md` first. Use the checkpoint as the default starting point. Read `LOG.md` only when needed.

When ending meaningful project work, update the checkpoint if state changed. Append to `LOG.md` only for meaningful results, decisions, blockers, milestones, or direction changes.

Optional log format:

```md
## YYYY-MM-DD — checkpoint

Did: ...
Learned: ...
Next: ...
```

Meaningful work changes project state, creates or modifies important artifacts, discovers an important fact, records a decision, hits a significant blocker, or changes the next action.

## Change Authority

Proceed without confirmation for reads, local writes under `outputs/`.

Get approval before reversible external writes unless explicitly authorized.

For high-impact or hard-to-reverse external changes, inventory current state, preserve evidence or backup, show the plan, get explicit approval, apply, and verify.

Always stop unless the workspace owner explicitly authorized the exact action for authentication, financial actions, publication, sending messages, destructive actions, or sensitive personal actions.

`mcp-servers/` or `skills/` can be changed only as specified in the "Capability Improvement" section.

## Missing Access

If a capability is unavailable, report what was attempted, what failed, what can still be done, and what access or configuration is needed.

Do not replace missing access with guesswork when the task depends on that access.

## Finishing Work

Before finishing meaningful work, update the project checkpoint if the resume point changed.

In the final chat response, briefly report what changed, where the work is, what was verified or blocked, and the next action if there is one.

Mention a knowledge candidate only when something learned is likely to matter beyond the current task or project.

## Capability Improvement

MCP servers and skills are part of the workspace, not fixed black boxes.

If a capability blocks, slows, duplicates, or degrades the current task, pause the task and improve the existing MCP or skill when the fix is local, useful, and within change authority.

Do not create a new MCP without the workspace owner's approval. Propose one when a missing reusable capability would materially improve future work, and explain why existing MCPs or skills are not enough.
