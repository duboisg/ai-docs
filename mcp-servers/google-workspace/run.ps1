$ErrorActionPreference = "Stop"

$workspaceRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$oauthPath = Join-Path $workspaceRoot "secrets\google_workspace\oauth_client.json"
$runtime = Join-Path $PSScriptRoot "node_modules\.bin\google-workspace-mcp.cmd"
$localPatchScript = Join-Path $PSScriptRoot "scripts\apply-local-patches.mjs"
$gwsBinary = Join-Path $PSScriptRoot "node_modules\@googleworkspace\cli\bin\gws.exe"
$credentialRoot = Join-Path $workspaceRoot "secrets\google_workspace_mcp"

if (-not (Test-Path -LiteralPath $oauthPath)) {
    throw "Missing Google OAuth client file: $oauthPath"
}
if (-not (Test-Path -LiteralPath $runtime)) {
    throw "Google Workspace MCP is not installed. See README.md."
}
if (-not (Test-Path -LiteralPath $localPatchScript)) {
    throw "Local MCP patch script was not found: $localPatchScript"
}
if (-not (Test-Path -LiteralPath $gwsBinary)) {
    throw "Bundled Google Workspace CLI was not found: $gwsBinary"
}

$oauthDocument = Get-Content -Raw -LiteralPath $oauthPath | ConvertFrom-Json
$oauth = if ($oauthDocument.installed) { $oauthDocument.installed } elseif ($oauthDocument.web) { $oauthDocument.web } else { $null }
if (-not $oauth.client_id -or -not $oauth.client_secret) {
    throw "OAuth client JSON does not contain client_id and client_secret."
}

New-Item -ItemType Directory -Path $credentialRoot -Force | Out-Null
$env:GOOGLE_CLIENT_ID = $oauth.client_id
$env:GOOGLE_CLIENT_SECRET = $oauth.client_secret
$env:XDG_CONFIG_HOME = Join-Path $credentialRoot "config"
$env:XDG_DATA_HOME = Join-Path $credentialRoot "data"
Remove-Item Env:\GWS_SAFETY_POLICY -ErrorAction SilentlyContinue
$env:GWS_BINARY_PATH = $gwsBinary

& node $localPatchScript
if ($LASTEXITCODE -ne 0) {
    throw "Failed to apply local Google Workspace MCP patches."
}

& $runtime
exit $LASTEXITCODE
