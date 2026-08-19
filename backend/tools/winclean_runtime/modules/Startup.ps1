# Copyright (c) 2026 Mr-Aurevo-X. All rights reserved.
# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# Author: Mr-Aurevo-X | https://github.com/Mr-Aurevo-X

#Requires -Version 5.1
# Startup.ps1 - Apps au démarrage (Run keys + dossiers Startup)

function Get-WinCleanStartupItems {
    $items = @()

    $runKeys = @(
        @{ Hive = 'HKCU'; Path = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'; Scope = 'User' }
        @{ Hive = 'HKLM'; Path = 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Run'; Scope = 'Machine' }
        @{ Hive = 'HKLM32'; Path = 'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Run'; Scope = 'Machine32' }
    )

    foreach ($rk in $runKeys) {
        if (-not (Test-Path -LiteralPath $rk.Path)) { continue }
        try {
            $props = Get-ItemProperty -LiteralPath $rk.Path -ErrorAction Stop
            foreach ($p in $props.PSObject.Properties) {
                if ($p.Name -in @('PSPath', 'PSParentPath', 'PSChildName', 'PSDrive', 'PSProvider')) { continue }
                $cmd = [string]$p.Value
                if ([string]::IsNullOrWhiteSpace($cmd)) { continue }
                $items += [PSCustomObject]@{
                    Selected = $false
                    Name     = $p.Name
                    Command  = $cmd
                    Source   = "Registry $($rk.Scope)"
                    Kind     = 'Registry'
                    RegPath  = $rk.Path
                    FilePath = $null
                    Enabled  = $true
                }
            }
        }
        catch { }
    }

    $startupDirs = @(
        @{ Path = [Environment]::GetFolderPath('Startup'); Scope = 'UserStartup' }
        @{ Path = Join-Path $env:ProgramData 'Microsoft\Windows\Start Menu\Programs\Startup'; Scope = 'CommonStartup' }
    )

    foreach ($sd in $startupDirs) {
        if (-not $sd.Path -or -not (Test-Path -LiteralPath $sd.Path)) { continue }
        Get-ChildItem -LiteralPath $sd.Path -Force -ErrorAction SilentlyContinue |
            Where-Object { $_.Extension -match '\.(lnk|bat|cmd|vbs|ps1|exe)$' -or $_.Name -like '*.disabled' } |
            ForEach-Object {
                $enabled = -not ($_.Name -like '*.disabled')
                $items += [PSCustomObject]@{
                    Selected = $false
                    Name     = $_.BaseName -replace '\.disabled$', ''
                    Command  = $_.FullName
                    Source   = $sd.Scope
                    Kind     = 'Folder'
                    RegPath  = $null
                    FilePath = $_.FullName
                    Enabled  = $enabled
                }
            }
    }

    return @($items | Sort-Object Source, Name)
}

function Disable-WinCleanStartupItems {
    param(
        [object[]]$Items,
        [string]$LogPath,
        [string]$BaseDir = $Global:WinCleanRoot
    )

    $disabled = 0
    $failed = 0
    $undoLines = @(
        '# Undo WinClean startup disables'
        "# $(Get-Date -Format 'o')"
        ''
    )

    foreach ($item in $Items) {
        if (-not $item.Selected) { continue }
        if (-not $item.Enabled) { continue }

        try {
            if ($item.Kind -eq 'Registry') {
                $val = Get-ItemProperty -LiteralPath $item.RegPath -Name $item.Name -ErrorAction Stop |
                    Select-Object -ExpandProperty $item.Name
                $backupKey = 'HKCU:\Software\WinClean\StartupBackup'
                if (-not (Test-Path $backupKey)) {
                    New-Item -Path $backupKey -Force | Out-Null
                }
                $safeName = ($item.Source + '_' + $item.Name) -replace '[^\w\-]', '_'
                Set-ItemProperty -Path $backupKey -Name $safeName -Value ("{0}|{1}" -f $item.RegPath, $val) -Type String -Force
                Remove-ItemProperty -LiteralPath $item.RegPath -Name $item.Name -ErrorAction Stop
                $undoLines += "Set-ItemProperty -LiteralPath '$($item.RegPath)' -Name '$($item.Name)' -Value '$($val -replace '''', '''''')' -Type String -Force"
                Write-WinCleanLog -Message "Startup registry off: $($item.Name)" -LogPath $LogPath -Level OK
                $disabled++
            }
            elseif ($item.Kind -eq 'Folder' -and $item.FilePath) {
                $src = $item.FilePath
                if ($src -like '*.disabled') { continue }
                $dest = "$src.disabled"
                if (Test-Path -LiteralPath $dest) {
                    $dest = "$src.disabled.$([guid]::NewGuid().ToString('N').Substring(0,6))"
                }
                Rename-Item -LiteralPath $src -NewName (Split-Path $dest -Leaf) -ErrorAction Stop
                $undoLines += "Rename-Item -LiteralPath '$dest' -NewName '$(Split-Path $src -Leaf)' -ErrorAction SilentlyContinue"
                Write-WinCleanLog -Message "Startup file off: $($item.Name) -> $(Split-Path $dest -Leaf)" -LogPath $LogPath -Level OK
                $disabled++
            }
        }
        catch {
            $failed++
            Write-WinCleanLog -Message "Startup fail $($item.Name): $($_.Exception.Message)" -LogPath $LogPath -Level WARN
        }
    }

    if ($disabled -gt 0 -and $BaseDir) {
        $logs = Join-Path $BaseDir 'logs'
        if (-not (Test-Path $logs)) { New-Item -ItemType Directory -Path $logs -Force | Out-Null }
        $undoPath = Join-Path $logs ("undo-startup-{0}.ps1" -f (Get-Date -Format 'yyyyMMdd_HHmmss'))
        $undoLines | Set-Content -LiteralPath $undoPath -Encoding UTF8
        Write-WinCleanLog -Message "Undo startup: $undoPath" -LogPath $LogPath
    }

    return @{ Disabled = $disabled; Failed = $failed }
}
