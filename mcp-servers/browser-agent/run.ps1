$ErrorActionPreference = "Stop"

$serverRoot = $PSScriptRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js is not available on PATH."
}
if (-not (Test-Path -LiteralPath (Join-Path $serverRoot "package.json"))) {
    throw "Missing browser-agent package.json in $serverRoot."
}
if (-not (Test-Path -LiteralPath (Join-Path $serverRoot "node_modules"))) {
    throw "Browser agent dependencies are not installed. Run `npm install` in $serverRoot."
}

$serverScript = (Join-Path $serverRoot "src\server.js")

# A Codex process can be terminated without taking its stdio MCP children with it.
# Clean up only browser-agent servers whose wrapper is no longer attached to a
# live host. Active instances owned by another live Codex process are preserved.
try {
    $serverPattern = $serverScript
    $orphanCandidates = @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object {
        $_.CommandLine -and $_.CommandLine.Contains($serverPattern)
    })

    foreach ($candidate in $orphanCandidates) {
        $wrapper = Get-CimInstance Win32_Process -Filter "ProcessId = $($candidate.ParentProcessId)" -ErrorAction SilentlyContinue
        $hostProcess = if ($wrapper) {
            Get-CimInstance Win32_Process -Filter "ProcessId = $($wrapper.ParentProcessId)" -ErrorAction SilentlyContinue
        } else {
            $null
        }

        if (-not $hostProcess) {
            Stop-Process -Id $candidate.ProcessId -Force -ErrorAction SilentlyContinue
            if ($wrapper -and $wrapper.ProcessId -ne $PID) {
                Stop-Process -Id $wrapper.ProcessId -Force -ErrorAction SilentlyContinue
            }
        }
    }
} catch {
    # Cleanup is best-effort; failure to inspect processes must not prevent MCP startup.
}

& node $serverScript
exit $LASTEXITCODE
