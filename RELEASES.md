# Release channels

Binaries ship through **this repository's** GitHub Releases (same remote as sources).

Example: `https://github.com/Mr-Aurevo-X/Hub-Systeme/releases`

Asset: `Launch-Hub-Systeme.zip` (one zip per hub — no monolithic Hubs.zip).

## Stable

Production tags on the default branch. GitHub “Latest” non-prerelease.

## Isolation

Pin Python dependencies and run under Windows Sandbox when you want the build to outlive host OS churn.
