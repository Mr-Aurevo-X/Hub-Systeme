# Copyright (c) 2026 Mr-Aurevo-X. All rights reserved.
# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# Author: Mr-Aurevo-X | https://github.com/Mr-Aurevo-X

#Requires -Version 5.1
# Cleanup.Cleaner.ps1 - Suppression robuste
# Write-WinCleanLog : Core.ps1

function Remove-WinCleanItemSafe {
    param(
        [string]$Path,
        [string]$LogPath
    )

    if (-not (Test-Path -LiteralPath $Path)) { return @{ Ok = $true; Bytes = 0L } }
    if (Test-WinCleanPathExcluded -Path $Path) {
        Write-WinCleanLog -Message "Exclu (user): $Path" -LogPath $LogPath -Level SKIP
        return @{ Ok = $false; Bytes = 0L; Excluded = $true }
    }

    $bytes = [long]0
    try {
        $item = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
        if ($item.PSIsContainer) {
            Get-ChildItem -LiteralPath $Path -Recurse -Force -ErrorAction SilentlyContinue |
                Where-Object { -not $_.PSIsContainer } |
                ForEach-Object { $bytes += $_.Length }
        }
        else {
            $bytes = [long]$item.Length
        }
    }
    catch { }

    try {
        Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction Stop
        Write-WinCleanLog -Message "Supprimé: $Path ($bytes bytes)" -LogPath $LogPath -Level OK
        return @{ Ok = $true; Bytes = $bytes }
    }
    catch {
        if (Test-Path -LiteralPath $Path -PathType Container) {
            $freed = [long]0
            Get-ChildItem -LiteralPath $Path -Force -ErrorAction SilentlyContinue | ForEach-Object {
                try {
                    if (Test-WinCleanPathExcluded -Path $_.FullName) { return }
                    $len = 0L
                    if (-not $_.PSIsContainer) { $len = [long]$_.Length }
                    Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction Stop
                    $freed += $len
                }
                catch {
                    Write-WinCleanLog -Message "Skip (verrouillé): $($_.Exception.Message) - $($_.TargetObject)" -LogPath $LogPath -Level SKIP
                }
            }
            return @{ Ok = $true; Bytes = $freed; Partial = $true }
        }
        Write-WinCleanLog -Message "Skip: $Path - $($_.Exception.Message)" -LogPath $LogPath -Level SKIP
        return @{ Ok = $false; Bytes = 0L }
    }
}

function Clear-WinCleanDirectoryContents {
    param(
        [string]$Path,
        [string[]]$FilePatterns = @('*'),
        [string]$LogPath
    )

    $freed = [long]0
    if (-not (Test-Path -LiteralPath $Path)) { return $freed }

    foreach ($pat in $FilePatterns) {
        Get-ChildItem -LiteralPath $Path -Filter $pat -Force -ErrorAction SilentlyContinue | ForEach-Object {
            # Keep directory itself for system folders like Temp / Prefetch / Explorer
            $r = Remove-WinCleanItemSafe -Path $_.FullName -LogPath $LogPath
            $freed += $r.Bytes
        }
    }
    return $freed
}

function Clear-WinCleanRecycleBin {
    param([string]$LogPath)
    try {
        Clear-RecycleBin -Force -ErrorAction Stop
        Write-WinCleanLog -Message 'Corbeille vidée' -LogPath $LogPath -Level OK
        return $true
    }
    catch {
        try {
            $shell = New-Object -ComObject Shell.Application
            $shell.NameSpace(0x0a).Items() | ForEach-Object {
                Remove-Item -LiteralPath $_.Path -Recurse -Force -ErrorAction SilentlyContinue
            }
            Write-WinCleanLog -Message 'Corbeille vidée (COM)' -LogPath $LogPath -Level OK
            return $true
        }
        catch {
            Write-WinCleanLog -Message "Corbeille: $($_.Exception.Message)" -LogPath $LogPath -Level WARN
            return $false
        }
    }
}

function Invoke-WinCleanCleanup {
    param(
        [string[]]$CategoryIds,
        [hashtable]$Categories = $null,
        [string]$LogPath
    )

    if (-not $Categories) { $Categories = Get-WinCleanCategories }
    $totalFreed = [long]0
    $ids = @($CategoryIds | Where-Object { $Categories.Contains($_) })
    $total = [Math]::Max(1, $ids.Count)
    $i = 0

    foreach ($id in $ids) {
        $cat = $Categories[$id]
        $i++
        Write-WinCleanProgress -Percent ([int](5 + (85.0 * ($i - 1) / $total))) -Phase 'Nettoyage' -Detail $cat.Label
        Write-WinCleanLog -Message "=== Nettoyage: $($cat.Label) ===" -LogPath $LogPath

        $svc = $null
        if ($cat.StopService) {
            try {
                $svc = Get-Service -Name $cat.StopService -ErrorAction Stop
                if ($svc.Status -eq 'Running') {
                    Stop-Service -Name $cat.StopService -Force -ErrorAction SilentlyContinue
                    Write-WinCleanLog -Message "Service arrêté: $($cat.StopService)" -LogPath $LogPath
                    Start-Sleep -Seconds 1
                }
            }
            catch {
                Write-WinCleanLog -Message "Service $($cat.StopService): $($_.Exception.Message)" -LogPath $LogPath -Level WARN
            }
        }

        try {
            if ($id -eq 'RecycleBin') {
                Clear-WinCleanRecycleBin -LogPath $LogPath | Out-Null
            }
            elseif ($id -eq 'ExplorerHistory') {
                Clear-WinCleanExplorerHistory -LogPath $LogPath | Out-Null
            }
            elseif ($id -eq 'BrowserCache' -or $id -eq 'AppCaches') {
                foreach ($entry in $cat.Paths) {
                    $path = $entry.Path
                    if ($entry.Pattern) {
                        if (Test-Path -LiteralPath $path) {
                            Get-ChildItem -LiteralPath $path -Directory -ErrorAction SilentlyContinue | ForEach-Object {
                                $target = Join-Path $_.FullName $entry.Pattern
                                if (Test-Path -LiteralPath $target) {
                                    $totalFreed += (Clear-WinCleanDirectoryContents -Path $target -LogPath $LogPath)
                                }
                            }
                        }
                    }
                    else {
                        if (Test-Path -LiteralPath $path) {
                            $totalFreed += (Clear-WinCleanDirectoryContents -Path $path -LogPath $LogPath)
                        }
                    }
                }
            }
            elseif ($id -eq 'DownloadsOld' -or $cat.MaxAgeDays) {
                $days = if ($cat.MaxAgeDays) { [int]$cat.MaxAgeDays } else { 30 }
                foreach ($path in $cat.Paths) {
                    if ($path -like 'SPECIAL:*') { continue }
                    $totalFreed += (Clear-WinCleanAgedFiles -Path $path -MaxAgeDays $days -LogPath $LogPath)
                }
            }
            elseif ($cat.FilePatterns) {
                foreach ($path in $cat.Paths) {
                    if ($path -like 'SPECIAL:*') { continue }
                    if (-not (Test-Path -LiteralPath $path)) { continue }
                    $item = Get-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue
                    if ($item -and -not $item.PSIsContainer) {
                        $r = Remove-WinCleanItemSafe -Path $path -LogPath $LogPath
                        $totalFreed += $r.Bytes
                    }
                    else {
                        foreach ($pat in $cat.FilePatterns) {
                            Get-ChildItem -LiteralPath $path -Filter $pat -Recurse -Force -ErrorAction SilentlyContinue |
                                Where-Object { -not $_.PSIsContainer } |
                                ForEach-Object {
                                    $r = Remove-WinCleanItemSafe -Path $_.FullName -LogPath $LogPath
                                    $totalFreed += $r.Bytes
                                }
                        }
                    }
                }
            }
            else {
                foreach ($path in $cat.Paths) {
                    if ($path -like 'SPECIAL:*') { continue }
                    if (-not (Test-Path -LiteralPath $path)) { continue }
                    # Clear contents, keep folder for system paths
                    $totalFreed += (Clear-WinCleanDirectoryContents -Path $path -LogPath $LogPath)
                }
            }
        }
        finally {
            if ($cat.StopService -and $svc) {
                try {
                    Start-Service -Name $cat.StopService -ErrorAction SilentlyContinue
                    Write-WinCleanLog -Message "Service redémarré: $($cat.StopService)" -LogPath $LogPath
                }
                catch { }
            }
        }
        Write-WinCleanProgress -Percent ([int](5 + (85.0 * $i / $total))) -Phase 'Nettoyage' -Detail $cat.Label
    }

    Write-WinCleanProgress -Percent 95 -Phase 'Nettoyage' -Detail 'Finalisation...'
    Write-WinCleanLog -Message ("Total libéré (approx): {0}" -f (Format-WinCleanSize $totalFreed)) -LogPath $LogPath -Level OK
    return @{ FreedBytes = $totalFreed; FreedText = (Format-WinCleanSize $totalFreed) }
}
