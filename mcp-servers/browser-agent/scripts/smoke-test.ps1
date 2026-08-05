$ErrorActionPreference = "Stop"

$serverRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$workspaceRoot = (Resolve-Path (Join-Path $serverRoot "..\..")).Path
$outDir = Join-Path $workspaceRoot "outputs\browser-agent-smoke"

New-Item -ItemType Directory -Path $outDir -Force | Out-Null

$env:BROWSER_AGENT_BRIDGE_PORT = "32145"
$env:BROWSER_AGENT_BRIDGE_HOST = "127.0.0.1"

& (Join-Path $serverRoot "scripts\start-windows.ps1")

node (Join-Path $serverRoot "scripts\smoke-test.js")
exit $LASTEXITCODE
