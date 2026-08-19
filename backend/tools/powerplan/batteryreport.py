# Copyright (c) 2026 Mr-Aurevo-X. All rights reserved.
# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# Author: Mr-Aurevo-X | https://github.com/Mr-Aurevo-X

"""BatteryReport — battery info + powercfg report."""
from __future__ import annotations
import os
import subprocess
import tempfile
from datetime import datetime
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


_BATTERY_STATUS = {
    1: ("Other", "Autre"),
    2: ("Unknown", "Inconnu"),
    3: ("Fully Charged", "Chargé"),
    4: ("Low", "Faible"),
    5: ("Critical", "Critique"),
    6: ("Charging", "En charge"),
    7: ("Charging and High", "Charge élevée"),
    8: ("Charging and Low", "Charge faible"),
    9: ("Charging and Critical", "Charge critique"),
    10: ("Undefined", "Indéfini"),
    11: ("Partially Charged", "Partiellement chargé"),
}

def get_battery_info() -> dict[str, Any]:
    try:
        script = r"""
$ErrorActionPreference = 'SilentlyContinue'
$bats = Get-CimInstance Win32_Battery
if (-not $bats) {
  @{ hasBattery = $false; batteries = @() } | ConvertTo-Json -Compress
  exit 0
}
$rows = @()
foreach ($b in $bats) {
  $rows += [pscustomobject]@{
    name = [string]$b.Name
    chargePercent = if ($null -ne $b.EstimatedChargeRemaining) { [int]$b.EstimatedChargeRemaining } else { $null }
    batteryStatus = if ($null -ne $b.BatteryStatus) { [int]$b.BatteryStatus } else { $null }
    status = [string]$b.Status
    designCapacity = if ($null -ne $b.DesignCapacity) { [int]$b.DesignCapacity } else { $null }
    fullChargeCapacity = if ($null -ne $b.FullChargeCapacity) { [int]$b.FullChargeCapacity } else { $null }
  }
}
@{ hasBattery = $true; batteries = $rows } | ConvertTo-Json -Compress -Depth 4
"""
        data = _ps_json(script)
        if not isinstance(data, dict):
            return {"ok": True, "hasBattery": False, "batteries": []}
        batteries = data.get("batteries") or []
        if isinstance(batteries, dict):
            batteries = [batteries]
        enriched = []
        for b in batteries:
            code = b.get("batteryStatus")
            labels = _BATTERY_STATUS.get(int(code) if code is not None else -1, ("Unknown", "Inconnu"))
            enriched.append({**b, "statusLabelEn": labels[0], "statusLabelFr": labels[1]})
        return {
            "ok": True,
            "hasBattery": bool(data.get("hasBattery")) and len(enriched) > 0,
            "batteries": enriched,
        }
    except Exception as exc:
        return {"ok": False, "error": str(exc), "hasBattery": False, "batteries": []}

def generate_battery_report() -> dict[str, Any]:
    try:
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        out_path = Path(tempfile.gettempdir()) / f"battery-report-{stamp}.html"
        proc = subprocess.run(
            ["powercfg", "/batteryreport", "/output", str(out_path)],
            capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=120,
            creationflags=subprocess.CREATE_NO_WINDOW if hasattr(subprocess, "CREATE_NO_WINDOW") else 0,
        )
        if proc.returncode != 0 and not out_path.is_file():
            err = (proc.stderr or proc.stdout or "").strip()
            return {"ok": False, "error": err or f"powercfg exit {proc.returncode}"}
        if not out_path.is_file():
            return {"ok": False, "error": "Rapport non généré"}
        return {"ok": True, "path": str(out_path.resolve()), "folder": str(out_path.parent.resolve())}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}

def open_folder(path: str) -> dict[str, Any]:
    try:
        p = Path(path or "")
        folder = p.parent if p.suffix else p
        if not folder.is_dir():
            return {"ok": False, "error": "Dossier introuvable"}
        os.startfile(str(folder.resolve()))
        return {"ok": True, "folder": str(folder.resolve())}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}
