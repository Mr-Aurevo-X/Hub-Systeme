"""UninstX -- Windows uninstall manager host (pywebview)."""
from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import winreg
from pathlib import Path
from typing import Any

import webview

_BACKEND = Path(__file__).resolve().parents[2]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from window_chrome import WindowChromeMixin, create_tool_window  # noqa: E402

from security import (  # noqa: E402
    ConfirmGate,
    is_probably_user_data_path,
    parse_uninstall_command,
    safe_resolve_under,
)


def _app_catalog_id(display_name: str, uninstall_string: str) -> str:
    raw = f"{display_name}|{uninstall_string}".encode("utf-8", errors="replace")
    return hashlib.sha256(raw).hexdigest()[:16]

DEFAULT_ACCENT = "#e03545"
ENV_ACCENT = "MRAUREVOX_ACCENT"
ENV_LANG = "MRAUREVOX_LANG"

_UNINSTALL_PATHS: list[tuple[int, str]] = [
    (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
    (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"),
    (winreg.HKEY_CURRENT_USER, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
]


def app_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    # backend/tools/uninstx → Hub-Systeme/
    return Path(__file__).resolve().parents[3]


def ui_dir() -> Path:
    external = app_dir() / "ui"
    if (external / "index.html").is_file():
        return external
    if getattr(sys, "frozen", False):
        base = Path(getattr(sys, "_MEIPASS", app_dir()))
        nested = base / "ui"
        return nested if nested.is_dir() else base
    return app_dir() / "ui"


def resolve_suite_accent(default: str = DEFAULT_ACCENT) -> str:
    env = (os.environ.get(ENV_ACCENT) or "").strip()
    if env.startswith("#") and len(env) in (4, 7):
        return env
    local = os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")
    path = Path(local) / "Mr-Aurevo-X" / "user-settings.json"
    if path.is_file():
        try:
            loaded = json.loads(path.read_text(encoding="utf-8-sig"))
            accent = str((loaded or {}).get("accent") or "").strip()
            if accent.startswith("#") and len(accent) in (4, 7):
                return accent
        except (OSError, json.JSONDecodeError, TypeError):
            pass
    return default


def resolve_suite_language(default: str = "fr") -> str:
    env = (os.environ.get(ENV_LANG) or "").strip().lower()
    if env in ("fr", "en"):
        return env
    local = os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")
    path = Path(local) / "Mr-Aurevo-X" / "user-settings.json"
    if path.is_file():
        try:
            loaded = json.loads(path.read_text(encoding="utf-8-sig"))
            lang = str((loaded or {}).get("language") or "").strip().lower()
            if lang in ("fr", "en"):
                return lang
        except (OSError, json.JSONDecodeError, TypeError):
            pass
    return default if default in ("fr", "en") else "fr"


def _reg_str(key: winreg.HKEYType, name: str) -> str:
    try:
        val, _ = winreg.QueryValueEx(key, name)
        return str(val or "")
    except OSError:
        return ""


def _reg_int(key: winreg.HKEYType, name: str) -> int:
    try:
        val, _ = winreg.QueryValueEx(key, name)
        return int(val)
    except (OSError, ValueError, TypeError):
        return 0


def _collect_apps() -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    seen: set[str] = set()

    for hive, base_path in _UNINSTALL_PATHS:
        hive_name = "HKLM" if hive == winreg.HKEY_LOCAL_MACHINE else "HKCU"
        try:
            base = winreg.OpenKey(hive, base_path)
        except OSError:
            continue
        with base:
            idx = 0
            while True:
                try:
                    sub_name = winreg.EnumKey(base, idx)
                    idx += 1
                except OSError:
                    break
                uid = f"{hive_name}\\{sub_name}"
                if uid in seen:
                    continue
                seen.add(uid)
                try:
                    with winreg.OpenKey(base, sub_name) as sub:
                        if _reg_int(sub, "SystemComponent"):
                            continue
                        display_name = _reg_str(sub, "DisplayName")
                        if not display_name:
                            continue
                        uninstall = _reg_str(sub, "UninstallString")
                        entries.append({
                            # Unique across HKLM / HKCU (and WoW) — UI lookups use this
                            "key": uid,
                            "id": _app_catalog_id(display_name, uninstall),
                            "reg_key": sub_name,
                            "name": display_name,
                            "version": _reg_str(sub, "DisplayVersion"),
                            "publisher": _reg_str(sub, "Publisher"),
                            "uninstall": uninstall,
                            "location": _reg_str(sub, "InstallLocation"),
                            "hive": hive_name,
                        })
                except OSError:
                    pass

    entries.sort(key=lambda x: x["name"].lower())
    return entries


_NOISE_TOKENS = frozenset({
    "microsoft", "windows", "program", "programs", "files", "software",
    "driver", "drivers", "update", "updates", "runtime", "runtimes",
    "redistributable", "package", "packages", "installer", "setup",
    "corp", "corporation", "inc", "ltd", "gmbh", "llc", "the", "and",
    "for", "app", "apps", "version", "studio", "tools", "tool",
    "common", "system", "shared", "client", "server", "sdk", "api",
})


def _leftover_tokens(app_name: str) -> list[str]:
    name_lower = (app_name or "").strip().lower()
    raw = [w for w in name_lower.replace("-", " ").replace("_", " ").split() if len(w) >= 3]
    tokens = [w for w in raw if w not in _NOISE_TOKENS]
    if not tokens:
        # Fall back to longest raw token, else a short prefix of the name
        if raw:
            tokens = [max(raw, key=len)]
        elif len(name_lower) >= 3:
            tokens = [name_lower[: min(12, len(name_lower))]]
        else:
            tokens = [name_lower] if name_lower else []
    return tokens


def _leftover_roots() -> list[Path]:
    roots = []
    for env in ("PROGRAMFILES", "PROGRAMFILES(X86)"):
        val = os.environ.get(env)
        if val:
            roots.append(Path(val))
    local = os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")
    roaming = os.environ.get("APPDATA") or str(Path.home() / "AppData" / "Roaming")
    roots.append(Path(local))
    roots.append(Path(roaming))
    return roots


class Api(WindowChromeMixin):
    def __init__(self) -> None:
        self._window: Any = None
        self._maximized = False
        self._catalog: dict[str, str] = {}
        self._confirm = ConfirmGate(ttl_seconds=90.0)

    def set_window(self, window: Any) -> None:
        WindowChromeMixin.set_window(self, window)

    def get_suite_settings(self) -> dict:
        return {"ok": True, "accent": resolve_suite_accent(), "language": resolve_suite_language()}

    def get_suite_accent(self) -> dict:
        return {"ok": True, "accent": resolve_suite_accent()}

    def get_suite_language(self) -> dict:
        return {"ok": True, "language": resolve_suite_language()}

    def list_apps(self, query: str = "") -> dict:
        try:
            apps = _collect_apps()
            catalog: dict[str, str] = {}
            for a in apps:
                aid = str(a.get("id") or "")
                uninstall = str(a.get("uninstall") or "")
                if aid and uninstall:
                    catalog[aid] = uninstall
            self._catalog = catalog
            q = (query or "").strip().lower()
            if q:
                apps = [
                    a for a in apps
                    if q in a["name"].lower()
                    or q in a["publisher"].lower()
                    or q in a["version"].lower()
                ]
            return {"ok": True, "apps": apps, "count": len(apps)}
        except Exception as exc:
            return {"ok": False, "error": str(exc)}

    @staticmethod
    def _uninstall_payload(app_id: str) -> dict[str, str]:
        return {"app_id": str(app_id or "").strip()}

    def prepare_uninstall_app(self, app_id: str) -> dict:
        """Issue a short-lived ConfirmGate token for uninstall_app (UI confirm alone is not enough)."""
        key = (app_id or "").strip()
        if not key:
            return {"ok": False, "error": "app_id requis", "token": None}
        if key not in self._catalog:
            return {"ok": False, "error": "app_id inconnu — rafraichir la liste", "token": None}
        try:
            token = self._confirm.prepare("uninstall_app", self._uninstall_payload(key))
            return {"ok": True, "token": token, "error": None}
        except ValueError as exc:
            return {"ok": False, "error": str(exc), "token": None}

    def uninstall_app(self, app_id: str, token: str | None = None, *_unused: Any) -> dict:
        # Prefer catalog app_id. Reject raw UninstallString (legacy UI).
        key = (app_id or "").strip()
        if not key:
            return {"ok": False, "error": "app_id requis"}
        payload = self._uninstall_payload(key)
        if not self._confirm.consume(str(token or ""), "uninstall_app", payload):
            return {"ok": False, "error": "Jeton de confirmation invalide ou expire"}
        cmd = self._catalog.get(key)
        if cmd is None:
            looks_like_cmd = (
                len(key) > 24
                or "\\" in key
                or "/" in key
                or key.lower().startswith("msiexec")
                or ".exe" in key.lower()
            )
            if looks_like_cmd:
                return {
                    "ok": False,
                    "error": "Desinstallation refusee: passer app.id (catalogue), pas UninstallString",
                }
            return {"ok": False, "error": "app_id inconnu — rafraichir la liste"}
        argv, err = parse_uninstall_command(cmd)
        if not argv:
            return {"ok": False, "error": err or "Commande de desinstallation refusee"}
        try:
            subprocess.Popen(
                argv,
                shell=False,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            return {"ok": True, "started": True}
        except Exception as exc:
            return {"ok": False, "error": str(exc)}

    def scan_leftovers(self, app_name: str, install_location: str = "") -> dict:
        name = (app_name or "").strip()
        if not name:
            return {"ok": False, "error": "Nom vide"}

        tokens = _leftover_tokens(name)
        if not tokens:
            return {"ok": True, "paths": []}

        found: list[str] = []

        for root in _leftover_roots():
            if not root.is_dir():
                continue
            try:
                for child in root.iterdir():
                    if not child.is_dir():
                        continue
                    child_lower = child.name.lower()
                    if any(kw in child_lower for kw in tokens):
                        found.append(str(child))
            except (PermissionError, OSError):
                continue

        if install_location:
            loc = Path(install_location)
            if loc.exists():
                found.append(str(loc))

        seen_low: set[str] = set()
        deduped: list[str] = []
        for p in found:
            key = p.lower()
            if key not in seen_low:
                seen_low.add(key)
                deduped.append(p)

        return {"ok": True, "paths": deduped}

    def open_folder(self, path: str) -> dict:
        try:
            resolved = safe_resolve_under(path)
            if resolved is None or not is_probably_user_data_path(resolved):
                return {"ok": False, "error": "Chemin invalide"}
            target = resolved.parent if resolved.is_file() else resolved
            if not target.exists():
                return {"ok": False, "error": "Chemin introuvable"}
            os.startfile(str(target))
            return {"ok": True}
        except Exception as exc:
            return {"ok": False, "error": str(exc)}


def main() -> None:
    index = ui_dir() / "index.html"
    if not index.is_file():
        raise SystemExit(f"UI introuvable: {index}")

    api = Api()
    create_tool_window(
        title="UninstX — L'Atelier PC Command",
        url=index.as_uri(),
        js_api=api,
        background_color='#06070c',
    )
    webview.start()


if __name__ == "__main__":
    main()
