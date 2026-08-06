(() => {
  "use strict";
  const SUITE_I18N = {
    fr: {
      tagline: "Sessions utilisateur",
      copyright: "© 2026 Mr-Aurevo-X · local · CGU dans L'Atelier PC Command",
      title: "Sessions",
      featuresTitle: "Fonctions",
      features: "Liste les sessions actives et permet la déconnexion (confirmation, admin recommandé).",
      privacy: "Mr-Aurevo-X ne collecte aucune donnée. Gestion locale des sessions uniquement.",
      hostMissing: "Host indisponible",
      ready: "Prêt",
      fail: "Échec",
      loading: "Chargement…",
      btnRefresh: "Rafraîchir",
      btnLogoff: "Déconnecter",
      adminHint: "Déconnecter d'autres utilisateurs nécessite souvent les droits administrateur.",
      thUser: "Utilisateur",
      thId: "ID",
      thState: "État",
      thSession: "Session",
      thLogon: "Connexion",
      emptyHint: "Aucune session trouvée.",
      metaCount: "{count} session(s) · {method}",
      confirmLogoff: "Déconnecter la session {user} (ID {id}) ? Les travaux non enregistrés seront perdus.",
      logoffOk: "Session {id} déconnectée",
      logoffing: "Déconnexion…",
      refreshing: "Actualisation…",
      selectSession: "Sélectionnez une session.",
      needAdmin: "Administrateur recommandé — lancez depuis Atelier (admin).",
    },
    en: {
      tagline: "User sessions",
      copyright: "© 2026 Mr-Aurevo-X · local · Terms in Atelier",
      title: "Sessions",
      featuresTitle: "Features",
      features: "List active sessions and log off selected session (confirmation, admin preferred).",
      privacy: "Mr-Aurevo-X does not collect your data. Local session list/logoff only.",
      hostMissing: "Host unavailable",
      ready: "Ready",
      fail: "Failed",
      loading: "Loading…",
      btnRefresh: "Refresh",
      btnLogoff: "Log off",
      adminHint: "Logging off other users often requires administrator rights.",
      thUser: "User",
      thId: "ID",
      thState: "State",
      thSession: "Session",
      thLogon: "Logon",
      emptyHint: "No sessions found.",
      metaCount: "{count} session(s) · {method}",
      confirmLogoff: "Log off session {user} (ID {id})? Unsaved work will be lost.",
      logoffOk: "Session {id} logged off",
      logoffing: "Logging off…",
      refreshing: "Refreshing…",
      selectSession: "Select a session.",
      needAdmin: "Administrator recommended — launch from elevated Atelier.",
    },
  };

  let suiteLang = "fr";
  let rows = [];
  let selectedId = null;
  let listMethod = "—";
  let isAdmin = false;
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
    btnLogoff: document.getElementById("btnLogoff"),
    tbody: document.getElementById("tbody"),
    meta: document.getElementById("meta"),
    status: document.getElementById("status"),
    emptyHint: document.getElementById("emptyHint"),
    adminHint: document.getElementById("adminHint"),
  };

  function render() {
    el.tbody.innerHTML = "";
    el.meta.textContent = fmt("metaCount", { count: rows.length, method: listMethod });
    el.emptyHint.hidden = rows.length > 0;
    el.adminHint.hidden = isAdmin;
    rows.forEach((r) => {
      const sid = Number(r.id);
      const checked = selectedId === sid ? " checked" : "";
      const tr = document.createElement("tr");
      tr.innerHTML = `<td><input type="radio" name="sel" value="${sid}"${checked} /></td>
        <td>${escapeHtml(r.user || "")}</td>
        <td class="mono">${escapeHtml(sid)}</td>
        <td>${escapeHtml(r.state || "")}</td>
        <td>${escapeHtml(r.sessionName || "")}</td>
        <td>${escapeHtml(r.logonTime || r.idle || "")}</td>`;
      tr.querySelector('input[type="radio"]').addEventListener("change", () => {
        selectedId = sid;
      });
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
      const res = await api.list_sessions();
      if (!res || !res.ok) {
        setStatus((res && res.error) || t("fail"), true);
        rows = [];
        render();
        return;
      }
      rows = Array.isArray(res.items) ? res.items : [];
      listMethod = res.method || "—";
      isAdmin = !!res.admin;
      if (selectedId && !rows.some((r) => Number(r.id) === selectedId)) selectedId = null;
      render();
      setStatus(t("ready"));
    } catch (err) {
      setStatus(String(err.message || err), true);
    }
  }

  el.btnRefresh.addEventListener("click", refresh);
  el.btnLogoff.addEventListener("click", async () => {
    if (!selectedId) {
      setStatus(t("selectSession"), true);
      return;
    }
    const sess = rows.find((r) => Number(r.id) === selectedId);
    const user = sess ? sess.user : String(selectedId);
    if (!window.confirm(fmt("confirmLogoff", { user, id: selectedId }))) return;
    const api = await apiReady();
    if (!api) {
      setStatus(t("hostMissing"), true);
      return;
    }
    if (!isAdmin) {
      const adminRes = await api.is_admin();
      if (!adminRes || !adminRes.admin) {
        setStatus(t("needAdmin"), true);
        el.adminHint.hidden = false;
      }
    }
    await setStatusBusy(t("logoffing"));
    const res = await api.logoff_session(selectedId);
    if (!res || !res.ok) {
      setStatus((res && res.error) || t("fail"), true);
      return;
    }
    setStatus(fmt("logoffOk", { id: selectedId }));
    selectedId = null;
    await refresh();
  });

  (async () => {
    const api = await apiReady();
    await bootSuite(api);
    await setStatusBusy(t("loading"));
    await refresh();
  })();
})();
