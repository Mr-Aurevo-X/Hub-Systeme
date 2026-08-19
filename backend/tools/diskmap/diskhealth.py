# Copyright (c) 2026 Mr-Aurevo-X. All rights reserved.
# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# Author: Mr-Aurevo-X | https://github.com/Mr-Aurevo-X

"""DiskHealth logic — Win32_DiskDrive / LogicalDisk via PowerShell."""
from __future__ import annotations

import json
import subprocess
from typing import Any


def _decode_cli(data: bytes | str | None) -> str:
    if data is None:
        return ""
    if isinstance(data, str):
        return data
    if not data:
        return ""
    if data.startswith((b"\xff\xfe", b"\xfe\xff")):
        return data.decode("utf-16", errors="replace")
    if data.startswith(b"\xef\xbb\xbf"):
        return data.decode("utf-8-sig", errors="replace")
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError:
        return data.decode("oem", errors="replace")


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
        timeout=timeout,
        creationflags=subprocess.CREATE_NO_WINDOW if hasattr(subprocess, "CREATE_NO_WINDOW") else 0,
    )
    out = _decode_cli(proc.stdout).strip()
    err = _decode_cli(proc.stderr).strip()
    if proc.returncode != 0 and not out:
        raise RuntimeError(err or f"PowerShell exit {proc.returncode}")
    if not out:
        return None
    try:
        return json.loads(out)
    except json.JSONDecodeError:
        return {"raw": out, "stderr": err, "returncode": proc.returncode}


def get_disk_info() -> dict[str, Any]:
    try:
        script = r"""
$ErrorActionPreference = 'SilentlyContinue'
$drives = @(Get-CimInstance Win32_DiskDrive | Select-Object Model, SerialNumber, Size, Status, MediaType, InterfaceType, Index)
$logical = @(Get-CimInstance Win32_LogicalDisk | Select-Object DeviceID, VolumeName, FileSystem, Size, FreeSpace, DriveType)
@{ drives = $drives; logical = $logical } | ConvertTo-Json -Compress -Depth 4
"""
        data = _ps_json(script, timeout=60)
        if not isinstance(data, dict):
            data = {"drives": [], "logical": []}
        drives = data.get("drives") or []
        logical = data.get("logical") or []
        if isinstance(drives, dict):
            drives = [drives]
        if isinstance(logical, dict):
            logical = [logical]
        return {"ok": True, "drives": drives, "logical": logical}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}
