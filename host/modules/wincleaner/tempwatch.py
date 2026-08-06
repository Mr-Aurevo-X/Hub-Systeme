"""TempWatch — size of common temp folders."""
from __future__ import annotations
import os
from pathlib import Path
from typing import Any

def temp_sizes() -> dict[str, Any]:
    try:
        candidates = [
            Path(os.environ.get("TEMP") or os.environ.get("TMP") or "."),
            Path(os.environ.get("WINDIR", r"C:\\Windows")) / "Temp",
            Path(os.environ.get("LOCALAPPDATA", "")) / "Temp",
        ]
        rows = []
        seen = set()
        for p in candidates:
            try:
                p = p.resolve()
            except OSError:
                continue
            key = str(p).lower()
            if key in seen or not p.is_dir():
                continue
            seen.add(key)
            total = 0
            files = 0
            for dirpath, _dns, fnames in os.walk(p, followlinks=False):
                for fn in fnames:
                    fp = Path(dirpath) / fn
                    try:
                        total += fp.stat().st_size
                        files += 1
                    except OSError:
                        continue
            rows.append({
                "path": str(p),
                "bytes": total,
                "sizeMb": round(total / (1024 * 1024), 2),
                "files": files,
            })
        return {"ok": True, "folders": rows, "count": len(rows)}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}

def open_folder(path: str) -> dict[str, Any]:
    try:
        from security import safe_open_path

        safe, err = safe_open_path(path, deny_exec=True)
        if safe is None:
            return {"ok": False, "error": err or "Chemin refuse"}
        if not safe.is_dir():
            return {"ok": False, "error": "Dossier introuvable"}
        os.startfile(str(safe))  # type: ignore[attr-defined]
        return {"ok": True}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}
