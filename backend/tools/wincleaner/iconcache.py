# Copyright (c) 2026 Mr-Aurevo-X. All rights reserved.
# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# Author: Mr-Aurevo-X | https://github.com/Mr-Aurevo-X

"""IconCache — rebuild Explorer icon cache."""
from __future__ import annotations
import subprocess
from typing import Any

def rebuild_icon_cache() -> dict[str, Any]:
    try:
        script = r"""
$ErrorActionPreference = 'SilentlyContinue'
$log = New-Object System.Collections.Generic.List[string]
function Log($m) { [void]$log.Add($m) }
Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 800
$local = $env:LOCALAPPDATA
$paths = @(
  (Join-Path $local 'IconCache.db'),
  (Join-Path $local 'Microsoft\Windows\Explorer\iconcache_*.db'),
  (Join-Path $local 'Microsoft\Windows\Explorer\thumbcache_*.db')
)
foreach ($pat in $paths) {
  Get-Item $pat -ErrorAction SilentlyContinue | ForEach-Object {
    try { Remove-Item $_.FullName -Force -ErrorAction Stop; Log ("deleted " + $_.FullName) }
    catch { Log ("skip " + $_.FullName + " : " + $_.Exception.Message) }
  }
}
try { & ie4uinit.exe -show 2>$null; Log 'ie4uinit -show' } catch { Log 'ie4uinit skip' }
Start-Process explorer.exe
Log 'explorer restarted'
$log -join "`n"
"""
        proc = subprocess.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
            capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=90,
            creationflags=subprocess.CREATE_NO_WINDOW if hasattr(subprocess, "CREATE_NO_WINDOW") else 0,
        )
        out = ((proc.stdout or "") + "\n" + (proc.stderr or "")).strip()
        return {"ok": True, "output": out}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}
