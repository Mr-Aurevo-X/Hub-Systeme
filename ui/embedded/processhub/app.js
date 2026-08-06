(() => {
  "use strict";

  async function setStatusBusy(text, isError) {
    setStatus(text, isError);
    if (window.SuiteProgress) window.SuiteProgress.setBusy(text || "…");
    await new Promise((r) => setTimeout(r, 40));
  }

  function clearProgress() {
    if (window.SuiteProgress) window.SuiteProgress.forceClear();
  }


  const SUITE_I18N = {
  "fr": {
    "tagline": "Processus · CPU · RAM",
    "copyright": "© 2026 Mr-Aurevo-X · local · CGU dans L'Atelier PC Command",
    "title": "Processus",
    "btnRefresh": "Rafraîchir",
    "btnKill": "Terminer",
    "btnEmptyWorkingSet": "Vider RAM",
    "btnOpen": "Dossier",
    "thName": "Nom",
    "thPid": "PID",
    "thCpu": "CPU %",
    "thRam": "RAM Mo",
    "thPath": "Chemin",
    "filterPh": "Filtrer nom / PID / chemin…",
    "featuresTitle": "Fonctions",
    "features": "Liste les processus actifs (CPU, RAM). Filtrez, triéz, terminez une tâche ou ouvrez son dossier. Auto-rafraîchissement optionnel.",
    "privacy": "Mr-Aurevo-X ne collecte aucune donnée. Lecture locale des processus uniquement.",
    "hostMissing": "Host indisponible",
    "ready": "Prêt",
    "refreshing": "Actualisation…",
    "fail": "Échec",
    "confirmKill": "Terminer {name} (PID {pid}) ?",
    "confirmEmptyWorkingSet": "Vider le working set de {name} (PID {pid}) ? L'effet est temporaire.",
    "killed": "Terminé : {name}",
    "emptiedWorkingSet": "Working set vidé : {name}",
    "metaCount": "{shown} / {total} processus · RAM {used} / {totalRam} ({pct}%)",
    "loading": "Chargement…",
    "emptyState": "Aucun processus",
    "autoLabel": "Auto",


  },
  "en": {
    "tagline": "Processes · CPU · RAM",
    "copyright": "© 2026 Mr-Aurevo-X · local · Terms in Atelier",
    "title": "Processes",
    "btnRefresh": "Refresh",
    "btnKill": "End task",
    "btnEmptyWorkingSet": "Empty RAM",
    "btnOpen": "Folder",
    "thName": "Name",
    "thPid": "PID",
    "thCpu": "CPU %",
    "thRam": "RAM MB",
    "thPath": "Path",
    "filterPh": "Filter name / PID / path…",
    "featuresTitle": "Features",
    "features": "Lists running processes (CPU, RAM). Filter, sort, end a task, or open its folder. Optional auto-refresh.",
    "privacy": "Mr-Aurevo-X does not collect your data. Local process view only.",
    "hostMissing": "Host unavailable",
    "ready": "Ready",
    "refreshing": "Refreshing…",
    "fail": "Failed",
    "confirmKill": "End {name} (PID {pid})?",
    "confirmEmptyWorkingSet": "Empty working set for {name} (PID {pid})? The effect is temporary.",
    "killed": "Ended: {name}",
    "emptiedWorkingSet": "Working set emptied: {name}",
    "metaCount": "{shown} / {total} processes · RAM {used} / {totalRam} ({pct}%)",
    "loading": "Loading…",
    "emptyState": "No processes",
    "autoLabel": "Auto",


  }
};
  let suiteLang = "fr";
  const t = (key) => (SUITE_I18N[suiteLang] && SUITE_I18N[suiteLang][key]) || SUITE_I18N.fr[key] || key;

  async function bootSuite(api) {
    const suite = window.MrAurevoXSuite;
    if (!suite) {
      if (api && api.get_suite_accent) {
        try {
          const a = await api.get_suite_accent();
          if (a && a.accent) applyAccent(a.accent);
        } catch (_) {}
      }
      return "fr";
    }
    const settings = await suite.loadSuiteSettings(api);
    suiteLang = settings.language === "en" ? "en" : "fr";
    suite.applyAccent(settings.accent);
    suite.applyI18n(suiteLang, SUITE_I18N);
    return suiteLang;
  }


  const el = {
    filter: document.getElementById("filter"),
    tbody: document.getElementById("tbody"),
    meta: document.getElementById("meta"),
    status: document.getElementById("status"),
    btnRefresh: document.getElementById("btnRefresh"),
    btnKill: document.getElementById("btnKill"),
    btnEmptyWorkingSet: document.getElementById("btnEmptyWorkingSet"),
    btnOpen: document.getElementById("btnOpen"),
    autoRefresh: document.getElementById("autoRefresh"),
  };

  let rows = [];
  let selected = null;
  let sortKey = "cpu";
  let sortDir = "desc";
  let interacting = false;
  let autoTimer = null;
  let refreshInFlight = false;
  let memoryTotals = null;

  function formatBytes(value) {
    const bytes = Number(value) || 0;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
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

  function markInteracting() {
    interacting = true;
    clearTimeout(markInteracting._t);
    markInteracting._t = setTimeout(() => {
      interacting = false;
    }, 2500);
  }

  function filtered() {
    const q = (el.filter.value || "").trim().toLowerCase();
    if (!q) return rows.slice();
    return rows.filter((r) =>
      [r.name, String(r.pid), r.path, r.user].some((v) => String(v || "").toLowerCase().includes(q))
    );
  }

  function sorted(list) {
    const dir = sortDir === "asc" ? 1 : -1;
    const key = sortKey;
    return list.slice().sort((a, b) => {
      let av;
      let bv;
      if (key === "name") {
        av = String(a.name || "").toLowerCase();
        bv = String(b.name || "").toLowerCase();
        if (av < bv) return -1 * dir;
        if (av > bv) return 1 * dir;
        return 0;
      }
      if (key === "pid") {
        av = Number(a.pid) || 0;
        bv = Number(b.pid) || 0;
      } else if (key === "cpu") {
        av = Number(a.cpu) || 0;
        bv = Number(b.cpu) || 0;
      } else if (key === "ram") {
        av = Number(a.memMb) || 0;
        bv = Number(b.memMb) || 0;
      } else {
        return 0;
      }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }

  function updateSortHeaders() {
    document.querySelectorAll("th[data-sort]").forEach((th) => {
      const k = th.getAttribute("data-sort");
      th.classList.toggle("sorted", k === sortKey);
      th.setAttribute("aria-sort", k === sortKey ? (sortDir === "asc" ? "ascending" : "descending") : "none");
      const base = th.getAttribute("data-label") || th.textContent.replace(/\s*[▲▼]$/, "").trim();
      th.setAttribute("data-label", base);
      th.textContent = k === sortKey ? `${base} ${sortDir === "asc" ? "▲" : "▼"}` : base;
    });
  }

  function render() {
    const list = sorted(filtered());
    const prevPid = selected ? selected.pid : null;
    el.tbody.innerHTML = "";
    let restored = null;
    if (!list.length) {
      el.tbody.innerHTML = `<tr class="empty"><td colspan="5">${escapeHtml(t("emptyState"))}</td></tr>`;
      selected = null;
      el.btnKill.disabled = true;
      el.btnEmptyWorkingSet.disabled = true;
      el.btnOpen.disabled = true;
      updateSortHeaders();
      el.meta.textContent = t("metaCount").replace("{shown}", "0").replace("{total}", String(rows.length));
      return;
    }
    list.forEach((r) => {
      const tr = document.createElement("tr");
      if (prevPid != null && r.pid === prevPid) {
        tr.classList.add("selected");
        restored = r;
      }
      tr.innerHTML = `
        <td>${escapeHtml(r.name)}</td>
        <td>${r.pid}</td>
        <td>${r.cpu}</td>
        <td>${r.memMb}</td>
        <td class="path" title="${escapeHtml(r.path)}">${escapeHtml(r.path || "—")}</td>`;
      tr.addEventListener("click", () => {
        markInteracting();
        selected = r;
        el.btnKill.disabled = false;
        el.btnEmptyWorkingSet.disabled = false;
        el.btnOpen.disabled = !r.path;
        render();
      });
      el.tbody.appendChild(tr);
    });
    selected = restored;
    el.btnKill.disabled = !selected;
    el.btnEmptyWorkingSet.disabled = !selected;
    el.btnOpen.disabled = !(selected && selected.path);
    updateSortHeaders();
    el.meta.textContent = t("metaCount")
      .replace("{shown}", String(list.length))
      .replace("{total}", String(rows.length))
      .replace("{used}", memoryTotals ? formatBytes(memoryTotals.usedBytes) : "—")
      .replace("{totalRam}", memoryTotals ? formatBytes(memoryTotals.totalBytes) : "—")
      .replace("{pct}", memoryTotals ? String(memoryTotals.percentUsed ?? "—") : "—");
  }

  async function refresh(fromAuto) {
    if (refreshInFlight) return;
    if (fromAuto && interacting) return;
    const api = await apiReady();
    if (!api) {
      el.status.textContent = t("hostMissing");
      return;
    }
    refreshInFlight = true;
    if (!fromAuto) el.status.textContent = t("refreshing");
    el.btnRefresh.disabled = true;
    const keepPid = selected ? selected.pid : null;
    try {
      const [res, memoryRes] = await Promise.all([
        api.list_processes(),
        api.get_memory_totals ? api.get_memory_totals() : Promise.resolve(null),
      ]);
      rows = (res && res.processes) || [];
      memoryTotals = memoryRes && memoryRes.ok ? memoryRes : null;
      selected = keepPid != null ? rows.find((r) => r.pid === keepPid) || null : null;
      el.btnKill.disabled = !selected;
      el.btnEmptyWorkingSet.disabled = !selected;
      el.btnOpen.disabled = !(selected && selected.path);
      render();
      if (!fromAuto) el.status.textContent = t("ready");
    } catch (e) {
      el.status.textContent = String(e.message || e);
    } finally {
      el.btnRefresh.disabled = false;
      refreshInFlight = false;
    }
  }

  function syncAutoTimer() {
    if (autoTimer) {
      clearInterval(autoTimer);
      autoTimer = null;
    }
    if (el.autoRefresh && el.autoRefresh.checked) {
      autoTimer = setInterval(() => refresh(true), 3000);
    }
  }

  document.querySelectorAll("th[data-sort]").forEach((th) => {
    th.addEventListener("click", () => {
      markInteracting();
      const key = th.getAttribute("data-sort");
      if (sortKey === key) {
        sortDir = sortDir === "asc" ? "desc" : "asc";
      } else {
        sortKey = key;
        sortDir = key === "name" ? "asc" : "desc";
      }
      render();
    });
  });

  el.btnRefresh.addEventListener("click", () => refresh(false));
  el.filter.addEventListener("input", () => {
    markInteracting();
    render();
  });
  el.filter.addEventListener("focus", markInteracting);
  if (el.autoRefresh) {
    el.autoRefresh.addEventListener("change", syncAutoTimer);
  }

  el.btnKill.addEventListener("click", async () => {
    if (!selected) return;
    markInteracting();
    if (
      !confirm(
        t("confirmKill").replace("{name}", selected.name).replace("{pid}", String(selected.pid))
      )
    )
      return;
    const api = await apiReady();
    try {
      const prep = await api.prepare_kill(selected.pid);
      if (!prep || !prep.ok || !prep.token) {
        el.status.textContent = (prep && prep.error) || t("fail");
        return;
      }
      const res = await api.kill_process(selected.pid, prep.token);
      el.status.textContent = res.ok ? t("killed").replace("{name}", res.name) : res.error || t("fail");
    } catch (e) {
      el.status.textContent = String(e.message || e);
    }
    await refresh(false);
  });
  el.btnEmptyWorkingSet.addEventListener("click", async () => {
    if (!selected) return;
    markInteracting();
    if (
      !confirm(
        t("confirmEmptyWorkingSet").replace("{name}", selected.name).replace("{pid}", String(selected.pid))
      )
    )
      return;
    const api = await apiReady();
    if (!api || !api.empty_working_set || !api.prepare_empty_working_set) {
      el.status.textContent = t("hostMissing");
      return;
    }
    const prep = await api.prepare_empty_working_set(selected.pid);
    if (!prep || !prep.ok || !prep.token) {
      el.status.textContent = (prep && prep.error) || t("fail");
      return;
    }
    const res = await api.empty_working_set(selected.pid, prep.token);
    el.status.textContent = res && res.ok
      ? t("emptiedWorkingSet").replace("{name}", res.name || selected.name)
      : (res && res.error) || t("fail");
    await refresh(false);
  });
  el.btnOpen.addEventListener("click", async () => {
    if (!selected || !selected.path) return;
    markInteracting();
    const api = await apiReady();
    const res = await api.open_path(selected.path);
    if (!res.ok) el.status.textContent = res.error || t("fail");
  });

  (async () => {
    const api = await apiReady();
    await bootSuite(api);
    await refresh(false);
    syncAutoTimer();
  })();
})();
