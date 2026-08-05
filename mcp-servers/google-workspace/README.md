# Google Workspace MCP

Pinned local installation of [`@aaronsb/google-workspace-mcp`](https://github.com/aaronsb/google-workspace-mcp), built on Google's Workspace CLI.

`run.ps1` loads the existing Desktop OAuth client from `secrets/google_workspace/oauth_client.json`. The client secret is never copied into Codex configuration or command-line arguments. Account tokens are isolated under `secrets/google_workspace_mcp/` through XDG configuration variables.

The launcher leaves `GWS_SAFETY_POLICY` unset so Google Workspace write operations can run when the user explicitly asks for them. The upstream server treats an unset safety policy as "No safety policies active — all operations are allowed." Codex-side trust boundaries still apply: high-impact operations, sending messages, sharing files, deleting data, and other sensitive actions require explicit user authorization at action time.

## Install

```powershell
npm install
```

## Register with Codex

```powershell
$repoRoot = (Resolve-Path ..\..).Path
codex mcp add google-workspace -- powershell -NoProfile -ExecutionPolicy Bypass -File "$repoRoot\mcp-servers\google-workspace\run.ps1"
```

## Authentication

Call `manage_accounts` with operation `authenticate`. This opens Google's OAuth flow and stores a separate account token under `secrets/google_workspace_mcp/`.

The package groups read and write operations into the same MCP tools. OAuth may request broad service scopes, so review Google's consent screen carefully; the account token is dedicated to this MCP installation.

## Local Tasks extension

`run.ps1` reapplies the local Tasks extension before starting the server. It fixes task creation so `title`, `notes`, `due` and `parent` are transmitted correctly, fixes scratchpad `task_create` notes, and adds `manage_tasks` operation `batchCreate` for hierarchical parent/child imports. The patch is reapplied after dependency installation so it is not lost when `node_modules` is rebuilt.
