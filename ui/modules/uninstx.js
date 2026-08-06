import { apiNs, esc, confirmMutator } from "./_hub_util.js";

export async function mount(root) {
  const api = apiNs("uninstx");
  root.innerHTML = `
    <div class="hub-module-panel">
      <header class="hub-page-header">
        <h1>UninstX</h1>
        <p>Désinstallation catalogue · leftovers · ConfirmGate</p>
      </header>
      <div class="hub-module-apps" style="margin-bottom:.75rem">
        <input type="search" id="uxQ" placeholder="Filtrer…" style="min-width:12rem"/>
        <button type="button" class="hub-btn" id="uxRefresh">Actualiser</button>
        <button type="button" class="hub-btn accent" id="btnDedicated">Fenêtre dédiée</button>
      </div>
      <div id="uxBody" class="hub-skel kpi" style="min-height:12rem"></div>
      <p class="hub-status" id="uxStatus"></p>
    </div>`;
  const body = root.querySelector("#uxBody");
  const status = root.querySelector("#uxStatus");
  let apps = [];

  async function refresh() {
    body.classList.add("hub-skel", "kpi");
    body.innerHTML = "";
    const q = root.querySelector("#uxQ")?.value || "";
    status.textContent = "Chargement…";
    const res = await api.list_apps(q);
    body.classList.remove("hub-skel", "kpi");
    if (!res?.ok) {
      body.innerHTML = `<p class="hub-note">${esc(res?.error || "Échec")}</p>`;
      status.textContent = res?.error || "Échec";
      return;
    }
    apps = res.apps || [];
    body.innerHTML = `<table style="width:100%;font-size:.8rem"><thead>
      <tr><th>Nom</th><th>Version</th><th>Éditeur</th><th></th></tr></thead>
      <tbody id="uxRows"></tbody></table>
      <div id="uxLeft" style="margin-top:.75rem"></div>`;
    const tb = body.querySelector("#uxRows");
    apps.slice(0, 300).forEach((a) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${esc(a.name)}</td><td>${esc(a.version)}</td><td>${esc(a.publisher)}</td>
        <td style="white-space:nowrap">
          <button type="button" class="hub-btn" data-un="${esc(a.id)}">Désinstaller</button>
          <button type="button" class="hub-btn" data-left="${esc(a.id)}">Leftovers</button>
        </td>`;
      tb.appendChild(tr);
    });
    status.textContent = `${apps.length} apps`;
  }

  body.addEventListener("click", async (ev) => {
    const t = ev.target;
    if (!(t instanceof HTMLElement)) return;
    if (t.dataset.un) {
      const id = t.dataset.un;
      const app = apps.find((x) => x.id === id);
      const payload = { app_id: id };
      const c = await confirmMutator(
        "uninstx",
        "uninstall_app",
        payload,
        `Lancer la désinstallation de « ${app?.name || id} » ?`
      );
      if (!c.ok) {
        status.textContent = c.error;
        return;
      }
      const r = await api.uninstall_app(id, c.token);
      status.textContent = r.ok ? "Désinstallateur lancé" : (r.error || "Échec");
    } else if (t.dataset.left) {
      const id = t.dataset.left;
      const app = apps.find((x) => x.id === id);
      if (!app) return;
      const left = body.querySelector("#uxLeft");
      left.innerHTML = `<p class="hub-note">Scan leftovers…</p>`;
      const r = await api.scan_leftovers(app.name, app.location || "");
      if (!r.ok) {
        left.innerHTML = `<p class="hub-note">${esc(r.error)}</p>`;
        return;
      }
      const paths = r.paths || [];
      left.innerHTML = `<p class="hub-note">${paths.length} chemins suspects</p>
        <ul style="font-size:.8rem;max-height:10rem;overflow:auto">${paths
          .map(
            (p) =>
              `<li><code>${esc(p)}</code> <button type="button" class="hub-btn" data-open="${esc(p)}">Ouvrir</button></li>`
          )
          .join("")}</ul>`;
    } else if (t.dataset.open) {
      const r = await api.open_folder(t.dataset.open);
      status.textContent = r.ok ? "Dossier ouvert" : (r.error || "Échec");
    }
  });

  root.querySelector("#uxRefresh")?.addEventListener("click", refresh);
  root.querySelector("#uxQ")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") refresh();
  });
  root.querySelector("#btnDedicated")?.addEventListener("click", async () => {
    const r = await api.open_dedicated();
    status.textContent = r?.ok ? "UninstX lancé" : (r?.error || "Échec");
  });
  await refresh();
}
