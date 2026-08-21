/**
 * Copyright (c) 2026 Mr-Aurevo-X. All rights reserved.
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 * Author: Mr-Aurevo-X | https://github.com/Mr-Aurevo-X
 */
/**
 * Hub-Systeme FR/EN dictionaries + helpers.
 * Persist via suite user-settings (`language`: fr|en), not localStorage-only.
 */
const DICT = {
  fr: {
    langSwitchAria: "Langue",
    navHome: "Accueil",
    navSystemClean: "SystemClean",
    navDiskMap: "DiskMap",
    navRamCleaner: "RamCleaner",
    navProcessHub: "ProcessHub",
    navUninstX: "UninstX",
    navSysInspect: "SysInspect",
    navAdmin: "Admin léger",
    collapse: "Réduire",
    expand: "Étendre",
    collapseTitle: "Réduire la barre",
    expandTitle: "Étendre la barre",
    privacy:
      "100 % local-first. Seule connexion hors machine : vérif. version GitHub (si activée dans À propos). Sinon zéro réseau hors actions explicites des modules.",
    supportAria: "Soutien optionnel",
    supportNote: "Si le boulot te plaît, un café — sinon profite.",
    aboutBtn: "À propos",
    aboutTitle: "À propos — Hub System",
    aboutIntro:
      "PC Command System (Mr-Aurevo-X). SystemClean · DiskMap · RamCleaner · ProcessHub · UninstX · SysInspect · Admin léger. Gratuit, sans compte. Accueil lecture seule ; mutators ConfirmGate.",
    aboutLegalLocal: "100 % local-first — pas de télémétrie",
    aboutLegalGh: "Seule connexion hors machine : vérif. version GitHub (option ci-dessous)",
    aboutLegalOff: "Si vérif. désactivée : zéro réseau hors actions utilisateur (modules)",
    aboutToggle: "Vérifier les nouvelles versions sur GitHub",
    aboutHintOn:
      "Quand activé : un appel API GitHub au démarrage (lecture seule, pas de téléchargement).",
    aboutHintOff: "Désactivé : aucune requête GitHub. Local-first strict hors actions modules.",
    aboutRepoLabel: "Repo GitHub (releases)",
    aboutCopy: "Copier",
    aboutCopyUrlTitle: "Copier l’URL",
    aboutCopyPathTitle: "Copier le chemin",
    aboutCopiedLink: "Lien copié.",
    aboutCopiedPath: "Chemin copié.",
    aboutCopyFallback: "Sélectionne et Ctrl+C.",
    aboutCopied: "Copié.",
    aboutPathsTitle: "Chemins locaux (désinstall / ménage)",
    aboutPathsIntro:
      "Identifie clairement quoi supprimer. Les préférences Mr-Aurevo-X sont partagées entre apps.",
    aboutPathsAria: "Chemins locaux",
    aboutLegalAria: "Documents légaux",
    aboutLegalTerms: "CGU",
    aboutLegalPrivacy: "Confidentialité",
    aboutLegalMentions: "Mentions",
    aboutLegalNotices: "Notices",
    aboutCopyright: "Copyright © 2026 Mr-Aurevo-X — tous droits réservés",
    aboutRedistrib:
      "Redistribution, reverse engineering ou suppression du copyright interdits sans accord écrit.",
    aboutClose: "Fermer",
    aboutOptional: "(optionnel)",
    aboutPathFallback: "Chemin",
    aboutPathVersion: "Métadonnées / version",
    aboutPathSettings: "Préférences (accent, langue, vérif. maj)",
    aboutPathInstall: "Install (dossier de l’exe)",
    aboutPathVersionHint: "version.json et métadonnées suite.",
    aboutPathSettingsHint: "Fichier partagé Mr-Aurevo-X — à garder si d’autres apps l’utilisent.",
    aboutPathInstallHint: "Dossier portable Launch-Hub-*.exe — supprimer ce dossier pour désinstaller.",
    aboutLegalLoadFail: "Impossible de charger {file}",
    releaseNew: "Nouvelle version",
    releaseOpen: "Ouvrir la release",
    releaseClose: "Fermer",
    releaseMsg: "Nouvelle version {ver} disponible",
    bootError: "Erreur au démarrage",
    dashTitle: "Accueil",
    dashBlurb: "PC Command — lecture seule · zéro mutator",
    dashLive: "LIVE",
    dashOff: "OFF",
    dashGaugesAria: "CPU RAM GPU",
    dashMidAria: "Uptime et processus",
    dashBottomAria: "Réseau et disques",
    dashUptime: "Uptime",
    dashHost: "host",
    dashProcs: "Processus",
    dashProcsEm: "actifs",
    dashTrafficLive: "Trafic · live",
    dashPeak: "pic 60s · ↓ {dn} · ↑ {up}",
    dashDisks: "Disques",
    dashDiskCount: "{n} vol.",
    dashDisksLoading: "Chargement…",
    dashDisksEmpty: "Aucun volume",
    dashModules: "Modules",
    dashOpen: "Ouvrir →",
    dashQuickAria: "Accès rapide",
    dashStatus:
      "100 % local-first · Accueil lecture seule · vérif. GitHub optionnelle (À propos) · zéro mutator.",
    modSystemCleanDesc: "WinCleaner — nettoyage, traces, debloat, santé",
    modDiskMapDesc: "Treemap, recherche, gros fichiers, vides, doublons",
    modRamCleanerDesc: "Conseiller mémoire — analyse, trim, fin de tâche (ConfirmGate)",
    modProcessHubDesc: "Processus, services, démarrage et tâches planifiées",
    modUninstXDesc: "Programmes installés, désinstallation et résiduels",
    modSysInspectDesc: "Événements Windows et inventaire des pilotes",
    modAdminDesc: "PowerPlan · Impression · Restauration · Sessions",
    uptimeDays: "{d}j {h}h",
    uptimeHours: "{h}h {m}m",
  },
  en: {
    langSwitchAria: "Language",
    navHome: "Home",
    navSystemClean: "SystemClean",
    navDiskMap: "DiskMap",
    navRamCleaner: "RamCleaner",
    navProcessHub: "ProcessHub",
    navUninstX: "UninstX",
    navSysInspect: "SysInspect",
    navAdmin: "Light Admin",
    collapse: "Collapse",
    expand: "Expand",
    collapseTitle: "Collapse sidebar",
    expandTitle: "Expand sidebar",
    privacy:
      "100% local-first. Only off-machine call: GitHub version check (if enabled in About). Otherwise no network except explicit module actions.",
    supportAria: "Optional support",
    supportNote: "If you like the work, a coffee — otherwise just enjoy.",
    aboutBtn: "About",
    aboutTitle: "About — Hub System",
    aboutIntro:
      "PC Command System (Mr-Aurevo-X). SystemClean · DiskMap · RamCleaner · ProcessHub · UninstX · SysInspect · Light Admin. Free, no account. Home is read-only; mutators use ConfirmGate.",
    aboutLegalLocal: "100% local-first — no telemetry",
    aboutLegalGh: "Only off-machine call: GitHub version check (option below)",
    aboutLegalOff: "If check is off: no network except user module actions",
    aboutToggle: "Check for new versions on GitHub",
    aboutHintOn:
      "When on: one GitHub API call at startup (read-only, no download).",
    aboutHintOff: "Off: no GitHub requests. Strict local-first outside module actions.",
    aboutRepoLabel: "GitHub repo (releases)",
    aboutCopy: "Copy",
    aboutCopyUrlTitle: "Copy URL",
    aboutCopyPathTitle: "Copy path",
    aboutCopiedLink: "Link copied.",
    aboutCopiedPath: "Path copied.",
    aboutCopyFallback: "Select and Ctrl+C.",
    aboutCopied: "Copied.",
    aboutPathsTitle: "Local paths (uninstall / cleanup)",
    aboutPathsIntro:
      "Shows clearly what to delete. Mr-Aurevo-X preferences are shared across apps.",
    aboutPathsAria: "Local paths",
    aboutLegalAria: "Legal documents",
    aboutLegalTerms: "Terms",
    aboutLegalPrivacy: "Privacy",
    aboutLegalMentions: "Notices",
    aboutLegalNotices: "Licenses",
    aboutCopyright: "Copyright © 2026 Mr-Aurevo-X — all rights reserved",
    aboutRedistrib:
      "Redistribution, reverse engineering, or copyright removal without written permission is prohibited.",
    aboutClose: "Close",
    aboutOptional: "(optional)",
    aboutPathFallback: "Path",
    aboutPathVersion: "Metadata / version",
    aboutPathSettings: "Preferences (accent, language, update check)",
    aboutPathInstall: "Install (exe folder)",
    aboutPathVersionHint: "version.json and suite metadata.",
    aboutPathSettingsHint: "Shared Mr-Aurevo-X file — keep if other apps still use it.",
    aboutPathInstallHint: "Portable Launch-Hub-*.exe folder — delete this folder to uninstall.",
    aboutLegalLoadFail: "Could not load {file}",
    releaseNew: "New version",
    releaseOpen: "Open release",
    releaseClose: "Close",
    releaseMsg: "New version {ver} available",
    bootError: "Startup error",
    dashTitle: "Home",
    dashBlurb: "PC Command — read-only · zero mutators",
    dashLive: "LIVE",
    dashOff: "OFF",
    dashGaugesAria: "CPU RAM GPU",
    dashMidAria: "Uptime and processes",
    dashBottomAria: "Network and disks",
    dashUptime: "Uptime",
    dashHost: "host",
    dashProcs: "Processes",
    dashProcsEm: "active",
    dashTrafficLive: "Traffic · live",
    dashPeak: "60s peak · ↓ {dn} · ↑ {up}",
    dashDisks: "Disks",
    dashDiskCount: "{n} vol.",
    dashDisksLoading: "Loading…",
    dashDisksEmpty: "No volumes",
    dashModules: "Modules",
    dashOpen: "Open →",
    dashQuickAria: "Quick access",
    dashStatus:
      "100% local-first · Home read-only · optional GitHub check (About) · zero mutators.",
    modSystemCleanDesc: "WinCleaner — cleanup, traces, debloat, health",
    modDiskMapDesc: "Treemap, search, large files, empties, duplicates",
    modRamCleanerDesc: "Memory advisor — analyze, trim, end task (ConfirmGate)",
    modProcessHubDesc: "Processes, services, startup and scheduled tasks",
    modUninstXDesc: "Installed programs, uninstall and leftovers",
    modSysInspectDesc: "Windows events and driver inventory",
    modAdminDesc: "PowerPlan · Print · Restore · Sessions",
    uptimeDays: "{d}d {h}h",
    uptimeHours: "{h}h {m}m",
  },
};

let lang = "fr";
const listeners = new Set();

function pack() {
  return DICT[lang] || DICT.fr;
}

export function getLang() {
  return lang === "en" ? "en" : "fr";
}

export function locale() {
  return getLang() === "en" ? "en-US" : "fr-FR";
}

export function t(key, vars) {
  const p = pack();
  let s = p[key];
  if (s == null) s = DICT.fr[key];
  if (s == null) return key;
  if (vars && typeof vars === "object") {
    for (const [k, v] of Object.entries(vars)) {
      s = String(s).split(`{${k}}`).join(String(v));
    }
  }
  return s;
}

export function applyDom(root) {
  const scope = root || document;
  const p = pack();
  document.documentElement.lang = getLang() === "en" ? "en" : "fr";
  scope.querySelectorAll("[data-i18n]").forEach((node) => {
    const key = node.getAttribute("data-i18n");
    if (key && p[key] != null) node.textContent = p[key];
  });
  scope.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
    const key = node.getAttribute("data-i18n-placeholder");
    if (key && p[key] != null) node.setAttribute("placeholder", p[key]);
  });
  scope.querySelectorAll("[data-i18n-title]").forEach((node) => {
    const key = node.getAttribute("data-i18n-title");
    if (key && p[key] != null) node.setAttribute("title", p[key]);
  });
  scope.querySelectorAll("[data-i18n-aria]").forEach((node) => {
    const key = node.getAttribute("data-i18n-aria");
    if (key && p[key] != null) node.setAttribute("aria-label", p[key]);
  });
  if (window.MrAurevoXSuite && typeof window.MrAurevoXSuite.applyI18n === "function") {
    try {
      window.MrAurevoXSuite.applyI18n(getLang(), DICT);
    } catch (_) {}
  }
}

export function setLang(next, { silent = false } = {}) {
  const n = next === "en" ? "en" : "fr";
  if (n === lang && silent) {
    applyDom();
    return lang;
  }
  lang = n;
  applyDom();
  if (!silent) {
    listeners.forEach((fn) => {
      try {
        fn(lang);
      } catch (_) {}
    });
  }
  return lang;
}

export function onLangChange(fn) {
  if (typeof fn !== "function") return () => {};
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function legalFile(base) {
  const b = String(base || "")
    .replace(/\.fr\.md$/i, "")
    .replace(/\.en\.md$/i, "")
    .replace(/\.md$/i, "");
  return `${b}.${getLang() === "en" ? "en" : "fr"}.md`;
}

export function pathLabelFor(entry) {
  const id = entry?.id || "";
  const map = {
    version: "aboutPathVersion",
    settings: "aboutPathSettings",
    app: "aboutPathInstall",
  };
  const key = map[id];
  if (key) return t(key);
  return entry?.label || t("aboutPathFallback");
}

export function pathHintFor(entry) {
  const id = entry?.id || "";
  const map = {
    version: "aboutPathVersionHint",
    settings: "aboutPathSettingsHint",
    app: "aboutPathInstallHint",
  };
  const key = map[id];
  if (key) return t(key);
  return entry?.hint || "";
}

export { DICT };

if (typeof window !== "undefined") {
  window.HubI18n = { t, getLang, setLang, locale, applyDom, onLangChange, legalFile, DICT };
}
