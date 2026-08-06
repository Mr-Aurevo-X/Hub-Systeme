import { apiNs, esc, confirmMutator } from "./_hub_util.js";

export async function mount(root) {
  const api = apiNs("processhub");
  root.innerHTML = `
    <div class="hub-module-panel">
      <header class="hub-page-header">
        <h1>ProcessHub</h1>
        <p>ProcessGuard · StartupX — ConfirmGate sur mutators</p>
      </header>
      <div class="hub-module-apps" style="margin-bottom:.75rem">
        <button type="button" class="hub-btn" data-seg="procs">Processus</button>
        <button type="button" class="hub-btn" data-seg="svc">Services</button>
        <button type="button" class="hub-btn" data-seg="tasks">Tâches</button>
        <button type="button" class="hub-btn accent" data-open="ProcessGuard">ProcessGuard</button>
        <button type="button" class="hub-btn accent" data-open="StartupX">StartupX</button>
      </div>
      <div id="phBody" class="hub-skel kpi" style="min-height:12rem"></div>
      <p class="hub-status" id="phStatus"></p>
    </div>`;
  const body = root.querySelector("#phBody");
  const status = root.querySelector("#phStatus");

  async function showProcs() {
    body.classList.add("hub-skel", "kpi");
    body.innerHTML = "";
    status.textContent = "Scan processus…";
    const res = await api.list_processes();
    body.classList.remove("hub-skel", "kpi");
    if (!res?.ok) {
      body.innerHTML = `<p class="hub-note">${esc(res?.error || "Échec")}</p>`;
      return;
    }
    const rows = (res.processes || []).slice(0, 120);
    body.innerHTML = `<table style="width:100%;font-size:.8rem"><thead>
      <tr><th>PID</th><th>Nom</th><th>CPU</th><th>Mo</th><th></th></tr></thead>
      <tbody id="phRows"></tbody></table>`;
    const tb = body.querySelector("#phRows");
    rows.forEach((p) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${esc(p.pid)}</td><td>${esc(p.name)}</td><td>${esc(p.cpu)}</td><td>${esc(p.memMb)}</td>
        <td style="white-space:nowrap">
          <button type="button" class="hub-btn" data-kill="${esc(p.pid)}">Kill</button>
          <button type="button" class="hub-btn" data-trim="${esc(p.pid)}">Trim WS</button>
        </td>`;
      tb.appendChild(tr);
    });
    status.textContent = `${res.count || rows.length} processus`;
  }

  async function showSvc() {
    body.classList.add("hub-skel", "kpi");
    body.innerHTML = "";
    const res = await api.list_services();
    body.classList.remove("hub-skel", "kpi");
    if (!res?.ok) {
      body.innerHTML = `<p class="hub-note">${esc(res?.error || "Échec")}</p>`;
      return;
    }
    const rows = (res.services || []).slice(0, 150);
    body.innerHTML = `<table style="width:100%;font-size:.8rem"><thead>
      <tr><th>Nom</th><th>Affichage</th><th>État</th><th></th></tr></thead>
      <tbody id="phSvc"></tbody></table>`;
    const tb = body.querySelector("#phSvc");
    rows.forEach((s) => {
      const name = s.Name || s.name || "";
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${esc(name)}</td><td>${esc(s.DisplayName || "")}</td><td>${esc(s.Status || "")}</td>
        <td style="white-space:nowrap">
          <button type="button" class="hub-btn" data-svc="${esc(name)}" data-act="start">Start</button>
          <button type="button" class="hub-btn" data-svc="${esc(name)}" data-act="stop">Stop</button>
          <button type="button" class="hub-btn" data-svc="${esc(name)}" data-act="restart">Restart</button>
        </td>`;
      tb.appendChild(tr);
    });
    status.textContent = `${res.count || rows.length} services`;
  }

  async function showTasks() {
    body.classList.add("hub-skel", "kpi");
    body.innerHTML = "";
    const res = await api.list_tasks();
    body.classList.remove("hub-skel", "kpi");
    if (!res?.ok) {
      body.innerHTML = `<p class="hub-note">${esc(res?.error || "Échec")}</p>`;
      return;
    }
    const rows = (res.tasks || []).slice(0, 150);
    body.innerHTML = `<table style="width:100%;font-size:.8rem"><thead>
      <tr><th>Tâche</th><th>Chemin</th><th>État</th><th></th></tr></thead>
      <tbody id="phTasks"></tbody></table>`;
    const tb = body.querySelector("#phTasks");
    rows.forEach((t) => {
      const tn = t.TaskName || t.taskName || "";
      const tp = t.TaskPath || t.taskPath || "\\";
      const en = t.Enabled !== false;
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${esc(tn)}</td><td>${esc(tp)}</td><td>${esc(t.State || "")}</td>
        <td><button type="button" class="hub-btn" data-tn="${esc(tn)}" data-tp="${esc(tp)}" data-en="${en ? "0" : "1"}">
          ${en ? "Désactiver" : "Activer"}</button></td>`;
      tb.appendChild(tr);
    });
    status.textContent = `${res.count || rows.length} tâches`;
  }

  body.addEventListener("click", async (ev) => {
    const t = ev.target;
    if (!(t instanceof HTMLElement)) return;
    if (t.dataset.kill) {
      const pid = +t.dataset.kill;
      const payload = { pid };
      const c = await confirmMutator("processhub", "kill_process", payload, `Tuer PID ${pid} ?`);
      if (!c.ok) return;
      const r = await api.kill_process(pid, c.token);
      status.textContent = r.ok ? `Tué ${r.name}` : (r.error || "Échec");
      if (r.ok) showProcs();
    } else if (t.dataset.trim) {
      const pid = +t.dataset.trim;
      const payload = { pid };
      const c = await confirmMutator("processhub", "empty_working_set", payload, `Trim working set PID ${pid} ?`);
      if (!c.ok) return;
      const r = await api.empty_working_set(pid, c.token);
      status.textContent = r.ok ? `Trim ${r.name}` : (r.error || "Échec");
    } else if (t.dataset.svc && t.dataset.act) {
      const name = t.dataset.svc;
      const action = t.dataset.act;
      const payload = { name, action };
      const c = await confirmMutator("processhub", "service_action", payload, `${action} service ${name} ?`);
      if (!c.ok) return;
      const r = await api.service_action(name, action, c.token);
      status.textContent = r.ok ? `OK ${action} ${name}` : (r.error || "Échec");
      if (r.ok) showSvc();
    } else if (t.dataset.tn != null) {
      const task_name = t.dataset.tn;
      const task_path = t.dataset.tp || "\\";
      const enabled = t.dataset.en === "1";
      const payload = { task_name, task_path, enabled };
      const c = await confirmMutator(
        "processhub",
        "set_task_enabled",
        payload,
        `${enabled ? "Activer" : "Désactiver"} ${task_name} ?`
      );
      if (!c.ok) return;
      const r = await api.set_task_enabled(task_name, task_path, enabled, c.token);
      status.textContent = r.ok ? "Tâche mise à jour" : (r.error || "Échec");
      if (r.ok) showTasks();
    }
  });

  root.querySelectorAll("[data-seg]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const s = btn.dataset.seg;
      if (s === "svc") showSvc();
      else if (s === "tasks") showTasks();
      else showProcs();
    });
  });
  root.querySelectorAll("[data-open]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const r = await api.open_dedicated(btn.dataset.open);
      status.textContent = r?.ok ? `${btn.dataset.open} lancé` : (r?.error || "Échec");
    });
  });
  await showProcs();
}
