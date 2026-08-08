/**
 * SystemClean — native in-hub (WinCleaner + DiskMap), no iframe.
 * Bridge: pywebview.api.systemclean.wincleaner.* / systemclean.diskmap.*
 */
import { mountModuleShell, waitNs, esc, pollUntil, unwrapData } from "./_in_hub.js";

/** SoT WinCleaner TRACE_CAT_IDS — Screenshots off by default + ConfirmStrong. */
const TRACE_CAT_IDS = [
  "Recent",
  "JumpLists",
  "ExplorerHistory",
  "Thumbnails",
  "Prefetch",
  "ClipboardHistory",
  "Screenshots",
];

const TRACE_CAT_FALLBACK = {
  Recent: { label: "Fichiers récents", description: "Raccourcis Recent (.lnk)" },
  JumpLists: { label: "Jump lists", description: "AutomaticDestinations / CustomDestinations" },
  ExplorerHistory: {
    label: "Historique Explorateur",
    description: "RecentDocs, TypedPaths, WordWheel, RunMRU",
  },
  Thumbnails: { label: "Miniatures / icônes", description: "Thumbcache / IconCache" },
  Prefetch: { label: "Prefetch", description: "C:\\Windows\\Prefetch" },
  ClipboardHistory: { label: "Historique presse-papiers", description: "Cache local Clipboard (Win+V)" },
  Screenshots: {
    label: "Captures d'écran",
    description: "Images\\Captures d'écran / Screenshots",
  },
};

async function wcApi() {
  return waitNs("systemclean.wincleaner", "prepare_action");
}

async function dmApi() {
  return waitNs("systemclean.diskmap", "list_drives");
}

/** Surface real backend / bridge errors (never swallow empty messages). */
function apiErr(res, fallback = "Échec") {
  if (res == null) return fallback + " (réponse vide)";
  if (typeof res === "string") return res;
  const nested = res.data && typeof res.data === "object" ? res.data : null;
  return (
    res.error ||
    nested?.error ||
    res.message ||
    nested?.message ||
    (res.ok === false ? fallback : null) ||
    fallback
  );
}

async function runSync(api, action, payload = {}) {
  if (!api || typeof api.run !== "function") {
    throw new Error("API wincleaner.run indisponible (bridge)");
  }
  let res;
  try {
    res = await api.run(action, payload || {});
  } catch (e) {
    throw new Error(String(e?.message || e) || "Exception " + action);
  }
  if (!res || res.ok === false) {
    throw new Error(apiErr(res, "Échec " + action));
  }
  return res;
}

function summarizeClean(data) {
  if (!data || typeof data !== "object") return "";
  const d = data.data || data;
  const freed = d.FreedText || d.freedText || (d.FreedBytes != null ? fmtBytes(d.FreedBytes) : "");
  const before =
    d.BeforeText ||
    d.beforeText ||
    d.EstimatedText ||
    d.estimatedText ||
    d.totalText ||
    d.TotalText ||
    "";
  const delta = d.diskDelta || d.DiskDelta || d.delta || null;
  const parts = [];
  if (before) parts.push("Avant / estimé : " + before);
  if (freed) parts.push("Libéré : " + freed);
  if (delta) {
    let t = "";
    if (typeof delta === "object") {
      const rows = delta.Rows || delta.rows || [];
      if (Array.isArray(rows) && rows.length) {
        t = rows
          .map((r) => `${r.Name || r.name || "?"}: ${r.DeltaText || r.deltaText || ""}`)
          .filter(Boolean)
          .join(" · ");
      } else {
        t = delta.Text || delta.text || "";
      }
    } else {
      t = String(delta);
    }
    if (t) parts.push("Disque : " + t);
  }
  return parts.join("\n");
}

/** Stable plain object for ConfirmGate (same shape on prepare + start). */
function stablePayload(payload) {
  try {
    return JSON.parse(JSON.stringify(payload || {}));
  } catch (_) {
    return payload || {};
  }
}

async function runJob(api, action, payload, askConfirm, confirmMsg, setProgress) {
  if (!api || typeof api.start_action !== "function") {
    return { ok: false, error: "API wincleaner.start_action indisponible (bridge)" };
  }
  if (confirmMsg) {
    const ok = await askConfirm(confirmMsg, "Confirmer l'action");
    if (!ok) return { ok: false, error: "Annulé" };
  }
  const pl = stablePayload(payload);
  let prep;
  try {
    prep = await api.prepare_action(action, pl);
  } catch (e) {
    return { ok: false, error: "prepare_action: " + String(e?.message || e) };
  }
  if (!prep || !prep.ok || !prep.token) {
    return { ok: false, error: apiErr(prep, "Confirmation refusée (ConfirmGate)") };
  }
  let started;
  try {
    started = await api.start_action(action, pl, prep.token);
  } catch (e) {
    return { ok: false, error: "start_action: " + String(e?.message || e) };
  }
  if (!started || !started.ok) {
    return { ok: false, error: apiErr(started, "Démarrage refusé") };
  }
  const progress = await pollUntil(
    () => api.get_action_progress(),
    {
      intervalMs: 450,
      timeoutMs: action === "sfcScan" || action === "dismRestoreHealth" ? 1800000 : 300000,
      onTick: ({ percent, phase, detail, error }) => {
        if (setProgress) {
          const base = `${percent || 0}% · ${phase || ""}${detail ? " — " + detail : ""}`;
          setProgress(percent || 0, error ? base + " · " + error : base);
        }
      },
    }
  );
  if (progress?.error === "Timeout") {
    try {
      if (typeof api.cancel_action === "function") await api.cancel_action();
    } catch (_) {}
    return { ok: false, error: "Timeout — job annulé. Relancez l'action." };
  }
  if (progress?.error && (progress.done || progress.ok === false)) {
    return { ok: false, error: apiErr(progress, "Échec job") };
  }
  let result;
  try {
    result = await api.get_action_result();
  } catch (e) {
    return { ok: false, error: "get_action_result: " + String(e?.message || e) };
  }
  if (!result || result.ok === false) {
    return { ok: false, error: apiErr(result, "Aucun résultat"), data: result?.data };
  }
  return result;
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
  if (typeof body._dmCleanup === "function") {
    try {
      body._dmCleanup();
    } catch (_) {}
    body._dmCleanup = null;
  }
  body.innerHTML = `<div class="empty-state">Chargement…</div>`;

  try {
    if (id.startsWith("wc-")) {
      const api = await wcApi();
      if (!api) {
        setStatus("API systemclean.wincleaner indisponible", "error");
        body.innerHTML = `<div class="empty-state">Bridge Python indisponible.</div>`;
        return;
      }
      if (id === "wc-health") return mountHealth(body, api, setStatus, askConfirm);
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

async function mountHealth(body, api, setStatus, askConfirm) {
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
      const disks = data.disks || data.Disks || [];
      const disk0 = Array.isArray(disks) && disks.length ? disks[0] : data.disk || data.Disk || {};
      let adminLabel = data.admin === true || data.Admin === true ? "Oui" : data.admin === false ? "Non" : "—";
      try {
        if (adminLabel === "—" && typeof api.is_admin === "function") {
          const adm = await api.is_admin();
          adminLabel = adm === true || adm?.admin === true ? "Oui" : "Non";
        }
      } catch (_) {}
      const freeLabel =
        disk0.FreeText || disk0.freeText || disk0.freeLabel || disk0.Free || "—";
      const usedLabel = disk0.UsedText || disk0.usedText || disk0.usedLabel || "";
      const folders = data.folders || data.Folders || [];
      const folderHint =
        Array.isArray(folders) && folders[0]
          ? folders[0].SizeText || folders[0].sizeText || folders[0].Label || folders[0].label || ""
          : "";
      cards.innerHTML = `
        <div class="card"><span class="label">Disque libre</span><span class="value">${esc(
          String(freeLabel)
        )}</span></div>
        <div class="card"><span class="label">Utilisé</span><span class="value">${esc(
          String(usedLabel || "—")
        )}</span></div>
        <div class="card"><span class="label">Admin</span><span class="value">${esc(adminLabel)}</span></div>
        <div class="card"><span class="label">Dossier</span><span class="value">${esc(
          String(folderHint || "OK")
        )}</span></div>`;
      setStatus("Santé actualisée.", "ok");
    } catch (e) {
      setStatus(String(e.message || e), "error");
    }
  }

  async function loadTemp() {
    try {
      const res = await api.temp_sizes();
      if (res && res.ok === false) {
        setStatus(apiErr(res, "temp_sizes"), "error");
        return;
      }
      const rows = res?.folders || res?.paths || res?.items || res?.data?.folders || res?.data || [];
      const list = Array.isArray(rows) ? rows : [];
      document.getElementById("hcTempBody").innerHTML = list.length
        ? list
            .map(
              (r) =>
                `<tr><td class="wrap">${esc(r.path || r.Path || r.name || "")}</td><td>${esc(
                  r.sizeText ||
                    r.SizeText ||
                    (r.sizeMb != null ? `${r.sizeMb} Mo` : fmtBytes(r.bytes || r.size || r.Bytes || 0))
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
    if (!(await askConfirm("Vider la corbeille ?", "Confirmer"))) return;
    const prep = await api.prepare_empty_recycle_bin();
    if (!prep?.ok) return setStatus(prep?.error || "Refusé", "error");
    const r = await api.empty_recycle_bin(prep.token);
    setStatus(r?.ok ? "Corbeille vidée." : r?.error || "Échec", r?.ok ? "ok" : "error");
  };
  document.getElementById("hcIcons").onclick = async () => {
    if (!(await askConfirm("Reconstruire le cache d'icônes ?", "Confirmer"))) return;
    const prep = await api.prepare_rebuild_icon_cache();
    if (!prep?.ok) return setStatus(prep?.error || "Refusé", "error");
    const r = await api.rebuild_icon_cache(prep.token);
    setStatus(r?.ok ? "Cache icônes reconstruit." : r?.error || "Échec", r?.ok ? "ok" : "error");
  };
  document.getElementById("hcRecent").onclick = async () => {
    if (!(await askConfirm("Effacer les fichiers récents ?", "Confirmer"))) return;
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
      const all = data.categories || data.Categories || data.items || [];
      categories = (Array.isArray(all) ? all : []).filter((c) => !c.TracesOnly && !c.tracesOnly);
      document.getElementById("clList").innerHTML = categories.length
        ? categories
            .map((c) => {
              const id = c.id || c.Id || c.name || c.Name;
              const label = c.label || c.Label || c.name || c.Name || id;
              const hint = c.description || c.Description || c.sizeText || "";
              const on = c.DefaultOn !== false && c.defaultOn !== false;
              return `<label><input type="checkbox" value="${esc(id)}" ${on ? "checked" : ""} /> <span><strong>${esc(
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
      <div class="guard-banner" id="trGuard">
        Traces locales de ce que Windows a ouvert ou affiché. Lister avant d’effacer.
        Les captures d’écran demandent une confirmation renforcée.
      </div>
      <div class="dm-stats" id="trStats" style="margin-bottom:10px">
        <div class="stat"><span class="label">Catégories</span><span class="value" id="stTraceCats">—</span></div>
        <div class="stat"><span class="label">Sélection</span><span class="value" id="stTraceSel">0</span></div>
        <div class="stat"><span class="label">Éléments</span><span class="value" id="stTraceItems">—</span></div>
      </div>
      <div class="panel">
        <div class="toolbar-row">
          <strong>Catégories de traces</strong>
          <button type="button" class="btn accent" id="trScan" style="margin-left:auto">Lister</button>
          <button type="button" class="btn danger" id="trClear">Effacer la sélection</button>
        </div>
        <div class="check-list" id="trCats" style="margin-top:10px"></div>
        <p class="meta" id="trMeta" style="margin-top:8px"></p>
      </div>
      <div class="panel flex-fill" style="min-height:220px">
        <strong>Contenu listé</strong>
        <div id="trResult" class="traces-result" style="margin-top:10px">
          <p class="meta">Lance une liste pour voir les traces.</p>
        </div>
      </div>
    </div>`;

  const catsEl = document.getElementById("trCats");
  const resultEl = document.getElementById("trResult");

  function selectedTraceIds() {
    return [...catsEl.querySelectorAll("input[type=checkbox]:checked")].map((el) => el.value);
  }

  function updateTraceSelCount() {
    const el = document.getElementById("stTraceSel");
    if (el) el.textContent = String(selectedTraceIds().length);
  }

  function renderTraceCats(byId) {
    catsEl.innerHTML = TRACE_CAT_IDS.map((id) => {
      const c = byId[id] || {};
      const fb = TRACE_CAT_FALLBACK[id] || { label: id, description: "" };
      const label = c.Label || c.label || fb.label;
      const desc = c.Description || c.description || fb.description || "";
      const on = id !== "Screenshots" && c.DefaultOn !== false && c.defaultOn !== false;
      return `<label class="check-item">
        <input type="checkbox" value="${esc(id)}" ${on ? "checked" : ""} />
        <span><strong>${esc(label)}</strong>${
          desc ? ` <span class="meta">— ${esc(desc)}</span>` : ""
        }</span>
      </label>`;
    }).join("");
    document.getElementById("stTraceCats").textContent = String(TRACE_CAT_IDS.length);
    catsEl.onchange = updateTraceSelCount;
    updateTraceSelCount();
  }

  function renderTraceGroups(data) {
    const cats = data.categories || data.Categories || [];
    const total =
      data.totalCount != null
        ? data.totalCount
        : Array.isArray(cats)
          ? cats.reduce((s, c) => s + (Number(c.count || c.Count) || 0), 0)
          : 0;
    document.getElementById("stTraceItems").textContent = String(total);
    document.getElementById("trMeta").textContent = data.totalText
      ? `${total} élément(s) · ${data.totalText}`
      : `${total} élément(s)`;

    if (!Array.isArray(cats) || !cats.length) {
      // Flat fallback if API returns items[] only
      const items = data.items || data.Items || data.traces || [];
      if (Array.isArray(items) && items.length) {
        resultEl.innerHTML = `<ul class="traces-list">${items
          .map((it) => {
            const name = it.name || it.Name || it.path || it.Path || "";
            const detail = it.detail || it.Detail || "";
            const cat = it.category || it.Category || "";
            return `<li title="${esc(it.path || it.Path || "")}"><strong>${esc(
              cat
            )}</strong> ${esc(name)}${detail ? ` → ${esc(detail)}` : ""}</li>`;
          })
          .join("")}</ul>`;
        document.getElementById("stTraceItems").textContent = String(items.length);
        return;
      }
      resultEl.innerHTML = `<p class="meta">Aucune trace pour la sélection.</p>`;
      return;
    }

    resultEl.innerHTML = cats
      .map((c) => {
        const label = c.label || c.Label || c.id || c.Id || "?";
        const count = c.count != null ? c.count : c.Count != null ? c.Count : 0;
        const size = c.sizeText || c.SizeText || fmtBytes(c.bytes || c.Bytes || 0);
        const note = c.note || c.Note || "";
        const items = c.items || c.Items || [];
        const lis = items.length
          ? items
              .map((it) => {
                const name = it.name || it.Name || "";
                const detail = it.detail || it.Detail || "";
                const sz = it.size ? ` · ${fmtBytes(it.size)}` : "";
                const path = it.path || it.Path || "";
                return `<li title="${esc(path)}">${esc(detail ? `${name} → ${detail}` : name)}${esc(
                  sz
                )}</li>`;
              })
              .join("")
          : `<li class="meta">—</li>`;
        const more =
          count > items.length
            ? `<li class="meta">… ${items.length} affiché(s) sur ${count}</li>`
            : "";
        return `<div class="traces-group">
          <h4>${esc(label)} — ${count} · ${esc(size)}${note ? ` · ${esc(note)}` : ""}</h4>
          <ul class="traces-list">${lis}${more}</ul>
        </div>`;
      })
      .join("");
  }

  async function ensureCats() {
    let byId = {};
    try {
      const res = await runSync(api, "getCategories", {});
      const data = res.data || res;
      const all = data.categories || data.Categories || [];
      (Array.isArray(all) ? all : []).forEach((c) => {
        const id = c.Id || c.id;
        if (id) byId[id] = c;
      });
    } catch (_) {
      byId = {};
    }
    renderTraceCats(byId);
  }

  async function listTraces() {
    const ids = selectedTraceIds();
    if (!ids.length) {
      setStatus("Sélectionnez au moins une catégorie de traces.", "error");
      return;
    }
    setStatus("Liste des traces…");
    if (setProgress) setProgress(15, "Traces…");
    try {
      const res = await runSync(api, "listTraces", { ids });
      const data = res.data != null ? res.data : res;
      renderTraceGroups(data || {});
      setStatus("Traces listées.", "ok");
    } catch (e) {
      setStatus(String(e.message || e), "error");
    } finally {
      if (setProgress) setTimeout(() => setProgress(0, ""), 500);
    }
  }

  document.getElementById("trScan").onclick = listTraces;

  document.getElementById("trClear").onclick = async () => {
    const ids = selectedTraceIds();
    if (!ids.length) {
      setStatus("Sélectionnez au moins une catégorie de traces.", "error");
      return;
    }
    const ok = await askConfirm(
      `Effacer les traces sélectionnées (${ids.length}) ?`,
      "Effacer les traces"
    );
    if (!ok) return;
    if (ids.includes("Screenshots")) {
      const strong = await askConfirm(
        "ATTENTION : cela supprimera aussi les captures d’écran listées. Continuer ?",
        "Confirmation captures d’écran"
      );
      if (!strong) return;
    }
    const res = await runJob(
      api,
      "runClean",
      { ids, TracesOnly: true },
      null,
      null,
      setProgress
    );
    if (!res?.ok) {
      setStatus(res?.error || "Échec", "error");
      if (setProgress) setTimeout(() => setProgress(0, ""), 600);
      return;
    }
    const data = res.data || res;
    const freed =
      data.FreedText || data.freedText || (data.FreedBytes != null ? fmtBytes(data.FreedBytes) : "");
    setStatus(freed ? `Traces effacées — ${freed}` : "Traces effacées.", "ok");
    if (setProgress) setTimeout(() => setProgress(0, ""), 600);
    await listTraces();
  };

  await ensureCats();
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
          Optimisations WinCleaner : privacy / tâches / services / features, plus SFC, DISM et WinSxS.
          Chaque action est confirmée (ConfirmGate).
        </p>
        <div class="check-list" id="opFlags" style="margin-bottom:12px">
          <label><input type="checkbox" id="opPrivacy" checked /> Privacy tweaks</label>
          <label><input type="checkbox" id="opTasks" checked /> Tâches planifiées bloat</label>
          <label><input type="checkbox" id="opServices" checked /> Services bloat</label>
          <label><input type="checkbox" id="opFeatures" checked /> Features optionnelles</label>
          <label><input type="checkbox" id="opComponent" checked /> Nettoyage composants</label>
        </div>
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

  function optPayload() {
    return {
      privacy: !!document.getElementById("opPrivacy")?.checked,
      tasks: !!document.getElementById("opTasks")?.checked,
      services: !!document.getElementById("opServices")?.checked,
      features: !!document.getElementById("opFeatures")?.checked,
      componentCleanup: !!document.getElementById("opComponent")?.checked,
    };
  }

  async function job(action, msg, detail, payload) {
    setStatus(msg);
    document.getElementById("opOut").textContent = detail + "\n\nDémarrage…";
    document.getElementById("opProg").style.width = "12%";
    const res = await runJob(api, action, payload || {}, askConfirm, msg + " Continuer ?", (pct, label) => {
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

  document.getElementById("opRun").onclick = () => {
    const pl = optPayload();
    if (!pl.privacy && !pl.tasks && !pl.services && !pl.features && !pl.componentCleanup) {
      return setStatus("Cochez au moins une option d’optimisation.", "error");
    }
    job(
      "runOptimizations",
      "Lancer les optimisations Windows ?",
      "Action : runOptimizations — " + JSON.stringify(pl),
      pl
    );
  };
  document.getElementById("opSfc").onclick = () =>
    job("sfcScan", "Lancer SFC /scannow ?", "Action : sfcScan — vérifie et répare les fichiers système protégés (peut prendre longtemps).", {});
  document.getElementById("opDism").onclick = () =>
    job("dismRestoreHealth", "Lancer DISM RestoreHealth ?", "Action : dismRestoreHealth — répare l’image Windows via DISM (long).", {});
  document.getElementById("opWinsxs").onclick = () =>
    job("analyzeWinSxS", "Analyser WinSxS ?", "Action : analyzeWinSxS — analyse le magasin de composants (lecture / rapport).", {});
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

/* DiskMap Map — squarified treemap (Bruls et al.), ported from DiskMap/ui/app.js SoT */
const DM_TOP_N = 12;
const DM_PALETTE = [
  "#e03545", "#c43a4a", "#a84555", "#8b5568", "#6d6578",
  "#5a7080", "#4a7a72", "#6a6a40", "#8a5a3a", "#9a4050",
  "#704858", "#556070", "#7a4058", "#405868",
];

async function mountDiskMap(body, api, setStatus, setProgress) {
  if (typeof body._dmCleanup === "function") {
    try {
      body._dmCleanup();
    } catch (_) {}
    body._dmCleanup = null;
  }
  body.innerHTML = `
    <div class="dm-map-shell">
      <div class="panel dm-toolbar">
        <div class="toolbar-row">
          <strong>Carte disque</strong>
          <select id="dmDrive" style="min-width:220px"></select>
          <button type="button" class="btn" id="dmPick">Dossier…</button>
          <button type="button" class="btn accent" id="dmScan">Analyser</button>
          <button type="button" class="btn danger" id="dmCancel" disabled>Annuler</button>
        </div>
        <div class="dm-stats">
          <div class="stat"><div class="label">Libre</div><div class="value" id="dmFree">—</div></div>
          <div class="stat"><div class="label">Utilisé</div><div class="value" id="dmUsed">—</div></div>
          <div class="stat"><div class="label">Analysé</div><div class="value" id="dmScanned">—</div></div>
        </div>
        <nav class="dm-crumbs" id="dmCrumbs" aria-label="breadcrumb"></nav>
        <p class="dm-nav-hint">Clic = sélection · double-clic = ouvrir · clic droit = remonter</p>
      </div>
      <div class="dm-workspace">
        <div class="dm-map-wrap">
          <canvas id="treemap" width="800" height="600" aria-label="Treemap"></canvas>
          <div class="dm-map-hint" id="dmMapHint">Le treemap apparaîtra ici après l'analyse.</div>
        </div>
        <aside class="dm-side">
          <h2>Top éléments</h2>
          <p class="dm-side-sub" id="dmSideSub">Niveau actuel</p>
          <ul class="dm-top-list" id="dmTopList"></ul>
          <button type="button" class="btn accent full" id="dmOpen" disabled>Ouvrir dans l'Explorateur</button>
        </aside>
      </div>
    </div>`;

  const el = {
    driveSelect: body.querySelector("#dmDrive"),
    btnPick: body.querySelector("#dmPick"),
    btnAnalyze: body.querySelector("#dmScan"),
    btnCancel: body.querySelector("#dmCancel"),
    btnOpen: body.querySelector("#dmOpen"),
    stFree: body.querySelector("#dmFree"),
    stUsed: body.querySelector("#dmUsed"),
    stScanned: body.querySelector("#dmScanned"),
    crumbs: body.querySelector("#dmCrumbs"),
    canvas: body.querySelector("#treemap"),
    mapHint: body.querySelector("#dmMapHint"),
    topList: body.querySelector("#dmTopList"),
    sideSub: body.querySelector("#dmSideSub"),
  };

  const state = {
    scanPath: null,
    root: null,
    stack: [],
    layout: [],
    selected: null,
    hover: null,
    layoutKey: "",
    paintScheduled: false,
    scanning: false,
    cancelled: false,
  };

  const roCleanups = [];

  function currentNode() {
    if (!state.stack.length) return null;
    return state.stack[state.stack.length - 1];
  }

  function worst(rowAreas, length) {
    if (!rowAreas.length) return Infinity;
    let s = 0, max = 0, min = Infinity;
    for (const a of rowAreas) {
      s += a;
      if (a > max) max = a;
      if (a < min) min = a;
    }
    const s2 = s * s;
    const l2 = length * length;
    return Math.max((l2 * max) / s2, s2 / (l2 * min));
  }

  function layoutRow(items, x, y, w, h, horizontal, out) {
    const total = items.reduce((acc, it) => acc + it.area, 0) || 1;
    if (horizontal) {
      let cx = x;
      for (const it of items) {
        const ww = (it.area / total) * w;
        out.push({ node: it.node, x: cx, y, w: Math.max(0, ww), h, color: it.color });
        cx += ww;
      }
    } else {
      let cy = y;
      for (const it of items) {
        const hh = (it.area / total) * h;
        out.push({ node: it.node, x, y: cy, w, h: Math.max(0, hh), color: it.color });
        cy += hh;
      }
    }
  }

  function squarify(nodes, x, y, w, h, out, colorOffset) {
    const items = nodes
      .filter((n) => n && n.size > 0)
      .map((n, i) => ({
        node: n,
        size: n.size,
        color: DM_PALETTE[(colorOffset + i) % DM_PALETTE.length],
      }))
      .sort((a, b) => b.size - a.size);
    if (!items.length || w < 1 || h < 1) return;

    const totalSize = items.reduce((a, b) => a + b.size, 0) || 1;
    const scale = (w * h) / totalSize;
    const queue = items.map((it) => ({ ...it, area: it.size * scale }));

    let cx = x, cy = y, cw = w, ch = h;
    let i = 0;

    while (i < queue.length && cw > 0.5 && ch > 0.5) {
      const horizontal = cw >= ch;
      const side = horizontal ? ch : cw;
      const row = [];
      const rowAreas = [];

      while (i < queue.length) {
        const next = queue[i];
        const trialAreas = rowAreas.concat([next.area]);
        if (row.length && worst(trialAreas, side) > worst(rowAreas, side)) break;
        row.push(next);
        rowAreas.push(next.area);
        i++;
      }

      const rowArea = rowAreas.reduce((a, b) => a + b, 0);
      if (horizontal) {
        const rowH = Math.min(ch, rowArea / cw);
        layoutRow(row, cx, cy, cw, rowH, true, out);
        cy += rowH;
        ch -= rowH;
      } else {
        const rowW = Math.min(cw, rowArea / ch);
        layoutRow(row, cx, cy, rowW, ch, false, out);
        cx += rowW;
        cw -= rowW;
      }
    }
  }

  function buildLayout(force) {
    const node = currentNode();
    const canvas = el.canvas;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    const cssW = Math.max(100, Math.floor(rect.width));
    const cssH = Math.max(100, Math.floor(rect.height));
    const key = (node && node.path ? node.path : "") + "|" + cssW + "x" + cssH + "|" + state.stack.length;
    if (!force && key === state.layoutKey && state.layout.length) {
      canvas.width = Math.floor(cssW * dpr);
      canvas.height = Math.floor(cssH * dpr);
      canvas.style.width = cssW + "px";
      canvas.style.height = cssH + "px";
      const ctx = canvas.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { ctx, cssW, cssH, empty: false };
    }

    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    state.layout = [];
    state.layoutKey = key;
    if (!node) return { ctx, cssW, cssH, empty: true };

    const kids = (node.children || []).filter((c) => c.size > 0);
    if (!kids.length) {
      return { ctx, cssW, cssH, empty: true, emptyNode: node };
    }
    squarify(kids, 2, 2, cssW - 4, cssH - 4, state.layout, state.stack.length);
    return { ctx, cssW, cssH, empty: false };
  }

  function paint(ctx, cssW, cssH, empty, emptyNode) {
    if (!ctx) return;
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.fillStyle = "#0e0e10";
    ctx.fillRect(0, 0, cssW, cssH);

    if (empty) {
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.font = "500 14px Outfit, system-ui, sans-serif";
      ctx.textAlign = "center";
      const msg =
        emptyNode && emptyNode.size > 0
          ? "Aucun sous-élément affichable à ce niveau"
          : "Dossier vide ou inaccessible";
      ctx.fillText(msg, cssW / 2, cssH / 2);
      ctx.textAlign = "left";
      return;
    }

    for (const cell of state.layout) {
      const { x, y, w, h, color, node } = cell;
      if (w < 0.5 || h < 0.5) continue;
      const isHover = state.hover === node;
      const isSel = state.selected === node;
      ctx.fillStyle = color;
      ctx.globalAlpha = isHover || isSel ? 1 : 0.88;
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = isSel ? "#fff" : "rgba(0,0,0,0.55)";
      ctx.lineWidth = isSel ? 2 : 1;
      ctx.strokeRect(x + 0.5, y + 0.5, Math.max(0, w - 1), Math.max(0, h - 1));

      if (w > 48 && h > 28) {
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.fillRect(x, y, w, 22);
        ctx.fillStyle = "#fff";
        ctx.font = "600 12px Outfit, system-ui, sans-serif";
        const label = node.name || "";
        const size = fmtBytes(node.size);
        const maxW = w - 10;
        let text = label;
        if (ctx.measureText(text).width > maxW) {
          while (text.length > 1 && ctx.measureText(text + "…").width > maxW) {
            text = text.slice(0, -1);
          }
          text += "…";
        }
        ctx.fillText(text, x + 5, y + 15);
        if (h > 44) {
          ctx.fillStyle = "rgba(255,255,255,0.75)";
          ctx.font = "500 11px Outfit, system-ui, sans-serif";
          ctx.fillText(size, x + 5, y + 34);
        }
      }
    }
  }

  function draw(forceLayout) {
    const built = buildLayout(!!forceLayout);
    paint(built.ctx, built.cssW, built.cssH, built.empty, built.emptyNode);
  }

  function schedulePaint() {
    if (state.paintScheduled) return;
    state.paintScheduled = true;
    requestAnimationFrame(() => {
      state.paintScheduled = false;
      draw(false);
    });
  }

  function isOthersBucket(name) {
    const n = String(name || "");
    return n.startsWith("Autres") || n.startsWith("Others");
  }

  function canDrill(node) {
    return !!(
      node &&
      node.isDir &&
      node.children &&
      node.children.length &&
      !isOthersBucket(node.name)
    );
  }

  function selectNode(node) {
    state.selected = node || null;
    renderTop();
    schedulePaint();
    const openTarget = state.selected || currentNode();
    el.btnOpen.disabled =
      !openTarget || !openTarget.path || isOthersBucket(openTarget.name);
  }

  function drillInto(node) {
    if (!canDrill(node)) {
      selectNode(node);
      return;
    }
    state.stack.push(node);
    state.selected = null;
    state.layoutKey = "";
    refreshView();
  }

  function goUp() {
    if (state.stack.length > 1) {
      state.stack.pop();
      state.selected = null;
      state.layoutKey = "";
      refreshView();
    }
  }

  function hitTest(mx, my) {
    for (let i = state.layout.length - 1; i >= 0; i--) {
      const c = state.layout[i];
      if (mx >= c.x && mx <= c.x + c.w && my >= c.y && my <= c.y + c.h) return c;
    }
    return null;
  }

  function renderCrumbs() {
    el.crumbs.innerHTML = "";
    state.stack.forEach((node, idx) => {
      if (idx > 0) {
        const sep = document.createElement("span");
        sep.className = "crumb-sep";
        sep.textContent = "/";
        el.crumbs.appendChild(sep);
      }
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "crumb" + (idx === state.stack.length - 1 ? " current" : "");
      btn.textContent = node.name || "racine";
      if (idx < state.stack.length - 1) {
        btn.addEventListener("click", () => {
          state.stack = state.stack.slice(0, idx + 1);
          state.selected = null;
          refreshView();
        });
      }
      el.crumbs.appendChild(btn);
    });
  }

  function renderTop() {
    const node = currentNode();
    el.topList.innerHTML = "";
    if (!node) {
      el.sideSub.textContent = "Aucun niveau";
      el.btnOpen.disabled = true;
      return;
    }
    el.sideSub.textContent = node.path || node.name;
    const kids =
      node.children && node.children.length
        ? [...node.children].sort((a, b) => b.size - a.size).slice(0, DM_TOP_N)
        : [node];
    const max = kids[0] ? kids[0].size : 1;
    kids.forEach((k) => {
      const li = document.createElement("li");
      if (state.selected === k) li.classList.add("active");
      li.innerHTML =
        `<span class="name" title="${esc(k.path || k.name)}"></span>` +
        `<span class="size"></span>` +
        `<span class="bar"><i style="width:${Math.max(4, (k.size / max) * 100)}%"></i></span>`;
      li.querySelector(".name").textContent = k.name;
      li.querySelector(".size").textContent = fmtBytes(k.size);
      li.addEventListener("click", () => selectNode(k));
      li.addEventListener("dblclick", () => drillInto(k));
      el.topList.appendChild(li);
    });
    const openTarget = state.selected || node;
    el.btnOpen.disabled = !openTarget || !openTarget.path || isOthersBucket(openTarget.name);
  }

  function refreshView() {
    el.mapHint.classList.toggle("hidden", !!state.root);
    renderCrumbs();
    renderTop();
    state.layoutKey = "";
    draw(true);
  }

  function setScanning(on) {
    state.scanning = on;
    el.btnAnalyze.disabled = on;
    el.btnCancel.disabled = !on;
    el.btnPick.disabled = on;
    el.driveSelect.disabled = on;
  }

  async function loadDrives() {
    try {
      const res = unwrapData(await api.list_drives());
      const drives = res?.drives || [];
      el.driveSelect.innerHTML = "";
      drives.forEach((d) => {
        const opt = document.createElement("option");
        opt.value = d.path;
        opt.textContent = `${d.label || d.path}  ·  libre ${d.freeLabel || "—"} / ${d.totalLabel || "—"}`;
        el.driveSelect.appendChild(opt);
      });
      if (!drives.length) {
        const opt = document.createElement("option");
        opt.value = "";
        opt.textContent = "Aucun lecteur";
        el.driveSelect.appendChild(opt);
      }
      state.scanPath = el.driveSelect.value || null;
      setStatus("Choisissez un lecteur ou un dossier, puis lancez l'analyse.");
    } catch (err) {
      setStatus(String(err.message || err), "error");
    }
  }

  async function loadResult() {
    const result = unwrapData(await api.get_scan_result());
    if (!result?.ok) {
      setStatus(result?.error || "Pas de résultat", "error");
      return;
    }
    const root = result.root;
    if (!root) {
      setStatus("Résultat sans arbre", "error");
      return;
    }
    state.root = root;
    state.scanPath = result.scanPath || state.scanPath;
    state.stack = [root];
    state.selected = null;
    el.stFree.textContent = result.freeLabel || "—";
    el.stUsed.textContent = result.usedLabel || "—";
    el.stScanned.textContent = result.scannedLabel || "—";
    setStatus(
      `Analyse terminée · ${result.scannedLabel || "—"} · ${result.filesSeen || 0} éléments`,
      "ok"
    );
    refreshView();
    if (setProgress) setTimeout(() => setProgress(0, ""), 600);
  }

  async function startAnalyze() {
    const path = state.scanPath || el.driveSelect.value;
    if (!path) return setStatus("Sélectionnez un lecteur ou un dossier.", "error");
    state.scanPath = path;
    state.cancelled = false;
    state.root = null;
    state.stack = [];
    state.selected = null;
    state.layout = [];
    state.layoutKey = "";
    el.stFree.textContent = "—";
    el.stUsed.textContent = "—";
    el.stScanned.textContent = "—";
    el.mapHint.classList.remove("hidden");
    el.mapHint.textContent = "Analyse en cours…";
    el.topList.innerHTML = "";
    el.crumbs.innerHTML = "";
    el.sideSub.textContent = "Analyse en cours…";
    el.btnOpen.disabled = true;
    setScanning(true);
    setStatus("Démarrage de l'analyse…");
    try {
      const start = unwrapData(await api.start_scan(path));
      if (!start?.ok) {
        setScanning(false);
        el.mapHint.textContent = "Le treemap apparaîtra ici après l'analyse.";
        return setStatus(start?.error || "Échec démarrage", "error");
      }
      const prog = await pollDm(() => api.get_scan_progress(), setStatus, setProgress);
      setScanning(false);
      if (prog?.error === "Annulé" || prog?.error === "Cancelled" || state.cancelled) {
        el.mapHint.textContent = "Le treemap apparaîtra ici après l'analyse.";
        setStatus("Analyse annulée.", "error");
        if (setProgress) setTimeout(() => setProgress(0, ""), 400);
        return;
      }
      if (prog?.error && !prog?.ok) {
        el.mapHint.textContent = "Le treemap apparaîtra ici après l'analyse.";
        setStatus(prog.error, "error");
        if (setProgress) setTimeout(() => setProgress(0, ""), 400);
        return;
      }
      await loadResult();
    } catch (err) {
      setScanning(false);
      el.mapHint.textContent = "Le treemap apparaîtra ici après l'analyse.";
      setStatus(String(err.message || err), "error");
    }
  }

  el.btnAnalyze.addEventListener("click", startAnalyze);
  el.btnCancel.addEventListener("click", async () => {
    if (!state.scanning) return;
    state.cancelled = true;
    el.btnCancel.disabled = true;
    setStatus("Annulation demandée…");
    try {
      await api.cancel_scan();
    } catch (_) {}
  });
  el.btnPick.addEventListener("click", async () => {
    setStatus("Ouverture du sélecteur de dossier…");
    try {
      const res = unwrapData(await api.pick_folder());
      if (res?.ok === false) {
        return setStatus(res.error || "Sélection annulée", "error");
      }
      const path = res?.path || null;
      if (!path) return setStatus("Aucun dossier choisi.");
      state.scanPath = path;
      let found = false;
      for (const opt of el.driveSelect.options) {
        if (opt.value === path) {
          found = true;
          el.driveSelect.value = path;
          break;
        }
      }
      if (!found) {
        const opt = document.createElement("option");
        opt.value = path;
        opt.textContent = path;
        el.driveSelect.appendChild(opt);
        el.driveSelect.value = path;
      }
      setStatus("Dossier choisi : " + path, "ok");
    } catch (e) {
      setStatus("Sélecteur indisponible : " + String(e.message || e), "error");
    }
  });
  el.driveSelect.addEventListener("change", () => {
    state.scanPath = el.driveSelect.value;
  });
  el.btnOpen.addEventListener("click", async () => {
    const target = state.selected || currentNode();
    if (!target || !target.path) return;
    try {
      const res = unwrapData(await api.open_path(target.path));
      if (!res?.ok) setStatus(res?.error || "Ouverture impossible", "error");
    } catch (err) {
      setStatus(String(err.message || err), "error");
    }
  });

  el.canvas.addEventListener("mousemove", (ev) => {
    const rect = el.canvas.getBoundingClientRect();
    const hit = hitTest(ev.clientX - rect.left, ev.clientY - rect.top);
    const node = hit ? hit.node : null;
    if (node !== state.hover) {
      state.hover = node;
      schedulePaint();
      el.canvas.title = node ? `${node.name} — ${fmtBytes(node.size)}` : "";
    }
  });
  el.canvas.addEventListener("mouseleave", () => {
    state.hover = null;
    schedulePaint();
  });
  el.canvas.addEventListener("click", (ev) => {
    const rect = el.canvas.getBoundingClientRect();
    const hit = hitTest(ev.clientX - rect.left, ev.clientY - rect.top);
    if (!hit) return;
    selectNode(hit.node);
  });
  el.canvas.addEventListener("dblclick", (ev) => {
    const rect = el.canvas.getBoundingClientRect();
    const hit = hitTest(ev.clientX - rect.left, ev.clientY - rect.top);
    if (!hit) return;
    drillInto(hit.node);
  });
  el.canvas.addEventListener("contextmenu", (ev) => {
    ev.preventDefault();
    goUp();
  });

  const onResize = () => {
    if (state.root) {
      state.layoutKey = "";
      draw(true);
    }
  };
  window.addEventListener("resize", onResize);
  roCleanups.push(() => window.removeEventListener("resize", onResize));

  if (typeof ResizeObserver !== "undefined") {
    const ro = new ResizeObserver(() => onResize());
    ro.observe(el.canvas.parentElement);
    roCleanups.push(() => ro.disconnect());
  }

  body._dmCleanup = () => {
    roCleanups.forEach((fn) => {
      try {
        fn();
      } catch (_) {}
    });
  };

  await loadDrives();
  requestAnimationFrame(() => draw(true));
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
    try {
      const res = unwrapData(await api.pick_folder());
      if (res?.ok === false) return setStatus(apiErr(res, "pick_folder"), "error");
      const path = res?.path || null;
      if (path) document.getElementById("lgRoot").value = path;
      else setStatus("Aucun dossier choisi.");
    } catch (e) {
      setStatus(String(e.message || e), "error");
    }
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
    const prep = await api.prepare_delete_large_file(path);
    if (!prep?.ok) return setStatus(prep?.error || "Refusé", "error");
    const r = await api.delete_large_file(path, prep.token);
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
    try {
      const res = unwrapData(await api.pick_folder());
      if (res?.ok === false) return setStatus(apiErr(res, "pick_folder"), "error");
      const path = res?.path || null;
      if (path) document.getElementById("emRoot").value = path;
      else setStatus("Aucun dossier choisi.");
    } catch (e) {
      setStatus(String(e.message || e), "error");
    }
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
    const prep = await api.prepare_delete_empty_folder(path);
    if (!prep?.ok) return setStatus(prep?.error || "Refusé", "error");
    const r = await api.delete_empty_folder(path, prep.token);
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
    try {
      const res = unwrapData(await api.pick_folder());
      if (res?.ok === false) return setStatus(apiErr(res, "pick_folder"), "error");
      const path = res?.path || null;
      if (path) document.getElementById("duRoot").value = path;
      else setStatus("Aucun dossier choisi.");
    } catch (e) {
      setStatus(String(e.message || e), "error");
    }
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
