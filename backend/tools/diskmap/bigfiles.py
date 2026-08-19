# Copyright (c) 2026 Mr-Aurevo-X. All rights reserved.
# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# Author: Mr-Aurevo-X | https://github.com/Mr-Aurevo-X

"""BigFiles logic — top-N large files under a root (read-only walk + recycle)."""
from __future__ import annotations

import os
import subprocess
from pathlib import Path
from typing import Any, Callable


def _path_forbidden(path: Path) -> str | None:
    try:
        resolved = path.expanduser().resolve(strict=False)
    except OSError:
        return "Chemin invalide"
    if resolved.parent == resolved:
        return "Racine de lecteur interdite"
    windir = Path(os.environ.get("WINDIR", r"C:\Windows"))
    blocked: list[Path] = [
        windir,
        Path(os.environ.get("ProgramFiles", r"C:\Program Files")),
        Path(os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)")),
        Path(os.environ.get("ProgramData", r"C:\ProgramData")),
        Path(r"C:\System Volume Information"),
        Path(r"C:\Recovery"),
        Path(r"C:\Boot"),
        Path(r"C:\EFI"),
        Path(r"C:\$Recycle.Bin"),
    ]
    for root in blocked:
        try:
            root_r = root.resolve(strict=False)
        except OSError:
            continue
        try:
            resolved.relative_to(root_r)
            return "Chemin système protégé"
        except ValueError:
            pass
    return None


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


def recycle_path(resolved: Path) -> tuple[bool, str]:
    env = os.environ.copy()
    env["MRAUREVOX_RECYCLE_PATH"] = str(resolved)
    script = (
        "$p = $env:MRAUREVOX_RECYCLE_PATH; "
        "if (-not $p) { throw 'empty path' }; "
        "$shell = New-Object -ComObject Shell.Application; "
        "$folder = $shell.NameSpace(10); "
        "$folder.MoveHere((Resolve-Path -LiteralPath $p).Path); "
        "'OK'"
    )
    proc = subprocess.run(
        ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
        capture_output=True,
        timeout=60,
        env=env,
        creationflags=subprocess.CREATE_NO_WINDOW if hasattr(subprocess, "CREATE_NO_WINDOW") else 0,
    )
    out = _decode_cli(proc.stdout).strip()
    if out == "OK" or not resolved.exists():
        return True, ""
    return False, out or (proc.stderr or b"").decode("oem", errors="replace").strip() or "Recycle failed"


def scan_large(
    root: str,
    top_n: int = 50,
    min_mb: float = 50,
    on_progress: Callable[[int, str], None] | None = None,
) -> dict[str, Any]:
    root_path = Path((root or "").strip() or str(Path.home()))
    if not root_path.is_dir():
        return {"ok": False, "error": "Dossier introuvable"}
    top_n = max(1, min(int(top_n or 50), 500))
    min_bytes = int(float(min_mb or 0) * 1024 * 1024)
    found: list[tuple[int, str]] = []
    dirs_seen = 0
    files_seen = 0
    for dirpath, _dirnames, filenames in os.walk(root_path, topdown=True, followlinks=False):
        low = dirpath.lower()
        if "\\$recycle.bin" in low or "\\system volume information" in low:
            continue
        dirs_seen += 1
        for name in filenames:
            files_seen += 1
            fp = Path(dirpath) / name
            try:
                size = fp.stat().st_size
            except OSError:
                continue
            if size < min_bytes:
                continue
            found.append((size, str(fp)))
            if len(found) > top_n * 20:
                found.sort(key=lambda x: -x[0])
                found = found[: top_n * 5]
        if on_progress and (dirs_seen % 8 == 0 or files_seen % 200 == 0):
            pct = min(99, max(dirs_seen * 2, int(8 + (files_seen**0.42) * 1.8)))
            detail = dirpath
            if len(detail) > 72:
                detail = "…" + detail[-69:]
            on_progress(pct, detail)
    found.sort(key=lambda x: -x[0])
    rows = [{"path": p, "size": s, "sizeMb": round(s / (1024 * 1024), 2)} for s, p in found[:top_n]]
    return {"ok": True, "files": rows, "count": len(rows), "root": str(root_path)}


def delete_file(path: str) -> dict[str, Any]:
    try:
        p = Path((path or "").strip())
        if not p.is_file():
            return {"ok": False, "error": "Fichier introuvable"}
        forbidden = _path_forbidden(p)
        if forbidden:
            return {"ok": False, "error": forbidden}
        resolved = p.expanduser().resolve(strict=True)
        if not resolved.is_file():
            return {"ok": False, "error": "Fichier introuvable"}
        ok, err = recycle_path(resolved)
        if not ok:
            return {"ok": False, "error": err}
        return {"ok": True, "path": str(resolved)}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}
