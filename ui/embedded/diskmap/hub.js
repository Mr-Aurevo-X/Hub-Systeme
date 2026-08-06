/* DiskMap hub tabs — Recherche / Gros / Vides / Doublons / Santé / Diff */
(function () {
  "use strict";

  const I18N = {
    fr: {
      tabMap: "Map",
      tabSearch: "Recherche",
      tabLarge: "Gros fichiers",
      tabEmpty: "Vides",
      tabDupes: "Doublons",
      tabHealth: "Santé",
      tabDiff: "Diff",
      hubTitle: "Disque",
      hubSubtitle: "Occupation, recherche et outils disque regroupés.",
      searchRoot: "Dossier",
      searchQuery: "Nom",
      searchExt: "Extension",
      searchMinMb: "Min Mo",
      searchQueryPh: "ex. rapport",
      searchExtPh: "pdf, py…",
      btnSearch: "Rechercher",
      btnScan: "Scanner",
      btnTrash: "Corbeille",
      btnTrashSel: "Corbeille sélection",
      btnRefresh: "Rafraîchir",
      btnSnapshot: "Capturer snapshot",
      btnCompare: "Comparer",
      btnOpenFile: "Ouvrir",
      btnReveal: "Dossier",
      colName: "Nom",
      colPath: "Chemin",
      colSize: "Taille",
      colSizeMb: "Taille Mo",
      colActions: "Actions",
      colModel: "Modèle",
      colStatus: "Statut",
      colIface: "Interface",
      colId: "ID",
      colFs: "FS",
      colFree: "Libre",
      colVol: "Nom",
      colDrive: "Lecteur",
      colUsed: "Utilisé",
      colDeltaUsed: "Δ utilisé",
      colDeltaFree: "Δ libre",
      healthPhys: "Physiques",
      healthLog: "Logiques",
      largeRoot: "Dossier",
      largeTop: "Top N",
      largeMin: "Min Mo",
      emptyRoot: "Dossier",
      dupesRoot: "Dossier",
      needFolder: "Choisissez un dossier.",
      searching: "Recherche…",
      scanning: "Scan…",
      doneN: "{n} résultat(s)",
      noResults: "Aucun résultat",
      errApi: "API indisponible",
      confirmTrash: "Envoyer à la Corbeille ?",
      snapOk: "Snapshot enregistré",
      compareNoSnap: "Aucun snapshot — capturez d’abord",
      compareOk: "Comparaison prête",
    },
    en: {
      tabMap: "Map",
      tabSearch: "Search",
      tabLarge: "Large files",
      tabEmpty: "Empty",
      tabDupes: "Duplicates",
      tabHealth: "Health",
      tabDiff: "Diff",
      hubTitle: "Disk",
      hubSubtitle: "Usage map, search and disk tools in one hub.",
      searchRoot: "Folder",
      searchQuery: "Name",
      searchExt: "Extension",
      searchMinMb: "Min MB",
      searchQueryPh: "e.g. report",
      searchExtPh: "pdf, py…",
      btnSearch: "Search",
      btnScan: "Scan",
      btnTrash: "Recycle",
      btnTrashSel: "Recycle selection",
      btnRefresh: "Refresh",
      btnSnapshot: "Take snapshot",
      btnCompare: "Compare",
      btnOpenFile: "Open",
      btnReveal: "Folder",
      colName: "Name",
      colPath: "Path",
      colSize: "Size",
      colSizeMb: "Size MB",
      colActions: "Actions",
      colModel: "Model",
      colStatus: "Status",
      colIface: "Interface",
      colId: "ID",
      colFs: "FS",
      colFree: "Free",
      colVol: "Name",
      colDrive: "Drive",
      colUsed: "Used",
      colDeltaUsed: "Δ used",
      colDeltaFree: "Δ free",
      healthPhys: "Physical",
      healthLog: "Logical",
      largeRoot: "Folder",
      largeTop: "Top N",
      largeMin: "Min MB",
      emptyRoot: "Folder",
      dupesRoot: "Folder",
      needFolder: "Pick a folder.",
      searching: "Searching…",
      scanning: "Scanning…",
      doneN: "{n} result(s)",
      noResults: "No results",
      errApi: "API unavailable",
      confirmTrash: "Send to Recycle Bin?",
      snapOk: "Snapshot saved",
      compareNoSnap: "No snapshot — capture first",
      compareOk: "Comparison ready",
    },
  };

  let lang = "fr";
  const t = (k, vars) => {
    let s = (I18N[lang] && I18N[lang][k]) || I18N.fr[k] || k;
    if (vars) Object.keys(vars).forEach((x) => { s = s.split("{" + x + "}").join(String(vars[x])); });
    return s;
  };

  function api() {
    return window.pywebview && window.pywebview.api;
  }

  async function call(method, ...args) {
    const a = api();
    if (!a || typeof a[method] !== "function") throw new Error(t("errApi"));
    return a[method](...args);
  }

  function fmtBytes(n) {
    const u = ["o", "Ko", "Mo", "Go", "To"];
    let v = Math.max(0, Number(n) || 0);
    for (let i = 0; i < u.length; i++) {
      if (v < 1024 || i === u.length - 1) {
        return i === 0 ? `${Math.round(v)} ${u[i]}` : `${v.toFixed(1)} ${u[i]}`;
      }
      v /= 1024;
    }
    return String(n);
  }

  function setProg(row, bar, label, pct, detail, show) {
    if (row) row.hidden = !show;
    if (bar) {
      bar.style.width = `${Math.max(0, Math.min(100, pct || 0))}%`;
      bar.parentElement && bar.parentElement.classList.toggle("busy", show && !(pct > 0));
      bar.parentElement && bar.parentElement.classList.toggle("determinate", pct > 0);
    }
    if (label) label.textContent = detail || (pct != null ? `${Math.round(pct)}%` : "");
  }

  function applyHubI18n() {
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      if (I18N.fr[key] || (I18N[lang] && I18N[lang][key])) el.textContent = t(key);
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      const key = el.getAttribute("data-i18n-placeholder");
      el.placeholder = t(key);
    });
  }

  function switchTab(id) {
    document.querySelectorAll(".hub-tab").forEach((btn) => {
      const on = btn.dataset.tab === id;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    document.querySelectorAll(".hub-panel").forEach((panel) => {
      const on = panel.dataset.panel === id;
      panel.classList.toggle("active", on);
      panel.hidden = !on;
    });
    if (id === "health") refreshHealth();
    window.dispatchEvent(new Event("resize"));
  }

  async function pickInto(input) {
    const res = await call("pick_folder");
    const path = res && res.data && res.data.path;
    if (path && input) input.value = path;
    return path;
  }

  /* ── Search ── */
  let searchPoll = null;
  async function runSearch() {
    const root = document.getElementById("searchRoot").value.trim();
    const query = document.getElementById("searchQuery").value.trim();
    if (!root) {
      document.getElementById("searchStatus").textContent = t("needFolder");
      return;
    }
    const extRaw = document.getElementById("searchExt").value.trim();
    const exts = extRaw ? extRaw.split(/[,;\s]+/).map((x) => x.replace(/^\./, "").toLowerCase()).filter(Boolean) : [];
    const minMb = parseFloat(document.getElementById("searchMinMb").value) || 0;
    document.getElementById("btnSearchGo").disabled = true;
    document.getElementById("btnSearchCancel").disabled = false;
    document.getElementById("searchStatus").textContent = t("searching");
    document.getElementById("searchBody").innerHTML = "";
    setProg(
      document.getElementById("searchProgressRow"),
      document.getElementById("searchProgressBar"),
      document.getElementById("searchProgressLabel"),
      0, t("searching"), true
    );
    try {
      const start = await call("start_search", root, query, { extensions: exts, minBytes: Math.round(minMb * 1024 * 1024) });
      if (!start || !start.ok) throw new Error((start && start.error) || t("errApi"));
      if (searchPoll) clearInterval(searchPoll);
      searchPoll = setInterval(async () => {
        try {
          const p = await call("get_search_progress");
          setProg(
            document.getElementById("searchProgressRow"),
            document.getElementById("searchProgressBar"),
            document.getElementById("searchProgressLabel"),
            p.percent, `${p.matches || 0} · ${p.filesSeen || 0}`, true
          );
          if (p.done) {
            clearInterval(searchPoll);
            searchPoll = null;
            document.getElementById("btnSearchGo").disabled = false;
            document.getElementById("btnSearchCancel").disabled = true;
            setProg(document.getElementById("searchProgressRow"), document.getElementById("searchProgressBar"), document.getElementById("searchProgressLabel"), 100, "", false);
            const result = p.result || {};
            const rows = result.results || [];
            const body = document.getElementById("searchBody");
            body.innerHTML = "";
            rows.forEach((r) => {
              const tr = document.createElement("tr");
              tr.innerHTML = `<td>${esc(r.name || "")}</td><td class="mono">${esc(r.path || "")}</td><td>${esc(r.size_fmt || fmtBytes(r.size))}</td><td class="actions"></td>`;
              const actions = tr.querySelector(".actions");
              const b1 = document.createElement("button");
              b1.type = "button"; b1.className = "btn tiny"; b1.textContent = t("btnOpenFile");
              b1.onclick = () => call("open_search_file", r.path);
              const b2 = document.createElement("button");
              b2.type = "button"; b2.className = "btn tiny"; b2.textContent = t("btnReveal");
              b2.onclick = () => call("open_search_folder", r.path);
              actions.append(b1, b2);
              body.appendChild(tr);
            });
            document.getElementById("searchStatus").textContent = rows.length ? t("doneN", { n: rows.length }) : t("noResults");
          }
        } catch (err) {
          clearInterval(searchPoll);
          searchPoll = null;
          document.getElementById("btnSearchGo").disabled = false;
          document.getElementById("btnSearchCancel").disabled = true;
          document.getElementById("searchStatus").textContent = String(err.message || err);
        }
      }, 280);
    } catch (err) {
      document.getElementById("btnSearchGo").disabled = false;
      document.getElementById("btnSearchCancel").disabled = true;
      document.getElementById("searchStatus").textContent = String(err.message || err);
      setProg(document.getElementById("searchProgressRow"), null, null, 0, "", false);
    }
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  /* ── Large ── */
  let largePoll = null;
  let largeSelected = null;
  async function runLarge() {
    const root = document.getElementById("largeRoot").value.trim();
    if (!root) { document.getElementById("largeStatus").textContent = t("needFolder"); return; }
    const topN = parseInt(document.getElementById("largeTop").value, 10) || 50;
    const minMb = parseFloat(document.getElementById("largeMin").value) || 0;
    document.getElementById("largeStatus").textContent = t("scanning");
    document.getElementById("largeBody").innerHTML = "";
    largeSelected = null;
    setProg(document.getElementById("largeProgressRow"), document.getElementById("largeProgressBar"), document.getElementById("largeProgressLabel"), 0, t("scanning"), true);
    const start = await call("start_scan_large", root, topN, minMb);
    if (!start || !start.ok) {
      document.getElementById("largeStatus").textContent = (start && start.error) || t("errApi");
      return;
    }
    if (largePoll) clearInterval(largePoll);
    largePoll = setInterval(async () => {
      const p = await call("get_large_progress");
      setProg(document.getElementById("largeProgressRow"), document.getElementById("largeProgressBar"), document.getElementById("largeProgressLabel"), p.percent, p.detail || "", true);
      if (p.done) {
        clearInterval(largePoll);
        largePoll = null;
        setProg(document.getElementById("largeProgressRow"), document.getElementById("largeProgressBar"), document.getElementById("largeProgressLabel"), 100, "", false);
        const files = (p.result && p.result.files) || [];
        const body = document.getElementById("largeBody");
        files.forEach((f) => {
          const tr = document.createElement("tr");
          tr.innerHTML = `<td>${esc(f.sizeMb)}</td><td class="mono">${esc(f.path)}</td>`;
          tr.onclick = () => {
            body.querySelectorAll("tr").forEach((x) => x.classList.remove("selected"));
            tr.classList.add("selected");
            largeSelected = f.path;
          };
          body.appendChild(tr);
        });
        document.getElementById("largeStatus").textContent = files.length ? t("doneN", { n: files.length }) : (p.error || t("noResults"));
      }
    }, 280);
  }

  /* ── Empty ── */
  let emptyPoll = null;
  let emptySelected = null;
  async function runEmpty() {
    const root = document.getElementById("emptyRoot").value.trim();
    if (!root) { document.getElementById("emptyStatus").textContent = t("needFolder"); return; }
    document.getElementById("emptyBody").innerHTML = "";
    emptySelected = null;
    setProg(document.getElementById("emptyProgressRow"), document.getElementById("emptyProgressBar"), document.getElementById("emptyProgressLabel"), 0, t("scanning"), true);
    const start = await call("start_find_empty", root);
    if (!start || !start.ok) {
      document.getElementById("emptyStatus").textContent = (start && start.error) || t("errApi");
      return;
    }
    if (emptyPoll) clearInterval(emptyPoll);
    emptyPoll = setInterval(async () => {
      const p = await call("get_empty_progress");
      setProg(document.getElementById("emptyProgressRow"), document.getElementById("emptyProgressBar"), document.getElementById("emptyProgressLabel"), p.percent, p.detail || "", true);
      if (p.done) {
        clearInterval(emptyPoll);
        emptyPoll = null;
        setProg(document.getElementById("emptyProgressRow"), document.getElementById("emptyProgressBar"), document.getElementById("emptyProgressLabel"), 100, "", false);
        const folders = (p.result && p.result.folders) || [];
        const body = document.getElementById("emptyBody");
        folders.forEach((f) => {
          const tr = document.createElement("tr");
          tr.innerHTML = `<td class="mono">${esc(f.path)}</td>`;
          tr.onclick = () => {
            body.querySelectorAll("tr").forEach((x) => x.classList.remove("selected"));
            tr.classList.add("selected");
            emptySelected = f.path;
          };
          body.appendChild(tr);
        });
        document.getElementById("emptyStatus").textContent = folders.length ? t("doneN", { n: folders.length }) : (p.error || t("noResults"));
      }
    }, 280);
  }

  /* ── Dupes ── */
  let dupesPoll = null;
  async function runDupes() {
    const folder = document.getElementById("dupesRoot").value.trim();
    if (!folder) { document.getElementById("dupesStatus").textContent = t("needFolder"); return; }
    document.getElementById("dupesGroups").innerHTML = "";
    setProg(document.getElementById("dupesProgressRow"), document.getElementById("dupesProgressBar"), document.getElementById("dupesProgressLabel"), 0, t("scanning"), true);
    const start = await call("start_scan_duplicates", folder);
    if (!start || !start.ok) {
      document.getElementById("dupesStatus").textContent = (start && start.error) || t("errApi");
      return;
    }
    if (dupesPoll) clearInterval(dupesPoll);
    dupesPoll = setInterval(async () => {
      const p = await call("get_dup_progress");
      setProg(document.getElementById("dupesProgressRow"), document.getElementById("dupesProgressBar"), document.getElementById("dupesProgressLabel"), p.percent, `${p.phase || ""} ${p.detail || ""}`.trim(), true);
      if (p.done) {
        clearInterval(dupesPoll);
        dupesPoll = null;
        setProg(document.getElementById("dupesProgressRow"), document.getElementById("dupesProgressBar"), document.getElementById("dupesProgressLabel"), 100, "", false);
        const groups = (p.result && p.result.groups) || [];
        const wrap = document.getElementById("dupesGroups");
        groups.forEach((g) => {
          const box = document.createElement("div");
          box.className = "dupe-group";
          box.innerHTML = `<div class="dupe-head">${esc(g.sizeLabel || fmtBytes(g.size))} · ${esc(g.count)} · <code>${esc((g.hash || "").slice(0, 12))}</code></div>`;
          (g.files || []).forEach((fp) => {
            const path = typeof fp === "string" ? fp : (fp.path || "");
            const lab = document.createElement("label");
            lab.className = "dupe-row";
            lab.innerHTML = `<input type="checkbox" data-path="${esc(path)}" /> <span class="mono">${esc(path)}</span>`;
            box.appendChild(lab);
          });
          wrap.appendChild(box);
        });
        document.getElementById("dupesStatus").textContent = groups.length ? t("doneN", { n: groups.length }) : (p.error || t("noResults"));
      }
    }, 320);
  }

  /* ── Health ── */
  async function refreshHealth() {
    const st = document.getElementById("healthStatus");
    st.textContent = t("scanning");
    try {
      const res = await call("get_disk_info");
      if (!res || !res.ok) throw new Error((res && res.error) || t("errApi"));
      const dBody = document.getElementById("healthDriveBody");
      const lBody = document.getElementById("healthLogBody");
      dBody.innerHTML = "";
      lBody.innerHTML = "";
      (res.drives || []).forEach((d) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${esc(d.Model || "")}</td><td>${esc(d.Status || "")}</td><td>${esc(fmtBytes(d.Size))}</td><td>${esc(d.InterfaceType || "")}</td>`;
        dBody.appendChild(tr);
      });
      (res.logical || []).forEach((d) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${esc(d.DeviceID || "")}</td><td>${esc(d.FileSystem || "")}</td><td>${esc(fmtBytes(d.Size))}</td><td>${esc(fmtBytes(d.FreeSpace))}</td><td>${esc(d.VolumeName || "")}</td>`;
        lBody.appendChild(tr);
      });
      st.textContent = t("doneN", { n: (res.drives || []).length + (res.logical || []).length });
    } catch (err) {
      st.textContent = String(err.message || err);
    }
  }

  /* ── Diff ── */
  async function takeSnap() {
    const res = await call("take_snapshot");
    document.getElementById("diffStatus").textContent = res && res.ok ? t("snapOk") : ((res && res.error) || t("errApi"));
  }

  async function compareSnap() {
    const res = await call("compare_snapshot");
    const body = document.getElementById("diffBody");
    body.innerHTML = "";
    if (!res || !res.ok) {
      document.getElementById("diffStatus").textContent = (res && res.error) || t("errApi");
      return;
    }
    if (!res.hasSnapshot) {
      document.getElementById("diffStatus").textContent = t("compareNoSnap");
      (res.current || []).forEach((d) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${esc(d.letter)}</td><td>${esc(fmtBytes(d.usedBytes))}</td><td>${esc(fmtBytes(d.freeBytes))}</td><td>—</td><td>—</td>`;
        body.appendChild(tr);
      });
      return;
    }
    (res.deltas || []).forEach((d) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${esc(d.letter)}</td><td>${esc(fmtBytes(d.usedBytes))}</td><td>${esc(fmtBytes(d.freeBytes))}</td><td>${esc(fmtBytes(d.deltaUsedBytes))}</td><td>${esc(fmtBytes(d.deltaFreeBytes))}</td>`;
      body.appendChild(tr);
    });
    document.getElementById("diffStatus").textContent = t("compareOk");
  }

  function wire() {
    document.querySelectorAll(".hub-tab").forEach((btn) => {
      btn.addEventListener("click", () => switchTab(btn.dataset.tab));
    });

    const bindPick = (btnId, inputId) => {
      const btn = document.getElementById(btnId);
      const input = document.getElementById(inputId);
      if (btn && input) btn.addEventListener("click", () => pickInto(input).catch((e) => console.warn(e)));
    };
    bindPick("btnSearchPick", "searchRoot");
    bindPick("btnLargePick", "largeRoot");
    bindPick("btnEmptyPick", "emptyRoot");
    bindPick("btnDupesPick", "dupesRoot");

    document.getElementById("btnSearchGo")?.addEventListener("click", () => runSearch().catch((e) => {
      document.getElementById("searchStatus").textContent = String(e.message || e);
    }));
    document.getElementById("btnSearchCancel")?.addEventListener("click", () => call("cancel_search"));
    document.getElementById("btnLargeScan")?.addEventListener("click", () => runLarge().catch((e) => {
      document.getElementById("largeStatus").textContent = String(e.message || e);
    }));
    document.getElementById("btnLargeDelete")?.addEventListener("click", async () => {
      if (!largeSelected || !confirm(t("confirmTrash"))) return;
      const res = await call("delete_large_file", largeSelected);
      document.getElementById("largeStatus").textContent = res && res.ok ? t("doneN", { n: 1 }) : ((res && res.error) || t("errApi"));
      if (res && res.ok) runLarge();
    });
    document.getElementById("btnEmptyScan")?.addEventListener("click", () => runEmpty().catch((e) => {
      document.getElementById("emptyStatus").textContent = String(e.message || e);
    }));
    document.getElementById("btnEmptyDelete")?.addEventListener("click", async () => {
      if (!emptySelected || !confirm(t("confirmTrash"))) return;
      const res = await call("delete_empty_folder", emptySelected);
      document.getElementById("emptyStatus").textContent = res && res.ok ? t("doneN", { n: 1 }) : ((res && res.error) || t("errApi"));
      if (res && res.ok) runEmpty();
    });
    document.getElementById("btnDupesScan")?.addEventListener("click", () => runDupes().catch((e) => {
      document.getElementById("dupesStatus").textContent = String(e.message || e);
    }));
    document.getElementById("btnDupesTrash")?.addEventListener("click", async () => {
      const paths = Array.from(document.querySelectorAll("#dupesGroups input[type=checkbox]:checked")).map((el) => el.getAttribute("data-path")).filter(Boolean);
      if (!paths.length || !confirm(t("confirmTrash"))) return;
      const res = await call("trash_dup_paths", paths);
      document.getElementById("dupesStatus").textContent = res && res.ok ? t("doneN", { n: paths.length }) : ((res && res.error) || t("errApi"));
      if (res && res.ok) runDupes();
    });
    document.getElementById("btnHealthRefresh")?.addEventListener("click", () => refreshHealth());
    document.getElementById("btnDiffSnap")?.addEventListener("click", () => takeSnap().catch((e) => {
      document.getElementById("diffStatus").textContent = String(e.message || e);
    }));
    document.getElementById("btnDiffCompare")?.addEventListener("click", () => compareSnap().catch((e) => {
      document.getElementById("diffStatus").textContent = String(e.message || e);
    }));
  }

  async function bootLang() {
    try {
      if (window.MrAurevoXSuite) {
        const s = await window.MrAurevoXSuite.loadSuiteSettings(api());
        lang = s.language === "en" ? "en" : "fr";
      } else if (api() && api().get_suite_settings) {
        const s = await api().get_suite_settings();
        if (s && (s.language === "en" || s.language === "fr")) lang = s.language;
      }
    } catch (_) {}
    applyHubI18n();
  }

  function boot() {
    wire();
    bootLang();
  }

  if (window.pywebview) {
    window.addEventListener("pywebviewready", boot);
    setTimeout(boot, 120);
  } else {
    boot();
  }
})();
