/**
 * Copyright (c) 2026 Mr-Aurevo-X. All rights reserved.
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 * Author: Mr-Aurevo-X | https://github.com/Mr-Aurevo-X
 */
/**
 * DiskMap — native in-hub (treemap, search, large/empty/dupes, disks).
 * Bridge: pywebview.api.systemclean.diskmap.*
 */
import { mountModuleShell, waitNs, esc, pollUntil, unwrapData } from "./_in_hub.js";
import { t } from "../i18n.js";

async function dmApi() {
  return waitNs("systemclean.diskmap", "list_drives");
}

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

function fmtBytes(n) {
  const b = Number(n) || 0;
  if (b < 1024) return `${b} ${t("unitBytes")}`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(0)} ${t("unitKB")}`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} ${t("unitMB")}`;
  return `${(b / 1024 ** 3).toFixed(2)} ${t("unitGB")}`;
}

function makeAlive(body, gen) {
  return () => body.isConnected && body._scGen === gen;
}

function scEl(body, id, alive) {
  if (typeof alive === "function" && !alive()) return null;
  if (!body || !body.isConnected) return null;
  return body.querySelector("#" + id);
}

export async function mount(root) {
  const ctx = mountModuleShell(root, {
    title: t("dmTitle"),
    subtitle: t("dmSubtitle"),
    segments: [
      { id: "dm-map", label: t("dmSegMap") },
      { id: "dm-search", label: t("dmSegSearch") },
      { id: "dm-large", label: t("dmSegLarge") },
      { id: "dm-empty", label: t("dmSegEmpty") },
      { id: "dm-dupes", label: t("dmSegDupes") },
      { id: "dm-health", label: t("dmSegHealth") },
      { id: "dm-diff", label: t("dmSegDiff") },
    ],
    onSegment: (id, body) => renderSegment(id, body, ctx),
  });

  await ctx.setSegment("dm-map");
}

async function renderSegment(id, body, ctx) {
  const { setStatus, askConfirm, setProgress } = ctx;
  if (typeof body._dmCleanup === "function") {
    try {
      body._dmCleanup();
    } catch (_) {}
    body._dmCleanup = null;
  }
  const gen = (body._scGen = (body._scGen || 0) + 1);
  const alive = makeAlive(body, gen);
  body.innerHTML = `<div class="empty-state">${t("commonLoading")}</div>`;

  try {
    const api = await dmApi();
    if (!alive()) return;
    if (!api) {
      setStatus(t("dmApiUnavailable"), "error");
      body.innerHTML = `<div class="empty-state">${t("commonBridgeUnavailable")}</div>`;
      return;
    }
    if (id === "dm-map") return mountDiskMap(body, api, setStatus, setProgress, alive);
    if (id === "dm-search") return mountDmSearch(body, api, setStatus, setProgress, alive);
    if (id === "dm-large") return mountDmLarge(body, api, setStatus, askConfirm, setProgress, alive);
    if (id === "dm-empty") return mountDmEmpty(body, api, setStatus, askConfirm, setProgress, alive);
    if (id === "dm-dupes") return mountDmDupes(body, api, setStatus, askConfirm, setProgress, alive);
    if (id === "dm-health") return mountDmHealth(body, api, setStatus, alive);
    if (id === "dm-diff") return mountDmDiff(body, api, setStatus, alive);
  } catch (e) {
    if (!alive()) return;
    const msg = String(e.message || e);
    if (/Cannot set properties of null/i.test(msg)) return;
    setStatus(msg, "error");
    body.innerHTML = `<div class="empty-state">${esc(msg)}</div>`;
  }
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
          <strong>${t("dmMapTitleDeep")}</strong>
          <select id="dmDrive" style="min-width:220px"></select>
          <button type="button" class="btn" id="dmPick">${t("dmPickFolder")}</button>
          <button type="button" class="btn accent" id="dmScan">${t("commonAnalyze")}</button>
          <button type="button" class="btn danger" id="dmCancel" disabled>${t("dmCancel")}</button>
        </div>
        <div class="dm-stats">
          <div class="stat"><div class="label">${t("dmFree")}</div><div class="value" id="dmFree">—</div></div>
          <div class="stat"><div class="label">${t("dmUsed")}</div><div class="value" id="dmUsed">—</div></div>
          <div class="stat"><div class="label">${t("dmScanned")}</div><div class="value" id="dmScanned">—</div></div>
        </div>
        <nav class="dm-crumbs" id="dmCrumbs" aria-label="breadcrumb"></nav>
        <p class="dm-nav-hint">${t("dmNavHint")}</p>
      </div>
      <div class="dm-workspace">
        <div class="dm-map-wrap">
          <canvas id="treemap" width="800" height="600" aria-label="Treemap"></canvas>
          <div class="dm-map-hint" id="dmMapHint">${t("dmMapHint")}</div>
        </div>
        <aside class="dm-side">
          <h2>${t("dmTopItems")}</h2>
          <p class="dm-side-sub" id="dmSideSub">${t("dmCurrentLevel")}</p>
          <ul class="dm-top-list" id="dmTopList"></ul>
          <button type="button" class="btn accent full" id="dmOpen" disabled>${t("dmOpenExplorer")}</button>
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
          ? t("dmNoDrawableChild")
          : t("dmEmptyOrInaccessible");
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
      btn.textContent = node.name || t("dmRoot");
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
      el.sideSub.textContent = t("dmNoLevel");
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
        opt.textContent = t("dmDriveOption", { label: d.label || d.path, free: d.freeLabel || "—", total: d.totalLabel || "—" });
        el.driveSelect.appendChild(opt);
      });
      if (!drives.length) {
        const opt = document.createElement("option");
        opt.value = "";
        opt.textContent = t("dmNoDrive");
        el.driveSelect.appendChild(opt);
      }
      state.scanPath = el.driveSelect.value || null;
      setStatus(t("dmChooseDriveHint"));
    } catch (err) {
      setStatus(String(err.message || err), "error");
    }
  }

  async function loadResult() {
    const result = unwrapData(await api.get_scan_result());
    if (!result?.ok) {
      setStatus(result?.error || t("dmNoResult"), "error");
      return;
    }
    const root = result.root;
    if (!root) {
      setStatus(t("dmNoTreeResult"), "error");
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
      t("dmAnalyzeComplete", { scanned: result.scannedLabel || "—", count: result.filesSeen || 0 }),
      "ok"
    );
    refreshView();
    if (setProgress) setTimeout(() => setProgress(0, ""), 600);
  }

  async function startAnalyze() {
    const path = state.scanPath || el.driveSelect.value;
    if (!path) return setStatus(t("commonChooseDriveOrFolder"), "error");
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
    el.mapHint.textContent = t("scAnalyzing");
    el.topList.innerHTML = "";
    el.crumbs.innerHTML = "";
    el.sideSub.textContent = t("scAnalyzing");
    el.btnOpen.disabled = true;
    setScanning(true);
    setStatus(t("dmAnalyzeStarting"));
    try {
      const start = unwrapData(await api.start_scan(path));
      if (!start?.ok) {
        setScanning(false);
        el.mapHint.textContent = t("dmMapHint");
        return setStatus(start?.error || t("dmStartFailed"), "error");
      }
      const prog = await pollDm(() => api.get_scan_progress(), setStatus, setProgress);
      setScanning(false);
      if (prog?.error === "Annulé" || prog?.error === "Cancelled" || state.cancelled) {
        el.mapHint.textContent = t("dmMapHint");
        setStatus(t("dmAnalyzeCancelled"), "error");
        if (setProgress) setTimeout(() => setProgress(0, ""), 400);
        return;
      }
      if (prog?.error && !prog?.ok) {
        el.mapHint.textContent = t("dmMapHint");
        setStatus(prog.error, "error");
        if (setProgress) setTimeout(() => setProgress(0, ""), 400);
        return;
      }
      await loadResult();
    } catch (err) {
      setScanning(false);
      el.mapHint.textContent = t("dmMapHint");
      setStatus(String(err.message || err), "error");
    }
  }

  el.btnAnalyze.addEventListener("click", startAnalyze);
  el.btnCancel.addEventListener("click", async () => {
    if (!state.scanning) return;
    state.cancelled = true;
    el.btnCancel.disabled = true;
    setStatus(t("dmCancelRequested"));
    try {
      await api.cancel_scan();
    } catch (_) {}
  });
  el.btnPick.addEventListener("click", async () => {
    setStatus(t("commonPickerOpening"));
    try {
      const res = unwrapData(await api.pick_folder());
      if (res?.ok === false) {
        return setStatus(res.error || t("dmSelectionCancelled"), "error");
      }
      const path = res?.path || null;
      if (!path) return setStatus(t("commonNoFolderPicked"));
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
      setStatus(t("commonFolderPicked", { path }), "ok");
    } catch (e) {
      setStatus(t("commonPickerUnavailable", { err: String(e.message || e) }), "error");
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
      if (!res?.ok) setStatus(res?.error || t("dmOpenImpossible"), "error");
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
          <div class="search-wrap"><input type="text" id="srRoot" placeholder="${esc(t("dmSearchRootPh"))}" /></div>
          <div class="search-wrap"><input type="search" id="srQ" placeholder="${esc(t("dmQueryPh"))}" /></div>
          <button type="button" class="btn accent" id="srGo">${t("commonSearch")}</button>
        </div>
      </div>
      <div class="panel flex-fill" style="padding:0;min-height:220px">
        <div class="table-wrap"><table class="data"><thead><tr><th>${t("dmFile")}</th><th>${t("commonPath")}</th><th></th></tr></thead><tbody id="srBody"></tbody></table></div>
      </div>
    </div>`;

  document.getElementById("srGo").onclick = async () => {
    const root = document.getElementById("srRoot").value.trim() || "C:\\";
    const query = document.getElementById("srQ").value.trim();
    if (!query) return setStatus(t("dmQueryRequired"), "error");
    setStatus(t("commonSearching"));
    const start = unwrapData(await api.start_search(root, query, {}));
    if (!start?.ok) return setStatus(start?.error || t("commonFailed"), "error");
    const prog = await pollDm(() => api.get_search_progress(), setStatus, setProgress);
    const items = dmFilesFromProgress(prog);
    document.getElementById("srBody").innerHTML = (items || [])
      .slice(0, 400)
      .map(
        (f) =>
          `<tr><td>${esc(f.name || f.Name || "")}</td><td class="wrap">${esc(f.path || f.Path || "")}</td>
          <td><button type="button" class="action-btn" data-open="${esc(f.path || f.Path || "")}">${t("commonOpen")}</button></td></tr>`
      )
      .join("") || `<tr><td colspan="3" class="empty-state">${t("commonNoResult")}</td></tr>`;
    setStatus(t("dmResultsCount", { n: (items || []).length }), "ok");
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
          <div class="search-wrap"><input type="text" id="lgRoot" placeholder="${esc(t("dmLargeRootPh"))}" value="C:\\" /></div>
          <button type="button" class="btn" id="lgPick">${t("dmPickFolder")}</button>
          <input type="number" id="lgMin" value="50" title="${esc(t("dmMinMbTitle"))}" style="width:90px" />
          <button type="button" class="btn accent" id="lgGo">${t("commonScan")}</button>
        </div>
        <p class="meta">${t("dmLargeHint")}</p>
      </div>
      <div class="panel flex-fill" style="padding:0;min-height:220px">
        <div class="table-wrap"><table class="data"><thead><tr><th>${t("dmFile")}</th><th>${t("commonSize")}</th><th></th></tr></thead><tbody id="lgBody"></tbody></table></div>
      </div>
    </div>`;

  document.getElementById("lgPick").onclick = async () => {
    try {
      const res = unwrapData(await api.pick_folder());
      if (res?.ok === false) return setStatus(apiErr(res, "pick_folder"), "error");
      const path = res?.path || null;
      if (path) document.getElementById("lgRoot").value = path;
      else setStatus(t("commonNoFolderPicked"));
    } catch (e) {
      setStatus(String(e.message || e), "error");
    }
  };

  document.getElementById("lgGo").onclick = async () => {
    const root = document.getElementById("lgRoot").value.trim() || "C:\\";
    const minMb = Number(document.getElementById("lgMin").value) || 50;
    setStatus(t("dmScanningLarge"));
    const start = unwrapData(await api.start_scan_large(root, 80, minMb));
    if (!start?.ok) return setStatus(start?.error || t("commonFailed"), "error");
    const prog = await pollDm(() => api.get_large_progress(), setStatus, setProgress);
    if (prog.error) return setStatus(prog.error, "error");
    const files = dmFilesFromProgress(prog);
    document.getElementById("lgBody").innerHTML = (files || [])
      .map(
        (f) =>
          `<tr><td class="wrap">${esc(f.path || f.Path || f.name || "")}</td><td>${esc(
            fmtBytes(f.size || f.Size || 0)
          )}</td>
          <td><button type="button" class="action-btn" data-open="${esc(f.path || f.Path || "")}">${t("commonOpen")}</button>
          <button type="button" class="action-btn danger" data-del="${esc(f.path || f.Path || "")}">${t("commonDelete")}</button></td></tr>`
      )
      .join("") || `<tr><td colspan="3" class="empty-state">${t("commonNoResult")}</td></tr>`;
    setStatus(t("dmFilesCount", { n: (files || []).length }), "ok");
    if (setProgress) setTimeout(() => setProgress(0, ""), 600);
  };

  body.addEventListener("click", async (ev) => {
    const open = ev.target.closest("[data-open]");
    if (open) return api.open_path(open.getAttribute("data-open"));
    const del = ev.target.closest("[data-del]");
    if (!del) return;
    const path = del.getAttribute("data-del");
    if (!(await askConfirm(t("dmConfirmDeletePath", { path })))) return;
    const prep = await api.prepare_delete_large_file(path);
    if (!prep?.ok) return setStatus(prep?.error || t("commonRefused"), "error");
    const r = await api.delete_large_file(path, prep.token);
    setStatus(r?.ok ? t("dmDeleted") : r?.error || t("commonFailed"), r?.ok ? "ok" : "error");
  });
}

async function mountDmEmpty(body, api, setStatus, askConfirm, setProgress) {
  body.innerHTML = `
    <div class="hub-inhub-scroll">
      <div class="panel">
        <div class="toolbar-row">
          <div class="search-wrap"><input type="text" id="emRoot" value="C:\\" /></div>
          <button type="button" class="btn" id="emPick">${t("dmPickFolder")}</button>
          <button type="button" class="btn accent" id="emGo">${t("dmFindEmpty")}</button>
        </div>
      </div>
      <div class="panel flex-fill" style="padding:0;min-height:200px">
        <div class="table-wrap"><table class="data"><thead><tr><th>${t("dmFolder")}</th><th></th></tr></thead><tbody id="emBody"></tbody></table></div>
      </div>
    </div>`;

  document.getElementById("emPick").onclick = async () => {
    try {
      const res = unwrapData(await api.pick_folder());
      if (res?.ok === false) return setStatus(apiErr(res, "pick_folder"), "error");
      const path = res?.path || null;
      if (path) document.getElementById("emRoot").value = path;
      else setStatus(t("commonNoFolderPicked"));
    } catch (e) {
      setStatus(String(e.message || e), "error");
    }
  };

  document.getElementById("emGo").onclick = async () => {
    const root = document.getElementById("emRoot").value.trim() || "C:\\";
    setStatus(t("dmSearchingEmpty"));
    const start = unwrapData(await api.start_find_empty(root));
    if (!start?.ok) return setStatus(start?.error || t("commonFailed"), "error");
    const prog = await pollDm(() => api.get_empty_progress(), setStatus, setProgress);
    if (prog.error) return setStatus(prog.error, "error");
    const folders = dmFilesFromProgress(prog);
    document.getElementById("emBody").innerHTML = (folders || [])
      .map(
        (f) => {
          const p = typeof f === "string" ? f : f.path || f.Path || "";
          return `<tr><td class="wrap">${esc(p)}</td><td>
            <button type="button" class="action-btn" data-open="${esc(p)}">${t("commonOpen")}</button>
            <button type="button" class="action-btn danger" data-del="${esc(p)}">${t("commonDelete")}</button></td></tr>`;
        }
      )
      .join("") || `<tr><td colspan="2" class="empty-state">${t("dmNoEmptyFolder")}</td></tr>`;
    setStatus(t("dmFoldersCount", { n: (folders || []).length }), "ok");
    if (setProgress) setTimeout(() => setProgress(0, ""), 600);
  };

  body.addEventListener("click", async (ev) => {
    const open = ev.target.closest("[data-open]");
    if (open) return api.open_path(open.getAttribute("data-open"));
    const del = ev.target.closest("[data-del]");
    if (!del) return;
    const path = del.getAttribute("data-del");
    if (!(await askConfirm(t("dmConfirmDeleteEmptyFolder", { path })))) return;
    const prep = await api.prepare_delete_empty_folder(path);
    if (!prep?.ok) return setStatus(prep?.error || t("commonRefused"), "error");
    const r = await api.delete_empty_folder(path, prep.token);
    setStatus(r?.ok ? t("dmDeleted") : r?.error || t("commonFailed"), r?.ok ? "ok" : "error");
  });
}

async function mountDmDupes(body, api, setStatus, askConfirm, setProgress) {
  body.innerHTML = `
    <div class="hub-inhub-scroll">
      <div class="panel">
        <div class="toolbar-row">
          <div class="search-wrap"><input type="text" id="duRoot" placeholder="${esc(t("dmFolder"))}" /></div>
          <button type="button" class="btn" id="duPick">${t("dmPickFolder")}</button>
          <button type="button" class="btn accent" id="duGo">${t("dmScanDupes")}</button>
        </div>
      </div>
      <div class="panel flex-fill" style="padding:0;min-height:200px">
        <div class="table-wrap"><table class="data"><thead><tr><th>${t("dmGroup")}</th><th>${t("dmFiles")}</th></tr></thead><tbody id="duBody"></tbody></table></div>
      </div>
    </div>`;

  document.getElementById("duPick").onclick = async () => {
    try {
      const res = unwrapData(await api.pick_folder());
      if (res?.ok === false) return setStatus(apiErr(res, "pick_folder"), "error");
      const path = res?.path || null;
      if (path) document.getElementById("duRoot").value = path;
      else setStatus(t("commonNoFolderPicked"));
    } catch (e) {
      setStatus(String(e.message || e), "error");
    }
  };

  document.getElementById("duGo").onclick = async () => {
    const folder = document.getElementById("duRoot").value.trim();
    if (!folder) return setStatus(t("dmFolderRequired"), "error");
    setStatus(t("dmScanningDupes"));
    const start = unwrapData(await api.start_scan_duplicates(folder));
    if (!start?.ok) return setStatus(start?.error || t("commonFailed"), "error");
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
      .join("") || `<tr><td colspan="2" class="empty-state">${t("dmNoDupe")}</td></tr>`;
    setStatus(t("dmGroupsCount", { n: (groups || []).length }), "ok");
  };
}

async function mountDmHealth(body, api, setStatus) {
  body.innerHTML = `
    <div class="hub-inhub-scroll">
      <div class="panel">
        <div class="toolbar-row">
          <strong>${t("dmDiskHealthTitle")}</strong>
          <button type="button" class="btn accent" id="dhGo" style="margin-left:auto">${t("commonRefresh")}</button>
        </div>
        <pre class="meta" id="dhOut" style="white-space:pre-wrap;margin-top:10px;max-height:420px;overflow:auto"></pre>
      </div>
    </div>`;
  document.getElementById("dhGo").onclick = async () => {
    setStatus(t("dmReadingDisks"));
    const res = await api.get_disk_info();
    document.getElementById("dhOut").textContent = JSON.stringify(res, null, 2).slice(0, 10000);
    setStatus(res?.ok === false ? res.error || t("commonFailed") : t("dmDisksOk"), res?.ok === false ? "error" : "ok");
  };
  document.getElementById("dhGo").click();
}

async function mountDmDiff(body, api, setStatus) {
  body.innerHTML = `
    <div class="hub-inhub-scroll">
      <div class="panel">
        <div class="toolbar-row">
          <button type="button" class="btn accent" id="dfSnap">${t("dmTakeSnapshot")}</button>
          <button type="button" class="btn" id="dfCmp">${t("dmCompare")}</button>
        </div>
        <pre class="meta" id="dfOut" style="white-space:pre-wrap;margin-top:10px;max-height:420px;overflow:auto"></pre>
      </div>
    </div>`;
  document.getElementById("dfSnap").onclick = async () => {
    const res = await api.take_snapshot();
    document.getElementById("dfOut").textContent = JSON.stringify(res, null, 2).slice(0, 8000);
    setStatus(res?.ok === false ? res.error || t("commonFailed") : t("dmSnapshotTaken"), res?.ok === false ? "error" : "ok");
  };
  document.getElementById("dfCmp").onclick = async () => {
    const res = await api.compare_snapshot();
    document.getElementById("dfOut").textContent = JSON.stringify(res, null, 2).slice(0, 8000);
    setStatus(res?.ok === false ? res.error || t("commonFailed") : t("dmCompareOk"), res?.ok === false ? "error" : "ok");
  };
}
