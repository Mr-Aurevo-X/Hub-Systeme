/**
 * SystemClean — native in-hub (WinCleaner + DiskMap), no iframe.
 * Bridge: pywebview.api.systemclean.wincleaner.* / systemclean.diskmap.*
 */
import { mountModuleShell, waitNs, esc, pollUntil, unwrapData } from "./_in_hub.js";

const TRACE_CATS = [
  { id: "Recent", label: "Fichiers récents" },
  { id: "JumpLists", label: "Jump lists" },
  { id: "ExplorerHistory", label: "Historique Explorateur" },
  { id: "Thumbnails", label: "Miniatures" },
  { id: "Prefetch", label: "Prefetch" },
  { id: "ClipboardHistory", label: "Presse-papiers" },
  { id: "Screenshots", label: "Captures d'écran" },
];

async function wcApi() {
  return waitNs("systemclean.wincleaner", "prepare_action");
}

async function dmApi() {
  return waitNs("systemclean.diskmap", "list_drives");
}

async function runSync(api, action, payload = {}) {
  const res = await api.run(action, payload);
  if (!res || res.ok === false) {
    throw new Error((res && res.error) || "Échec " + action);
  }
  return res.data != null ? res : res;
}

function summarizeClean(data) {
  if (!data || typeof data !== "object") return "";
  const d = data.data || data;
  const freed = d.FreedText || d.freedText || (d.FreedBytes != null ? fmtBytes(d.FreedBytes) : "");
  const before = d.BeforeText || d.beforeText || d.EstimatedText || d.estimatedText || "";
  const delta = d.diskDelta || d.DiskDelta || d.delta || null;
  const parts = [];
  if (before) parts.push("Avant / estimé : " + before);
  if (freed) parts.push("Libéré : " + freed);
  if (delta) {
    const t = typeof delta === "object" ? delta.Text || delta.text || JSON.stringify(delta) : String(delta);
    parts.push("Disque : " + t);
  }
  return parts.join("\n");
}

async function runJob(api, action, payload, askConfirm, confirmMsg, setProgress) {
  if (confirmMsg) {
    const ok = await askConfirm(confirmMsg, "Confirmer l'action");
    if (!ok) return { ok: false, error: "Annulé" };
  }
  const prep = await api.prepare_action(action, payload || {});
  if (!prep || !prep.ok || !prep.token) {
    return { ok: false, error: (prep && prep.error) || "Confirmation refusée" };
  }
  const started = await api.start_action(action, payload || {}, prep.token);
  if (!started || !started.ok) {
    return { ok: false, error: (started && started.error) || "Démarrage refusé" };
  }
  const progress = await pollUntil(
    () => api.get_action_progress(),
    {
      intervalMs: 450,
      timeoutMs: action === "sfcScan" || action === "dismRestoreHealth" ? 1800000 : 300000,
      onTick: ({ percent, phase, detail }) => {
        if (setProgress) setProgress(percent || 0, `${percent || 0}% · ${phase || ""}${detail ? " — " + detail : ""}`);
      },
    }
  );
  if (progress.error && progress.done) {
    return { ok: false, error: progress.error };
  }
  const result = await api.get_action_result();
  return result || { ok: false, error: "Aucun résultat" };
}

function fmtBytes(n) {
  const b = Number(n) || 0;
  if (b < 1024) return b + " o";
  if (b < 1024 ** 2) return (b / 1024).toFixed(0) + " Ko";
  if (b < 1024 ** 3) return (b / 1024 ** 2).toFixed(1) + " Mo";
  return (b / 1024 ** 3).toFixed(2) + " Go";
}

export async function mount(root) {
  const ctx = mountModuleShell(root, {
    title: "SystemClean",
    subtitle: "WinCleaner · DiskMap — nettoyage, disque & santé · PC Command",
    segments: [
      { id: "wc-health", label: "Santé" },
      { id: "wc-clean", label: "Nettoyage" },
      { id: "wc-traces", label: "Traces" },
      { id: "wc-debloat", label: "Debloat" },
      { id: "wc-uninstall", label: "Désinstaller" },
      { id: "wc-opt", label: "Optimisations" },
      { id: "wc-sessions", label: "Sessions" },
      { id: "wc-excl", label: "Exclusions" },
      { id: "wc-tools", label: "Outils" },
      { id: "dm-map", label: "DiskMap" },
      { id: "dm-search", label: "Recherche" },
      { id: "dm-large", label: "Gros fichiers" },
      { id: "dm-empty", label: "Vides" },
      { id: "dm-dupes", label: "Doublons" },
      { id: "dm-health", label: "Disques" },
      { id: "dm-diff", label: "Diff" },
    ],
    onSegment: (id, body) => renderSegment(id, body, ctx),
  });

  await ctx.setSegment("wc-health");
}

async function renderSegment(id, body, ctx) {
  const { setStatus, askConfirm, setProgress } = ctx;
  body.innerHTML = `<div class="empty-state">Chargement…</div>`;

  try {
    if (id.startsWith("wc-")) {
      const api = await wcApi();
      if (!api) {
        setStatus("API systemclean.wincleaner indisponible", "error");
        body.innerHTML = `<div class="empty-state">Bridge Python indisponible.</div>`;
        return;
      }
      if (id === "wc-health") return mountHealth(body, api, setStatus);
      if (id === "wc-clean") return mountClean(body, api, setStatus, askConfirm, setProgress);
      if (id === "wc-traces") return mountTraces(body, api, setStatus, askConfirm, setProgress);
      if (id === "wc-debloat") return mountDebloat(body, api, setStatus, askConfirm, setProgress);
      if (id === "wc-uninstall") return mountUninstall(body, api, setStatus, askConfirm, setProgress);
      if (id === "wc-opt") return mountOpt(body, api, setStatus, askConfirm, setProgress);
      if (id === "wc-sessions") return mountSessions(body, api, setStatus);
      if (id === "wc-excl") return mountExclusions(body, api, setStatus, askConfirm);
      if (id === "wc-tools") return mountTools(body, api, setStatus, askConfirm);
    }

    const api = await dmApi();
    if (!api) {
      setStatus("API systemclean.diskmap indisponible", "error");
      body.innerHTML = `<div class="empty-state">Bridge Python indisponible.</div>`;
      return;
    }
    if (id === "dm-map") return mountDiskMap(body, api, setStatus, setProgress);
    if (id === "dm-search") return mountDmSearch(body, api, setStatus, setProgress);
    if (id === "dm-large") return mountDmLarge(body, api, setStatus, askConfirm, setProgress);
    if (id === "dm-empty") return mountDmEmpty(body, api, setStatus, askConfirm, setProgress);
    if (id === "dm-dupes") return mountDmDupes(body, api, setStatus, askConfirm, setProgress);
    if (id === "dm-health") return mountDmHealth(body, api, setStatus);
    if (id === "dm-diff") return mountDmDiff(body, api, setStatus);
  } catch (e) {
    setStatus(String(e.message || e), "error");
    body.innerHTML = `<div class="empty-state">${esc(String(e.message || e))}</div>`;
  }
}

/* ── WinCleaner panels ───────────────────────────────────────────────────── */

async function mountHealth(body, api, setStatus) {
  body.innerHTML = `
    <div class="hub-inhub-scroll">
      <div class="card-grid" id="hcCards">
        <div class="card"><span class="label">État</span><span class="value">…</span></div>
      </div>
      <div class="panel">
        <div class="toolbar-row">
          <strong>Santé système</strong>
          <button type="button" class="btn accent" id="hcRefresh" style="margin-left:auto">Actualiser</button>
        </div>
        <pre class="meta" id="hcOut" style="white-space:pre-wrap;margin-top:10px;max-height:280px;overflow:auto"></pre>
      </div>
      <div class="panel">
        <div class="toolbar-row">
          <strong>Dossiers temp</strong>
          <button type="button" class="btn" id="hcTemp">Mesurer</button>
          <button type="button" class="btn danger" id="hcRecycle">Vider corbeille</button>
          <button type="button" class="btn" id="hcIcons">Cache icônes</button>
          <button type="button" class="btn" id="hcRecent">Effacer récents</button>
        </div>
        <div class="table-wrap" style="max-height:220px;margin-top:10px">
          <table class="data"><thead><tr><th>Chemin</th><th>Taille</th></tr></thead><tbody id="hcTempBody"></tbody></table>
        </div>
      </div>
    </div>`;

  async function loadHealth() {
    setStatus("Chargement santé…");
    try {
      const res = await runSync(api, "getHealth", {});
      const data = res.data || res;
      document.getElementById("hcOut").textContent = JSON.stringify(data, null, 2).slice(0, 4000);
      const cards = document.getElementById("hcCards");
      const disk = data.disk || data.Disk || {};
      let adminLabel = "—";
      try {
        if (typeof api.is_admin === "function") {
          const adm = await api.is_admin();
          adminLabel = adm === true || adm?.admin === true ? "Oui" : "Non";
        }
      } catch (_) {}
      cards.innerHTML = `
        <div class="card"><span class="label">Disque libre</span><span class="value">${esc(disk.FreeText || disk.freeText || "—")}</span></div>
        <div class="card"><span class="label">Admin</span><span class="value">${esc(adminLabel)}</span></div>
        <div class="card"><span class="label">Statut</span><span class="value">OK</span></div>`;
      setStatus("Santé actualisée.", "ok");
    } catch (e) {
      setStatus(String(e.message || e), "error");
    }
  }

  async function loadTemp() {
    try {
      const res = await api.temp_sizes();
      const rows = res?.paths || res?.items || res?.data || [];
      const list = Array.isArray(rows) ? rows : [];
      document.getElementById("hcTempBody").innerHTML = list.length
        ? list
            .map(
              (r) =>
                `<tr><td class="wrap">${esc(r.path || r.Path || r.name || "")}</td><td>${esc(
                  r.sizeText || r.SizeText || fmtBytes(r.size || r.Bytes || 0)
                )}</td></tr>`
            )
            .join("")
        : `<tr><td colspan="2" class="empty-state">Aucune donnée temp</td></tr>`;
    } catch (e) {
      setStatus(String(e.message || e), "error");
    }
  }

  document.getElementById("hcRefresh").onclick = loadHealth;
  document.getElementById("hcTemp").onclick = loadTemp;
  document.getElementById("hcRecycle").onclick = async () => {
    const prep = await api.prepare_empty_recycle_bin();
    if (!prep?.ok) return setStatus(prep?.error || "Refusé", "error");
    const r = await api.empty_recycle_bin(prep.token);
    setStatus(r?.ok ? "Corbeille vidée." : r?.error || "Échec", r?.ok ? "ok" : "error");
  };
  document.getElementById("hcIcons").onclick = async () => {
    const prep = await api.prepare_rebuild_icon_cache();
    if (!prep?.ok) return setStatus(prep?.error || "Refusé", "error");
    const r = await api.rebuild_icon_cache(prep.token);
    setStatus(r?.ok ? "Cache icônes reconstruit." : r?.error || "Échec", r?.ok ? "ok" : "error");
  };
  document.getElementById("hcRecent").onclick = async () => {
    const prep = await api.prepare_clear_recent_files();
    if (!prep?.ok) return setStatus(prep?.error || "Refusé", "error");
    const r = await api.clear_recent_files(prep.token);
    setStatus(r?.ok ? "Récents effacés." : r?.error || "Échec", r?.ok ? "ok" : "error");
  };

  await loadHealth();
  await loadTemp();
}

async function mountClean(body, api, setStatus, askConfirm, setProgress) {
  body.innerHTML = `
    <div class="hub-inhub-scroll">
      <div class="panel">
        <div class="toolbar-row">
          <strong>Catégories de nettoyage</strong>
          <button type="button" class="btn" id="clCats">Charger</button>
          <button type="button" class="btn accent" id="clScan">Analyser</button>
          <button type="button" class="btn danger" id="clRun">Nettoyer</button>
        </div>
        <div class="check-list" id="clList" style="margin-top:12px"></div>
        <p class="meta" id="clMeta" style="margin-top:8px"></p>
      </div>
      <div class="panel">
        <strong>Résultat</strong>
        <pre class="meta" id="clOut" style="white-space:pre-wrap;margin-top:8px;max-height:260px;overflow:auto"></pre>
        <div class="progress-bar" style="margin-top:10px"><i id="clProg"></i></div>
      </div>
    </div>`;

  let categories = [];

  function selectedIds() {
    return [...body.querySelectorAll("#clList input:checked")].map((el) => el.value);
  }

  async function loadCats() {
    setStatus("Chargement catégories…");
    try {
      const res = await runSync(api, "getCategories", {});
      const data = res.data || res;
      categories = data.categories || data.Categories || data.items || [];
      if (!Array.isArray(categories)) categories = [];
      document.getElementById("clList").innerHTML = categories.length
        ? categories
            .map((c) => {
              const id = c.id || c.Id || c.name || c.Name;
              const label = c.label || c.Label || c.name || c.Name || id;
              const hint = c.description || c.Description || c.sizeText || "";
              return `<label><input type="checkbox" value="${esc(id)}" checked /> <span><strong>${esc(
                label
              )}</strong>${hint ? ` <span class="meta">— ${esc(hint)}</span>` : ""}</span></label>`;
            })
            .join("")
        : `<p class="empty-state">Aucune catégorie</p>`;
      document.getElementById("clMeta").textContent = `${categories.length} catégorie(s)`;
      setStatus("Catégories prêtes.", "ok");
    } catch (e) {
      setStatus(String(e.message || e), "error");
    }
  }

  document.getElementById("clCats").onclick = loadCats;
  document.getElementById("clScan").onclick = async () => {
    const ids = selectedIds();
    if (!ids.length) return setStatus("Sélectionnez au moins une catégorie.", "error");
    setStatus("Analyse en cours…");
    document.getElementById("clProg").style.width = "15%";
    if (setProgress) setProgress(15, "Analyse…");
    try {
      const res = await runSync(api, "scanClean", { ids });
      const data = res.data || res;
      const summary = summarizeClean(data);
      const cats = data.categories || data.Categories || data.items || [];
      let human = summary || "";
      if (Array.isArray(cats) && cats.length) {
        human +=
          (human ? "\n\n" : "") +
          cats
            .slice(0, 40)
            .map(
              (c) =>
                `• ${c.label || c.Label || c.name || c.Id || c.id || "?"} — ${
                  c.sizeText || c.SizeText || c.BytesText || fmtBytes(c.bytes || c.Bytes || 0)
                }`
            )
            .join("\n");
      }
      document.getElementById("clOut").textContent =
        human || JSON.stringify(data, null, 2).slice(0, 6000);
      document.getElementById("clProg").style.width = "100%";
      if (setProgress) setProgress(100, "Analyse terminée");
      setStatus("Analyse terminée.", "ok");
    } catch (e) {
      setStatus(String(e.message || e), "error");
    } finally {
      if (setProgress) setTimeout(() => setProgress(0, ""), 800);
    }
  };
  document.getElementById("clRun").onclick = async () => {
    const ids = selectedIds();
    if (!ids.length) return setStatus("Sélectionnez au moins une catégorie.", "error");
    setStatus("Nettoyage…");
    document.getElementById("clProg").style.width = "10%";
    const res = await runJob(
      api,
      "runClean",
      { ids },
      askConfirm,
      `Nettoyer ${ids.length} catégorie(s) ?`,
      (pct, label) => {
        document.getElementById("clProg").style.width = (pct || 0) + "%";
        if (setProgress) setProgress(pct, label);
      }
    );
    document.getElementById("clProg").style.width = "100%";
    if (!res?.ok) return setStatus(res?.error || "Échec", "error");
    const data = res.data || res;
    const summary = summarizeClean(data);
    document.getElementById("clOut").textContent =
      (summary ? summary + "\n\n" : "") + JSON.stringify(data, null, 2).slice(0, 4000);
    setStatus(summary ? summary.split("\n")[0] : "Nettoyage terminé.", "ok");
    if (setProgress) setTimeout(() => setProgress(0, ""), 800);
  };

  await loadCats();
}

async function mountTraces(body, api, setStatus, askConfirm, setProgress) {
  body.innerHTML = `
    <div class="hub-inhub-scroll">
      <div class="panel">
        <div class="toolbar-row">
          <strong>Traces Windows</strong>
          <button type="button" class="btn accent" id="trScan">Lister</button>
          <button type="button" class="btn danger" id="trClear">Effacer sélection</button>
        </div>
        <div class="check-list" id="trCats" style="margin-top:10px">
          ${TRACE_CATS.map((c) => `<label><input type="checkbox" value="${c.id}" checked /> ${esc(c.label)}</label>`).join("")}
        </div>
        <p class="meta" id="trMeta" style="margin-top:8px"></p>
      </div>
      <div class="panel flex-fill" style="padding:0;min-height:220px">
        <div class="table-wrap">
          <table class="data"><thead><tr><th>Catégorie</th><th>Chemin / détail</th></tr></thead><tbody id="trBody"></tbody></table>
        </div>
      </div>
    </div>`;

  document.getElementById("trScan").onclick = async () => {
    const ids = [...body.querySelectorAll("#trCats input:checked")].map((el) => el.value);
    setStatus("Scan traces…");
    try {
      const res = await runSync(api, "listTraces", { ids, categories: ids });
      const data = res.data || res;
      const items = data.items || data.Items || data.traces || [];
      const rows = Array.isArray(items) ? items : [];
      document.getElementById("trBody").innerHTML = rows.length
        ? rows
            .map(
              (r) =>
                `<tr><td>${esc(r.category || r.Category || r.cat || "")}</td><td class="wrap">${esc(
                  r.path || r.Path || r.name || r.Name || JSON.stringify(r)
                )}</td></tr>`
            )
            .join("")
        : `<tr><td colspan="2" class="empty-state">Aucune trace</td></tr>`;
      document.getElementById("trMeta").textContent = `${rows.length} élément(s)`;
      setStatus("Traces listées.", "ok");
    } catch (e) {
      setStatus(String(e.message || e), "error");
    }
  };

  document.getElementById("trClear").onclick = async () => {
    const ids = [...body.querySelectorAll("#trCats input:checked")].map((el) => el.value);
    if (!ids.length) return;
    const res = await runJob(
      api,
      "runClean",
      { ids, TracesOnly: true },
      askConfirm,
      `Effacer les traces sélectionnées (${ids.length}) ?`,
      setProgress
    );
    setStatus(res?.ok ? "Traces effacées." : res?.error || "Échec", res?.ok ? "ok" : "error");
    if (setProgress) setTimeout(() => setProgress(0, ""), 600);
  };
}

async function mountDebloat(body, api, setStatus, askConfirm, setProgress) {
  body.innerHTML = `
    <div class="hub-inhub-scroll">
      <div class="panel">
        <div class="toolbar-row">
          <strong>Applications bloat</strong>
          <button type="button" class="btn accent" id="dbScan">Scanner</button>
          <button type="button" class="btn danger" id="dbRemove">Retirer sélection</button>
        </div>
        <div class="check-list" id="dbList" style="margin-top:12px"></div>
        <p class="meta" id="dbMeta"></p>
      </div>
    </div>`;

  document.getElementById("dbScan").onclick = async () => {
    setStatus("Scan bloat…");
    if (setProgress) setProgress(20, "Scan bloat…");
    try {
      const res = await runSync(api, "getBloatApps", {});
      const data = res.data != null ? res.data : res;
      let apps = data.apps || data.Apps || data.items || data.Items || [];
      if (!Array.isArray(apps) && typeof apps === "object") apps = Object.values(apps);
      if (!Array.isArray(apps)) apps = [];
      document.getElementById("dbList").innerHTML = apps.length
        ? apps
            .map((a) => {
              const name = a.Name || a.name || a.PackageName || a.packageName || a.Id || a.id || "";
              const size = a.ApproxSizeText || a.sizeText || a.SizeText || "";
              if (!name) return "";
              return `<label><input type="checkbox" value="${esc(name)}" ${
                a.Selected !== false ? "checked" : ""
              } /> <span><strong>${esc(name)}</strong> <span class="meta">${esc(size)}</span></span></label>`;
            })
            .filter(Boolean)
            .join("")
        : `<p class="empty-state">Aucune app bloat détectée (ou API sans liste)</p>`;
      document.getElementById("dbMeta").textContent = `${apps.length} app(s)`;
      setStatus(apps.length ? "Scan bloat OK." : "Scan OK — liste vide.", apps.length ? "ok" : "");
    } catch (e) {
      setStatus(String(e.message || e), "error");
    } finally {
      if (setProgress) setProgress(0, "");
    }
  };

  document.getElementById("dbRemove").onclick = async () => {
    const names = [...body.querySelectorAll("#dbList input:checked")].map((el) => el.value).filter(Boolean);
    if (!names.length) return setStatus("Aucune app sélectionnée.", "error");
    const res = await runJob(
      api,
      "removeBloat",
      { names },
      askConfirm,
      `Retirer ${names.length} application(s) bloat ?`,
      setProgress
    );
    setStatus(res?.ok ? "Debloat terminé." : res?.error || "Échec", res?.ok ? "ok" : "error");
    if (res?.ok) document.getElementById("dbScan").click();
    if (setProgress) setTimeout(() => setProgress(0, ""), 600);
  };
}

async function mountUninstall(body, api, setStatus, askConfirm, setProgress) {
  body.innerHTML = `
    <div class="hub-inhub-scroll">
      <div class="panel">
        <div class="toolbar-row">
          <div class="search-wrap"><input type="search" id="unQ" placeholder="Mot-clé programme…" /></div>
          <button type="button" class="btn accent" id="unFind">Rechercher</button>
          <button type="button" class="btn danger" id="unOff">Désinstall. officielle</button>
          <button type="button" class="btn" id="unPurge">Purger résidus</button>
        </div>
        <p class="meta" id="unMeta"></p>
      </div>
      <div class="panel flex-fill" style="padding:0;min-height:200px">
        <div class="table-wrap">
          <table class="data"><thead><tr><th></th><th>Nom</th><th>Détail</th></tr></thead><tbody id="unBody"></tbody></table>
        </div>
      </div>
    </div>`;

  let last = { apps: [], leftovers: [] };

  document.getElementById("unFind").onclick = async () => {
    const keyword = document.getElementById("unQ").value.trim();
    if (!keyword) return setStatus("Mot-clé requis.", "error");
    setStatus("Recherche…");
    try {
      const res = await runSync(api, "findPurge", { keyword });
      const data = res.data || res;
      last = { apps: data.apps || [], leftovers: data.leftovers || [] };
      const rows = [
        ...last.apps.map((a) => ({ kind: "app", name: a.Name || a.name, detail: a.Publisher || a.Version || "" })),
        ...last.leftovers.map((p) => ({ kind: "path", name: typeof p === "string" ? p : p.path || "", detail: "résiduel" })),
      ];
      document.getElementById("unBody").innerHTML = rows.length
        ? rows
            .map(
              (r, i) =>
                `<tr><td><input type="radio" name="unPick" value="${i}" /></td><td>${esc(r.name)}</td><td class="wrap">${esc(
                  r.detail
                )}</td></tr>`
            )
            .join("")
        : `<tr><td colspan="3" class="empty-state">Aucun résultat</td></tr>`;
      document.getElementById("unMeta").textContent = `${last.apps.length} app(s) · ${last.leftovers.length} résidu(s)`;
      setStatus("Recherche OK.", "ok");
    } catch (e) {
      setStatus(String(e.message || e), "error");
    }
  };

  document.getElementById("unOff").onclick = async () => {
    const keyword = document.getElementById("unQ").value.trim();
    if (!keyword) return;
    const res = await runJob(
      api,
      "officialUninstall",
      { keyword },
      askConfirm,
      `Lancer la désinstallation officielle pour « ${keyword} » ?`,
      setProgress
    );
    setStatus(res?.ok ? "Désinstallation lancée." : res?.error || "Échec", res?.ok ? "ok" : "error");
    if (setProgress) setTimeout(() => setProgress(0, ""), 600);
  };

  document.getElementById("unPurge").onclick = async () => {
    const keyword = document.getElementById("unQ").value.trim();
    if (!keyword) return;
    const res = await runJob(
      api,
      "purgeLeftovers",
      { keyword },
      askConfirm,
      `Purger les résidus pour « ${keyword} » ?`,
      setProgress
    );
    setStatus(res?.ok ? "Purge terminée." : res?.error || "Échec", res?.ok ? "ok" : "error");
    if (setProgress) setTimeout(() => setProgress(0, ""), 600);
  };
}

async function mountOpt(body, api, setStatus, askConfirm, setProgress) {
  body.innerHTML = `
    <div class="hub-inhub-scroll">
      <div class="panel">
        <p class="meta" style="margin-bottom:10px">
          Optimisations WinCleaner : profils d’affinage Windows, SFC (intégrité fichiers système),
          DISM RestoreHealth (image Windows), analyse WinSxS (composants). Chaque action est confirmée.
        </p>
        <div class="toolbar-row" style="flex-wrap:wrap">
          <button type="button" class="btn accent" id="opRun">Optimisations Windows</button>
          <button type="button" class="btn" id="opSfc">SFC /scannow</button>
          <button type="button" class="btn" id="opDism">DISM RestoreHealth</button>
          <button type="button" class="btn" id="opWinsxs">Analyser WinSxS</button>
        </div>
        <div class="progress-bar" style="margin-top:12px"><i id="opProg"></i></div>
        <pre class="meta" id="opOut" style="white-space:pre-wrap;margin-top:10px;max-height:320px;overflow:auto"></pre>
      </div>
    </div>`;

  async function job(action, msg, detail) {
    setStatus(msg);
    document.getElementById("opOut").textContent = detail + "\n\nDémarrage…";
    document.getElementById("opProg").style.width = "12%";
    const res = await runJob(api, action, {}, askConfirm, msg + " Continuer ?", (pct, label) => {
      document.getElementById("opProg").style.width = (pct || 0) + "%";
      if (setProgress) setProgress(pct, label);
    });
    document.getElementById("opProg").style.width = "100%";
    const data = res?.data || res;
    const human = summarizeClean(data);
    document.getElementById("opOut").textContent =
      detail +
      "\n\n" +
      (human ? human + "\n\n" : "") +
      (res?.ok === false ? "Erreur : " + (res.error || "?") : JSON.stringify(data, null, 2).slice(0, 6000));
    setStatus(res?.ok ? "Terminé." : res?.error || "Échec", res?.ok ? "ok" : "error");
    if (setProgress) setTimeout(() => setProgress(0, ""), 800);
  }

  document.getElementById("opRun").onclick = () =>
    job("runOptimizations", "Lancer les optimisations Windows ?", "Action : runOptimizations — affinage / nettoyage ciblé Windows.");
  document.getElementById("opSfc").onclick = () =>
    job("sfcScan", "Lancer SFC /scannow ?", "Action : sfcScan — vérifie et répare les fichiers système protégés (peut prendre longtemps).");
  document.getElementById("opDism").onclick = () =>
    job("dismRestoreHealth", "Lancer DISM RestoreHealth ?", "Action : dismRestoreHealth — répare l’image Windows via DISM (long).");
  document.getElementById("opWinsxs").onclick = () =>
    job("analyzeWinSxS", "Analyser WinSxS ?", "Action : analyzeWinSxS — analyse le magasin de composants (lecture / rapport).");
}

async function mountSessions(body, api, setStatus) {
  body.innerHTML = `
    <div class="hub-inhub-scroll">
      <div class="panel">
        <div class="toolbar-row">
          <strong>Sessions de nettoyage</strong>
          <button type="button" class="btn accent" id="seRefresh" style="margin-left:auto">Actualiser</button>
          <button type="button" class="btn" id="seExport">Exporter rapport</button>
        </div>
        <pre class="meta" id="seOut" style="white-space:pre-wrap;margin-top:10px;max-height:400px;overflow:auto"></pre>
      </div>
    </div>`;

  document.getElementById("seRefresh").onclick = async () => {
    setStatus("Chargement sessions…");
    try {
      const res = await runSync(api, "getSessions", {});
      document.getElementById("seOut").textContent = JSON.stringify(res.data || res, null, 2).slice(0, 8000);
      setStatus("Sessions chargées.", "ok");
    } catch (e) {
      setStatus(String(e.message || e), "error");
    }
  };
  document.getElementById("seExport").onclick = async () => {
    try {
      const res = await runSync(api, "exportReport", {});
      document.getElementById("seOut").textContent = JSON.stringify(res.data || res, null, 2).slice(0, 8000);
      setStatus("Rapport exporté.", "ok");
    } catch (e) {
      setStatus(String(e.message || e), "error");
    }
  };
  document.getElementById("seRefresh").click();
}

async function mountExclusions(body, api, setStatus, askConfirm) {
  body.innerHTML = `
    <div class="hub-inhub-scroll">
      <div class="panel">
        <div class="toolbar-row">
          <strong>Exclusions</strong>
          <button type="button" class="btn" id="exLoad">Charger</button>
          <button type="button" class="btn accent" id="exSave">Enregistrer</button>
        </div>
        <textarea id="exArea" style="width:100%;min-height:220px;margin-top:10px;border-radius:12px;border:1px solid var(--border);background:var(--bg1);color:var(--text);padding:12px;font:inherit;font-size:0.85rem"></textarea>
        <p class="meta">Une exclusion par ligne (chemins).</p>
      </div>
    </div>`;

  document.getElementById("exLoad").onclick = async () => {
    try {
      const res = await runSync(api, "getExclusions", {});
      const data = res.data || res;
      const list = data.exclusions || data.paths || data.items || [];
      document.getElementById("exArea").value = (Array.isArray(list) ? list : []).join("\n");
      setStatus("Exclusions chargées.", "ok");
    } catch (e) {
      setStatus(String(e.message || e), "error");
    }
  };
  document.getElementById("exSave").onclick = async () => {
    const paths = document
      .getElementById("exArea")
      .value.split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    const res = await runJob(
      api,
      "setExclusions",
      { paths, exclusions: paths },
      askConfirm,
      `Enregistrer ${paths.length} exclusion(s) ?`
    );
    setStatus(res?.ok ? "Exclusions enregistrées." : res?.error || "Échec", res?.ok ? "ok" : "error");
  };
  document.getElementById("exLoad").click();
}

async function mountTools(body, api, setStatus, askConfirm) {
  body.innerHTML = `
    <div class="hub-inhub-scroll">
      <div class="panel">
        <div class="toolbar-row" style="flex-wrap:wrap">
          <button type="button" class="btn accent" id="tlRestore">Créer point de restauration</button>
          <button type="button" class="btn" id="tlStartup">Lister démarrage</button>
          <button type="button" class="btn" id="tlHub">Statut modules hub</button>
        </div>
        <pre class="meta" id="tlOut" style="white-space:pre-wrap;margin-top:12px;max-height:360px;overflow:auto"></pre>
      </div>
    </div>`;

  document.getElementById("tlRestore").onclick = async () => {
    const res = await runJob(
      api,
      "createRestorePoint",
      { description: "Mr-Aurevo-X SystemClean" },
      askConfirm,
      "Créer un point de restauration système ?"
    );
    document.getElementById("tlOut").textContent = JSON.stringify(res, null, 2);
    setStatus(res?.ok ? "Point créé." : res?.error || "Échec", res?.ok ? "ok" : "error");
  };
  document.getElementById("tlStartup").onclick = async () => {
    try {
      const res = await runSync(api, "getStartup", {});
      document.getElementById("tlOut").textContent = JSON.stringify(res.data || res, null, 2).slice(0, 8000);
      setStatus("Démarrage listé.", "ok");
    } catch (e) {
      setStatus(String(e.message || e), "error");
    }
  };
  document.getElementById("tlHub").onclick = async () => {
    try {
      const res = await api.hub_module_status();
      document.getElementById("tlOut").textContent = JSON.stringify(res, null, 2);
      setStatus("Statut hub OK.", "ok");
    } catch (e) {
      setStatus(String(e.message || e), "error");
    }
  };
}

/* ── DiskMap panels ──────────────────────────────────────────────────────── */

async function pollDm(getter, setStatus, setProgress) {
  return pollUntil(() => getter(), {
    intervalMs: 450,
    timeoutMs: 600000,
    onTick: ({ percent, phase, detail, running, done }) => {
      const label = `${percent || 0}%${phase ? " · " + phase : ""}${detail ? " — " + detail : ""}`;
      if (setStatus && running) setStatus(label);
      if (setProgress) setProgress(done ? 100 : Math.max(percent || 0, 1), label);
    },
  });
}

function dmFilesFromProgress(prog) {
  const r = prog?.result || prog?.raw?.result || prog;
  if (!r) return [];
  if (Array.isArray(r)) return r;
  if (Array.isArray(r.files)) return r.files;
  if (Array.isArray(r.Folders)) return r.Folders;
  if (Array.isArray(r.folders)) return r.folders;
  if (Array.isArray(r.items)) return r.items;
  if (Array.isArray(r.groups)) return r.groups;
  if (r.data) {
    if (Array.isArray(r.data.files)) return r.data.files;
    if (Array.isArray(r.data.folders)) return r.data.folders;
    if (Array.isArray(r.data.items)) return r.data.items;
  }
  return [];
}

async function mountDiskMap(body, api, setStatus, setProgress) {
  body.innerHTML = `
    <div class="hub-inhub-scroll">
      <div class="panel">
        <div class="toolbar-row">
          <strong>Carte disque</strong>
          <button type="button" class="btn" id="dmDrives">Lecteurs</button>
          <button type="button" class="btn" id="dmPick">Choisir dossier</button>
          <button type="button" class="btn accent" id="dmScan">Scanner</button>
          <button type="button" class="btn ghost" id="dmCancel">Annuler</button>
        </div>
        <div class="search-wrap" style="margin-top:10px"><input type="text" id="dmPath" placeholder="Chemin à scanner (ex. C:\\)" /></div>
        <p class="meta" id="dmMeta" style="margin-top:8px"></p>
      </div>
      <div class="panel flex-fill" style="padding:0;min-height:240px">
        <div class="table-wrap">
          <table class="data"><thead><tr><th>Nom</th><th>Chemin</th><th>Taille</th><th></th></tr></thead><tbody id="dmBody"></tbody></table>
        </div>
      </div>
    </div>`;

  document.getElementById("dmDrives").onclick = async () => {
    const res = unwrapData(await api.list_drives());
    const drives = res?.drives || res?.items || res?.data?.drives || [];
    document.getElementById("dmBody").innerHTML = (drives || [])
      .map(
        (d) =>
          `<tr><td>${esc(d.name || d.letter || d.path)}</td><td class="wrap">${esc(d.path || d.root || "")}</td><td>${esc(
            d.freeText || fmtBytes(d.free || d.freeBytes || 0)
          )} libres</td><td><button type="button" class="action-btn" data-path="${esc(
            d.path || d.root || d.name
          )}">Scanner</button></td></tr>`
      )
      .join("");
    document.getElementById("dmMeta").textContent = `${drives.length} lecteur(s)`;
    setStatus("Lecteurs chargés.", "ok");
  };

  document.getElementById("dmBody").addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-path]");
    if (!btn) return;
    document.getElementById("dmPath").value = btn.getAttribute("data-path");
    document.getElementById("dmScan").click();
  });

  document.getElementById("dmPick").onclick = async () => {
    setStatus("Ouverture du sélecteur de dossier…");
    try {
      const res = unwrapData(await api.pick_folder());
      const path = res?.path || res?.data?.path || null;
      if (path) {
        document.getElementById("dmPath").value = path;
        setStatus("Dossier sélectionné.", "ok");
      } else if (res?.ok === false) {
        setStatus(res.error || "Sélecteur indisponible — saisissez un chemin.", "error");
      } else {
        setStatus("Aucun dossier choisi.");
      }
    } catch (e) {
      setStatus("Sélecteur indisponible : " + String(e.message || e) + " — saisissez un chemin.", "error");
    }
  };

  document.getElementById("dmCancel").onclick = () => api.cancel_scan().catch(() => {});

  document.getElementById("dmScan").onclick = async () => {
    const path = document.getElementById("dmPath").value.trim();
    if (!path) return setStatus("Chemin requis (ou Choisir dossier).", "error");
    setStatus("Scan en cours…");
    const start = unwrapData(await api.start_scan(path));
    if (!start?.ok) return setStatus(start?.error || "Échec démarrage", "error");
    await pollDm(() => api.get_scan_progress(), setStatus, setProgress);
    const result = unwrapData(await api.get_scan_result());
    if (!result?.ok) return setStatus(result?.error || "Échec scan", "error");
    const tree = result.tree || result.root || result.data || result.result || {};
    const children = tree.children || tree.Children || result.children || [];
    const rows = Array.isArray(children) ? children : [];
    document.getElementById("dmBody").innerHTML = rows.length
      ? rows
          .slice(0, 500)
          .map(
            (n) =>
              `<tr><td>${esc(n.name || n.Name)}</td><td class="wrap">${esc(n.path || n.Path || "")}</td><td>${esc(
                fmtBytes(n.size || n.Size || 0)
              )}</td><td><button type="button" class="action-btn" data-open="${esc(
                n.path || n.Path || ""
              )}">Ouvrir</button></td></tr>`
          )
          .join("")
      : `<tr><td colspan="4" class="empty-state">Résultat vide — voir meta</td></tr>`;
    document.getElementById("dmMeta").textContent = `Scan OK · ${rows.length} nœud(s) affiché(s)`;
    setStatus("Scan terminé.", "ok");
    if (setProgress) setTimeout(() => setProgress(0, ""), 600);
  };

  document.getElementById("dmBody").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-open]");
    if (b) api.open_path(b.getAttribute("data-open"));
  });

  document.getElementById("dmDrives").click();
}

async function mountDmSearch(body, api, setStatus, setProgress) {
  body.innerHTML = `
    <div class="hub-inhub-scroll">
      <div class="panel">
        <div class="toolbar-row">
          <div class="search-wrap"><input type="text" id="srRoot" placeholder="Racine (C:\\)" /></div>
          <div class="search-wrap"><input type="search" id="srQ" placeholder="Requête…" /></div>
          <button type="button" class="btn accent" id="srGo">Rechercher</button>
        </div>
      </div>
      <div class="panel flex-fill" style="padding:0;min-height:220px">
        <div class="table-wrap"><table class="data"><thead><tr><th>Fichier</th><th>Chemin</th><th></th></tr></thead><tbody id="srBody"></tbody></table></div>
      </div>
    </div>`;

  document.getElementById("srGo").onclick = async () => {
    const root = document.getElementById("srRoot").value.trim() || "C:\\";
    const query = document.getElementById("srQ").value.trim();
    if (!query) return setStatus("Requête requise.", "error");
    setStatus("Recherche…");
    const start = unwrapData(await api.start_search(root, query, {}));
    if (!start?.ok) return setStatus(start?.error || "Échec", "error");
    const prog = await pollDm(() => api.get_search_progress(), setStatus, setProgress);
    const items = dmFilesFromProgress(prog);
    document.getElementById("srBody").innerHTML = (items || [])
      .slice(0, 400)
      .map(
        (f) =>
          `<tr><td>${esc(f.name || f.Name || "")}</td><td class="wrap">${esc(f.path || f.Path || "")}</td>
          <td><button type="button" class="action-btn" data-open="${esc(f.path || f.Path || "")}">Ouvrir</button></td></tr>`
      )
      .join("") || `<tr><td colspan="3" class="empty-state">Aucun résultat</td></tr>`;
    setStatus(`${(items || []).length} résultat(s)`, "ok");
    if (setProgress) setTimeout(() => setProgress(0, ""), 600);
  };
  body.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-open]");
    if (b) api.open_path(b.getAttribute("data-open"));
  });
}

async function mountDmLarge(body, api, setStatus, askConfirm, setProgress) {
  body.innerHTML = `
    <div class="hub-inhub-scroll">
      <div class="panel">
        <div class="toolbar-row">
          <div class="search-wrap"><input type="text" id="lgRoot" placeholder="Racine" value="C:\\" /></div>
          <button type="button" class="btn" id="lgPick">Dossier…</button>
          <input type="number" id="lgMin" value="50" title="Min Mo" style="width:90px" />
          <button type="button" class="btn accent" id="lgGo">Scanner</button>
        </div>
        <p class="meta">Scan long sur C:\\ — préférez un dossier ciblé. La barre de progression reste visible pendant le parcours.</p>
      </div>
      <div class="panel flex-fill" style="padding:0;min-height:220px">
        <div class="table-wrap"><table class="data"><thead><tr><th>Fichier</th><th>Taille</th><th></th></tr></thead><tbody id="lgBody"></tbody></table></div>
      </div>
    </div>`;

  document.getElementById("lgPick").onclick = async () => {
    const res = unwrapData(await api.pick_folder());
    const path = res?.path || res?.data?.path;
    if (path) document.getElementById("lgRoot").value = path;
  };

  document.getElementById("lgGo").onclick = async () => {
    const root = document.getElementById("lgRoot").value.trim() || "C:\\";
    const minMb = Number(document.getElementById("lgMin").value) || 50;
    setStatus("Scan gros fichiers…");
    const start = unwrapData(await api.start_scan_large(root, 80, minMb));
    if (!start?.ok) return setStatus(start?.error || "Échec", "error");
    const prog = await pollDm(() => api.get_large_progress(), setStatus, setProgress);
    if (prog.error) return setStatus(prog.error, "error");
    const files = dmFilesFromProgress(prog);
    document.getElementById("lgBody").innerHTML = (files || [])
      .map(
        (f) =>
          `<tr><td class="wrap">${esc(f.path || f.Path || f.name || "")}</td><td>${esc(
            fmtBytes(f.size || f.Size || 0)
          )}</td>
          <td><button type="button" class="action-btn" data-open="${esc(f.path || f.Path || "")}">Ouvrir</button>
          <button type="button" class="action-btn danger" data-del="${esc(f.path || f.Path || "")}">Suppr.</button></td></tr>`
      )
      .join("") || `<tr><td colspan="3" class="empty-state">Aucun fichier</td></tr>`;
    setStatus(`${(files || []).length} fichier(s)`, "ok");
    if (setProgress) setTimeout(() => setProgress(0, ""), 600);
  };

  body.addEventListener("click", async (ev) => {
    const open = ev.target.closest("[data-open]");
    if (open) return api.open_path(open.getAttribute("data-open"));
    const del = ev.target.closest("[data-del]");
    if (!del) return;
    const path = del.getAttribute("data-del");
    if (!(await askConfirm(`Supprimer « ${path} » ?`))) return;
    const r = await api.delete_large_file(path);
    setStatus(r?.ok ? "Supprimé." : r?.error || "Échec", r?.ok ? "ok" : "error");
  });
}

async function mountDmEmpty(body, api, setStatus, askConfirm, setProgress) {
  body.innerHTML = `
    <div class="hub-inhub-scroll">
      <div class="panel">
        <div class="toolbar-row">
          <div class="search-wrap"><input type="text" id="emRoot" value="C:\\" /></div>
          <button type="button" class="btn" id="emPick">Dossier…</button>
          <button type="button" class="btn accent" id="emGo">Chercher dossiers vides</button>
        </div>
      </div>
      <div class="panel flex-fill" style="padding:0;min-height:200px">
        <div class="table-wrap"><table class="data"><thead><tr><th>Dossier</th><th></th></tr></thead><tbody id="emBody"></tbody></table></div>
      </div>
    </div>`;

  document.getElementById("emPick").onclick = async () => {
    const res = unwrapData(await api.pick_folder());
    const path = res?.path || res?.data?.path;
    if (path) document.getElementById("emRoot").value = path;
  };

  document.getElementById("emGo").onclick = async () => {
    const root = document.getElementById("emRoot").value.trim() || "C:\\";
    setStatus("Recherche dossiers vides…");
    const start = unwrapData(await api.start_find_empty(root));
    if (!start?.ok) return setStatus(start?.error || "Échec", "error");
    const prog = await pollDm(() => api.get_empty_progress(), setStatus, setProgress);
    if (prog.error) return setStatus(prog.error, "error");
    const folders = dmFilesFromProgress(prog);
    document.getElementById("emBody").innerHTML = (folders || [])
      .map(
        (f) => {
          const p = typeof f === "string" ? f : f.path || f.Path || "";
          return `<tr><td class="wrap">${esc(p)}</td><td>
            <button type="button" class="action-btn" data-open="${esc(p)}">Ouvrir</button>
            <button type="button" class="action-btn danger" data-del="${esc(p)}">Suppr.</button></td></tr>`;
        }
      )
      .join("") || `<tr><td colspan="2" class="empty-state">Aucun dossier vide</td></tr>`;
    setStatus(`${(folders || []).length} dossier(s)`, "ok");
    if (setProgress) setTimeout(() => setProgress(0, ""), 600);
  };

  body.addEventListener("click", async (ev) => {
    const open = ev.target.closest("[data-open]");
    if (open) return api.open_path(open.getAttribute("data-open"));
    const del = ev.target.closest("[data-del]");
    if (!del) return;
    const path = del.getAttribute("data-del");
    if (!(await askConfirm(`Supprimer le dossier vide « ${path} » ?`))) return;
    const r = await api.delete_empty_folder(path);
    setStatus(r?.ok ? "Supprimé." : r?.error || "Échec", r?.ok ? "ok" : "error");
  });
}

async function mountDmDupes(body, api, setStatus, askConfirm, setProgress) {
  body.innerHTML = `
    <div class="hub-inhub-scroll">
      <div class="panel">
        <div class="toolbar-row">
          <div class="search-wrap"><input type="text" id="duRoot" placeholder="Dossier" /></div>
          <button type="button" class="btn" id="duPick">Dossier…</button>
          <button type="button" class="btn accent" id="duGo">Scanner doublons</button>
        </div>
      </div>
      <div class="panel flex-fill" style="padding:0;min-height:200px">
        <div class="table-wrap"><table class="data"><thead><tr><th>Groupe</th><th>Fichiers</th></tr></thead><tbody id="duBody"></tbody></table></div>
      </div>
    </div>`;

  document.getElementById("duPick").onclick = async () => {
    const res = unwrapData(await api.pick_folder());
    const path = res?.path || res?.data?.path;
    if (path) document.getElementById("duRoot").value = path;
  };

  document.getElementById("duGo").onclick = async () => {
    const folder = document.getElementById("duRoot").value.trim();
    if (!folder) return setStatus("Dossier requis.", "error");
    setStatus("Scan doublons…");
    const start = unwrapData(await api.start_scan_duplicates(folder));
    if (!start?.ok) return setStatus(start?.error || "Échec", "error");
    const prog = await pollDm(() => api.get_dup_progress(), setStatus, setProgress);
    if (prog.error) return setStatus(prog.error, "error");
    const groups = dmFilesFromProgress(prog);
    document.getElementById("duBody").innerHTML = (groups || [])
      .slice(0, 200)
      .map((g, i) => {
        const paths = g.paths || g.files || [];
        return `<tr><td>#${i + 1}</td><td class="wrap">${esc(
          (paths || []).map((p) => (typeof p === "string" ? p : p.path)).join("\n")
        )}</td></tr>`;
      })
      .join("") || `<tr><td colspan="2" class="empty-state">Aucun doublon</td></tr>`;
    setStatus(`${(groups || []).length} groupe(s)`, "ok");
  };
}

async function mountDmHealth(body, api, setStatus) {
  body.innerHTML = `
    <div class="hub-inhub-scroll">
      <div class="panel">
        <div class="toolbar-row">
          <strong>Santé disques</strong>
          <button type="button" class="btn accent" id="dhGo" style="margin-left:auto">Actualiser</button>
        </div>
        <pre class="meta" id="dhOut" style="white-space:pre-wrap;margin-top:10px;max-height:420px;overflow:auto"></pre>
      </div>
    </div>`;
  document.getElementById("dhGo").onclick = async () => {
    setStatus("Lecture disques…");
    const res = await api.get_disk_info();
    document.getElementById("dhOut").textContent = JSON.stringify(res, null, 2).slice(0, 10000);
    setStatus(res?.ok === false ? res.error || "Échec" : "Disques OK.", res?.ok === false ? "error" : "ok");
  };
  document.getElementById("dhGo").click();
}

async function mountDmDiff(body, api, setStatus) {
  body.innerHTML = `
    <div class="hub-inhub-scroll">
      <div class="panel">
        <div class="toolbar-row">
          <button type="button" class="btn accent" id="dfSnap">Prendre snapshot</button>
          <button type="button" class="btn" id="dfCmp">Comparer</button>
        </div>
        <pre class="meta" id="dfOut" style="white-space:pre-wrap;margin-top:10px;max-height:420px;overflow:auto"></pre>
      </div>
    </div>`;
  document.getElementById("dfSnap").onclick = async () => {
    const res = await api.take_snapshot();
    document.getElementById("dfOut").textContent = JSON.stringify(res, null, 2).slice(0, 8000);
    setStatus(res?.ok === false ? res.error || "Échec" : "Snapshot pris.", res?.ok === false ? "error" : "ok");
  };
  document.getElementById("dfCmp").onclick = async () => {
    const res = await api.compare_snapshot();
    document.getElementById("dfOut").textContent = JSON.stringify(res, null, 2).slice(0, 8000);
    setStatus(res?.ok === false ? res.error || "Échec" : "Comparaison OK.", res?.ok === false ? "error" : "ok");
  };
}
