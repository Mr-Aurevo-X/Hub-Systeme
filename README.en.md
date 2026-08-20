[Français](README.md) · [English](README.en.md)

# Hub-Systeme — PC Command

**Read-only** distribution. No pull requests or issues (`CONTRIBUTING.md`).

**System** hub — Dashboard + native modules (`host.py` / `backend/`).  
License: PolyForm Noncommercial 1.0.0. Publisher: **Mr-Aurevo-X**.

**Local-first** (Python + WebView2). No publisher telemetry. No in-app download: a banner may offer to open the GitHub release if a newer version exists (`PRIVACY.md`).

## Overview

| Home | Module |
|---------|--------|
| ![Dashboard](docs/screenshots/dashboard.png) | ![SystemClean](docs/screenshots/systemclean.png) |

## Modules

| Module | Merged from | ConfirmGate |
|--------|------------------|-------------|
| SystemClean | WinCleaner · DiskMap | empty_recycle_bin · rebuild_icon_cache · clear_recent_files · delete_large_file · delete_empty_folder · trash_dup_paths |
| RamCleaner | Lab/Ram Cleaner | kill_selected · trim_selected |
| ProcessHub | ProcessGuard · StartupX | kill_process · empty_working_set · service_action · set_task_enabled · create_at_logon |
| UninstX | UninstX | uninstall_app |
| SysInspect | SysInspect | — (read-only) |
| Light Admin | PowerPlan · PrintQueue · RestorePoint · UserSessions | set_plan · purge_printer_jobs · create_restore_point · logoff_session |

Isolation: `ISOLATION.md`. Channels: `RELEASES.md`.

## Where it installs

| Mode | Location |
|------|----------|
| **Release** (`Launch-Hub-Systeme.zip`) | **Portable** folder: extract the zip anywhere, run `Launch-Hub-Systeme.exe` from that folder (keep zip contents together). |
| **Version / stamp** | `%LOCALAPPDATA%\PCCommand\` (e.g. shared `version.json`) |
| **Accent / language prefs** | `%LOCALAPPDATA%\Mr-Aurevo-X\user-settings.json` (if present) |
| **Dev (sources)** | Repo clone + `Lancer.cmd` — nothing else is copied until you deploy the zip |

Download: [Hub-Systeme Releases](https://github.com/Mr-Aurevo-X/Hub-Systeme/releases).

## Run

```bat
Lancer.cmd
```

Windows may flag the app as potentially unsafe: binaries are not Authenticode-signed (no paid publisher certificate). That is a SmartScreen reputation warning, not an antivirus verdict.

HWND titles: `PC Command | System` / `[Module]`.

---

Dreamed by **Mr-Aurevo-X**. Cursor made the dream real.

[![Discord](https://img.shields.io/badge/Discord-Mr--Aurevo--X-5865F2?style=for-the-badge&logo=discord&logoColor=white&labelColor=050807)](https://discord.com/users/406891052516114442)
[![PayPal](https://img.shields.io/badge/PayPal-Donate-39ff14?style=for-the-badge&logo=paypal&logoColor=00f0ff&labelColor=050807)](https://www.paypal.com/paypalme/aurevo1)
[![Revolut](https://img.shields.io/badge/Revolut-mr__aurevo__x-00f0ff?style=for-the-badge&logo=revolut&logoColor=39ff14&labelColor=050807)](https://revolut.me/mr_aurevo_x)
