# Copyright (c) 2026 Mr-Aurevo-X. All rights reserved.
# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# Author: Mr-Aurevo-X | https://github.com/Mr-Aurevo-X

#Requires -Version 5.1
# Debloat.Policy.ps1 - Pubs, télémétrie douce, tâches, services (listes data-driven)

function Set-WinCleanRegistryDword {
    param(
        [string]$Path,
        [string]$Name,
        [int]$Value,
        [string]$LogPath
    )
    try {
        if (-not (Test-Path -LiteralPath $Path)) {
            New-Item -Path $Path -Force | Out-Null
        }
        New-ItemProperty -LiteralPath $Path -Name $Name -PropertyType DWord -Value $Value -Force | Out-Null
        Write-WinCleanLog -Message "Reg: $Path\$Name = $Value" -LogPath $LogPath -Level OK
        return $true
    }
    catch {
        Write-WinCleanLog -Message "Reg échec $Path\$Name : $($_.Exception.Message)" -LogPath $LogPath -Level WARN
        return $false
    }
}

function Invoke-WinCleanPrivacyTweaks {
    param(
        [string]$BaseDir = $Global:WinCleanRoot,
        [string]$LogPath
    )
    if (-not $BaseDir) { $BaseDir = Get-WinCleanBaseDir }
    Write-WinCleanLog -Message '=== Optimisations confidentialité / pubs ===' -LogPath $LogPath

    $file = Join-Path $BaseDir 'lists\privacy-tweaks.txt'
    $lines = @(Get-Content -LiteralPath $file -Encoding UTF8 -ErrorAction SilentlyContinue |
        ForEach-Object { $_.Trim() } |
        Where-Object { $_ -and $_ -notmatch '^\s*#' })

    foreach ($line in $lines) {
        $parts = $line -split '\|', 3
        if ($parts.Count -lt 3) { continue }
        $regPath = $parts[0].Trim()
        $name = $parts[1].Trim()
        $val = 0
        [void][int]::TryParse($parts[2].Trim(), [ref]$val)
        Set-WinCleanRegistryDword -Path $regPath -Name $name -Value $val -LogPath $LogPath | Out-Null
    }
}

function Disable-WinCleanScheduledTasks {
    param(
        [string]$BaseDir = $Global:WinCleanRoot,
        [string]$LogPath
    )
    if (-not $BaseDir) { $BaseDir = Get-WinCleanBaseDir }

    Write-WinCleanLog -Message '=== Désactivation tâches planifiées bloat ===' -LogPath $LogPath
    $list = Read-WinCleanListFile (Join-Path $BaseDir 'lists\scheduled-tasks.txt')
    $disabled = 0

    foreach ($taskPath in $list) {
        $normalized = $taskPath.TrimEnd('\')
        $name = Split-Path $normalized -Leaf
        $folder = Split-Path $normalized -Parent
        if (-not $folder.EndsWith('\')) { $folder = "$folder\" }

        try {
            $task = Get-ScheduledTask -TaskPath $folder -TaskName $name -ErrorAction Stop
            if ($task.State -ne 'Disabled') {
                Disable-ScheduledTask -TaskPath $folder -TaskName $name -ErrorAction Stop | Out-Null
                Write-WinCleanLog -Message "Tâche désactivée: $taskPath" -LogPath $LogPath -Level OK
                $disabled++
            }
            else {
                Write-WinCleanLog -Message "Déjà off: $taskPath" -LogPath $LogPath -Level SKIP
            }
        }
        catch {
            Write-WinCleanLog -Message "Tâche introuvable/skip: $taskPath" -LogPath $LogPath -Level SKIP
        }
    }

    try {
        $undo = Join-Path $BaseDir ("logs\undo-tasks-{0}.ps1" -f (Get-Date -Format 'yyyyMMdd_HHmmss'))
        $lines = @('# Réactiver les tâches WinClean') + @(
            $list | ForEach-Object {
                $n = Split-Path $_.TrimEnd('\') -Leaf
                $f = Split-Path $_.TrimEnd('\') -Parent
                if (-not $f.EndsWith('\')) { $f = "$f\" }
                "Enable-ScheduledTask -TaskPath '$f' -TaskName '$n' -ErrorAction SilentlyContinue"
            }
        )
        $lines | Set-Content -LiteralPath $undo -Encoding UTF8
        Write-WinCleanLog -Message "Undo tâches: $undo" -LogPath $LogPath
    }
    catch { }

    return $disabled
}

function Disable-WinCleanBloatServices {
    param(
        [string]$BaseDir = $Global:WinCleanRoot,
        [string]$LogPath
    )
    if (-not $BaseDir) { $BaseDir = Get-WinCleanBaseDir }
    Write-WinCleanLog -Message '=== Services non essentiels ===' -LogPath $LogPath

    $services = @(Read-WinCleanListFile (Join-Path $BaseDir 'lists\services.txt'))
    if (-not $services -or $services.Count -eq 0) {
        $services = @('Fax', 'RemoteRegistry', 'WMPNetworkSvc', 'DiagTrack', 'dmwappushservice')
    }

    foreach ($name in $services) {
        try {
            $svc = Get-Service -Name $name -ErrorAction Stop
            if ($svc.StartType -ne 'Disabled') {
                Stop-Service -Name $name -Force -ErrorAction SilentlyContinue
                Set-Service -Name $name -StartupType Disabled -ErrorAction Stop
                Write-WinCleanLog -Message "Service désactivé: $name" -LogPath $LogPath -Level OK
            }
        }
        catch {
            Write-WinCleanLog -Message "Service skip $name : $($_.Exception.Message)" -LogPath $LogPath -Level SKIP
        }
    }
}

function Invoke-WinCleanOptimizations {
    param(
        [bool]$Privacy = $true,
        [bool]$Tasks = $true,
        [bool]$Services = $true,
        [string]$BaseDir = $Global:WinCleanRoot,
        [string]$LogPath
    )
    if (-not $BaseDir) { $BaseDir = Get-WinCleanBaseDir }

    if ($Privacy) { Invoke-WinCleanPrivacyTweaks -BaseDir $BaseDir -LogPath $LogPath }
    if ($Tasks) { Disable-WinCleanScheduledTasks -BaseDir $BaseDir -LogPath $LogPath | Out-Null }
    if ($Services) { Disable-WinCleanBloatServices -BaseDir $BaseDir -LogPath $LogPath }
}
