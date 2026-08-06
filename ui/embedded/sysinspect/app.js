(function () {
  "use strict";
  const SUITE_I18N = {
    fr: {
      tagline: "Système · inspect",
      featuresTitle: "Fonctions",
      features: "Événements et pilotes locaux.",
      privacy: "Mr-Aurevo-X ne collecte aucune donnée. Outils locaux uniquement.",
      copyright: "© 2026 Mr-Aurevo-X · local · CGU dans L'Atelier PC Command",
      title: "SysInspect",
      subtitle: "L'Atelier Windows — inspection système locale",
      tabEvents: "Événements",
      tabDrivers: "Drivers",
      hostMissing: "Host indisponible",
      ready: "Prêt",
      fail: "Échec",
      loading: "Chargement…",
      btnRefresh: "Rafraîchir",
      filterPh: "Filtrer…",
      countLabel: "N",
      thTime: "Heure",
      thProv: "Source",
      thMsg: "Message",
      thName: "Périphérique",
      thVer: "Version",
      thMfr: "Fabricant",
      thSigned: "Signé",
      metaEvents: "{n} événements",
      metaDrivers: "{n} pilotes",
      emptyEvents: "Aucun événement",
      emptyDrivers: "Aucun pilote",
    },
    en: {
      tagline: "System · inspect",
      featuresTitle: "Features",
      features: "Local events and drivers.",
      privacy: "Mr-Aurevo-X does not collect your data. Local tools only.",
      copyright: "© 2026 Mr-Aurevo-X · local · Terms in Atelier",
      title: "SysInspect",
      subtitle: "L'Atelier Windows — local system inspection",
      tabEvents: "Events",
      tabDrivers: "Drivers",
      hostMissing: "Host unavailable",
      ready: "Ready",
      fail: "Failed",
      loading: "Loading…",
      btnRefresh: "Refresh",
      filterPh: "Filter…",
      countLabel: "N",
      thTime: "Time",
      thProv: "Source",
      thMsg: "Message",
      thName: "Device",
      thVer: "Version",
      thMfr: "Manufacturer",
      thSigned: "Signed",
      metaEvents: "{n} events",
      metaDrivers: "{n} drivers",
      emptyEvents: "No events",
      emptyDrivers: "No drivers",
    },
  };

  let lang = "fr";
  let booted = false;
  let eventRows = [];
  let driverRows = [];
  const t = (k) => (SUITE_I18N[lang] && SUITE_I18N[lang][k]) || SUITE_I18N.fr[k] || k;

  function api() {
    return window.pywebview && window.pywebview.api;
  }

  function apiReady() {
    return new Promise((resolve) => {
      if (window.pywebview && window.pywebview.api) return resolve(window.pywebview.api);
      window.addEventListener("pywebviewready", () => resolve(window.pywebview && window.pywebview.api), { once: true });
      setTimeout(() => resolve(window.pywebview && window.pywebview.api), 3000);
    });
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function setStatus(msg, ok) {
    const el = document.getElementById("status");
    if (!el) return;
    el.textContent = msg || "";
    el.classList.toggle("ok", ok === true);
    el.classList.toggle("error", ok === false);
    const s = String(msg || "").trim();
    if (/^(prêt|ready|échec|failed|ok)$/i.test(s) || s === "") {
      if (window.SuiteProgress) window.SuiteProgress.forceClear();
    }
  }

  async function setStatusBusy(text) {
    setStatus(text);
    if (window.SuiteProgress) window.SuiteProgress.setBusy(text || "…");
    await new Promise((r) => setTimeout(r, 40));
  }

  function applyI18n() {
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const k = el.getAttribute("data-i18n");
      if (SUITE_I18N.fr[k]) el.textContent = t(k);
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      const k = el.getAttribute("data-i18n-placeholder");
      if (SUITE_I18N.fr[k]) el.setAttribute("placeholder", t(k));
    });
  }

  async function bootSuite(a) {
    const suite = window.MrAurevoXSuite;
    if (suite) {
      const s = await suite.loadSuiteSettings(a);
      lang = s.language === "en" ? "en" : "fr";
      suite.applyAccent(s.accent);
      if (suite.applyTheme) suite.applyTheme(s.theme);
      suite.applyI18n(lang, SUITE_I18N);
    } else if (a && a.get_suite_settings) {
      try {
        const s = await a.get_suite_settings();
        if (s && s.language === "en") lang = "en";
      } catch (_) {}
    }
    applyI18n();
  }

  function showTab(id) {
    document.querySelectorAll(".hub-tab").forEach((btn) => {
      const on = btn.getAttribute("data-tab") === id;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    document.querySelectorAll(".hub-panel").forEach((panel) => {
      const on = panel.getAttribute("data-panel") === id;
      panel.classList.toggle("active", on);
      if (on) panel.removeAttribute("hidden");
      else panel.setAttribute("hidden", "");
    });
  }

  function renderEvents() {
    const q = ((document.getElementById("eventFilter") || {}).value || "").toLowerCase();
    const shown = eventRows.filter((r) => !q || JSON.stringify(r).toLowerCase().includes(q));
    const body = document.getElementById("eventBody");
    if (!shown.length) {
      body.innerHTML = `<tr class="empty"><td colspan="4">${escapeHtml(t("emptyEvents"))}</td></tr>`;
    } else {
      body.innerHTML = shown.map((r) => `<tr>
        <td>${escapeHtml(r.TimeCreated || "")}</td><td>${escapeHtml(r.Id || "")}</td>
        <td>${escapeHtml(r.ProviderName || "")}</td><td class="wrap">${escapeHtml(r.Message || "")}</td></tr>`).join("");
    }
    document.getElementById("eventMeta").textContent = t("metaEvents").replace("{n}", String(shown.length));
  }

  function renderDrivers() {
    const q = ((document.getElementById("driverFilter") || {}).value || "").toLowerCase();
    const shown = driverRows.filter((r) => !q || JSON.stringify(r).toLowerCase().includes(q));
    const body = document.getElementById("driverBody");
    if (!shown.length) {
      body.innerHTML = `<tr class="empty"><td colspan="4">${escapeHtml(t("emptyDrivers"))}</td></tr>`;
    } else {
      body.innerHTML = shown.map((r) => `<tr>
        <td class="wrap">${escapeHtml(r.DeviceName || "")}</td><td>${escapeHtml(r.DriverVersion || "")}</td>
        <td>${escapeHtml(r.Manufacturer || "")}</td><td>${escapeHtml(String(r.IsSigned))}</td></tr>`).join("");
    }
    document.getElementById("driverMeta").textContent = t("metaDrivers").replace("{n}", String(shown.length));
  }

  async function refreshEvents() {
    const a = api();
    if (!a || !a.recent_errors) { setStatus(t("hostMissing"), false); return; }
    await setStatusBusy(t("loading"));
    const res = await a.recent_errors(
      Number(document.getElementById("count").value),
      document.getElementById("logName").value
    );
    if (!res || !res.ok) { setStatus((res && res.error) || t("fail"), false); return; }
    eventRows = res.events || [];
    renderEvents();
    setStatus(t("ready"), true);
  }

  async function refreshDrivers() {
    const a = api();
    if (!a || !a.list_drivers) { setStatus(t("hostMissing"), false); return; }
    await setStatusBusy(t("loading"));
    const res = await a.list_drivers();
    if (!res || !res.ok) { setStatus((res && res.error) || t("fail"), false); return; }
    driverRows = res.drivers || [];
    renderDrivers();
    setStatus(t("ready"), true);
  }

  function wire() {
    document.querySelectorAll(".hub-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-tab");
        showTab(id);
        if (id === "drivers" && !driverRows.length) refreshDrivers();
      });
    });
    document.getElementById("btnEvents").addEventListener("click", refreshEvents);
    document.getElementById("btnDrivers").addEventListener("click", refreshDrivers);
    document.getElementById("eventFilter").addEventListener("input", renderEvents);
    document.getElementById("driverFilter").addEventListener("input", renderDrivers);
  }

  async function boot() {
    if (booted) return;
    booted = true;
    try {
      const a = await apiReady();
      await bootSuite(a);
      wire();
      await refreshEvents();
    } catch (e) {
      setStatus(String(e.message || e), false);
    }
  }

  window.addEventListener("pywebviewready", boot);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
