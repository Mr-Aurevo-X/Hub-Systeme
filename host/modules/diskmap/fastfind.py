"""FastFind logic — name/ext/size search under a root."""
from __future__ import annotations

import os
import stat as stat_mod
import subprocess
import threading
import time
from pathlib import Path
from typing import Any, Callable

from .security import is_probably_user_data_path, safe_resolve_under

_SKIP_DIRS = frozenset({
    "node_modules",
    ".git",
    "dist",
    "__pycache__",
    ".venv",
    "venv",
    ".cache",
    ".tox",
    ".mypy_cache",
    ".pytest_cache",
    ".ruff_cache",
    ".nuget",
    "site-packages",
    "$Recycle.Bin",
    "System Volume Information",
    "Windows",
    "WinSxS",
    "Recovery",
})
_DEFAULT_MAX = 500
_HARD_MAX = 2000
_REPARSE_ATTR = getattr(stat_mod, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400)


def _fmt_size(size: int) -> str:
    if size < 1024:
        return f"{size} B"
    if size < 1024 ** 2:
        return f"{size / 1024:.1f} KB"
    if size < 1024 ** 3:
        return f"{size / 1024 ** 2:.1f} MB"
    return f"{size / 1024 ** 3:.2f} GB"


def _is_junction(entry: os.DirEntry) -> bool:
    try:
        st = entry.stat(follow_symlinks=False)
        attrs = getattr(st, "st_file_attributes", 0)
        return bool(attrs & _REPARSE_ATTR)
    except (AttributeError, OSError):
        return False


def _soft_percent(files_seen: int, matches: int, max_results: int) -> int:
    if max_results > 0 and matches > 0:
        by_cap = int(100 * matches / max_results)
        if by_cap >= 40:
            return min(99, by_cap)
    return min(95, int(8 + (max(0, files_seen) ** 0.38) * 2.4))


def parse_search_args(root: str, query: str, opts: dict | None) -> tuple[str, str, frozenset[str], int, int] | dict:
    opts = opts or {}
    root_path = safe_resolve_under(root or "")
    if root_path is None or not root_path.is_dir():
        return {"ok": False, "error": "Dossier racine introuvable"}
    root_str = str(root_path)
    if root_str.startswith("\\\\"):
        return {"ok": False, "error": "Chemins reseau UNC refuses"}

    query_lower = (query or "").strip().lower()
    if len(query_lower) > 200:
        return {"ok": False, "error": "Requete trop longue"}
    ext_raw = str(opts.get("ext") or "").strip().lower().lstrip(".")
    ext_list = [e.strip().lstrip(".") for e in ext_raw.split(",") if e.strip()] if ext_raw else []
    if len(ext_list) > 20:
        return {"ok": False, "error": "Trop d'extensions"}
    exts = frozenset(ext_list)
    min_bytes = int(float(opts.get("min_size_mb") or 0) * 1024 * 1024)
    max_results = int(opts.get("max_results") or _DEFAULT_MAX)
    if max_results < 1:
        max_results = _DEFAULT_MAX
    max_results = min(max_results, _HARD_MAX)
    return root_str, query_lower, exts, min_bytes, max_results


def run_search(
    root: str,
    query_lower: str,
    exts: frozenset[str],
    min_bytes: int,
    max_results: int,
    cancel: threading.Event,
    on_progress: Callable[[dict[str, Any]], None] | None = None,
) -> dict[str, Any]:
    results: list[dict] = []
    truncated = False
    files_seen = 0
    dirs_seen = 0
    t0 = time.perf_counter()
    last_prog = 0.0
    cancel_every = 64
    since_cancel = 0

    def bump(force: bool = False) -> None:
        nonlocal last_prog
        now = time.perf_counter()
        if not force and (now - last_prog) < 0.12:
            return
        last_prog = now
        if on_progress is None:
            return
        elapsed_ms = int((now - t0) * 1000)
        on_progress({
            "filesSeen": files_seen,
            "dirsSeen": dirs_seen,
            "matches": len(results),
            "percent": _soft_percent(files_seen, len(results), max_results),
            "elapsedMs": elapsed_ms,
            "done": False,
            "cancelled": cancel.is_set(),
        })

    stack: list[str] = [root]
    try:
        while stack:
            if cancel.is_set():
                break
            dirpath = stack.pop()
            dirs_seen += 1
            try:
                with os.scandir(dirpath) as it:
                    for entry in it:
                        since_cancel += 1
                        if since_cancel >= cancel_every:
                            since_cancel = 0
                            if cancel.is_set():
                                break
                        try:
                            if entry.is_symlink():
                                continue
                            is_dir = entry.is_dir(follow_symlinks=False)
                        except OSError:
                            continue

                        if is_dir:
                            if entry.name in _SKIP_DIRS or _is_junction(entry):
                                continue
                            stack.append(entry.path)
                            continue

                        files_seen += 1
                        if files_seen % 256 == 0:
                            bump()
                        name = entry.name
                        name_lower = name.lower()
                        if query_lower and query_lower not in name_lower:
                            continue
                        if exts:
                            if "." not in name_lower:
                                continue
                            suffix = name_lower.rsplit(".", 1)[-1]
                            if suffix not in exts:
                                continue
                        try:
                            st = entry.stat(follow_symlinks=False)
                        except (PermissionError, OSError):
                            continue
                        size = st.st_size
                        if min_bytes and size < min_bytes:
                            continue
                        results.append({
                            "name": name,
                            "path": entry.path,
                            "size": size,
                            "size_fmt": _fmt_size(size),
                            "mtime": st.st_mtime,
                        })
                        if len(results) >= max_results:
                            truncated = True
                            break
                        bump()
                    if truncated or cancel.is_set():
                        break
            except (PermissionError, OSError):
                continue
            bump()
            if truncated:
                break
    except (PermissionError, OSError):
        pass

    elapsed = int((time.perf_counter() - t0) * 1000)
    payload = {
        "ok": True,
        "results": results,
        "truncated": truncated,
        "count": len(results),
        "elapsedMs": elapsed,
        "cancelled": cancel.is_set(),
        "filesSeen": files_seen,
        "dirsSeen": dirs_seen,
    }
    if on_progress is not None:
        on_progress({
            "filesSeen": files_seen,
            "dirsSeen": dirs_seen,
            "matches": len(results),
            "percent": 100,
            "elapsedMs": elapsed,
            "done": True,
            "cancelled": cancel.is_set(),
        })
    return payload


def open_file(path: str) -> dict[str, Any]:
    try:
        p = safe_resolve_under(path)
        if p is None or not p.is_file() or not is_probably_user_data_path(p):
            return {"ok": False, "error": "chemin invalide"}
        os.startfile(str(p))  # type: ignore[attr-defined]
        return {"ok": True}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


def open_folder_select(path: str) -> dict[str, Any]:
    try:
        raw = (path or "").strip()
        if not raw:
            return {"ok": False, "error": "chemin vide"}
        p = safe_resolve_under(raw)
        if p is None:
            parent = Path(raw).expanduser().parent
            try:
                parent = parent.resolve()
            except (OSError, RuntimeError):
                return {"ok": False, "error": "chemin invalide"}
            if not parent.exists() or str(parent).startswith("\\\\"):
                return {"ok": False, "error": "dossier parent introuvable"}
            subprocess.Popen(["explorer", str(parent)], close_fds=True)
            return {"ok": True, "folder": str(parent)}

        if p.is_file():
            subprocess.Popen(["explorer", f"/select,{p}"], close_fds=True)
            return {"ok": True, "folder": str(p.parent)}

        folder = p if p.is_dir() else p.parent
        if not folder.exists():
            return {"ok": False, "error": "dossier parent introuvable"}
        subprocess.Popen(["explorer", str(folder)], close_fds=True)
        return {"ok": True, "folder": str(folder)}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}
