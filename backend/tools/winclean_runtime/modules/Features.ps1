# Copyright (c) 2026 Mr-Aurevo-X. All rights reserved.
# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# Author: Mr-Aurevo-X | https://github.com/Mr-Aurevo-X

#Requires -Version 5.1
# Features.ps1 - Optional features + DISM component cleanup (soft)

function Get-WinCleanOptionalFeaturesTargets {
    # Features safe to disable if enabled; skipped if absent
    @(
        'WorkFolders-Client'
        'Printing-XPSServices-Features'
        'MSRDC-Infrastructure'
        'MicrosoftWindowsPowerShellV2Root'
        'MicrosoftWindowsPowerShellV2'
        'LegacyComponents'
        'DirectPlay'
        'WindowsMediaPlayer'
        'MediaPlayback'
        'SMB1Protocol'
        'SMB1Protocol-Client'
        'SMB1Protocol-Server'
        'FaxServicesClientPackage'
        'Microsoft-RemoteDesktopConnection'
    )
}

function Disable-WinCleanOptionalFeatures {
    param([string]$LogPath)

    Write-WinCleanLog -Message '=== Optional Features ===' -LogPath $LogPath

    foreach ($feat in Get-WinCleanOptionalFeaturesTargets) {
        try {
            $f = Get-WindowsOptionalFeature -Online -FeatureName $feat -ErrorAction Stop
            if ($f.State -eq 'Enabled') {
                Write-WinCleanLog -Message "Désactivation feature: $feat ..." -LogPath $LogPath
                Disable-WindowsOptionalFeature -Online -FeatureName $feat -NoRestart -ErrorAction Stop | Out-Null
                Write-WinCleanLog -Message "Feature off: $feat" -LogPath $LogPath -Level OK
            }
            else {
                Write-WinCleanLog -Message "Feature déjà off/absent: $feat ($($f.State))" -LogPath $LogPath -Level SKIP
            }
        }
        catch {
            Write-WinCleanLog -Message "Feature skip $feat : $($_.Exception.Message)" -LogPath $LogPath -Level SKIP
        }
    }
}

function Invoke-WinCleanComponentCleanup {
    param([string]$LogPath)

    Write-WinCleanLog -Message '=== DISM StartComponentCleanup (sans ResetBase) ===' -LogPath $LogPath
    try {
        $psi = New-Object System.Diagnostics.ProcessStartInfo
        $psi.FileName = 'dism.exe'
        $psi.Arguments = '/Online /Cleanup-Image /StartComponentCleanup'
        $psi.RedirectStandardOutput = $true
        $psi.RedirectStandardError = $true
        $psi.UseShellExecute = $false
        $psi.CreateNoWindow = $true
        $p = [System.Diagnostics.Process]::Start($psi)
        $stdout = $p.StandardOutput.ReadToEnd()
        $stderr = $p.StandardError.ReadToEnd()
        $p.WaitForExit()
        if ($stdout) { Write-WinCleanLog -Message $stdout.Trim() -LogPath $LogPath }
        if ($stderr) { Write-WinCleanLog -Message $stderr.Trim() -LogPath $LogPath -Level WARN }
        if ($p.ExitCode -eq 0) {
            Write-WinCleanLog -Message 'DISM StartComponentCleanup OK' -LogPath $LogPath -Level OK
        }
        else {
            Write-WinCleanLog -Message "DISM exit code $($p.ExitCode)" -LogPath $LogPath -Level WARN
        }
    }
    catch {
        Write-WinCleanLog -Message "DISM échec: $($_.Exception.Message)" -LogPath $LogPath -Level ERROR
    }
}

function Invoke-WinCleanAnalyzeComponentStore {
    param([string]$LogPath)

    Write-WinCleanLog -Message '=== DISM AnalyzeComponentStore ===' -LogPath $LogPath
    $summary = @{
        Success      = $false
        Reclaimable  = $null
        Message      = ''
        RawOutput    = ''
    }
    try {
        $psi = New-Object System.Diagnostics.ProcessStartInfo
        $psi.FileName = 'dism.exe'
        $psi.Arguments = '/Online /Cleanup-Image /AnalyzeComponentStore'
        $psi.RedirectStandardOutput = $true
        $psi.RedirectStandardError = $true
        $psi.UseShellExecute = $false
        $psi.CreateNoWindow = $true
        $psi.StandardOutputEncoding = [Text.Encoding]::GetEncoding(850)
        $p = [System.Diagnostics.Process]::Start($psi)
        $stdout = $p.StandardOutput.ReadToEnd()
        $stderr = $p.StandardError.ReadToEnd()
        $p.WaitForExit()
        $summary.RawOutput = $stdout
        if ($stdout) { Write-WinCleanLog -Message $stdout.Trim() -LogPath $LogPath }
        if ($stderr) { Write-WinCleanLog -Message $stderr.Trim() -LogPath $LogPath -Level WARN }

        # Parse reclaimable size lines (EN/FR)
        $reclaim = $null
        foreach ($line in ($stdout -split "`r?`n")) {
            if ($line -match '(?i)(reclaimable|récupérable|recuperable).{0,40}?([\d\.,]+)\s*(MB|GB|Ko|Mo|Go|KB)') {
                $reclaim = $line.Trim()
                break
            }
            if ($line -match '(?i)(Component Store Cleanup|Nettoyage).{0,60}?([\d\.,]+)\s*(MB|GB|Mo|Go)') {
                $reclaim = $line.Trim()
            }
        }

        $summary.Success = ($p.ExitCode -eq 0)
        $summary.Reclaimable = $reclaim
        if ($reclaim) {
            $summary.Message = "WinSxS: $reclaim"
        }
        elseif ($p.ExitCode -eq 0) {
            $summary.Message = 'Analyse WinSxS terminée — voir le journal pour le détail.'
        }
        else {
            $summary.Message = "Analyse WinSxS échouée (code $($p.ExitCode))."
        }
        Write-WinCleanLog -Message $summary.Message -LogPath $LogPath -Level $(if ($summary.Success) { 'OK' } else { 'WARN' })
    }
    catch {
        $summary.Message = "DISM Analyze échec: $($_.Exception.Message)"
        Write-WinCleanLog -Message $summary.Message -LogPath $LogPath -Level ERROR
    }
    return $summary
}

function Invoke-WinCleanExternalTool {
    param(
        [string]$FileName,
        [string]$Arguments,
        [string]$LogPath,
        [string]$Label
    )

    Write-WinCleanLog -Message "=== $Label ===" -LogPath $LogPath
    $result = @{
        Success   = $false
        ExitCode  = -1
        Message   = ''
        RawOutput = ''
    }
    try {
        $psi = New-Object System.Diagnostics.ProcessStartInfo
        $psi.FileName = $FileName
        $psi.Arguments = $Arguments
        $psi.RedirectStandardOutput = $true
        $psi.RedirectStandardError = $true
        $psi.UseShellExecute = $false
        $psi.CreateNoWindow = $true
        try { $psi.StandardOutputEncoding = [Text.Encoding]::GetEncoding(850) } catch { }
        $p = [System.Diagnostics.Process]::Start($psi)
        $stdout = $p.StandardOutput.ReadToEnd()
        $stderr = $p.StandardError.ReadToEnd()
        $p.WaitForExit()
        $result.ExitCode = $p.ExitCode
        $result.RawOutput = $stdout
        if ($stdout) {
            foreach ($line in ($stdout -split "`r?`n")) {
                if ($line.Trim()) { Write-WinCleanLog -Message $line.Trim() -LogPath $LogPath }
            }
        }
        if ($stderr) { Write-WinCleanLog -Message $stderr.Trim() -LogPath $LogPath -Level WARN }
        $result.Success = ($p.ExitCode -eq 0)
        $result.Message = if ($result.Success) { "$Label terminé (OK)." } else { "$Label terminé avec code $($p.ExitCode) — voir le journal." }
        Write-WinCleanLog -Message $result.Message -LogPath $LogPath -Level $(if ($result.Success) { 'OK' } else { 'WARN' })
    }
    catch {
        $result.Message = "$Label échec: $($_.Exception.Message)"
        Write-WinCleanLog -Message $result.Message -LogPath $LogPath -Level ERROR
    }
    return $result
}

function Invoke-WinCleanDismRestoreHealth {
    param([string]$LogPath)
    Invoke-WinCleanExternalTool -FileName 'dism.exe' `
        -Arguments '/Online /Cleanup-Image /RestoreHealth' `
        -LogPath $LogPath `
        -Label 'DISM RestoreHealth'
}

function Invoke-WinCleanSfcScan {
    param([string]$LogPath)
    Invoke-WinCleanExternalTool -FileName 'sfc.exe' `
        -Arguments '/scannow' `
        -LogPath $LogPath `
        -Label 'SFC /scannow'
}

function Invoke-WinCleanFeatures {
    param(
        [bool]$OptionalFeatures = $true,
        [bool]$ComponentCleanup = $true,
        [string]$LogPath
    )

    if ($OptionalFeatures) { Disable-WinCleanOptionalFeatures -LogPath $LogPath }
    if ($ComponentCleanup) { Invoke-WinCleanComponentCleanup -LogPath $LogPath }
}
