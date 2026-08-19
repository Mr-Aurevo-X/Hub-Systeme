# Copyright (c) 2026 Mr-Aurevo-X. All rights reserved.
# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# Author: Mr-Aurevo-X | https://github.com/Mr-Aurevo-X

#Requires -Version 5.1
<#
.SYNOPSIS
  Lanceur WinCleaner (UI WebView). GUI WinForms archivée: legacy\WinClean.Legacy.ps1
#>
[CmdletBinding()]
param([switch]$NoElevate, [switch]$Legacy)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $Root) { $Root = $PSScriptRoot }

if ($Legacy) {
    $legacy = Join-Path $Root 'legacy\WinClean.Legacy.ps1'
    if (-not (Test-Path -LiteralPath $legacy)) {
        Write-Error "Legacy introuvable: $legacy"
        exit 1
    }
    & $legacy -NoElevate:$NoElevate
    exit $LASTEXITCODE
}

$exe = Join-Path $Root 'WinClean.exe'
$hostPy = Join-Path $Root 'host\winclean_host.py'

if (Test-Path -LiteralPath $exe) {
    $args = @()
    if ($NoElevate) { $args += '--no-elevate' }
    Start-Process -FilePath $exe -ArgumentList $args -WorkingDirectory $Root
    exit 0
}

if (Test-Path -LiteralPath $hostPy) {
    $pyArgs = @($hostPy)
    if ($NoElevate) { $pyArgs += '--no-elevate' }
    Start-Process -FilePath 'python' -ArgumentList $pyArgs -WorkingDirectory $Root
    exit 0
}

Write-Error "Ni WinClean.exe ni host\winclean_host.py trouvés dans $Root"
