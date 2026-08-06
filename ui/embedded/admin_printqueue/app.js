(() => {
  "use strict";
  const SUITE_I18N = {
    fr: {
      tagline: "Files d'impression",
      copyright: "© 2026 Mr-Aurevo-X · local · CGU dans L'Atelier PC Command",
      title: "Impression",
      featuresTitle: "Fonctions",
      features: "Liste imprimantes et travaux ; purge la file sélectionnée (confirmation).",
      privacy: "Mr-Aurevo-X ne collecte aucune donnée. Gestion locale du spouleur d'impression.",
      hostMissing: "Host indisponible",
      ready: "Prêt",
      fail: "Échec",
      loading: "Chargement…",
      btnRefresh: "Rafraîchir",
      btnPurge: "Purger la file",
      printerLabel: "Imprimante",
      jobsTitle: "Travaux en file",
      thDoc: "Document",
      thUser: "Utilisateur",
      thStatus: "Statut",
      thPages: "Pages",
      thTime: "Soumis",
      emptyHint: "Aucun travail en file.",
      metaCount: "{printers} imprimante(s) · {jobs} travail(aux)",
      confirmPurge: "Supprimer tous les travaux de « {printer} » ?",
      purged: "{n} travail(aux) supprimé(s)",
      refreshing: "Actualisation…",
      selectPrinter: "— Sélectionner —",
    },
    en: {
      tagline: "Print queues",
      copyright: "© 2026 Mr-Aurevo-X · local · Terms in Atelier",
      title: "Printing",
      featuresTitle: "Features",
      features: "List printers and jobs; purge selected queue (with confirmation).",
      privacy: "Mr-Aurevo-X does not collect your data. Local print spooler management.",
      hostMissing: "Host unavailable",
      ready: "Ready",
      fail: "Failed",
      loading: "Loading…",
      btnRefresh: "Refresh",
      btnPurge: "Purge queue",
      printerLabel: "Printer",
      jobsTitle: "Queued jobs",
      thDoc: "Document",
      thUser: "User",
      thStatus: "Status",
      thPages: "Pages",
      thTime: "Submitted",
      emptyHint: "No queued jobs.",
      metaCount: "{printers} printer(s) · {jobs} job(s)",
      confirmPurge: "Remove all jobs from « {printer} »?",
      purged: "{n} job(s) removed",
      refreshing: "Refreshing…",
      selectPrinter: "— Select —",
    },
  };

  let suiteLang = "fr";
  let printers = [];
  const t = (key) => (SUITE_I18N[suiteLang] && SUITE_I18N[suiteLang][key]) || SUITE_I18N.fr[key] || key;

  async function bootSuite(api) {
    const suite = window.MrAurevoXSuite;
    if (!suite) {
      if (api && api.get_suite_settings) {
        try {
          const s = await api.get_suite_settings();
          if (s && s.accent) applyAccent(s.accent);
          if (s && s.language === "en") suiteLang = "en";
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

  function applyAccent(hex) {
    const accent = String(hex || "#06b6d4").trim();
    if (!(accent.startsWith("#") && (accent.length === 4 || accent.length === 7))) return;
    let h = accent.slice(1);
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    document.documentElement.style.setProperty("--accent", accent);
    document.documentElement.style.setProperty("--accent-dim", `rgba(${r}, ${g}, ${b}, 0.2)`);
    document.documentElement.style.setProperty("--accent-glow", `rgba(${r}, ${g}, ${b}, 0.4)`);
  }

  async function apiReady() {
    return new Promise((resolve) => {
      if (window.pywebview && window.pywebview.api) return resolve(window.pywebview.api);
      window.addEventListener("pywebviewready", () => resolve(window.pywebview.api), { once: true });
      setTimeout(() => resolve(window.pywebview && window.pywebview.api), 2500);
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function fmt(key, vars) {
    let s = t(key);
    Object.entries(vars || {}).forEach(([k, v]) => { s = s.replace(new RegExp(`\\{${k}\\}`, "g"), String(v)); });
    return s;
  }

  const el = {
    btnRefresh: document.getElementById("btnRefresh"),
    btnPurge: document.getElementById("btnPurge"),
    printerSelect: document.getElementById("printerSelect"),
    tbody: document.getElementById("tbody"),
    meta: document.getElementById("meta"),
    status: document.getElementById("status"),
    emptyHint: document.getElementById("emptyHint"),
  };

  function setStatus(text, isError) {
    el.status.textContent = text || "";
    el.status.classList.toggle("error", !!isError);
    if (/^(prêt|ready|échec|failed|ok)$/i.test(String(text || "").trim()) || !text) {
      if (window.SuiteProgress) window.SuiteProgress.forceClear();
    }
  }

  async function setStatusBusy(text, isError) {
    setStatus(text, isError);
    if (window.SuiteProgress) window.SuiteProgress.setBusy(text || "…");
    await new Promise((r) => setTimeout(r, 40));
  }

  function selectedPrinter() {
    const name = el.printerSelect.value;
    return printers.find((p) => p.name === name) || null;
  }

  function fillPrinters() {
    const prev = el.printerSelect.value;
    el.printerSelect.innerHTML = "";
    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = t("selectPrinter");
    el.printerSelect.appendChild(opt0);
    printers.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.name;
      opt.textContent = p.default ? `${p.name} ★` : p.name;
      el.printerSelect.appendChild(opt);
    });
    if (prev && printers.some((p) => p.name === prev)) el.printerSelect.value = prev;
    else if (printers.length) {
      const def = printers.find((p) => p.default) || printers[0];
      el.printerSelect.value = def.name;
    }
    renderJobs();
  }

  function renderJobs() {
    const p = selectedPrinter();
    const jobs = (p && p.jobs) || [];
    el.tbody.innerHTML = "";
    el.emptyHint.hidden = jobs.length > 0;
    const totalJobs = printers.reduce((a, x) => a + ((x.jobs && x.jobs.length) || 0), 0);
    el.meta.textContent = fmt("metaCount", { printers: printers.length, jobs: totalJobs });
    jobs.forEach((j) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${escapeHtml(j.id)}</td>
        <td>${escapeHtml(j.documentName || "")}</td>
        <td>${escapeHtml(j.userName || "")}</td>
        <td>${escapeHtml(j.status || "")}</td>
        <td>${escapeHtml(j.pages ?? "")}</td>
        <td class="mono">${escapeHtml(j.submittedTime || "")}</td>`;
      el.tbody.appendChild(tr);
    });
  }

  async function refresh() {
    const api = await apiReady();
    if (!api) { setStatus(t("hostMissing"), true); return; }
    await setStatusBusy(t("refreshing"));
    try {
      const res = await api.list_print_queue();
      if (!res || !res.ok) { setStatus((res && res.error) || t("fail"), true); return; }
      printers = Array.isArray(res.printers) ? res.printers : [];
      fillPrinters();
      setStatus(t("ready"));
    } catch (err) { setStatus(String(err.message || err), true); }
  }

  el.btnRefresh.addEventListener("click", refresh);
  el.printerSelect.addEventListener("change", renderJobs);
  el.btnPurge.addEventListener("click", async () => {
    const p = selectedPrinter();
    if (!p || !p.name) return;
    if (!window.confirm(fmt("confirmPurge", { printer: p.name }))) return;
    const api = await apiReady();
    if (!api) { setStatus(t("hostMissing"), true); return; }
    await setStatusBusy(t("loading"));
    const res = await api.purge_printer_jobs(p.name);
    if (!res || !res.ok) { setStatus((res && res.error) || t("fail"), true); return; }
    setStatus(fmt("purged", { n: res.removed || 0 }));
    await refresh();
  });

  (async () => {
    const api = await apiReady();
    await bootSuite(api);
    await setStatusBusy(t("loading"));
    await refresh();
  })();
})();
