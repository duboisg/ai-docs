param(
    [string]$InboxPath = (Join-Path $(if ($env:AI_DOCS_WORKSPACE) { $env:AI_DOCS_WORKSPACE } else { (Get-Location).Path }) 'agent-inbox\pending')
)

if (-not (Test-Path -LiteralPath $InboxPath)) {
    Write-Output 'No pending inbox directory exists.'
    exit 0
}

$items = Get-ChildItem -LiteralPath $InboxPath -Filter '*.md' -File | Sort-Object LastWriteTime -Descending
if ($items.Count -eq 0) {
    Write-Output 'No pending agent inbox items.'
    exit 0
}

$items | ForEach-Object {
    [pscustomobject]@{
        File = $_.Name
        Updated = $_.LastWriteTime
        ActionRequired = (Select-String -LiteralPath $_.FullName -Pattern 'ACTION_REQUIRED' -Quiet)
    }
} | Format-Table -AutoSize
