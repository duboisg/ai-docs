[CmdletBinding()]
param(
    [string]$WorkspacePath = $(if ($env:AI_DOCS_WORKSPACE) { $env:AI_DOCS_WORKSPACE } else { (Get-Location).Path }),
    [switch]$DryRun,
    [ValidateRange(1, 100)]
    [int]$MaxRunsPerHeartbeat = 3,
    [datetime]$NowUtc = [datetime]::UtcNow
)

$ErrorActionPreference = 'Stop'
$PromptRoot = Join-Path $WorkspacePath 'scheduled-prompts'
$StateRoot = Join-Path $PromptRoot 'state'
$InboxRoot = Join-Path $WorkspacePath 'agent-inbox'
$PendingRoot = Join-Path $InboxRoot 'pending'
$FailedRoot = Join-Path $InboxRoot 'failed'
$LogRoot = Join-Path $InboxRoot 'logs'
$StatePath = Join-Path $StateRoot 'heartbeat-state.json'

function Resolve-TimeZone {
    param([string]$Name)
    $aliases = @{ 'America/Toronto' = 'Eastern Standard Time' }
    $resolved = if ($aliases.ContainsKey($Name)) { $aliases[$Name] } else { $Name }
    return [System.TimeZoneInfo]::FindSystemTimeZoneById($resolved)
}

function Test-CronField {
    param([string]$Expression, [int]$Value, [int]$Minimum, [int]$Maximum)
    foreach ($token in $Expression.Split(',')) {
        $base = $token.Trim()
        $step = 1
        if ($base -match '^(.*)/(\d+)$') {
            $base = $Matches[1]
            $step = [int]$Matches[2]
            if ($step -le 0) { throw "Invalid CRON step '$token'." }
        }
        if ($base -eq '*') { $start = $Minimum; $end = $Maximum }
        elseif ($base -match '^(\d+)-(\d+)$') { $start = [int]$Matches[1]; $end = [int]$Matches[2] }
        elseif ($base -match '^\d+$') { $start = [int]$base; $end = $start }
        else { throw "Unsupported CRON token '$token'." }
        if ($start -lt $Minimum -or $end -gt $Maximum -or $start -gt $end) { throw "CRON token '$token' is out of range." }
        if ($Value -ge $start -and $Value -le $end -and (($Value - $start) % $step -eq 0)) { return $true }
    }
    return $false
}

function Test-CronMatch {
    param([string]$Cron, [datetime]$LocalTime)
    $parts = $Cron.Trim() -split '\s+'
    if ($parts.Count -ne 5) { throw "CRON '$Cron' must have five fields." }
    $dayOfWeek = [int]$LocalTime.DayOfWeek
    $dayOfWeekMatch = (Test-CronField $parts[4] $dayOfWeek 0 6) -or (($dayOfWeek -eq 0) -and (Test-CronField $parts[4] 7 0 7))
    return (Test-CronField $parts[0] $LocalTime.Minute 0 59) -and
        (Test-CronField $parts[1] $LocalTime.Hour 0 23) -and
        (Test-CronField $parts[2] $LocalTime.Day 1 31) -and
        (Test-CronField $parts[3] $LocalTime.Month 1 12) -and
        $dayOfWeekMatch
}

function Get-ConfigHash {
    param([string]$Path)
    return (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant()
}

function Get-State {
    if (-not (Test-Path -LiteralPath $StatePath)) {
        return [pscustomobject]@{ lastHeartbeatUtc = $null; claims = @{}; backlog = @() }
    }
    $state = Get-Content -Raw -LiteralPath $StatePath | ConvertFrom-Json
    $claims = @{}
    if ($state.claims) { $state.claims.psobject.Properties | ForEach-Object { $claims[$_.Name] = $_.Value } }
    return [pscustomobject]@{
        lastHeartbeatUtc = $state.lastHeartbeatUtc
        claims = $claims
        backlog = if ($state.backlog) { @($state.backlog) } else { @() }
    }
}

function Save-State {
    param($State)
    [pscustomobject]@{
        lastHeartbeatUtc = $State.lastHeartbeatUtc
        claims = $State.claims
        backlog = @($State.backlog)
    } | ConvertTo-Json -Depth 6 | Set-Content -Encoding UTF8 -LiteralPath $StatePath
}

function Get-DueSlots {
    param($Config, [datetime]$StartUtc, [datetime]$EndUtc)
    $timezone = Resolve-TimeZone $Config.timezone
    $cursor = $StartUtc.AddMinutes(1)
    $slots = @()
    while ($cursor -le $EndUtc) {
        $local = [System.TimeZoneInfo]::ConvertTimeFromUtc($cursor, $timezone)
        if (Test-CronMatch $Config.cron $local) { $slots += $cursor }
        $cursor = $cursor.AddMinutes(1)
    }
    return $slots
}

function Get-OccurrenceKey {
    param([string]$PromptId, [datetime]$SlotUtc)
    return "{0}|{1}" -f $PromptId, $SlotUtc.ToString('o')
}

function Test-OccurrenceKnown {
    param($State, [string]$OccurrenceKey)
    if ($State.claims.ContainsKey($OccurrenceKey)) { return $true }
    if ($State.backlog | Where-Object { $_.occurrenceKey -eq $OccurrenceKey }) { return $true }
    # Compatibility with the first heartbeat format, whose claim key also carried a config hash.
    return [bool]($State.claims.Keys | Where-Object { $_ -like "$OccurrenceKey|*" })
}

function Write-InboxRecord {
    param($Config, [datetime]$SlotUtc, [string]$Status, [string]$Result, [string]$RunId)
    $targetRoot = if ($Status -eq 'failed') { $FailedRoot } else { $PendingRoot }
    $path = Join-Path $targetRoot ("{0}-{1}.md" -f $SlotUtc.ToString('yyyyMMddTHHmmssZ'), $Config.id)
    $body = @"
---
id: $RunId
prompt_id: $($Config.id)
prompt_name: $($Config.name)
scheduled_at_utc: $($SlotUtc.ToString('o'))
status: $Status
---

$Result
"@
    Set-Content -Encoding UTF8 -LiteralPath $path -Value $body
    return $path
}

foreach ($directory in @($PromptRoot, $StateRoot, $InboxRoot, $PendingRoot, $FailedRoot, $LogRoot)) {
    New-Item -ItemType Directory -Force -Path $directory | Out-Null
}

if (-not [Environment]::UserInteractive) {
    Write-Output 'Skipped: no interactive Windows user session.'
    exit 0
}

$NowUtc = $NowUtc.ToUniversalTime().AddSeconds(-$NowUtc.Second).AddMilliseconds(-$NowUtc.Millisecond)
$state = Get-State
$startUtc = if ($state.lastHeartbeatUtc) { ([datetime]$state.lastHeartbeatUtc).ToUniversalTime() } else { $NowUtc.AddMinutes(-30) }

$configs = Get-ChildItem -LiteralPath $PromptRoot -Filter '*.json' -File | Where-Object { $_.DirectoryName -notmatch '\\state$' }
$configById = @{}
$newOccurrences = @()
foreach ($file in $configs) {
    try {
        $config = Get-Content -Raw -LiteralPath $file.FullName | ConvertFrom-Json
        foreach ($field in @('id', 'name', 'enabled', 'cron', 'timezone', 'model', 'prompt')) {
            if ($null -eq $config.$field -or [string]::IsNullOrWhiteSpace([string]$config.$field)) { throw "Missing required field '$field'." }
        }
        if (-not [bool]$config.enabled) { continue }
        $configById[$config.id] = $config
        foreach ($slot in (Get-DueSlots $config $startUtc $NowUtc)) {
            $occurrenceKey = Get-OccurrenceKey $config.id $slot
            if (Test-OccurrenceKnown $state $occurrenceKey) { continue }
            $newOccurrences += [pscustomobject]@{
                occurrenceKey = $occurrenceKey
                promptId = $config.id
                slotUtc = $slot.ToString('o')
                configHash = Get-ConfigHash $file.FullName
                attempts = 0
            }
        }
    }
    catch {
        $failure = "CONFIGURATION_ERROR`n`n$($_.Exception.Message)"
        Write-InboxRecord ([pscustomobject]@{ id = $file.BaseName; name = $file.BaseName }) $NowUtc 'failed' $failure ([guid]::NewGuid().ToString()) | Out-Null
    }
}

$state.backlog = @($state.backlog) + @($newOccurrences)
$runnable = @($state.backlog | Where-Object { $configById.ContainsKey($_.promptId) } |
    Sort-Object @{ Expression = { [datetime]$_.slotUtc } }, promptId |
    Select-Object -First $MaxRunsPerHeartbeat)

if ($DryRun) {
    if ($runnable.Count -eq 0) { Write-Output 'No scheduled prompts due or queued for catch-up.' }
    else {
        $runnable | ForEach-Object {
            $kind = if ($newOccurrences.occurrenceKey -contains $_.occurrenceKey) { 'due' } else { 'catch-up' }
            Write-Output ("Would launch {0} for {1} ({2})" -f $_.promptId, $_.slotUtc, $kind)
        }
    }
    exit 0
}

# Persist discovery before launching anything: an interruption cannot make a missed occurrence disappear.
$state.lastHeartbeatUtc = $NowUtc.ToString('o')
Save-State $state
if ($runnable.Count -eq 0) { Write-Output 'No scheduled prompts due or queued for catch-up.'; exit 0 }

$codex = Get-Command 'codex.cmd' -ErrorAction Stop
foreach ($item in $runnable) {
    $config = $configById[$item.promptId]
    $slot = ([datetime]$item.slotUtc).ToUniversalTime()
    $item.attempts = [int]$item.attempts + 1
    Save-State $state
    $runId = [guid]::NewGuid().ToString()
    $runRoot = Join-Path $InboxRoot (Join-Path 'runs' $runId)
    New-Item -ItemType Directory -Force -Path $runRoot | Out-Null
    $promptPath = Join-Path $runRoot 'prompt.txt'
    $resultPath = Join-Path $runRoot 'result.md'
    $scheduledPrompt = @"
You are executing a scheduled prompt in the AI Docs workspace.
Prompt id: $($config.id)
Scheduled time (UTC): $($slot.ToString('o'))

$($config.prompt)

Return a concise Markdown result suitable for the workspace owner's agent inbox. If an action needs the workspace owner's explicit authority, do not perform it; begin the relevant section with ACTION_REQUIRED and state the exact decision or authorization needed.
"@
    Set-Content -Encoding UTF8 -LiteralPath $promptPath -Value $scheduledPrompt
    try {
        Get-Content -Raw -LiteralPath $promptPath | & $codex.Source exec --model $config.model -C $WorkspacePath --sandbox workspace-write --color never --output-last-message $resultPath -
        $exitCode = $LASTEXITCODE
        $result = if (Test-Path -LiteralPath $resultPath) { Get-Content -Raw -LiteralPath $resultPath } else { 'Codex completed without a final message.' }
        if ($exitCode -ne 0) { throw "codex exec exited with code $exitCode.`n$result" }
        Write-InboxRecord $config $slot 'pending' $result $runId | Out-Null
        $state.claims[$item.occurrenceKey] = $NowUtc.ToString('o')
        $state.backlog = @($state.backlog | Where-Object { $_.occurrenceKey -ne $item.occurrenceKey })
        Save-State $state
    }
    catch {
        Write-InboxRecord $config $slot 'failed' ("CODEX_LAUNCH_OR_RUNTIME_ERROR (attempt $($item.attempts))`n`n$($_.Exception.Message)") $runId | Out-Null
        Save-State $state
    }
}
