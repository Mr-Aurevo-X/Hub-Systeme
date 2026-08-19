# Copyright (c) 2026 Mr-Aurevo-X. All rights reserved.
# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# Author: Mr-Aurevo-X | https://github.com/Mr-Aurevo-X

#Requires -Version 5.1
# Traces.ps1 - Liste des artefacts "ce que Windows garde" (onglet Traces)
# Dépend : Cleanup.Categories, Core (Format-WinCleanSize)

function Get-WinCleanTraceCategoryIds {
    return @(
        'Recent'
        'JumpLists'
        'ExplorerHistory'
        'Thumbnails'
        'Prefetch'
        'ClipboardHistory'
        'Screenshots'
    )
}

function Get-WinCleanExplorerHistoryKeys {
    return @(
        @{ Path = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\RecentDocs'; Label = 'RecentDocs' }
        @{ Path = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\TypedPaths'; Label = 'TypedPaths' }
        @{ Path = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\WordWheelQuery'; Label = 'WordWheelQuery' }
        @{ Path = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\RunMRU'; Label = 'RunMRU' }
    )
}

function Get-WinCleanLnkTarget {
    param([string]$LnkPath)
    try {
        $shell = New-Object -ComObject WScript.Shell
        $sc = $shell.CreateShortcut($LnkPath)
        $t = [string]$sc.TargetPath
        if (-not [string]::IsNullOrWhiteSpace($t)) { return $t }
    }
    catch { }
    return ''
}

function Add-WinCleanTraceItem {
    param(
        [System.Collections.ArrayList]$List,
        [string]$Name,
        [string]$Path = '',
        [string]$Detail = '',
        [long]$Size = 0
    )
    if ($List.Count -ge 200) { return }
    [void]$List.Add(@{
        name   = $Name
        path   = $Path
        detail = $Detail
        size   = $Size
    })
}

function Get-WinCleanExplorerHistoryList {
    $items = New-Object System.Collections.ArrayList
    $count = 0
    foreach ($k in Get-WinCleanExplorerHistoryKeys) {
        if (-not (Test-Path -LiteralPath $k.Path)) { continue }
        try {
            $props = Get-ItemProperty -LiteralPath $k.Path -ErrorAction Stop
            foreach ($p in $props.PSObject.Properties) {
                if ($p.Name -match '^(PSPath|PSParentPath|PSChildName|PSDrive|PSProvider)$') { continue }
                $val = $p.Value
                $text = $null
                if ($val -is [string]) {
                    $text = $val
                }
                elseif ($val -is [byte[]]) {
                    $text = '(binaire)'
                }
                else {
                    $text = [string]$val
                }
                if ([string]::IsNullOrWhiteSpace($text)) { continue }
                $count++
                $display = $text
                if ($display.Length -gt 120) { $display = $display.Substring(0, 117) + '...' }
                Add-WinCleanTraceItem -List $items -Name ("{0}\{1}" -f $k.Label, $p.Name) -Path $k.Path -Detail $display -Size 0
            }
        }
        catch { }
    }
    return @{ Items = @($items.ToArray()); Count = $count; Bytes = 0L }
}

function Clear-WinCleanExplorerHistory {
    param([string]$LogPath)
    $cleared = 0
    foreach ($k in Get-WinCleanExplorerHistoryKeys) {
        if (-not (Test-Path -LiteralPath $k.Path)) { continue }
        try {
            $props = Get-ItemProperty -LiteralPath $k.Path -ErrorAction Stop
            foreach ($p in $props.PSObject.Properties) {
                if ($p.Name -match '^(PSPath|PSParentPath|PSChildName|PSDrive|PSProvider)$') { continue }
                try {
                    Remove-ItemProperty -LiteralPath $k.Path -Name $p.Name -Force -ErrorAction Stop
                    $cleared++
                }
                catch {
                    Write-WinCleanLog -Message ("Skip reg {0}\{1}: {2}" -f $k.Label, $p.Name, $_.Exception.Message) -LogPath $LogPath -Level SKIP
                }
            }
            Write-WinCleanLog -Message ("ExplorerHistory: {0} nettoyé" -f $k.Label) -LogPath $LogPath -Level OK
        }
        catch {
            Write-WinCleanLog -Message ("ExplorerHistory {0}: {1}" -f $k.Label, $_.Exception.Message) -LogPath $LogPath -Level WARN
        }
    }
    return $cleared
}

function Get-WinCleanTraceFileList {
    param(
        [object]$Cat,
        [int]$MaxItems = 200
    )
    $items = New-Object System.Collections.ArrayList
    $bytes = [long]0
    $count = 0
    $patterns = if ($Cat.FilePatterns) { @($Cat.FilePatterns) } else { @('*') }

    foreach ($path in @($Cat.Paths)) {
        if ($path -like 'SPECIAL:*') { continue }
        if (-not $path -or -not (Test-Path -LiteralPath $path)) { continue }
        try {
            $item = Get-Item -LiteralPath $path -Force -ErrorAction Stop
            if (-not $item.PSIsContainer) {
                $count++
                $bytes += [long]$item.Length
                Add-WinCleanTraceItem -List $items -Name $item.Name -Path $item.FullName -Detail '' -Size ([long]$item.Length)
                continue
            }
            foreach ($pat in $patterns) {
                Get-ChildItem -LiteralPath $path -Filter $pat -Force -ErrorAction SilentlyContinue |
                    Where-Object { -not $_.PSIsContainer } |
                    ForEach-Object {
                        $count++
                        $bytes += [long]$_.Length
                        $detail = ''
                        if ($_.Extension -eq '.lnk') {
                            $detail = Get-WinCleanLnkTarget -LnkPath $_.FullName
                        }
                        Add-WinCleanTraceItem -List $items -Name $_.Name -Path $_.FullName -Detail $detail -Size ([long]$_.Length)
                    }
            }
        }
        catch { }
    }
    return @{ Items = @($items.ToArray()); Count = $count; Bytes = $bytes }
}

function Invoke-WinCleanListTraces {
    param(
        [string[]]$CategoryIds = @()
    )

    $allCats = Get-WinCleanCategories
    $traceIds = Get-WinCleanTraceCategoryIds
    if (-not $CategoryIds -or $CategoryIds.Count -eq 0) {
        $CategoryIds = $traceIds
    }
    else {
        $CategoryIds = @($CategoryIds | Where-Object { $traceIds -contains $_ -and $allCats.Contains($_) })
    }

    $categories = New-Object System.Collections.ArrayList
    $grandBytes = [long]0
    $grandCount = 0
    $total = [Math]::Max(1, $CategoryIds.Count)
    $i = 0

    foreach ($id in $CategoryIds) {
        $i++
        $cat = $allCats[$id]
        Write-WinCleanProgress -Percent ([int](5 + (90.0 * ($i - 1) / $total))) -Phase 'Traces' -Detail $cat.Label

        $items = @()
        $bytes = [long]0
        $count = 0
        $note = $null

        if ($id -eq 'ExplorerHistory') {
            $r = Get-WinCleanExplorerHistoryList
            $items = @($r.Items)
            $count = [int]$r.Count
            $bytes = [long]$r.Bytes
        }
        elseif ($id -eq 'Prefetch' -and -not (Test-WinCleanAdmin)) {
            $note = 'Admin requis pour Prefetch'
            $r = Get-WinCleanTraceFileList -Cat $cat
            $items = @($r.Items)
            $count = [int]$r.Count
            $bytes = [long]$r.Bytes
            if ($count -eq 0) {
                $note = 'Admin requis pour Prefetch'
            }
            else {
                $note = 'Admin recommandé — accès Prefetch limité'
            }
        }
        else {
            $r = Get-WinCleanTraceFileList -Cat $cat
            $items = @($r.Items)
            $count = [int]$r.Count
            $bytes = [long]$r.Bytes
        }

        $entry = @{
            id       = $id
            label    = [string]$cat.Label
            count    = $count
            bytes    = $bytes
            sizeText = (Format-WinCleanSize $bytes)
            needsAdmin = [bool]$cat.NeedsAdmin
            confirmStrong = [bool]$cat.ConfirmStrong
            items    = $items
        }
        if ($note) { $entry.note = $note }
        [void]$categories.Add($entry)
        $grandBytes += $bytes
        $grandCount += $count
        Write-WinCleanProgress -Percent ([int](5 + (90.0 * $i / $total))) -Phase 'Traces' -Detail ("{0}: {1}" -f $cat.Label, $count)
    }

    Write-WinCleanProgress -Percent 98 -Phase 'Traces' -Detail 'Finalisation...'
    return @{
        categories = @($categories.ToArray())
        totalBytes = $grandBytes
        totalCount = $grandCount
        totalText  = (Format-WinCleanSize $grandBytes)
        admin      = [bool](Test-WinCleanAdmin)
    }
}

