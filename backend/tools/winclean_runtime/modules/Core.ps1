# Copyright (c) 2026 Mr-Aurevo-X. All rights reserved.
# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# Author: Mr-Aurevo-X | https://github.com/Mr-Aurevo-X

#Requires -Version 5.1
# Core.ps1 - Root, taille, log, exclusions utilisateur (fondation commune)

function Get-WinCleanBaseDir {
    if ($Global:WinCleanRoot -and (Test-Path -LiteralPath $Global:WinCleanRoot)) {
        return $Global:WinCleanRoot
    }
    if ($PSScriptRoot -and (Split-Path $PSScriptRoot -Leaf) -eq 'modules') {
        return (Split-Path $PSScriptRoot -Parent)
    }
    if ($PSScriptRoot -and (Split-Path $PSScriptRoot -Leaf) -eq 'api') {
        return (Split-Path $PSScriptRoot -Parent)
    }
    if ($PSScriptRoot) { return $PSScriptRoot }
    return (Get-Location).Path
}

# Alias historique (évite double Split-Path incorrect)
function Get-WinCleanRoot {
    Get-WinCleanBaseDir
}

function Format-WinCleanSize {
    param([long]$Bytes)
    if ($null -eq $Bytes) { $Bytes = 0 }
    if ($Bytes -lt 1KB) { return "$Bytes B" }
    if ($Bytes -lt 1MB) { return "{0:N1} KB" -f ($Bytes / 1KB) }
    if ($Bytes -lt 1GB) { return "{0:N1} MB" -f ($Bytes / 1MB) }
    return "{0:N2} GB" -f ($Bytes / 1GB)
}

function Write-WinCleanLog {
    param(
        [string]$Message,
        [string]$LogPath,
        [ValidateSet('INFO', 'WARN', 'ERROR', 'SKIP', 'OK')]
        [string]$Level = 'INFO'
    )
    $line = "[{0}] [{1}] {2}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Level, $Message
    if ($LogPath) {
        Add-Content -LiteralPath $LogPath -Value $line -Encoding UTF8 -ErrorAction SilentlyContinue
    }
    if ($Global:WinCleanLogCallback) {
        try { & $Global:WinCleanLogCallback $line } catch { }
    }
}

function Get-WinCleanPathSizeBytes {
    param([string]$Path)
    if (-not $Path -or -not (Test-Path -LiteralPath $Path)) { return 0L }
    try {
        $item = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
        if (-not $item.PSIsContainer) { return [long]$item.Length }
        $sum = [long]0
        Get-ChildItem -LiteralPath $Path -Recurse -Force -File -ErrorAction SilentlyContinue |
            ForEach-Object { $sum += $_.Length }
        return $sum
    }
    catch { return 0L }
}

function Get-WinCleanExclusionsPath {
    param([string]$BaseDir = $(Get-WinCleanBaseDir))
    Join-Path $BaseDir 'lists\user-exclusions.txt'
}

function Get-WinCleanUserExclusions {
    param([string]$BaseDir = $(Get-WinCleanBaseDir))
    $file = Get-WinCleanExclusionsPath -BaseDir $BaseDir
    if (-not (Test-Path -LiteralPath $file)) { return @() }
    Get-Content -LiteralPath $file -Encoding UTF8 -ErrorAction SilentlyContinue |
        ForEach-Object { $_.Trim() } |
        Where-Object { $_ -and $_ -notmatch '^\s*#' }
}

function Save-WinCleanUserExclusions {
    param(
        [string[]]$Patterns,
        [string]$BaseDir = $(Get-WinCleanBaseDir)
    )
    $file = Get-WinCleanExclusionsPath -BaseDir $BaseDir
    $dir = Split-Path $file -Parent
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    $header = @(
        '# WinCleaner — exclusions utilisateur (un motif ou chemin par ligne)'
        '# Les chemins contenant un motif sont ignorés au nettoyage / purge'
        ''
    )
    $body = @($Patterns | ForEach-Object { $_.Trim() } | Where-Object { $_ } | Select-Object -Unique)
    ($header + $body) | Set-Content -LiteralPath $file -Encoding UTF8
    return $file
}

function Test-WinCleanPathExcluded {
    param(
        [string]$Path,
        [string]$BaseDir = $(Get-WinCleanBaseDir),
        [string[]]$Exclusions = $null
    )
    if ([string]::IsNullOrWhiteSpace($Path)) { return $false }
    if ($null -eq $Exclusions) {
        $Exclusions = @(Get-WinCleanUserExclusions -BaseDir $BaseDir)
    }
    if (-not $Exclusions -or $Exclusions.Count -eq 0) { return $false }
    $full = $Path
    try {
        if (Test-Path -LiteralPath $Path) {
            $full = [IO.Path]::GetFullPath($Path)
        }
    } catch { }
    foreach ($ex in $Exclusions) {
        if ([string]::IsNullOrWhiteSpace($ex)) { continue }
        if ($full -like "*$ex*" -or $full -eq $ex) { return $true }
        # Motif wildcard explicite
        if ($ex -match '[\*\?]' -and $full -like $ex) { return $true }
    }
    return $false
}

function Get-WinCleanSessionLogPath {
    param([string]$BaseDir = $(Get-WinCleanBaseDir))
    $logsDir = Join-Path $BaseDir 'logs'
    if (-not (Test-Path $logsDir)) { New-Item -ItemType Directory -Path $logsDir -Force | Out-Null }
    $marker = Join-Path $logsDir 'current-session.logpath'
    if (Test-Path -LiteralPath $marker) {
        $existing = (Get-Content -LiteralPath $marker -Raw -ErrorAction SilentlyContinue).Trim()
        if ($existing -and (Test-Path -LiteralPath $existing)) {
            return $existing
        }
    }
    $path = Join-Path $logsDir ("winclean-{0}.log" -f (Get-Date -Format 'yyyyMMdd_HHmmss'))
    '' | Set-Content -LiteralPath $path -Encoding UTF8
    Set-Content -LiteralPath $marker -Value $path -Encoding UTF8
    return $path
}

function Get-WinCleanProgressPath {
    param([string]$BaseDir = $(Get-WinCleanBaseDir))
    $logsDir = Join-Path $BaseDir 'logs'
    if (-not (Test-Path $logsDir)) { New-Item -ItemType Directory -Path $logsDir -Force | Out-Null }
    Join-Path $logsDir 'job-progress.json'
}

function Write-WinCleanProgressFile {
    param(
        [string]$Path = $Global:WinCleanProgressPath,
        [int]$Percent = 0,
        [string]$Phase = '',
        [string]$Detail = '',
        [bool]$Done = $false,
        [string]$ErrorMessage = $null
    )
    if (-not $Path) { return }
    $obj = [ordered]@{
        percent   = [Math]::Max(0, [Math]::Min(100, [int]$Percent))
        phase     = [string]$Phase
        detail    = [string]$Detail
        done      = [bool]$Done
        error     = $ErrorMessage
        updatedAt = (Get-Date).ToString('o')
    }
    try {
        $json = ($obj | ConvertTo-Json -Compress)
        [System.IO.File]::WriteAllText($Path, $json, [System.Text.UTF8Encoding]::new($false))
    } catch { }
}

function Write-WinCleanProgress {
    param(
        [int]$Percent = 0,
        [string]$Phase = '',
        [string]$Detail = '',
        [bool]$Done = $false,
        [string]$ErrorMessage = $null
    )
    Write-WinCleanProgressFile -Path $Global:WinCleanProgressPath -Percent $Percent -Phase $Phase -Detail $Detail -Done $Done -ErrorMessage $ErrorMessage
}
