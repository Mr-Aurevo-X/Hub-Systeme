# Copyright (c) 2026 Mr-Aurevo-X. All rights reserved.
# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# Author: Mr-Aurevo-X | https://github.com/Mr-Aurevo-X

"""EmptyFolders logic — find empty dirs + recycle."""
from __future__ import annotations

from pathlib import Path
from typing import Any, Callable

from .bigfiles import _path_forbidden, recycle_path


def find_empty(root: str, on_progress: Callable[[int, str], None] | None = None) -> dict[str, Any]:
    root_path = Path((root or "").strip() or str(Path.home()))
    if not root_path.is_dir():
        return {"ok": False, "error": "Dossier introuvable"}
    empties: list[str] = []
    dirs_seen = 0
    for dirpath, _dirnames, _filenames in os_walk_bottom(root_path):
        low = dirpath.lower()
        if "\\$recycle.bin" in low or "\\system volume information" in low:
            continue
        dirs_seen += 1
        try:
            entries = list(Path(dirpath).iterdir())
        except OSError:
            continue
        if not entries:
            empties.append(dirpath)
        if on_progress and dirs_seen % 8 == 0:
            pct = min(99, dirs_seen * 2)
            detail = dirpath
            if len(detail) > 72:
                detail = "…" + detail[-69:]
            on_progress(pct, detail)
    return {
        "ok": True,
        "folders": [{"path": p} for p in empties],
        "count": len(empties),
        "root": str(root_path),
    }


def os_walk_bottom(root_path: Path):
    import os

    return os.walk(root_path, topdown=False, followlinks=False)


def delete_folder(path: str) -> dict[str, Any]:
    try:
        p = Path((path or "").strip())
        if not p.is_dir():
            return {"ok": False, "error": "Dossier introuvable"}
        forbidden = _path_forbidden(p)
        if forbidden:
            return {"ok": False, "error": forbidden}
        resolved = p.expanduser().resolve(strict=True)
        if not resolved.is_dir():
            return {"ok": False, "error": "Dossier introuvable"}
        if any(resolved.iterdir()):
            return {"ok": False, "error": "Le dossier n'est pas vide"}
        ok, err = recycle_path(resolved)
        if not ok:
            return {"ok": False, "error": err}
        return {"ok": True, "path": str(resolved)}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}
