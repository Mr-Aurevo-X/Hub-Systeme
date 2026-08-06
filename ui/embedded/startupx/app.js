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
    "featuresTitle": "Fonctions",
    "features": "Run (registre) : activer/désactiver. Dossier Démarrage : raccourcis .lnk ↔ .lnk.disabled.",
    "privacy": "Mr-Aurevo-X ne collecte aucune donnée. Vue locale du démarrage uniquement.",
    "copyright": "© 2026 Mr-Aurevo-X · local · CGU dans L'Atelier PC Command",
    "hostMissing": "Host indisponible",
    "ready": "Prêt",
    "refreshing": "Actualisation…",
    "fail": "Échec",
    "metaCount": "{shown} / {total} éléments",
    "btnRefresh": "Rafraîchir",
    "btnOpen": "Dossier",
    "btnToggle": "Activer / Désactiver",
    "btnDisable": "Désactiver",
    "btnEnable": "Activer",
    
    
    "title": "Démarrage",
    "tagline": "Démarrage · Run · Startup",
    "filterPh": "Filtrer type / nom / commande…",
    "thType": "Type",
    "thName": "Nom",
    "thImpact": "Impact",
    "thCmd": "Commande / chemin",
    "thEnabled": "Actif",
    "yes": "Oui",
    "no": "Non",
    "confirmDisable": "Désactiver \"{name}\" ?\nRenommage en {hive} — pas de suppression.",
    "confirmEnable": "Activer \"{name}\" ?",
    "enabledMsg": "Activé : {name}",
    "disabledMsg": "Désactivé : {name}",
    "loading": "Chargement…",
    "emptyState": "Aucun élément",
    "lnkOnly": "Seuls les raccourcis .lnk peuvent être basculés",
    "metaDetail": "{shown} / {total} éléments · Run modifiable · dossier .lnk ({runN}/{folderN})",
    "hiveReg": "clé registre (.disabled)",
    "hiveLnk": "raccourci (.lnk.disabled)",
    "impactRegistry": "Registre",
    "impactFolder": "Dossier",
    "impactUnknown": "Inconnu",
  },
  "en": {
    "featuresTitle": "Features",
    "features": "Run (registry): enable/disable. Startup folder: .lnk ↔ .lnk.disabled shortcuts.",
    "privacy": "Mr-Aurevo-X does not collect your data. Local startup view only.",
    "copyright": "© 2026 Mr-Aurevo-X · local · Terms in Atelier",
    "hostMissing": "Host unavailable",
    "ready": "Ready",
    "refreshing": "Refreshing…",
    "fail": "Failed",
    "metaCount": "{shown} / {total} items",
    "btnRefresh": "Refresh",
    "btnOpen": "Folder",
    "btnToggle": "Enable / Disable",
    "btnDisable": "Disable",
    "btnEnable": "Enable",
    
    
    
    "title": "Startup",
    "tagline": "Startup · Run · folder",
    "filterPh": "Filter type / name / command…",
    "thType": "Type",
    "thName": "Name",
    "thImpact": "Impact",
    "thCmd": "Command / path",
    "thEnabled": "Enabled",
    "yes": "Yes",
    "no": "No",
    "confirmDisable": "Disable \"{name}\"?\nWill rename as {hive} — not deleted.",
    "confirmEnable": "Enable \"{name}\"?",
    "enabledMsg": "Enabled: {name}",
    "disabledMsg": "Disabled: {name}",
    "loading": "Loading…",
    "emptyState": "No items",
    "lnkOnly": "Only .lnk shortcuts can be toggled",
    "metaDetail": "{shown} / {total} items · Run toggles · folder .lnk ({runN}/{folderN})",
    "hiveReg": "registry key (.disabled)",
    "hiveLnk": "shortcut (.lnk.disabled)",
    "impactRegistry": "Registry",
    "impactFolder": "Folder",
    "impactUnknown": "Unknown",
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
    btnToggle: document.getElementById("btnToggle"),
    btnOpen: document.getElementById("btnOpen"),
};

  let rows = [];
  let selected = null;
  let selectedKey = "";

  function rowKey(r) {
    return [r.type, r.hive, r.regName || r.name, r.path || r.command].join("|");
  }

  function isRunKey(r) {
    return !!(r && String(r.type || "").startsWith("Run ("));
  }

  function isFolderShortcut(r) {
    return !!(r && r.type === "Startup folder" && r.toggleable);
  }

  function canToggle(r) {
    return !!(r && r.toggleable && (isRunKey(r) || isFolderShortcut(r)));
  }

  function impactLabel(raw) {
    const value = String(raw || "").toLowerCase();
    if (value === "registry") return t("impactRegistry");
    if (value === "folder") return t("impactFolder");
    return t("impactUnknown");
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

  function filtered() {
    const q = (el.filter.value || "").trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.type, r.name, r.command, r.path, r.hive].some((v) =>
        String(v || "").toLowerCase().includes(q)
      )
    );
  }

  function updateButtons() {
    const ok = canToggle(selected);
    el.btnToggle.disabled = !ok;
    el.btnOpen.disabled = !(selected && (selected.path || selected.command));
    if (ok) {
      el.btnToggle.textContent = selected.enabled ? t("btnDisable") : t("btnEnable");
    } else {
      el.btnToggle.textContent = t("btnToggle");
    }
    if (selected && selected.type === "Startup folder" && !selected.toggleable) {
      el.status.textContent = t("lnkOnly");
    }
  }

  function render() {
    const list = filtered();
    el.tbody.innerHTML = "";
    if (!list.length) {
      el.tbody.innerHTML = `<tr class="empty"><td colspan="5">${escapeHtml(t("emptyState"))}</td></tr>`;
      el.meta.textContent = t("metaCount").replace("{shown}", "0").replace("{total}", String(rows.length));
      updateButtons();
      return;
    }
    list.forEach((r) => {
      const key = rowKey(r);
      const tr = document.createElement("tr");
      if (selected && selectedKey === key) tr.classList.add("selected");
      const cmd = r.command || r.path || "";
      const enClass = r.enabled ? "enabled-yes" : "enabled-no";
      tr.innerHTML = `
        <td>${escapeHtml(r.type || "")}</td>
        <td>${escapeHtml(r.name || "")}</td>
        <td>${escapeHtml(impactLabel(r.impact))}</td>
        <td class="path" title="${escapeHtml(cmd)}">${escapeHtml(cmd || "—")}</td>
        <td class="${enClass}">${r.enabled == null ? "—" : r.enabled ? t("yes") : t("no")}</td>`;
      tr.addEventListener("click", () => {
        selected = r;
        selectedKey = key;
        updateButtons();
        render();
      });
      el.tbody.appendChild(tr);
    });
    const runN = rows.filter(isRunKey).length;
    const folderN = rows.filter((r) => r.type === "Startup folder").length;
    el.meta.textContent = t("metaDetail")
      .replace("{shown}", String(list.length))
      .replace("{total}", String(rows.length))
      .replace("{runN}", String(runN))
      .replace("{folderN}", String(folderN));
    updateButtons();
  }

  async function refresh() {
    const api = await apiReady();
    if (!api) {
      el.status.textContent = t("hostMissing");
      return;
    }
    el.status.textContent = t("refreshing");
    el.btnRefresh.disabled = true;
    try {
      const res = await api.list_startup();
      if (res && res.ok === false) {
        rows = [];
        el.status.textContent = res.error || t("fail");
      } else {
        rows = (res && res.items) || [];
        el.status.textContent = t("ready");
      }
      selected = null;
      selectedKey = "";
      render();
    } catch (e) {
      el.status.textContent = String(e.message || e);
    } finally {
      el.btnRefresh.disabled = false;
    }
  }

  el.btnRefresh.addEventListener("click", refresh);
  el.filter.addEventListener("input", render);

  el.btnToggle.addEventListener("click", async () => {
    if (!canToggle(selected)) return;
    const enable = !selected.enabled;
    if (enable) {
      if (!confirm(t("confirmEnable").replace("{name}", selected.name))) return;
    } else {
      const kind = isRunKey(selected) ? t("hiveReg") : t("hiveLnk");
      const ok = confirm(
        t("confirmDisable").replace("{name}", selected.name).replace("{hive}", kind)
      );
      if (!ok) return;
    }
    const api = await apiReady();
    if (!api || !api.toggle_startup_item) {
      el.status.textContent = t("hostMissing");
      return;
    }
    const payload = {
      type: selected.type,
      hive: selected.hive || "",
      regName: selected.regName || selected.name,
      name: selected.name,
      path: selected.path || "",
      enabled: selected.enabled,
      enable,
    };
    const res = await api.toggle_startup_item(payload);
    el.status.textContent = res.ok
      ? enable
        ? t("enabledMsg").replace("{name}", res.name || selected.name)
        : t("disabledMsg").replace("{name}", res.name || selected.name)
      : res.error || t("fail");
    await refresh();
  });

  el.btnOpen.addEventListener("click", async () => {
    if (!selected) return;
    const target = selected.path || selected.command || "";
    if (!target) return;
    const api = await apiReady();
    const res = await api.open_path(target);
    if (!res.ok) el.status.textContent = res.error || t("fail");
  });

  (async () => {
    const api = await apiReady();
    await bootSuite(api);
    await refresh();
  })();
})();
