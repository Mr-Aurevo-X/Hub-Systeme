/**
 * SysInspect — native in-hub (no iframe / no embedded window).
 * Bridge: pywebview.api.sysinspect.*
 */
import { mountModuleShell, waitNs, esc } from "./_in_hub.js";

export async function mount(root) {
  const { body, setStatus } = mountModuleShell(root, {
    title: "SysInspect",
    subtitle: "Événements système & pilotes installés",
    segments: [
      { id: "events", label: "Événements" },
      { id: "drivers", label: "Pilotes" },
    ],
    onSegment,
  });

  // Per-segment cached data (survives segment switch)
  let eventsData = [];
  let driversData = [];

  // ─── EVENTS ────────────────────────────────────────────────────────────────

  function buildEventsPanel() {
    body.innerHTML = `
      <div class="panel flex-fill" style="display:flex;flex-direction:column;overflow:hidden;padding:14px 16px 8px">
        <div class="toolbar-row" style="flex-shrink:0;margin-bottom:8px">
          <div style="min-width:88px;max-width:108px">
            <input type="number" id="siEvCount" value="50" min="1" max="500" title="Nombre max d'événements" />
          </div>
          <div style="min-width:160px">
            <select id="siEvLog">
              <option value="System">System</option>
              <option value="Application">Application</option>
              <option value="Security">Security</option>
            </select>
          </div>
          <div class="search-wrap">
            <input type="search" id="siEvFilter" placeholder="Filtrer source, ID, message…" autocomplete="off" />
          </div>
          <button type="button" class="btn accent" id="siEvRefresh">Actualiser</button>
        </div>
        <p class="meta" id="siEvMeta"></p>
        <div class="table-wrap" style="flex:1;min-height:0;overflow:auto;margin-top:4px">
          <div class="empty-state" id="siEvEmpty">Cliquer Actualiser pour charger les événements.</div>
          <table class="data" id="siEvTable" hidden>
            <thead>
              <tr>
                <th style="min-width:140px">Date / Heure</th>
                <th style="min-width:50px">ID</th>
                <th style="min-width:160px">Source</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody id="siEvBody"></tbody>
          </table>
        </div>
      </div>`;

    const countEl   = body.querySelector("#siEvCount");
    const logEl     = body.querySelector("#siEvLog");
    const filterEl  = body.querySelector("#siEvFilter");
    const refreshBtn = body.querySelector("#siEvRefresh");
    const metaEl    = body.querySelector("#siEvMeta");
    const tableEl   = body.querySelector("#siEvTable");
    const tbodyEl   = body.querySelector("#siEvBody");
    const emptyEl   = body.querySelector("#siEvEmpty");

    function renderEvents() {
      const q = (filterEl.value || "").toLowerCase().trim();
      const rows = q
        ? eventsData.filter(
            (e) =>
              (e.ProviderName || "").toLowerCase().includes(q) ||
              String(e.Id ?? "").includes(q) ||
              (e.Message || "").toLowerCase().includes(q)
          )
        : eventsData;

      if (!rows.length) {
        tableEl.hidden = true;
        emptyEl.hidden = false;
        emptyEl.textContent = q
          ? "Aucun événement ne correspond au filtre."
          : "Aucun événement trouvé.";
        metaEl.textContent = "";
        return;
      }
      emptyEl.hidden = true;
      tableEl.hidden = false;
      tbodyEl.innerHTML = rows
        .map(
          (e) => `<tr>
            <td style="white-space:nowrap;font-variant-numeric:tabular-nums">${esc(
              e.TimeCreated || ""
            )}</td>
            <td style="font-variant-numeric:tabular-nums">${esc(String(e.Id ?? ""))}</td>
            <td>${esc(e.ProviderName || "")}</td>
            <td class="wrap">${esc(e.Message || "")}</td>
          </tr>`
        )
        .join("");
      metaEl.textContent = `${rows.length} événement${rows.length !== 1 ? "s" : ""}${q ? " (filtrés)" : ""}`;
    }

    filterEl.addEventListener("input", renderEvents);

    async function loadEvents() {
      const count   = Math.max(1, parseInt(countEl.value, 10) || 50);
      const logName = logEl.value;
      setStatus("Chargement des événements…");
      refreshBtn.disabled = true;
      try {
        const api = await waitNs("sysinspect", "recent_errors");
        if (!api) {
          setStatus("API sysinspect indisponible.", "error");
          return;
        }
        const res = await api.recent_errors(count, logName);
        if (!res || !res.ok) {
          setStatus((res && res.error) || "Erreur lors du chargement.", "error");
          return;
        }
        eventsData = res.events || [];
        renderEvents();
        const n = eventsData.length;
        setStatus(`${n} événement${n !== 1 ? "s" : ""} chargé${n !== 1 ? "s" : ""}.`, "ok");
      } catch (e) {
        setStatus("Erreur : " + (e.message || e), "error");
      } finally {
        refreshBtn.disabled = false;
      }
    }

    refreshBtn.addEventListener("click", loadEvents);
    // Re-use cached data on segment revisit; only auto-load on first visit
    if (eventsData.length) renderEvents();
    else loadEvents();
  }

  // ─── DRIVERS ───────────────────────────────────────────────────────────────

  function buildDriversPanel() {
    body.innerHTML = `
      <div class="panel flex-fill" style="display:flex;flex-direction:column;overflow:hidden;padding:14px 16px 8px">
        <div class="toolbar-row" style="flex-shrink:0;margin-bottom:8px">
          <div class="search-wrap">
            <input type="search" id="siDrvFilter" placeholder="Filtrer nom, fabricant, version…" autocomplete="off" />
          </div>
          <button type="button" class="btn accent" id="siDrvRefresh">Actualiser</button>
        </div>
        <p class="meta" id="siDrvMeta"></p>
        <div class="table-wrap" style="flex:1;min-height:0;overflow:auto;margin-top:4px">
          <div class="empty-state" id="siDrvEmpty">Cliquer Actualiser pour charger les pilotes.</div>
          <table class="data" id="siDrvTable" hidden>
            <thead>
              <tr>
                <th>Nom du périphérique</th>
                <th style="min-width:110px">Version</th>
                <th style="min-width:140px">Fabricant</th>
                <th style="min-width:80px">Signé</th>
              </tr>
            </thead>
            <tbody id="siDrvBody"></tbody>
          </table>
        </div>
      </div>`;

    const filterEl   = body.querySelector("#siDrvFilter");
    const refreshBtn = body.querySelector("#siDrvRefresh");
    const metaEl     = body.querySelector("#siDrvMeta");
    const tableEl    = body.querySelector("#siDrvTable");
    const tbodyEl    = body.querySelector("#siDrvBody");
    const emptyEl    = body.querySelector("#siDrvEmpty");

    function renderDrivers() {
      const q = (filterEl.value || "").toLowerCase().trim();
      const rows = q
        ? driversData.filter(
            (d) =>
              (d.DeviceName || "").toLowerCase().includes(q) ||
              (d.Manufacturer || "").toLowerCase().includes(q) ||
              (d.DriverVersion || "").toLowerCase().includes(q)
          )
        : driversData;

      if (!rows.length) {
        tableEl.hidden = true;
        emptyEl.hidden = false;
        emptyEl.textContent = q
          ? "Aucun pilote ne correspond au filtre."
          : "Aucun pilote trouvé.";
        metaEl.textContent = "";
        return;
      }
      emptyEl.hidden = true;
      tableEl.hidden = false;
      tbodyEl.innerHTML = rows
        .map(
          (d) => `<tr>
            <td>${esc(d.DeviceName || "")}</td>
            <td style="font-variant-numeric:tabular-nums;white-space:nowrap">${esc(
              d.DriverVersion || ""
            )}</td>
            <td>${esc(d.Manufacturer || "")}</td>
            <td>${
              d.IsSigned
                ? `<span style="color:var(--ok,#3dd68c);font-weight:600">✓ Signé</span>`
                : `<span style="color:#ff8a95;font-weight:600">✗ Non signé</span>`
            }</td>
          </tr>`
        )
        .join("");
      metaEl.textContent = `${rows.length} pilote${rows.length !== 1 ? "s" : ""}${q ? " (filtrés)" : ""}`;
    }

    filterEl.addEventListener("input", renderDrivers);

    async function loadDrivers() {
      setStatus("Chargement des pilotes…");
      refreshBtn.disabled = true;
      try {
        const api = await waitNs("sysinspect", "list_drivers");
        if (!api) {
          setStatus("API sysinspect indisponible.", "error");
          return;
        }
        const res = await api.list_drivers();
        if (!res || !res.ok) {
          setStatus((res && res.error) || "Erreur lors du chargement.", "error");
          return;
        }
        driversData = res.drivers || [];
        renderDrivers();
        const n = driversData.length;
        setStatus(`${n} pilote${n !== 1 ? "s" : ""} chargé${n !== 1 ? "s" : ""}.`, "ok");
      } catch (e) {
        setStatus("Erreur : " + (e.message || e), "error");
      } finally {
        refreshBtn.disabled = false;
      }
    }

    refreshBtn.addEventListener("click", loadDrivers);
    if (driversData.length) renderDrivers();
    else loadDrivers();
  }

  // ─── SEGMENT ROUTER ────────────────────────────────────────────────────────

  async function onSegment(id) {
    if (id === "events") buildEventsPanel();
    else if (id === "drivers") buildDriversPanel();
  }

  // Initial render
  buildEventsPanel();
}
