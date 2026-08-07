"""Hub-Systeme — host WebView2 (Vague H4 Couche B)."""

from __future__ import annotations

import ctypes
import subprocess
import sys
from pathlib import Path
from typing import Any

import webview

_HOST_DIR = Path(__file__).resolve().parent
if str(_HOST_DIR) not in sys.path:
    sys.path.insert(0, str(_HOST_DIR))

from api_modules import (  # noqa: E402
    AdminApi,
    ProcessHubApi,
    SysInspectApi,
    SystemCleanApi,
    UninstXApi,
)
from security import ConfirmGate  # noqa: E402
from suite_launch import (  # noqa: E402
    launch_suite_app,
    resolve_suite_accent,
    resolve_suite_language,
)
from window_chrome import WindowChromeMixin, create_tool_window  # noqa: E402

HUB_TITLE = "PC Command | System"
DEFAULT_WIDTH = 1120
DEFAULT_HEIGHT = 740


def app_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent.parent


def ui_dir() -> Path:
    external = app_dir() / "ui"
    if (external / "index.html").is_file():
        return external
    if getattr(sys, "frozen", False):
        base = Path(getattr(sys, "_MEIPASS", app_dir()))
        nested = base / "ui"
        return nested if nested.is_dir() else base
    return app_dir() / "ui"


def is_admin() -> bool:
    try:
        return bool(ctypes.windll.shell32.IsUserAnAdmin())
    except Exception:
        return False


def _relaunch_as_admin() -> bool:
    """Relaunch elevated via UAC. True if elevated process started."""
    try:
        frozen = bool(getattr(sys, "frozen", False))
        executable = sys.executable
        if frozen:
            params = " ".join(f'"{a}"' for a in sys.argv[1:])
        else:
            script = str(Path(sys.argv[0]).resolve())
            rest = " ".join(f'"{a}"' for a in sys.argv[1:])
            params = f'"{script}"' + (f" {rest}" if rest else "")
        rc = ctypes.windll.shell32.ShellExecuteW(None, "runas", executable, params, None, 1)
        return int(rc) > 32
    except Exception:
        return False


def _ps_json(script: str, timeout: int = 20) -> Any:
    cmd = [
        "powershell",
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        script,
    ]
    flags = subprocess.CREATE_NO_WINDOW if hasattr(subprocess, "CREATE_NO_WINDOW") else 0
    proc = subprocess.run(cmd, capture_output=True, timeout=timeout, creationflags=flags, text=True)
    out = (proc.stdout or "").strip()
    if not out:
        return None
    import json

    try:
        return json.loads(out)
    except json.JSONDecodeError:
        return {"raw": out, "returncode": proc.returncode}


class DashboardApi:
    """Lecture seule — aucun mutator."""

    def __init__(self, hub: "Api") -> None:
        self._hub = hub

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
                "admin": is_admin(),
                "partial": True,
                "error": str(exc),
                "diskFreeGb": None,
                "diskTotalGb": None,
                "ramUsedPct": None,
                "processCount": None,
            }
        return {
            "ok": True,
            "admin": is_admin(),
            "partial": False,
            "diskFreeGb": disk_free_gb,
            "diskTotalGb": disk_total_gb,
            "ramUsedPct": ram_used_pct,
            "processCount": process_count,
        }

    def list_modules(self) -> dict:
        return {"ok": True, "modules": self._hub.module_catalog()}


class Api(WindowChromeMixin):
    def __init__(self) -> None:
        self._window: Any = None
        self._maximized = False
        self._confirm = ConfirmGate(ttl_seconds=90.0)
        self.dashboard = DashboardApi(self)
        self.systemclean = SystemCleanApi(self._confirm)
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
                "desc": "Cleanup, disque, RAM (WinCleaner · DiskMap)",
                "apps": self.systemclean.apps,
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
        return {"ok": True, "admin": is_admin()}

    def set_window_title(self, title: str = "") -> dict:
        title = (title or "").strip() or HUB_TITLE
        try:
            if self._window is not None:
                self._window.set_title(title)
            return {"ok": True, "title": title}
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "error": str(exc)}

    def open_suite_app(self, name: str) -> dict:
        return launch_suite_app(name)


def main() -> None:
    if not is_admin():
        if _relaunch_as_admin():
            raise SystemExit(0)
        raise SystemExit("PC Command | System nécessite les droits administrateur.")
    index = ui_dir() / "index.html"
    if not index.is_file():
        raise SystemExit(f"UI introuvable: {index}")
    api = Api()
    create_tool_window(
        title=HUB_TITLE,
        url=index.as_uri(),
        js_api=api,
        width=DEFAULT_WIDTH,
        height=DEFAULT_HEIGHT,
        background_color="#06070c",
    )
    webview.start()


if __name__ == "__main__":
    main()
