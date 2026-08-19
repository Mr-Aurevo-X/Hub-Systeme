[Français](README.md) · [English](README.en.md)

# Hub-Systeme — PC Command

Distribution **lecture seule**. Pas de pull requests ni d’issues (`CONTRIBUTING.md`).

Hub catégorie **Système** — Dashboard + modules natifs (`host.py` / `backend/`).  
Licence : PolyForm Noncommercial 1.0.0. Éditeur : **Mr-Aurevo-X**.

Architecture **local-first** (Python + WebView2). Pas de télémétrie éditeur. Pas de mise à jour automatique in-app (voir `PRIVACY.md`).

## Aperçu

| Accueil | Module |
|---------|--------|
| ![Dashboard](docs/screenshots/dashboard.png) | ![SystemClean](docs/screenshots/systemclean.png) |

## Modules

| Module | Source fusionnée | ConfirmGate |
|--------|------------------|-------------|
| SystemClean | WinCleaner · DiskMap | empty_recycle_bin · rebuild_icon_cache · clear_recent_files · delete_large_file · delete_empty_folder · trash_dup_paths |
| RamCleaner | Lab/Ram Cleaner | kill_selected · trim_selected (`api.ramcleaner.*`) |
| ProcessHub | ProcessGuard · StartupX | kill_process · empty_working_set · service_action · set_task_enabled · create_at_logon |
| UninstX | UninstX | uninstall_app |
| SysInspect | SysInspect | — (lecture seule) |
| Admin léger | PowerPlan · PrintQueue · RestorePoint · UserSessions | set_plan · purge_printer_jobs · create_restore_point · logoff_session |

Dashboard = KPIs lecture seule. Isolation : `ISOLATION.md`. Canaux : `RELEASES.md`.

## Lancer

```bat
Lancer.cmd
```

Windows peut afficher « potentiellement dangereux » : les binaires ne sont pas signés Authenticode (pas de certificat éditeur payant). C’est un avertissement de réputation SmartScreen, pas un verdict antivirus.

Python pin + `pywebview` + `psutil` (Admin hérité du launcher PC Command).

Titres HWND : `PC Command | System` / `[Module]`.

---

Rêvée par **Mr-Aurevo-X**. Cursor a réalisé le rêve.

[![Discord](https://img.shields.io/badge/Discord-Mr--Aurevo--X-5865F2?style=for-the-badge&logo=discord&logoColor=white&labelColor=050807)](https://discord.com/users/406891052516114442)
[![PayPal](https://img.shields.io/badge/PayPal-Donate-39ff14?style=for-the-badge&logo=paypal&logoColor=00f0ff&labelColor=050807)](https://www.paypal.com/paypalme/aurevo1)
[![Revolut](https://img.shields.io/badge/Revolut-mr__aurevo__x-00f0ff?style=for-the-badge&logo=revolut&logoColor=39ff14&labelColor=050807)](https://revolut.me/mr_aurevo_x)
