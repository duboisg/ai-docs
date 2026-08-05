# AI Docs

**A Codex starter kit for personal AI that does not just remember context—it carries real work forward.**

Most personal AI systems stop at one of two places. Chat gives you intelligence without continuity: each session has to reconstruct the work. A second brain gives you continuity without agency: the knowledge is available, but it can still sit unused.

AI Docs connects the two. It turns a Codex workspace into a persistent operating system for projects, reusable procedures, scheduled work, and controlled actions across real tools.

The goal is simple: an agent should be able to pick up a project, understand where it stopped, use the right capabilities, produce a tangible result, and leave the work in a state that the next session can resume.

This repository contains the reusable operating layer. Private projects, credentials, browser profiles, generated artifacts, and personal knowledge stay local and are excluded from Git by design.

## From a second brain to an action system

AI Docs is inspired by Andrej Karpathy's [LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f): raw sources are compiled into a structured, persistent knowledge artifact maintained by an LLM instead of being rediscovered from scratch on every query.

That design remains intact here. The second brain is still a separate durable knowledge system with immutable sources, a maintained wiki, provenance, search, ingestion, synthesis, and linting.

AI Docs asks the next question:

> What if the same compounding model applied not only to what an agent knows, but to what it is trying to accomplish?

A real-life project is more than knowledge. It has a current state, unfinished work, decisions, evidence, external systems, safety boundaries, recurring actions, and deliverables. AI Docs gives those elements explicit places to live and stable ways to interact.

```text
                         human intent
                              |
                              v
                   +---------------------+
                   | workspace rules     |
                   | judgment + authority|
                   +----------+----------+
                              |
                 +------------+------------+
                 |                         |
                 v                         v
        +----------------+        +----------------+
        | skills         |        | projects       |
        | procedures     |<------>| state + work   |
        +-------+--------+        +-------+--------+
                |                         |
                v                         v
        +----------------+        +----------------+
        | MCP servers    |        | second brain   |
        | real actions   |        | durable memory |
        +-------+--------+        +----------------+
                |
                v
        browsers, knowledge, email,
        calendars, tasks, Jira, Confluence

        scheduled prompts add time and recurrence
        agent inbox adds asynchronous review
```

## The six primitives

### 1. Instructions define judgment

[`AGENTS.md`](AGENTS.md) is the operating contract. It tells Codex how to start work, where state belongs, what evidence is required, which actions need approval, and how to leave a task resumable.

Instructions can be nested. For example, [`outputs/AGENTS.md`](outputs/AGENTS.md) adds project-specific conventions without duplicating the root trust model.

This is more than prompting. The instructions act as institutional memory for how work should be performed.

### 2. Projects preserve operational continuity

Private workspaces under `outputs/` retain the mutable state of real work:

- what the project is trying to achieve;
- where the previous session stopped;
- decisions, evidence, experiments, and blockers;
- generated artifacts and verification results;
- the safest next action.

The repository includes the instructions for this structure, but not the private project contents.

### 3. Skills encode reusable procedures

[`skills/`](skills/) contains workflows that combine tools, decision logic, safety rules, and verification. A skill captures how to perform a class of work so the process does not have to be reinvented in every conversation.

The included skills cover:

- importing, ingesting, querying, synthesizing, and linting a second brain;
- creating and managing recurring Codex prompts;
- reviewing and triaging results from scheduled sessions.

Skills remain separate from capabilities: they describe the procedure without owning the underlying integration.

### 4. MCP servers provide controlled action

[`mcp-servers/`](mcp-servers/) contains local Model Context Protocol integrations that expose atomic capabilities to Codex:

| Capability | Purpose |
| --- | --- |
| [Browser Agent](mcp-servers/browser-agent/) | Inspect and operate a visible, isolated Chrome session through explicit tab-scoped tools. |
| [Second Brain](mcp-servers/second-brain/) | Search and maintain a Markdown knowledge base through guarded, provenance-aware operations. |
| [Google Workspace](mcp-servers/google-workspace/) | Connect Gmail, Calendar, Drive, Tasks, and related Workspace services through local OAuth credentials. |
| [Atlassian](mcp-servers/atlassian/) | Connect Jira and Confluence Server/Data Center with a read-only launcher configuration. |

MCP servers expose what can be done. Skills decide how and when to do it. Workspace instructions decide whether the action is appropriate.

### 5. Scheduled prompts add time

[`scheduled-prompts/`](scheduled-prompts/) turns one-off agent sessions into recurring operations.

A Windows heartbeat evaluates CRON schedules, launches isolated `codex exec` sessions, preserves missed occurrences in a backlog, rate-limits catch-up work, and writes results into a local agent inbox. Schedules must select an explicit model and cannot bypass the workspace's normal trust boundaries.

The repository publishes a disabled generic example. Real schedules, runtime state, results, and inbox records remain local.

### 6. The second brain preserves durable knowledge

The second brain is not stored in this repository. It remains a separate knowledge system accessed through a guarded MCP and a family of curation skills.

This separation matters:

- projects can remain messy, mutable, and task-specific;
- raw sources can remain immutable;
- durable synthesis can be curated instead of copied wholesale;
- permissions for reading, importing, updating, and archiving knowledge can be controlled independently.

## Why this works

The filesystem gives the agent durable state without hiding it in an opaque service. Markdown keeps instructions and project state readable by both humans and models. Git makes reusable infrastructure inspectable and reviewable. MCP gives the agent narrow interfaces to the outside world. Skills turn those interfaces into repeatable work. Scheduled prompts allow useful work to continue across time.

Together, these layers address several practical failure modes of everyday AI use:

- **Context is rebuilt repeatedly.** Project checkpoints make the current truth explicit.
- **Useful processes remain trapped in chat history.** Skills turn them into versioned procedures.
- **Tools are isolated.** MCP capabilities make cross-system workflows composable.
- **Automation becomes unsafe when authority is implicit.** Instructions define human approval boundaries.
- **Recurring work depends on memory.** Scheduled prompts create a durable cadence and inbox.
- **Knowledge and work products become mixed together.** Separate workspace and knowledge layers give each a different lifecycle.

This is not an agent persona or a single monolithic application. It is the harness around Codex that makes long-running, real-world work coherent.

## The open boundary: project memory vs. durable knowledge

There is still a deliberate unresolved tension between `outputs/` and the second brain.

A longitudinal project needs enough history to resume safely: decisions, results, failed approaches, current assumptions, and a meaningful log. But some of that information is also durable knowledge that could benefit other projects. If both layers retain everything, they compete and drift. If project folders retain too little, operational continuity disappears. If everything is promoted into the second brain, curation becomes noise.

Two directions are being explored:

1. bring second-brain retrieval or projections directly into project workspaces, so projects can use durable knowledge without duplicating it;
2. reduce the amount of long-term knowledge accumulated in `outputs/`, promoting only validated, cross-project conclusions while keeping operational evidence local.

The likely answer is a lifecycle rather than a single storage rule: active work belongs to the project, reusable conclusions are promoted deliberately, and the original evidence remains traceable without becoming the primary memory surface.

## Repository shape

```text
.
|-- AGENTS.md                    # Root operating contract
|-- CLAUDE.md                    # Compatibility pointer to AGENTS.md
|-- outputs/
|   `-- AGENTS.md                # Nested project-workspace conventions
|-- skills/                      # Reusable agent procedures
|-- mcp-servers/                 # Local capabilities and launchers
|-- scheduled-prompts/
|   |-- README.md
|   `-- example-weekly-review.json
`-- .gitignore                   # Strict public allowlist
```

Everything needed for private operation is created locally around this public skeleton.

## Getting started

### Prerequisites

- Windows with PowerShell 5.1 or newer;
- the [Codex CLI](https://developers.openai.com/codex/cli/);
- Git;
- Python 3.11 or newer for Python MCP servers;
- Node.js and npm for JavaScript MCP servers.

Clone the repository and enter it:

```powershell
git clone https://github.com/duboisg/ai-docs.git
Set-Location .\ai-docs
$env:AI_DOCS_WORKSPACE = (Get-Location).Path
```

### Install the skills

```powershell
.\skills\sync-to-codex.ps1
```

The sync script installs the bundled skills under the active user's Codex skill directory and refuses to overwrite divergent installed copies unless `-Force` is supplied.

Restart Codex after adding or changing skills.

### Choose and install capabilities

The MCP servers are modular. Install only the integrations you need:

- [Browser Agent setup](mcp-servers/browser-agent/README.md)
- [Second Brain setup](mcp-servers/second-brain/README.md)
- [Google Workspace setup](mcp-servers/google-workspace/README.md)
- [Atlassian setup](mcp-servers/atlassian/README.md)

Each integration keeps its dependencies local and loads credentials at runtime from Git-ignored configuration. Review every OAuth scope and capability before enabling it.

### Try scheduled work safely

The published example is disabled. Inspect it and test the heartbeat without launching Codex:

```powershell
.\skills\scheduled-prompt-management\scripts\heartbeat.ps1 -DryRun
```

To create a real schedule, copy the example to a new Git-ignored JSON file, customize it, and use the `scheduled-prompt-management` skill to validate it. Installing the Windows Scheduled Task is a separate, explicit step documented in that skill.

## Trust model

AI Docs is designed to act, so its boundaries are part of the architecture:

- credentials and authenticated browser state never belong in Git;
- external writes require the authority defined by the workspace instructions;
- authentication, financial actions, publication, messages, deletion, and sensitive personal actions require explicit human involvement;
- high-impact changes follow inventory, review, apply, and verification stages;
- knowledge mutations are independently permissioned and revision-checked;
- scheduled work inherits the same rules as interactive work.

The aim is not maximum autonomy. It is maximum useful continuity inside explicit trust boundaries.

## Current scope

This starter kit is intentionally modular and Windows-first. The included integrations have different authentication requirements and upstream dependencies. Some are custom MCP implementations; others are pinned or locally adapted launchers around maintained upstream projects.

Private project folders, personal prompts, credentials, account data, browser state, scheduled-agent results, and the second-brain vault are intentionally absent. Bring your own data, select the capabilities you trust, and evolve the instructions with the agent as your operating model becomes clearer.

## License

AI Docs is available under the [MIT License](LICENSE). You may use, modify, and redistribute it, including commercially, provided that the copyright and license notices are preserved. Third-party dependencies remain subject to their respective licenses.

## Inspiration

- Andrej Karpathy, [LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Codex documentation](https://developers.openai.com/codex/)
