"""Ram Cleaner host API — Hub-Systeme namespace `pywebview.api.ramcleaner`."""
from __future__ import annotations

import ctypes
import os
import sys
from pathlib import Path
from typing import Any

import psutil

_BACKEND = Path(__file__).resolve().parents[2]  # backend/
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from security import ConfirmGate  # noqa: E402

from .analyzer import analyze, get_overview, is_protected, load_protect_names  # noqa: E402


class RamCleanerApi:
    """Memory advisor: analyze / ConfirmGate kill+trim batch."""

    ACTIONS = ("kill_selected", "trim_selected")

    def __init__(self, gate: ConfirmGate) -> None:
        self._confirm = gate
        self._protect = load_protect_names()

    def prepare_action(self, action: str, payload: dict | None = None) -> dict:
        act = str(action or "").strip()
        if act not in self.ACTIONS:
            return {"ok": False, "error": f"action inconnue: {act}", "token": None}
        try:
            return {"ok": True, "token": self._confirm.prepare(act, payload or {})}
        except ValueError as exc:
            return {"ok": False, "error": str(exc), "token": None}

    def _consume(self, action: str, payload: dict | None, token: str | None) -> dict | None:
        if not self._confirm.consume(str(token or ""), action, payload or {}):
            return {"ok": False, "error": "Jeton de confirmation invalide ou expire"}
        return None

    @staticmethod
    def _clean_pids(pids: list | None) -> list[int] | None:
        try:
            return sorted({int(p) for p in (pids or []) if int(p) > 0})
        except (TypeError, ValueError):
            return None

    def get_overview(self) -> dict[str, Any]:
        try:
            return get_overview()
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "error": str(exc)}

    def analyze(self) -> dict[str, Any]:
        try:
            self._protect = load_protect_names()
            return analyze()
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "error": str(exc)}

    def prepare_kill(self, pids: list | None = None) -> dict[str, Any]:
        clean = self._clean_pids(pids)
        if clean is None:
            return {"ok": False, "error": "PIDs invalides", "token": None}
        if not clean:
            return {"ok": False, "error": "Aucun PID", "token": None}
        payload = {"pids": clean}
        try:
            token = self._confirm.prepare("kill_selected", payload)
            return {"ok": True, "token": token, "pids": clean}
        except ValueError as exc:
            return {"ok": False, "error": str(exc), "token": None}

    def kill_selected(self, pids: list | None = None, token: str | None = None) -> dict[str, Any]:
        clean = self._clean_pids(pids)
        if clean is None:
            return {"ok": False, "error": "PIDs invalides"}
        payload = {"pids": clean}
        denied = self._consume("kill_selected", payload, token)
        if denied is not None:
            return denied
        killed: list[dict[str, Any]] = []
        failed: list[dict[str, Any]] = []
        for pid in clean:
            if pid == os.getpid():
                failed.append({"pid": pid, "error": "Impossible de tuer le hub"})
                continue
            try:
                p = psutil.Process(pid)
                name = p.name()
                if is_protected(pid, name, self._protect):
                    failed.append({"pid": pid, "error": f"Processus protege: {name}"})
                    continue
                p.terminate()
                try:
                    p.wait(timeout=2)
                except psutil.TimeoutExpired:
                    p.kill()
                killed.append({"pid": pid, "name": name})
            except psutil.Error as exc:
                failed.append({"pid": pid, "error": str(exc)})
        return {"ok": True, "killed": killed, "failed": failed, "killedCount": len(killed)}

    def prepare_trim(self, pids: list | None = None) -> dict[str, Any]:
        clean = self._clean_pids(pids)
        if clean is None:
            return {"ok": False, "error": "PIDs invalides", "token": None}
        if not clean:
            return {"ok": False, "error": "Aucun PID", "token": None}
        payload = {"pids": clean}
        try:
            token = self._confirm.prepare("trim_selected", payload)
            return {"ok": True, "token": token, "pids": clean}
        except ValueError as exc:
            return {"ok": False, "error": str(exc), "token": None}

    def trim_selected(self, pids: list | None = None, token: str | None = None) -> dict[str, Any]:
        """EmptyWorkingSet on selected PIDs (soft — no kill)."""
        clean = self._clean_pids(pids)
        if clean is None:
            return {"ok": False, "error": "PIDs invalides"}
        payload = {"pids": clean}
        denied = self._consume("trim_selected", payload, token)
        if denied is not None:
            return denied
        trimmed: list[dict[str, Any]] = []
        failed: list[dict[str, Any]] = []
        for pid in clean:
            if pid == os.getpid():
                failed.append({"pid": pid, "error": "Impossible de trim le hub"})
                continue
            try:
                process = psutil.Process(pid)
                name = process.name()
                if is_protected(pid, name, self._protect):
                    failed.append({"pid": pid, "error": f"Processus protege: {name}"})
                    continue
                handle = getattr(process, "_proc_handle", None)
                if handle is None:
                    process_set_quota = 0x0100
                    process_query_information = 0x0400
                    h = ctypes.windll.kernel32.OpenProcess(
                        process_set_quota | process_query_information,
                        False,
                        pid,
                    )
                    if not h:
                        raise OSError("OpenProcess failed")
                    try:
                        ok = bool(ctypes.windll.psapi.EmptyWorkingSet(h))
                        if not ok:
                            raise ctypes.WinError()
                    finally:
                        ctypes.windll.kernel32.CloseHandle(h)
                else:
                    ok = bool(ctypes.windll.psapi.EmptyWorkingSet(handle))
                    if not ok:
                        raise ctypes.WinError()
                trimmed.append({"pid": pid, "name": name})
            except (psutil.Error, OSError) as exc:
                failed.append({"pid": pid, "error": str(exc)})
        return {"ok": True, "trimmed": trimmed, "failed": failed, "trimmedCount": len(trimmed)}
