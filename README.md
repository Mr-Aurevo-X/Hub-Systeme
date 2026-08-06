# Hub-Systeme — L'Atelier PC Command

Hub catégorie **Système** (Vague H1 / Couche A).

- Dashboard d’accueil (KPIs lecture seule, zéro mutator)
- Sidebar collapsible + Accueil persistant
- Modules lazy-load : SystemClean · ProcessHub · UninstX · SysInspect · Admin léger
- Couche A : tuiles qui lancent les apps Atelier existantes via `suite_launch`

## Lancer

```bat
Lancer.cmd
```

Nécessite Python + `pywebview` (Admin hérité du launcher PC Command).

## Structure

```text
host/host.py          # Api namespacée + chrome frameless
host/window_chrome.py # vendored HostHelpers (Sync-All)
host/suite_launch.py  # vendored HostHelpers
ui/index.html         # shell + sidebar
ui/app.js             # navigation + lazy modules
ui/dashboard.js       # home KPIs
ui/modules/*.js       # stubs Couche A
```
