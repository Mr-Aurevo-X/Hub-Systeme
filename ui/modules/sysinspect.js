import { apiNs, esc, confirmMutator } from "./_hub_util.js";

export async function mount(root) {
  const api = apiNs("sysinspect");
  root.innerHTML = `
    <div class="hub-module-panel">
      <header class="hub-page-header">
        <h1>SysInspect</h1>
        <p>Événements d'erreur · pilotes signés (lecture seule)</p>
      </header>
      <div class="hub-module-apps" style="margin-bottom:.75rem">
        <button type="button" class="hub-btn" data-seg="errors">Erreurs</button>
        <button type="button" class="hub-btn" data-seg="drivers">Pilotes</button>
        <button type="button" class="hub-btn accent" id="btnDedicated">Fenêtre dédiée</button>
      </div>
      <div id="siBody" class="hub-skel kpi" style="min-height:12rem"></div>
      <p class="hub-status" id="siStatus"></p>
    </div>`;
  const body = root.querySelector("#siBody");
  const status = root.querySelector("#siStatus");

  async function showErrors() {
    body.classList.add("hub-skel", "kpi");
    body.innerHTML = "";
    status.textContent = "Chargement…";
    const res = await api.recent_errors(40, "System");
    body.classList.remove("hub-skel", "kpi");
    if (!res?.ok) {
      body.innerHTML = `<p class="hub-note">${esc(res?.error || "Échec")}</p>`;
      status.textContent = res?.error || "Échec";
      return;
    }
    const rows = res.events || [];
    body.innerHTML = `<table style="width:100%;font-size:.8rem"><thead>
      <tr><th>Heure</th><th>Id</th><th>Source</th><th>Message</th></tr></thead>
      <tbody id="siRows"></tbody></table>`;
    const tb = body.querySelector("#siRows");
    rows.forEach((e) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${esc(e.TimeCreated || "")}</td><td>${esc(e.Id)}</td>
        <td>${esc(e.ProviderName || "")}</td><td>${esc(e.Message || "")}</td>`;
      tb.appendChild(tr);
    });
    status.textContent = `${rows.length} événements (${res.log || "System"})`;
  }

  async function showDrivers() {
    body.classList.add("hub-skel", "kpi");
    body.innerHTML = "";
    status.textContent = "Chargement pilotes…";
    const res = await api.list_drivers();
    body.classList.remove("hub-skel", "kpi");
    if (!res?.ok) {
      body.innerHTML = `<p class="hub-note">${esc(res?.error || "Échec")}</p>`;
      status.textContent = res?.error || "Échec";
      return;
    }
    const rows = (res.drivers || []).slice(0, 200);
    body.innerHTML = `<table style="width:100%;font-size:.8rem"><thead>
      <tr><th>Périphérique</th><th>Version</th><th>Fabricant</th><th>Signé</th></tr></thead>
      <tbody id="siDrv"></tbody></table>`;
    const tb = body.querySelector("#siDrv");
    rows.forEach((d) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${esc(d.DeviceName || "")}</td><td>${esc(d.DriverVersion || "")}</td>
        <td>${esc(d.Manufacturer || "")}</td><td>${esc(d.IsSigned)}</td>`;
      tb.appendChild(tr);
    });
    status.textContent = `${res.count || rows.length} pilotes`;
  }

  root.querySelectorAll("[data-seg]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.seg === "drivers") showDrivers();
      else showErrors();
    });
  });
  root.querySelector("#btnDedicated")?.addEventListener("click", async () => {
    const r = await api.open_dedicated();
    status.textContent = r?.ok ? "SysInspect lancé" : (r?.error || "Échec lancement");
  });
  await showErrors();
}
