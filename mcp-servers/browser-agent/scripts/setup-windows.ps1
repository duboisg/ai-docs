param(
    [switch]$ForceUpdate,
    [switch]$PrintBrowserPath
)

$ErrorActionPreference = "Stop"

$serverRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$runtimeRoot = Join-Path $serverRoot ".runtime"
$cftRoot = Join-Path $runtimeRoot "chrome-for-testing"
$currentVersionFile = Join-Path $cftRoot "current.txt"
$lastCheckFile = Join-Path $cftRoot "last-check.txt"
$apiUrl = "https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json"

function Resolve-InstalledBrowser {
    if (-not (Test-Path -LiteralPath $currentVersionFile)) {
        return $null
    }

    $version = (Get-Content -LiteralPath $currentVersionFile -Raw).Trim()
    if (-not $version) {
        return $null
    }

    $path = Join-Path $cftRoot "$version\chrome-win64\chrome.exe"
    if (Test-Path -LiteralPath $path) {
        return (Resolve-Path -LiteralPath $path).Path
    }
    return $null
}

function Write-BrowserPath([string]$Path) {
    if ($PrintBrowserPath) {
        Write-Output $Path
    } else {
        Write-Host "Chrome for Testing ready: $Path"
    }
}

if ($env:BROWSER_AGENT_WINDOWS_BROWSER_BIN) {
    if (-not (Test-Path -LiteralPath $env:BROWSER_AGENT_WINDOWS_BROWSER_BIN)) {
        throw "Configured Windows browser does not exist: $env:BROWSER_AGENT_WINDOWS_BROWSER_BIN"
    }
    Write-BrowserPath (Resolve-Path -LiteralPath $env:BROWSER_AGENT_WINDOWS_BROWSER_BIN).Path
    exit 0
}

New-Item -ItemType Directory -Path $cftRoot -Force | Out-Null

$installedBrowser = Resolve-InstalledBrowser
$recentCheck = $false
if (-not $ForceUpdate -and $installedBrowser -and (Test-Path -LiteralPath $lastCheckFile)) {
    $lastCheck = (Get-Item -LiteralPath $lastCheckFile).LastWriteTimeUtc
    $recentCheck = (([DateTime]::UtcNow - $lastCheck).TotalHours -lt 12)
}

if ($recentCheck) {
    Write-BrowserPath $installedBrowser
    exit 0
}

try {
    $releaseData = Invoke-RestMethod -Uri $apiUrl -UseBasicParsing
    $stable = $releaseData.channels.Stable
    $download = $stable.downloads.chrome | Where-Object { $_.platform -eq "win64" } | Select-Object -First 1
    if (-not $stable.version -or -not $download.url) {
        throw "The Chrome for Testing API did not return a Stable win64 browser."
    }
    $downloadUri = [Uri]$download.url
    if ($downloadUri.Scheme -ne "https" -or $downloadUri.Host -ne "storage.googleapis.com" -or
        -not $downloadUri.AbsolutePath.StartsWith("/chrome-for-testing-public/")) {
        throw "The Chrome for Testing API returned an unexpected download origin: $($download.url)"
    }
} catch {
    if ($installedBrowser) {
        Write-Warning "Chrome for Testing update check failed; using installed browser. $($_.Exception.Message)"
        Write-BrowserPath $installedBrowser
        exit 0
    }
    throw
}

$version = [string]$stable.version
$versionRoot = Join-Path $cftRoot $version
$browserPath = Join-Path $versionRoot "chrome-win64\chrome.exe"

if (-not (Test-Path -LiteralPath $browserPath)) {
    $downloadRoot = Join-Path $runtimeRoot "downloads"
    $zipPath = Join-Path $downloadRoot "chrome-for-testing-$version-win64.zip"
    New-Item -ItemType Directory -Path $downloadRoot -Force | Out-Null
    New-Item -ItemType Directory -Path $versionRoot -Force | Out-Null

    Write-Host "Downloading Chrome for Testing $version..."
    if (Get-Command curl.exe -ErrorAction SilentlyContinue) {
        & curl.exe --fail --location --retry 3 --continue-at - --output $zipPath $download.url
        if ($LASTEXITCODE -ne 0) {
            throw "curl.exe failed to download Chrome for Testing (exit code $LASTEXITCODE)."
        }
    } else {
        Invoke-WebRequest -Uri $download.url -OutFile $zipPath -UseBasicParsing
    }

    $headers = (Invoke-WebRequest -Uri $download.url -Method Head -UseBasicParsing).Headers
    $expectedLength = [long]$headers["Content-Length"]
    $actualLength = (Get-Item -LiteralPath $zipPath).Length
    if ($expectedLength -gt 0 -and $actualLength -ne $expectedLength) {
        throw "Chrome for Testing archive length mismatch: expected $expectedLength, got $actualLength."
    }

    $googleHash = [string]$headers["x-goog-hash"]
    if ($googleHash -match '(?:^|,)md5=([^,]+)') {
        $expectedMd5Base64 = $matches[1]
        $md5Hex = (Get-FileHash -LiteralPath $zipPath -Algorithm MD5).Hash
        [byte[]]$md5Bytes = for ($i = 0; $i -lt $md5Hex.Length; $i += 2) {
            [Convert]::ToByte($md5Hex.Substring($i, 2), 16)
        }
        $actualMd5Base64 = [Convert]::ToBase64String($md5Bytes)
        if ($actualMd5Base64 -ne $expectedMd5Base64) {
            throw "Chrome for Testing archive hash mismatch."
        }
    }

    (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash |
        Set-Content -LiteralPath (Join-Path $versionRoot "archive.sha256") -Encoding Ascii
    Expand-Archive -LiteralPath $zipPath -DestinationPath $versionRoot -Force
    Remove-Item -LiteralPath $zipPath -Force
}

if (-not (Test-Path -LiteralPath $browserPath)) {
    throw "Chrome for Testing extraction did not produce $browserPath"
}

(Get-FileHash -LiteralPath $browserPath -Algorithm SHA256).Hash |
    Set-Content -LiteralPath (Join-Path $versionRoot "chrome.exe.sha256") -Encoding Ascii

Set-Content -LiteralPath $currentVersionFile -Value $version -Encoding Ascii
Set-Content -LiteralPath $lastCheckFile -Value ([DateTime]::UtcNow.ToString("O")) -Encoding Ascii
Write-BrowserPath (Resolve-Path -LiteralPath $browserPath).Path
