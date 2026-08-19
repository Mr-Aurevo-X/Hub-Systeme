/**
 * Copyright (c) 2026 Mr-Aurevo-X. All rights reserved.
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 * Author: Mr-Aurevo-X | https://github.com/Mr-Aurevo-X
 */
/**
 * ProcessHub — native in-hub (no iframe).
 * Segments: processes | services | startup | tasks
 * Bridge: pywebview.api.processhub.*
 */
import { mountModuleShell, waitNs, esc } from "./_in_hub.js";

// ─── helpers ────────────────────────────────────────────────────────────────

function fmtMb(mb) {
  if (mb == null || mb === "") return "—";
  const n = Number(mb);
  if (isNaN(n)) return "—";
  if (n >= 1024) return (n / 1024).toFixed(1) + " Go";
  return n.toFixed(0) + " Mo";
}

function fmtBytes(b) {
  if (!b) return "—";
  const gb = b / (1024 ** 3);
  if (gb >= 1) return gb.toFixed(1) + " Go";
  return (b / (1024 ** 2)).toFixed(0) + " Mo";
}

function fmtPct(p) {
  if (p == null) return "—";
  return Number(p).toFixed(1) + " %";
}

function filterList(list, query, ...fields) {
  if (!query) return list;
  const q = query.toLowerCase();
  return list.filter((item) =>
    fields.some((f) => String(item[f] ?? "").toLowerCase().includes(q))
  );
}

const SVC_STATUS = { 1: "Stopped", 2: "StartPending", 3: "StopPending", 4: "Running" };
const SVC_START = { 0: "Boot", 1: "System", 2: "Automatic", 3: "Manual", 4: "Disabled" };
const TASK_STATE = { 0: "Unknown", 1: "Disabled", 2: "Queued", 3: "Ready", 4: "Running" };

function normService(s) {
  const statusRaw = s.Status ?? s.status ?? s.state;
  const startRaw = s.StartType ?? s.start_type ?? s.startType;
  return {
    ...s,
    name: s.Name || s.name || s.service_name || "",
    display_name: s.DisplayName || s.display_name || s.displayName || s.Name || s.name || "",
    status:
      typeof statusRaw === "number"
        ? SVC_STATUS[statusRaw] || String(statusRaw)
        : String(statusRaw || "—"),
    start_type:
      typeof startRaw === "number" ? SVC_START[startRaw] || String(startRaw) : String(startRaw || "—"),
  };
}

function normTask(t) {
  const stateRaw = t.State ?? t.state ?? t.status;
  return {
    ...t,
    name: t.TaskName || t.task_name || t.name || "",
    task_name: t.TaskName || t.task_name || t.name || "",
    path: t.TaskPath || t.task_path || t.path || "",
    task_path: t.TaskPath || t.task_path || t.path || "",
    status:
      typeof stateRaw === "number" ? TASK_STATE[stateRaw] || String(stateRaw) : String(stateRaw || "—"),
    state:
      typeof stateRaw === "number" ? TASK_STATE[stateRaw] || String(stateRaw) : String(stateRaw || "—"),
    enabled: t.Enabled != null ? !!t.Enabled : t.enabled !== false,
  };
}

function mkEmpty(msg = "Aucun élément.") {
  return `<div class="empty-state">${esc(msg)}</div>`;
}

function sortKey(a, b, key, dir) {
  const va = a[key] ?? "";
  const vb = b[key] ?? "";
  if (typeof va === "number" && typeof vb === "number") return dir * (va - vb);
  return dir * String(va).localeCompare(String(vb), "fr", { numeric: true });
}

// ─── mount ──────────────────────────────────────────────────────────────────

export async function mount(root) {
  const SEGMENTS = [
    { id: "processes", label: "Processus" },
    { id: "services",  label: "Services"   },
    { id: "startup",   label: "Démarrage"  },
    { id: "tasks",     label: "Tâches"     },
  ];

  const { body, setStatus, setSegment, askConfirm } = mountModuleShell(root, {
    title:          "ProcessHub",
    subtitle:       "Processus · Services · Démarrage · Tâches",
    segments:       SEGMENTS,
    initialSegment: "processes",
    onSegment:      (id, b) => loadSegment(id, b),
  });

  const api = await waitNs("processhub", "list_processes");
  if (!api) {
    setStatus("API processhub indisponible (pywebview.api.processhub).", "error");
    return;
  }

  // ── Segment router ────────────────────────────────────────────────────────

  async function loadSegment(id, mountEl) {
    mountEl.innerHTML = "";
    setStatus("");
    if (id === "processes") await mountProcesses(mountEl);
    else if (id === "services") await mountServices(mountEl);
    else if (id === "startup")  await mountStartup(mountEl);
    else if (id === "tasks")    await mountTasks(mountEl);
  }

  // ── PROCESSES ─────────────────────────────────────────────────────────────

  async function mountProcesses(el) {
    el.innerHTML = `
      <div class="panel" style="flex-shrink:0">
        <div class="toolbar-row">
          <div class="search-wrap">
            <input type="search" data-ph="proc-search" placeholder="Filtrer par nom, PID, utilisateur…" autocomplete="off" />
          </div>
          <button type="button" class="btn accent" data-ph="proc-refresh">Actualiser</button>
          <button type="button" class="btn" data-ph="proc-kill"     disabled>Terminer</button>
          <button type="button" class="btn" data-ph="proc-ws"       disabled>Vider RAM</button>
          <button type="button" class="btn" data-ph="proc-folder"   disabled>Ouvrir dossier</button>
        </div>
        <p class="meta" data-ph="proc-meta"></p>
        <div class="toolbar-row" style="gap:6px;margin-top:6px" data-ph="proc-ram-row">
          <span class="meta" data-ph="proc-ram"></span>
        </div>
      </div>
      <div class="panel flex-fill">
        <div class="table-wrap" data-ph="proc-table-wrap">
          <table class="data">
            <thead><tr>
              <th data-sort="name"  style="cursor:pointer">Nom ↕</th>
              <th data-sort="pid"   style="cursor:pointer">PID ↕</th>
              <th data-sort="cpu"   style="cursor:pointer">CPU % ↕</th>
              <th data-sort="memMb" style="cursor:pointer">RAM ↕</th>
              <th data-sort="user"  style="cursor:pointer">Utilisateur ↕</th>
              <th>Statut</th>
            </tr></thead>
            <tbody data-ph="proc-body"></tbody>
          </table>
        </div>
        <div data-ph="proc-empty" class="empty-state" hidden>Aucun processus.</div>
        <div data-ph="proc-loading" class="empty-state">Chargement…</div>
      </div>`;

    const $ = (sel) => el.querySelector(`[data-ph="${sel}"]`);
    const searchInput = $("proc-search");
    const btnRefresh  = $("proc-refresh");
    const btnKill     = $("proc-kill");
    const btnWs       = $("proc-ws");
    const btnFolder   = $("proc-folder");
    const metaEl      = $("proc-meta");
    const ramEl       = $("proc-ram");
    const tableWrap   = $("proc-table-wrap");
    const tbody       = $("proc-body");
    const emptyEl     = $("proc-empty");
    const loadingEl   = $("proc-loading");

    let allProcs = [];
    let selectedPid = null;
    let sortCol = "cpu";
    let sortDir = -1;

    async function refreshRam() {
      try {
        const r = await api.get_memory_totals();
        if (r && r.ok) {
          ramEl.textContent =
            `RAM : ${fmtBytes(r.usedBytes)} / ${fmtBytes(r.totalBytes)}  (${fmtPct(r.percentUsed)})`;
        }
      } catch (_) {}
    }

    function getFiltered() {
      return filterList(allProcs, searchInput.value.trim(), "name", "user")
        .slice()
        .sort((a, b) => sortKey(a, b, sortCol, sortDir));
    }

    function updateActionBtns() {
      const sel = selectedPid != null;
      const proc = allProcs.find((p) => p.pid === selectedPid);
      btnKill.disabled   = !sel;
      btnWs.disabled     = !sel;
      btnFolder.disabled = !sel || !proc?.path;
    }

    function renderProcs() {
      const list = getFiltered();
      loadingEl.hidden = true;
      if (!list.length) { emptyEl.hidden = false; tableWrap.hidden = true; return; }
      emptyEl.hidden = true; tableWrap.hidden = false;

      const frag = document.createDocumentFragment();
      for (const p of list) {
        const tr = document.createElement("tr");
        if (p.pid === selectedPid) tr.classList.add("is-selected");
        tr.dataset.pid = p.pid;
        tr.innerHTML =
          `<td title="${esc(p.path || "")}">${esc(p.name || "—")}</td>` +
          `<td>${esc(String(p.pid))}</td>` +
          `<td>${fmtPct(p.cpu)}</td>` +
          `<td>${fmtMb(p.memMb)}</td>` +
          `<td>${esc(p.user || "—")}</td>` +
          `<td>${esc(p.status || "—")}</td>`;
        frag.appendChild(tr);
      }
      tbody.innerHTML = "";
      tbody.appendChild(frag);
      metaEl.textContent = `${list.length} / ${allProcs.length} processus`;
    }

    tbody.addEventListener("click", (e) => {
      const tr = e.target.closest("tr[data-pid]");
      if (!tr) return;
      const pid = Number(tr.dataset.pid);
      selectedPid = pid === selectedPid ? null : pid;
      tbody.querySelectorAll("tr").forEach((r) =>
        r.classList.toggle("is-selected", Number(r.dataset.pid) === selectedPid)
      );
      updateActionBtns();
    });

    el.querySelector("thead").addEventListener("click", (e) => {
      const th = e.target.closest("[data-sort]");
      if (!th) return;
      const col = th.getAttribute("data-sort");
      if (sortCol === col) sortDir *= -1; else { sortCol = col; sortDir = 1; }
      renderProcs();
    });

    searchInput.addEventListener("input", renderProcs);
    btnRefresh.addEventListener("click", loadProcs);

    btnKill.addEventListener("click", async () => {
      if (selectedPid == null) return;
      const proc = allProcs.find((p) => p.pid === selectedPid);
      const ok = await askConfirm(
        `Terminer le processus « ${proc?.name || selectedPid} » (PID ${selectedPid}) ?`,
        "Terminer le processus"
      );
      if (!ok) return;
      try {
        const prep = await api.prepare_kill(selectedPid);
        if (!prep?.ok || !prep?.token) { setStatus("Préparation échouée : " + (prep?.error || "?"), "error"); return; }
        const res = await api.kill_process(selectedPid, prep.token);
        if (res?.ok) { setStatus(`Processus ${selectedPid} terminé.`, "ok"); selectedPid = null; await loadProcs(); }
        else setStatus("Erreur : " + (res?.error || "?"), "error");
      } catch (err) { setStatus("Erreur : " + String(err), "error"); }
    });

    btnWs.addEventListener("click", async () => {
      if (selectedPid == null) return;
      const proc = allProcs.find((p) => p.pid === selectedPid);
      const ok = await askConfirm(
        `Vider le working set de « ${proc?.name || selectedPid} » (PID ${selectedPid}) ?`,
        "Vider la RAM"
      );
      if (!ok) return;
      try {
        const prep = await api.prepare_empty_working_set(selectedPid);
        if (!prep?.ok || !prep?.token) { setStatus("Préparation échouée : " + (prep?.error || "?"), "error"); return; }
        const res = await api.empty_working_set(selectedPid, prep.token);
        if (res?.ok) { setStatus(`Working set de ${selectedPid} vidé.`, "ok"); await loadProcs(); }
        else setStatus("Erreur : " + (res?.error || "?"), "error");
      } catch (err) { setStatus("Erreur : " + String(err), "error"); }
    });

    btnFolder.addEventListener("click", () => {
      const proc = allProcs.find((p) => p.pid === selectedPid);
      if (!proc?.path) return;
      api.open_path(proc.path).catch(() => {});
    });

    async function loadProcs() {
      loadingEl.hidden = false; emptyEl.hidden = true; tableWrap.hidden = true;
      metaEl.textContent = ""; setStatus("Chargement des processus…");
      try {
        const res = await api.list_processes();
        if (!res?.ok) { setStatus("Erreur : " + (res?.error || "?"), "error"); loadingEl.hidden = true; return; }
        allProcs = Array.isArray(res.processes) ? res.processes : [];
        if (!allProcs.find((p) => p.pid === selectedPid)) { selectedPid = null; }
        renderProcs();
        updateActionBtns();
        setStatus("");
      } catch (err) { setStatus("Erreur : " + String(err), "error"); loadingEl.hidden = true; }
      await refreshRam();
    }

    await loadProcs();
  }

  // ── SERVICES ──────────────────────────────────────────────────────────────

  async function mountServices(el) {
    el.innerHTML = `
      <div class="panel" style="flex-shrink:0">
        <div class="toolbar-row">
          <div class="search-wrap">
            <input type="search" data-ph="svc-search" placeholder="Filtrer par nom ou statut…" autocomplete="off" />
          </div>
          <button type="button" class="btn accent" data-ph="svc-refresh">Actualiser</button>
        </div>
        <p class="meta" data-ph="svc-meta"></p>
      </div>
      <div class="panel flex-fill">
        <div class="table-wrap" data-ph="svc-table-wrap">
          <table class="data">
            <thead><tr>
              <th>Nom</th>
              <th>Nom affiché</th>
              <th>Statut</th>
              <th>Démarrage</th>
              <th>Actions</th>
            </tr></thead>
            <tbody data-ph="svc-body"></tbody>
          </table>
        </div>
        <div data-ph="svc-empty"   class="empty-state" hidden>Aucun service.</div>
        <div data-ph="svc-loading" class="empty-state">Chargement…</div>
      </div>`;

    const $ = (s) => el.querySelector(`[data-ph="${s}"]`);
    const searchInput = $("svc-search");
    const btnRefresh  = $("svc-refresh");
    const metaEl      = $("svc-meta");
    const tableWrap   = $("svc-table-wrap");
    const tbody       = $("svc-body");
    const emptyEl     = $("svc-empty");
    const loadingEl   = $("svc-loading");

    let allServices = [];

    function getFiltered() {
      return filterList(allServices, searchInput.value.trim(), "name", "display_name", "displayName", "status");
    }

    function renderServices() {
      const list = getFiltered();
      loadingEl.hidden = true;
      if (!list.length) { emptyEl.hidden = false; tableWrap.hidden = true; return; }
      emptyEl.hidden = true; tableWrap.hidden = false;

      const frag = document.createDocumentFragment();
      for (const svc of list) {
        const name = svc.name || svc.service_name || "—";
        const disp = svc.display_name || svc.displayName || name;
        const status = svc.status || svc.state || "—";
        const start = svc.start_type || svc.startType || svc.startup || "—";
        const running = /running|actif|started/i.test(status);
        const stopped = /stopped|arrêté|inactive/i.test(status);
        const tr = document.createElement("tr");
        tr.dataset.svcName = name;
        tr.innerHTML =
          `<td><code style="font-size:0.78rem">${esc(name)}</code></td>` +
          `<td>${esc(disp)}</td>` +
          `<td><span style="color:${running ? "var(--ok,#3dd68c)" : stopped ? "#ff8a95" : "var(--muted)"}">${esc(status)}</span></td>` +
          `<td>${esc(start)}</td>` +
          `<td>` +
          `<button type="button" class="action-btn" data-svc-action="start"   data-svc="${esc(name)}" ${running  ? "disabled" : ""}>Démarrer</button>` +
          `<button type="button" class="action-btn danger" data-svc-action="stop" data-svc="${esc(name)}" ${stopped ? "disabled" : ""}>Arrêter</button>` +
          `<button type="button" class="action-btn" data-svc-action="restart" data-svc="${esc(name)}">Redémarrer</button>` +
          `</td>`;
        frag.appendChild(tr);
      }
      tbody.innerHTML = "";
      tbody.appendChild(frag);
      metaEl.textContent = `${list.length} / ${allServices.length} service(s)`;
    }

    tbody.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-svc-action]");
      if (!btn || btn.disabled) return;
      const name   = btn.getAttribute("data-svc");
      const action = btn.getAttribute("data-svc-action");
      const labels = { start: "Démarrer", stop: "Arrêter", restart: "Redémarrer" };
      const ok = await askConfirm(
        `${labels[action] || action} le service « ${name} » ?`,
        `${labels[action] || action} le service`
      );
      if (!ok) return;
      try {
        const prep = await api.prepare_service_action(name, action);
        if (!prep?.ok || !prep?.token) { setStatus("Préparation échouée : " + (prep?.error || "?"), "error"); return; }
        const res = await api.service_action(name, action, prep.token);
        if (res?.ok) { setStatus(`Service « ${name} » : ${action} effectué.`, "ok"); await loadServices(); }
        else setStatus("Erreur : " + (res?.error || "?"), "error");
      } catch (err) { setStatus("Erreur : " + String(err), "error"); }
    });

    searchInput.addEventListener("input", renderServices);
    btnRefresh.addEventListener("click", loadServices);

    async function loadServices() {
      loadingEl.hidden = false; emptyEl.hidden = true; tableWrap.hidden = true;
      metaEl.textContent = ""; setStatus("Chargement des services…");
      try {
        const res = await api.list_services();
        if (!res?.ok) { setStatus("Erreur : " + (res?.error || "?"), "error"); loadingEl.hidden = true; return; }
        // defensive: handle {services:[…]} or {items:[…]}
        const raw = Array.isArray(res.services)
          ? res.services
          : Array.isArray(res.items)
          ? res.items
          : [];
        allServices = raw.map(normService);
        renderServices();
        setStatus("");
      } catch (err) { setStatus("Erreur : " + String(err), "error"); loadingEl.hidden = true; }
    }

    await loadServices();
  }

  // ── STARTUP ───────────────────────────────────────────────────────────────

  async function mountStartup(el) {
    el.innerHTML = `
      <div class="panel" style="flex-shrink:0">
        <div class="toolbar-row">
          <div class="search-wrap">
            <input type="search" data-ph="su-search" placeholder="Filtrer par nom ou commande…" autocomplete="off" />
          </div>
          <button type="button" class="btn accent" data-ph="su-refresh">Actualiser</button>
        </div>
        <p class="meta" data-ph="su-meta"></p>
      </div>
      <div class="panel flex-fill">
        <div class="table-wrap" data-ph="su-table-wrap">
          <table class="data">
            <thead><tr>
              <th>Nom</th>
              <th>Type</th>
              <th>Commande</th>
              <th>Activé</th>
              <th>Actions</th>
            </tr></thead>
            <tbody data-ph="su-body"></tbody>
          </table>
        </div>
        <div data-ph="su-empty"   class="empty-state" hidden>Aucun élément de démarrage.</div>
        <div data-ph="su-loading" class="empty-state">Chargement…</div>
      </div>`;

    const $ = (s) => el.querySelector(`[data-ph="${s}"]`);
    const searchInput = $("su-search");
    const btnRefresh  = $("su-refresh");
    const metaEl      = $("su-meta");
    const tableWrap   = $("su-table-wrap");
    const tbody       = $("su-body");
    const emptyEl     = $("su-empty");
    const loadingEl   = $("su-loading");

    let allItems = [];

    function getFiltered() {
      return filterList(allItems, searchInput.value.trim(), "name", "command", "path");
    }

    function renderStartup() {
      const list = getFiltered();
      loadingEl.hidden = true;
      if (!list.length) { emptyEl.hidden = false; tableWrap.hidden = true; return; }
      emptyEl.hidden = true; tableWrap.hidden = false;

      const frag = document.createDocumentFragment();
      for (const item of list) {
        const enabled = !!item.enabled;
        const toggleable = item.toggleable !== false;
        const tr = document.createElement("tr");
        tr.innerHTML =
          `<td title="${esc(item.name)}">${esc(item.name || "—")}</td>` +
          `<td>${esc(item.type || item.hive || "—")}</td>` +
          `<td class="wrap" title="${esc(item.command || item.path || "")}" style="max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(item.command || item.path || "—")}</td>` +
          `<td><span style="color:${enabled ? "var(--ok,#3dd68c)" : "#ff8a95"}">${enabled ? "Oui" : "Non"}</span></td>` +
          `<td>` +
          `<button type="button" class="action-btn${enabled ? " danger" : ""}" data-su-toggle data-su-idx="${esc(String(allItems.indexOf(item)))}" ${toggleable ? "" : "disabled"} title="${toggleable ? "" : "Non modifiable"}">${enabled ? "Désactiver" : "Activer"}</button>` +
          `</td>`;
        frag.appendChild(tr);
      }
      tbody.innerHTML = "";
      tbody.appendChild(frag);
      metaEl.textContent = `${list.length} / ${allItems.length} entrée(s)`;
    }

    tbody.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-su-toggle]");
      if (!btn || btn.disabled) return;
      const idx = Number(btn.getAttribute("data-su-idx"));
      const item = allItems[idx];
      if (!item) return;
      const enable = !item.enabled;
      const ok = await askConfirm(
        `${enable ? "Activer" : "Désactiver"} « ${item.name} » au démarrage ?`,
        `${enable ? "Activer" : "Désactiver"} l'entrée`
      );
      if (!ok) return;
      try {
        const res = await api.toggle_startup_item(item);
        if (res?.ok) {
          setStatus(`Entrée « ${item.name} » ${enable ? "activée" : "désactivée"}.`, "ok");
          await loadStartup();
        } else {
          setStatus("Erreur : " + (res?.error || "?"), "error");
        }
      } catch (err) { setStatus("Erreur : " + String(err), "error"); }
    });

    searchInput.addEventListener("input", renderStartup);
    btnRefresh.addEventListener("click", loadStartup);

    async function loadStartup() {
      loadingEl.hidden = false; emptyEl.hidden = true; tableWrap.hidden = true;
      metaEl.textContent = ""; setStatus("Chargement du démarrage…");
      try {
        const res = await api.list_startup();
        if (!res?.ok) { setStatus("Erreur : " + (res?.error || "?"), "error"); loadingEl.hidden = true; return; }
        allItems = Array.isArray(res.items) ? res.items : [];
        renderStartup();
        setStatus("");
      } catch (err) { setStatus("Erreur : " + String(err), "error"); loadingEl.hidden = true; }
    }

    await loadStartup();
  }

  // ── TASKS ─────────────────────────────────────────────────────────────────

  async function mountTasks(el) {
    el.innerHTML = `
      <div class="panel" style="flex-shrink:0">
        <div class="toolbar-row">
          <div class="search-wrap">
            <input type="search" data-ph="tk-search" placeholder="Filtrer par nom ou chemin…" autocomplete="off" />
          </div>
          <button type="button" class="btn accent" data-ph="tk-refresh">Actualiser</button>
        </div>
        <p class="meta" data-ph="tk-meta"></p>
      </div>
      <div class="panel flex-fill">
        <div class="table-wrap" data-ph="tk-table-wrap">
          <table class="data">
            <thead><tr>
              <th>Nom</th>
              <th>Chemin</th>
              <th>Statut</th>
              <th>Activé</th>
              <th>Actions</th>
            </tr></thead>
            <tbody data-ph="tk-body"></tbody>
          </table>
        </div>
        <div data-ph="tk-empty"   class="empty-state" hidden>Aucune tâche.</div>
        <div data-ph="tk-loading" class="empty-state">Chargement…</div>
      </div>`;

    const $ = (s) => el.querySelector(`[data-ph="${s}"]`);
    const searchInput = $("tk-search");
    const btnRefresh  = $("tk-refresh");
    const metaEl      = $("tk-meta");
    const tableWrap   = $("tk-table-wrap");
    const tbody       = $("tk-body");
    const emptyEl     = $("tk-empty");
    const loadingEl   = $("tk-loading");

    let allTasks = [];

    function getFiltered() {
      return filterList(allTasks, searchInput.value.trim(), "name", "task_name", "path", "task_path");
    }

    function renderTasks() {
      const list = getFiltered();
      loadingEl.hidden = true;
      if (!list.length) { emptyEl.hidden = false; tableWrap.hidden = true; return; }
      emptyEl.hidden = true; tableWrap.hidden = false;

      const frag = document.createDocumentFragment();
      for (const task of list) {
        const name     = task.task_name || task.name || task.TaskName || "—";
        const path     = task.task_path || task.path || task.TaskPath || "";
        const status   = task.status || task.state || "—";
        const enabled  = task.enabled !== false && !/disabled/i.test(String(status));
        const tr = document.createElement("tr");
        tr.innerHTML =
          `<td title="${esc(name)}">${esc(name)}</td>` +
          `<td class="wrap" style="font-size:0.76rem;color:var(--muted)">${esc(path)}</td>` +
          `<td>${esc(status)}</td>` +
          `<td><span style="color:${enabled ? "var(--ok,#3dd68c)" : "#ff8a95"}">${enabled ? "Oui" : "Non"}</span></td>` +
          `<td>` +
          `<button type="button" class="action-btn${enabled ? " danger" : ""}" data-tk-toggle data-tk-name="${esc(name)}" data-tk-path="${esc(path)}" data-tk-enabled="${enabled ? "1" : "0"}">${enabled ? "Désactiver" : "Activer"}</button>` +
          `</td>`;
        frag.appendChild(tr);
      }
      tbody.innerHTML = "";
      tbody.appendChild(frag);
      metaEl.textContent = `${list.length} / ${allTasks.length} tâche(s)`;
    }

    tbody.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-tk-toggle]");
      if (!btn || btn.disabled) return;
      const taskName = btn.getAttribute("data-tk-name");
      const taskPath = btn.getAttribute("data-tk-path");
      const enable   = btn.getAttribute("data-tk-enabled") !== "1";
      const ok = await askConfirm(
        `${enable ? "Activer" : "Désactiver"} la tâche « ${taskName} » ?`,
        `${enable ? "Activer" : "Désactiver"} la tâche`
      );
      if (!ok) return;
      try {
        const prep = await api.prepare_set_task_enabled(taskName, taskPath, enable);
        if (!prep?.ok || !prep?.token) { setStatus("Préparation échouée : " + (prep?.error || "?"), "error"); return; }
        const res = await api.set_task_enabled(taskName, taskPath, enable, prep.token);
        if (res?.ok) {
          setStatus(`Tâche « ${taskName} » ${enable ? "activée" : "désactivée"}.`, "ok");
          await loadTasks();
        } else {
          setStatus("Erreur : " + (res?.error || "?"), "error");
        }
      } catch (err) { setStatus("Erreur : " + String(err), "error"); }
    });

    searchInput.addEventListener("input", renderTasks);
    btnRefresh.addEventListener("click", loadTasks);

    async function loadTasks() {
      loadingEl.hidden = false; emptyEl.hidden = true; tableWrap.hidden = true;
      metaEl.textContent = ""; setStatus("Chargement des tâches…");
      try {
        const res = await api.list_tasks();
        if (!res?.ok) { setStatus("Erreur : " + (res?.error || "?"), "error"); loadingEl.hidden = true; return; }
        // defensive: handle {tasks:[…]}, {items:[…]}, or array directly
        const raw = Array.isArray(res.tasks)
          ? res.tasks
          : Array.isArray(res.items)
          ? res.items
          : Array.isArray(res)
          ? res
          : [];
        allTasks = raw.map(normTask);
        renderTasks();
        setStatus("");
      } catch (err) { setStatus("Erreur : " + String(err), "error"); loadingEl.hidden = true; }
    }

    await loadTasks();
  }

  // ── Boot first segment ────────────────────────────────────────────────────
  await setSegment("processes");
}
