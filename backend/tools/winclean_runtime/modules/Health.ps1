# Copyright (c) 2026 Mr-Aurevo-X. All rights reserved.
# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# Author: Mr-Aurevo-X | https://github.com/Mr-Aurevo-X

#Requires -Version 5.1
# Health.ps1 - Disques, dossiers ciblés, stats de session

function Get-WinCleanStatsPath {
    param([string]$BaseDir = $Global:WinCleanRoot)
    if (-not $BaseDir) { $BaseDir = Get-WinCleanBaseDir }
    Join-Path $BaseDir 'logs\stats.json'
}

function Get-WinCleanSessionStats {
    param([string]$BaseDir = $Global:WinCleanRoot)
    $path = Get-WinCleanStatsPath -BaseDir $BaseDir
    $defaults = @{
        LastSessionAt   = $null
        LastFreedBytes  = 0L
        TotalFreedBytes = 0L
        LastScanBytes   = 0L
    }
    if (-not (Test-Path -LiteralPath $path)) { return $defaults }
    try {
        $raw = Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json
        return @{
            LastSessionAt   = $raw.LastSessionAt
            LastFreedBytes  = [long]$raw.LastFreedBytes
            TotalFreedBytes = [long]$raw.TotalFreedBytes
            LastScanBytes   = [long]$raw.LastScanBytes
        }
    }
    catch {
        return $defaults
    }
}

function Save-WinCleanSessionStats {
    param(
        [string]$BaseDir = $Global:WinCleanRoot,
        [long]$FreedBytes = 0,
        [long]$ScanBytes = -1
    )
    $path = Get-WinCleanStatsPath -BaseDir $BaseDir
    $dir = Split-Path $path -Parent
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }

    $cur = Get-WinCleanSessionStats -BaseDir $BaseDir
    if ($FreedBytes -gt 0) {
        $cur.LastFreedBytes = $FreedBytes
        $cur.TotalFreedBytes = [long]$cur.TotalFreedBytes + $FreedBytes
        $cur.LastSessionAt = (Get-Date).ToString('o')
    }
    if ($ScanBytes -ge 0) {
        $cur.LastScanBytes = $ScanBytes
        if (-not $cur.LastSessionAt) {
            $cur.LastSessionAt = (Get-Date).ToString('o')
        }
    }

    $obj = [PSCustomObject]@{
        LastSessionAt   = $cur.LastSessionAt
        LastFreedBytes  = [long]$cur.LastFreedBytes
        TotalFreedBytes = [long]$cur.TotalFreedBytes
        LastScanBytes   = [long]$cur.LastScanBytes
    }
    ($obj | ConvertTo-Json) | Set-Content -LiteralPath $path -Encoding UTF8
}

function Get-WinCleanDisks {
    $list = @()
    Get-PSDrive -PSProvider FileSystem -ErrorAction SilentlyContinue | Where-Object {
        $_.Used -ne $null -and $_.Free -ne $null -and $_.Name -match '^[A-Z]$'
    } | ForEach-Object {
        $free = [long]$_.Free
        $used = [long]$_.Used
        $total = $free + $used
        if ($total -le 0) { return }
        $list += @{
            Name      = $_.Name
            Root      = $_.Root
            Free      = $free
            Used      = $used
            Total     = $total
            FreeText  = (Format-WinCleanSize $free)
            UsedText  = (Format-WinCleanSize $used)
            TotalText = (Format-WinCleanSize $total)
            PctUsed   = [math]::Round(100.0 * $used / $total, 0)
        }
    }
    return $list
}

function Get-WinCleanFolderSizeQuick {
    param(
        [string]$Path,
        [int]$MaxDepth = 2,
        [int]$TimeoutSec = 25
    )
    if (-not (Test-Path -LiteralPath $Path)) {
        return @{ Bytes = 0L; Count = 0; Path = $Path; Exists = $false }
    }

    $total = [long]0
    $count = 0
    $sw = [Diagnostics.Stopwatch]::StartNew()
    try {
        # Fast-ish: measure files with limited depth via manual walk for depth 0-1, recurse for small trees
        $item = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
        if (-not $item.PSIsContainer) {
            return @{ Bytes = [long]$item.Length; Count = 1; Path = $Path; Exists = $true }
        }

        Get-ChildItem -LiteralPath $Path -Force -ErrorAction SilentlyContinue | ForEach-Object {
            if ($sw.Elapsed.TotalSeconds -gt $TimeoutSec) { return }
            if ($_.PSIsContainer) {
                if ($MaxDepth -le 0) { return }
                try {
                    Get-ChildItem -LiteralPath $_.FullName -Recurse -Force -File -ErrorAction SilentlyContinue |
                        ForEach-Object {
                            if ($sw.Elapsed.TotalSeconds -gt $TimeoutSec) { return }
                            $total += $_.Length
                            $count++
                        }
                }
                catch { }
            }
            else {
                $total += $_.Length
                $count++
            }
        }
    }
    catch { }

    return @{
        Bytes  = $total
        Count  = $count
        Path   = $Path
        Exists = $true
        Partial = ($sw.Elapsed.TotalSeconds -gt $TimeoutSec)
    }
}

function Get-WinCleanTargetFolders {
    $user = $env:USERPROFILE
    $local = $env:LOCALAPPDATA
    $targets = @(
        @{ Id = 'Downloads'; Label = 'Téléchargements'; Path = Join-Path $user 'Downloads' }
        @{ Id = 'Desktop';   Label = 'Bureau';          Path = Join-Path $user 'Desktop' }
        @{ Id = 'Documents'; Label = 'Documents';       Path = Join-Path $user 'Documents' }
        @{ Id = 'LocalApp';  Label = 'LocalAppData';    Path = $local }
    )
    $results = @()
    foreach ($t in $targets) {
        $depth = if ($t.Id -eq 'LocalApp') { 1 } else { 2 }
        $timeout = if ($t.Id -eq 'LocalApp') { 20 } else { 30 }
        $r = Get-WinCleanFolderSizeQuick -Path $t.Path -MaxDepth $depth -TimeoutSec $timeout
        $results += @{
            Id       = $t.Id
            Label    = $t.Label
            Path     = $t.Path
            Bytes    = [long]$r.Bytes
            Count    = [int]$r.Count
            SizeText = (Format-WinCleanSize $r.Bytes)
            Exists   = [bool]$r.Exists
            Partial  = [bool]$r.Partial
        }
    }
    return @($results | Sort-Object { $_.Bytes } -Descending)
}

function New-WinCleanDiskSnapshot {
    param([string]$Label = 'start')
    $disks = @{}
    foreach ($d in @(Get-WinCleanDisks)) {
        $disks[$d.Name] = @{
            Name  = $d.Name
            Free  = [long]$d.Free
            Used  = [long]$d.Used
            Total = [long]$d.Total
        }
    }
    return @{
        At    = Get-Date
        Label = $Label
        Disks = $disks
    }
}

function Compare-WinCleanDiskSnapshots {
    param(
        $Before,
        $After = $null
    )
    if (-not $After) { $After = New-WinCleanDiskSnapshot -Label 'now' }
    $rows = @()
    $names = @($Before.Disks.Keys + $After.Disks.Keys | Select-Object -Unique | Sort-Object)
    foreach ($name in $names) {
        $b = $Before.Disks[$name]
        $a = $After.Disks[$name]
        if (-not $b -or -not $a) { continue }
        $deltaFree = [long]$a.Free - [long]$b.Free
        $rows += @{
            Name           = $name
            FreeBefore     = [long]$b.Free
            FreeAfter      = [long]$a.Free
            FreeBeforeText = (Format-WinCleanSize $b.Free)
            FreeAfterText  = (Format-WinCleanSize $a.Free)
            DeltaFree      = $deltaFree
            DeltaText      = $(
                if ($deltaFree -gt 0) { '+' + (Format-WinCleanSize $deltaFree) }
                elseif ($deltaFree -lt 0) { '-' + (Format-WinCleanSize ([math]::Abs($deltaFree))) }
                else { '±0' }
            )
            PctUsedBefore  = if ($b.Total -gt 0) { [math]::Round(100.0 * $b.Used / $b.Total, 0) } else { 0 }
            PctUsedAfter   = if ($a.Total -gt 0) { [math]::Round(100.0 * $a.Used / $a.Total, 0) } else { 0 }
        }
    }
    return @{
        BeforeAt = $Before.At
        AfterAt  = $After.At
        Rows     = $rows
    }
}

function Get-WinCleanLargeFiles {
    param(
        [long]$MinBytes = 100MB,
        [int]$Top = 20,
        [int]$TimeoutSec = 45
    )

    $user = $env:USERPROFILE
    $roots = @(
        Join-Path $user 'Downloads'
        Join-Path $user 'Desktop'
        Join-Path $user 'Documents'
        Join-Path $user 'Videos'
        Join-Path $env:LOCALAPPDATA 'Temp'
    ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }

    $found = New-Object System.Collections.Generic.List[object]
    $sw = [Diagnostics.Stopwatch]::StartNew()
    $partial = $false

    foreach ($root in $roots) {
        if ($sw.Elapsed.TotalSeconds -gt $TimeoutSec) { $partial = $true; break }
        try {
            Get-ChildItem -LiteralPath $root -Recurse -Force -File -ErrorAction SilentlyContinue |
                Where-Object { $_.Length -ge $MinBytes } |
                ForEach-Object {
                    if ($sw.Elapsed.TotalSeconds -gt $TimeoutSec) { $partial = $true; return }
                    $found.Add([PSCustomObject]@{
                        Name     = $_.Name
                        Path     = $_.FullName
                        Dir      = $_.DirectoryName
                        Bytes    = [long]$_.Length
                        SizeText = (Format-WinCleanSize $_.Length)
                        Modified = $_.LastWriteTime.ToString('dd/MM/yyyy')
                        RootHint = Split-Path $root -Leaf
                    })
                }
        }
        catch { }
        if ($partial) { break }
    }

    $topList = @($found | Sort-Object Bytes -Descending | Select-Object -First $Top)
    return @{
        Files   = $topList
        Count   = $topList.Count
        Partial = $partial
        MinText = (Format-WinCleanSize $MinBytes)
    }
}
