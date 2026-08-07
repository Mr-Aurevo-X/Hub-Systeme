"""EventPeek logic — recent error events from Windows logs."""
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


def recent_errors(count: int = 50, log_name: str = "System") -> dict[str, Any]:
    try:
        count = max(1, min(int(count or 50), 200))
        log = (log_name or "System").strip()
        if log not in ("System", "Application", "Security"):
            log = "System"
        script = f"""
$ErrorActionPreference = 'SilentlyContinue'
Get-WinEvent -LogName '{log}' -MaxEvents {count} -ErrorAction SilentlyContinue |
  Where-Object {{ $_.LevelDisplayName -match 'Error|Critique|Critical|Erreur' -or $_.Level -le 2 }} |
  Select-Object TimeCreated, Id, ProviderName, LevelDisplayName, Message |
  Select-Object -First {count} | ConvertTo-Json -Compress -Depth 3
"""
        data = _ps_json(script, timeout=90)
        if data is None:
            rows: list[Any] = []
        elif isinstance(data, dict):
            rows = [data]
        else:
            rows = list(data)
        for r in rows:
            msg = str(r.get("Message") or "")
            if len(msg) > 240:
                r["Message"] = msg[:240] + "…"
        return {"ok": True, "events": rows, "count": len(rows), "log": log}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}
