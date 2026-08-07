"""CronLocal — Task Scheduler list / enable / create at logon."""
from __future__ import annotations
import ctypes
import re
import subprocess
from pathlib import Path
from typing import Any

_META_RE = re.compile(r'[;&|<>`"$\n\r]')
_ALLOWED_PROG_SUFFIX = {".exe", ".cmd"}


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

def list_tasks() -> dict[str, Any]:
    try:
        script = r"""
$ErrorActionPreference = 'SilentlyContinue'
Get-ScheduledTask | Select-Object TaskName, TaskPath, State,
  @{N='Enabled';E={$_.Settings.Enabled}} |
  Sort-Object TaskPath, TaskName | ConvertTo-Json -Compress -Depth 3
"""
        data = _ps_json(script, timeout=120)
        rows = _normalize_rows(data)
        return {"ok": True, "tasks": rows, "count": len(rows), "admin": is_admin()}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}

def set_task_enabled(task_name: str, task_path: str, enabled: bool) -> dict[str, Any]:
    try:
        tn = (task_name or "").strip().replace("'", "''")
        tp = (task_path or "\\").strip().replace("'", "''")
        if not tn:
            return {"ok": False, "error": "Nom vide"}
        verb = "Enable-ScheduledTask" if enabled else "Disable-ScheduledTask"
        script = f"$ErrorActionPreference='Stop'; try {{ {verb} -TaskName '{tn}' -TaskPath '{tp}' | Out-Null; 'OK' }} catch {{ $_.Exception.Message }}"
        proc = subprocess.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
            capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=60,
            creationflags=subprocess.CREATE_NO_WINDOW if hasattr(subprocess, "CREATE_NO_WINDOW") else 0,
        )
        out = (proc.stdout or "").strip()
        if out != "OK":
            return {"ok": False, "error": out or (proc.stderr or "").strip()}
        return {"ok": True}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}

def create_at_logon(task_name: str, program: str, arguments: str = "") -> dict[str, Any]:
    try:
        tn = (task_name or "").strip()
        prog = (program or "").strip().strip('"')
        args = (arguments or "").strip()
        if not tn or not prog:
            return {"ok": False, "error": "Nom et programme requis"}
        if _META_RE.search(tn) or _META_RE.search(prog) or _META_RE.search(args):
            return {"ok": False, "error": "Metacharacters rejected in name/program/args"}
        p = Path(prog)
        if p.suffix.lower() not in _ALLOWED_PROG_SUFFIX:
            return {"ok": False, "error": "Only existing .exe / .cmd programs allowed"}
        if not p.is_file():
            return {"ok": False, "error": "Program path not found"}
        safe_tn = tn.replace("'", "''")
        safe_prog = str(p.resolve()).replace("'", "''")
        safe_args = args.replace("'", "''")
        script = f"""
$ErrorActionPreference = 'Stop'
try {{
  $action = New-ScheduledTaskAction -Execute '{safe_prog}' -Argument '{safe_args}'
  $trigger = New-ScheduledTaskTrigger -AtLogOn
  $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive
  Register-ScheduledTask -TaskName '{safe_tn}' -Action $action -Trigger $trigger -Principal $principal -Force | Out-Null
  'OK'
}} catch {{ $_.Exception.Message }}
"""
        proc = subprocess.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
            capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=60,
            creationflags=subprocess.CREATE_NO_WINDOW if hasattr(subprocess, "CREATE_NO_WINDOW") else 0,
        )
        out = (proc.stdout or "").strip()
        if out != "OK":
            return {"ok": False, "error": out or (proc.stderr or "").strip()}
        return {"ok": True, "name": tn}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}
