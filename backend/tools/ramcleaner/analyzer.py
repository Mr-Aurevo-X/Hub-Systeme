# Copyright (c) 2026 Mr-Aurevo-X. All rights reserved.
# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# Author: Mr-Aurevo-X | https://github.com/Mr-Aurevo-X

"""Ram Cleaner — scan + classify processes for safe end-task recommendations.

Adapted from Lab/Ram Cleaner SoT for Hub-Systeme in-process use.
Paths resolve from this package (Path(__file__)), never from CWD.
"""
from __future__ import annotations

import json
import os
import time
from collections import defaultdict
from pathlib import Path
from typing import Any

import psutil

# High-RAM apps that are usually intentional — caution, never auto-checked
_CAUTION_FAMILIES = frozenset(
    {
        "brave",
        "brave.exe",
        "chrome",
        "chrome.exe",
        "msedge",
        "msedge.exe",
        "msedgewebview2",
        "msedgewebview2.exe",
        "discord",
        "discord.exe",
        "cursor",
        "cursor.exe",
        "steam",
        "steam.exe",
        "steamwebhelper",
        "steamwebhelper.exe",
        "code",
        "code.exe",
        "node",
        "node.exe",
        "cmd",
        "cmd.exe",
        "powershell",
        "powershell.exe",
        "pwsh",
        "pwsh.exe",
        "pccommand",
        "pccommand.exe",
    }
)

_GAME_HINTS = (
    "steam.exe",
    "epicgameslauncher.exe",
    "fortniteclient",
    "valorant",
    "cs2.exe",
    "r5apex",
    "gta5.exe",
    "eldenring",
)

# Duplicates only auto-recommended when cmdline looks like a user script/host
_DUP_CMD_HINTS = (
    "host.py",
    ".py",
    "\\host\\",
    "/host/",
)


def package_dir() -> Path:
    return Path(__file__).resolve().parent


def lists_dir() -> Path:
    return package_dir() / "lists"


def load_protect_names(path: Path | None = None) -> frozenset[str]:
    p = path or (lists_dir() / "protect-names.txt")
    names: set[str] = set()
    if p.is_file():
        for line in p.read_text(encoding="utf-8", errors="replace").splitlines():
            s = line.strip()
            if not s or s.startswith("#"):
                continue
            names.add(s.lower())
            if not s.lower().endswith(".exe") and " " not in s:
                names.add(s.lower() + ".exe")
    # Always protect packaged self-name + hub host binary names
    names.add("ramcleaner.exe")
    names.add("pccommand.exe")
    return frozenset(names)


def load_soft_targets(path: Path | None = None) -> list[dict[str, Any]]:
    p = path or (lists_dir() / "soft-targets.json")
    if not p.is_file():
        return []
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
        return list(data) if isinstance(data, list) else []
    except (OSError, json.JSONDecodeError):
        return []


def _norm_name(name: str) -> str:
    return (name or "").strip().lower()


def is_protected(pid: int, name: str, protect: frozenset[str] | None = None) -> bool:
    if pid in (0, 4) or pid == os.getpid():
        return True
    prot = protect if protect is not None else load_protect_names()
    base = _norm_name(name)
    if base in prot:
        return True
    # Memory Compression etc. without .exe
    if base.replace(".exe", "") in prot:
        return True
    return False


def _cmdline_key(cmdline: list[str] | None) -> str:
    if not cmdline:
        return ""
    parts = [p.strip().strip('"').lower() for p in cmdline if p]
    return " ".join(parts)


def _family_key(name: str) -> str:
    base = Path(_norm_name(name)).stem
    return base or "unknown"


def _detect_fullscreen_game() -> bool:
    """Best-effort: known game/launcher processes running."""
    try:
        for p in psutil.process_iter(["name"]):
            n = _norm_name(p.info.get("name") or "")
            if any(h in n for h in _GAME_HINTS):
                if n in ("steam.exe", "epicgameslauncher.exe"):
                    continue
                return True
    except (psutil.Error, OSError):
        pass
    return False


def _proc_snapshot() -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    now = time.time()
    for p in psutil.process_iter(["pid", "name", "cmdline", "create_time", "memory_info"]):
        try:
            info = p.info
            pid = int(info["pid"])
            name = info.get("name") or ""
            mem = info.get("memory_info")
            ws = int(getattr(mem, "rss", 0) or 0) if mem else 0
            create = float(info.get("create_time") or now)
            age = max(0.0, now - create)
            cmdline = info.get("cmdline") or []
            if not isinstance(cmdline, list):
                cmdline = []
            out.append(
                {
                    "pid": pid,
                    "name": name,
                    "cmdline": cmdline,
                    "ws": ws,
                    "age": age,
                    "cpu": 0.0,
                }
            )
        except (psutil.Error, TypeError, ValueError):
            continue
    return out


def get_overview() -> dict[str, Any]:
    vm = psutil.virtual_memory()
    procs = _proc_snapshot()
    families: dict[str, dict[str, Any]] = {}
    for pr in procs:
        key = _family_key(pr["name"])
        slot = families.setdefault(key, {"name": key, "count": 0, "ws": 0, "pids": []})
        slot["count"] += 1
        slot["ws"] += pr["ws"]
        if len(slot["pids"]) < 8:
            slot["pids"].append(pr["pid"])
    top = sorted(families.values(), key=lambda x: x["ws"], reverse=True)[:20]
    for t in top:
        t["wsMb"] = round(t["ws"] / (1024 * 1024), 1)
        del t["ws"]
    return {
        "ok": True,
        "totalMb": round(vm.total / (1024 * 1024), 1),
        "usedMb": round(vm.used / (1024 * 1024), 1),
        "availableMb": round(vm.available / (1024 * 1024), 1),
        "percent": float(vm.percent),
        "topFamilies": top,
    }


def analyze() -> dict[str, Any]:
    protect = load_protect_names()
    soft = load_soft_targets()
    procs = _proc_snapshot()
    game_running = _detect_fullscreen_game()
    recommendations: list[dict[str, Any]] = []
    caution: list[dict[str, Any]] = []
    used_pids: set[int] = set()

    # --- Duplicate same image + cmdline (keep lowest PID) ---
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for pr in procs:
        if is_protected(pr["pid"], pr["name"], protect):
            continue
        key = _norm_name(pr["name"]) + "|" + _cmdline_key(pr["cmdline"])
        if not pr["cmdline"] and pr["ws"] < 30 * 1024 * 1024:
            continue
        groups[key].append(pr)

    for key, members in groups.items():
        if len(members) < 2:
            continue
        members_sorted = sorted(members, key=lambda m: m["pid"])
        keep = members_sorted[0]
        extras = members_sorted[1:]
        fam = _family_key(keep["name"])
        cmd_joined = _cmdline_key(keep.get("cmdline"))
        looks_like_script = any(h in cmd_joined for h in _DUP_CMD_HINTS)
        if fam in _CAUTION_FAMILIES or (fam + ".exe") in _CAUTION_FAMILIES:
            continue
        if not keep.get("cmdline"):
            if len(members) < 3:
                continue
            freed_tmp = sum(m["ws"] for m in extras)
            if freed_tmp < 80 * 1024 * 1024:
                continue
            continue
        if not looks_like_script and len(members) < 4:
            continue
        if not looks_like_script:
            continue
        pids = [m["pid"] for m in extras]
        freed = sum(m["ws"] for m in extras)
        title_hint = ""
        cmd = keep.get("cmdline") or []
        for part in cmd:
            pl = part.lower()
            if "host.py" in pl or pl.endswith(".py"):
                title_hint = Path(part).name
                break
        name = keep["name"]
        title = f"{name} (doublons)"
        if title_hint:
            title = f"{title_hint} — {name} (doublons)"
        reason = f"{len(extras)} instance(s) en trop du même processus (garde PID {keep['pid']})"
        rec = {
            "id": f"dup-{abs(hash(key)) % 10_000_000}",
            "tier": "recommend",
            "title": title,
            "reason": reason,
            "pids": pids,
            "estFreedMb": round(freed / (1024 * 1024), 1),
            "defaultChecked": True,
        }
        recommendations.append(rec)
        used_pids.update(pids)

    # --- Soft targets ---
    for rule in soft:
        match_names = {_norm_name(n) for n in (rule.get("matchNames") or [])}
        if not match_names:
            continue
        if rule.get("requireNoFullscreenGame") and game_running:
            continue
        matched = [
            pr
            for pr in procs
            if _norm_name(pr["name"]) in match_names
            and pr["pid"] not in used_pids
            and not is_protected(pr["pid"], pr["name"], protect)
        ]
        if not matched:
            continue
        min_age = float(rule.get("minAgeSeconds") or 0)
        if min_age:
            matched = [m for m in matched if m["age"] >= min_age]
        if not matched:
            continue
        tier = str(rule.get("tier") or "recommend")
        pids = [m["pid"] for m in matched]
        freed = sum(m["ws"] for m in matched)
        row = {
            "id": str(rule.get("id") or f"soft-{pids[0]}"),
            "tier": tier,
            "title": str(rule.get("title") or matched[0]["name"]),
            "reason": str(rule.get("reason") or "Cible soft-target"),
            "pids": pids,
            "estFreedMb": round(freed / (1024 * 1024), 1),
            "defaultChecked": tier == "recommend",
        }
        if tier == "recommend":
            recommendations.append(row)
        else:
            caution.append(row)
        used_pids.update(pids)

    # --- Caution families (high RAM intentional apps) ---
    by_family: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for pr in procs:
        fam = _family_key(pr["name"])
        if fam + ".exe" in _CAUTION_FAMILIES or fam in _CAUTION_FAMILIES:
            if pr["pid"] not in used_pids and not is_protected(pr["pid"], pr["name"], protect):
                by_family[fam].append(pr)
    for fam, members in by_family.items():
        if not members:
            continue
        freed = sum(m["ws"] for m in members)
        if freed < 200 * 1024 * 1024:
            continue
        caution.append(
            {
                "id": f"family-{fam}",
                "tier": "caution",
                "title": f"{fam} ({len(members)} processus)",
                "reason": "Gros consommateur probablement voulu — ferme l'app / les onglets plutôt que de tuer",
                "pids": [m["pid"] for m in members],
                "estFreedMb": round(freed / (1024 * 1024), 1),
                "defaultChecked": False,
            }
        )

    recommendations.sort(key=lambda r: r.get("estFreedMb", 0), reverse=True)
    caution.sort(key=lambda r: r.get("estFreedMb", 0), reverse=True)

    overview = get_overview()
    return {
        "ok": True,
        "overview": overview,
        "recommendations": recommendations,
        "caution": caution,
        "gameDetected": game_running,
    }
