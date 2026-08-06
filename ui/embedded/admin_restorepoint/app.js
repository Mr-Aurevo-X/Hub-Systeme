(() => {
  "use strict";
  const SUITE_I18N = {
    fr: {
      tagline: "Points de restauration Windows",
      copyright: "© 2026 Mr-Aurevo-X · local · CGU dans L'Atelier PC Command",
      title: "Points de restauration",
      featuresTitle: "Fonctions",
      features: "Liste les points de restauration et en crée un nouveau (admin + confirmation).",
      privacy: "Mr-Aurevo-X ne collecte aucune donnée. Gestion locale des points de restauration uniquement.",
      hostMissing: "Host indisponible",
      ready: "Prêt",
      fail: "Échec",
      loading: "Chargement…",
      btnRefresh: "Rafraîchir",
      btnCreate: "Créer un point",
      descLabel: "Description",
      descPh: "Description du point…",
      thSeq: "#",
      thDesc: "Description",
      thDate: "Date",
      thType: "Type",
      emptyHint: "Aucun point de restauration trouvé.",
      adminHint: "La création et parfois la liste nécessitent les droits administrateur.",
      metaCount: "{count} point(s)",
      confirmCreate: "Créer un point de restauration système ? Cela peut prendre une minute.",
      created: "Point de restauration créé",
      creating: "Création en cours…",
      refreshing: "Actualisation…",
      needAdmin: "Administrateur requis — lancez depuis Atelier (admin).",
    },
    en: {
      tagline: "Windows restore points",
      copyright: "© 2026 Mr-Aurevo-X · local · Terms in Atelier",
      title: "Restore points",
      featuresTitle: "Features",
      features: "List restore points and create a new one (admin + confirmation).",
      privacy: "Mr-Aurevo-X does not collect your data. Local restore point management only.",
      hostMissing: "Host unavailable",
      ready: "Ready",
      fail: "Failed",
      loading: "Loading…",
      btnRefresh: "Refresh",
      btnCreate: "Create restore point",
      descLabel: "Description",
      descPh: "Restore point description…",
      thSeq: "#",
      thDesc: "Description",
      thDate: "Date",
      thType: "Type",
      emptyHint: "No restore points found.",
      adminHint: "Creating (and sometimes listing) requires administrator rights.",
      metaCount: "{count} point(s)",
      confirmCreate: "Create a system restore point? This may take a minute.",
      created: "Restore point created",
      creating: "Creating…",
      refreshing: "Refreshing…",
      needAdmin: "Administrator required — launch from elevated Atelier.",
    },
  };

  let suiteLang = "fr";
  let rows = [];
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
    const accent = String(hex || "#3b82f6").trim();
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

  async function apiReady() {
    return new Promise((resolve) => {
      if (window.pywebview && window.pywebview.api) return resolve(window.pywebview.api);
      window.addEventListener("pywebviewready", () => resolve(window.pywebview.api), { once: true });
      setTimeout(() => resolve(window.pywebview && window.pywebview.api), 2500);
    });
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function setStatus(text, isError) {
    if (!el.status) return;
    el.status.textContent = text || "";
    el.status.classList.toggle("error", !!isError);
    const s = String(text || "").trim();
    if (/^(prêt|ready|échec|failed|ok)$/i.test(s) || s === "") {
      if (window.SuiteProgress) window.SuiteProgress.forceClear();
    }
  }

  async function setStatusBusy(text, isError) {
    setStatus(text, isError);
    if (window.SuiteProgress) window.SuiteProgress.setBusy(text || "…");
    await new Promise((r) => setTimeout(r, 40));
  }

  function fmt(key, vars) {
    let s = t(key);
    Object.entries(vars || {}).forEach(([k, v]) => {
      s = s.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    });
    return s;
  }

  const el = {
    btnRefresh: document.getElementById("btnRefresh"),
    btnCreate: document.getElementById("btnCreate"),
    descInput: document.getElementById("descInput"),
    tbody: document.getElementById("tbody"),
    meta: document.getElementById("meta"),
    status: document.getElementById("status"),
    emptyHint: document.getElementById("emptyHint"),
    adminHint: document.getElementById("adminHint"),
  };

  function render() {
    el.tbody.innerHTML = "";
    el.meta.textContent = fmt("metaCount", { count: rows.length });
    el.emptyHint.hidden = rows.length > 0;
    rows.forEach((r) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${escapeHtml(r.sequence ?? "")}</td>
        <td>${escapeHtml(r.description || "")}</td>
        <td>${escapeHtml(r.creationTime || "")}</td>
        <td>${escapeHtml(r.restorePointType || r.eventType || "")}</td>`;
      el.tbody.appendChild(tr);
    });
  }

  async function refresh() {
    const api = await apiReady();
    if (!api) {
      setStatus(t("hostMissing"), true);
      return;
    }
    await setStatusBusy(t("refreshing"));
    try {
      const res = await api.list_restore_points();
      if (!res || !res.ok) {
        setStatus((res && res.error) || t("fail"), true);
        rows = [];
        render();
        return;
      }
      rows = Array.isArray(res.items) ? res.items : [];
      el.adminHint.hidden = !!res.admin;
      render();
      setStatus(t("ready"));
    } catch (err) {
      setStatus(String(err.message || err), true);
    }
  }

  el.btnRefresh.addEventListener("click", refresh);
  el.btnCreate.addEventListener("click", async () => {
    if (!window.confirm(t("confirmCreate"))) return;
    const api = await apiReady();
    if (!api) {
      setStatus(t("hostMissing"), true);
      return;
    }
    const adminRes = await api.is_admin();
    if (!adminRes || !adminRes.admin) {
      setStatus(t("needAdmin"), true);
      el.adminHint.hidden = false;
      return;
    }
    await setStatusBusy(t("creating"));
    const desc = (el.descInput.value || "").trim() || "Mr-Aurevo-X RestorePoint";
    const res = await api.create_restore_point(desc);
    if (!res || !res.ok) {
      setStatus((res && res.error) || t("fail"), true);
      return;
    }
    setStatus(t("created"));
    await refresh();
  });

  (async () => {
    const api = await apiReady();
    await bootSuite(api);
    await setStatusBusy(t("loading"));
    await refresh();
  })();
})();
