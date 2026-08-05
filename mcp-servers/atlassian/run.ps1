$ErrorActionPreference = "Stop"

$workspaceRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$envPath = Join-Path $workspaceRoot ".env"
$server = Join-Path $PSScriptRoot ".venv\Scripts\mcp-atlassian.exe"

if (-not (Test-Path -LiteralPath $envPath)) {
    throw "Missing workspace .env file: $envPath"
}
if (-not (Test-Path -LiteralPath $server)) {
    throw "MCP Atlassian is not installed. See README.md."
}

$settings = @{}
foreach ($line in Get-Content -LiteralPath $envPath) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
        $settings[$matches[1]] = $matches[2].Trim().Trim('"').Trim("'")
    }
}

$required = @(
    "JIRA_URL",
    "JIRA_USERNAME",
    "JIRA_PASSWORD",
    "CONFLUENCE_BASE_URL",
    "CONFLUENCE_USERNAME",
    "CONFLUENCE_PASSWORD"
)
foreach ($key in $required) {
    if (-not $settings[$key]) {
        throw "Missing required key in .env: $key"
    }
}

$env:JIRA_URL = $settings["JIRA_URL"]
$env:JIRA_USERNAME = $settings["JIRA_USERNAME"]
$env:JIRA_API_TOKEN = $settings["JIRA_PASSWORD"]
$env:CONFLUENCE_URL = $settings["CONFLUENCE_BASE_URL"]
$env:CONFLUENCE_USERNAME = $settings["CONFLUENCE_USERNAME"]
$env:CONFLUENCE_API_TOKEN = $settings["CONFLUENCE_PASSWORD"]
$env:READ_ONLY_MODE = "true"
$env:TOOLSETS = "default"
$env:MCP_ATLASSIAN_USE_SYSTEM_TRUSTSTORE = "true"

& $server
exit $LASTEXITCODE
