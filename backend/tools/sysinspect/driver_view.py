# Copyright (c) 2026 Mr-Aurevo-X. All rights reserved.
# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# Author: Mr-Aurevo-X | https://github.com/Mr-Aurevo-X

"""DriverView logic — PnP signed drivers via WMI/CIM."""
from __future__ import annotations

import json
import subprocess
from typing import Any


def _ps_json(script: str, timeout: int = 60) -> Any:
    cmd = [
        "powershell",
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        script,
    ]
    proc = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout,
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


def list_drivers() -> dict[str, Any]:
    try:
        script = r"""
$ErrorActionPreference = 'SilentlyContinue'
Get-CimInstance Win32_PnPSignedDriver |
  Select-Object DeviceName, DriverVersion, DriverDate, Manufacturer, IsSigned, InfName |
  Sort-Object DeviceName | Select-Object -First 1000 |
  ConvertTo-Json -Compress -Depth 3
"""
        data = _ps_json(script, timeout=120)
        if data is None:
            rows: list[Any] = []
        elif isinstance(data, dict):
            rows = [data]
        else:
            rows = list(data)
        return {"ok": True, "drivers": rows, "count": len(rows)}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}
