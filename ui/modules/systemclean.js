/**
 * Copyright (c) 2026 Mr-Aurevo-X. All rights reserved.
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 * Author: Mr-Aurevo-X | https://github.com/Mr-Aurevo-X
 */
/**
 * SystemClean — native in-hub (WinCleaner), no iframe.
 * Bridge: pywebview.api.systemclean.wincleaner.*
 * DiskMap is a separate sidebar module (modules/diskmap.js).
 */
import { mountModuleShell, waitNs, esc, pollUntil } from "./_in_hub.js";
import { t } from "../i18n.js";

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

function traceCatFallback() {
  return {
    Recent: { label: t("scTraceRecent"), description: t("scTraceRecentDesc") },
    JumpLists: { label: t("scTraceJumpLists"), description: t("scTraceJumpListsDesc") },
    ExplorerHistory: { label: t("scTraceExplorerHistory"), description: t("scTraceExplorerHistoryDesc") },
    Thumbnails: { label: t("scTraceThumbnails"), description: t("scTraceThumbnailsDesc") },
    Prefetch: { label: t("scTracePrefetch"), description: t("scTracePrefetchDesc") },
    ClipboardHistory: { label: t("scTraceClipboardHistory"), description: t("scTraceClipboardHistoryDesc") },
    Screenshots: { label: t("scTraceScreenshots"), description: t("scTraceScreenshotsDesc") },
  };
}

async function wcApi() {
  return waitNs("systemclean.wincleaner", "prepare_action");
}


/** Surface real backend / bridge errors (never swallow empty messages). */
function apiErr(res, fallback) {
  const fb = fallback || t("commonFailed");
  if (res == null) return `${fb} (${t("commonEmptyResponse")})`;
  if (typeof res === "string") return res;
  const nested = res.data && typeof res.data === "object" ? res.data : null;
  return (
    res.error ||
    nested?.error ||
    res.message ||
    nested?.message ||
    (res.ok === false ? fb : null) ||
    fb
  );
}

async function runSync(api, action, payload = {}) {
  if (!api || typeof api.run !== "function") {
    throw new Error(t("scRunApiUnavailable"));
  }
  let res;
  try {
    res = await api.run(action, payload || {});
  } catch (e) {
    throw new Error(String(e?.message || e) || "Exception " + action);
  }
  if (!res || res.ok === false) {
    throw new Error(apiErr(res, `${t("commonFailed")} ${action}`));
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
  if (before) parts.push(t("scBeforeEstimated", { value: before }));
  if (freed) parts.push(t("scFreed", { value: freed }));
  if (delta) {
    let deltaText = "";
    if (typeof delta === "object") {
      const rows = delta.Rows || delta.rows || [];
      if (Array.isArray(rows) && rows.length) {
        deltaText = rows
          .map((r) => `${r.Name || r.name || "?"}: ${r.DeltaText || r.deltaText || ""}`)
          .filter(Boolean)
          .join(" · ");
      } else {
        deltaText = delta.Text || delta.text || "";
      }
    } else {
      deltaText = String(delta);
    }
    if (deltaText) parts.push(t("scDiskDelta", { value: deltaText }));
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
    return { ok: false, error: t("scStartApiUnavailable") };
  }
  if (confirmMsg) {
    const ok = await askConfirm(confirmMsg, t("commonConfirmAction"));
    if (!ok) return { ok: false, error: t("commonCancelled") };
  }
  const pl = stablePayload(payload);
  let prep;
  try {
    prep = await api.prepare_action(action, pl);
  } catch (e) {
    return { ok: false, error: "prepare_action: " + String(e?.message || e) };
  }
  if (!prep || !prep.ok || !prep.token) {
    return { ok: false, error: apiErr(prep, t("scConfirmRefused")) };
  }
  let started;
  try {
    started = await api.start_action(action, pl, prep.token);
  } catch (e) {
    return { ok: false, error: "start_action: " + String(e?.message || e) };
  }
  if (!started || !started.ok) {
    return { ok: false, error: apiErr(started, t("scStartRefused")) };
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
    return { ok: false, error: t("scJobTimeout") };
  }
  if (progress?.error && (progress.done || progress.ok === false)) {
    return { ok: false, error: apiErr(progress, t("scJobFailed")) };
  }
  let result;
  try {
    result = await api.get_action_result();
  } catch (e) {
    return { ok: false, error: "get_action_result: " + String(e?.message || e) };
  }
  if (!result || result.ok === false) {
    return { ok: false, error: apiErr(result, t("commonNoResult")), data: result?.data };
  }
  return result;
}

function fmtBytes(n) {
  const b = Number(n) || 0;
  if (b < 1024) return `${b} ${t("unitBytes")}`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(0)} ${t("unitKB")}`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} ${t("unitMB")}`;
  return `${(b / 1024 ** 3).toFixed(2)} ${t("unitGB")}`;
}


/** True while this segment mount is still the active panel. */
function makeAlive(body, gen) {
  return () => body.isConnected && body._scGen === gen;
}

/** Body-scoped #id lookup; null if panel unmounted / superseded. */
function scEl(body, id, alive) {
  if (typeof alive === "function" && !alive()) return null;
  if (!body || !body.isConnected) return null;
  return body.querySelector("#" + id);
}

export async function mount(root) {
  const ctx = mountModuleShell(root, {
    title: t("scTitle"),
    subtitle: t("scSubtitle"),
    segments: [
      { id: "wc-health", label: t("scSegHealth") },
      { id: "wc-clean", label: t("scSegClean") },
      { id: "wc-traces", label: t("scSegTraces") },
      { id: "wc-debloat", label: t("scSegDebloat") },
      { id: "wc-uninstall", label: t("scSegUninstall") },
      { id: "wc-opt", label: t("scSegOpt") },
      { id: "wc-sessions", label: t("scSegSessions") },
      { id: "wc-excl", label: t("scSegExcl") },
      { id: "wc-tools", label: t("scSegTools") },
    ],
    onSegment: (id, body) => renderSegment(id, body, ctx),
  });

  await ctx.setSegment("wc-health");
}

async function renderSegment(id, body, ctx) {
  const { setStatus, askConfirm, setProgress } = ctx;
  const gen = (body._scGen = (body._scGen || 0) + 1);
  const alive = makeAlive(body, gen);
  body.innerHTML = `<div class="empty-state">${t("scLoading")}</div>`;

  try {
    const api = await wcApi();
    if (!alive()) return;
    if (!api) {
      setStatus(t("scApiUnavailable"), "error");
      body.innerHTML = `<div class="empty-state">${t("commonBridgeUnavailable")}</div>`;
      return;
    }
    if (id === "wc-health") return mountHealth(body, api, setStatus, askConfirm, alive);
    if (id === "wc-clean") return mountClean(body, api, setStatus, askConfirm, setProgress, alive);
    if (id === "wc-traces") return mountTraces(body, api, setStatus, askConfirm, setProgress, alive);
    if (id === "wc-debloat") return mountDebloat(body, api, setStatus, askConfirm, setProgress, alive);
    if (id === "wc-uninstall") return mountUninstall(body, api, setStatus, askConfirm, setProgress, alive);
    if (id === "wc-opt") return mountOpt(body, api, setStatus, askConfirm, setProgress, alive);
    if (id === "wc-sessions") return mountSessions(body, api, setStatus, alive);
    if (id === "wc-excl") return mountExclusions(body, api, setStatus, askConfirm, alive);
    if (id === "wc-tools") return mountTools(body, api, setStatus, askConfirm, alive);
  } catch (e) {
    if (!alive()) return;
    const msg = String(e.message || e);
    if (/Cannot set properties of null/i.test(msg)) return;
    setStatus(msg, "error");
    body.innerHTML = `<div class="empty-state">${esc(msg)}</div>`;
  }
}

/* ── WinCleaner panels ───────────────────────────────────────────────────── */

async function mountHealth(body, api, setStatus, askConfirm) {
  body.innerHTML = `
    <div class="hub-inhub-scroll">
      <div class="card-grid" id="hcCards">
        <div class="card"><span class="label">${t("scHealthState")}</span><span class="value">…</span></div>
      </div>
      <div class="panel">
        <div class="toolbar-row">
          <strong>${t("scSystemHealth")}</strong>
          <button type="button" class="btn accent" id="hcRefresh" style="margin-left:auto">${t("commonRefresh")}</button>
        </div>
        <pre class="meta" id="hcOut" style="white-space:pre-wrap;margin-top:10px;max-height:280px;overflow:auto"></pre>
      </div>
      <div class="panel">
        <div class="toolbar-row">
          <strong>${t("scTempFolders")}</strong>
          <button type="button" class="btn" id="hcTemp">${t("scMeasure")}</button>
          <button type="button" class="btn danger" id="hcRecycle">${t("scEmptyRecycle")}</button>
          <button type="button" class="btn" id="hcIcons">${t("scIconCache")}</button>
          <button type="button" class="btn" id="hcRecent">${t("scClearRecent")}</button>
        </div>
        <div class="table-wrap" style="max-height:220px;margin-top:10px">
          <table class="data"><thead><tr><th>${t("commonPath")}</th><th>${t("commonSize")}</th></tr></thead><tbody id="hcTempBody"></tbody></table>
        </div>
      </div>
    </div>`;

  async function loadHealth() {
    setStatus(t("scHealthLoading"));
    try {
      const res = await runSync(api, "getHealth", {});
      const data = res.data || res;
      document.getElementById("hcOut").textContent = JSON.stringify(data, null, 2).slice(0, 4000);
      const cards = document.getElementById("hcCards");
      const disks = data.disks || data.Disks || [];
      const disk0 = Array.isArray(disks) && disks.length ? disks[0] : data.disk || data.Disk || {};
      let adminLabel = data.admin === true || data.Admin === true ? t("commonYes") : data.admin === false ? t("commonNo") : "—";
      try {
        if (adminLabel === "—" && typeof api.is_admin === "function") {
          const adm = await api.is_admin();
          adminLabel = adm === true || adm?.admin === true ? t("commonYes") : t("commonNo");
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
        <div class="card"><span class="label">${t("scDiskFree")}</span><span class="value">${esc(
          String(freeLabel)
        )}</span></div>
        <div class="card"><span class="label">${t("scUsed")}</span><span class="value">${esc(
          String(usedLabel || "—")
        )}</span></div>
        <div class="card"><span class="label">${t("scAdmin")}</span><span class="value">${esc(adminLabel)}</span></div>
        <div class="card"><span class="label">${t("scFolder")}</span><span class="value">${esc(
          String(folderHint || "OK")
        )}</span></div>`;
      setStatus(t("scHealthUpdated"), "ok");
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
                    (r.sizeMb != null ? `${r.sizeMb} ${t("unitMB")}` : fmtBytes(r.bytes || r.size || r.Bytes || 0))
                )}</td></tr>`
            )
            .join("")
        : `<tr><td colspan="2" class="empty-state">${t("scNoTempData")}</td></tr>`;
    } catch (e) {
      setStatus(String(e.message || e), "error");
    }
  }

  document.getElementById("hcRefresh").onclick = loadHealth;
  document.getElementById("hcTemp").onclick = loadTemp;
  document.getElementById("hcRecycle").onclick = async () => {
    if (!(await askConfirm(t("scConfirmEmptyRecycle"), t("confirmTitle")))) return;
    const prep = await api.prepare_empty_recycle_bin();
    if (!prep?.ok) return setStatus(prep?.error || t("commonRefused"), "error");
    const r = await api.empty_recycle_bin(prep.token);
    setStatus(r?.ok ? t("scRecycleEmptied") : r?.error || t("commonFailed"), r?.ok ? "ok" : "error");
  };
  document.getElementById("hcIcons").onclick = async () => {
    if (!(await askConfirm(t("scConfirmRebuildIcons"), t("confirmTitle")))) return;
    const prep = await api.prepare_rebuild_icon_cache();
    if (!prep?.ok) return setStatus(prep?.error || t("commonRefused"), "error");
    const r = await api.rebuild_icon_cache(prep.token);
    setStatus(r?.ok ? t("scIconsRebuilt") : r?.error || t("commonFailed"), r?.ok ? "ok" : "error");
  };
  document.getElementById("hcRecent").onclick = async () => {
    if (!(await askConfirm(t("scConfirmClearRecent"), t("confirmTitle")))) return;
    const prep = await api.prepare_clear_recent_files();
    if (!prep?.ok) return setStatus(prep?.error || t("commonRefused"), "error");
    const r = await api.clear_recent_files(prep.token);
    setStatus(r?.ok ? t("scRecentCleared") : r?.error || t("commonFailed"), r?.ok ? "ok" : "error");
  };

  await loadHealth();
  await loadTemp();
}

async function mountClean(body, api, setStatus, askConfirm, setProgress) {
  body.innerHTML = `
    <div class="hub-inhub-scroll">
      <div class="panel">
        <div class="toolbar-row">
          <strong>${t("scCleanCategories")}</strong>
          <button type="button" class="btn" id="clCats">${t("commonLoad")}</button>
          <button type="button" class="btn accent" id="clScan">${t("commonAnalyze")}</button>
          <button type="button" class="btn danger" id="clRun">${t("scSegClean")}</button>
        </div>
        <div class="check-list" id="clList" style="margin-top:12px"></div>
        <p class="meta" id="clMeta" style="margin-top:8px"></p>
      </div>
      <div class="panel">
        <strong>${t("scCleanResult")}</strong>
        <pre class="meta" id="clOut" style="white-space:pre-wrap;margin-top:8px;max-height:260px;overflow:auto"></pre>
        <div class="progress-bar" style="margin-top:10px"><i id="clProg"></i></div>
      </div>
    </div>`;

  let categories = [];

  function selectedIds() {
    return [...body.querySelectorAll("#clList input:checked")].map((el) => el.value);
  }

  async function loadCats() {
    setStatus(t("scCategoriesLoading"));
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
        : `<p class="empty-state">${t("scNoCategory")}</p>`;
      document.getElementById("clMeta").textContent = t("scCategoryCount", { n: categories.length });
      setStatus(t("scCategoriesReady"), "ok");
    } catch (e) {
      setStatus(String(e.message || e), "error");
    }
  }

  document.getElementById("clCats").onclick = loadCats;
  document.getElementById("clScan").onclick = async () => {
    const ids = selectedIds();
    if (!ids.length) return setStatus(t("scSelectCategory"), "error");
    setStatus(t("scAnalyzing"));
    document.getElementById("clProg").style.width = "15%";
    if (setProgress) setProgress(15, t("scAnalysisProgress"));
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
      if (setProgress) setProgress(100, t("scAnalysisDone"));
      setStatus(t("scAnalysisDoneSentence"), "ok");
    } catch (e) {
      setStatus(String(e.message || e), "error");
    } finally {
      if (setProgress) setTimeout(() => setProgress(0, ""), 800);
    }
  };
  document.getElementById("clRun").onclick = async () => {
    const ids = selectedIds();
    if (!ids.length) return setStatus(t("scSelectCategory"), "error");
    setStatus(t("scCleaning"));
    document.getElementById("clProg").style.width = "10%";
    const res = await runJob(
      api,
      "runClean",
      { ids },
      askConfirm,
      t("scConfirmCleanCats", { n: ids.length }),
      (pct, label) => {
        document.getElementById("clProg").style.width = (pct || 0) + "%";
        if (setProgress) setProgress(pct, label);
      }
    );
    document.getElementById("clProg").style.width = "100%";
    if (!res?.ok) return setStatus(res?.error || t("commonFailed"), "error");
    const data = res.data || res;
    const summary = summarizeClean(data);
    document.getElementById("clOut").textContent =
      (summary ? summary + "\n\n" : "") + JSON.stringify(data, null, 2).slice(0, 4000);
    setStatus(summary ? summary.split("\n")[0] : t("scCleanDone"), "ok");
    if (setProgress) setTimeout(() => setProgress(0, ""), 800);
  };

  await loadCats();
}

async function mountTraces(body, api, setStatus, askConfirm, setProgress) {
  body.innerHTML = `
    <div class="hub-inhub-scroll">
      <div class="guard-banner" id="trGuard">
        ${t("scTracesBanner")}
      </div>
      <div class="dm-stats" id="trStats" style="margin-bottom:10px">
        <div class="stat"><span class="label">${t("scCategories")}</span><span class="value" id="stTraceCats">—</span></div>
        <div class="stat"><span class="label">${t("scSelection")}</span><span class="value" id="stTraceSel">0</span></div>
        <div class="stat"><span class="label">${t("scItems")}</span><span class="value" id="stTraceItems">—</span></div>
      </div>
      <div class="panel">
        <div class="toolbar-row">
          <strong>${t("scTraceCategories")}</strong>
          <button type="button" class="btn accent" id="trScan" style="margin-left:auto">${t("scList")}</button>
          <button type="button" class="btn danger" id="trClear">${t("scClearSelection")}</button>
        </div>
        <div class="check-list" id="trCats" style="margin-top:10px"></div>
        <p class="meta" id="trMeta" style="margin-top:8px"></p>
      </div>
      <div class="panel flex-fill" style="min-height:220px">
        <strong>${t("scListedContent")}</strong>
        <div id="trResult" class="traces-result" style="margin-top:10px">
          <p class="meta">${t("scTraceStartHint")}</p>
        </div>
      </div>
    </div>`;

  const catsEl = document.getElementById("trCats");
  const resultEl = document.getElementById("trResult");
  const scanBtn = document.getElementById("trScan");
  const clearBtn = document.getElementById("trClear");

  function setTraceBusy(busy) {
    if (scanBtn) scanBtn.disabled = !!busy;
    if (clearBtn) clearBtn.disabled = !!busy;
  }

  function showTraceSkeleton() {
    resultEl.innerHTML = `<div aria-busy="true">
      <div class="hub-skel" style="height:14px;margin:8px 0"></div>
      <div class="hub-skel" style="height:14px;margin:8px 0;width:86%"></div>
      <div class="hub-skel" style="height:14px;margin:8px 0;width:72%"></div>
    </div>`;
  }

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
      const fallback = traceCatFallback();
      const fb = fallback[id] || { label: id, description: "" };
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
      ? t("scTraceMetaSized", { n: total, size: data.totalText })
      : t("scTraceMeta", { n: total });

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
      resultEl.innerHTML = `<p class="meta">${t("scNoTraceSelection")}</p>`;
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
            ? `<li class="meta">${t("scShownOf", { shown: items.length, total: count })}</li>`
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
      setStatus(t("scSelectTraceCategory"), "error");
      return;
    }
    setStatus(t("scTracesListing"));
    if (setProgress) setProgress(15, t("scTracesProgress"));
    setTraceBusy(true);
    showTraceSkeleton();
    try {
      const res = await runSync(api, "listTraces", { ids });
      const data = res.data != null ? res.data : res;
      renderTraceGroups(data || {});
      setStatus(t("scTracesListed"), "ok");
    } catch (e) {
      setStatus(String(e.message || e), "error");
    } finally {
      setTraceBusy(false);
      if (setProgress) setTimeout(() => setProgress(0, ""), 500);
    }
  }

  document.getElementById("trScan").onclick = listTraces;

  document.getElementById("trClear").onclick = async () => {
    const ids = selectedTraceIds();
    if (!ids.length) {
      setStatus(t("scSelectTraceCategory"), "error");
      return;
    }
    const ok = await askConfirm(
      t("scConfirmClearTraces", { n: ids.length }),
      t("scClearTracesTitle")
    );
    if (!ok) return;
    if (ids.includes("Screenshots")) {
      const strong = await askConfirm(
        t("scConfirmScreenshots"),
        t("scConfirmScreenshotsTitle")
      );
      if (!strong) return;
    }
    setTraceBusy(true);
    try {
      const res = await runJob(
        api,
        "runClean",
        { ids, TracesOnly: true },
        null,
        null,
        setProgress
      );
      if (!res?.ok) {
        setStatus(res?.error || t("commonFailed"), "error");
        if (setProgress) setTimeout(() => setProgress(0, ""), 600);
        return;
      }
      const data = res.data || res;
      const freed =
        data.FreedText || data.freedText || (data.FreedBytes != null ? fmtBytes(data.FreedBytes) : "");
      setStatus(freed ? t("scTracesClearedFreed", { freed }) : t("scTracesCleared"), "ok");
      if (setProgress) setTimeout(() => setProgress(0, ""), 600);
    } finally {
      setTraceBusy(false);
    }
    await listTraces();
  };

  await ensureCats();
}

async function mountDebloat(body, api, setStatus, askConfirm, setProgress) {
  body.innerHTML = `
    <div class="hub-inhub-scroll">
      <div class="panel">
        <div class="toolbar-row">
          <strong>${t("scBloatApps")}</strong>
          <button type="button" class="btn accent" id="dbScan">${t("commonScan")}</button>
          <button type="button" class="btn danger" id="dbRemove">${t("scRemoveSelection")}</button>
        </div>
        <div class="check-list" id="dbList" style="margin-top:12px"></div>
        <p class="meta" id="dbMeta"></p>
      </div>
    </div>`;

  document.getElementById("dbScan").onclick = async () => {
    setStatus(t("scBloatScan"));
    if (setProgress) setProgress(20, t("scBloatScan"));
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
        : `<p class="empty-state">${t("scNoBloatApps")}</p>`;
      document.getElementById("dbMeta").textContent = t("scBloatAppCount", { n: apps.length });
      setStatus(apps.length ? t("scBloatScanOk") : t("scBloatScanEmpty"), apps.length ? "ok" : "");
    } catch (e) {
      setStatus(String(e.message || e), "error");
    } finally {
      if (setProgress) setProgress(0, "");
    }
  };

  document.getElementById("dbRemove").onclick = async () => {
    const names = [...body.querySelectorAll("#dbList input:checked")].map((el) => el.value).filter(Boolean);
    if (!names.length) return setStatus(t("scNoBloatSelected"), "error");
    const res = await runJob(
      api,
      "removeBloat",
      { names },
      askConfirm,
      t("scConfirmRemoveBloat", { n: names.length }),
      setProgress
    );
    setStatus(res?.ok ? t("scDebloatDone") : res?.error || t("commonFailed"), res?.ok ? "ok" : "error");
    if (res?.ok) document.getElementById("dbScan").click();
    if (setProgress) setTimeout(() => setProgress(0, ""), 600);
  };
}

async function mountUninstall(body, api, setStatus, askConfirm, setProgress) {
  body.innerHTML = `
    <div class="hub-inhub-scroll">
      <div class="panel">
        <div class="toolbar-row">
          <div class="search-wrap"><input type="search" id="unQ" placeholder="${esc(t("scProgramKeywordPh"))}" /></div>
          <button type="button" class="btn accent" id="unFind">${t("commonSearch")}</button>
          <button type="button" class="btn danger" id="unOff">${t("scOfficialUninstall")}</button>
          <button type="button" class="btn" id="unPurge">${t("scPurgeLeftovers")}</button>
        </div>
        <p class="meta" id="unMeta"></p>
      </div>
      <div class="panel flex-fill" style="padding:0;min-height:200px">
        <div class="table-wrap">
          <table class="data"><thead><tr><th></th><th>${t("commonName")}</th><th>${t("commonDetail")}</th></tr></thead><tbody id="unBody"></tbody></table>
        </div>
      </div>
    </div>`;

  let last = { apps: [], leftovers: [] };

  document.getElementById("unFind").onclick = async () => {
    const keyword = document.getElementById("unQ").value.trim();
    if (!keyword) return setStatus(t("scKeywordRequired"), "error");
    setStatus(t("commonSearching"));
    try {
      const res = await runSync(api, "findPurge", { keyword });
      const data = res.data || res;
      last = { apps: data.apps || [], leftovers: data.leftovers || [] };
      const rows = [
        ...last.apps.map((a) => ({ kind: "app", name: a.Name || a.name, detail: a.Publisher || a.Version || "" })),
        ...last.leftovers.map((p) => ({ kind: "path", name: typeof p === "string" ? p : p.path || "", detail: t("scLeftover") })),
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
        : `<tr><td colspan="3" class="empty-state">${t("commonNoResult")}</td></tr>`;
      document.getElementById("unMeta").textContent = t("scUninstallMeta", { apps: last.apps.length, leftovers: last.leftovers.length });
      setStatus(t("commonSearchOk"), "ok");
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
      t("scConfirmOfficialUninstall", { keyword }),
      setProgress
    );
    setStatus(res?.ok ? t("scUninstallStarted") : res?.error || t("commonFailed"), res?.ok ? "ok" : "error");
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
      t("scConfirmPurgeLeftovers", { keyword }),
      setProgress
    );
    setStatus(res?.ok ? t("scPurgeDone") : res?.error || t("commonFailed"), res?.ok ? "ok" : "error");
    if (setProgress) setTimeout(() => setProgress(0, ""), 600);
  };
}

async function mountOpt(body, api, setStatus, askConfirm, setProgress) {
  body.innerHTML = `
    <div class="hub-inhub-scroll">
      <div class="panel">
        <p class="meta" style="margin-bottom:10px">
          ${t("scOptimIntro")}
        </p>
        <div class="check-list" id="opFlags" style="margin-bottom:12px">
          <label><input type="checkbox" id="opPrivacy" checked /> Privacy tweaks</label>
          <label><input type="checkbox" id="opTasks" checked /> ${t("scOptTasks")}</label>
          <label><input type="checkbox" id="opServices" checked /> ${t("scOptServices")}</label>
          <label><input type="checkbox" id="opFeatures" checked /> ${t("scOptFeatures")}</label>
          <label><input type="checkbox" id="opComponent" checked /> ${t("scOptComponents")}</label>
        </div>
        <div class="toolbar-row" style="flex-wrap:wrap">
          <button type="button" class="btn accent" id="opRun">${t("scRunWindowsOptim")}</button>
          <button type="button" class="btn" id="opSfc">SFC /scannow</button>
          <button type="button" class="btn" id="opDism">DISM RestoreHealth</button>
          <button type="button" class="btn" id="opWinsxs">${t("scWinSxSAnalyze")}</button>
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
    document.getElementById("opOut").textContent = detail + "\n\n" + t("scStarting");
    document.getElementById("opProg").style.width = "12%";
    const res = await runJob(api, action, payload || {}, askConfirm, `${msg} ${t("commonContinue")}`, (pct, label) => {
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
      (res?.ok === false ? t("commonError", { err: res.error || "?" }) : JSON.stringify(data, null, 2).slice(0, 6000));
    setStatus(res?.ok ? t("commonDone") : res?.error || t("commonFailed"), res?.ok ? "ok" : "error");
    if (setProgress) setTimeout(() => setProgress(0, ""), 800);
  }

  document.getElementById("opRun").onclick = () => {
    const pl = optPayload();
    if (!pl.privacy && !pl.tasks && !pl.services && !pl.features && !pl.componentCleanup) {
      return setStatus(t("scPickOptimization"), "error");
    }
    job(
      "runOptimizations",
      t("scConfirmRunOptim"),
      t("scActionRunOptim", { payload: JSON.stringify(pl) }),
      pl
    );
  };
  document.getElementById("opSfc").onclick = () =>
    job("sfcScan", t("scConfirmSfc"), t("scActionSfc"), {});
  document.getElementById("opDism").onclick = () =>
    job("dismRestoreHealth", t("scConfirmDism"), t("scActionDism"), {});
  document.getElementById("opWinsxs").onclick = () =>
    job("analyzeWinSxS", t("scConfirmWinsxs"), t("scActionWinsxs"), {});
}

async function mountSessions(body, api, setStatus) {
  body.innerHTML = `
    <div class="hub-inhub-scroll">
      <div class="panel">
        <div class="toolbar-row">
          <strong>${t("scSessionsTitle")}</strong>
          <button type="button" class="btn accent" id="seRefresh" style="margin-left:auto">${t("commonRefresh")}</button>
          <button type="button" class="btn" id="seExport">${t("scExportReport")}</button>
        </div>
        <pre class="meta" id="seOut" style="white-space:pre-wrap;margin-top:10px;max-height:400px;overflow:auto"></pre>
      </div>
    </div>`;

  document.getElementById("seRefresh").onclick = async () => {
    setStatus(t("scSessionsLoading"));
    try {
      const res = await runSync(api, "getSessions", {});
      document.getElementById("seOut").textContent = JSON.stringify(res.data || res, null, 2).slice(0, 8000);
      setStatus(t("scSessionsLoaded"), "ok");
    } catch (e) {
      setStatus(String(e.message || e), "error");
    }
  };
  document.getElementById("seExport").onclick = async () => {
    try {
      const res = await runSync(api, "exportReport", {});
      document.getElementById("seOut").textContent = JSON.stringify(res.data || res, null, 2).slice(0, 8000);
      setStatus(t("scReportExported"), "ok");
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
          <strong>${t("scExclusions")}</strong>
          <button type="button" class="btn" id="exLoad">${t("commonLoad")}</button>
          <button type="button" class="btn accent" id="exSave">${t("commonSave")}</button>
        </div>
        <textarea id="exArea" style="width:100%;min-height:220px;margin-top:10px;border-radius:12px;border:1px solid var(--border);background:var(--bg1);color:var(--text);padding:12px;font:inherit;font-size:0.85rem"></textarea>
        <p class="meta">${t("scOneExclusionLine")}</p>
      </div>
    </div>`;

  document.getElementById("exLoad").onclick = async () => {
    try {
      const res = await runSync(api, "getExclusions", {});
      const data = res.data || res;
      const list = data.exclusions || data.paths || data.items || [];
      document.getElementById("exArea").value = (Array.isArray(list) ? list : []).join("\n");
      setStatus(t("scExclusionsLoaded"), "ok");
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
      t("scConfirmSaveExclusions", { n: paths.length })
    );
    setStatus(res?.ok ? t("scExclusionsSaved") : res?.error || t("commonFailed"), res?.ok ? "ok" : "error");
  };
  document.getElementById("exLoad").click();
}

async function mountTools(body, api, setStatus, askConfirm) {
  body.innerHTML = `
    <div class="hub-inhub-scroll">
      <div class="panel">
        <div class="toolbar-row" style="flex-wrap:wrap">
          <button type="button" class="btn accent" id="tlRestore">${t("scCreateRestorePoint")}</button>
          <button type="button" class="btn" id="tlStartup">${t("scListStartup")}</button>
          <button type="button" class="btn" id="tlHub">${t("scHubStatus")}</button>
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
      t("scConfirmCreateRestorePoint")
    );
    document.getElementById("tlOut").textContent = JSON.stringify(res, null, 2);
    setStatus(res?.ok ? t("scRestorePointCreated") : res?.error || t("commonFailed"), res?.ok ? "ok" : "error");
  };
  document.getElementById("tlStartup").onclick = async () => {
    try {
      const res = await runSync(api, "getStartup", {});
      document.getElementById("tlOut").textContent = JSON.stringify(res.data || res, null, 2).slice(0, 8000);
      setStatus(t("scStartupListed"), "ok");
    } catch (e) {
      setStatus(String(e.message || e), "error");
    }
  };
  document.getElementById("tlHub").onclick = async () => {
    try {
      const res = await api.hub_module_status();
      document.getElementById("tlOut").textContent = JSON.stringify(res, null, 2);
      setStatus(t("scHubStatusOk"), "ok");
    } catch (e) {
      setStatus(String(e.message || e), "error");
    }
  };
}
