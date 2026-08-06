/* DiskMap UI — treemap squarifié + pont pywebview */
(function () {
  "use strict";

  const TOP_N = 12;
  const PALETTE = [
    "#e03545", "#c43a4a", "#a84555", "#8b5568", "#6d6578",
    "#5a7080", "#4a7a72", "#6a6a40", "#8a5a3a", "#9a4050",
    "#704858", "#556070", "#7a4058", "#405868",
  ];


  const SUITE_I18N = {
    fr: {
      tagline: "Hub disque · local",
      copyright: "© 2026 Mr-Aurevo-X · local · CGU dans L'Atelier PC Command",
      featuresTitle: "Fonctions",
      features: "Carte, recherche, gros fichiers, dossiers vides, doublons, santé et diff d’espace — un seul hub disque.",
      privacy: "Mr-Aurevo-X ne collecte aucune donnée. Scan disque local. Suppressions via Corbeille uniquement.",
      target: "Cible",
      btnPick: "Dossier…",
      btnAnalyze: "Analyser",
      btnCancel: "Annuler",
      btnOpen: "Ouvrir dans l'Explorateur",
      stFree: "Libre",
      stUsed: "Utilisé",
      stScanned: "Analysé",
      statusPick: "Choisissez un lecteur ou un dossier, puis lancez l'analyse.",
      navHint: "Clic = sélection · double-clic = ouvrir · clic droit = remonter · Échap = annuler",
      mapHint: "Le treemap apparaîtra ici après l'analyse.",
      mapScanning: "Analyse en cours…",
      topTitle: "Top éléments",
      sideSub: "Niveau actuel",
      noLevel: "Aucun niveau",
      noDrive: "Aucun lecteur",
      root: "racine",
      cancelled: "Analyse annulée.",
      done: "Terminé",
      scanDone: "Analyse terminée · {scanned} · {n} éléments",
      needTarget: "Sélectionnez un lecteur ou un dossier.",
      starting: "Démarrage de l'analyse…",
      cancelReq: "Annulation demandée…",
      folderChosen: "Dossier choisi : {path}",
      previewMode: "Mode aperçu navigateur — lancez DiskMap.exe pour l'analyse.",
      apiMissing: "API indisponible (lancez via DiskMap.exe)",
      errListDrives: "Échec list_drives",
      errNoResult: "Pas de résultat",
      errStart: "Échec démarrage",
      errPickCancel: "Sélection annulée",
      errOpen: "Ouverture impossible",
      driveFree: "{label}  ·  libre {free} / {total}",
      cancelledToken: "Annulé",
      emptyChildren: "Aucun sous-élément affichable à ce niveau",
      emptyFolder: "Dossier vide ou inaccessible",
      others: "Autres",
    },
    en: {
      tagline: "Disk hub · local",
      copyright: "© 2026 Mr-Aurevo-X · local · Terms in Atelier",
      featuresTitle: "Features",
      features: "Map, search, large files, empty folders, duplicates, health and space diff — one disk hub.",
      privacy: "Mr-Aurevo-X does not collect your data. Local disk scan. Deletes go to Recycle Bin only.",
      target: "Target",
      btnPick: "Folder…",
      btnAnalyze: "Analyze",
      btnCancel: "Cancel",
      btnOpen: "Open in Explorer",
      stFree: "Free",
      stUsed: "Used",
      stScanned: "Scanned",
      statusPick: "Pick a drive or folder, then start the analysis.",
      navHint: "Click = select · double-click = open · right-click = up · Esc = cancel",
      mapHint: "The treemap will appear here after analysis.",
      mapScanning: "Scanning…",
      topTitle: "Top items",
      sideSub: "Current level",
      noLevel: "No level",
      noDrive: "No drives",
      root: "root",
      cancelled: "Analysis cancelled.",
      done: "Done",
      scanDone: "Analysis done · {scanned} · {n} items",
      needTarget: "Select a drive or folder.",
      starting: "Starting analysis…",
      cancelReq: "Cancel requested…",
      folderChosen: "Folder chosen: {path}",
      previewMode: "Browser preview — launch DiskMap.exe for analysis.",
      apiMissing: "API unavailable (launch via DiskMap.exe)",
      errListDrives: "list_drives failed",
      errNoResult: "No result",
      errStart: "Start failed",
      errPickCancel: "Selection cancelled",
      errOpen: "Could not open",
      driveFree: "{label}  ·  free {free} / {total}",
      cancelledToken: "Cancelled",
      emptyChildren: "No displayable children at this level",
      emptyFolder: "Empty or inaccessible folder",
      others: "Others",
    },
  };

  let suiteLang = "fr";
  const t = (key, vars) => {
    let s = (SUITE_I18N[suiteLang] && SUITE_I18N[suiteLang][key]) || SUITE_I18N.fr[key] || key;
    if (vars) Object.keys(vars).forEach((k) => { s = s.split("{" + k + "}").join(String(vars[k])); });
    return s;
  };

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
    PALETTE[0] = accent;
  }

  async function bootSuite(api) {
    const suite = window.MrAurevoXSuite;
    if (!suite) {
      if (api && api.get_suite_settings) {
        try {
          const s = await api.get_suite_settings();
          if (s && s.ok) {
            if (s.language === "en" || s.language === "fr") suiteLang = s.language;
            if (s.accent) applyAccent(s.accent);
          }
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

  const el = {
    driveSelect: document.getElementById("driveSelect"),
    btnPick: document.getElementById("btnPick"),
    btnAnalyze: document.getElementById("btnAnalyze"),
    btnCancel: document.getElementById("btnCancel"),
    btnOpen: document.getElementById("btnOpen"),
    stFree: document.getElementById("stFree"),
    stUsed: document.getElementById("stUsed"),
    stScanned: document.getElementById("stScanned"),
    statusBar: document.getElementById("statusBar"),
    progress: document.getElementById("progress"),
    progressBar: document.getElementById("progressBar"),
    progressLabel: document.getElementById("progressLabel"),
    crumbs: document.getElementById("crumbs"),
    canvas: document.getElementById("treemap"),
    mapHint: document.getElementById("mapHint"),
    topList: document.getElementById("topList"),
    sideSub: document.getElementById("sideSub"),
  };

  const state = {
    scanPath: null,
    root: null,
    stack: [],
    layout: [],
    selected: null,
    polling: false,
    cancelling: false,
    hover: null,
    layoutKey: "",
    paintScheduled: false,
    booted: false,
  };

  function api() {
    return window.pywebview && window.pywebview.api;
  }

  async function call(method, ...args) {
    const a = api();
    if (!a || typeof a[method] !== "function") {
      throw new Error(t("apiMissing"));
    }
    return a[method](...args);
  }

  function setStatus(text, kind) {
    el.statusBar.textContent = text || "";
    el.statusBar.classList.remove("error", "ok");
    if (kind) el.statusBar.classList.add(kind);
  }

  function setProgressUI(pct, phase, detail) {
    const n = Math.max(0, Math.min(100, Number(pct) || 0));
    if (el.progress) {
      el.progress.classList.remove("busy");
      el.progress.classList.add("determinate");
    }
    if (el.progressBar) el.progressBar.style.width = n + "%";
    const parts = [n + "%"];
    if (phase) parts.push(phase);
    if (detail) parts.push(detail);
    const text = parts.join(" · ");
    if (el.progressLabel) el.progressLabel.textContent = phase ? n + "% · " + phase : n + "%";
    if (detail || phase) setStatus(text);
  }

  function clearProgressUI() {
    if (el.progress) el.progress.classList.remove("busy", "determinate");
    if (el.progressBar) el.progressBar.style.width = "0%";
    if (el.progressLabel) el.progressLabel.textContent = "";
  }

  function setProgressBusy() {
    if (el.progress) {
      el.progress.classList.add("busy");
      el.progress.classList.remove("determinate");
    }
    if (el.progressBar) el.progressBar.style.width = "";
    if (el.progressLabel) el.progressLabel.textContent = "…";
  }

  function fmtBytes(n) {
    const units = ["o", "Ko", "Mo", "Go", "To"];
    let v = Math.max(0, Number(n) || 0);
    for (let i = 0; i < units.length; i++) {
      if (v < 1024 || i === units.length - 1) {
        return i === 0 ? `${Math.round(v)} ${units[i]}` : `${v.toFixed(1)} ${units[i]}`;
      }
      v /= 1024;
    }
    return `${n} o`;
  }

  function currentNode() {
    if (!state.stack.length) return null;
    return state.stack[state.stack.length - 1];
  }

  /* —— Squarified treemap (Bruls et al.) —— */
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
        color: PALETTE[(colorOffset + i) % PALETTE.length],
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
      const msg = emptyNode && emptyNode.size > 0
        ? t("emptyChildren")
        : t("emptyFolder");
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
    return n.startsWith("Autres") || n.startsWith("Others") || n.startsWith(t("others"));
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
      btn.textContent = node.name || t("root");
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
      el.sideSub.textContent = t("noLevel");
      el.btnOpen.disabled = true;
      return;
    }
    el.sideSub.textContent = node.path || node.name;
    const kids = (node.children && node.children.length)
      ? [...node.children].sort((a, b) => b.size - a.size).slice(0, TOP_N)
      : [node];
    const max = kids[0] ? kids[0].size : 1;
    kids.forEach((k) => {
      const li = document.createElement("li");
      if (state.selected === k) li.classList.add("active");
      li.innerHTML =
        `<span class="name" title="${escapeAttr(k.path || k.name)}"></span>` +
        `<span class="size"></span>` +
        `<span class="bar"><i style="width:${Math.max(4, (k.size / max) * 100)}%"></i></span>`;
      li.querySelector(".name").textContent = k.name;
      li.querySelector(".size").textContent = fmtBytes(k.size);
      li.addEventListener("click", () => {
        selectNode(k);
      });
      li.addEventListener("dblclick", () => {
        drillInto(k);
      });
      el.topList.appendChild(li);
    });
    const openTarget = state.selected || node;
    el.btnOpen.disabled = !openTarget || !openTarget.path || isOthersBucket(openTarget.name);
  }

  function escapeAttr(s) {
    return String(s || "").replace(/"/g, "&quot;");
  }

  function refreshView() {
    el.mapHint.classList.toggle("hidden", !!state.root);
    renderCrumbs();
    renderTop();
    state.layoutKey = "";
    draw(true);
  }

  async function loadDrives() {
    try {
      const res = await call("list_drives");
      if (!res || !res.ok) throw new Error((res && res.error) || t("errListDrives"));
      const drives = (res.data && res.data.drives) || [];
      el.driveSelect.innerHTML = "";
      drives.forEach((d) => {
        const opt = document.createElement("option");
        opt.value = d.path;
        opt.textContent = t("driveFree", { label: d.label, free: d.freeLabel, total: d.totalLabel });
        el.driveSelect.appendChild(opt);
      });
      if (!drives.length) {
        const opt = document.createElement("option");
        opt.value = "";
        opt.textContent = t("noDrive");
        el.driveSelect.appendChild(opt);
      }
    } catch (err) {
      setStatus(String(err.message || err), "error");
    }
  }

  function setScanning(on) {
    el.btnAnalyze.disabled = on;
    el.btnCancel.disabled = !on || state.cancelling;
    el.btnPick.disabled = on;
    el.driveSelect.disabled = on;
  }

  async function pollProgress() {
    state.polling = true;
    try {
      while (state.polling) {
        const res = await call("get_scan_progress");
        const d = (res && res.data) || {};
        setProgressUI(d.percent || 0, d.phase || "", d.detail || "");
        if (d.done && !d.running) {
          state.polling = false;
          state.cancelling = false;
          setScanning(false);
          if (d.error && d.error !== t("cancelledToken") && d.error !== "Annulé" && d.error !== "Cancelled") {
            clearProgressUI();
            setStatus(d.error, "error");
            return;
          }
          if (d.error === t("cancelledToken") || d.error === "Annulé" || d.error === "Cancelled") {
            clearProgressUI();
            setStatus(t("cancelled"), "error");
            return;
          }
          setProgressUI(100, t("done"), d.detail || "");
          await loadResult();
          return;
        }
        await sleep(280);
      }
    } catch (err) {
      state.polling = false;
      state.cancelling = false;
      setScanning(false);
      clearProgressUI();
      setStatus(String(err.message || err), "error");
    }
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function loadResult() {
    const res = await call("get_scan_result");
    if (!res || !res.ok) {
      setStatus((res && res.error) || t("errNoResult"), "error");
      return;
    }
    const data = res.data;
    state.root = data.root;
    state.scanPath = data.scanPath;
    state.stack = [data.root];
    state.selected = null;
    el.stFree.textContent = data.freeLabel || "—";
    el.stUsed.textContent = data.usedLabel || "—";
    el.stScanned.textContent = data.scannedLabel || "—";
    clearProgressUI();
    setStatus(t("scanDone", { scanned: data.scannedLabel, n: data.filesSeen || 0 }), "ok");
    refreshView();
  }

  async function startAnalyze() {
    const path = state.scanPath || el.driveSelect.value;
    if (!path) {
      setStatus(t("needTarget"), "error");
      return;
    }
    state.scanPath = path;
    state.cancelling = false;
    state.root = null;
    state.stack = [];
    state.selected = null;
    state.layout = [];
    state.layoutKey = "";
    el.stFree.textContent = "—";
    el.stUsed.textContent = "—";
    el.stScanned.textContent = "—";
    el.mapHint.classList.remove("hidden");
    el.mapHint.textContent = t("mapScanning");
    el.topList.innerHTML = "";
    el.crumbs.innerHTML = "";
    el.sideSub.textContent = t("mapScanning");
    el.btnOpen.disabled = true;
    setScanning(true);
    setProgressBusy();
    setStatus(t("starting"));
    try {
      const res = await call("start_scan", path);
      if (!res || !res.ok) {
        setScanning(false);
        clearProgressUI();
        el.mapHint.textContent = t("mapHint");
        setStatus((res && res.error) || t("errStart"), "error");
        return;
      }
      pollProgress();
    } catch (err) {
      setScanning(false);
      clearProgressUI();
      el.mapHint.textContent = t("mapHint");
      setStatus(String(err.message || err), "error");
    }
  }

  el.btnAnalyze.addEventListener("click", startAnalyze);
  el.btnCancel.addEventListener("click", async () => {
    if (state.cancelling) return;
    state.cancelling = true;
    el.btnCancel.disabled = true;
    setStatus(t("cancelReq"));
    try {
      await call("cancel_scan");
      // Keep polling until host reports done (worker still winding down)
      if (!state.polling) pollProgress();
    } catch (err) {
      state.cancelling = false;
      setScanning(!!state.polling);
      setStatus(String(err.message || err), "error");
    }
  });
  el.btnPick.addEventListener("click", async () => {
    try {
      const res = await call("pick_folder");
      if (!res || !res.ok) {
        setStatus((res && res.error) || t("errPickCancel"), "error");
        return;
      }
      const path = res.data && res.data.path;
      if (!path) return;
      state.scanPath = path;
      let found = false;
      for (const opt of el.driveSelect.options) {
        if (opt.value === path) { found = true; el.driveSelect.value = path; break; }
      }
      if (!found) {
        const opt = document.createElement("option");
        opt.value = path;
        opt.textContent = path;
        el.driveSelect.appendChild(opt);
        el.driveSelect.value = path;
      }
      setStatus(t("folderChosen", { path }));
    } catch (err) {
      setStatus(String(err.message || err), "error");
    }
  });
  el.driveSelect.addEventListener("change", () => {
    state.scanPath = el.driveSelect.value;
  });
  el.btnOpen.addEventListener("click", async () => {
    const target = state.selected || currentNode();
    if (!target || !target.path) return;
    try {
      const res = await call("open_path", target.path);
      if (!res || !res.ok) setStatus((res && res.error) || t("errOpen"), "error");
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

  window.addEventListener("resize", () => {
    if (state.root) {
      state.layoutKey = "";
      draw(true);
    }
  });

  window.addEventListener("keydown", (ev) => {
    const tag = (ev.target && ev.target.tagName) || "";
    if (tag === "SELECT" || tag === "INPUT" || tag === "TEXTAREA") return;
    if (ev.key === "Escape") {
      if (!el.btnCancel.disabled) el.btnCancel.click();
      return;
    }
    if (ev.key === "Enter" && !ev.ctrlKey && !ev.metaKey) {
      if (!el.btnAnalyze.disabled) {
        ev.preventDefault();
        startAnalyze();
      } else if (canDrill(state.selected)) {
        ev.preventDefault();
        drillInto(state.selected);
      }
      return;
    }
    if (ev.key === "Backspace") {
      ev.preventDefault();
      goUp();
      return;
    }
    if (ev.key === "o" || ev.key === "O") {
      if (!el.btnOpen.disabled) el.btnOpen.click();
    }
  });

  function boot() {
    if (state.booted) return;
    state.booted = true;
    bootSuite(api()).then(() => {
      return loadDrives().then(() => {
        state.scanPath = el.driveSelect.value || null;
        setStatus(t("statusPick"));
      });
    });
  }

  if (window.pywebview) {
    window.addEventListener("pywebviewready", boot);
    setTimeout(boot, 80);
  } else {
    setStatus(t("previewMode"), "error");
    boot();
  }
})();
