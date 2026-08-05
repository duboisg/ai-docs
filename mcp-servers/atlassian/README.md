# Atlassian MCP

Read-only Codex integration for Jira and Confluence Server/Data Center using the maintained [`mcp-atlassian`](https://github.com/sooperset/mcp-atlassian) package.

The package is installed into `.venv`. `run.ps1` loads the existing workspace `.env` at runtime and maps its variables to the names expected by `mcp-atlassian`. Credentials are not copied into Codex configuration.

Safety settings enforced by the launcher:

- `READ_ONLY_MODE=true`
- `TOOLSETS=default`
- OS trust store enabled for corporate certificates

## Install

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install "mcp-atlassian==0.21.1"
```

## Register with Codex

```powershell
$repoRoot = (Resolve-Path ..\..).Path
codex mcp add atlassian-dc -- powershell -NoProfile -ExecutionPolicy Bypass -File "$repoRoot\mcp-servers\atlassian\run.ps1"
```

The `atlassian-dc` name distinguishes this corporate Data Center connection from Atlassian's cloud-only Rovo MCP service.
