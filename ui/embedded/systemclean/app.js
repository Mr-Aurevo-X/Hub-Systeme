/* WinCleaner UI — bridge pywebview + Chart.js */
(function () {
  "use strict";


  const SUITE_I18N = {
    fr: {
      tagline: "Nettoyage sûr",
      copyright: "© 2026 Mr-Aurevo-X · local · CGU dans L'Atelier PC Command",
      featuresTitle: "Fonctions",
      features: "Nettoyage Windows sûr : santé disque, caches, traces locales, debloat, désinstallation, optimisations et sessions.",
      privacy: "Mr-Aurevo-X ne collecte aucune donnée. Traitement local sur cette machine. Pas de mise à jour automatique.",
      ready: "Prêt",
      navHealth: "Santé",
      navClean: "Nettoyage",
      navTraces: "Traces",
      navDebloat: "Debloat",
      navUninstall: "Désinstaller",
      navOpt: "Optimisations",
      navSessions: "Sessions",
      navExclusions: "Exclusions",
      navHub: "Outils",
      pageHealthSub: "Disques, dossiers cibles — ouvrir DiskMap, StartupX",
      pageCleanSub: "Caches, temp, corbeille — analyse avant suppression",
      pageTracesSub: "Fichiers récents, jump lists, miniatures, Prefetch…",
      pageDebloatSub: "Apps bloatware (listes protectrices)",
      pageUninstallSub: "Désinstall officiel + purge des restes",
      pageOptSub: "Confidentialité, tâches, services, maintenance",
      pageSessionsSub: "Historique, undo et rapports",
      pageExclusionsSub: "Chemins / motifs jamais touchés",
      btnRestore: "Point de restauration",
      btnRefresh: "Rafraîchir",
      btnOpenDiskMap: "Ouvrir DiskMap",
      btnOpenBigFiles: "Ouvrir BigFiles",
      btnOpenStartupX: "Ouvrir StartupX",
      btnProfileLight: "Profil Léger",
      btnProfileGame: "Profil Gaming",
      btnProfileMax: "Propre max",
      btnScan: "Analyser",
      btnClean: "Nettoyer",
      btnListTraces: "Lister",
      btnClearTraces: "Effacer la sélection",
      btnScanBloat: "Scanner",
      btnRemoveBloat: "Supprimer sélection",
      btnSearch: "Rechercher",
      btnOfficialUninstall: "Désinstaller officiel",
      btnPurgeLeft: "Purger sélection (Safe)",
      btnApply: "Appliquer",
      btnWinSxS: "Analyser WinSxS",
      btnDism: "DISM RestoreHealth",
      btnSfc: "SFC /scannow",
      btnExportReport: "Rapport HTML",
      btnSave: "Enregistrer",
      btnReload: "Recharger",
      btnClear: "Effacer",
      diskDeltaTitle: "Dernier delta disque",
      scanResultTitle: "Résultat analyse",
      emptyScanHint: "Lance une analyse.",
      tracesCatsTitle: "Catégories de traces",
      tracesResultTitle: "Contenu listé",
      emptyTracesHint: "Lance une liste pour voir les traces.",
      guardTraces: "Traces locales de ce que Windows a ouvert ou affiché. Lister avant d’effacer. Les captures d’écran demandent une confirmation renforcée.",
      confirmTraces: "Effacer les traces sélectionnées ?",
      confirmTracesScreenshots: "ATTENTION : cela supprimera aussi les captures d’écran listées. Continuer ?",
      statusTraces: "Liste des traces…",
      statusTracesClear: "Effacement des traces…",
      tracesCleared: "Traces effacées — {freed}",
      tracesItemsShown: "{n} éléments (aperçu plafonné)",
      bloatTitle: "Apps détectées",
      emptyCats: "Aucune catégorie.",
      emptyBloat: "Aucune app bloat détectée.",
      emptySessions: "Aucun historique pour l'instant.",
      emptyDelta: "Aucun delta.",
      emptyPurgeApps: "Aucune installation — lancez une recherche.",
      emptyPurgeLeft: "Aucun reste — lancez une recherche.",
      guardDebloat: "Les apps dans keep-apps.txt sont protégées. Analyse avant suppression.",
      guardUninstall: "SystemGuard : les dossiers système / Shared nécessitent une confirmation renforcée.",
      guardExclusions: "Chemins ou motifs exclus du nettoyage et de la purge (un par ligne). Ex. un dossier projet ou un nom d'app.",
      purgePh: "Mot-clé (ex. fivem, discord…)",
      installsTitle: "Installations",
      leftoversTitle: "Restes détectés",
      sysActionsTitle: "Actions système",
      outputTitle: "Sortie",
      historyTitle: "Historique",
      exclTitle: "Exclusions utilisateur",
      consoleTitle: "Console / journal",
      statCats: "Catégories",
      statSel: "Sélection",
      statEst: "Estimation",
      statItems: "Éléments",
      thName: "Nom",
      thPublisher: "Éditeur",
      thVersion: "Version",
      thPath: "Chemin",
      thSize: "Taille",
      thVerdict: "Verdict",
      thDate: "Date",
      thAction: "Action",
      thDetail: "Détail",
      diskUsed: "Utilisé (Go)",
      diskFree: "Libre (Go)",
      chartDisks: "Disques",
      chartFolders: "Dossiers cibles",
      labelFree: "libre /",
      labelLastScan: "Dernière analyse",
      labelLastFreed: "Dernière libération",
      labelTotalFreed: "Total libéré",
      statusHealth: "Santé…",
      statusHealthOk: "Santé OK",
      statusHealthErr: "Erreur santé",
      statusScan: "Analyse…",
      statusClean: "Nettoyage…",
      statusBloat: "Scan bloat…",
      statusDebloat: "Debloat…",
      statusSearch: "Recherche…",
      statusUninstall: "Désinstallation…",
      statusPurge: "Purge…",
      statusOpt: "Optimisations…",
      statusSessions: "Sessions…",
      statusExcl: "Exclusions…",
      statusSaving: "Enregistrement…",
      statusReport: "Rapport…",
      statusRestore: "Point de restauration…",
      statusExclOk: "Exclusions OK",
      confirmClean: "Lancer le nettoyage des catégories sélectionnées ?",
      confirmBloat: "Supprimer {n} app(s) ?",
      confirmUninstall: "Désinstaller {n} programme(s) via le désinstalleur officiel ?",
      confirmPurge: "Purger {n} reste(s) Safe ?",
      confirmOpt: "Appliquer les optimisations cochées ?",
      confirmLong: "{label} ? Cela peut prendre longtemps.",
      confirmRestore: "Créer un point de restauration système ?",
      needCategory: "Sélectionne au moins une catégorie",
      needKeyword: "Mot-clé requis",
      needSafe: "Aucun reste Safe sélectionné",
      optApplied: "Optimisations appliquées — redémarre Windows pour finaliser.",
      optPrivacy: "Tweaks confidentialité",
      optPrivacyDesc: "Télémétrie / suggestions (réversible via undo)",
      optTasks: "Tâches planifiées bloat",
      optTasksDesc: "Désactive les tâches listées",
      optServices: "Services inutiles",
      optServicesDesc: "Services non critiques",
      optFeatures: "Fonctionnalités optionnelles",
      optFeaturesDesc: "Désactive cibles Features.ps1",
      optDism: "Nettoyage composants (DISM)",
      optDismDesc: "StartComponentCleanup",
      logReady: "WinCleaner prêt",
      logNavUnlock: "Navigation — UI débloquée (scan précédent annulé côté interface)",
      logHealthOk: "Santé rafraîchie",
      logSessionsOk: "Sessions chargées",
      logOptOk: "Optimisations OK",
      logExclSaved: "Exclusions enregistrées ({n})",
      logProfile: "Profil: {name}",
      starting: "Démarrage…",
      done: "Terminé",
      cancelled: "Annulé (navigation)",
      errTimeout: "Timeout ({s}s) — {label} — UI débloquée",
      errTimeoutHost: "Timeout ({label}) — host ne répond plus, UI débloquée",
      errMethod: "Méthode host indisponible: {method}",
      errHost: "Erreur host",
      errApi: "Erreur API",
      errBridge: "Bridge pywebview indisponible (lance via host Python)",
      errOp: "opération",
      cleaned: "Nettoyé {freed}",
      freed: "Libéré: {freed}",
      deltaDisk: "Delta disque ({source}): {detail}",
      hostApiMissing: "API host indisponible",
      launched: "{name} lancé",
      hostMissing: "Host indisponible",
      about:
        "WinCleaner — nettoyage sûr Windows 11\n\n" +
        "Mr-Aurevo-X ne collecte aucune donnée ni analytics. Traitement local sur cette machine. " +
        "Pas de mise à jour automatique (copie fournie par l’éditeur). " +
        "Polices embarquées localement.\n\n" +
        "© 2026 Mr-Aurevo-X",
    },
    en: {
      tagline: "Safe cleanup",
      copyright: "© 2026 Mr-Aurevo-X · local · Terms in Atelier",
      featuresTitle: "Features",
      features: "Safe Windows cleanup: disk health, caches, local traces, debloat, uninstall, tweaks, and sessions.",
      privacy: "Mr-Aurevo-X does not collect your data. Processing stays on this PC. No automatic updates.",
      ready: "Ready",
      navHealth: "Health",
      navClean: "Cleanup",
      navTraces: "Traces",
      navDebloat: "Debloat",
      navUninstall: "Uninstall",
      navOpt: "Tweaks",
      navSessions: "Sessions",
      navExclusions: "Exclusions",
      navHub: "Tools",
      pageHealthSub: "Disks, target folders — open DiskMap, StartupX",
      pageCleanSub: "Caches, temp, recycle bin — scan before delete",
      pageTracesSub: "Recent files, jump lists, thumbnails, Prefetch…",
      pageDebloatSub: "Bloatware apps (protective lists)",
      pageUninstallSub: "Official uninstall + leftover purge",
      pageOptSub: "Privacy, tasks, services, maintenance",
      pageSessionsSub: "History, undo, and reports",
      pageExclusionsSub: "Paths / patterns never touched",
      btnRestore: "Restore point",
      btnRefresh: "Refresh",
      btnOpenDiskMap: "Open DiskMap",
      btnOpenBigFiles: "Open BigFiles",
      btnOpenStartupX: "Open StartupX",
      btnProfileLight: "Light profile",
      btnProfileGame: "Gaming profile",
      btnProfileMax: "Max clean",
      btnScan: "Analyze",
      btnClean: "Clean",
      btnListTraces: "List",
      btnClearTraces: "Clear selection",
      btnScanBloat: "Scan",
      btnRemoveBloat: "Remove selection",
      btnSearch: "Search",
      btnOfficialUninstall: "Official uninstall",
      btnPurgeLeft: "Purge selection (Safe)",
      btnApply: "Apply",
      btnWinSxS: "Analyze WinSxS",
      btnDism: "DISM RestoreHealth",
      btnSfc: "SFC /scannow",
      btnExportReport: "HTML report",
      btnSave: "Save",
      btnReload: "Reload",
      btnClear: "Clear",
      diskDeltaTitle: "Last disk delta",
      scanResultTitle: "Scan result",
      emptyScanHint: "Run an analysis.",
      tracesCatsTitle: "Trace categories",
      tracesResultTitle: "Listed content",
      emptyTracesHint: "Run a list to see traces.",
      guardTraces: "Local traces of what Windows opened or showed. List before clearing. Screenshots need a strong confirmation.",
      confirmTraces: "Clear the selected traces?",
      confirmTracesScreenshots: "WARNING: this will also delete listed screenshots. Continue?",
      statusTraces: "Listing traces…",
      statusTracesClear: "Clearing traces…",
      tracesCleared: "Traces cleared — {freed}",
      tracesItemsShown: "{n} items (preview capped)",
      bloatTitle: "Detected apps",
      emptyCats: "No categories.",
      emptyBloat: "No bloat apps detected.",
      emptySessions: "No history yet.",
      emptyDelta: "No delta.",
      emptyPurgeApps: "No installs — run a search.",
      emptyPurgeLeft: "No leftovers — run a search.",
      guardDebloat: "Apps in keep-apps.txt are protected. Analyze before removal.",
      guardUninstall: "SystemGuard: system / Shared folders need a stronger confirmation.",
      guardExclusions: "Paths or patterns excluded from cleanup and purge (one per line). E.g. a project folder or app name.",
      purgePh: "Keyword (e.g. fivem, discord…)",
      installsTitle: "Installs",
      leftoversTitle: "Detected leftovers",
      sysActionsTitle: "System actions",
      outputTitle: "Output",
      historyTitle: "History",
      exclTitle: "User exclusions",
      consoleTitle: "Console / log",
      statCats: "Categories",
      statSel: "Selected",
      statEst: "Estimate",
      statItems: "Items",
      thName: "Name",
      thPublisher: "Publisher",
      thVersion: "Version",
      thPath: "Path",
      thSize: "Size",
      thVerdict: "Verdict",
      thDate: "Date",
      thAction: "Action",
      thDetail: "Detail",
      diskUsed: "Used (GB)",
      diskFree: "Free (GB)",
      chartDisks: "Disks",
      chartFolders: "Target folders",
      labelFree: "free /",
      labelLastScan: "Last scan",
      labelLastFreed: "Last freed",
      labelTotalFreed: "Total freed",
      statusHealth: "Health…",
      statusHealthOk: "Health OK",
      statusHealthErr: "Health error",
      statusScan: "Scanning…",
      statusClean: "Cleaning…",
      statusBloat: "Bloat scan…",
      statusDebloat: "Debloat…",
      statusSearch: "Searching…",
      statusUninstall: "Uninstalling…",
      statusPurge: "Purging…",
      statusOpt: "Tweaks…",
      statusSessions: "Sessions…",
      statusExcl: "Exclusions…",
      statusSaving: "Saving…",
      statusReport: "Report…",
      statusRestore: "Restore point…",
      statusExclOk: "Exclusions OK",
      confirmClean: "Run cleanup on the selected categories?",
      confirmBloat: "Remove {n} app(s)?",
      confirmUninstall: "Uninstall {n} program(s) via the official uninstaller?",
      confirmPurge: "Purge {n} Safe leftover(s)?",
      confirmOpt: "Apply the checked tweaks?",
      confirmLong: "{label}? This can take a long time.",
      confirmRestore: "Create a system restore point?",
      needCategory: "Select at least one category",
      needKeyword: "Keyword required",
      needSafe: "No Safe leftovers selected",
      optApplied: "Tweaks applied — restart Windows to finish.",
      optPrivacy: "Privacy tweaks",
      optPrivacyDesc: "Telemetry / suggestions (reversible via undo)",
      optTasks: "Bloat scheduled tasks",
      optTasksDesc: "Disables listed tasks",
      optServices: "Unused services",
      optServicesDesc: "Non-critical services",
      optFeatures: "Optional features",
      optFeaturesDesc: "Disables Features.ps1 targets",
      optDism: "Component cleanup (DISM)",
      optDismDesc: "StartComponentCleanup",
      logReady: "WinCleaner ready",
      logNavUnlock: "Navigation — UI unlocked (previous scan cancelled in UI)",
      logHealthOk: "Health refreshed",
      logSessionsOk: "Sessions loaded",
      logOptOk: "Tweaks OK",
      logExclSaved: "Exclusions saved ({n})",
      logProfile: "Profile: {name}",
      starting: "Starting…",
      done: "Done",
      cancelled: "Cancelled (navigation)",
      errTimeout: "Timeout ({s}s) — {label} — UI unlocked",
      errTimeoutHost: "Timeout ({label}) — host stopped responding, UI unlocked",
      errMethod: "Host method unavailable: {method}",
      errHost: "Host error",
      errApi: "API error",
      errBridge: "pywebview bridge unavailable (launch via Python host)",
      errOp: "operation",
      cleaned: "Cleaned {freed}",
      freed: "Freed: {freed}",
      deltaDisk: "Disk delta ({source}): {detail}",
      hostApiMissing: "Host API unavailable",
      launched: "{name} launched",
      hostMissing: "Host unavailable",
      about:
        "WinCleaner — safe Windows 11 cleanup\n\n" +
        "Mr-Aurevo-X does not collect analytics or your data. Processing stays on this PC. " +
        "No automatic updates (publisher provides copies). " +
        "Fonts are bundled locally.\n\n" +
        "© 2026 Mr-Aurevo-X",
    },
  };

  let suiteLang = "fr";
  const t = (key, vars) => {
    let s = (SUITE_I18N[suiteLang] && SUITE_I18N[suiteLang][key]) || SUITE_I18N.fr[key] || key;
    if (vars) {
      Object.keys(vars).forEach((k) => {
        s = s.split("{" + k + "}").join(String(vars[k]));
      });
    }
    return s;
  };

  function pagesMeta() {
    return {
      health: { title: t("navHealth"), sub: t("pageHealthSub") },
      clean: { title: t("navClean"), sub: t("pageCleanSub") },
      traces: { title: t("navTraces"), sub: t("pageTracesSub") },
      debloat: { title: t("navDebloat"), sub: t("pageDebloatSub") },
      uninstall: { title: t("navUninstall"), sub: t("pageUninstallSub") },
      opt: { title: t("navOpt"), sub: t("pageOptSub") },
      sessions: { title: t("navSessions"), sub: t("pageSessionsSub") },
      exclusions: { title: t("navExclusions"), sub: t("pageExclusionsSub") },
      hub: { title: t("navHub"), sub: "Temp, corbeille, icones et fichiers recents integres." },
    };
  }

  function optDefaults() {
    return [
      { id: "privacy", label: t("optPrivacy"), desc: t("optPrivacyDesc") },
      { id: "tasks", label: t("optTasks"), desc: t("optTasksDesc") },
      { id: "services", label: t("optServices"), desc: t("optServicesDesc") },
      { id: "features", label: t("optFeatures"), desc: t("optFeaturesDesc") },
      { id: "componentCleanup", label: t("optDism"), desc: t("optDismDesc") },
    ];
  }

  let categories = [];
  let chartDisk = null;
  let chartFolders = null;
  let lastPurge = { apps: [], leftovers: [] };
  let busy = false;
  /** Nested setBusy depth — only snapshot/restore buttons at 0↔1. */
  let busyDepth = 0;

  function applyAccent(hex) {
    const accent = String(hex || "#e03545").trim();
    if (!(accent.startsWith("#") && (accent.length === 4 || accent.length === 7))) return;
    let h = accent.slice(1);
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const root = document.documentElement;
    root.style.setProperty("--accent", accent);
    root.style.setProperty("--accent-dim", `rgba(${r}, ${g}, ${b}, 0.2)`);
    root.style.setProperty("--accent-glow", `rgba(${r}, ${g}, ${b}, 0.4)`);
  }

  async function bootSuite(api) {
    const suite = window.MrAurevoXSuite;
    if (!suite) {
      if (api && api.get_suite_settings) {
        try {
          const s = await api.get_suite_settings();
          if (s && s.ok) {
            if (s.language === "en" || s.language === "fr") suiteLang = s.language;
            if (s.accent) applyAccent(s.accent);
          }
        } catch (_) {}
      }
      return suiteLang;
    }
    const settings = await suite.loadSuiteSettings(api);
    suiteLang = settings.language === "en" ? "en" : "fr";
    suite.applyAccent(settings.accent);
    suite.applyI18n(suiteLang, SUITE_I18N);
    return suiteLang;
  }

  /** Invalidates in-flight api() polls when navigating / force-unlocking. */
  let actionGen = 0;
  let lastLoggedPhase = "";
  let jobStartedAt = 0;

  const ACTION_TIMEOUT_MS = 120000;
  const VERY_LONG_TIMEOUT_MS = 1800000; /* 30 min — DISM / SFC */
  const VERY_LONG_ACTIONS = new Set(["analyzeWinSxS", "dismRestoreHealth", "sfcScan"]);

  const LONG_ACTIONS = new Set([
    "getHealth",
    "getLargeFiles",
    "scanClean",
    "runClean",
    "listTraces",
    "getBloatApps",
    "removeBloat",
    "findPurge",
    "officialUninstall",
    "purgeLeftovers",
    "runOptimizations",
    "analyzeWinSxS",
    "dismRestoreHealth",
    "sfcScan",
    /* getStartup / disableStartup use apiSync — fast registry ops; avoids
       job-bridge wedge if UI times out while PowerShell is still running. */
    "exportReport",
    "createRestorePoint",
  ]);

  const TRACE_CAT_IDS = [
    "Recent",
    "JumpLists",
    "ExplorerHistory",
    "Thumbnails",
    "Prefetch",
    "ClipboardHistory",
    "Screenshots",
  ];

  const TRACE_LABELS = {
    fr: {
      Recent: "Fichiers récents",
      JumpLists: "Jump lists",
      ExplorerHistory: "Historique Explorateur",
      Thumbnails: "Miniatures / icônes",
      Prefetch: "Prefetch",
      ClipboardHistory: "Historique presse-papiers",
      Screenshots: "Captures d'écran",
    },
    en: {
      Recent: "Recent files",
      JumpLists: "Jump lists",
      ExplorerHistory: "Explorer history",
      Thumbnails: "Thumbnails / icons",
      Prefetch: "Prefetch",
      ClipboardHistory: "Clipboard history",
      Screenshots: "Screenshots",
    },
  };

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];

  function actionButtons() {
    return $$(".btn").filter((b) => b.id !== "btnClearLog");
  }

  function snapshotAndDisableButtons() {
    actionButtons().forEach((b) => {
      b.dataset.wasDisabled = b.disabled ? "1" : "0";
      b.disabled = true;
    });
  }

  function restoreButtonsFromSnapshot() {
    actionButtons().forEach((b) => {
      if (b.dataset.wasDisabled === "0") b.disabled = false;
      else if (b.dataset.wasDisabled === "1") b.disabled = true;
      else b.disabled = false;
      delete b.dataset.wasDisabled;
    });
  }

  function log(msg, level) {
    const el = $("#log");
    const line = document.createElement("div");
    if (level) line.className = level;
    const ts = new Date().toLocaleTimeString(suiteLang === "en" ? "en-US" : "fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    line.textContent = `[${ts}] ${msg}`;
    el.appendChild(line);
    el.scrollTop = el.scrollHeight;
  }

  function fmtElapsed(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return m + ":" + String(r).padStart(2, "0");
  }

  function setProgressUI(pct, phase, detail, elapsedMs) {
    const bar = $("#progressBar") || $("#progress > i");
    const wrap = $("#progress");
    const label = $("#progressLabel");
    const n = Math.max(0, Math.min(100, Number(pct) || 0));
    wrap.classList.remove("busy");
    wrap.classList.add("determinate");
    if (bar) bar.style.width = n + "%";
    const short = phase ? n + "% · " + fixEncoding(phase) : n + "%";
    const parts = [n + "%"];
    if (phase) parts.push(fixEncoding(phase));
    if (detail) parts.push(fixEncoding(detail));
    if (elapsedMs != null) parts.push(fmtElapsed(elapsedMs));
    const text = parts.join(" · ");
    if (label) label.textContent = short;
    $("#sideStatus").textContent = text;
    if (phase && phase !== lastLoggedPhase) {
      lastLoggedPhase = phase;
      log("Phase: " + phase + (detail ? " — " + detail : "") + " (" + n + "%)");
    }
  }

  function clearProgressUI() {
    const bar = $("#progressBar") || $("#progress > i");
    const wrap = $("#progress");
    const label = $("#progressLabel");
    wrap.classList.remove("busy", "determinate");
    if (bar) bar.style.width = "0%";
    if (label) label.textContent = "";
  }

  function setBusy(on, status, opts) {
    const indeterminate = !!(opts && opts.indeterminate);
    const wrap = $("#progress");
    if (on) {
      if (busyDepth === 0) {
        snapshotAndDisableButtons();
        if (indeterminate) {
          wrap.classList.add("busy");
          wrap.classList.remove("determinate");
          const bar = $("#progressBar") || $("#progress > i");
          if (bar) bar.style.width = "";
        }
      }
      busyDepth++;
      busy = true;
    } else {
      if (busyDepth <= 0) {
        busy = false;
        if (status != null) $("#sideStatus").textContent = status;
        return;
      }
      busyDepth--;
      if (busyDepth === 0) {
        busy = false;
        clearProgressUI();
        restoreButtonsFromSnapshot();
      }
    }
    if (status != null) $("#sideStatus").textContent = status;
  }

  /** Best-effort cancel of a hung host PowerShell job (no-op on older hosts). */
  function requestCancel() {
    try {
      if (window.pywebview && window.pywebview.api && typeof window.pywebview.api.cancel_action === "function") {
        Promise.resolve(window.pywebview.api.cancel_action()).catch(function () {});
      }
    } catch (_) { /* ignore */ }
  }

  /** Unlock UI immediately (e.g. navigation). In-flight polls abort via actionGen. */
  function forceUnlock(status) {
    actionGen++;
    busyDepth = 0;
    busy = false;
    clearProgressUI();
    restoreButtonsFromSnapshot();
    actionButtons().forEach((b) => {
      b.disabled = false;
      delete b.dataset.wasDisabled;
    });
    requestCancel();
    if (status != null) $("#sideStatus").textContent = status;
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function withTimeout(promise, ms, label) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        requestCancel();
        reject(new Error(t("errTimeout", { s: Math.round(ms / 1000), label: label || t("errOp") })));
      }, ms);
      Promise.resolve(promise).then(
        (v) => {
          clearTimeout(t);
          resolve(v);
        },
        (e) => {
          clearTimeout(t);
          reject(e);
        }
      );
    });
  }

  async function hostCall(method, timeoutMs, ...args) {
    if (!window.pywebview || !window.pywebview.api || typeof window.pywebview.api[method] !== "function") {
      throw new Error(t("errMethod", { method }));
    }
    const ms = timeoutMs == null ? ACTION_TIMEOUT_MS : timeoutMs;
    const res = await withTimeout(window.pywebview.api[method](...args), ms, method);
    if (!res || !res.ok) {
      throw new Error((res && res.error) || t("errHost"));
    }
    return res.data !== undefined ? res.data : res;
  }

  async function prepareToken(action, payload, timeoutMs) {
    if (!window.pywebview || !window.pywebview.api || typeof window.pywebview.api.prepare_action !== "function") {
      return null;
    }
    const prep = await withTimeout(
      window.pywebview.api.prepare_action(action, payload || {}),
      timeoutMs == null ? ACTION_TIMEOUT_MS : timeoutMs,
      "prepare_action"
    );
    if (!prep || !prep.ok || !prep.token) {
      throw new Error((prep && prep.error) || t("errApi"));
    }
    return prep.token;
  }

  async function apiSync(action, payload) {
    if (!window.pywebview || !window.pywebview.api) {
      throw new Error(t("errBridge"));
    }
    const pl = payload || {};
    const token = await prepareToken(action, pl, ACTION_TIMEOUT_MS);
    const res = await withTimeout(
      window.pywebview.api.run(action, pl, token),
      ACTION_TIMEOUT_MS,
      action
    );
    if (!res || !res.ok) {
      throw new Error((res && res.error) || t("errApi"));
    }
    return res.data;
  }

  async function api(action, payload) {
    if (!LONG_ACTIONS.has(action)) {
      return apiSync(action, payload);
    }
    if (!window.pywebview || !window.pywebview.api || typeof window.pywebview.api.start_action !== "function") {
      return apiSync(action, payload);
    }
    const pl = payload || {};
    const timeoutMs = VERY_LONG_ACTIONS.has(action) ? VERY_LONG_TIMEOUT_MS : ACTION_TIMEOUT_MS;
    const timeoutLabel = Math.round(timeoutMs / 1000) + "s";
    const gen = actionGen;
    lastLoggedPhase = "";
    jobStartedAt = Date.now();
    setProgressUI(0, action, t("starting"), 0);
    const token = await prepareToken(action, pl, timeoutMs);
    await hostCall("start_action", timeoutMs, action, pl, token);
    let finalErr = null;
    for (;;) {
      if (gen !== actionGen) {
        throw new Error(t("cancelled"));
      }
      const elapsed = Date.now() - jobStartedAt;
      const remaining = timeoutMs - elapsed;
      if (remaining <= 0) {
        throw new Error(t("errTimeoutHost", { label: timeoutLabel }));
      }
      await sleep(Math.min(280, remaining));
      if (gen !== actionGen) {
        throw new Error(t("cancelled"));
      }
      const left = timeoutMs - (Date.now() - jobStartedAt);
      if (left <= 0) {
        throw new Error(t("errTimeoutHost", { label: timeoutLabel }));
      }
      const p = await hostCall("get_action_progress", Math.max(1000, left));
      setProgressUI(p.percent || 0, p.phase || "", p.detail || "", Date.now() - jobStartedAt);
      if (p.error && (p.done || !p.running)) {
        finalErr = p.error;
        break;
      }
      if (p.done && !p.running) break;
    }
    if (gen !== actionGen) {
      throw new Error(t("cancelled"));
    }
    if (finalErr) throw new Error(finalErr);
    setProgressUI(100, t("done"), "", Date.now() - jobStartedAt);
    const res = await withTimeout(
      window.pywebview.api.get_action_result(),
      Math.max(1000, timeoutMs - (Date.now() - jobStartedAt)),
      "get_action_result"
    );
    if (!res || !res.ok) {
      throw new Error((res && res.error) || t("errApi"));
    }
    return res.data;
  }

  function fmtSize(bytes) {
    const n = Number(bytes) || 0;
    if (n < 1024) return n + " o";
    if (n < 1048576) return (n / 1024).toFixed(1) + " Ko";
    if (n < 1073741824) return (n / 1048576).toFixed(1) + " Mo";
    return (n / 1073741824).toFixed(2) + " Go";
  }

  function setPage(id) {
    if (busy || busyDepth > 0) {
      forceUnlock(t("ready"));
      log(t("logNavUnlock"), "warn");
    }
    $$(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.page === id));
    $$(".page").forEach((p) => p.classList.toggle("active", p.id === "page-" + id));
    const meta = pagesMeta()[id] || { title: id, sub: "" };
    $("#pageTitle").textContent = meta.title;
    $("#pageSub").textContent = meta.sub;
    if (id === "exclusions") loadExclusions();
    if (id === "sessions") loadSessions();
    if (id === "traces") ensureTracesCats();
    if (id === "debloat" && !$("#bloatList").children.length) {
      /* leave empty until user scans — intentional */
    }
  }

  function asArray(v) {
    if (v == null) return [];
    if (Array.isArray(v)) return v;
    if (typeof v === "object") {
      if (typeof v.length === "number" && v.length >= 0) {
        try {
          return Array.from(v);
        } catch (_) { /* fall through */ }
      }
      const vals = Object.values(v);
      if (vals.length && vals.every((x) => x && typeof x === "object" && (x.Name != null || x.name != null))) {
        return vals;
      }
    }
    return [];
  }

  /* ---- Charts ---- */
  function ensureCharts() {
    if (typeof Chart === "undefined") return;
    Chart.defaults.color = "#8b97a8";
    Chart.defaults.borderColor = "rgba(255,255,255,0.07)";
    Chart.defaults.font.family = "Outfit";
  }

  function renderDiskChart(disks) {
    ensureCharts();
    const labels = disks.map((d) => fixEncoding(d.Name) + ":");
    const used = disks.map((d) => Math.round((d.Used / 1073741824) * 100) / 100);
    const free = disks.map((d) => Math.round((d.Free / 1073741824) * 100) / 100);
    const ctx = $("#chartDisk");
    if (chartDisk) chartDisk.destroy();
    chartDisk = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          { label: t("diskUsed"), data: used, backgroundColor: "rgba(224,53,69,0.75)", borderRadius: 6 },
          { label: t("diskFree"), data: free, backgroundColor: "rgba(90,90,110,0.55)", borderRadius: 6 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "bottom" }, title: { display: true, text: t("chartDisks"), color: "#f0f0f2" } },
        scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } },
      },
    });
  }

  function renderFolderChart(folders) {
    ensureCharts();
    const top = folders.slice(0, 6);
    const ctx = $("#chartFolders");
    if (chartFolders) chartFolders.destroy();
    chartFolders = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: top.map((f) => fixEncoding(f.Label)),
        datasets: [
          {
            data: top.map((f) => f.Bytes),
            backgroundColor: ["#e03545", "#ff6b78", "#e0a84a", "#5a9e72", "#9a9aa3", "#c45c68"],
            borderWidth: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom" },
          title: { display: true, text: t("chartFolders"), color: "#f0f0f2" },
          tooltip: {
            callbacks: {
              label: (c) => " " + fmtSize(c.raw),
            },
          },
        },
      },
    });
  }

  function showDiskDelta(delta, source) {
    const panel = $("#diskDeltaPanel");
    const list = $("#diskDeltaList");
    if (!delta || !delta.Rows) {
      return;
    }
    const rows = Array.isArray(delta.Rows) ? delta.Rows : Object.values(delta.Rows || {});
    list.innerHTML = "";
    if (!rows.length) {
      list.innerHTML = '<li class="muted">' + t("emptyDelta") + '</li>';
    } else {
      rows.forEach((r) => {
        const li = document.createElement("li");
        const txt = fixEncoding(r.DeltaText || "");
        li.textContent = `${fixEncoding(r.Name)}: ${txt} libre (${fixEncoding(r.FreeBeforeText)} → ${fixEncoding(r.FreeAfterText)})`;
        if (String(txt).startsWith("+")) li.className = "ok";
        list.appendChild(li);
      });
    }
    panel.hidden = false;
    log(t("deltaDisk", { source: source || "action", detail: rows.map((r) => `${r.Name} ${r.DeltaText}`).join(", ") }), "ok");
  }

  /* ---- Health ---- */
  async function refreshHealthData() {
    const data = await api("getHealth");
    const disks = data.disks || [];
    const folders = data.folders || [];
    const st = data.stats || {};
    const primary = disks[0] || {};
    $("#healthStats").innerHTML = `
        <div class="stat"><div class="label">${escapeHtml(primary.Name || "—")}</div><div class="value">${escapeHtml(primary.FreeText || fmtSize(primary.Free))}</div><div class="sub">${t("labelFree")} ${escapeHtml(primary.TotalText || fmtSize(primary.Total))}</div></div>
        <div class="stat blue"><div class="label">${t("labelLastScan")}</div><div class="value">${st.LastScanBytes != null ? fmtSize(st.LastScanBytes) : "—"}</div></div>
        <div class="stat warn"><div class="label">${t("labelLastFreed")}</div><div class="value">${st.LastFreedBytes ? fmtSize(st.LastFreedBytes) : "—"}</div></div>
        <div class="stat ok"><div class="label">${t("labelTotalFreed")}</div><div class="value">${st.TotalFreedBytes ? fmtSize(st.TotalFreedBytes) : "—"}</div></div>
      `;
    if (typeof Chart !== "undefined") {
      renderDiskChart(disks);
      renderFolderChart(folders);
    }
    log(t("logHealthOk"), "ok");
    $("#sideStatus").textContent = t("statusHealthOk");
  }

  async function loadHealth() {
    setBusy(true, t("statusHealth"));
    try {
      await refreshHealthData();
    } catch (e) {
      log(e.message, "err");
      $("#sideStatus").textContent = t("statusHealthErr");
    } finally {
      setBusy(false);
    }
  }

  /* ---- Clean ---- */
  async function loadCategories() {
    const data = await api("getCategories");
    const all = data.categories || [];
    categories = all.filter((c) => !c.TracesOnly);
    const box = $("#cleanCats");
    box.innerHTML = "";
    if (!categories.length) {
      box.innerHTML = '<div class="check-item"><div class="d">' + t("emptyCats") + "</div></div>";
    }
    categories.forEach((c) => {
      const div = document.createElement("label");
      div.className = "check-item";
      div.innerHTML = `<input type="checkbox" data-id="${escapeAttr(c.Id)}" ${c.DefaultOn ? "checked" : ""} />
        <div><div class="t">${escapeHtml(c.Label)}</div><div class="d">${escapeHtml(c.Description || "")}</div></div>`;
      box.appendChild(div);
    });
    $("#stCats").textContent = String(categories.length);
    updateSelCount();
    box.addEventListener("change", updateSelCount);
    ensureTracesCats(all);
  }

  function traceLabel(id) {
    const map = TRACE_LABELS[suiteLang] || TRACE_LABELS.fr;
    return map[id] || id;
  }

  function ensureTracesCats(allCats) {
    const box = $("#tracesCats");
    if (!box || box.dataset.ready === "1") return;
    const byId = {};
    (allCats || categories || []).forEach((c) => {
      byId[c.Id] = c;
    });
    box.innerHTML = "";
    TRACE_CAT_IDS.forEach((id) => {
      const c = byId[id];
      const label = c ? c.Label : traceLabel(id);
      const desc = c ? c.Description || "" : "";
      const on = c ? c.DefaultOn !== false && id !== "Screenshots" : id !== "Screenshots";
      const div = document.createElement("label");
      div.className = "check-item";
      div.innerHTML = `<input type="checkbox" data-id="${escapeAttr(id)}" ${on ? "checked" : ""} />
        <div><div class="t">${escapeHtml(label)}</div><div class="d">${escapeHtml(desc || traceLabel(id))}</div></div>`;
      box.appendChild(div);
    });
    box.dataset.ready = "1";
    $("#stTraceCats").textContent = String(TRACE_CAT_IDS.length);
    box.addEventListener("change", updateTraceSelCount);
    updateTraceSelCount();
  }

  function selectedTraceIds() {
    return $$("#tracesCats input[type=checkbox]:checked").map((el) => el.dataset.id);
  }

  function updateTraceSelCount() {
    const el = $("#stTraceSel");
    if (el) el.textContent = String(selectedTraceIds().length);
  }

  async function listTraces() {
    const ids = selectedTraceIds();
    if (!ids.length) {
      log(t("needCategory"), "warn");
      return;
    }
    setBusy(true, t("statusTraces"));
    try {
      const data = await api("listTraces", { ids });
      const cats = data.categories || [];
      $("#stTraceItems").textContent = String(data.totalCount != null ? data.totalCount : "—");
      const root = $("#tracesResult");
      root.innerHTML = "";
      if (!cats.length) {
        root.innerHTML = '<p class="muted">' + escapeHtml(t("emptyTracesHint")) + "</p>";
      } else {
        cats.forEach((c) => {
          const panel = document.createElement("div");
          panel.className = "traces-group";
          const note = c.note ? ` · ${fixEncoding(c.note)}` : "";
          const head = document.createElement("h4");
          head.textContent = `${fixEncoding(c.label || c.id)} — ${c.count || 0} · ${fixEncoding(c.sizeText || fmtSize(c.bytes))}${note}`;
          panel.appendChild(head);
          const ul = document.createElement("ul");
          ul.className = "list";
          const items = c.items || [];
          if (!items.length) {
            const li = document.createElement("li");
            li.className = "muted";
            li.textContent = "—";
            ul.appendChild(li);
          } else {
            items.forEach((it) => {
              const li = document.createElement("li");
              const name = fixEncoding(it.name || "");
              const detail = fixEncoding(it.detail || "");
              const size = it.size ? ` · ${fmtSize(it.size)}` : "";
              li.textContent = detail ? `${name} → ${detail}${size}` : `${name}${size}`;
              if (it.path) li.title = it.path;
              ul.appendChild(li);
            });
            if ((c.count || 0) > items.length) {
              const more = document.createElement("li");
              more.className = "muted";
              more.textContent = t("tracesItemsShown", { n: items.length });
              ul.appendChild(more);
            }
          }
          panel.appendChild(ul);
          root.appendChild(panel);
        });
      }
      log(`Traces: ${data.totalCount || 0} · ${fixEncoding(data.totalText || "")}`, "ok");
    } catch (e) {
      log(e.message, "err");
    } finally {
      setBusy(false);
    }
  }

  async function clearTraces() {
    const ids = selectedTraceIds();
    if (!ids.length) {
      log(t("needCategory"), "warn");
      return;
    }
    if (!confirm(t("confirmTraces"))) return;
    if (ids.includes("Screenshots") && !confirm(t("confirmTracesScreenshots"))) return;
    setBusy(true, t("statusTracesClear"));
    try {
      const data = await api("runClean", { ids });
      log(t("tracesCleared", { freed: data.FreedText || fmtSize(data.FreedBytes) }), "ok");
      showDiskDelta(data.diskDelta, "traces");
      $("#sideStatus").textContent = t("tracesCleared", { freed: data.FreedText || "" });
      await listTraces();
      await refreshHealthData();
    } catch (e) {
      log(e.message, "err");
    } finally {
      setBusy(false);
    }
  }

  function selectedIds() {
    return $$("#cleanCats input[type=checkbox]:checked").map((el) => el.dataset.id);
  }

  function updateSelCount() {
    $("#stSel").textContent = String(selectedIds().length);
  }

  function applyProfile(name) {
    $$("#cleanCats input[type=checkbox]").forEach((el) => {
      const cat = categories.find((c) => c.Id === el.dataset.id);
      if (!cat) return;
      const profiles = cat.Profiles || [];
      el.checked = profiles.includes(name) || (name === "Max" && cat.DefaultOn);
    });
    updateSelCount();
    log(t("logProfile", { name }));
    $("#sideStatus").textContent = "Profil " + name;
  }

  async function scanClean() {
    const ids = selectedIds();
    if (!ids.length) {
      log(t("needCategory"), "warn");
      return;
    }
    setBusy(true, t("statusScan"));
    try {
      const data = await api("scanClean", { ids });
      $("#stEst").textContent = data.totalText || fmtSize(data.totalBytes);
      const list = $("#cleanResult");
      list.innerHTML = "";
      (data.categories || []).forEach((c) => {
        const li = document.createElement("li");
        li.textContent = `${fixEncoding(c.Label)}: ${fixEncoding(c.SizeText)} (${c.Count} éléments)`;
        list.appendChild(li);
      });
      const tot = document.createElement("li");
      tot.className = "ok";
      tot.style.color = "var(--accent)";
      tot.textContent = "Total: " + fixEncoding(data.totalText || "");
      list.appendChild(tot);
      log("Analyse: " + fixEncoding(data.totalText), "ok");
    } catch (e) {
      log(e.message, "err");
    } finally {
      setBusy(false);
    }
  }

  async function runClean() {
    const ids = selectedIds();
    if (!ids.length) return;
    if (!confirm(t("confirmClean"))) return;
    setBusy(true, t("statusClean"));
    try {
      const data = await api("runClean", { ids });
      log(t("freed", { freed: data.FreedText || fmtSize(data.FreedBytes) }), "ok");
      showDiskDelta(data.diskDelta, "nettoyage");
      $("#sideStatus").textContent = t("cleaned", { freed: data.FreedText || "" });
      await refreshHealthData();
    } catch (e) {
      log(e.message, "err");
    } finally {
      setBusy(false);
    }
  }

  /* ---- Debloat ---- */
  async function scanBloat() {
    setBusy(true, t("statusBloat"));
    try {
      const data = await api("getBloatApps");
      const apps = data.apps || [];
      const box = $("#bloatList");
      box.innerHTML = "";
      if (!apps.length) {
        box.innerHTML = '<div class="check-item"><div class="d">' + t("emptyBloat") + '</div></div>';
      } else {
        apps.forEach((a) => {
          const div = document.createElement("label");
          div.className = "check-item";
          div.innerHTML = `<input type="checkbox" data-name="${escapeAttr(a.Name)}" ${a.Selected !== false ? "checked" : ""} />
            <div><div class="t">${escapeHtml(a.Name)}</div><div class="d">${escapeHtml(a.ApproxSizeText || "")} ${a.Provisioned ? "· provisioned" : ""}</div></div>`;
          box.appendChild(div);
        });
      }
      log(`Bloat: ${apps.length} apps`, "ok");
    } catch (e) {
      log(e.message, "err");
    } finally {
      setBusy(false);
    }
  }

  async function removeBloat() {
    const names = $$("#bloatList input:checked").map((el) => el.dataset.name);
    if (!names.length) return;
    if (!confirm(t("confirmBloat", { n: names.length }))) return;
    setBusy(true, t("statusDebloat"));
    try {
      const r = await api("removeBloat", { names });
      log(`Debloat — retirés: ${r.Removed}, échecs: ${r.Failed}`, "ok");
      await scanBloat();
    } catch (e) {
      log(e.message, "err");
    } finally {
      setBusy(false);
    }
  }

  /* ---- Uninstall / Purge ---- */
  async function findPurge() {
    const keyword = ($("#purgeQuery").value || "").trim();
    if (!keyword) {
      log(t("needKeyword"), "warn");
      return;
    }
    setBusy(true, t("statusSearch"));
    try {
      const data = await api("findPurge", { keyword });
      lastPurge = { apps: data.apps || [], leftovers: data.leftovers || [] };
      renderPurgeTables();
      log(`Trouvé: ${lastPurge.apps.length} apps, ${lastPurge.leftovers.length} restes`, "ok");
    } catch (e) {
      log(e.message, "err");
    } finally {
      setBusy(false);
    }
  }

  function renderPurgeTables() {
    const tbA = $("#purgeApps");
    tbA.innerHTML = "";
    if (!lastPurge.apps.length) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="4" class="muted">${t("emptyPurgeApps")}</td>`;
      tbA.appendChild(tr);
    }
    lastPurge.apps.forEach((a, i) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td><input type="checkbox" data-i="${i}" ${a.Selected !== false && a.Verdict !== "Protected" ? "checked" : ""} /></td>
        <td>${escapeHtml(a.Name)} <span class="verdict-${a.Verdict}">${a.Verdict || ""}</span></td>
        <td>${escapeHtml(a.Publisher || "")}</td>
        <td>${escapeHtml(a.Version || "")}</td>`;
      tbA.appendChild(tr);
    });
    const tbL = $("#purgeLeft");
    tbL.innerHTML = "";
    if (!lastPurge.leftovers.length) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="4" class="muted">${t("emptyPurgeLeft")}</td>`;
      tbL.appendChild(tr);
    }
    lastPurge.leftovers.forEach((h, i) => {
      const tr = document.createElement("tr");
      const can = h.Verdict === "Safe";
      tr.innerHTML = `<td><input type="checkbox" data-i="${i}" ${can && h.Selected !== false ? "checked" : ""} ${can ? "" : "disabled"} /></td>
        <td>${escapeHtml(h.Path || h.Name)}</td>
        <td>${escapeHtml(h.SizeText || "")}</td>
        <td class="verdict-${h.Verdict}">${escapeHtml(h.Verdict || "")}</td>`;
      tbL.appendChild(tr);
    });
  }

  async function officialUninstall() {
    const idxs = $$("#purgeApps input:checked").map((el) => +el.dataset.i);
    const apps = idxs.map((i) => lastPurge.apps[i]).filter(Boolean);
    if (!apps.length) return;
    if (!confirm(t("confirmUninstall", { n: apps.length }))) return;
    setBusy(true, t("statusUninstall"));
    try {
      const r = await api("officialUninstall", { apps });
      (r.results || []).forEach((x) => log(x.Message || JSON.stringify(x), x.Success ? "ok" : "err"));
      await findPurge();
    } catch (e) {
      log(e.message, "err");
    } finally {
      setBusy(false);
    }
  }

  async function purgeLeftovers() {
    const idxs = $$("#purgeLeft input:checked").map((el) => +el.dataset.i);
    const hits = idxs.map((i) => lastPurge.leftovers[i]).filter((h) => h && h.Verdict === "Safe");
    if (!hits.length) {
      log(t("needSafe"), "warn");
      return;
    }
    if (!confirm(t("confirmPurge", { n: hits.length }))) return;
    setBusy(true, t("statusPurge"));
    try {
      const r = await api("purgeLeftovers", { hits });
      log(`Purge — retirés: ${r.Removed}, skip: ${r.Skipped}, échecs: ${r.Failed}`, "ok");
      showDiskDelta(r.diskDelta, "purge");
      await findPurge();
    } catch (e) {
      log(e.message, "err");
    } finally {
      setBusy(false);
    }
  }

  async function loadExclusions() {
    setBusy(true, t("statusExcl"));
    try {
      const data = await api("getExclusions");
      $("#exclText").value = (data.exclusions || []).join("\n");
      log(`Exclusions: ${(data.exclusions || []).length}`, "ok");
    } catch (e) {
      log(e.message, "err");
    } finally {
      setBusy(false);
    }
  }

  async function saveExclusions() {
    const lines = ($("#exclText").value || "")
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith("#"));
    setBusy(true, t("statusSaving"));
    try {
      const data = await api("setExclusions", { exclusions: lines });
      $("#exclText").value = (data.exclusions || []).join("\n");
      log(t("logExclSaved", { n: (data.exclusions || []).length }), "ok");
      $("#sideStatus").textContent = t("statusExclOk");
    } catch (e) {
      log(e.message, "err");
    } finally {
      setBusy(false);
    }
  }

  /* ---- Opt ---- */
  function buildOptList() {
    const box = $("#optList");
    box.innerHTML = "";
    optDefaults().forEach((o) => {
      const div = document.createElement("label");
      div.className = "check-item";
      const checked = o.id !== "componentCleanup" ? "checked" : "";
      div.innerHTML = `<input type="checkbox" data-opt="${o.id}" ${checked} />
        <div><div class="t">${o.label}</div><div class="d">${o.desc}</div></div>`;
      box.appendChild(div);
    });
  }

  function optFlags() {
    const f = {};
    $$("#optList input").forEach((el) => {
      f[el.dataset.opt] = el.checked;
    });
    return f;
  }

  async function runOpt() {
    if (!confirm(t("confirmOpt"))) return;
    setBusy(true, t("statusOpt"));
    try {
      await api("runOptimizations", optFlags());
      $("#optOut").innerHTML = '<li class="ok">' + t("optApplied") + '</li>';
      log(t("logOptOk"), "ok");
    } catch (e) {
      log(e.message, "err");
    } finally {
      setBusy(false);
    }
  }

  async function runLong(action, label) {
    if (!confirm(t("confirmLong", { label }))) return;
    setBusy(true, label + "...");
    try {
      const r = await api(action);
      const msg = r.Message || JSON.stringify(r);
      $("#optOut").innerHTML = `<li>${escapeHtml(msg)}</li>`;
      log(msg, r.Success ? "ok" : "warn");
    } catch (e) {
      log(e.message, "err");
    } finally {
      setBusy(false);
    }
  }

  /* ---- Startup ---- */
  /* ---- Sessions ---- */
  async function loadSessions() {
    setBusy(true, t("statusSessions"));
    try {
      const data = await api("getSessions");
      const tb = $("#sessionsBody");
      tb.innerHTML = "";
      const logs = data.logs || [];
      const undo = data.undo || [];
      if (!logs.length && !undo.length) {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td colspan="3" class="muted">${t("emptySessions")}</td>`;
        tb.appendChild(tr);
      }
      logs.forEach((l) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${escapeHtml(l.Modified)}</td><td>Log</td><td>${escapeHtml(l.Name)} — ${escapeHtml(l.Freed || "")}</td>`;
        tb.appendChild(tr);
      });
      undo.forEach((u) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${escapeHtml(u.Modified)}</td><td>Undo ${escapeHtml(u.Kind)}</td><td>${escapeHtml(u.Name)}</td>`;
        tb.appendChild(tr);
      });
      log(t("logSessionsOk"), "ok");
    } catch (e) {
      log(e.message, "err");
    } finally {
      setBusy(false);
    }
  }

  async function exportReport() {
    setBusy(true, t("statusReport"));
    try {
      const data = await api("exportReport");
      log("Rapport: " + data.path, "ok");
      if (window.pywebview.api.open_path) await window.pywebview.api.open_path(data.path);
    } catch (e) {
      log(e.message, "err");
    } finally {
      setBusy(false);
    }
  }

  async function createRestore() {
    if (!confirm(t("confirmRestore"))) return;
    setBusy(true, t("statusRestore"));
    try {
      const r = await api("createRestorePoint");
      log(r.Message || "", r.Success ? "ok" : "err");
      alert(r.Message || "");
    } catch (e) {
      log(e.message, "err");
    } finally {
      setBusy(false);
    }
  }

  /** Corrige mojibake UTF-8 lu en Latin-1 (ex. TÃ©lÃ©chargements → Téléchargements). */
  function fixEncoding(s) {
    if (s == null) return "";
    s = String(s);
    if (!/[ÃÂâ]/.test(s)) return s;
    try {
      const bytes = Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);
      const decoded = new TextDecoder("utf-8").decode(bytes);
      if (decoded && !decoded.includes("\uFFFD") && /[éèêëàâäùûüôöîïçÉÈÀÙÔÎÇ]/.test(decoded)) {
        return decoded;
      }
    } catch (_) { /* keep original */ }
    return s;
  }

  function escapeHtml(s) {
    return fixEncoding(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, "&#39;");
  }

  /* ---- Boot ---- */
  function wire() {
    async function openSuiteApp(name) {
      try {
        const bridge = window.pywebview && window.pywebview.api;
        if (!bridge || typeof bridge.open_suite_app !== "function") {
          log(t("hostApiMissing"), "err");
          return;
        }
        const res = await bridge.open_suite_app(name);
        if (!res || !res.ok) {
          log(
            (res && res.error) ||
              (suiteLang === "en" ? `Could not open ${name}` : `Impossible d’ouvrir ${name}`),
            "err"
          );
        } else {
          log(t("launched", { name }), "ok");
        }
      } catch (e) {
        log(String(e.message || e), "err");
      }
    }

    $$(".nav-btn").forEach((b) => b.addEventListener("click", () => setPage(b.dataset.page)));
    $("#btnHealthRefresh").addEventListener("click", loadHealth);
    const btnDiskMap = $("#btnOpenDiskMap");
    if (btnDiskMap) btnDiskMap.addEventListener("click", () => openSuiteApp("DiskMap"));
const btnStartupX = $("#btnOpenStartupX");
    if (btnStartupX) btnStartupX.addEventListener("click", () => openSuiteApp("StartupX"));
    $("#btnProfileLight").addEventListener("click", () => applyProfile("Light"));
    $("#btnProfileGame").addEventListener("click", () => applyProfile("Gaming"));
    $("#btnProfileMax").addEventListener("click", () => applyProfile("Max"));
    $("#btnScanClean").addEventListener("click", scanClean);
    $("#btnRunClean").addEventListener("click", runClean);
    $("#btnListTraces").addEventListener("click", listTraces);
    $("#btnClearTraces").addEventListener("click", clearTraces);
    $("#btnScanBloat").addEventListener("click", scanBloat);
    $("#btnRemoveBloat").addEventListener("click", removeBloat);
    $("#btnFindPurge").addEventListener("click", findPurge);
    $("#btnOfficialUninstall").addEventListener("click", officialUninstall);
    $("#btnPurgeLeft").addEventListener("click", purgeLeftovers);
    $("#btnRunOpt").addEventListener("click", runOpt);
    $("#btnWinSxS").addEventListener("click", () => runLong("analyzeWinSxS", t("btnWinSxS")));
    $("#btnDism").addEventListener("click", () => runLong("dismRestoreHealth", t("btnDism")));
    $("#btnSfc").addEventListener("click", () => runLong("sfcScan", t("btnSfc")));
    $("#btnRefreshSessions").addEventListener("click", loadSessions);
    $("#btnExportReport").addEventListener("click", exportReport);
    $("#btnSaveExcl").addEventListener("click", saveExclusions);
    $("#btnReloadExcl").addEventListener("click", loadExclusions);
    $("#btnRestore").addEventListener("click", createRestore);
    $("#btnClearLog").addEventListener("click", () => {
      $("#log").innerHTML = "";
    });
    buildOptList();
  }

  async function boot() {
    wire();
    log(t("logReady"));
    const ready = () =>
      new Promise((resolve) => {
        if (window.pywebview && window.pywebview.api) resolve();
        else window.addEventListener("pywebviewready", resolve, { once: true });
        setTimeout(resolve, 2500);
      });
    await ready();
    await bootSuite(window.pywebview && window.pywebview.api);
    try {
      await loadCategories();
      await loadHealth();
    } catch (e) {
      log(e.message, "err");
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
