# Copyright (c) 2026 Mr-Aurevo-X. All rights reserved.
# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# Author: Mr-Aurevo-X | https://github.com/Mr-Aurevo-X

"""Hub-Systeme namespace APIs — Couche B H4 (in-process)."""
from __future__ import annotations

import ctypes

import json
import os
import re
import shutil
import string
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

import psutil

_BACKEND = Path(__file__).resolve().parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from security import (  # noqa: E402
    ConfirmGate,
    is_probably_user_data_path,
    parse_uninstall_command,
    safe_open_path,
    safe_resolve_under,
)
from suite_launch import launch_suite_app, resolve_suite_accent, resolve_suite_language  # noqa: E402
from window_chrome import WindowChromeMixin  # noqa: E402
import hub_update  # noqa: E402

from tools.sysinspect import driver_view as mod_drivers  # noqa: E402
from tools.sysinspect import event_peek as mod_events  # noqa: E402
from tools.uninstx import service_src as mod_uninst  # noqa: E402
from tools.processguard import servicex as mod_svc  # noqa: E402
from tools.startupx import cronlocal as mod_cron  # noqa: E402
from tools.powerplan import batteryreport as mod_batt  # noqa: E402
from tools.powerplan import quiethours as mod_quiet  # noqa: E402
from tools.wincleaner import iconcache as mod_iconcache  # noqa: E402
from tools.wincleaner import recentfiles as mod_recent  # noqa: E402
from tools.wincleaner import recyclebin as mod_recycle  # noqa: E402
from tools.wincleaner.host_api import WinCleanerHostApi  # noqa: E402
from tools.diskmap import bigfiles as mod_bigfiles  # noqa: E402
from tools.diskmap import duplicates as mod_duplicates  # noqa: E402
from tools.diskmap import emptyfolders as mod_empty  # noqa: E402
from tools.diskmap.host_api import DiskMapHostApi  # noqa: E402
from tools.ramcleaner import RamCleanerApi  # noqa: E402

_PROTECTED_PIDS = frozenset({0, 4})
_PROTECTED_NAMES = frozenset(
    {
        "system",
        "smss.exe",
        "csrss.exe",
        "wininit.exe",
        "winlogon.exe",
        "services.exe",
        "lsass.exe",
        "svchost.exe",
        "lsm.exe",
        "fontdrvhost.exe",
        "dwm.exe",
        "memory compression",
        "registry",
        "secure system",
    }
)

_CREATE_NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)


def _ps_json(script: str, timeout: int = 60) -> Any:
    proc = subprocess.run(
        ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout,
        creationflags=_CREATE_NO_WINDOW,
    )
    out = (proc.stdout or "").strip()
    if not out:
        return None
    try:
        return json.loads(out)
    except json.JSONDecodeError:
        return {"raw": out, "returncode": proc.returncode}


def _is_admin() -> bool:
    try:
        import ctypes

        return bool(ctypes.windll.shell32.IsUserAnAdmin())
    except Exception:
        return False


def _fmt_bytes(n: int) -> str:
    size = float(n)
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if size < 1024 or unit == "TB":
            return f"{size:.1f} {unit}" if unit != "B" else f"{int(size)} B"
        size /= 1024
    return f"{n} B"


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


class _GateMixin:
    def __init__(self, gate: ConfirmGate) -> None:
        self._confirm = gate

    def prepare_action(self, action: str, payload: dict | None = None) -> dict:
        act = str(action or "").strip()
        if act not in getattr(self, "ACTIONS", ()):
            return {"ok": False, "error": f"action inconnue: {act}", "token": None}
        try:
            return {"ok": True, "token": self._confirm.prepare(act, payload or {})}
        except ValueError as exc:
            return {"ok": False, "error": str(exc), "token": None}

    def _consume(self, action: str, payload: dict | None, token: str | None) -> dict | None:
        if not self._confirm.consume(str(token or ""), action, payload or {}):
            return {"ok": False, "error": "Jeton de confirmation invalide ou expire"}
        return None


# ── SysInspect ───────────────────────────────────────────────────────────────


class SysInspectApi:
    def recent_errors(self, count: int = 50, log_name: str = "System") -> dict:
        return mod_events.recent_errors(count, log_name)

    def list_drivers(self) -> dict:
        return mod_drivers.list_drivers()

    def open_dedicated(self) -> dict:
        return launch_suite_app("SysInspect")


# ── UninstX ──────────────────────────────────────────────────────────────────


class UninstXApi(_GateMixin):
    ACTIONS = ("uninstall_app",)

    def __init__(self, gate: ConfirmGate) -> None:
        super().__init__(gate)
        self._catalog: dict[str, str] = {}

    def list_apps(self, query: str = "") -> dict:
        try:
            apps = mod_uninst._collect_apps()
            catalog: dict[str, str] = {}
            for a in apps:
                aid = str(a.get("id") or "")
                uninstall = str(a.get("uninstall") or "")
                if aid and uninstall:
                    catalog[aid] = uninstall
            self._catalog = catalog
            q = (query or "").strip().lower()
            if q:
                apps = [
                    a
                    for a in apps
                    if q in a["name"].lower()
                    or q in a["publisher"].lower()
                    or q in a["version"].lower()
                ]
            return {"ok": True, "apps": apps, "count": len(apps)}
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "error": str(exc)}

    @staticmethod
    def _uninstall_payload(app_id: str) -> dict[str, str]:
        return {"app_id": str(app_id or "").strip()}

    def prepare_uninstall_app(self, app_id: str) -> dict:
        key = (app_id or "").strip()
        if not key:
            return {"ok": False, "error": "app_id requis", "token": None}
        if key not in self._catalog:
            return {"ok": False, "error": "app_id inconnu — rafraichir la liste", "token": None}
        try:
            return {
                "ok": True,
                "token": self._confirm.prepare("uninstall_app", self._uninstall_payload(key)),
                "error": None,
            }
        except ValueError as exc:
            return {"ok": False, "error": str(exc), "token": None}

    def prepare_action(self, action: str, payload: dict | None = None) -> dict:
        act = str(action or "").strip()
        pl = payload or {}
        if act == "uninstall_app":
            return self.prepare_uninstall_app(str(pl.get("app_id") or ""))
        return super().prepare_action(action, payload)

    def uninstall_app(self, app_id: str, token: str | None = None) -> dict:
        key = (app_id or "").strip()
        if not key:
            return {"ok": False, "error": "app_id requis"}
        payload = self._uninstall_payload(key)
        denied = self._consume("uninstall_app", payload, token)
        if denied is not None:
            return denied
        cmd = self._catalog.get(key)
        if cmd is None:
            return {"ok": False, "error": "app_id inconnu — rafraichir la liste"}
        argv, err = parse_uninstall_command(cmd)
        if not argv:
            return {"ok": False, "error": err or "Commande de desinstallation refusee"}
        try:
            subprocess.Popen(
                argv,
                shell=False,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            return {"ok": True, "started": True}
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "error": str(exc)}

    def scan_leftovers(self, app_name: str, install_location: str = "") -> dict:
        name = (app_name or "").strip()
        if not name:
            return {"ok": False, "error": "Nom vide"}
        tokens = mod_uninst._leftover_tokens(name)
        if not tokens:
            return {"ok": True, "paths": []}
        found: list[str] = []
        for root in mod_uninst._leftover_roots():
            if not root.is_dir():
                continue
            try:
                for child in root.iterdir():
                    if not child.is_dir():
                        continue
                    child_lower = child.name.lower()
                    if any(kw in child_lower for kw in tokens):
                        found.append(str(child))
            except (PermissionError, OSError):
                continue
        if install_location:
            loc = Path(install_location)
            if loc.exists():
                found.append(str(loc))
        seen: set[str] = set()
        deduped: list[str] = []
        for p in found:
            key = p.lower()
            if key not in seen:
                seen.add(key)
                deduped.append(p)
        return {"ok": True, "paths": deduped}

    def open_folder(self, path: str) -> dict:
        try:
            resolved = safe_resolve_under(path)
            if resolved is None or not is_probably_user_data_path(resolved):
                return {"ok": False, "error": "Chemin invalide"}
            target = resolved.parent if resolved.is_file() else resolved
            if not target.exists():
                return {"ok": False, "error": "Chemin introuvable"}
            os.startfile(str(target))  # type: ignore[attr-defined]
            return {"ok": True}
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "error": str(exc)}

    def open_dedicated(self) -> dict:
        return launch_suite_app("UninstX")


# ── ProcessHub ───────────────────────────────────────────────────────────────


class ProcessHubApi(_GateMixin):
    ACTIONS = (
        "kill_process",
        "empty_working_set",
        "service_action",
        "set_task_enabled",
        "create_at_logon",
        "toggle_startup_item",
    )

    def __init__(self, gate: ConfirmGate) -> None:
        super().__init__(gate)

    def get_suite_accent(self) -> dict:
        return {"ok": True, "accent": resolve_suite_accent()}

    def get_suite_settings(self) -> dict:
        return {
            "ok": True,
            "accent": resolve_suite_accent(),
            "language": resolve_suite_language(),
        }

    def get_suite_language(self) -> dict:
        return {"ok": True, "language": resolve_suite_language()}

    @staticmethod
    def _is_protected_process(pid: int, name: str) -> bool:
        if pid in _PROTECTED_PIDS:
            return True
        base = (name or "").strip().lower()
        if base in _PROTECTED_NAMES:
            return True
        stem = base[:-4] if base.endswith(".exe") else base
        for n in _PROTECTED_NAMES:
            nstem = n[:-4] if n.endswith(".exe") else n
            if stem == nstem:
                return True
        return False

    def get_memory_totals(self) -> dict:
        script = r"""
$ErrorActionPreference = 'Stop'
$os = Get-CimInstance Win32_OperatingSystem
$total = [int64]$os.TotalVisibleMemorySize * 1024
$free = [int64]$os.FreePhysicalMemory * 1024
$used = $total - $free
[pscustomobject]@{
  totalBytes = $total
  freeBytes = $free
  usedBytes = $used
  percentUsed = if ($total -gt 0) { [math]::Round(100.0 * $used / $total, 1) } else { 0 }
} | ConvertTo-Json -Compress
"""
        try:
            proc = subprocess.run(
                ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
                capture_output=True,
                timeout=30,
                creationflags=_CREATE_NO_WINDOW,
            )
            if proc.returncode != 0:
                raise RuntimeError(_decode_cli(proc.stderr) or "Get-CimInstance failed")
            data = json.loads(proc.stdout or "{}")
            if not isinstance(data, dict):
                raise RuntimeError("Données mémoire invalides")
            return {"ok": True, **data}
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "error": str(exc)}

    def list_processes(self) -> dict:
        rows: list[dict[str, Any]] = []
        for proc in psutil.process_iter(["pid", "name"]):
            try:
                proc.cpu_percent(interval=None)
            except (psutil.Error, AttributeError):
                pass
        time.sleep(0.15)
        for proc in psutil.process_iter(
            ["pid", "name", "memory_info", "exe", "username", "status"]
        ):
            try:
                info = proc.info
                mem = info.get("memory_info")
                rss = int(mem.rss) if mem else 0
                rows.append(
                    {
                        "pid": info.get("pid"),
                        "name": info.get("name") or "?",
                        "cpu": round(float(proc.cpu_percent(interval=None) or 0), 1),
                        "memMb": round(rss / (1024 * 1024), 1),
                        "path": info.get("exe") or "",
                        "user": info.get("username") or "",
                        "status": info.get("status") or "",
                    }
                )
            except (psutil.Error, TypeError, ValueError):
                continue
        rows.sort(key=lambda r: (-r["cpu"], -r["memMb"], (r["name"] or "").lower()))
        return {"ok": True, "processes": rows, "count": len(rows)}

    def prepare_kill(self, pid: int) -> dict:
        try:
            pid_i = int(pid)
        except (TypeError, ValueError):
            return {"ok": False, "error": "PID invalide", "token": None}
        try:
            return {"ok": True, "token": self._confirm.prepare("kill_process", {"pid": pid_i})}
        except ValueError as exc:
            return {"ok": False, "error": str(exc), "token": None}

    def kill_process(self, pid: int, token: str | None = None) -> dict:
        try:
            pid_i = int(pid)
            if pid_i <= 0:
                return {"ok": False, "error": "PID invalide"}
            if pid_i == os.getpid():
                return {"ok": False, "error": "Impossible de tuer le hub"}
            payload = {"pid": pid_i}
            denied = self._consume("kill_process", payload, token)
            if denied is not None:
                return denied
            p = psutil.Process(pid_i)
            name = p.name()
            if self._is_protected_process(pid_i, name):
                return {"ok": False, "error": f"Processus protege: {name} (PID {pid_i})"}
            p.terminate()
            try:
                p.wait(timeout=2)
            except psutil.TimeoutExpired:
                p.kill()
            return {"ok": True, "pid": pid_i, "name": name}
        except psutil.Error as exc:
            return {"ok": False, "error": str(exc)}

    def prepare_empty_working_set(self, pid: int) -> dict:
        try:
            pid_i = int(pid)
        except (TypeError, ValueError):
            return {"ok": False, "error": "PID invalide", "token": None}
        try:
            return {
                "ok": True,
                "token": self._confirm.prepare("empty_working_set", {"pid": pid_i}),
            }
        except ValueError as exc:
            return {"ok": False, "error": str(exc), "token": None}

    def empty_working_set(self, pid: int, token: str | None = None) -> dict:
        try:
            import ctypes

            pid_i = int(pid)
            if pid_i <= 0:
                return {"ok": False, "error": "PID invalide"}
            if pid_i == os.getpid():
                return {"ok": False, "error": "Impossible de vider le hub"}
            payload = {"pid": pid_i}
            denied = self._consume("empty_working_set", payload, token)
            if denied is not None:
                return denied
            process = psutil.Process(pid_i)
            name = process.name()
            if self._is_protected_process(pid_i, name):
                return {"ok": False, "error": f"Processus protege: {name} (PID {pid_i})"}
            handle = process._proc_handle  # noqa: SLF001
            ok = bool(ctypes.windll.psapi.EmptyWorkingSet(handle))
            if not ok:
                raise ctypes.WinError()
            return {"ok": True, "pid": pid_i, "name": name}
        except (psutil.Error, OSError) as exc:
            return {"ok": False, "error": str(exc)}

    def list_services(self) -> dict:
        return mod_svc.list_services()

    def prepare_service_action(self, name: str, action: str) -> dict:
        service = str(name or "").strip()
        act = str(action or "").strip().lower()
        if act not in ("start", "stop", "restart"):
            return {"ok": False, "error": "Confirmation non requise", "token": None}
        if mod_svc.is_critical_service(service):
            return {
                "ok": False,
                "error": f"Service Windows critique protege: {service}",
                "token": None,
            }
        payload = {"name": service, "action": act}
        try:
            return {"ok": True, "token": self._confirm.prepare("service_action", payload)}
        except ValueError as exc:
            return {"ok": False, "error": str(exc), "token": None}

    def service_action(self, name: str, action: str, token: str | None = None) -> dict:
        service = str(name or "").strip()
        act = str(action or "").strip().lower()
        if act not in ("start", "stop", "restart"):
            return {"ok": False, "error": "Action invalide"}
        if mod_svc.is_critical_service(service):
            return {"ok": False, "error": f"Service Windows critique protege: {service}"}
        payload = {"name": service, "action": act}
        denied = self._consume("service_action", payload, token)
        if denied is not None:
            return denied
        return mod_svc.service_action(name, action)

    def list_tasks(self) -> dict:
        return mod_cron.list_tasks()

    def prepare_set_task_enabled(
        self, task_name: str, task_path: str, enabled: bool
    ) -> dict:
        payload = {
            "task_name": str(task_name or "").strip(),
            "task_path": str(task_path or "").strip(),
            "enabled": bool(enabled),
        }
        try:
            return {"ok": True, "token": self._confirm.prepare("set_task_enabled", payload)}
        except ValueError as exc:
            return {"ok": False, "error": str(exc), "token": None}

    def set_task_enabled(
        self, task_name: str, task_path: str, enabled: bool, token: str | None = None
    ) -> dict:
        payload = {
            "task_name": str(task_name or "").strip(),
            "task_path": str(task_path or "").strip(),
            "enabled": bool(enabled),
        }
        # Original StartupX UI may omit token after window.confirm — mint+consume.
        if not token:
            try:
                token = self._confirm.prepare("set_task_enabled", payload)
            except ValueError as exc:
                return {"ok": False, "error": str(exc)}
        denied = self._consume("set_task_enabled", payload, token)
        if denied is not None:
            return denied
        return mod_cron.set_task_enabled(task_name, task_path, enabled)

    def prepare_create_at_logon(
        self, task_name: str, program: str, arguments: str = ""
    ) -> dict:
        payload = {
            "task_name": str(task_name or "").strip(),
            "program": str(program or "").strip(),
            "arguments": str(arguments or "").strip(),
        }
        try:
            return {"ok": True, "token": self._confirm.prepare("create_at_logon", payload)}
        except ValueError as exc:
            return {"ok": False, "error": str(exc), "token": None}

    def create_at_logon(
        self,
        task_name: str,
        program: str,
        arguments: str = "",
        token: str | None = None,
    ) -> dict:
        payload = {
            "task_name": str(task_name or "").strip(),
            "program": str(program or "").strip(),
            "arguments": str(arguments or "").strip(),
        }
        denied = self._consume("create_at_logon", payload, token)
        if denied is not None:
            return denied
        return mod_cron.create_at_logon(task_name, program, arguments)

    def list_startup(self) -> dict:
        """StartupX Run keys + Startup folder + CIM inventory."""
        try:
            import winreg

            disabled_suffix = ".disabled"
            run_key = r"Software\Microsoft\Windows\CurrentVersion\Run"
            hive_map = {
                "HKCU": winreg.HKEY_CURRENT_USER,
                "HKLM": winreg.HKEY_LOCAL_MACHINE,
            }

            def read_run(hive_name: str) -> list[dict[str, Any]]:
                root = hive_map.get(hive_name)
                if root is None:
                    return []
                rows: list[dict[str, Any]] = []
                try:
                    key = winreg.OpenKey(root, run_key, 0, winreg.KEY_READ)
                except OSError:
                    return []
                try:
                    i = 0
                    while True:
                        try:
                            name, value, _ = winreg.EnumValue(key, i)
                        except OSError:
                            break
                        i += 1
                        enabled = not str(name).endswith(disabled_suffix)
                        display = (
                            str(name)[: -len(disabled_suffix)] if not enabled else str(name)
                        )
                        rows.append(
                            {
                                "type": f"Run ({hive_name})",
                                "name": display,
                                "command": str(value) if value is not None else "",
                                "path": str(value) if value is not None else "",
                                "impact": "Registry",
                                "enabled": enabled,
                                "hive": hive_name,
                                "regName": str(name),
                                "toggleable": True,
                            }
                        )
                finally:
                    winreg.CloseKey(key)
                return rows

            appdata = os.environ.get("APPDATA") or str(Path.home() / "AppData" / "Roaming")
            folder = (
                Path(appdata) / "Microsoft" / "Windows" / "Start Menu" / "Programs" / "Startup"
            )
            folder_rows: list[dict[str, Any]] = []
            if folder.is_dir():
                try:
                    for name in os.listdir(folder):
                        if name.startswith("."):
                            continue
                        full = folder / name
                        enabled = True
                        display = name
                        if name.lower().endswith(disabled_suffix):
                            enabled = False
                            display = name[: -len(disabled_suffix)]
                        lower = name.lower()
                        toggleable = lower.endswith(".lnk") or lower.endswith(".lnk.disabled")
                        folder_rows.append(
                            {
                                "type": "Startup folder",
                                "name": display,
                                "command": str(full),
                                "path": str(full),
                                "impact": "Folder",
                                "enabled": enabled,
                                "hive": "",
                                "regName": "",
                                "toggleable": toggleable,
                            }
                        )
                except OSError:
                    pass

            items: list[dict[str, Any]] = []
            items.extend(read_run("HKCU"))
            items.extend(read_run("HKLM"))
            items.extend(folder_rows)
            items.sort(key=lambda r: ((r.get("type") or ""), (r.get("name") or "").lower()))
            return {"ok": True, "items": items, "count": len(items)}
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "error": str(exc), "items": [], "count": 0}

    def toggle_startup_item(self, item: dict | None = None, token: str | None = None) -> dict:
        if not isinstance(item, dict):
            return {"ok": False, "error": "Item invalide"}
        payload = {"item": item}
        if not token:
            try:
                token = self._confirm.prepare("toggle_startup_item", payload)
            except ValueError as exc:
                return {"ok": False, "error": str(exc)}
        denied = self._consume("toggle_startup_item", payload, token)
        if denied is not None:
            return denied
        # Delegate to StartupX-compatible logic via subprocess rename / reg
        item_type = str(item.get("type") or "")
        enable_raw = item.get("enable")
        if enable_raw is None:
            enable = not bool(item.get("enabled", True))
        else:
            enable = bool(enable_raw)
        if item_type.startswith("Run ("):
            return self._toggle_run_key(
                str(item.get("hive") or "").strip().upper(),
                str(item.get("regName") or item.get("name") or "").strip(),
                enable,
            )
        if item_type == "Startup folder":
            return self._toggle_startup_folder(str(item.get("path") or ""), enable)
        return {
            "ok": False,
            "error": "Type non modifiable — utilisez les tâches planifiées",
            "readOnly": True,
        }

    def _toggle_run_key(self, hive: str, name: str, enable: bool) -> dict:
        import winreg

        disabled_suffix = ".disabled"
        run_key = r"Software\Microsoft\Windows\CurrentVersion\Run"
        hive_map = {"HKCU": winreg.HKEY_CURRENT_USER, "HKLM": winreg.HKEY_LOCAL_MACHINE}
        if hive not in hive_map or not name:
            return {"ok": False, "error": "Hive/nom invalide"}
        try:
            key = winreg.OpenKey(
                hive_map[hive], run_key, 0, winreg.KEY_READ | winreg.KEY_SET_VALUE
            )
        except OSError as exc:
            return {"ok": False, "error": str(exc)}
        try:
            if enable:
                src = name if name.endswith(disabled_suffix) else name + disabled_suffix
                dst = name[: -len(disabled_suffix)] if name.endswith(disabled_suffix) else name
            else:
                src = name[: -len(disabled_suffix)] if name.endswith(disabled_suffix) else name
                dst = src + disabled_suffix
            try:
                value, vtype = winreg.QueryValueEx(key, src)
            except OSError:
                try:
                    winreg.QueryValueEx(key, dst)
                    return {"ok": True, "name": dst, "enabled": enable, "noop": True}
                except OSError:
                    return {"ok": False, "error": "Cle introuvable"}
            if src == dst:
                return {"ok": True, "name": dst, "enabled": enable, "noop": True}
            try:
                winreg.SetValueEx(key, dst, 0, vtype, value)
                winreg.DeleteValue(key, src)
            except OSError as exc:
                return {"ok": False, "error": str(exc)}
            return {"ok": True, "name": dst, "enabled": enable}
        finally:
            winreg.CloseKey(key)

    def _toggle_startup_folder(self, path: str, enable: bool) -> dict:
        disabled_suffix = ".disabled"
        appdata = os.environ.get("APPDATA") or str(Path.home() / "AppData" / "Roaming")
        root = Path(appdata) / "Microsoft" / "Windows" / "Start Menu" / "Programs" / "Startup"
        p = safe_resolve_under(path, [root])
        if p is None or not p.is_file():
            return {"ok": False, "error": "Chemin Startup invalide"}
        name = p.name
        currently_disabled = name.lower().endswith(disabled_suffix)
        if enable:
            if not currently_disabled:
                return {"ok": True, "path": str(p), "enabled": True, "noop": True}
            dst = p.with_name(name[: -len(disabled_suffix)])
        else:
            if currently_disabled:
                return {"ok": True, "path": str(p), "enabled": False, "noop": True}
            dst = p.with_name(name + disabled_suffix)
        if safe_resolve_under(dst, [root]) is None:
            return {"ok": False, "error": "Cible hors dossier Startup"}
        if dst.exists():
            return {"ok": False, "error": f"Cible existe deja: {dst.name}"}
        try:
            p.rename(dst)
            return {"ok": True, "path": str(dst), "enabled": enable, "name": dst.name}
        except OSError as exc:
            return {"ok": False, "error": str(exc)}

    def open_path(self, path: str) -> dict:
        path = (path or "").strip()
        if not path:
            return {"ok": False, "error": "Chemin vide"}
        raw = path.strip().strip('"')
        candidate = raw.split(" /")[0].split(" -")[0].strip().strip('"')
        try:
            p = Path(candidate if candidate else raw).expanduser()
        except (OSError, RuntimeError):
            return {"ok": False, "error": "Chemin invalide"}
        folder = p if p.is_dir() else p.parent
        safe, err = safe_open_path(folder, deny_exec=True)
        if safe is None:
            return {"ok": False, "error": err or "Chemin refuse"}
        try:
            os.startfile(str(safe))  # type: ignore[attr-defined]
            return {"ok": True}
        except OSError as exc:
            return {"ok": False, "error": str(exc)}

    def open_dedicated(self, name: str = "ProcessGuard") -> dict:
        app = (name or "ProcessGuard").strip()
        if app not in ("ProcessGuard", "StartupX"):
            return {"ok": False, "error": f"App hors ProcessHub: {app}"}
        return launch_suite_app(app)


# ── Admin (nested) ───────────────────────────────────────────────────────────


class PowerPlanApi(_GateMixin):
    ACTIONS = ("set_plan", "set_focus_assist")

    def list_plans(self) -> dict:
        try:
            proc = subprocess.run(
                ["powercfg", "/list"],
                capture_output=True,
                timeout=30,
                creationflags=_CREATE_NO_WINDOW,
            )
            out = _decode_cli(proc.stdout)
            rows: list[dict[str, Any]] = []
            active_guid = ""
            for line in out.splitlines():
                line = line.strip()
                m = re.search(r"([0-9a-fA-F-]{36})\s+\((.+?)\)(\s+\*)?", line)
                if m:
                    guid, name, star = m.group(1), m.group(2), m.group(3)
                    if star:
                        active_guid = guid
                    rows.append({"guid": guid, "name": name, "active": bool(star)})
            return {"ok": True, "plans": rows, "active": active_guid, "raw": out}
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "error": str(exc)}

    def set_plan(self, guid: str, token: str | None = None) -> dict:
        guid_s = (guid or "").strip()
        if not re.fullmatch(r"[0-9a-fA-F-]{36}", guid_s):
            return {"ok": False, "error": "GUID invalide"}
        payload = {"guid": guid_s}
        if not token:
            try:
                token = self._confirm.prepare("set_plan", payload)
            except ValueError as exc:
                return {"ok": False, "error": str(exc)}
        denied = self._consume("set_plan", payload, token)
        if denied is not None:
            return denied
        try:
            proc = subprocess.run(
                ["powercfg", "/setactive", guid_s],
                capture_output=True,
                timeout=20,
                creationflags=_CREATE_NO_WINDOW,
            )
            if proc.returncode != 0:
                return {"ok": False, "error": _decode_cli(proc.stderr or proc.stdout) or "Echec"}
            return {"ok": True, "guid": guid_s}
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "error": str(exc)}

    def get_focus_assist_state(self) -> dict:
        return mod_quiet.get_focus_assist_state()

    def set_focus_assist(self, mode: int, token: str | None = None) -> dict:
        try:
            mode_i = int(mode)
        except (TypeError, ValueError):
            return {"ok": False, "error": "mode invalide"}
        payload = {"mode": mode_i}
        if not token:
            try:
                token = self._confirm.prepare("set_focus_assist", payload)
            except ValueError as exc:
                return {"ok": False, "error": str(exc)}
        denied = self._consume("set_focus_assist", payload, token)
        if denied is not None:
            return denied
        return mod_quiet.set_focus_assist(mode_i)

    def get_battery_info(self) -> dict:
        return mod_batt.get_battery_info()

    def generate_battery_report(self) -> dict:
        return mod_batt.generate_battery_report()

    def open_battery_folder(self, path: str) -> dict:
        return mod_batt.open_folder(path)

    def open_dedicated(self) -> dict:
        return launch_suite_app("PowerPlan")


class PrintQueueApi(_GateMixin):
    ACTIONS = ("purge_printer_jobs",)

    def list_print_queue(self) -> dict:
        try:
            script = r"""
$ErrorActionPreference = 'SilentlyContinue'
Import-Module PrintManagement -ErrorAction SilentlyContinue
$printers = @()
foreach ($p in Get-Printer -ErrorAction SilentlyContinue) {
  $jobs = @()
  foreach ($j in Get-PrintJob -PrinterName $p.Name -ErrorAction SilentlyContinue) {
    $jobs += [pscustomobject]@{
      id = [int]$j.Id
      documentName = [string]$j.DocumentName
      userName = [string]$j.UserName
      status = [string]$j.JobStatus
      size = [int64]$j.Size
      submittedTime = [string]$j.SubmittedTime
      pages = [int]$j.TotalPages
    }
  }
  $printers += [pscustomobject]@{
    name = [string]$p.Name
    driver = [string]$p.DriverName
    port = [string]$p.PortName
    status = [string]$p.PrinterStatus
    shared = [bool]$p.Shared
    default = [bool]$p.Default
    jobCount = @($jobs).Count
    jobs = @($jobs)
  }
}
@($printers) | ConvertTo-Json -Compress -Depth 6
"""
            data = _ps_json(script)
            if data is None:
                rows: list[Any] = []
            elif isinstance(data, dict):
                rows = [data]
            else:
                rows = list(data)
            total_jobs = sum(int(p.get("jobCount") or 0) for p in rows)
            return {
                "ok": True,
                "printers": rows,
                "printerCount": len(rows),
                "jobCount": total_jobs,
                "admin": _is_admin(),
            }
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "error": str(exc), "printers": []}

    def purge_printer_jobs(self, printer_name: str, token: str | None = None) -> dict:
        name = str(printer_name or "").strip()
        if not name:
            return {"ok": False, "error": "Nom d'imprimante requis"}
        payload = {"printer_name": name}
        if not token:
            try:
                token = self._confirm.prepare("purge_printer_jobs", payload)
            except ValueError as exc:
                return {"ok": False, "error": str(exc)}
        denied = self._consume("purge_printer_jobs", payload, token)
        if denied is not None:
            return denied
        try:
            safe = name.replace("'", "''")
            script = rf"""
$ErrorActionPreference = 'Stop'
Import-Module PrintManagement -ErrorAction SilentlyContinue
$printer = '{safe}'
$removed = 0
$jobs = @(Get-PrintJob -PrinterName $printer -ErrorAction SilentlyContinue)
foreach ($j in $jobs) {{
  Remove-PrintJob -PrinterName $printer -ID $j.Id -ErrorAction Stop
  $removed++
}}
@{{ ok = $true; removed = $removed; printer = $printer }} | ConvertTo-Json -Compress
"""
            data = _ps_json(script)
            if isinstance(data, dict) and data.get("ok"):
                return {"ok": True, "removed": int(data.get("removed") or 0), "printer": name}
            return {"ok": False, "error": "Echec purge — droits admin peut-etre requis"}
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "error": str(exc)}

    def open_dedicated(self) -> dict:
        return launch_suite_app("PrintQueue")


class RestorePointApi(_GateMixin):
    ACTIONS = ("create_restore_point",)

    def list_restore_points(self) -> dict:
        try:
            script = r"""
$ErrorActionPreference = 'Stop'
try {
  $pts = Get-ComputerRestorePoint -ErrorAction Stop | Sort-Object CreationTime -Descending
} catch {
  @() | ConvertTo-Json -Compress; exit 0
}
$rows = @()
foreach ($p in $pts) {
  $rows += [pscustomobject]@{
    sequence = [int]$p.SequenceNumber
    description = [string]$p.Description
    creationTime = [string]$p.CreationTime
    restorePointType = [string]$p.RestorePointType
    eventType = [string]$p.EventType
  }
}
$rows | ConvertTo-Json -Compress -Depth 3
"""
            data = _ps_json(script)
            if data is None:
                rows: list[Any] = []
            elif isinstance(data, dict):
                rows = [data]
            else:
                rows = list(data)
            return {"ok": True, "items": rows, "count": len(rows), "admin": _is_admin()}
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "error": str(exc), "items": [], "count": 0, "admin": _is_admin()}

    def create_restore_point(self, description: str = "", token: str | None = None) -> dict:
        if not _is_admin():
            return {"ok": False, "error": "Administrateur requis", "admin": False}
        desc = (description or "").strip() or "Mr-Aurevo-X RestorePoint"
        payload = {"description": desc}
        if not token:
            try:
                token = self._confirm.prepare("create_restore_point", payload)
            except ValueError as exc:
                return {"ok": False, "error": str(exc)}
        denied = self._consume("create_restore_point", payload, token)
        if denied is not None:
            return denied
        try:
            safe = desc.replace("'", "''")
            script = f"""
$ErrorActionPreference = 'Stop'
Checkpoint-Computer -Description '{safe}' -RestorePointType MODIFY_SETTINGS
@{{ ok = $true }} | ConvertTo-Json -Compress
"""
            data = _ps_json(script, timeout=180)
            if isinstance(data, dict) and data.get("raw"):
                return {
                    "ok": False,
                    "error": str(data.get("raw") or data.get("stderr") or "Echec"),
                    "admin": True,
                }
            return {"ok": True, "description": desc, "admin": True}
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "error": str(exc), "admin": _is_admin()}

    def is_admin(self) -> dict:
        return {"ok": True, "admin": _is_admin()}

    def open_dedicated(self) -> dict:
        return launch_suite_app("RestorePoint")


class UserSessionsApi(_GateMixin):
    ACTIONS = ("logoff_session",)

    def list_sessions(self) -> dict:
        try:
            script = r"""
$ErrorActionPreference = 'SilentlyContinue'
$rows = @()
$method = 'quser'
$raw = & query user 2>$null
if ($raw) {
  $lines = @($raw)
  for ($i = 1; $i -lt $lines.Count; $i++) {
    $line = ($lines[$i] -replace '^\s*>?\s*','').Trim()
    if (-not $line) { continue }
    if ($line -match '^(\S+)\s+(\S+)\s+(\d+)\s+(\S+)\s+(\S+(?:\s+\S+)?)\s+(.+)$') {
      $rows += [pscustomobject]@{
        user = $matches[1]; sessionName = $matches[2]; id = [int]$matches[3]
        state = $matches[4]; idle = $matches[5]; logonTime = $matches[6]
      }
    } elseif ($line -match '^(\S+)\s+(\d+)\s+(\S+)') {
      $rows += [pscustomobject]@{
        user = $matches[1]; sessionName = '.'; id = [int]$matches[2]
        state = $matches[3]; idle = ''; logonTime = ''
      }
    }
  }
}
if (-not $rows.Count) {
  $method = 'cim'
  $sessions = Get-CimInstance Win32_LogonSession | Where-Object { $_.LogonType -in 2, 10 }
  foreach ($sess in $sessions) {
    $users = Get-CimAssociatedInstance -InputObject $sess -ResultClassName Win32_LoggedOnUser -ErrorAction SilentlyContinue
    foreach ($u in $users) {
      $name = [string]$u.Antecedent
      if ($name -match 'Name="([^"]+)"') { $user = $matches[1] } else { $user = $name }
      $rows += [pscustomobject]@{
        user = $user; sessionName = '.'; id = [int]$sess.LogonId
        state = 'Active'; idle = ''; logonTime = [string]$sess.StartTime
      }
    }
  }
}
@{
  items = @($rows | Sort-Object id); count = @($rows).Count; method = $method
  admin = [bool](([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator))
} | ConvertTo-Json -Compress -Depth 5
"""
            data = _ps_json(script)
            if not isinstance(data, dict):
                return {"ok": True, "items": [], "count": 0, "method": "none", "admin": _is_admin()}
            items = data.get("items") or []
            if isinstance(items, dict):
                items = [items]
            return {
                "ok": True,
                "items": list(items),
                "count": int(data.get("count") or len(items)),
                "method": str(data.get("method") or "unknown"),
                "admin": _is_admin(),
            }
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "error": str(exc), "items": [], "count": 0, "admin": _is_admin()}

    def logoff_session(self, session_id: int, token: str | None = None) -> dict:
        try:
            sid = int(session_id)
        except (TypeError, ValueError):
            return {"ok": False, "error": "ID de session invalide"}
        if sid <= 0:
            return {"ok": False, "error": "ID de session invalide"}
        payload = {"session_id": sid}
        if not token:
            try:
                token = self._confirm.prepare("logoff_session", payload)
            except ValueError as exc:
                return {"ok": False, "error": str(exc)}
        denied = self._consume("logoff_session", payload, token)
        if denied is not None:
            return denied
        try:
            proc = subprocess.run(
                ["logoff", str(sid)],
                capture_output=True,
                timeout=30,
                creationflags=_CREATE_NO_WINDOW,
            )
            if proc.returncode != 0:
                err = _decode_cli(proc.stderr or proc.stdout).strip()
                return {
                    "ok": False,
                    "error": err or f"logoff exit {proc.returncode}",
                    "admin": _is_admin(),
                }
            return {"ok": True, "sessionId": sid, "admin": _is_admin()}
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "error": str(exc), "admin": _is_admin()}

    def is_admin(self) -> dict:
        return {"ok": True, "admin": _is_admin()}

    def open_dedicated(self) -> dict:
        return launch_suite_app("UserSessions")


class AdminApi:
    """Nested admin APIs — powerplan / printqueue / restorepoint / usersessions."""

    def __init__(self, gate: ConfirmGate) -> None:
        self.powerplan = PowerPlanApi(gate)
        self.printqueue = PrintQueueApi(gate)
        self.restorepoint = RestorePointApi(gate)
        self.usersessions = UserSessionsApi(gate)
        self.apps = ["PowerPlan", "PrintQueue", "RestorePoint", "UserSessions"]

    def list_apps(self) -> dict:
        return {"ok": True, "module": "admin", "apps": self.apps}

    def open_app(self, name: str = "") -> dict:
        name = (name or "").strip()
        if name not in self.apps:
            return {"ok": False, "error": f"App hors module admin: {name}"}
        return launch_suite_app(name)


# ── SystemClean ──────────────────────────────────────────────────────────────


class SystemCleanApi(_GateMixin):
    ACTIONS = (
        "empty_recycle_bin",
        "rebuild_icon_cache",
        "clear_recent_files",
        "delete_large_file",
        "delete_empty_folder",
        "trash_dup_paths",
    )

    def __init__(self, gate: ConfirmGate) -> None:
        super().__init__(gate)
        self.apps = ["WinCleaner", "DiskMap"]
        self.wincleaner = WinCleanerHostApi(gate)
        self.diskmap = DiskMapHostApi(gate=gate)

    # WinCleaner mutators (flat shortcuts — prefer .wincleaner for full API)
    def list_recycle_bin(self) -> dict:
        return mod_recycle.list_recycle_bin()

    def empty_recycle_bin(self, token: str | None = None) -> dict:
        denied = self._consume("empty_recycle_bin", {}, token)
        if denied is not None:
            return denied
        return mod_recycle.empty_recycle_bin()

    def rebuild_icon_cache(self, token: str | None = None) -> dict:
        denied = self._consume("rebuild_icon_cache", {}, token)
        if denied is not None:
            return denied
        return mod_iconcache.rebuild_icon_cache()

    def list_recent_files(self) -> dict:
        return mod_recent.list_recent_files()

    def clear_recent_files(self, token: str | None = None) -> dict:
        denied = self._consume("clear_recent_files", {}, token)
        if denied is not None:
            return denied
        return mod_recent.clear_recent()

    # DiskMap helpers (flat — also on .diskmap)
    def list_drives(self) -> dict:
        return self.diskmap.list_drives()

    def scan_large(self, root: str = "", top_n: int = 30, min_mb: float = 50) -> dict:
        return mod_bigfiles.scan_large(root or str(Path.home()), top_n=top_n, min_mb=min_mb)

    def find_empty(self, root: str = "") -> dict:
        return mod_empty.find_empty(root or str(Path.home()))

    def scan_duplicates(self, folder: str = "") -> dict:
        return mod_duplicates.scan_duplicates(folder or str(Path.home()))

    def delete_large_file(self, path: str, token: str | None = None) -> dict:
        payload = {"path": str(path or "")}
        denied = self._consume("delete_large_file", payload, token)
        if denied is not None:
            return denied
        return mod_bigfiles.delete_file(path)

    def delete_empty_folder(self, path: str, token: str | None = None) -> dict:
        payload = {"path": str(path or "")}
        denied = self._consume("delete_empty_folder", payload, token)
        if denied is not None:
            return denied
        return mod_empty.delete_folder(path)

    def trash_dup_paths(self, paths: list | None = None, token: str | None = None) -> dict:
        path_list = list(paths) if isinstance(paths, list) else []
        payload = {"paths": path_list}
        denied = self._consume("trash_dup_paths", payload, token)
        if denied is not None:
            return denied
        return mod_duplicates.trash_paths(path_list)

    def list_apps(self) -> dict:
        return {"ok": True, "module": "systemclean", "apps": self.apps}

    def open_app(self, name: str = "") -> dict:
        name = (name or "").strip()
        if name not in self.apps:
            return {"ok": False, "error": f"App hors module systemclean: {name}"}
        return launch_suite_app(name)

    def open_dedicated(self, name: str = "WinCleaner") -> dict:
        return self.open_app(name or "WinCleaner")


HUB_TITLE = "PC Command | System"
HUB_ID = "systeme"
_HUB_ROOT = _BACKEND.parent


class DashboardApi:
    """Lecture seule — aucun mutator."""

    def __init__(self, hub: "Api") -> None:
        self._hub = hub

    def get_metrics_url(self) -> dict:
        """URL of embedded localhost metrics API for Accueil live UI."""
        host = getattr(self._hub, "_metrics_host", "127.0.0.1") or "127.0.0.1"
        port = int(getattr(self._hub, "_metrics_port", 0) or 0)
        if port <= 0:
            return {"ok": False, "url": "", "error": "metrics offline"}
        return {"ok": True, "url": f"http://{host}:{port}/api/metrics"}


    def get_kpis(self) -> dict:
        disk_free_gb = None
        disk_total_gb = None
        ram_used_pct = None
        process_count = None
        try:
            data = _ps_json(
                r"""
$ErrorActionPreference='SilentlyContinue'
$d = Get-PSDrive -Name C
$os = Get-CimInstance Win32_OperatingSystem
$procs = @(Get-Process).Count
$ramUsed = if ($os.TotalVisibleMemorySize) {
  [math]::Round(100 * (1 - ($os.FreePhysicalMemory / $os.TotalVisibleMemorySize)), 1)
} else { $null }
[pscustomobject]@{
  diskFreeGb = if ($d) { [math]::Round([double]$d.Free/1GB, 1) } else { $null }
  diskTotalGb = if ($d) { [math]::Round(([double]$d.Used+[double]$d.Free)/1GB, 1) } else { $null }
  ramUsedPct = $ramUsed
  processCount = $procs
} | ConvertTo-Json -Compress
"""
            )
            if isinstance(data, dict):
                disk_free_gb = data.get("diskFreeGb")
                disk_total_gb = data.get("diskTotalGb")
                ram_used_pct = data.get("ramUsedPct")
                process_count = data.get("processCount")
        except Exception as exc:  # noqa: BLE001
            return {
                "ok": True,
                "admin": _is_admin(),
                "partial": True,
                "error": str(exc),
                "diskFreeGb": None,
                "diskTotalGb": None,
                "ramUsedPct": None,
                "processCount": None,
            }
        return {
            "ok": True,
            "admin": _is_admin(),
            "partial": False,
            "diskFreeGb": disk_free_gb,
            "diskTotalGb": disk_total_gb,
            "ramUsedPct": ram_used_pct,
            "processCount": process_count,
        }

    def list_modules(self) -> dict:
        return {"ok": True, "modules": self._hub.module_catalog()}


class Api(WindowChromeMixin):
    """Root pywebview.api — namespaces systemclean / processhub / …"""

    def __init__(self) -> None:
        self._window: Any = None
        self._maximized = False
        self._confirm = ConfirmGate(ttl_seconds=90.0)
        self._metrics_host = "127.0.0.1"
        self._metrics_port = 0
        self.dashboard = DashboardApi(self)
        self.systemclean = SystemCleanApi(self._confirm)
        self.ramcleaner = RamCleanerApi(self._confirm)
        self.processhub = ProcessHubApi(self._confirm)
        self.uninstx = UninstXApi(self._confirm)
        self.sysinspect = SysInspectApi()
        self.admin = AdminApi(self._confirm)

    def set_window(self, window: Any) -> None:
        WindowChromeMixin.set_window(self, window)
        # Nested hosts that need folder dialogs / HWND (DiskMap, WinCleaner).
        try:
            dm = getattr(self.systemclean, "diskmap", None)
            if dm is not None and hasattr(dm, "set_window"):
                dm.set_window(window)
        except Exception:
            pass
        try:
            wc = getattr(self.systemclean, "wincleaner", None)
            if wc is not None and hasattr(wc, "set_window"):
                wc.set_window(window)
        except Exception:
            pass

    def module_catalog(self) -> list[dict]:
        return [
            {
                "id": "systemclean",
                "label": "SystemClean",
                "desc": "Cleanup, disque (WinCleaner · DiskMap)",
                "apps": self.systemclean.apps,
            },
            {
                "id": "ramcleaner",
                "label": "RamCleaner",
                "desc": "Conseiller mémoire — analyse, trim, fin de tâche (ConfirmGate)",
                "apps": ["Ram Cleaner"],
            },
            {
                "id": "processhub",
                "label": "ProcessHub",
                "desc": "Processus et démarrage (ProcessGuard · StartupX)",
                "apps": ["ProcessGuard", "StartupX"],
            },
            {
                "id": "uninstx",
                "label": "UninstX",
                "desc": "Désinstallation et leftovers",
                "apps": ["UninstX"],
            },
            {
                "id": "sysinspect",
                "label": "SysInspect",
                "desc": "Événements Windows et pilotes (lecture)",
                "apps": ["SysInspect"],
            },
            {
                "id": "admin",
                "label": "Admin léger",
                "desc": "PowerPlan · PrintQueue · RestorePoint · UserSessions",
                "apps": self.admin.apps,
            },
        ]

    def get_suite_accent(self) -> dict:
        return {"ok": True, "accent": resolve_suite_accent()}

    def get_suite_settings(self) -> dict:
        return {
            "ok": True,
            "accent": resolve_suite_accent(),
            "language": resolve_suite_language(),
        }

    def get_suite_language(self) -> dict:
        return {"ok": True, "language": resolve_suite_language()}

    def is_admin(self) -> dict:
        return {"ok": True, "admin": _is_admin()}


    def set_metrics_endpoint(self, host: str = "127.0.0.1", port: int = 0) -> dict:
        self._metrics_host = host or "127.0.0.1"
        self._metrics_port = int(port or 0)
        return {"ok": True, "host": self._metrics_host, "port": self._metrics_port}

    def set_window_title(self, title: str = "") -> dict:
        title = (title or "").strip() or HUB_TITLE
        try:
            if self._window is not None:
                self._window.set_title(title)
            return {"ok": True, "title": title}
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "error": str(exc)}

    def get_app_version(self) -> dict:
        ver = hub_update.get_local_suite_version(_HUB_ROOT)
        return {
            "ok": True,
            "version": ver,
            "hubId": HUB_ID,
            "title": hub_update.title_with_version(HUB_TITLE, ver),
        }

    def check_for_update(self) -> dict:
        return hub_update.check_hub_update(HUB_ID, _HUB_ROOT)

    def open_update(self) -> dict:
        info = hub_update.check_hub_update(HUB_ID, _HUB_ROOT)
        return hub_update.open_update_action(
            _HUB_ROOT, release_url=info.get("releaseUrl")
        )

    def open_support_url(self, kind: str = "") -> dict:
        return hub_update.open_support_url(kind)

    def apply_update(self, force: bool = False) -> dict:
        """Download + replace Launch-Hub zip in-place (LOCALAPPDATA install)."""
        return hub_update.apply_hub_update(HUB_ID, _HUB_ROOT, force=bool(force))

    def open_suite_app(self, name: str) -> dict:
        return launch_suite_app(name)
