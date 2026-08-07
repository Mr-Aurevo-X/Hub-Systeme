"""RecentFiles — Windows Recent .lnk list / clear (complements Traces)."""
from __future__ import annotations
import os
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


def recent_dir() -> Path:
    appdata = os.environ.get("APPDATA") or str(Path.home() / "AppData" / "Roaming")
    return Path(appdata) / "Microsoft" / "Windows" / "Recent"

def list_recent_files() -> dict[str, Any]:
    try:
        rd = recent_dir()
        script = rf"""
$ErrorActionPreference = 'Stop'
$dir = '{str(rd).replace("'", "''")}'
if (-not (Test-Path -LiteralPath $dir)) {{ @() | ConvertTo-Json -Compress; exit 0 }}
$sh = New-Object -ComObject WScript.Shell
$items = @()
Get-ChildItem -LiteralPath $dir -Filter '*.lnk' -File | Sort-Object LastWriteTime -Descending | ForEach-Object {{
  $target = ''
  try {{ $target = [string]$sh.CreateShortcut($_.FullName).TargetPath }} catch {{ $target = '' }}
  $items += [pscustomobject]@{{
    name = [string]$_.Name
    lnkPath = [string]$_.FullName
    target = $target
    modified = $_.LastWriteTime.ToString('o')
  }}
}}
$items | ConvertTo-Json -Compress -Depth 4
"""
        data = _ps_json(script)
        rows = _normalize_rows(data)
        return {"ok": True, "items": rows, "count": len(rows), "recentDir": str(rd)}
    except Exception as exc:
        return {"ok": False, "error": str(exc), "items": [], "count": 0}

def open_target(path: str) -> dict[str, Any]:
    try:
        from security import safe_open_path

        safe, err = safe_open_path(path, deny_exec=True)
        if safe is None:
            return {"ok": False, "error": err or "Chemin refuse"}
        os.startfile(str(safe))  # type: ignore[attr-defined]
        return {"ok": True}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}

def clear_recent() -> dict[str, Any]:
    try:
        rd = recent_dir()
        deleted = 0
        if rd.is_dir():
            for lnk in rd.glob("*.lnk"):
                try:
                    lnk.unlink()
                    deleted += 1
                except OSError:
                    pass
        return {"ok": True, "deleted": deleted}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}
