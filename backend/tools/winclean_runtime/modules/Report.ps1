# Copyright (c) 2026 Mr-Aurevo-X. All rights reserved.
# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# Author: Mr-Aurevo-X | https://github.com/Mr-Aurevo-X

#Requires -Version 5.1
# Report.ps1 - Sessions/undo + export HTML

function Get-WinCleanUndoFiles {
    param([string]$BaseDir = $Global:WinCleanRoot)
    $logs = Join-Path $BaseDir 'logs'
    if (-not (Test-Path $logs)) { return @() }

    $files = @()
    Get-ChildItem -LiteralPath $logs -File -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -match '^undo-' } |
        Sort-Object LastWriteTime -Descending |
        ForEach-Object {
            $kind = 'autre'
            if ($_.Name -like 'undo-apps-*') { $kind = 'apps' }
            elseif ($_.Name -like 'undo-tasks-*') { $kind = 'tâches' }
            elseif ($_.Name -like 'undo-startup-*') { $kind = 'démarrage' }

            $files += [PSCustomObject]@{
                Name     = $_.Name
                Path     = $_.FullName
                Kind     = $kind
                SizeText = (Format-WinCleanSize $_.Length)
                Modified = $_.LastWriteTime.ToString('dd/MM/yyyy HH:mm')
                SortDate = $_.LastWriteTime
            }
        }
    return $files
}

function Get-WinCleanSessionLogs {
    param([string]$BaseDir = $Global:WinCleanRoot)
    $logs = Join-Path $BaseDir 'logs'
    if (-not (Test-Path $logs)) { return @() }

    Get-ChildItem -LiteralPath $logs -Filter 'winclean-*.log' -File -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 30 |
        ForEach-Object {
            $freedHint = ''
            try {
                $hit = Select-String -LiteralPath $_.FullName -Pattern 'Total libéré \(approx\): (.+)' |
                    Select-Object -Last 1
                if ($hit) { $freedHint = $hit.Matches[0].Groups[1].Value }
            }
            catch { }

            [PSCustomObject]@{
                Name     = $_.Name
                Path     = $_.FullName
                Modified = $_.LastWriteTime.ToString('dd/MM/yyyy HH:mm')
                Freed    = $(if ($freedHint) { $freedHint } else { '—' })
                SizeText = (Format-WinCleanSize $_.Length)
            }
        }
}

function Export-WinCleanHtmlReport {
    param(
        [string]$BaseDir = $Global:WinCleanRoot,
        [object]$Scan = $null,
        [object[]]$Disks = $null,
        [object[]]$BloatApps = $null,
        [object]$Stats = $null
    )

    $logs = Join-Path $BaseDir 'logs'
    if (-not (Test-Path $logs)) { New-Item -ItemType Directory -Path $logs -Force | Out-Null }
    $path = Join-Path $logs ("rapport-{0}.html" -f (Get-Date -Format 'yyyyMMdd_HHmmss'))

    if (-not $Disks) { $Disks = @(Get-WinCleanDisks) }
    if (-not $Stats) { $Stats = Get-WinCleanSessionStats -BaseDir $BaseDir }

    function Escape-Html([string]$s) {
        if ($null -eq $s) { return '' }
        ($s -replace '&', '&amp;' -replace '<', '&lt;' -replace '>', '&gt;' -replace '"', '&quot;')
    }

    $rowsDisk = ''
    foreach ($d in $Disks) {
        $rowsDisk += "<tr><td>$(Escape-Html $d.Name):</td><td>$($d.PctUsed)%</td><td>$(Escape-Html $d.FreeText)</td><td>$(Escape-Html $d.TotalText)</td></tr>`n"
    }

    $rowsCat = ''
    $scanTotal = '—'
    if ($Scan -and $Scan.Categories) {
        $scanTotal = Escape-Html $Scan.TotalText
        foreach ($id in $Scan.Categories.Keys) {
            $c = $Scan.Categories[$id]
            $rowsCat += "<tr><td>$(Escape-Html $c.Label)</td><td>$(Escape-Html $c.SizeText)</td><td>$($c.Count)</td></tr>`n"
        }
    }
    else {
        $rowsCat = '<tr><td colspan="3">Aucune analyse récente</td></tr>'
    }

    $rowsApps = ''
    $appCount = 0
    if ($BloatApps -and $BloatApps.Count -gt 0) {
        $appCount = $BloatApps.Count
        foreach ($a in $BloatApps) {
            $sel = if ($a.Selected) { 'oui' } else { 'non' }
            $rowsApps += "<tr><td>$(Escape-Html $a.Name)</td><td>$(Escape-Html $a.Version)</td><td>$(Escape-Html $a.ApproxSizeText)</td><td>$sel</td></tr>`n"
        }
    }
    else {
        $rowsApps = '<tr><td colspan="4">Pas de scan Debloat dans ce rapport</td></tr>'
    }

    $html = @"
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8"/>
<title>WinClean — Rapport</title>
<style>
  body { font-family: Segoe UI, sans-serif; background:#121418; color:#e8ecf2; margin:24px; }
  h1 { color:#2dd4a8; }
  h2 { color:#94a3b8; margin-top:28px; font-size:1.1rem; }
  table { border-collapse:collapse; width:100%; max-width:900px; }
  th, td { border:1px solid #343a48; padding:8px 10px; text-align:left; }
  th { background:#1c1f26; color:#2dd4a8; }
  tr:nth-child(even) { background:#1a1d24; }
  .meta { color:#8c96a8; margin-bottom:20px; }
</style>
</head>
<body>
<h1>WinClean — Rapport</h1>
<p class="meta">Généré le $(Get-Date -Format 'dd/MM/yyyy HH:mm:ss') — $(Escape-Html $env:COMPUTERNAME)</p>

<h2>Sessions</h2>
<table>
<tr><th>Indicateur</th><th>Valeur</th></tr>
<tr><td>Dernier nettoyage</td><td>$(Escape-Html (Format-WinCleanSize $Stats.LastFreedBytes))</td></tr>
<tr><td>Total cumulé</td><td>$(Escape-Html (Format-WinCleanSize $Stats.TotalFreedBytes))</td></tr>
<tr><td>Dernière analyse</td><td>$(Escape-Html (Format-WinCleanSize $Stats.LastScanBytes))</td></tr>
</table>

<h2>Disques</h2>
<table>
<tr><th>Lecteur</th><th>Utilisé</th><th>Libre</th><th>Total</th></tr>
$rowsDisk
</table>

<h2>Analyse nettoyage (total: $scanTotal)</h2>
<table>
<tr><th>Catégorie</th><th>Taille</th><th>Fichiers</th></tr>
$rowsCat
</table>

<h2>Apps bloat ($appCount)</h2>
<table>
<tr><th>Nom</th><th>Version</th><th>Taille</th><th>Sélection</th></tr>
$rowsApps
</table>
</body>
</html>
"@

    $html | Set-Content -LiteralPath $path -Encoding UTF8
    return $path
}
