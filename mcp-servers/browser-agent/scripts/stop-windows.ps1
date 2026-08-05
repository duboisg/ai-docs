$ErrorActionPreference = "Stop"

$serverRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$profileDir = Join-Path $serverRoot ".runtime\profile"
$profilePattern = $profileDir
$browserProcesses = @(Get-CimInstance Win32_Process | Where-Object {
    $_.CommandLine -and $_.CommandLine.Contains($profilePattern)
})

foreach ($process in $browserProcesses) {
    Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
}

Write-Host "Stopped $($browserProcesses.Count) browser-agent Windows process(es)."
