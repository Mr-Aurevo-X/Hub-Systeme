# Copyright (c) 2026 Mr-Aurevo-X. All rights reserved.
# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# Author: Mr-Aurevo-X | https://github.com/Mr-Aurevo-X

#Requires -Version 5.1
# Elevate.ps1 - Relance le script en admin si nécessaire

function Test-WinCleanAdmin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($id)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Request-WinCleanAdmin {
    param(
        [Parameter(Mandatory)]
        [string]$ScriptPath,
        [string[]]$Arguments = @()
    )

    if (Test-WinCleanAdmin) { return $true }

    $argList = @(
        '-NoProfile'
        '-ExecutionPolicy', 'Bypass'
        '-WindowStyle', 'Hidden'
        '-File', "`"$ScriptPath`""
    ) + $Arguments

    try {
        Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList $argList -WorkingDirectory (Split-Path $ScriptPath -Parent) -WindowStyle Hidden | Out-Null
        return $false  # caller should exit; elevated instance continues
    }
    catch {
        throw "Elevation UAC refusee ou echouee: $_"
    }
}
