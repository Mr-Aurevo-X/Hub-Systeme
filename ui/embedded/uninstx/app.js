/* UninstX — app.js */
(function () {
  "use strict";

  /* ── i18n ────────────────────────────────────────────────────────────────── */
  const I18N = {
    fr: {
      tagline: "Gestionnaire de désinstallation",
      featuresTitle: "FONCTIONS",
      features: "Liste les programmes installés (registre Windows), désinstalle avec confirmation, scanne les fichiers résiduels.",
      searchPh: "Filtrer par nom ou éditeur…",
      btnRefresh: "Actualiser",
      loading: "Chargement…",
      noApps: "Aucun programme trouvé.",
      colName: "Nom",
      colVersion: "Version",
      colPublisher: "Éditeur",
      colHive: "Source",
      colActions: "Actions",
      btnUninstall: "Désinstaller",
      btnScan: "Résiduels",
      confirmTitle: "Confirmer la désinstallation",
      confirmMsg: (name) => `Désinstaller « ${name} » ? Cette action est irréversible.`,
      btnConfirmCancel: "Annuler",
      btnConfirmOk: "Désinstaller",
      leftoversTitle: "Fichiers résiduels",
      leftoversFor: (name) => `Résultats pour « ${name} »`,
      leftoversEmpty: "Aucun dossier résiduel trouvé.",
      leftoversNote: "Liste en lecture seule — aucune suppression automatique.",
      btnOpenFolder: "Ouvrir",
      copyright: "© 2026 Mr-Aurevo-X · local · CGU dans L'Atelier PC Command",
      title: "UninstX",
      subtitle: "Programmes installés — désinstallation avec confirmation.",
      statusLoading: "Chargement de la liste…",
      statusLoaded: (count) => `${count} programme(s) chargé(s).`,
      statusUninstalling: (name) => `Désinstallation de « ${name} » lancée.`,
      statusScanning: "Recherche des résiduels…",
      errUninstall: "Erreur de désinstallation : ",
      errScan: "Erreur de scan : ",
      errLoad: "Erreur de chargement : ",
      noUninstallCmd: "Aucune commande de désinstallation disponible.",
      privacy: "Mr-Aurevo-X ne collecte aucune donnée. Gestion locale uniquement.",
    },
    en: {
      tagline: "Uninstall manager",
      featuresTitle: "FEATURES",
      features: "Lists installed programs (Windows registry), uninstalls with confirmation, scans for leftover files.",
      searchPh: "Filter by name or publisher…",
      btnRefresh: "Refresh",
      loading: "Loading…",
      noApps: "No programs found.",
      colName: "Name",
      colVersion: "Version",
      colPublisher: "Publisher",
      colHive: "Source",
      colActions: "Actions",
      btnUninstall: "Uninstall",
      btnScan: "Leftovers",
      confirmTitle: "Confirm uninstall",
      confirmMsg: (name) => `Uninstall "${name}"? This action cannot be undone.`,
      btnConfirmCancel: "Cancel",
      btnConfirmOk: "Uninstall",
      leftoversTitle: "Leftover files",
      leftoversFor: (name) => `Results for "${name}"`,
      leftoversEmpty: "No leftover folders found.",
      leftoversNote: "Read-only list — nothing is deleted automatically.",
      btnOpenFolder: "Open",
      copyright: "© 2026 Mr-Aurevo-X · local · no data collection",
      title: "UninstX",
      subtitle: "Installed programs — uninstall with confirmation.",
      statusLoading: "Loading list…",
      statusLoaded: (count) => `${count} program(s) loaded.`,
      statusUninstalling: (name) => `Uninstall of "${name}" started.`,
      statusScanning: "Scanning for leftovers…",
      errUninstall: "Uninstall error: ",
      errScan: "Scan error: ",
      errLoad: "Load error: ",
      noUninstallCmd: "No uninstall command available for this app.",
      privacy: "Mr-Aurevo-X does not collect your data. Local management only.",
    },
  };

  let lang = "fr";
  let t = I18N.fr;

  function setLang(l) {
    lang = l === "en" ? "en" : "fr";
    t = I18N[lang];
  }

  /* ── DOM refs ──────────────────────────────────────────────────────────── */
  const searchInput     = document.getElementById("searchInput");
  const btnRefresh      = document.getElementById("btnRefresh");
  const loadingState    = document.getElementById("loadingState");
  const emptyState      = document.getElementById("emptyState");
  const tableWrap       = document.getElementById("tableWrap");
  const appsBody        = document.getElementById("appsBody");
  const appsMeta        = document.getElementById("appsMeta");
  const leftoversPanel  = document.getElementById("leftoversPanel");
  const leftoversTitle  = document.getElementById("leftoversTitle");
  const leftoversApp    = document.getElementById("leftoversApp");
  const leftoversBody   = document.getElementById("leftoversBody");
  const btnCloseLeft    = document.getElementById("btnCloseLeftovers");
  const confirmOverlay  = document.getElementById("confirmOverlay");
  const confirmMsg      = document.getElementById("confirmMsg");
  const btnConfirmOk    = document.getElementById("btnConfirmOk");
  const btnConfirmCancel = document.getElementById("btnConfirmCancel");
  const status          = document.getElementById("status");

  /* ── state ─────────────────────────────────────────────────────────────── */
  let allApps = [];
  let pendingUninstall = null; // {name, id}

  /* ── helpers ───────────────────────────────────────────────────────────── */
  function setStatus(msg, cls) {
    status.textContent = msg;
    status.className = "status" + (cls ? " " + cls : "");
  }

  function esc(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async function callApi(name, ...args) {
    if (typeof pywebview === "undefined" || !pywebview.api) return null;
    return pywebview.api[name](...args);
  }

  /* ── filter ─────────────────────────────────────────────────────────────── */
  function getFiltered() {
    const q = searchInput.value.trim().toLowerCase();
    if (!q) return allApps;
    return allApps.filter(
      (a) => a.name.toLowerCase().includes(q) || a.publisher.toLowerCase().includes(q)
    );
  }

  /* ── render ─────────────────────────────────────────────────────────────── */
  function renderApps(apps) {
    appsBody.innerHTML = "";
    if (!apps.length) {
      loadingState.hidden = true;
      emptyState.hidden = false;
      tableWrap.hidden = true;
      return;
    }
    loadingState.hidden = true;
    emptyState.hidden = true;
    tableWrap.hidden = false;

    const frag = document.createDocumentFragment();
    for (const app of apps) {
      const tr = document.createElement("tr");
      const hiveCls = app.hive === "HKCU" ? " hkcu" : "";
      const hasUninstall = !!app.uninstall;
      tr.innerHTML =
        `<td class="col-name" title="${esc(app.name)}">${esc(app.name)}</td>` +
        `<td class="col-version">${esc(app.version) || "—"}</td>` +
        `<td class="col-publisher" title="${esc(app.publisher)}">${esc(app.publisher) || "—"}</td>` +
        `<td class="col-hive"><span class="hive-badge${hiveCls}">${esc(app.hive)}</span></td>` +
        `<td class="col-actions">` +
          `<button class="action-btn danger" data-action="uninstall" data-key="${esc(app.key)}"` +
            ` ${hasUninstall ? "" : "disabled"} title="${hasUninstall ? "" : esc(t.noUninstallCmd)}">` +
            `${esc(t.btnUninstall)}</button>` +
          `<button class="action-btn" data-action="scan" data-key="${esc(app.key)}">` +
            `${esc(t.btnScan)}</button>` +
        `</td>`;
      frag.appendChild(tr);
    }
    appsBody.appendChild(frag);

    const total = allApps.length;
    const shown = apps.length;
    appsMeta.textContent = shown === total
      ? t.statusLoaded(total)
      : `${shown} / ${total}`;
  }

  /* ── load apps ──────────────────────────────────────────────────────────── */
  async function loadApps() {
    loadingState.hidden = false;
    emptyState.hidden = true;
    tableWrap.hidden = true;
    appsBody.innerHTML = "";
    appsMeta.textContent = "";
    leftoversPanel.hidden = true;
    setStatus(t.statusLoading);

    try {
      const res = await callApi("list_apps", "");
      if (!res || !res.ok) {
        setStatus(t.errLoad + (res ? res.error : "No response"), "error");
        loadingState.hidden = true;
        return;
      }
      allApps = res.apps || [];
      renderApps(getFiltered());
      setStatus(t.statusLoaded(allApps.length));
    } catch (err) {
      setStatus(t.errLoad + String(err), "error");
      loadingState.hidden = true;
    }
  }

  /* ── event delegation ───────────────────────────────────────────────────── */
  appsBody.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn || btn.disabled) return;
    const key = btn.dataset.key;
    const app = allApps.find((a) => a.key === key);
    if (!app) return;
    if (btn.dataset.action === "uninstall") startUninstall(app);
    else if (btn.dataset.action === "scan") doScan(app);
  });

  /* ── search filter ──────────────────────────────────────────────────────── */
  searchInput.addEventListener("input", () => renderApps(getFiltered()));

  /* ── refresh ────────────────────────────────────────────────────────────── */
  btnRefresh.addEventListener("click", loadApps);

  /* ── confirm dialog ─────────────────────────────────────────────────────── */
  function startUninstall(app) {
    if (!app.uninstall || !app.id) { setStatus(t.noUninstallCmd, "error"); return; }
    pendingUninstall = { name: app.name, id: app.id };
    confirmMsg.textContent = t.confirmMsg(app.name);
    confirmOverlay.hidden = false;
  }

  btnConfirmCancel.addEventListener("click", () => {
    confirmOverlay.hidden = true;
    pendingUninstall = null;
  });

  btnConfirmOk.addEventListener("click", async () => {
    if (!pendingUninstall) return;
    const { name, id } = pendingUninstall;
    confirmOverlay.hidden = true;
    pendingUninstall = null;
    try {
      const prep = await callApi("prepare_uninstall_app", id);
      if (!prep || !prep.ok || !prep.token) {
        setStatus(t.errUninstall + (prep ? prep.error : "Confirmation refusee"), "error");
        return;
      }
      const res = await callApi("uninstall_app", id, prep.token);
      if (res && res.ok) {
        setStatus(t.statusUninstalling(name), "ok");
      } else {
        setStatus(t.errUninstall + (res ? res.error : "?"), "error");
      }
    } catch (err) {
      setStatus(t.errUninstall + String(err), "error");
    }
  });

  /* ── scan leftovers ─────────────────────────────────────────────────────── */
  async function doScan(app) {
    leftoversPanel.hidden = false;
    leftoversTitle.textContent = t.leftoversTitle;
    leftoversApp.textContent = t.leftoversFor(app.name);
    leftoversBody.innerHTML = `<p class="empty-state" style="padding:12px">${esc(t.statusScanning)}</p>`;
    setStatus(t.statusScanning);

    try {
      const res = await callApi("scan_leftovers", app.name, app.location || "");
      leftoversBody.innerHTML = "";
      if (!res || !res.ok) {
        leftoversBody.innerHTML = `<p class="leftovers-empty">${esc(res ? res.error : "Error")}</p>`;
        setStatus(t.errScan + (res ? res.error : "?"), "error");
        return;
      }
      if (!res.paths.length) {
        leftoversBody.innerHTML = `<p class="leftovers-empty">${esc(t.leftoversEmpty)}</p>`;
      } else {
        const note = document.createElement("p");
        note.className = "leftovers-app muted";
        note.textContent = t.leftoversNote;
        leftoversBody.appendChild(note);
        for (const p of res.paths) {
          const item = document.createElement("div");
          item.className = "leftover-item";
          const pathSpan = document.createElement("span");
          pathSpan.className = "path-text";
          pathSpan.title = p;
          pathSpan.textContent = p;
          const openBtn = document.createElement("button");
          openBtn.type = "button";
          openBtn.className = "action-btn";
          openBtn.dataset.action = "openfolder";
          openBtn.dataset.path = p;
          openBtn.textContent = t.btnOpenFolder;
          item.appendChild(pathSpan);
          item.appendChild(openBtn);
          leftoversBody.appendChild(item);
        }
      }
      setStatus("");
    } catch (err) {
      leftoversBody.innerHTML = `<p class="leftovers-empty">${esc(String(err))}</p>`;
      setStatus(t.errScan + String(err), "error");
    }
  }

  /* ── open folder from leftovers ─────────────────────────────────────────── */
  leftoversBody.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action='openfolder']");
    if (!btn) return;
    const p = btn.dataset.path;
    if (p) callApi("open_folder", p).catch(() => {});
  });

  /* ── close leftovers ────────────────────────────────────────────────────── */
  btnCloseLeft.addEventListener("click", () => {
    leftoversPanel.hidden = true;
    leftoversBody.innerHTML = "";
  });

  /* ── boot ────────────────────────────────────────────────────────────────── */
  async function boot() {
    const api = typeof pywebview !== "undefined" ? pywebview.api : undefined;
    if (typeof MrAurevoXSuite !== "undefined") {
      const settings = await MrAurevoXSuite.loadSuiteSettings(api);
      setLang(settings.language);
      MrAurevoXSuite.applyAccent(settings.accent);
      MrAurevoXSuite.applyI18n(settings.language, I18N);
    }
    await loadApps();
  }

  if (typeof pywebview !== "undefined") {
    window.addEventListener("pywebviewready", boot);
  } else {
    boot();
  }
})();
