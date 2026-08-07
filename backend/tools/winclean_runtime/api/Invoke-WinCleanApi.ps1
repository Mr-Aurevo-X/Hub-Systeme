#Requires -Version 5.1
<#
.SYNOPSIS
  Pont JSON WinClean — lit une requête, appelle les modules, écrit une réponse.
.PARAMETER InFile
  Chemin JSON entrée { "action": "...", "payload": { } }
.PARAMETER OutFile
  Chemin JSON sortie
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$InFile,
    [Parameter(Mandatory)][string]$OutFile
)

$ErrorActionPreference = 'Continue'
# Forcer UTF-8 pour les chaînes / JSON (accents FR)
try {
    [Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
    [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
    $global:OutputEncoding = [System.Text.UTF8Encoding]::new($false)
} catch { }
# api\ -> parent = Cleaner root
$Global:WinCleanRoot = Split-Path $PSScriptRoot -Parent

$modDir = Join-Path $Global:WinCleanRoot 'modules'
# Charger en UTF-8 au scope script (PS 5.1 + ForEach-Object perdrait les fonctions)
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
foreach ($modName in @(
        'Core.ps1'
        'Elevate.ps1'
        'RestorePoint.ps1'
        'Cleanup.Categories.ps1'
        'Cleanup.Scanner.ps1'
        'Cleanup.Cleaner.ps1'
        'Traces.ps1'
        'Debloat.Apps.ps1'
        'Debloat.Policy.ps1'
        'Features.ps1'
        'Health.ps1'
        'Startup.ps1'
        'Report.ps1'
        'Purge.ps1'
    )) {
    $modPath = Join-Path $modDir $modName
    if (-not (Test-Path -LiteralPath $modPath)) { throw "Module manquant: $modPath" }
    $code = [System.IO.File]::ReadAllText($modPath, $utf8NoBom)
    if ($code.Length -gt 0 -and [int][char]$code[0] -eq 0xFEFF) {
        $code = $code.Substring(1)
    }
    . ([scriptblock]::Create($code))
}

$logsDir = Join-Path $Global:WinCleanRoot 'logs'
if (-not (Test-Path $logsDir)) { New-Item -ItemType Directory -Path $logsDir -Force | Out-Null }
$Global:WinCleanCurrentLog = Get-WinCleanSessionLogPath -BaseDir $Global:WinCleanRoot
$Global:WinCleanProgressPath = Get-WinCleanProgressPath -BaseDir $Global:WinCleanRoot

function Write-ApiResponse {
    param($Obj)
    $json = $Obj | ConvertTo-Json -Depth 12 -Compress
    [System.IO.File]::WriteAllText($OutFile, $json, [System.Text.UTF8Encoding]::new($false))
}

function Ok($data = $null) {
    Write-WinCleanProgress -Percent 100 -Phase 'Terminé' -Detail '' -Done $true
    Write-ApiResponse @{ ok = $true; error = $null; data = $data }
}

function Fail([string]$msg) {
    Write-WinCleanProgress -Percent 100 -Phase 'Erreur' -Detail $msg -Done $true -ErrorMessage $msg
    Write-ApiResponse @{ ok = $false; error = $msg; data = $null }
}

try {
    if (-not (Test-Path -LiteralPath $InFile)) { Fail "InFile introuvable: $InFile"; exit 1 }
    $raw = [System.IO.File]::ReadAllText($InFile, [System.Text.Encoding]::UTF8)
    $req = $raw | ConvertFrom-Json
    $action = [string]$req.action
    $p = $req.payload
    if (-not $p) { $p = [pscustomobject]@{} }
    Write-WinCleanProgress -Percent 1 -Phase $action -Detail 'Démarrage...' -Done $false

    switch ($action) {
        'ping' {
            Ok @{
                admin = [bool](Test-WinCleanAdmin)
                root  = $Global:WinCleanRoot
                log   = $Global:WinCleanCurrentLog
            }
        }

        'getHealth' {
            Write-WinCleanProgress -Percent 10 -Phase 'Santé' -Detail 'Disques...'
            $disks = @(Get-WinCleanDisks)
            Write-WinCleanProgress -Percent 35 -Phase 'Santé' -Detail 'Dossiers cibles...'
            $folders = @(Get-WinCleanTargetFolders)
            Write-WinCleanProgress -Percent 80 -Phase 'Santé' -Detail 'Stats...'
            $stats = Get-WinCleanSessionStats -BaseDir $Global:WinCleanRoot
            Ok @{
                disks   = $disks
                folders = $folders
                stats   = $stats
                admin   = [bool](Test-WinCleanAdmin)
            }
        }

        'getLargeFiles' {
            Write-WinCleanProgress -Percent 15 -Phase 'Gros fichiers' -Detail 'Scan en cours...'
            $min = 100MB
            if ($p.minBytes) { $min = [long]$p.minBytes }
            $top = 20
            if ($p.top) { $top = [int]$p.top }
            $res = Get-WinCleanLargeFiles -MinBytes $min -Top $top
            Write-WinCleanProgress -Percent 90 -Phase 'Gros fichiers' -Detail ("{0} fichiers" -f $res.Count)
            Ok $res
        }

        'getCategories' {
            $cats = Get-WinCleanCategories
            $list = @()
            foreach ($key in $cats.Keys) {
                $c = $cats[$key]
                $list += @{
                    Id          = $c.Id
                    Label       = $c.Label
                    Description = $c.Description
                    NeedsAdmin  = [bool]$c.NeedsAdmin
                    DefaultOn   = [bool]$c.DefaultOn
                    Profiles    = @($c.Profiles)
                    TracesOnly  = [bool]$c.TracesOnly
                    ConfirmStrong = [bool]$c.ConfirmStrong
                }
            }
            Ok @{ categories = $list }
        }

        'listTraces' {
            $ids = @()
            if ($p.ids) { $ids = @($p.ids) }
            Write-WinCleanProgress -Percent 5 -Phase 'Traces' -Detail 'Lecture...'
            $res = Invoke-WinCleanListTraces -CategoryIds $ids
            Ok $res
        }

        'scanClean' {
            $ids = @($p.ids)
            if (-not $ids -or $ids.Count -eq 0) { Fail 'ids requis'; break }
            Write-WinCleanProgress -Percent 5 -Phase 'Analyse' -Detail 'Démarrage...'
            $scan = Invoke-WinCleanScan -CategoryIds $ids
            Save-WinCleanSessionStats -BaseDir $Global:WinCleanRoot -ScanBytes ([long]$scan.TotalBytes)
            $catList = @()
            foreach ($k in $scan.Categories.Keys) {
                $c = $scan.Categories[$k]
                $catList += @{
                    Id       = $c.Id
                    Label    = $c.Label
                    Bytes    = [long]$c.Bytes
                    Count    = [int]$c.Count
                    SizeText = $c.SizeText
                }
            }
            Ok @{
                categories = $catList
                totalBytes = [long]$scan.TotalBytes
                totalText  = $scan.TotalText
            }
        }

        'runClean' {
            $ids = @($p.ids)
            if (-not $ids -or $ids.Count -eq 0) { Fail 'ids requis'; break }
            Write-WinCleanProgress -Percent 3 -Phase 'Nettoyage' -Detail 'Snapshot disque...'
            $before = New-WinCleanDiskSnapshot -Label 'before-clean'
            $result = Invoke-WinCleanCleanup -CategoryIds $ids -LogPath $Global:WinCleanCurrentLog
            Write-WinCleanProgress -Percent 92 -Phase 'Nettoyage' -Detail 'Delta disque...'
            $after = New-WinCleanDiskSnapshot -Label 'after-clean'
            $delta = Compare-WinCleanDiskSnapshots -Before $before -After $after
            Save-WinCleanSessionStats -BaseDir $Global:WinCleanRoot -FreedBytes ([long]$result.FreedBytes)
            Ok @{
                FreedBytes = [long]$result.FreedBytes
                FreedText  = $result.FreedText
                diskDelta  = $delta
            }
        }

        'getBloatApps' {
            Write-WinCleanProgress -Percent 20 -Phase 'Debloat' -Detail 'Scan AppX...'
            $apps = @(Get-WinCleanBloatApps -BaseDir $Global:WinCleanRoot)
            Write-WinCleanProgress -Percent 90 -Phase 'Debloat' -Detail ("{0} apps" -f $apps.Count)
            Ok @{ apps = $apps }
        }

        'removeBloat' {
            $names = @($p.names)
            if (-not $names) { Fail 'names requis'; break }
            Write-WinCleanProgress -Percent 10 -Phase 'Debloat' -Detail 'Préparation...'
            $all = @(Get-WinCleanBloatApps -BaseDir $Global:WinCleanRoot)
            $sel = @($all | Where-Object { $names -contains $_.Name })
            foreach ($a in $sel) { $a.Selected = $true }
            Write-WinCleanProgress -Percent 30 -Phase 'Debloat' -Detail ("Suppression {0}..." -f $sel.Count)
            $r = Remove-WinCleanBloatApps -Apps $sel -LogPath $Global:WinCleanCurrentLog -BaseDir $Global:WinCleanRoot
            Ok $r
        }

        'runOptimizations' {
            Write-WinCleanProgress -Percent 10 -Phase 'Optimisations' -Detail 'Application...'
            Invoke-WinCleanOptimizations `
                -Privacy:([bool]$p.privacy) `
                -Tasks:([bool]$p.tasks) `
                -Services:([bool]$p.services) `
                -BaseDir $Global:WinCleanRoot `
                -LogPath $Global:WinCleanCurrentLog
            Write-WinCleanProgress -Percent 60 -Phase 'Optimisations' -Detail 'Features...'
            if ($p.features -or $p.componentCleanup) {
                Invoke-WinCleanFeatures `
                    -OptionalFeatures:([bool]$p.features) `
                    -ComponentCleanup:([bool]$p.componentCleanup) `
                    -LogPath $Global:WinCleanCurrentLog
            }
            Ok @{ message = 'Optimisations appliquées' }
        }

        'analyzeWinSxS' {
            Write-WinCleanProgress -Percent 20 -Phase 'WinSxS' -Detail 'Analyse DISM...'
            Ok (Invoke-WinCleanAnalyzeComponentStore -LogPath $Global:WinCleanCurrentLog)
        }

        'dismRestoreHealth' {
            Write-WinCleanProgress -Percent 5 -Phase 'DISM' -Detail 'RestoreHealth (long)...'
            Ok (Invoke-WinCleanDismRestoreHealth -LogPath $Global:WinCleanCurrentLog)
        }

        'sfcScan' {
            Write-WinCleanProgress -Percent 5 -Phase 'SFC' -Detail 'scannow (long)...'
            Ok (Invoke-WinCleanSfcScan -LogPath $Global:WinCleanCurrentLog)
        }

        'getStartup' {
            Ok @{ items = @(Get-WinCleanStartupItems) }
        }

        'disableStartup' {
            $keys = @($p.items)
            if (-not $keys) { Fail 'items requis'; break }
            $all = @(Get-WinCleanStartupItems)
            $sel = @()
            foreach ($k in $keys) {
                $hit = $all | Where-Object {
                    $_.Name -eq $k.name -and $_.Source -eq $k.source -and $_.Kind -eq $k.kind
                } | Select-Object -First 1
                if ($hit) {
                    $hit.Selected = $true
                    $sel += $hit
                }
            }
            $r = Disable-WinCleanStartupItems -Items $sel -LogPath $Global:WinCleanCurrentLog -BaseDir $Global:WinCleanRoot
            Ok $r
        }

        'findPurge' {
            $kw = [string]$p.keyword
            if ([string]::IsNullOrWhiteSpace($kw)) { Fail 'keyword requis'; break }
            Write-WinCleanProgress -Percent 15 -Phase 'Purge' -Detail 'Apps installées...'
            $apps = @(Find-WinCleanInstalledApps -Keyword $kw -BaseDir $Global:WinCleanRoot)
            $locs = @($apps | Where-Object { $_.Path } | ForEach-Object { $_.Path } | Select-Object -Unique)
            Write-WinCleanProgress -Percent 45 -Phase 'Purge' -Detail 'Restes...'
            $left = @(Find-WinCleanLeftovers -Keyword $kw -InstallLocations $locs -BaseDir $Global:WinCleanRoot)
            Write-WinCleanProgress -Percent 90 -Phase 'Purge' -Detail ("{0} apps / {1} restes" -f $apps.Count, $left.Count)
            Ok @{ apps = $apps; leftovers = $left }
        }

        'officialUninstall' {
            $appsPayload = @($p.apps)
            if (-not $appsPayload) { Fail 'apps requis'; break }
            $results = @()
            foreach ($a in $appsPayload) {
                $appObj = [PSCustomObject]@{
                    Name            = [string]$a.Name
                    Kind            = [string]$a.Kind
                    Path            = [string]$a.Path
                    UninstallString = [string]$a.UninstallString
                    PackageFullName = [string]$a.PackageFullName
                    Verdict         = [string]$a.Verdict
                }
                $results += (Invoke-WinCleanOfficialUninstall -App $appObj -LogPath $Global:WinCleanCurrentLog -BaseDir $Global:WinCleanRoot)
            }
            Ok @{ results = $results }
        }

        'purgeLeftovers' {
            $hitsPayload = @($p.hits)
            if (-not $hitsPayload) { Fail 'hits requis'; break }
            $hits = @()
            foreach ($h in $hitsPayload) {
                $hits += [PSCustomObject]@{
                    Selected = $true
                    Verdict  = [string]$h.Verdict
                    Kind     = [string]$h.Kind
                    Name     = [string]$h.Name
                    Path     = [string]$h.Path
                    Bytes    = [long]$h.Bytes
                }
            }
            $before = New-WinCleanDiskSnapshot -Label 'before-purge'
            $r = Remove-WinCleanLeftoverHits -Hits $hits -LogPath $Global:WinCleanCurrentLog -BaseDir $Global:WinCleanRoot
            $after = New-WinCleanDiskSnapshot -Label 'after-purge'
            $delta = Compare-WinCleanDiskSnapshots -Before $before -After $after
            Ok @{
                Removed   = $r.Removed
                Skipped   = $r.Skipped
                Failed    = $r.Failed
                diskDelta = $delta
            }
        }

        'getExclusions' {
            Ok @{ exclusions = @(Get-WinCleanUserExclusions -BaseDir $Global:WinCleanRoot) }
        }

        'setExclusions' {
            $patterns = @($p.exclusions)
            if ($null -eq $patterns) { $patterns = @() }
            $path = Save-WinCleanUserExclusions -Patterns $patterns -BaseDir $Global:WinCleanRoot
            Ok @{
                path = $path
                exclusions = @(Get-WinCleanUserExclusions -BaseDir $Global:WinCleanRoot)
            }
        }

        'getSessions' {
            Ok @{
                undo    = @(Get-WinCleanUndoFiles -BaseDir $Global:WinCleanRoot)
                logs    = @(Get-WinCleanSessionLogs -BaseDir $Global:WinCleanRoot)
                stats   = (Get-WinCleanSessionStats -BaseDir $Global:WinCleanRoot)
            }
        }

        'exportReport' {
            $path = Export-WinCleanHtmlReport -BaseDir $Global:WinCleanRoot `
                -Disks @(Get-WinCleanDisks) `
                -Stats (Get-WinCleanSessionStats -BaseDir $Global:WinCleanRoot)
            Ok @{ path = $path }
        }

        'createRestorePoint' {
            Ok (New-WinCleanRestorePoint)
        }

        default {
            Fail "Action inconnue: $action"
        }
    }
}
catch {
    Fail $_.Exception.Message
    exit 1
}
