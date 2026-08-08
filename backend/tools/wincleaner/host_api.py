"""WinCleaner host API — adapted for Hub-Systeme in-process embed."""
from __future__ import annotations

import ctypes
import json
import os
import subprocess
import sys
import tempfile
import threading
from pathlib import Path
from typing import Any

_BACKEND = Path(__file__).resolve().parents[2]  # backend/
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from tools.wincleaner import iconcache as mod_iconcache  # noqa: E402
from tools.wincleaner import recentfiles as mod_recent  # noqa: E402
from tools.wincleaner import recyclebin as mod_recycle  # noqa: E402
from tools.wincleaner import tempwatch as mod_temp  # noqa: E402
from security import ConfirmGate, safe_open_path  # noqa: E402
from suite_launch import launch_suite_app, resolve_suite_accent, resolve_suite_language  # noqa: E402


def winclean_runtime_root() -> Path:
    """PS API root: api/Invoke-WinCleanApi.ps1 + modules/*.ps1 + lists/ + logs/."""
    return Path(__file__).resolve().parent.parent / "winclean_runtime"


def ensure_winclean_runtime_layout(root: Path | None = None) -> Path:
    """Ensure runtime dirs exist (lists required for debloat / exclusions / purge)."""
    base = Path(root) if root else winclean_runtime_root()
    for sub in ("api", "modules", "lists", "logs"):
        (base / sub).mkdir(parents=True, exist_ok=True)
    return base


def is_admin() -> bool:
    try:
        return bool(ctypes.windll.shell32.IsUserAnAdmin())
    except Exception:
        return False


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


ALLOWED_ACTIONS = frozenset({
    "ping",
    "getHealth",
    "getLargeFiles",
    "getCategories",
    "listTraces",
    "scanClean",
    "runClean",
    "getBloatApps",
    "removeBloat",
    "runOptimizations",
    "analyzeWinSxS",
    "dismRestoreHealth",
    "sfcScan",
    "getStartup",
    "disableStartup",
    "findPurge",
    "officialUninstall",
    "purgeLeftovers",
    "getExclusions",
    "setExclusions",
    "getSessions",
    "exportReport",
    "createRestorePoint",
})

# Destructive / mutating actions that must go through ConfirmGate.
TOKEN_ACTIONS = frozenset({
    "runClean",
    "removeBloat",
    "runOptimizations",
    "analyzeWinSxS",
    "dismRestoreHealth",
    "sfcScan",
    "disableStartup",
    "officialUninstall",
    "purgeLeftovers",
    "setExclusions",
    "createRestorePoint",
})


class WinCleanerHostApi:
    def __init__(self, gate: ConfirmGate | None = None, root: Path | None = None) -> None:
        # Keep Path handles private — pywebview recursively exposes public attrs
        # (Path.chmod / glob / …) and bloated the JS API by ~750 junk methods.
        self._root = ensure_winclean_runtime_layout(Path(root) if root else None)
        self._api_ps1 = self._root / "api" / "Invoke-WinCleanApi.ps1"
        self._progress_path = self._root / "logs" / "job-progress.json"
        self._job_lock = threading.Lock()
        self._proc_lock = threading.Lock()
        self._job_thread: threading.Thread | None = None
        self._job_running = False
        self._job_error: str | None = None
        self._job_result: dict[str, Any] | None = None
        self._current_proc: subprocess.Popen[bytes] | None = None
        self._confirm = gate or ConfirmGate(ttl_seconds=90.0)
        self._window: Any = None
        self._maximized = False

    def set_window(self, window: Any) -> None:
        """Bound by hub Api.set_window (folder dialogs / HWND)."""
        self._window = window

    def runtime_info(self) -> dict:
        """Safe diagnostic (no Path objects exposed to pywebview)."""
        return {
            "ok": True,
            "root": str(self._root),
            "apiPs1": str(self._api_ps1),
            "apiExists": self._api_ps1.is_file(),
            "progressPath": str(self._progress_path),
            "admin": is_admin(),
        }

    def _normalize_action(self, action: str) -> str:
        return str(action or "").strip()

    def _normalize_payload(self, payload: dict | None) -> dict:
        """Stable dict for ConfirmGate digests (JS → JSON → Python)."""
        raw = payload if isinstance(payload, dict) else {}
        try:
            return json.loads(json.dumps(raw, ensure_ascii=False, sort_keys=True, default=str))
        except (TypeError, ValueError):
            return dict(raw)

    def prepare_action(self, action: str, payload: dict | None = None) -> dict:
        act = self._normalize_action(action)
        pl = self._normalize_payload(payload)
        if act not in ALLOWED_ACTIONS:
            return {"ok": False, "error": f"Action non autorisee: {act}", "token": None}
        try:
            token = self._confirm.prepare(act, pl)
            return {"ok": True, "token": token, "error": None}
        except ValueError as exc:
            return {"ok": False, "error": str(exc), "token": None}

    def _require_token(self, action: str, payload: dict, token: str | None) -> dict | None:
        if action not in TOKEN_ACTIONS and action in ALLOWED_ACTIONS:
            # Read-only / scan actions: allow without token when called via run().
            return None
        if not self._confirm.consume(str(token or ""), action, payload):
            return {"ok": False, "error": "Jeton de confirmation invalide ou expire", "data": None}
        return None

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

    def temp_sizes(self) -> dict:
        return mod_temp.temp_sizes()

    def open_temp_folder(self, path: str) -> dict:
        return mod_temp.open_folder(path)

    def list_recycle_bin(self) -> dict:
        return mod_recycle.list_recycle_bin()

    def prepare_empty_recycle_bin(self) -> dict:
        try:
            return {"ok": True, "token": self._confirm.prepare("empty_recycle_bin", {})}
        except ValueError as exc:
            return {"ok": False, "error": str(exc), "token": None}

    def empty_recycle_bin(self, token: str | None = None) -> dict:
        if not self._confirm.consume(str(token or ""), "empty_recycle_bin", {}):
            return {"ok": False, "error": "Jeton de confirmation invalide ou expire"}
        return mod_recycle.empty_recycle_bin()

    def prepare_rebuild_icon_cache(self) -> dict:
        try:
            return {"ok": True, "token": self._confirm.prepare("rebuild_icon_cache", {})}
        except ValueError as exc:
            return {"ok": False, "error": str(exc), "token": None}

    def rebuild_icon_cache(self, token: str | None = None) -> dict:
        if not self._confirm.consume(str(token or ""), "rebuild_icon_cache", {}):
            return {"ok": False, "error": "Jeton de confirmation invalide ou expire"}
        return mod_iconcache.rebuild_icon_cache()

    def list_recent_files(self) -> dict:
        return mod_recent.list_recent_files()

    def open_recent_target(self, path: str) -> dict:
        return mod_recent.open_target(path)

    def prepare_clear_recent_files(self) -> dict:
        try:
            return {"ok": True, "token": self._confirm.prepare("clear_recent_files", {})}
        except ValueError as exc:
            return {"ok": False, "error": str(exc), "token": None}

    def clear_recent_files(self, token: str | None = None) -> dict:
        if not self._confirm.consume(str(token or ""), "clear_recent_files", {}):
            return {"ok": False, "error": "Jeton de confirmation invalide ou expire"}
        return mod_recent.clear_recent()

    def hub_module_status(self) -> dict:
        return {
            "ok": True,
            "modules": {
                "tempwatch": True,
                "recyclebin": True,
                "iconcache": True,
                "recentfiles": True,
            },
        }




    def _kill_current_proc(self) -> None:
        with self._proc_lock:
            proc = self._current_proc
        if proc is None:
            return
        try:
            if proc.poll() is None:
                proc.kill()
                try:
                    proc.wait(timeout=3)
                except Exception:
                    pass
        except Exception:
            pass
        with self._proc_lock:
            if self._current_proc is proc:
                self._current_proc = None

    def _run_ps(self, action: str, payload: dict) -> dict:
        """Invoke PowerShell API (caller already validated action / token)."""
        if not self._api_ps1.is_file():
            return {"ok": False, "error": f"API introuvable: {self._api_ps1}", "data": None}

        req = {"action": action, "payload": payload}
        fd_in, path_in = tempfile.mkstemp(prefix="winclean-in-", suffix=".json")
        fd_out, path_out = tempfile.mkstemp(prefix="winclean-out-", suffix=".json")
        os.close(fd_in)
        os.close(fd_out)
        proc: subprocess.Popen[bytes] | None = None
        try:
            Path(path_in).write_text(json.dumps(req, ensure_ascii=False), encoding="utf-8")
            Path(path_out).write_text("", encoding="utf-8")

            creationflags = 0
            if sys.platform == "win32":
                creationflags = subprocess.CREATE_NO_WINDOW  # type: ignore[attr-defined]

            proc = subprocess.Popen(
                [
                    "powershell.exe",
                    "-NoProfile",
                    "-ExecutionPolicy",
                    "Bypass",
                    "-File",
                    str(self._api_ps1),
                    "-InFile",
                    path_in,
                    "-OutFile",
                    path_out,
                ],
                cwd=str(self._root),
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                creationflags=creationflags)
            with self._proc_lock:
                self._current_proc = proc

            try:
                stdout_b, stderr_b = proc.communicate(timeout=3600)
            except subprocess.TimeoutExpired:
                self._kill_current_proc()
                return {"ok": False, "error": "Timeout (opération trop longue)", "data": None}

            raw = Path(path_out).read_text(encoding="utf-8").strip()
            if not raw:
                err = (_decode_cli(stderr_b) or _decode_cli(stdout_b) or f"exit {proc.returncode}").strip()
                return {"ok": False, "error": err or "Réponse API vide", "data": None}
            try:
                return json.loads(raw)
            except json.JSONDecodeError:
                return {"ok": False, "error": f"JSON invalide: {raw[:400]}", "data": None}
        except Exception as exc:
            return {"ok": False, "error": str(exc), "data": None}
        finally:
            with self._proc_lock:
                if proc is not None and self._current_proc is proc:
                    self._current_proc = None
            for p in (path_in, path_out):
                try:
                    os.unlink(p)
                except OSError:
                    pass

    def run(self, action: str, payload: dict | None = None, token: str | None = None) -> dict:
        act = self._normalize_action(action)
        pl = self._normalize_payload(payload)
        if act not in ALLOWED_ACTIONS:
            return {"ok": False, "error": f"Action non autorisee: {act}", "data": None}
        denied = self._require_token(act, pl, token)
        if denied is not None:
            return denied
        return self._run_ps(act, pl)
    def _write_progress_fallback(
        self, percent: int, phase: str, detail: str, done: bool, error: str | None = None
    ) -> None:
        try:
            self._progress_path.parent.mkdir(parents=True, exist_ok=True)
            payload = {
                "percent": percent,
                "phase": phase,
                "detail": detail,
                "done": done,
                "error": error,
                "updatedAt": None,
            }
            self._progress_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        except OSError:
            pass

    def _read_progress_file(self) -> dict[str, Any]:
        if not self._progress_path.is_file():
            return {
                "percent": 0,
                "phase": "",
                "detail": "",
                "done": False,
                "error": None,
                "updatedAt": None,
            }
        try:
            return json.loads(self._progress_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return {
                "percent": 0,
                "phase": "",
                "detail": "",
                "done": False,
                "error": None,
                "updatedAt": None,
            }

    def _job_worker(self, action: str, payload: dict) -> None:
        try:
            res = self._run_ps(action, payload)
            if not res or not res.get("ok"):
                err = (res or {}).get("error") or "Échec de l'action"
                self._job_error = str(err)
                self._job_result = None
                self._write_progress_fallback(100, "Erreur", str(err), True, str(err))
            else:
                self._job_error = None
                self._job_result = res
                prog = self._read_progress_file()
                if not prog.get("done"):
                    self._write_progress_fallback(
                        100, "Terminé", prog.get("detail") or "OK", True, None
                    )
        except Exception as exc:
            self._job_error = str(exc)
            self._job_result = None
            self._write_progress_fallback(100, "Erreur", str(exc), True, str(exc))
        finally:
            with self._job_lock:
                self._job_running = False

    def start_action(self, action: str, payload: dict | None = None, token: str | None = None) -> dict:
        act = self._normalize_action(action)
        pl = self._normalize_payload(payload)
        if act not in ALLOWED_ACTIONS:
            return {"ok": False, "error": f"Action non autorisee: {act}", "data": None}
        # Async jobs always require a fresh confirm token (UI prepare_action).
        if not self._confirm.consume(str(token or ""), act, pl):
            return {"ok": False, "error": "Jeton de confirmation invalide ou expire", "data": None}
        with self._job_lock:
            if self._job_running:
                # Recover stale flag if worker thread died without clearing.
                if self._job_thread is not None and not self._job_thread.is_alive():
                    self._job_running = False
                else:
                    return {"ok": False, "error": "Une action est déjà en cours", "data": None}
            self._job_running = True
            self._job_error = None
            self._job_result = None
            self._write_progress_fallback(0, act or "Job", "Démarrage...", False, None)
            self._job_thread = threading.Thread(
                target=self._job_worker, args=(act, pl), daemon=True
            )
            self._job_thread.start()
        return {"ok": True, "error": None, "data": {"started": True}}

    def cancel_action(self) -> dict:
        """Kill hung PowerShell and clear job flag so the UI can start new work."""
        self._kill_current_proc()
        with self._job_lock:
            self._job_running = False
            self._job_error = "Annulé"
            self._job_result = None
        self._write_progress_fallback(100, "Annulé", "Annulé par l'UI", True, "Annulé")
        return {"ok": True, "error": None, "data": {"cancelled": True}}

    def get_action_progress(self) -> dict:
        prog = self._read_progress_file()
        with self._job_lock:
            running = self._job_running
            err = self._job_error
        if err and not running:
            prog["done"] = True
            prog["error"] = err
            if not prog.get("phase"):
                prog["phase"] = "Erreur"
        return {
            "ok": True,
            "error": None,
            "data": {
                "percent": int(prog.get("percent") or 0),
                "phase": prog.get("phase") or "",
                "detail": prog.get("detail") or "",
                "done": bool(prog.get("done")) and not running,
                "running": running,
                "error": prog.get("error") or err,
                "updatedAt": prog.get("updatedAt"),
            },
        }

    def get_action_result(self) -> dict:
        with self._job_lock:
            if self._job_running:
                return {"ok": False, "error": "Action encore en cours", "data": None}
            if self._job_error:
                return {"ok": False, "error": self._job_error, "data": None}
            if not self._job_result:
                return {"ok": False, "error": "Aucun résultat", "data": None}
            return self._job_result

    def is_admin(self) -> bool:
        return is_admin()

    def open_path(self, path: str) -> dict:
        safe, err = safe_open_path(path, deny_exec=True)
        if safe is None:
            return {"ok": False, "error": err or "Chemin refuse"}
        try:
            os.startfile(str(safe))  # type: ignore[attr-defined]
            return {"ok": True}
        except OSError as exc:
            return {"ok": False, "error": str(exc)}

    def open_suite_app(self, name: str) -> dict:
        return launch_suite_app(name)

