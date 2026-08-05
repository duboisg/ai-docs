$ErrorActionPreference = "Stop"

$serverRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$runtimeRoot = Join-Path $serverRoot ".runtime"
$profileDir = Join-Path $runtimeRoot "profile"
$downloadsDir = Join-Path $runtimeRoot "downloads"
$sourceExtensionDir = Join-Path $serverRoot "extension"
$extensionManifest = Get-Content -LiteralPath (Join-Path $sourceExtensionDir "manifest.json") -Raw | ConvertFrom-Json
if (-not $extensionManifest.version) {
    throw "Could not read the browser-agent extension version."
}
$runtimeExtensionDir = Join-Path $runtimeRoot "extensions\$($extensionManifest.version)"
$bridgeConfigPath = Join-Path $runtimeExtensionDir "bridge-config.json"
$localConfigPath = Join-Path $serverRoot ".env.local"
$mutex = [System.Threading.Mutex]::new($false, "Local\AiDocsBrowserAgentWindowsRuntime")
$lockTaken = $false

try {
    $lockTaken = $mutex.WaitOne([TimeSpan]::FromSeconds(60))
    if (-not $lockTaken) {
        throw "Timed out waiting for the browser-agent Windows runtime lock."
    }

    if (Test-Path -LiteralPath $localConfigPath) {
        foreach ($line in Get-Content -LiteralPath $localConfigPath) {
            if ($line -match '^\s*([A-Z0-9_]+)=(.*)\s*$') {
                Set-Item -Path "Env:$($matches[1])" -Value $matches[2].Trim()
            }
        }
    }

    $bridgePort = if ($env:BROWSER_AGENT_BRIDGE_PORT) { $env:BROWSER_AGENT_BRIDGE_PORT } else { "32145" }
    $bridgeUrl = "ws://127.0.0.1:$bridgePort"
    $previousBridgeUrl = $null
    if (Test-Path -LiteralPath $bridgeConfigPath) {
        try {
            $previousBridgeUrl = (Get-Content -LiteralPath $bridgeConfigPath -Raw | ConvertFrom-Json).bridgeUrl
        } catch {
            $previousBridgeUrl = $null
        }
    }

    New-Item -ItemType Directory -Path $profileDir, $downloadsDir, $runtimeExtensionDir -Force | Out-Null
    Copy-Item -Path (Join-Path $sourceExtensionDir "*") -Destination $runtimeExtensionDir -Recurse -Force
    @{ bridgeUrl = $bridgeUrl } | ConvertTo-Json -Compress | Set-Content -LiteralPath $bridgeConfigPath -Encoding Ascii

    $preferencesPath = Join-Path $profileDir "Default\Preferences"
    if (-not (Test-Path -LiteralPath $preferencesPath)) {
        New-Item -ItemType Directory -Path (Split-Path -Parent $preferencesPath) -Force | Out-Null
        @{
            download = @{
                default_directory = $downloadsDir
                prompt_for_download = $false
            }
        } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $preferencesPath -Encoding Ascii
    }

    $profilePattern = $profileDir
    function Get-AgentBrowserProcesses {
        return @(Get-CimInstance Win32_Process | Where-Object {
            $_.CommandLine -and $_.CommandLine.Contains($profilePattern)
        })
    }
    function Stop-AgentBrowserProcesses([array]$Processes) {
        foreach ($process in $Processes) {
            Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
        }
        for ($attempt = 0; $attempt -lt 50; $attempt++) {
            $remaining = @(Get-AgentBrowserProcesses)
            if ($remaining.Count -eq 0) {
                return
            }
            Start-Sleep -Milliseconds 200
        }
        throw "Timed out stopping the existing browser-agent Chrome processes."
    }

    $browserProcesses = @(Get-AgentBrowserProcesses)

    if ($browserProcesses.Count -gt 0) {
        $browserProcessIds = @($browserProcesses | ForEach-Object { [int]$_.ProcessId })
        $bridgeConnections = @(Get-NetTCPConnection -State Established -ErrorAction SilentlyContinue | Where-Object {
            $_.RemotePort -eq [int]$bridgePort -and
            $_.RemoteAddress -in @("127.0.0.1", "::1") -and
            $_.OwningProcess -in $browserProcessIds
        })
        if ($bridgeConnections.Count -eq 0) {
            Stop-AgentBrowserProcesses $browserProcesses
            $browserProcesses = @()
        }
    }

    if ($previousBridgeUrl -and $previousBridgeUrl -ne $bridgeUrl) {
        if ($browserProcesses.Count -gt 0) {
            Stop-AgentBrowserProcesses $browserProcesses
        }
        $browserProcesses = @()
    }

    if ($browserProcesses.Count -eq 0) {
        $browserPath = (& (Join-Path $PSScriptRoot "setup-windows.ps1") -PrintBrowserPath | Select-Object -Last 1)
        if (-not $browserPath -or -not (Test-Path -LiteralPath $browserPath)) {
            throw "Chrome for Testing setup did not return a valid browser path."
        }

        $browserArguments = @(
            "--no-first-run"
            "--no-default-browser-check"
            "--disable-popup-blocking"
            "--user-data-dir=`"$profileDir`""
            "--window-size=1600,900"
            "--new-window"
            "--load-extension=`"$runtimeExtensionDir`""
            "--disable-extensions-except=`"$runtimeExtensionDir`""
        )
        $browserProcess = Start-Process -FilePath $browserPath -ArgumentList $browserArguments -PassThru
        $runningProcesses = @()
        for ($attempt = 0; $attempt -lt 50; $attempt++) {
            $runningProcesses = @(Get-AgentBrowserProcesses)
            if ($runningProcesses.Count -gt 0) {
                break
            }
            Start-Sleep -Milliseconds 200
        }
        if ($runningProcesses.Count -eq 0) {
            $exitDescription = if ($browserProcess.HasExited) { " with code $($browserProcess.ExitCode)" } else { "" }
            throw "Chrome for Testing failed to start$exitDescription."
        }
    }
} finally {
    if ($lockTaken) {
        $mutex.ReleaseMutex()
    }
    $mutex.Dispose()
}
