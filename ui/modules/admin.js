import { apiNs, esc, confirmMutator } from "./_hub_util.js";

export async function mount(root) {
  root.innerHTML = `
    <div class="hub-module-panel">
      <header class="hub-page-header">
        <h1>Admin léger</h1>
        <p>PowerPlan · PrintQueue · RestorePoint · UserSessions</p>
      </header>
      <div class="hub-module-apps" style="margin-bottom:.75rem">
        <button type="button" class="hub-btn" data-seg="power">PowerPlan</button>
        <button type="button" class="hub-btn" data-seg="print">PrintQueue</button>
        <button type="button" class="hub-btn" data-seg="rp">RestorePoint</button>
        <button type="button" class="hub-btn" data-seg="sess">Sessions</button>
      </div>
      <div id="adBody" class="hub-skel kpi" style="min-height:12rem"></div>
      <p class="hub-status" id="adStatus"></p>
    </div>`;
  const body = root.querySelector("#adBody");
  const status = root.querySelector("#adStatus");

  async function showPower() {
    const api = apiNs("admin.powerplan");
    body.classList.add("hub-skel", "kpi");
    body.innerHTML = "";
    const res = await api.list_plans();
    body.classList.remove("hub-skel", "kpi");
    if (!res?.ok) {
      body.innerHTML = `<p class="hub-note">${esc(res?.error || "Échec")}</p>`;
      return;
    }
    const plans = res.plans || [];
    body.innerHTML = `<div class="hub-module-apps" style="margin-bottom:.5rem">
        <button type="button" class="hub-btn accent" id="btnPP">Fenêtre PowerPlan</button>
      </div>
      <ul id="adPlans" style="list-style:none;padding:0"></ul>`;
    const ul = body.querySelector("#adPlans");
    plans.forEach((p) => {
      const li = document.createElement("li");
      li.style.cssText = "display:flex;gap:.5rem;align-items:center;margin:.35rem 0";
      li.innerHTML = `<code style="flex:1">${esc(p.name)}${p.active ? " ★" : ""}</code>
        <button type="button" class="hub-btn" data-guid="${esc(p.guid)}" ${p.active ? "disabled" : ""}>Activer</button>`;
      ul.appendChild(li);
    });
    ul.addEventListener("click", async (ev) => {
      const t = ev.target;
      if (!(t instanceof HTMLElement) || !t.dataset.guid) return;
      const payload = { guid: t.dataset.guid };
      const c = await confirmMutator("admin.powerplan", "set_plan", payload, "Activer ce plan d'alimentation ?");
      if (!c.ok) return;
      const r = await api.set_plan(t.dataset.guid, c.token);
      status.textContent = r.ok ? "Plan activé" : (r.error || "Échec");
      if (r.ok) showPower();
    });
    body.querySelector("#btnPP")?.addEventListener("click", async () => {
      const r = await api.open_dedicated();
      status.textContent = r?.ok ? "PowerPlan lancé" : (r?.error || "Échec");
    });
    status.textContent = `${plans.length} plans`;
  }

  async function showPrint() {
    const api = apiNs("admin.printqueue");
    body.classList.add("hub-skel", "kpi");
    body.innerHTML = "";
    const res = await api.list_print_queue();
    body.classList.remove("hub-skel", "kpi");
    if (!res?.ok) {
      body.innerHTML = `<p class="hub-note">${esc(res?.error || "Échec")}</p>`;
      return;
    }
    const printers = res.printers || [];
    body.innerHTML = `<div class="hub-module-apps" style="margin-bottom:.5rem">
        <button type="button" class="hub-btn accent" id="btnPQ">Fenêtre PrintQueue</button>
      </div>
      <table style="width:100%;font-size:.85rem"><thead><tr><th>Imprimante</th><th>Jobs</th><th></th></tr></thead>
      <tbody id="adPrint"></tbody></table>`;
    const tb = body.querySelector("#adPrint");
    printers.forEach((p) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${esc(p.name)}</td><td>${esc(p.jobCount)}</td>
        <td><button type="button" class="hub-btn" data-purge="${esc(p.name)}">Purger</button></td>`;
      tb.appendChild(tr);
    });
    tb.addEventListener("click", async (ev) => {
      const t = ev.target;
      if (!(t instanceof HTMLElement) || !t.dataset.purge) return;
      const payload = { printer_name: t.dataset.purge };
      const c = await confirmMutator(
        "admin.printqueue",
        "purge_printer_jobs",
        payload,
        `Purger la file « ${t.dataset.purge} » ?`
      );
      if (!c.ok) return;
      const r = await api.purge_printer_jobs(t.dataset.purge, c.token);
      status.textContent = r.ok ? `Purge ${r.removed} jobs` : (r.error || "Échec");
      if (r.ok) showPrint();
    });
    body.querySelector("#btnPQ")?.addEventListener("click", async () => {
      const r = await api.open_dedicated();
      status.textContent = r?.ok ? "PrintQueue lancé" : (r?.error || "Échec");
    });
    status.textContent = `${res.printerCount || 0} imprimantes · ${res.jobCount || 0} jobs`;
  }

  async function showRp() {
    const api = apiNs("admin.restorepoint");
    body.classList.add("hub-skel", "kpi");
    body.innerHTML = "";
    const res = await api.list_restore_points();
    body.classList.remove("hub-skel", "kpi");
    const items = res?.items || [];
    body.innerHTML = `
      <div class="hub-module-apps" style="margin-bottom:.5rem">
        <input id="rpDesc" placeholder="Description…" style="min-width:14rem"/>
        <button type="button" class="hub-btn accent" id="rpCreate">Créer</button>
        <button type="button" class="hub-btn" id="btnRP">Fenêtre dédiée</button>
      </div>
      <table style="width:100%;font-size:.8rem"><thead><tr><th>#</th><th>Description</th><th>Date</th></tr></thead>
      <tbody id="rpRows"></tbody></table>`;
    const tb = body.querySelector("#rpRows");
    items.forEach((it) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${esc(it.sequence)}</td><td>${esc(it.description)}</td><td>${esc(it.creationTime)}</td>`;
      tb.appendChild(tr);
    });
    body.querySelector("#rpCreate")?.addEventListener("click", async () => {
      const description = body.querySelector("#rpDesc")?.value?.trim() || "";
      const payload = { description: description || "Mr-Aurevo-X RestorePoint" };
      const c = await confirmMutator(
        "admin.restorepoint",
        "create_restore_point",
        payload,
        "Créer un point de restauration ?"
      );
      if (!c.ok) return;
      status.textContent = "Création…";
      const r = await api.create_restore_point(payload.description, c.token);
      status.textContent = r.ok ? "Point créé" : (r.error || "Échec");
      if (r.ok) showRp();
    });
    body.querySelector("#btnRP")?.addEventListener("click", async () => {
      const r = await api.open_dedicated();
      status.textContent = r?.ok ? "RestorePoint lancé" : (r?.error || "Échec");
    });
    status.textContent = res?.ok ? `${items.length} points` : (res?.error || "Échec");
  }

  async function showSess() {
    const api = apiNs("admin.usersessions");
    body.classList.add("hub-skel", "kpi");
    body.innerHTML = "";
    const res = await api.list_sessions();
    body.classList.remove("hub-skel", "kpi");
    if (!res?.ok) {
      body.innerHTML = `<p class="hub-note">${esc(res?.error || "Échec")}</p>`;
      return;
    }
    const items = res.items || [];
    body.innerHTML = `<div class="hub-module-apps" style="margin-bottom:.5rem">
        <button type="button" class="hub-btn accent" id="btnUS">Fenêtre UserSessions</button>
      </div>
      <table style="width:100%;font-size:.85rem"><thead>
      <tr><th>User</th><th>ID</th><th>État</th><th></th></tr></thead>
      <tbody id="adSess"></tbody></table>`;
    const tb = body.querySelector("#adSess");
    items.forEach((s) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${esc(s.user)}</td><td>${esc(s.id)}</td><td>${esc(s.state)}</td>
        <td><button type="button" class="hub-btn" data-sid="${esc(s.id)}">Logoff</button></td>`;
      tb.appendChild(tr);
    });
    tb.addEventListener("click", async (ev) => {
      const t = ev.target;
      if (!(t instanceof HTMLElement) || !t.dataset.sid) return;
      const session_id = +t.dataset.sid;
      const payload = { session_id };
      const c = await confirmMutator(
        "admin.usersessions",
        "logoff_session",
        payload,
        `Déconnecter la session ${session_id} ?`
      );
      if (!c.ok) return;
      const r = await api.logoff_session(session_id, c.token);
      status.textContent = r.ok ? "Session déconnectée" : (r.error || "Échec");
      if (r.ok) showSess();
    });
    body.querySelector("#btnUS")?.addEventListener("click", async () => {
      const r = await api.open_dedicated();
      status.textContent = r?.ok ? "UserSessions lancé" : (r?.error || "Échec");
    });
    status.textContent = `${items.length} sessions (${res.method || "?"})`;
  }

  root.querySelectorAll("[data-seg]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const s = btn.dataset.seg;
      if (s === "print") showPrint();
      else if (s === "rp") showRp();
      else if (s === "sess") showSess();
      else showPower();
    });
  });
  await showPower();
}
