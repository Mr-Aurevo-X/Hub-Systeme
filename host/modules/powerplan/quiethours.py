"""QuietHours — Focus Assist / Quiet Hours."""
from __future__ import annotations
import subprocess
from pathlib import Path
from typing import Any

def _ps_json(script: str, timeout: int = 90):
    import json, subprocess
    proc = subprocess.run(
        ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
        capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=timeout,
        creationflags=subprocess.CREATE_NO_WINDOW if hasattr(subprocess, "CREATE_NO_WINDOW") else 0,
    )
    out = (proc.stdout or "").strip()
    err = (proc.stderr or "").strip()
    if proc.returncode != 0 and not out:
        raise RuntimeError(err or f"PowerShell exit {proc.returncode}")
    if not out:
        return None
    try:
        return json.loads(out)
    except json.JSONDecodeError:
        return {"raw": out, "stderr": err, "returncode": proc.returncode}

def _normalize_rows(data):
    if data is None:
        return []
    if isinstance(data, dict):
        return [data]
    return list(data)

def _run_cmd_text(args, timeout=120):
    import subprocess
    proc = subprocess.run(
        args, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=timeout,
        creationflags=subprocess.CREATE_NO_WINDOW if hasattr(subprocess, "CREATE_NO_WINDOW") else 0,
    )
    out = (proc.stdout or "") + (proc.stderr or "")
    return out.strip(), int(proc.returncode)


def get_focus_assist_state() -> dict[str, Any]:
    try:
        script = r"""
$ErrorActionPreference = 'SilentlyContinue'
function Read-CloudStoreMode {
  $key = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\CloudStore\Store\Cache\DefaultAccount\$$windows.data.notifications.quietmoment\Current'
  try {
    $bytes = (Get-ItemProperty -Path $key -Name Data -ErrorAction Stop).Data
    if ($bytes -and $bytes.Length -gt 18) { return [int]$bytes[18] }
  } catch {}
  return $null
}
$mode = Read-CloudStoreMode
$source = 'cloudstore'
if ($null -eq $mode) {
  $alt = Get-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Notifications\Settings' -ErrorAction SilentlyContinue
  if ($alt -and $null -ne $alt.NOC_GLOBAL_SETTING_ALLOW_CRITICAL_TOasts) {
    $source = 'notifications'
    $mode = if ($alt.NOC_GLOBAL_SETTING_ALLOW_CRITICAL_TOasts -eq 0) { 1 } else { 0 }
  }
}
$canToggle = $false
$togglePath = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\CloudStore\Store\Cache\DefaultAccount\$$windows.data.notifications.quietmoment\Current'
if (Test-Path $togglePath) { $canToggle = $true }
$modeNames = @{0='off';1='priority';2='alarms'}
[pscustomobject]@{
  mode = $mode
  modeName = if ($null -ne $mode -and $modeNames.ContainsKey($mode)) { $modeNames[$mode] } else { 'unknown' }
  source = $source
  canToggle = $canToggle
  quietHoursKey = (Test-Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Notifications\QuietHours')
} | ConvertTo-Json -Compress
"""
        data = _ps_json(script) or {}
        mode = data.get("mode")
        return {
            "ok": True,
            "mode": mode if mode is not None else -1,
            "modeName": str(data.get("modeName") or "unknown"),
            "source": str(data.get("source") or ""),
            "canToggle": bool(data.get("canToggle")),
            "quietHoursKey": bool(data.get("quietHoursKey")),
        }
    except Exception as exc:
        return {"ok": False, "error": str(exc)}

def set_focus_assist(mode: int) -> dict[str, Any]:
    try:
        mode_int = int(mode)
        if mode_int not in (0, 1, 2):
            return {"ok": False, "error": "Mode invalide (0=off, 1=priority, 2=alarms)"}
        script = rf"""
$ErrorActionPreference = 'Stop'
$key = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\CloudStore\Store\Cache\DefaultAccount\$$windows.data.notifications.quietmoment\Current'
if (-not (Test-Path $key)) {{ throw 'CloudStore quietmoment key not found — OS may block registry toggle.' }}
$prop = Get-ItemProperty -Path $key -Name Data
$bytes = [byte[]]@($prop.Data)
if ($bytes.Length -le 18) {{ throw 'CloudStore blob too short to patch.' }}
$bytes[18] = [byte]{mode_int}
Set-ItemProperty -Path $key -Name Data -Value $bytes -Type Binary
$newMode = [int]$bytes[18]
@{{ ok = $true; mode = $newMode }} | ConvertTo-Json -Compress
"""
        data = _ps_json(script)
        if isinstance(data, dict) and data.get("ok"):
            return {"ok": True, "mode": int(data.get("mode", mode_int)), "blocked": False}
        return {"ok": False, "error": "Échec écriture registre — utilisez Paramètres Windows", "blocked": True}
    except Exception as exc:
        return {"ok": False, "error": str(exc), "blocked": True}

def open_focus_assist_settings() -> dict[str, Any]:
    try:
        subprocess.Popen(
            ["cmd", "/c", "start", "", "ms-settings:quiethours"],
            creationflags=subprocess.CREATE_NO_WINDOW if hasattr(subprocess, "CREATE_NO_WINDOW") else 0,
        )
        return {"ok": True}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}
