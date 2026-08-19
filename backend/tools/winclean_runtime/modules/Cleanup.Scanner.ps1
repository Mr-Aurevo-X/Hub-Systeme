# Copyright (c) 2026 Mr-Aurevo-X. All rights reserved.
# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# Author: Mr-Aurevo-X | https://github.com/Mr-Aurevo-X

#Requires -Version 5.1
# Cleanup.Scanner.ps1 - Calcul des tailles (dry-run)
# Format-WinCleanSize / Get-WinCleanPathSizeBytes : Core.ps1

function Get-WinCleanPathSize {
    param(
        [string]$Path,
        [string[]]$FilePatterns = @('*'),
        [string]$Pattern = $null
    )

    $total = [long]0
    $count = 0
    if (-not $Path -or (Test-WinCleanPathExcluded -Path $Path)) {
        return @{ Bytes = 0L; Count = 0; Path = $Path; Excluded = $true }
    }
    if (-not (Test-Path -LiteralPath $Path)) {
        return @{ Bytes = 0L; Count = 0; Path = $Path }
    }

    try {
        $item = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
        if (-not $item.PSIsContainer) {
            return @{ Bytes = [long]$item.Length; Count = 1; Path = $Path }
        }

        if ($Pattern) {
            Get-ChildItem -LiteralPath $Path -Directory -ErrorAction SilentlyContinue | ForEach-Object {
                $target = Join-Path $_.FullName $Pattern
                if (Test-Path -LiteralPath $target) {
                    if (Test-WinCleanPathExcluded -Path $target) { return }
                    $r = Get-WinCleanPathSize -Path $target
                    $total += $r.Bytes
                    $count += $r.Count
                }
            }
            return @{ Bytes = $total; Count = $count; Path = $Path }
        }

        foreach ($pat in $FilePatterns) {
            Get-ChildItem -LiteralPath $Path -Filter $pat -Recurse -Force -ErrorAction SilentlyContinue |
                Where-Object { -not $_.PSIsContainer } |
                ForEach-Object {
                    if (Test-WinCleanPathExcluded -Path $_.FullName) { return }
                    $total += $_.Length
                    $count++
                }
        }
    }
    catch { }

    return @{ Bytes = $total; Count = $count; Path = $Path }
}

function Get-WinCleanRecycleBinSize {
    $total = [long]0
    $count = 0
    try {
        $shell = New-Object -ComObject Shell.Application
        $rb = $shell.NameSpace(0x0a)
        if ($rb) {
            foreach ($item in $rb.Items()) {
                try {
                    $size = $item.ExtendedProperty('Size')
                    if ($null -eq $size) {
                        # fallback
                        $size = 0
                    }
                    $total += [long]$size
                    $count++
                }
                catch { }
            }
        }
    }
    catch {
        # Rough fallback via $Recycle.Bin
        Get-PSDrive -PSProvider FileSystem -ErrorAction SilentlyContinue | ForEach-Object {
            $bin = Join-Path $_.Root '$Recycle.Bin'
            if (Test-Path -LiteralPath $bin) {
                $r = Get-WinCleanPathSize -Path $bin
                $total += $r.Bytes
                $count += $r.Count
            }
        }
    }
    return @{ Bytes = $total; Count = $count; Path = 'RecycleBin' }
}

function Get-WinCleanAgedFilesSize {
    param(
        [string]$Path,
        [int]$MaxAgeDays = 30
    )
    $total = [long]0
    $count = 0
    if (-not (Test-Path -LiteralPath $Path)) {
        return @{ Bytes = 0L; Count = 0; Path = $Path }
    }
    if (Test-WinCleanPathExcluded -Path $Path) {
        return @{ Bytes = 0L; Count = 0; Path = $Path; Excluded = $true }
    }
    $cutoff = (Get-Date).AddDays(-$MaxAgeDays)
    try {
        Get-ChildItem -LiteralPath $Path -Recurse -Force -File -ErrorAction SilentlyContinue |
            Where-Object { $_.LastWriteTime -lt $cutoff -and -not (Test-WinCleanPathExcluded -Path $_.FullName) } |
            ForEach-Object {
                $total += $_.Length
                $count++
            }
    }
    catch { }
    return @{ Bytes = $total; Count = $count; Path = $Path }
}

function Clear-WinCleanAgedFiles {
    param(
        [string]$Path,
        [int]$MaxAgeDays = 30,
        [string]$LogPath
    )
    $freed = [long]0
    if (-not (Test-Path -LiteralPath $Path)) { return $freed }
    $cutoff = (Get-Date).AddDays(-$MaxAgeDays)
    try {
        Get-ChildItem -LiteralPath $Path -Recurse -Force -File -ErrorAction SilentlyContinue |
            Where-Object { $_.LastWriteTime -lt $cutoff } |
            ForEach-Object {
                $r = Remove-WinCleanItemSafe -Path $_.FullName -LogPath $LogPath
                $freed += $r.Bytes
            }
    }
    catch { }
    return $freed
}

function Invoke-WinCleanScan {
    param(
        [string[]]$CategoryIds,
        [hashtable]$Categories = $null
    )

    if (-not $Categories) { $Categories = Get-WinCleanCategories }
    $results = [ordered]@{}
    $grand = [long]0
    $ids = @($CategoryIds | Where-Object { $Categories.Contains($_) })
    $total = [Math]::Max(1, $ids.Count)
    $i = 0

    foreach ($id in $ids) {
        $cat = $Categories[$id]
        $i++
        $pct = [int](5 + (90.0 * ($i - 1) / $total))
        Write-WinCleanProgress -Percent $pct -Phase 'Analyse' -Detail $cat.Label
        $bytes = [long]0
        $count = 0
        $details = @()

        if ($id -eq 'RecycleBin') {
            $r = Get-WinCleanRecycleBinSize
            $bytes = $r.Bytes
            $count = $r.Count
            $details += $r
        }
        elseif ($id -eq 'ExplorerHistory') {
            $r = Get-WinCleanExplorerHistoryList
            $bytes = [long]$r.Bytes
            $count = [int]$r.Count
            $details += $r
        }
        elseif ($id -eq 'BrowserCache' -or $id -eq 'AppCaches') {
            foreach ($entry in $cat.Paths) {
                $path = $entry.Path
                $pat = $entry.Pattern
                $r = Get-WinCleanPathSize -Path $path -Pattern $pat
                $bytes += $r.Bytes
                $count += $r.Count
                $details += $r
            }
        }
        elseif ($id -eq 'DownloadsOld' -or $cat.MaxAgeDays) {
            $days = if ($cat.MaxAgeDays) { [int]$cat.MaxAgeDays } else { 30 }
            foreach ($path in $cat.Paths) {
                if ($path -like 'SPECIAL:*') { continue }
                $r = Get-WinCleanAgedFilesSize -Path $path -MaxAgeDays $days
                $bytes += $r.Bytes
                $count += $r.Count
                $details += $r
            }
        }
        else {
            $patterns = if ($cat.FilePatterns) { $cat.FilePatterns } else { @('*') }
            foreach ($path in $cat.Paths) {
                if ($path -like 'SPECIAL:*') { continue }
                $r = Get-WinCleanPathSize -Path $path -FilePatterns $patterns
                $bytes += $r.Bytes
                $count += $r.Count
                $details += $r
            }
        }

        $results[$id] = @{
            Id       = $id
            Label    = $cat.Label
            Bytes    = $bytes
            Count    = $count
            SizeText = (Format-WinCleanSize $bytes)
            Details  = $details
        }
        $grand += $bytes
        Write-WinCleanProgress -Percent ([int](5 + (90.0 * $i / $total))) -Phase 'Analyse' -Detail ("{0}: {1}" -f $cat.Label, (Format-WinCleanSize $bytes))
    }

    Write-WinCleanProgress -Percent 98 -Phase 'Analyse' -Detail 'Finalisation...'
    return @{
        Categories = $results
        TotalBytes = $grand
        TotalText  = (Format-WinCleanSize $grand)
    }
}
