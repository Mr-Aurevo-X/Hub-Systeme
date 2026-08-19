# Copyright (c) 2026 Mr-Aurevo-X. All rights reserved.
# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# Author: Mr-Aurevo-X | https://github.com/Mr-Aurevo-X

"""DuplicateFinder logic — size twins then SHA-256."""
from __future__ import annotations

import hashlib
import os
import subprocess
from collections import defaultdict
from pathlib import Path
from typing import Any, Callable

_MAX_FILES = 3000
_CHUNK = 1024 * 1024


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


def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        while True:
            chunk = f.read(_CHUNK)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def scan_duplicates(
    folder: str,
    on_progress: Callable[[int, str, str], None] | None = None,
) -> dict[str, Any]:
    def prog(percent: int, phase: str, detail: str = "") -> None:
        if on_progress is not None:
            on_progress(max(0, min(99, int(percent))), phase, detail)

    root = Path(folder or "")
    if not root.is_dir():
        return {"ok": False, "error": "Dossier introuvable"}

    by_size: dict[int, list[Path]] = defaultdict(list)
    scanned = 0
    capped = False
    prog(0, "walk", "0")
    for dirpath, _dirnames, filenames in os.walk(root):
        for name in filenames:
            if scanned >= _MAX_FILES:
                capped = True
                break
            fp = Path(dirpath) / name
            try:
                if not fp.is_file():
                    continue
                size = fp.stat().st_size
                by_size[size].append(fp)
                scanned += 1
                if scanned % 25 == 0 or scanned == 1:
                    pct = int(50 * scanned / _MAX_FILES) if _MAX_FILES else 0
                    prog(pct, "walk", f"{scanned}/{_MAX_FILES}")
            except (PermissionError, OSError):
                continue
        if scanned >= _MAX_FILES:
            capped = True
            break

    prog(50, "hash", "0")
    twin_paths: list[tuple[int, Path]] = []
    for size, paths in by_size.items():
        if len(paths) >= 2:
            for p in paths:
                twin_paths.append((size, p))
    total_twins = len(twin_paths)

    groups: list[dict[str, Any]] = []
    hashed = 0
    for size, paths in by_size.items():
        if len(paths) < 2:
            continue
        by_hash: dict[str, list[Path]] = defaultdict(list)
        for p in paths:
            try:
                digest = _sha256_file(p)
                by_hash[digest].append(p)
            except (PermissionError, OSError):
                pass
            hashed += 1
            if total_twins > 0 and (hashed % 5 == 0 or hashed == total_twins or hashed == 1):
                pct = 50 + int(49 * hashed / total_twins)
                prog(pct, "hash", f"{hashed}/{total_twins}")
        for digest, same in by_hash.items():
            if len(same) < 2:
                continue
            files = [
                {
                    "path": str(p),
                    "name": p.name,
                    "size": size,
                    "sizeLabel": _fmt_bytes(size),
                }
                for p in same
            ]
            groups.append(
                {
                    "hash": digest,
                    "size": size,
                    "sizeLabel": _fmt_bytes(size),
                    "count": len(files),
                    "files": files,
                }
            )

    groups.sort(key=lambda g: (-g["size"], -g["count"], g["hash"]))
    return {
        "ok": True,
        "folder": str(root),
        "scanned": scanned,
        "capped": capped,
        "maxFiles": _MAX_FILES,
        "groups": groups,
        "groupCount": len(groups),
    }


def _ps_single_quote(value: str) -> str:
    return "'" + str(value).replace("'", "''") + "'"


def trash_one(path: Path) -> tuple[bool, str | None]:
    if not path.exists():
        return False, "Chemin introuvable"
    method = "DeleteDirectory" if path.is_dir() else "DeleteFile"
    script = (
        "Add-Type -AssemblyName Microsoft.VisualBasic; "
        f"[Microsoft.VisualBasic.FileIO.FileSystem]::{method}("
        f"{_ps_single_quote(str(path))},'OnlyErrorDialogs','SendToRecycleBin')"
    )
    try:
        proc = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", script],
            capture_output=True,
            timeout=120,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        if proc.returncode != 0:
            err = (proc.stderr or proc.stdout or b"").decode("oem", errors="replace").strip() or f"code {proc.returncode}"
            return False, err
        if path.exists():
            return False, "Toujours présent après envoi à la Corbeille"
        return True, None
    except subprocess.TimeoutExpired:
        return False, "Délai dépassé"
    except OSError as exc:
        return False, str(exc)


def trash_paths(paths: list[str]) -> dict[str, Any]:
    if not isinstance(paths, list):
        return {"ok": False, "error": "Liste de chemins invalide"}
    trashed: list[str] = []
    errors: list[dict[str, str]] = []
    seen: set[str] = set()
    for raw in paths:
        path_str = str(raw or "").strip()
        if not path_str or path_str in seen:
            continue
        seen.add(path_str)
        ok, err = trash_one(Path(path_str))
        if ok:
            trashed.append(path_str)
        else:
            errors.append({"path": path_str, "error": err or "Échec"})
    return {
        "ok": len(errors) == 0,
        "trashed": trashed,
        "count": len(trashed),
        "errors": errors,
        "error": errors[0]["error"] if errors else None,
    }
