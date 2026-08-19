# Copyright (c) 2026 Mr-Aurevo-X. All rights reserved.
# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# Author: Mr-Aurevo-X | https://github.com/Mr-Aurevo-X

"""ServiceX — Windows services list / start / stop / restart."""
from __future__ import annotations
import ctypes
import subprocess
from typing import Any

_CRITICAL_SERVICES = frozenset({
    "bfe",
    "cryptsvc",
    "dcomlaunch",
    "dhcp",
    "dnscache",
    "eventlog",
    "gpsvc",
    "keyiso",
    "lanmanserver",
    "lanmanworkstation",
    "mpssvc",
    "plugplay",
    "power",
    "profsvc",
    "rpceptmapper",
    "rpcss",
    "samss",
    "schedule",
    "securityhealthservice",
    "sgrmbroker",
    "trustedinstaller",
    "windefend",
    "winmgmt",
    "wuauserv",
})


def is_critical_service(name: str) -> bool:
    return (name or "").strip().casefold() in _CRITICAL_SERVICES


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


def is_admin() -> bool:
    try:
        return bool(ctypes.windll.shell32.IsUserAnAdmin())
    except Exception:
        return False

def list_services() -> dict[str, Any]:
    try:
        script = r"""
$ErrorActionPreference = 'SilentlyContinue'
Get-Service | Select-Object Name, DisplayName, Status, StartType |
  Sort-Object DisplayName | ConvertTo-Json -Compress -Depth 3
"""
        data = _ps_json(script, timeout=90)
        rows = _normalize_rows(data)
        return {"ok": True, "services": rows, "count": len(rows), "admin": is_admin()}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}

def service_action(name: str, action: str) -> dict[str, Any]:
    try:
        name = (name or "").strip()
        action = (action or "").strip().lower()
        if not name:
            return {"ok": False, "error": "Nom de service vide"}
        if action not in ("start", "stop", "restart"):
            return {"ok": False, "error": "Action invalide"}
        if any(c in name for c in ';|&<>`"'):
            return {"ok": False, "error": "Nom invalide"}
        if action in ("stop", "restart") and is_critical_service(name):
            return {"ok": False, "error": f"Service Windows critique protege: {name}"}
        safe = name.replace("'", "''")
        if action == "start":
            cmd = f"Start-Service -Name '{safe}' -ErrorAction Stop; 'OK'"
        elif action == "stop":
            cmd = f"Stop-Service -Name '{safe}' -Force -ErrorAction Stop; 'OK'"
        else:
            cmd = f"Restart-Service -Name '{safe}' -Force -ErrorAction Stop; 'OK'"
        script = f"$ErrorActionPreference='Stop'; try {{ {cmd} }} catch {{ $_.Exception.Message }}"
        proc = subprocess.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
            capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=60,
            creationflags=subprocess.CREATE_NO_WINDOW if hasattr(subprocess, "CREATE_NO_WINDOW") else 0,
        )
        out = (proc.stdout or "").strip()
        if proc.returncode != 0 or out != "OK":
            return {"ok": False, "error": out or (proc.stderr or "").strip() or "Échec"}
        return {"ok": True, "name": name, "action": action}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}
