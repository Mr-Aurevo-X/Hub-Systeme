(() => {
  "use strict";
  const SUITE_I18N = {
  "fr": {
    "tagline": "Plans d'alimentation · powercfg",
    "copyright": "© 2026 Mr-Aurevo-X · local · CGU dans L'Atelier PC Command",
    "title": "Plans",
    "featuresTitle": "Fonctions",
    "features": "Liste powercfg /list, change de plan actif.",
    "privacy": "Mr-Aurevo-X ne collecte aucune donnée. powercfg local uniquement.",
    "hostMissing": "Host indisponible",
    "ready": "Prêt",
    "fail": "Échec",
    "loading": "Chargement…",
    "btnRefresh": "Rafraîchir",
    "filterPh": "Filtrer…",
    "btnSet": "Activer",
    "thName": "Nom",
    "thActive": "Actif",
    "metaActive": "Actif : {name}",
    "emptyState": "Aucun plan",
    "confirmSet": "Activer le plan « {name} » ?",


  },
  "en": {
    "tagline": "Power plans · powercfg",
    "copyright": "© 2026 Mr-Aurevo-X · local · Terms in Atelier",
    "title": "Plans",
    "featuresTitle": "Features",
    "features": "List powercfg /list, switch active plan.",
    "privacy": "Mr-Aurevo-X does not collect your data. Local powercfg only.",
    "hostMissing": "Host unavailable",
    "ready": "Ready",
    "fail": "Failed",
    "loading": "Loading…",
    "btnRefresh": "Refresh",
    "filterPh": "Filter…",
    "btnSet": "Activate",
    "thName": "Name",
    "thActive": "Active",
    "metaActive": "Active: {name}",
    "emptyState": "No plans",
    "confirmSet": "Activate plan “{name}”?",


  }
};

  let suiteLang = "fr";
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
      } else if (api && api.get_suite_accent) {
        try {
          const a = await api.get_suite_accent();
          if (a && a.accent) applyAccent(a.accent);
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

  function clearProgress() {
    if (window.SuiteProgress) window.SuiteProgress.forceClear();
  }

  const el = { filter: document.getElementById("filter"), tbody: document.getElementById("tbody"), meta: document.getElementById("meta"),
    status: document.getElementById("status"), btnRefresh: document.getElementById("btnRefresh"),
    btnSet: document.getElementById("btnSet") };
  let rows = [], selected = null;

  function render() {
    const q = ((el.filter && el.filter.value) || "").toLowerCase();
    const shown = rows.filter((r) => !q || JSON.stringify(r).toLowerCase().includes(q));
    if (!shown.length) {
      el.tbody.innerHTML = `<tr class="empty"><td colspan="3">${escapeHtml(t("emptyState"))}</td></tr>`;
    } else {
      el.tbody.innerHTML = shown.map((r) => `<tr data-guid="${escapeHtml(r.guid||"")}" class="${selected===r.guid?"selected":""}">
      <td>${escapeHtml(r.name||"")}</td><td class="wrap">${escapeHtml(r.guid||"")}</td>
      <td>${r.active ? "●" : ""}</td></tr>`).join("");
    }
    const act = rows.find((r) => r.active);
    el.meta.textContent = act ? t("metaActive").replace("{name}", act.name || act.guid) : "—";
    el.tbody.querySelectorAll("tr").forEach((tr) => tr.addEventListener("click", () => {
      selected = tr.getAttribute("data-guid"); render();
    }));
  }

  async function refresh() {
    const api = await apiReady();
    if (!api) { setStatus(t("hostMissing"), true); return; }
    await setStatusBusy(t("loading"));
    const res = await api.list_plans();
    if (!res || !res.ok) { setStatus((res && res.error) || t("fail"), true); return; }
    rows = res.plans || []; render(); setStatus(t("ready"));
  }

  el.btnRefresh.addEventListener("click", refresh);
  if (el.filter) el.filter.addEventListener("input", render);
  el.btnSet.addEventListener("click", async () => {
    if (!selected) return;
    const plan = rows.find((r) => r.guid === selected);
    const name = (plan && plan.name) || selected;
    if (!confirm(t("confirmSet").replace("{name}", name))) return;
    const api = await apiReady();
    const res = await api.set_plan(selected);
    setStatus(res && res.ok ? t("ready") : ((res && res.error) || t("fail")), !(res && res.ok));
    if (res && res.ok) refresh();
  });
  (async () => { const api = await apiReady(); await bootSuite(api); await refresh(); })();

})();
