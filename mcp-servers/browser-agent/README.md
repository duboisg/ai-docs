# Browser Agent

Isolated Chrome for Testing control for an AI Docs workspace. The browser runs directly in the interactive Windows session and exposes its live tabs through an MCP server.

This capability is intentionally not Playwright-, WebDriver-, or CDP-based and does not rely on screenshot/vision analysis for routine page understanding.

## Design

- Chrome for Testing runs on Windows with a dedicated profile and downloads folder under `.runtime/`.
- A Chrome extension bridges the live browser session to the MCP server over a loopback WebSocket.
- The MCP server uses explicit `tab_id` values so multiple agents do not depend on a shared "current tab".
- Page understanding comes from compact DOM and accessibility-derived snapshots, not vision.
- The MCP tool surface is independent from the browser launcher.

## Tools

The server exposes the same tab-scoped operations as before the Windows migration:

- `browser_list_tabs`
- `browser_open_tab`
- `browser_focus_tab`
- `browser_snapshot_tab`
- `browser_click`
- `browser_type`
- `browser_scroll`
- `browser_wait`
- `browser_close_tab`

Snapshot results include tab metadata, the page title and URL, visible text, headings, and a compact actionable-element list with geometry.

## Install

From this folder:

```powershell
npm install
.\scripts\setup-windows.ps1
```

`setup-windows.ps1` downloads the latest Stable `win64` Chrome for Testing build from Google's official release API and storage origin, validates the archive length and Google Storage MD5 when supplied, records local SHA-256 hashes, and stores it under the Git-ignored `.runtime\chrome-for-testing\` directory. Chrome for Testing binaries are not Authenticode-signed, so executable-signature validation is not used.

Chrome for Testing does not auto-update itself. The launcher checks the official Stable channel at most once every 12 hours and installs a newer build when available. If the release API is temporarily unavailable, it falls back to the last verified local build.

Force an update check with:

```powershell
.\scripts\setup-windows.ps1 -ForceUpdate
```

## Browser profile and visibility

The browser starts automatically on the first MCP browser call. It uses:

- Profile: `.runtime\profile`
- Downloads: `.runtime\downloads`
- Runtime extension copies: `.runtime\extensions\<version>`
- Bridge: a dynamic `ws://127.0.0.1:<port>` endpoint

The Chrome for Testing window is visible directly in the workspace owner's Windows session. The previous Xvfb/x11vnc/noVNC desktop is no longer part of the runtime.

Website authentication persists in the isolated profile. This profile is distinct from the regular Google Chrome profile, so existing cookies are not reused and initial sign-in must be performed in the Chrome for Testing window.

Machine-specific settings may be placed in the Git-ignored `.env.local` file. To use a different compatible Windows browser binary:

```text
BROWSER_AGENT_WINDOWS_BROWSER_BIN=C:\path\to\chrome.exe
```

The legacy `BROWSER_AGENT_BROWSER_BIN` Linux setting is ignored by the Windows launcher.

## Run the MCP server

```powershell
.\run.ps1
```

At startup, `run.ps1` removes only orphaned browser-agent server processes whose parent host no longer exists. This prevents a previous Codex session from leaving a stale MCP instance that competes for the authenticated browser profile. Instances still owned by a live host are preserved.

Register with Codex if needed:

```powershell
$repoRoot = (Resolve-Path ..\..).Path
codex mcp add browser-agent -- powershell -NoProfile -ExecutionPolicy Bypass -File "$repoRoot\mcp-servers\browser-agent\run.ps1"
```

## Smoke test

```powershell
.\scripts\smoke-test.ps1
npm run smoke:mcp
```

The browser smoke test opens `example.com` in the live Chrome for Testing session, follows its documentation link, and prints compact summaries for both pages. The MCP smoke test starts the real stdio server, asserts the exact tool surface, and calls `browser_list_tabs`.

## Runtime control

```powershell
.\scripts\start-windows.ps1
.\scripts\stop-windows.ps1
```

`stop-windows.ps1` only stops Chrome processes using the browser-agent's dedicated profile.

## Notes

- Do not use Playwright, WebDriver, or CDP to launch or control this browser.
- Do not rely on screenshot/vision as the default reasoning path.
- Do not point the agent at the everyday Chrome profile.
- Chrome for Testing is not auto-updating; keep the scheduled launcher update check enabled.
