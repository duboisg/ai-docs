[CmdletBinding()]
param(
    [string]$TaskName = 'AI Docs Scheduled Prompt Heartbeat',
    [string]$WorkspacePath = $(if ($env:AI_DOCS_WORKSPACE) { $env:AI_DOCS_WORKSPACE } else { (Get-Location).Path }),
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
$scriptPath = Join-Path $WorkspacePath 'skills\scheduled-prompt-management\scripts\heartbeat.ps1'
if (-not (Test-Path -LiteralPath $scriptPath)) { throw "Heartbeat script not found: $scriptPath" }

$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($null -ne $existing -and -not $Force) {
    throw "Task '$TaskName' already exists. Re-run with -Force to replace it."
}

$taskCommand = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`" -WorkspacePath `"$WorkspacePath`""
schtasks.exe /Create /TN $TaskName /TR $taskCommand /SC MINUTE /MO 30 /RL LIMITED /IT /F | Out-Host
if ($LASTEXITCODE -ne 0) { throw "Failed to create scheduled task '$TaskName'." }
Write-Output "Installed '$TaskName'. It runs every 30 minutes only while this Windows user is logged on."
