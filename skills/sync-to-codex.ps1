param(
    [string]$SourceRoot = $PSScriptRoot,
    [string]$DestinationRoot = (Join-Path $HOME ".codex\skills"),
    [switch]$Force
)

$ErrorActionPreference = "Stop"
$names = @("kb-query", "kb-lint", "kb-ingest", "kb-save-synthesis", "kb-add-raw", "scheduled-prompt-management", "agent-inbox-processing")
New-Item -ItemType Directory -Force -Path $DestinationRoot | Out-Null

foreach ($name in $names) {
    $source = (Resolve-Path (Join-Path $SourceRoot $name)).Path
    $destination = Join-Path $DestinationRoot $name
    if (Test-Path $destination) {
        $sourceFiles = Get-ChildItem $source -Recurse -File
        $different = $false
        foreach ($file in $sourceFiles) {
            $relative = $file.FullName.Substring($source.Length).TrimStart('\')
            $target = Join-Path $destination $relative
            if (-not (Test-Path $target) -or
                (Get-FileHash $file.FullName).Hash -ne (Get-FileHash $target).Hash) {
                $different = $true
                break
            }
        }
        if ($different -and -not $Force) {
            throw "Destination skill '$name' differs. Review it or rerun with -Force."
        }
    }
    Copy-Item -Path $source -Destination $DestinationRoot -Recurse -Force
    Write-Output "Synced $name"
}
