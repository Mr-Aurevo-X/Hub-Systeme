"""DiskMap host API — adapted for Hub-Systeme in-process embed."""
from __future__ import annotations

import json
import os
import shutil
import string
import sys
import threading
import time
from pathlib import Path
from typing import Any

_BACKEND = Path(__file__).resolve().parents[2]  # backend/
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from tools.diskmap import bigfiles as mod_bigfiles  # noqa: E402
from tools.diskmap import diskhealth as mod_diskhealth  # noqa: E402
from tools.diskmap import duplicates as mod_duplicates  # noqa: E402
from tools.diskmap import emptyfolders as mod_empty  # noqa: E402
from tools.diskmap import fastfind as mod_fastfind  # noqa: E402
from tools.diskmap import spacediff as mod_spacediff  # noqa: E402
from security import ConfirmGate, safe_open_path  # noqa: E402
from suite_launch import resolve_suite_accent, resolve_suite_language  # noqa: E402

try:
    import webview
except ImportError:  # pragma: no cover
    webview = None  # type: ignore

# FILE_ATTRIBUTE_REPARSE_POINT — junctions / symlinks
_REPARSE = 0x400
_MAX_CHILDREN = 48
_TINY_RATIO = 0.008
def _fmt_bytes(n: int) -> str:
    units = ("o", "Ko", "Mo", "Go", "To")
    v = float(max(0, n))
    for u in units:
        if v < 1024 or u == units[-1]:
            if u == "o":
                return f"{int(v)} {u}"
            return f"{v:.1f} {u}"
        v /= 1024
    return f"{n} o"


class _Node:
    __slots__ = ("name", "path", "size", "is_dir", "children")

    def __init__(self, name: str, path: str, is_dir: bool) -> None:
        self.name = name
        self.path = path
        self.size = 0
        self.is_dir = is_dir
        self.children: list[_Node] = []

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "path": self.path,
            "size": self.size,
            "isDir": self.is_dir,
            "children": [c.to_dict() for c in self.children] if self.children else [],
        }


def _prune_children(node: _Node) -> None:
    if not node.children:
        return
    kids = sorted(node.children, key=lambda c: c.size, reverse=True)
    tiny_budget = max(1, int(node.size * _TINY_RATIO)) if node.size else 1
    kept: list[_Node] = []
    autres_size = 0
    autres_count = 0

    for i, child in enumerate(kids):
        rest_are_tiny = child.size <= tiny_budget and i >= 8
        over_cap = len(kept) >= _MAX_CHILDREN
        if over_cap or rest_are_tiny:
            autres_size += child.size
            autres_count += 1
        else:
            kept.append(child)

    if autres_count:
        others_lbl = "Others" if resolve_suite_language() == "en" else "Autres"
        agg = _Node(f"{others_lbl} ({autres_count})", node.path, False)
        agg.size = autres_size
        kept.append(agg)

    node.children = kept


class DiskMapHostApi:
    def __init__(self, window: Any = None, gate: ConfirmGate | None = None) -> None:
        self._window: Any = window
        self._confirm = gate or ConfirmGate(ttl_seconds=90.0)
        self._maximized = False
        self._lock = threading.RLock()
        self._cancel = threading.Event()
        self._thread: threading.Thread | None = None
        self._running = False
        self._error: str | None = None
        self._result: dict[str, Any] | None = None
        self._progress: dict[str, Any] = {
            "percent": 0,
            "phase": "",
            "detail": "",
            "done": False,
            "error": None,
            "filesSeen": 0,
            "bytesSeen": 0,
        }
        self._files_seen = 0
        self._bytes_seen = 0
        self._progress_total = 0
        self._last_prog_ts = 0.0
        # Hub job state (Recherche / Gros / Vides / Doublons)
        self._hub_lock = threading.RLock()
        self._search_cancel = threading.Event()
        self._search_thread: threading.Thread | None = None
        self._search_progress: dict[str, Any] = {"ok": True, "done": True, "percent": 0, "result": None}
        self._large_thread: threading.Thread | None = None
        self._large_progress: dict[str, Any] = {"ok": True, "done": True, "running": False, "percent": 0, "result": None}
        self._empty_thread: threading.Thread | None = None
        self._empty_progress: dict[str, Any] = {"ok": True, "done": True, "running": False, "percent": 0, "result": None}
        self._dup_thread: threading.Thread | None = None
        self._dup_progress: dict[str, Any] = {"ok": True, "done": True, "percent": 0, "result": None}

    def set_window(self, window: Any) -> None:
        self._window = window

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


    def _set_progress(
        self,
        percent: int,
        phase: str,
        detail: str,
        done: bool = False,
        error: str | None = None,
        force: bool = False,
    ) -> None:
        with self._lock:
            # Don't overwrite cancel/terminal progress with mid-scan bumps
            if (
                not force
                and self._cancel.is_set()
                and not done
                and (self._progress.get("phase") or "").startswith("Annul")
            ):
                return
            self._progress = {
                "percent": max(0, min(100, int(percent))),
                "phase": phase,
                "detail": detail,
                "done": done,
                "error": error,
                "filesSeen": self._files_seen,
                "bytesSeen": self._bytes_seen,
            }

    def list_drives(self) -> dict:
        drives: list[dict[str, Any]] = []
        for letter in string.ascii_uppercase:
            root = f"{letter}:\\"
            if not os.path.exists(root):
                continue
            try:
                usage = shutil.disk_usage(root)
                drives.append(
                    {
                        "letter": letter,
                        "path": root,
                        "label": f"{letter}:",
                        "total": usage.total,
                        "used": usage.used,
                        "free": usage.free,
                        "totalLabel": _fmt_bytes(usage.total),
                        "usedLabel": _fmt_bytes(usage.used),
                        "freeLabel": _fmt_bytes(usage.free),
                    }
                )
            except OSError:
                drives.append(
                    {
                        "letter": letter,
                        "path": root,
                        "label": f"{letter}:",
                        "total": 0,
                        "used": 0,
                        "free": 0,
                        "totalLabel": "—",
                        "usedLabel": "—",
                        "freeLabel": "—",
                    }
                )
        return {"ok": True, "error": None, "data": {"drives": drives}}

    def pick_folder(self) -> dict:
        try:
            result = self._window.create_file_dialog(  # type: ignore[union-attr]
                webview.FOLDER_DIALOG,
                allow_multiple=False,
            )
            if not result:
                return {"ok": True, "error": None, "data": {"path": None}}
            path = result[0] if isinstance(result, (list, tuple)) else result
            return {"ok": True, "error": None, "data": {"path": str(path)}}
        except Exception as exc:
            return {"ok": False, "error": str(exc), "data": None}

    def start_scan(self, path: str) -> dict:
        if not path or not isinstance(path, str):
            return {"ok": False, "error": "Chemin requis", "data": None}
        target = os.path.abspath(path)
        if not os.path.exists(target):
            return {"ok": False, "error": f"Introuvable: {target}", "data": None}

        with self._lock:
            alive = self._thread is not None and self._thread.is_alive()
            if self._running or alive:
                if alive:
                    return {
                        "ok": False,
                        "error": "Une analyse est déjà en cours (attendez l'arrêt)",
                        "data": None,
                    }
                self._running = False
            self._running = True
            self._error = None
            self._result = None
            self._cancel.clear()
            self._files_seen = 0
            self._bytes_seen = 0
            self._progress_total = 0
            self._last_prog_ts = 0.0
            try:
                usage_path = target if os.path.isdir(target) else (os.path.dirname(target) or target)
                self._progress_total = max(1, int(shutil.disk_usage(usage_path).used))
            except OSError:
                self._progress_total = 0
            self._set_progress(0, "Analyse", "Démarrage…", False, None, force=True)
            self._thread = threading.Thread(
                target=self._scan_worker, args=(target,), daemon=True
            )
            self._thread.start()
        return {"ok": True, "error": None, "data": {"started": True, "path": target}}

    def cancel_scan(self) -> dict:
        """Request cooperative cancel; worker clears _running when it exits."""
        self._cancel.set()
        with self._lock:
            self._error = "Annulé"
            self._result = None
            pct = int(self._progress.get("percent") or 0)
        self._set_progress(
            pct,
            "Annulation",
            "Arrêt demandé…",
            False,
            None,
            force=True,
        )
        return {"ok": True, "error": None, "data": {"cancelled": True}}

    def get_scan_progress(self) -> dict:
        with self._lock:
            prog = dict(self._progress)
            running = self._running
            err = self._error
            alive = self._thread is not None and self._thread.is_alive()
        cancelling = self._cancel.is_set() and alive
        if cancelling:
            running = True
            prog["done"] = False
            if not (prog.get("phase") or "").startswith("Annul"):
                prog["phase"] = "Annulation"
                prog["detail"] = "Arrêt en cours…"
        if err and not running and not alive:
            prog["done"] = True
            prog["error"] = err
        return {
            "ok": True,
            "error": None,
            "data": {
                **prog,
                "done": bool(prog.get("done")) and not running and not alive,
                "running": running or alive,
                "bytesLabel": _fmt_bytes(int(prog.get("bytesSeen") or 0)),
            },
        }

    def get_scan_result(self) -> dict:
        with self._lock:
            if self._running:
                return {"ok": False, "error": "Analyse encore en cours", "data": None}
            if self._error:
                return {"ok": False, "error": self._error, "data": None}
            if not self._result:
                return {"ok": False, "error": "Aucun résultat", "data": None}
            return {"ok": True, "error": None, "data": self._result}

    def open_path(self, path: str) -> dict:
        if not path:
            return {"ok": False, "error": "Chemin vide"}
        try:
            raw = Path(str(path)).expanduser()
        except (OSError, RuntimeError):
            return {"ok": False, "error": "Chemin invalide"}
        # Open containing folder for files; deny_exec still allows directories
        target = raw if raw.is_dir() else raw.parent
        safe, err = safe_open_path(target, deny_exec=True)
        if safe is None:
            return {"ok": False, "error": err or f"Introuvable: {path}"}
        try:
            os.startfile(str(safe))  # type: ignore[attr-defined]
            return {"ok": True, "error": None}
        except OSError as exc:
            return {"ok": False, "error": str(exc)}

    def _bump_progress(self, current_path: str) -> None:
        if self._cancel.is_set():
            return
        now = time.monotonic()
        if now - self._last_prog_ts < 0.12:
            return
        self._last_prog_ts = now
        if self._progress_total > 0:
            pct = min(99, int((100.0 * self._bytes_seen) / self._progress_total))
        else:
            pct = min(95, int(12 + (self._files_seen**0.35) * 2.2))
        detail = current_path
        if len(detail) > 72:
            detail = "…" + detail[-69:]
        self._set_progress(
            pct,
            "Analyse",
            f"{detail} · {_fmt_bytes(self._bytes_seen)} · {self._files_seen:,} éléments".replace(",", " "),
            False,
            None,
        )

    def _scan_dir(self, dir_path: str, name: str) -> _Node | None:
        if self._cancel.is_set():
            return None
        node = _Node(name, dir_path, True)
        try:
            with os.scandir(dir_path) as it:
                entries = list(it)
        except PermissionError:
            return node
        except OSError:
            return node

        for entry in entries:
            if self._cancel.is_set():
                return None
            try:
                if _is_reparse(entry):
                    continue
                if entry.is_dir(follow_symlinks=False):
                    child = self._scan_dir(entry.path, entry.name)
                    if child is None:
                        return None
                    node.children.append(child)
                    node.size += child.size
                elif entry.is_file(follow_symlinks=False):
                    try:
                        sz = entry.stat(follow_symlinks=False).st_size
                    except (PermissionError, OSError):
                        continue
                    child = _Node(entry.name, entry.path, False)
                    child.size = sz
                    node.children.append(child)
                    node.size += sz
                    self._files_seen += 1
                    self._bytes_seen += sz
                    self._bump_progress(entry.path)
                else:
                    continue
            except PermissionError:
                continue
            except OSError:
                continue

        self._files_seen += 1
        self._bump_progress(dir_path)
        _prune_children(node)
        return node

    def _scan_worker(self, target: str) -> None:
        try:
            name = Path(target).name or target.rstrip("\\/")
            if len(target) == 3 and target[1] == ":":
                name = target[:2]

            root = self._scan_dir(target, name)
            if self._cancel.is_set() or root is None:
                with self._lock:
                    self._error = "Annulé"
                    self._result = None
                    self._running = False
                self._set_progress(100, "Annulé", "Annulé", True, "Annulé", force=True)
                return

            free = used = total = 0
            try:
                usage = shutil.disk_usage(target if os.path.isdir(target) else os.path.dirname(target) or target)
                free, used, total = usage.free, usage.used, usage.total
            except OSError:
                used = root.size

            payload = {
                "scanPath": target,
                "root": root.to_dict(),
                "free": free,
                "used": used,
                "total": total,
                "scannedBytes": root.size,
                "freeLabel": _fmt_bytes(free),
                "usedLabel": _fmt_bytes(used),
                "totalLabel": _fmt_bytes(total),
                "scannedLabel": _fmt_bytes(root.size),
                "filesSeen": self._files_seen,
            }
            with self._lock:
                self._result = payload
                self._error = None
                self._running = False
            self._set_progress(
                100, "Terminé", f"{_fmt_bytes(root.size)} analysés", True, None, force=True
            )
        except Exception as exc:
            with self._lock:
                self._error = str(exc)
                self._result = None
                self._running = False
            self._set_progress(100, "Erreur", str(exc), True, str(exc), force=True)

    # ── Hub: Recherche (FastFind) ──────────────────────────────────────────
    def start_search(self, root: str, query: str, opts: dict | None = None) -> dict:
        parsed = mod_fastfind.parse_search_args(root, query, opts)
        if isinstance(parsed, dict):
            return parsed
        root_str, query_lower, exts, min_bytes, max_results = parsed
        with self._hub_lock:
            if self._search_thread is not None and self._search_thread.is_alive():
                return {"ok": False, "error": "Recherche déjà en cours"}
            self._search_cancel.clear()
            self._search_progress = {
                "ok": True,
                "percent": 0,
                "filesSeen": 0,
                "dirsSeen": 0,
                "matches": 0,
                "elapsedMs": 0,
                "phase": "search",
                "detail": "",
                "done": False,
                "error": None,
                "cancelled": False,
                "result": None,
            }

            def _job() -> None:
                def on_progress(p: dict[str, Any]) -> None:
                    with self._hub_lock:
                        self._search_progress.update({
                            "percent": int(p.get("percent") or 0),
                            "filesSeen": int(p.get("filesSeen") or 0),
                            "dirsSeen": int(p.get("dirsSeen") or 0),
                            "matches": int(p.get("matches") or 0),
                            "elapsedMs": int(p.get("elapsedMs") or 0),
                            "done": False,
                            "cancelled": bool(p.get("cancelled")),
                        })

                try:
                    result = mod_fastfind.run_search(
                        root_str, query_lower, exts, min_bytes, max_results,
                        self._search_cancel, on_progress,
                    )
                    with self._hub_lock:
                        self._search_progress.update({
                            "percent": 100, "done": True, "phase": "done",
                            "cancelled": bool(result.get("cancelled")),
                            "result": result, "error": None,
                            "matches": result.get("count", 0),
                            "filesSeen": result.get("filesSeen", 0),
                            "elapsedMs": result.get("elapsedMs", 0),
                        })
                except Exception as exc:
                    with self._hub_lock:
                        self._search_progress.update({
                            "percent": 100, "done": True, "error": str(exc),
                            "result": {"ok": False, "error": str(exc)},
                        })

            self._search_thread = threading.Thread(target=_job, daemon=True)
            self._search_thread.start()
        return {"ok": True}

    def get_search_progress(self) -> dict:
        with self._hub_lock:
            return dict(self._search_progress)

    def cancel_search(self) -> dict:
        self._search_cancel.set()
        return {"ok": True}

    def open_search_file(self, path: str) -> dict:
        return mod_fastfind.open_file(path)

    def open_search_folder(self, path: str) -> dict:
        return mod_fastfind.open_folder_select(path)

    # ── Hub: Gros fichiers (BigFiles) ──────────────────────────────────────
    def start_scan_large(self, root: str, top_n: int = 50, min_mb: float = 50) -> dict:
        with self._hub_lock:
            if self._large_thread is not None and self._large_thread.is_alive():
                return {"ok": False, "error": "Scan déjà en cours"}
            self._large_progress = {
                "ok": True, "running": True, "percent": 0, "phase": "scanning",
                "detail": "", "done": False, "error": None, "result": None,
            }

            def _job() -> None:
                def on_progress(pct: int, detail: str) -> None:
                    with self._hub_lock:
                        self._large_progress.update({"percent": pct, "detail": detail, "phase": "scanning"})

                try:
                    result = mod_bigfiles.scan_large(root, top_n, min_mb, on_progress)
                    with self._hub_lock:
                        self._large_progress.update({
                            "percent": 100, "phase": "done", "done": True,
                            "running": False, "error": None if result.get("ok") else result.get("error"),
                            "result": result,
                        })
                except Exception as exc:
                    with self._hub_lock:
                        self._large_progress.update({
                            "percent": 0, "phase": "error", "done": True,
                            "running": False, "error": str(exc), "result": None,
                        })

            self._large_thread = threading.Thread(target=_job, daemon=True)
            self._large_thread.start()
        return {"ok": True}

    def get_large_progress(self) -> dict:
        with self._hub_lock:
            prog = dict(self._large_progress)
            alive = self._large_thread is not None and self._large_thread.is_alive()
        running = bool(prog.get("running")) or alive
        done = bool(prog.get("done")) and not running
        out: dict[str, Any] = {
            "ok": True, "running": running, "percent": int(prog.get("percent") or 0),
            "phase": prog.get("phase") or "", "detail": prog.get("detail") or "",
            "done": done, "error": prog.get("error"),
        }
        if done and prog.get("result") is not None:
            out["result"] = prog["result"]
        return out

    def prepare_delete_large_file(self, path: str = "") -> dict:
        payload = {"path": str(path or "")}
        try:
            return {"ok": True, "token": self._confirm.prepare("delete_large_file", payload)}
        except ValueError as exc:
            return {"ok": False, "error": str(exc), "token": None}

    def delete_large_file(self, path: str, token: str | None = None) -> dict:
        payload = {"path": str(path or "")}
        if not self._confirm.consume(str(token or ""), "delete_large_file", payload):
            return {"ok": False, "error": "Jeton de confirmation invalide ou expire"}
        return mod_bigfiles.delete_file(path)

    # ── Hub: Dossiers vides (EmptyFolders) ─────────────────────────────────
    def start_find_empty(self, root: str) -> dict:
        with self._hub_lock:
            if self._empty_thread is not None and self._empty_thread.is_alive():
                return {"ok": False, "error": "Scan déjà en cours"}
            self._empty_progress = {
                "ok": True, "running": True, "percent": 0, "phase": "scanning",
                "detail": "", "done": False, "error": None, "result": None,
            }

            def _job() -> None:
                def on_progress(pct: int, detail: str) -> None:
                    with self._hub_lock:
                        self._empty_progress.update({"percent": pct, "detail": detail})

                try:
                    result = mod_empty.find_empty(root, on_progress)
                    with self._hub_lock:
                        self._empty_progress.update({
                            "percent": 100, "phase": "done", "done": True,
                            "running": False, "error": None if result.get("ok") else result.get("error"),
                            "result": result,
                        })
                except Exception as exc:
                    with self._hub_lock:
                        self._empty_progress.update({
                            "percent": 0, "phase": "error", "done": True,
                            "running": False, "error": str(exc),
                        })

            self._empty_thread = threading.Thread(target=_job, daemon=True)
            self._empty_thread.start()
        return {"ok": True}

    def get_empty_progress(self) -> dict:
        with self._hub_lock:
            prog = dict(self._empty_progress)
            alive = self._empty_thread is not None and self._empty_thread.is_alive()
        running = bool(prog.get("running")) or alive
        done = bool(prog.get("done")) and not running
        out: dict[str, Any] = {
            "ok": True, "running": running, "percent": int(prog.get("percent") or 0),
            "phase": prog.get("phase") or "", "detail": prog.get("detail") or "",
            "done": done, "error": prog.get("error"),
        }
        if done and prog.get("result") is not None:
            out["result"] = prog["result"]
        return out

    def prepare_delete_empty_folder(self, path: str = "") -> dict:
        payload = {"path": str(path or "")}
        try:
            return {"ok": True, "token": self._confirm.prepare("delete_empty_folder", payload)}
        except ValueError as exc:
            return {"ok": False, "error": str(exc), "token": None}

    def delete_empty_folder(self, path: str, token: str | None = None) -> dict:
        payload = {"path": str(path or "")}
        if not self._confirm.consume(str(token or ""), "delete_empty_folder", payload):
            return {"ok": False, "error": "Jeton de confirmation invalide ou expire"}
        return mod_empty.delete_folder(path)

    # ── Hub: Doublons (DuplicateFinder) ────────────────────────────────────
    def start_scan_duplicates(self, folder: str) -> dict:
        with self._hub_lock:
            if self._dup_thread is not None and self._dup_thread.is_alive():
                return {"ok": False, "error": "Scan déjà en cours"}
            self._dup_progress = {
                "ok": True, "percent": 0, "phase": "walk", "detail": "",
                "done": False, "error": None, "result": None,
            }

            def _job() -> None:
                def on_progress(pct: int, phase: str, detail: str) -> None:
                    with self._hub_lock:
                        self._dup_progress.update({"percent": pct, "phase": phase, "detail": detail})

                try:
                    result = mod_duplicates.scan_duplicates(folder, on_progress)
                    with self._hub_lock:
                        self._dup_progress.update({
                            "percent": 100, "phase": "done", "done": True,
                            "error": None if result.get("ok") else result.get("error"),
                            "result": result,
                        })
                except Exception as exc:
                    with self._hub_lock:
                        self._dup_progress.update({
                            "percent": 100, "phase": "done", "done": True,
                            "error": str(exc), "result": {"ok": False, "error": str(exc)},
                        })

            self._dup_thread = threading.Thread(target=_job, daemon=True)
            self._dup_thread.start()
        return {"ok": True}

    def get_dup_progress(self) -> dict:
        with self._hub_lock:
            return dict(self._dup_progress)

    def prepare_trash_dup_paths(self, paths: list | None = None) -> dict:
        path_list = list(paths) if isinstance(paths, list) else []
        payload = {"paths": path_list}
        try:
            return {"ok": True, "token": self._confirm.prepare("trash_dup_paths", payload)}
        except ValueError as exc:
            return {"ok": False, "error": str(exc), "token": None}

    def trash_dup_paths(self, paths: list | None = None, token: str | None = None) -> dict:
        path_list = list(paths) if isinstance(paths, list) else []
        payload = {"paths": path_list}
        if not self._confirm.consume(str(token or ""), "trash_dup_paths", payload):
            return {"ok": False, "error": "Jeton de confirmation invalide ou expire"}
        return mod_duplicates.trash_paths(path_list)

    # ── Hub: Santé (DiskHealth) ────────────────────────────────────────────
    def get_disk_info(self) -> dict:
        return mod_diskhealth.get_disk_info()

    # ── Hub: Diff (SpaceDiff) ──────────────────────────────────────────────
    def take_snapshot(self) -> dict:
        return mod_spacediff.take_snapshot()

    def compare_snapshot(self) -> dict:
        return mod_spacediff.compare_snapshot()

    def hub_module_status(self) -> dict:
        """Smoke check that absorbed modules are importable (UI stubs can call this)."""
        return {
            "ok": True,
            "modules": {
                "fastfind": True,
                "bigfiles": True,
                "emptyfolders": True,
                "duplicates": True,
                "diskhealth": True,
                "spacediff": True,
            },
        }

