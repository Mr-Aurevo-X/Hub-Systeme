# Copyright (c) 2026 Mr-Aurevo-X. All rights reserved.
# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# Author: Mr-Aurevo-X | https://github.com/Mr-Aurevo-X

"""SpaceDiff logic — snapshot / compare fixed-drive usage."""
from __future__ import annotations

import ctypes
import json
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def _local_appdata() -> Path:
    local = os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")
    return Path(local) / "Mr-Aurevo-X"


def snapshot_path() -> Path:
    return _local_appdata() / "SpaceDiff" / "snapshot.json"


def _drive_type_fixed(path: str) -> bool:
    try:
        dt = ctypes.windll.kernel32.GetDriveTypeW(path)
        return int(dt) == 3
    except Exception:
        return False


def measure_drives() -> list[dict[str, Any]]:
    drives: list[dict[str, Any]] = []
    for letter in "ABCDEFGHIJKLMNOPQRSTUVWXYZ":
        root = f"{letter}:\\"
        if not os.path.exists(root):
            continue
        if not _drive_type_fixed(root):
            continue
        try:
            total, used, free = shutil.disk_usage(root)
            drives.append(
                {
                    "letter": letter,
                    "root": root,
                    "totalBytes": int(total),
                    "usedBytes": int(used),
                    "freeBytes": int(free),
                }
            )
        except OSError:
            pass
    return drives


def take_snapshot() -> dict[str, Any]:
    try:
        drives = measure_drives()
        payload = {
            "capturedAt": datetime.now(timezone.utc).isoformat(),
            "drives": drives,
        }
        path = snapshot_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        return {"ok": True, "path": str(path), "capturedAt": payload["capturedAt"], "drives": drives}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


def compare_snapshot() -> dict[str, Any]:
    try:
        current = measure_drives()
        path = snapshot_path()
        if not path.is_file():
            return {
                "ok": True,
                "hasSnapshot": False,
                "current": current,
                "deltas": [],
                "capturedAt": None,
            }
        saved = json.loads(path.read_text(encoding="utf-8-sig"))
        old_map = {d.get("letter"): d for d in (saved.get("drives") or []) if d.get("letter")}
        deltas: list[dict[str, Any]] = []
        for cur in current:
            letter = cur.get("letter")
            prev = old_map.get(letter) or {}
            deltas.append(
                {
                    "letter": letter,
                    "root": cur.get("root"),
                    "totalBytes": cur.get("totalBytes"),
                    "usedBytes": cur.get("usedBytes"),
                    "freeBytes": cur.get("freeBytes"),
                    "prevUsedBytes": prev.get("usedBytes"),
                    "prevFreeBytes": prev.get("freeBytes"),
                    "deltaUsedBytes": int(cur.get("usedBytes") or 0) - int(prev.get("usedBytes") or 0),
                    "deltaFreeBytes": int(cur.get("freeBytes") or 0) - int(prev.get("freeBytes") or 0),
                }
            )
        return {
            "ok": True,
            "hasSnapshot": True,
            "capturedAt": saved.get("capturedAt"),
            "snapshotPath": str(path),
            "current": current,
            "deltas": deltas,
        }
    except Exception as exc:
        return {"ok": False, "error": str(exc), "deltas": []}
