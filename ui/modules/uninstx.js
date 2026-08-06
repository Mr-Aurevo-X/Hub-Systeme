/**
 * UninstX — fusion native in-hub (pas d'iframe / pas de fausse fenêtre).
 * Bridge: pywebview.api.uninstx.*
 */
import { apiNs, esc } from "./_hub_util.js";

function ensureCss() {
  const id = "hub-uninstx-css";
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = "./modules/uninstx.css";
  document.head.appendChild(link);
}

async function waitUninstApi(timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const api = apiNs("uninstx");
    if (api && typeof api.list_apps === "function") return api;
    await new Promise((r) => setTimeout(r, 40));
  }
  return apiNs("uninstx");
}

export async function mount(root) {
  ensureCss();

  root.innerHTML = `
    <div class="hub-uninstx">
      <header class="hub-page-header">
        <h1>UninstX</h1>
        <p>Programmes installés — désinstallation avec confirmation · L'Atelier PC Command</p>
      </header>

      <div class="ux-content">
        <div class="toolbar-panel panel">
          <div class="toolbar-row">
            <div class="search-wrap">
              <input type="search" id="uxSearch" placeholder="Filtrer par nom ou éditeur…" autocomplete="off" />
            </div>
            <button type="button" class="btn accent" id="uxRefresh">Actualiser</button>
          </div>
          <p class="apps-meta" id="uxMeta"></p>
        </div>

        <div class="panel apps-panel" id="uxAppsPanel">
          <div id="uxLoading" class="empty-state">Chargement…</div>
          <div id="uxEmpty" class="empty-state" hidden>Aucun programme trouvé.</div>
          <div class="table-wrap" id="uxTableWrap" hidden>
            <table class="apps-table">
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>Version</th>
                  <th>Éditeur</th>
                  <th>Source</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody id="uxBody"></tbody>
            </table>
          </div>
        </div>

        <div class="panel leftovers-panel" id="uxLeftovers" hidden>
          <div class="leftovers-header">
            <h3 id="uxLeftTitle">Fichiers résiduels</h3>
            <button type="button" class="btn ghost" id="uxLeftClose" title="Fermer">✕</button>
          </div>
          <p class="leftovers-app" id="uxLeftApp"></p>
          <div id="uxLeftBody" class="leftovers-body"></div>
        </div>
      </div>

      <div class="confirm-overlay" id="uxConfirm" hidden>
        <div class="confirm-box" role="dialog" aria-modal="true">
          <h3>Confirmer la désinstallation</h3>
          <p id="uxConfirmMsg"></p>
          <div class="btn-row">
            <button type="button" class="btn" id="uxConfirmCancel">Annuler</button>
            <button type="button" class="btn danger" id="uxConfirmOk">Désinstaller</button>
          </div>
        </div>
      </div>

      <p class="status" id="uxStatus"></p>
    </div>`;

  const api = await waitUninstApi();
  const searchInput = root.querySelector("#uxSearch");
  const btnRefresh = root.querySelector("#uxRefresh");
  const loadingState = root.querySelector("#uxLoading");
  const emptyState = root.querySelector("#uxEmpty");
  const tableWrap = root.querySelector("#uxTableWrap");
  const appsBody = root.querySelector("#uxBody");
  const appsMeta = root.querySelector("#uxMeta");
  const leftoversPanel = root.querySelector("#uxLeftovers");
  const leftoversApp = root.querySelector("#uxLeftApp");
  const leftoversBody = root.querySelector("#uxLeftBody");
  const confirmOverlay = root.querySelector("#uxConfirm");
  const confirmMsg = root.querySelector("#uxConfirmMsg");
  const statusEl = root.querySelector("#uxStatus");

  let allApps = [];
  let pendingUninstall = null;

  function setStatus(msg, cls) {
    statusEl.textContent = msg || "";
    statusEl.className = "status" + (cls ? " " + cls : "");
  }

  function getFiltered() {
    const q = (searchInput.value || "").trim().toLowerCase();
    if (!q) return allApps;
    return allApps.filter(
      (a) =>
        String(a.name || "")
          .toLowerCase()
          .includes(q) ||
        String(a.publisher || "")
          .toLowerCase()
          .includes(q)
    );
  }

  function renderApps(apps) {
    appsBody.innerHTML = "";
    if (!apps.length) {
      loadingState.hidden = true;
      emptyState.hidden = false;
      tableWrap.hidden = true;
      return;
    }
    loadingState.hidden = true;
    emptyState.hidden = true;
    tableWrap.hidden = false;

    const frag = document.createDocumentFragment();
    for (const app of apps) {
      const tr = document.createElement("tr");
      const hiveCls = app.hive === "HKCU" ? " hkcu" : "";
      const hasUninstall = !!app.uninstall;
      const key = esc(app.key || app.id || "");
      tr.innerHTML =
        `<td class="col-name" title="${esc(app.name)}">${esc(app.name)}</td>` +
        `<td class="col-version">${esc(app.version) || "—"}</td>` +
        `<td class="col-publisher" title="${esc(app.publisher)}">${esc(app.publisher) || "—"}</td>` +
        `<td class="col-hive"><span class="hive-badge${hiveCls}">${esc(app.hive || "")}</span></td>` +
        `<td class="col-actions">` +
        `<button type="button" class="action-btn danger" data-action="uninstall" data-key="${key}"` +
        ` ${hasUninstall ? "" : "disabled"} title="${hasUninstall ? "" : "Aucune commande de désinstallation"}">Désinstaller</button>` +
        `<button type="button" class="action-btn" data-action="scan" data-key="${key}">Résiduels</button>` +
        `</td>`;
      frag.appendChild(tr);
    }
    appsBody.appendChild(frag);

    const total = allApps.length;
    const shown = apps.length;
    appsMeta.textContent = shown === total ? `${total} programme(s) chargé(s).` : `${shown} / ${total}`;
  }

  async function loadApps() {
    if (!api || typeof api.list_apps !== "function") {
      setStatus(
        "Erreur de chargement : API uninstx indisponible (pywebview.api.uninstx).",
        "error"
      );
      loadingState.hidden = true;
      return;
    }
    loadingState.hidden = false;
    emptyState.hidden = true;
    tableWrap.hidden = true;
    appsBody.innerHTML = "";
    appsMeta.textContent = "";
    leftoversPanel.hidden = true;
    setStatus("Chargement de la liste…");

    try {
      const res = await api.list_apps("");
      if (!res || !res.ok) {
        setStatus("Erreur de chargement : " + (res?.error || "réponse invalide"), "error");
        loadingState.hidden = true;
        return;
      }
      allApps = Array.isArray(res.apps) ? res.apps : [];
      renderApps(getFiltered());
      setStatus(`${allApps.length} programme(s) chargé(s).`);
    } catch (err) {
      setStatus("Erreur de chargement : " + String(err), "error");
      loadingState.hidden = true;
    }
  }

  appsBody.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn || btn.disabled) return;
    const key = btn.dataset.key;
    const app = allApps.find((a) => String(a.key || a.id) === key);
    if (!app) return;
    if (btn.dataset.action === "uninstall") startUninstall(app);
    else if (btn.dataset.action === "scan") doScan(app);
  });

  searchInput.addEventListener("input", () => renderApps(getFiltered()));
  btnRefresh.addEventListener("click", () => loadApps());

  function startUninstall(app) {
    if (!app.uninstall || !app.id) {
      setStatus("Aucune commande de désinstallation disponible.", "error");
      return;
    }
    pendingUninstall = { name: app.name, id: app.id };
    confirmMsg.textContent = `Désinstaller « ${app.name} » ? Cette action est irréversible.`;
    confirmOverlay.hidden = false;
  }

  root.querySelector("#uxConfirmCancel").addEventListener("click", () => {
    confirmOverlay.hidden = true;
    pendingUninstall = null;
  });

  root.querySelector("#uxConfirmOk").addEventListener("click", async () => {
    if (!pendingUninstall) return;
    const { name, id } = pendingUninstall;
    confirmOverlay.hidden = true;
    pendingUninstall = null;
    try {
      const prep = await api.prepare_uninstall_app(id);
      if (!prep || !prep.ok || !prep.token) {
        setStatus("Erreur de désinstallation : " + (prep?.error || "confirmation refusée"), "error");
        return;
      }
      const res = await api.uninstall_app(id, prep.token);
      if (res && res.ok) setStatus(`Désinstallation de « ${name} » lancée.`, "ok");
      else setStatus("Erreur de désinstallation : " + (res?.error || "?"), "error");
    } catch (err) {
      setStatus("Erreur de désinstallation : " + String(err), "error");
    }
  });

  async function doScan(app) {
    leftoversPanel.hidden = false;
    leftoversApp.textContent = `Résultats pour « ${app.name} »`;
    leftoversBody.innerHTML = `<p class="empty-state" style="padding:12px">Recherche des résiduels…</p>`;
    setStatus("Recherche des résiduels…");
    try {
      const res = await api.scan_leftovers(app.name, app.location || "");
      leftoversBody.innerHTML = "";
      if (!res || !res.ok) {
        leftoversBody.innerHTML = `<p class="leftovers-empty">${esc(res?.error || "Erreur")}</p>`;
        setStatus("Erreur de scan : " + (res?.error || "?"), "error");
        return;
      }
      const paths = res.paths || [];
      if (!paths.length) {
        leftoversBody.innerHTML = `<p class="leftovers-empty">Aucun dossier résiduel trouvé.</p>`;
      } else {
        const note = document.createElement("p");
        note.className = "leftovers-app";
        note.textContent = "Liste en lecture seule — aucune suppression automatique.";
        leftoversBody.appendChild(note);
        for (const p of paths) {
          const item = document.createElement("div");
          item.className = "leftover-item";
          item.innerHTML = `<span class="path-text" title="${esc(p)}">${esc(p)}</span>
            <button type="button" class="action-btn" data-action="openfolder" data-path="${esc(p)}">Ouvrir</button>`;
          leftoversBody.appendChild(item);
        }
      }
      setStatus("");
    } catch (err) {
      leftoversBody.innerHTML = `<p class="leftovers-empty">${esc(String(err))}</p>`;
      setStatus("Erreur de scan : " + String(err), "error");
    }
  }

  leftoversBody.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action='openfolder']");
    if (!btn) return;
    const p = btn.dataset.path;
    if (p) api.open_folder(p).catch(() => {});
  });

  root.querySelector("#uxLeftClose").addEventListener("click", () => {
    leftoversPanel.hidden = true;
    leftoversBody.innerHTML = "";
  });

  await loadApps();
}
