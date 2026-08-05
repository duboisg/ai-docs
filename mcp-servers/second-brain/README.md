# Second Brain MCP

Guarded MCP access to a separate Markdown knowledge base.

The server uses the official MCP Python SDK and communicates over stdio. It exposes:

- `second_brain_info`
- `second_brain_list`
- `second_brain_read`
- `second_brain_search`
- `second_brain_append_log`
- `second_brain_snapshot`
- `second_brain_validate_page`
- `second_brain_write_page`
- `second_brain_apply_changes`
- `second_brain_import_raw`

## Safety model

- Raw source content is immutable. A successful ingest may move a pending source to `raw/processed/`.
- Wiki creates, wiki updates, raw imports, and raw archival are independently disabled by default.
- Existing wiki files require a matching expected SHA-256 before replacement.
- Replacements are atomic.
- Canonical curation history is recorded in `wiki/log.md`.
- Ingest transactions return compact final hashes for changed pages and the archived raw source.
- `second_brain_snapshot(include_pages=false)` returns graph revision and findings without page payloads.
- All paths are resolved and checked against the configured knowledge root.

The MCP server enforces filesystem and page-schema boundaries. Versioned `kb-*` skills remain responsible for ingest, query, lint, and synthesis workflows.

## Install

Python 3.11 or newer is required. From this directory:

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -e ".[dev]"
```

## Configure

Set the knowledge root before starting the server:

```powershell
$env:SECOND_BRAIN_ROOT = "C:\path\to\your\knowledge-vault"
$env:SECOND_BRAIN_ALLOW_WIKI_CREATES = "false"
$env:SECOND_BRAIN_ALLOW_WIKI_UPDATES = "false"
$env:SECOND_BRAIN_ALLOW_RAW_IMPORTS = "false"
$env:SECOND_BRAIN_ALLOW_RAW_ARCHIVES = "false"
.\.venv\Scripts\second-brain-mcp.exe
```

Keep every mutation tier disabled while validating a new MCP client. Enable only the minimum tier required by an active `kb-*` skill. `SECOND_BRAIN_WRITES_ENABLED` remains as a legacy all-wiki-writes switch and should stay false.

The executable and environment variables can be placed in any MCP client's stdio server configuration. Use `.env.example` as the configuration inventory; do not commit credentials or tokens.

### Register with Codex

After installation, register the read-only server with the locally installed Codex CLI:

```powershell
codex mcp add second-brain `
  --env SECOND_BRAIN_ROOT=C:\path\to\your\knowledge-vault `
  --env SECOND_BRAIN_WRITES_ENABLED=false `
  -- "$PWD\.venv\Scripts\second-brain-mcp.exe"
```

Confirm the saved configuration:

```powershell
codex mcp get second-brain --json
```

Restart Codex or open a new session after adding the server. When you intentionally enable writes, remove and re-add the entry with `SECOND_BRAIN_WRITES_ENABLED=true`.

## Test

```powershell
.\.venv\Scripts\python -m pytest
```

## Skills

The workflow layer is versioned under `skills/` and remains separate from this MCP server. From the repository root, install or refresh the bundled skills with:

```powershell
.\skills\sync-to-codex.ps1
```

The sync refuses to overwrite a divergent installed skill unless `-Force` is explicitly supplied. Restart Codex after changing MCP tools, environment flags, global instructions, or installed skills.
