# Hub-Systeme — L'Atelier PC Command

Hub catégorie **Système** — **Vague H4 Couche B** (fusion in-process).

## Modules

| Module | Source fusionnée | ConfirmGate |
|--------|------------------|-------------|
| SystemClean | WinCleaner · DiskMap | empty_recycle_bin · rebuild_icon_cache · clear_recent_files · delete_large_file · delete_empty_folder · trash_dup_paths |
| ProcessHub | ProcessGuard · StartupX | kill_process · empty_working_set · service_action · set_task_enabled · create_at_logon |
| UninstX | UninstX | uninstall_app |
| SysInspect | SysInspect | — (lecture seule) |
| Admin léger | PowerPlan · PrintQueue · RestorePoint · UserSessions | set_plan · purge_printer_jobs · create_restore_point · logoff_session (+ nested `api.admin.*`) |

Dashboard = KPIs lecture seule (disque / RAM / process). Fallback « Fenêtre dédiée » via `suite_launch`.

## Lancer

```bat
Lancer.cmd
```

Nécessite Python + `pywebview` + `psutil` (Admin hérité du launcher PC Command).

## Structure

```text
host/host.py            # Api namespacée + ConfirmGate partagé
host/api_modules.py     # Couche B — namespaces in-process
host/modules/           # Logique métier (copies sources)
host/security.py        # ConfirmGate (SecurityHelpers)
host/window_chrome.py   # vendored HostHelpers
host/suite_launch.py    # vendored HostHelpers
ui/index.html           # shell + sidebar
ui/app.js               # navigation + lazy modules
ui/dashboard.js         # home KPIs
ui/modules/*.js         # UIs Couche B
```
