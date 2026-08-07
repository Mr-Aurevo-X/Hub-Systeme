"""RecycleBin — list / empty Windows Recycle Bin."""
from __future__ import annotations
import ctypes
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


def list_recycle_bin() -> dict[str, Any]:
    try:
        script = r"""
$ErrorActionPreference = 'Stop'
$shell = New-Object -ComObject Shell.Application
$ns = $shell.NameSpace(0x0a)
if (-not $ns) { @() | ConvertTo-Json -Compress; exit 0 }
$items = @()
foreach ($it in $ns.Items()) {
  $size = 0
  try { $size = [int64]$it.Size } catch { $size = 0 }
  $items += [pscustomobject]@{
    name = [string]$it.Name
    path = [string]$it.Path
    size = $size
    type = [string]$it.Type
    modifyDate = [string]$it.ModifyDate
  }
}
$items | ConvertTo-Json -Compress -Depth 4
"""
        data = _ps_json(script)
        rows = _normalize_rows(data)
        total = 0
        for row in rows:
            try:
                total += int(row.get("size") or 0)
            except (TypeError, ValueError):
                pass
        return {"ok": True, "items": rows, "count": len(rows), "totalBytes": total}
    except Exception as exc:
        return {"ok": False, "error": str(exc), "items": [], "count": 0}

def empty_recycle_bin() -> dict[str, Any]:
    try:
        flags = 0x1 | 0x2 | 0x4
        rc = ctypes.windll.shell32.SHEmptyRecycleBinW(None, None, flags)
        if int(rc) not in (0, 1):
            return {"ok": False, "error": f"SHEmptyRecycleBin HRESULT=0x{int(rc) & 0xFFFFFFFF:08X}"}
        return {"ok": True, "hresult": int(rc)}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}
