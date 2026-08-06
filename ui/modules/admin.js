/**
 * Admin léger — native in-hub (no iframe / no embedded window).
 * Bridge: pywebview.api.admin.*
 * Segments: powerplan | printqueue | restorepoint | usersessions
 */
import { mountModuleShell, waitNs, esc } from "./_in_hub.js";

export async function mount(root) {
  const { body, setStatus, askConfirm } = mountModuleShell(root, {
    title: "Admin léger",
    subtitle: "PowerPlan · PrintQueue · RestorePoint · Sessions",
    segments: [
      { id: "powerplan",    label: "PowerPlan" },
      { id: "printqueue",   label: "File d'impression" },
      { id: "restorepoint", label: "Points de restauration" },
      { id: "usersessions", label: "Sessions" },
    ],
    onSegment,
  });

  // ─── POWERPLAN ─────────────────────────────────────────────────────────────

  function buildPowerplanPanel() {
    body.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:10px;flex:1;min-height:0;overflow:auto">

        <div class="panel flex-fill" style="display:flex;flex-direction:column;overflow:hidden;padding:14px 16px 8px">
          <div class="toolbar-row" style="flex-shrink:0;margin-bottom:8px">
            <span style="font-size:0.84rem;font-weight:600;color:var(--text)">Plans d'alimentation</span>
            <button type="button" class="btn accent" id="ppRefresh" style="margin-left:auto">Actualiser</button>
          </div>
          <p class="meta" id="ppMeta"></p>
          <div class="table-wrap" style="flex:1;min-height:0;overflow:auto;margin-top:4px">
            <div class="empty-state" id="ppEmpty">Chargement…</div>
            <table class="data" id="ppTable" hidden>
              <thead>
                <tr>
                  <th>Nom du plan</th>
                  <th>GUID</th>
                  <th style="min-width:70px">Statut</th>
                  <th style="min-width:80px">Action</th>
                </tr>
              </thead>
              <tbody id="ppBody"></tbody>
            </table>
          </div>
        </div>

        <div style="display:flex;gap:10px;flex-wrap:wrap;flex-shrink:0">

          <div class="panel" style="flex:1;min-width:220px" id="ppBattCard">
            <p style="font-size:0.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin-bottom:8px">Batterie</p>
            <div id="ppBattInfo" class="empty-state" style="padding:12px 0">Chargement…</div>
          </div>

          <div class="panel" style="flex:1;min-width:220px" id="ppFocusCard">
            <p style="font-size:0.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin-bottom:8px">Focus Assist</p>
            <div id="ppFocusInfo" class="empty-state" style="padding:6px 0">Chargement…</div>
            <div class="toolbar-row" style="margin-top:10px;gap:6px" id="ppFocusBtns" hidden>
              <button type="button" class="btn ghost" data-mode="off"    id="ppFocOff">Désactivé</button>
              <button type="button" class="btn ghost" data-mode="priority" id="ppFocPri">Priorité</button>
              <button type="button" class="btn ghost" data-mode="alarms" id="ppFocAlarm">Alarmes seulement</button>
            </div>
          </div>

        </div>
      </div>`;

    const refreshBtn = body.querySelector("#ppRefresh");
    const metaEl     = body.querySelector("#ppMeta");
    const tableEl    = body.querySelector("#ppTable");
    const tbodyEl    = body.querySelector("#ppBody");
    const emptyEl    = body.querySelector("#ppEmpty");
    const battInfo   = body.querySelector("#ppBattInfo");
    const focusInfo  = body.querySelector("#ppFocusInfo");
    const focusBtns  = body.querySelector("#ppFocusBtns");

    async function loadPlans() {
      setStatus("Chargement des plans d'alimentation…");
      refreshBtn.disabled = true;
      tableEl.hidden = true;
      emptyEl.hidden = false;
      emptyEl.textContent = "Chargement…";
      try {
        const api = await waitNs("admin.powerplan", "list_plans");
        if (!api) { setStatus("API admin.powerplan indisponible.", "error"); return; }
        const res = await api.list_plans();
        if (!res || !res.ok) {
          setStatus((res && res.error) || "Erreur liste plans.", "error");
          return;
        }
        const plans = res.plans || [];
        if (!plans.length) {
          emptyEl.textContent = "Aucun plan trouvé.";
          metaEl.textContent = "";
          setStatus("", "");
          return;
        }
        emptyEl.hidden = true;
        tableEl.hidden = false;
        tbodyEl.innerHTML = plans
          .map(
            (p) => `<tr data-guid="${esc(p.guid)}">
              <td style="font-weight:${p.active ? "600" : "400"}">${esc(p.name || p.guid)}</td>
              <td style="font-size:0.74rem;color:var(--muted);font-variant-numeric:tabular-nums">${esc(p.guid || "")}</td>
              <td>${
                p.active
                  ? `<span style="color:var(--ok,#3dd68c);font-weight:600">✓ Actif</span>`
                  : `<span style="color:var(--muted)">—</span>`
              }</td>
              <td>${
                p.active
                  ? ""
                  : `<button type="button" class="action-btn pp-activate" data-guid="${esc(p.guid)}" data-name="${esc(p.name || p.guid)}">Activer</button>`
              }</td>
            </tr>`
          )
          .join("");
        metaEl.textContent = `${plans.length} plan${plans.length !== 1 ? "s" : ""}`;
        setStatus("Plans chargés.", "ok");
      } catch (e) {
        setStatus("Erreur : " + (e.message || e), "error");
      } finally {
        refreshBtn.disabled = false;
      }
    }

    tbodyEl.addEventListener("click", async (ev) => {
      const btn = ev.target.closest(".pp-activate");
      if (!btn || btn.disabled) return;
      const guid = btn.getAttribute("data-guid");
      const name = btn.getAttribute("data-name");
      const ok = await askConfirm(
        `Activer le plan « ${name} » ? Cela remplacera le plan d'alimentation actif.`,
        "Changer de plan"
      );
      if (!ok) return;
      btn.disabled = true;
      setStatus("Activation du plan…");
      try {
        const api = await waitNs("admin.powerplan", "set_plan");
        if (!api) { setStatus("API indisponible.", "error"); return; }
        const res = await api.set_plan(guid);
        if (!res || !res.ok) {
          setStatus((res && res.error) || "Impossible d'activer le plan.", "error");
          btn.disabled = false;
          return;
        }
        setStatus(`Plan « ${name} » activé.`, "ok");
        await loadPlans();
      } catch (e) {
        setStatus("Erreur : " + (e.message || e), "error");
        btn.disabled = false;
      }
    });

    async function loadBattery() {
      battInfo.textContent = "Chargement…";
      try {
        const api = await waitNs("admin.powerplan", "get_battery_info");
        if (!api) { battInfo.textContent = "API indisponible."; return; }
        const res = await api.get_battery_info();
        if (!res || !res.ok) {
          battInfo.textContent = (res && res.error) || "Indisponible.";
          return;
        }
        const d = res.battery || res;
        const lines = [];
        if (d.percent   != null) lines.push(`Charge : <strong>${esc(String(d.percent))}%</strong>`);
        if (d.status    != null) lines.push(`État : <strong>${esc(String(d.status))}</strong>`);
        if (d.plugged   != null) lines.push(d.plugged ? "Branché sur secteur" : "Sur batterie");
        if (d.remaining != null) lines.push(`Autonomie estimée : <strong>${esc(String(d.remaining))}</strong>`);
        battInfo.innerHTML = lines.length
          ? lines.map((l) => `<p style="font-size:0.84rem;margin:3px 0">${l}</p>`).join("")
          : `<p style="font-size:0.84rem;color:var(--muted)">Pas de batterie détectée.</p>`;
      } catch {
        battInfo.textContent = "Batterie non disponible.";
      }
    }

    async function loadFocusAssist() {
      focusInfo.textContent = "Chargement…";
      focusBtns.hidden = true;
      try {
        const api = await waitNs("admin.powerplan", "get_focus_assist_state");
        if (!api) { focusInfo.textContent = "API indisponible."; return; }
        const res = await api.get_focus_assist_state();
        if (!res || !res.ok) {
          focusInfo.textContent = (res && res.error) || "Indisponible.";
          return;
        }
        const modeLabels = { off: "Désactivé", priority: "Priorité uniquement", alarms: "Alarmes seulement" };
        const mode = res.mode || res.state || "unknown";
        focusInfo.innerHTML = `<p style="font-size:0.84rem;margin:3px 0">Mode actuel : <strong>${esc(
          modeLabels[mode] || mode
        )}</strong></p>`;
        focusBtns.hidden = false;

        // Highlight active mode
        focusBtns.querySelectorAll("[data-mode]").forEach((b) => {
          b.classList.toggle("accent", b.getAttribute("data-mode") === mode);
        });
      } catch {
        focusInfo.textContent = "Focus Assist non disponible.";
      }
    }

    focusBtns.addEventListener("click", async (ev) => {
      const btn = ev.target.closest("[data-mode]");
      if (!btn || btn.disabled) return;
      const mode = btn.getAttribute("data-mode");
      const modeLabels = { off: "Désactivé", priority: "Priorité uniquement", alarms: "Alarmes seulement" };
      const ok = await askConfirm(
        `Changer Focus Assist en « ${modeLabels[mode] || mode} » ?`,
        "Focus Assist"
      );
      if (!ok) return;
      focusBtns.querySelectorAll("[data-mode]").forEach((b) => (b.disabled = true));
      setStatus("Modification de Focus Assist…");
      try {
        const api = await waitNs("admin.powerplan", "set_focus_assist");
        if (!api) { setStatus("API indisponible.", "error"); return; }
        const res = await api.set_focus_assist(mode);
        if (!res || !res.ok) {
          setStatus((res && res.error) || "Échec de la modification.", "error");
          return;
        }
        setStatus(`Focus Assist : ${modeLabels[mode] || mode}.`, "ok");
        await loadFocusAssist();
      } catch (e) {
        setStatus("Erreur : " + (e.message || e), "error");
      } finally {
        focusBtns.querySelectorAll("[data-mode]").forEach((b) => (b.disabled = false));
      }
    });

    refreshBtn.addEventListener("click", () => { loadPlans(); loadBattery(); loadFocusAssist(); });

    loadPlans();
    loadBattery();
    loadFocusAssist();
  }

  // ─── PRINT QUEUE ───────────────────────────────────────────────────────────

  function buildPrintqueuePanel() {
    body.innerHTML = `
      <div class="panel flex-fill" style="display:flex;flex-direction:column;overflow:hidden;padding:14px 16px 8px">
        <div class="toolbar-row" style="flex-shrink:0;margin-bottom:8px">
          <span style="font-size:0.84rem;font-weight:600;color:var(--text)">Files d'impression</span>
          <button type="button" class="btn accent" id="pqRefresh" style="margin-left:auto">Actualiser</button>
        </div>
        <p class="meta" id="pqMeta"></p>
        <div class="table-wrap" style="flex:1;min-height:0;overflow:auto;margin-top:4px">
          <div class="empty-state" id="pqEmpty">Chargement…</div>
          <table class="data" id="pqTable" hidden>
            <thead>
              <tr>
                <th>Imprimante</th>
                <th style="min-width:70px">Travaux</th>
                <th style="min-width:100px">État</th>
                <th style="min-width:80px">Action</th>
              </tr>
            </thead>
            <tbody id="pqBody"></tbody>
          </table>
        </div>
      </div>`;

    const refreshBtn = body.querySelector("#pqRefresh");
    const metaEl     = body.querySelector("#pqMeta");
    const tableEl    = body.querySelector("#pqTable");
    const tbodyEl    = body.querySelector("#pqBody");
    const emptyEl    = body.querySelector("#pqEmpty");

    async function loadQueue() {
      setStatus("Chargement de la file d'impression…");
      refreshBtn.disabled = true;
      tableEl.hidden = true;
      emptyEl.hidden = false;
      emptyEl.textContent = "Chargement…";
      try {
        const api = await waitNs("admin.printqueue", "list_print_queue");
        if (!api) { setStatus("API admin.printqueue indisponible.", "error"); return; }
        const res = await api.list_print_queue();
        if (!res || !res.ok) {
          setStatus((res && res.error) || "Erreur liste imprimantes.", "error");
          return;
        }
        const printers = res.printers || [];
        if (!printers.length) {
          emptyEl.textContent = "Aucune imprimante détectée.";
          metaEl.textContent = "";
          setStatus("", "");
          return;
        }
        emptyEl.hidden = true;
        tableEl.hidden = false;
        tbodyEl.innerHTML = printers
          .map((p) => {
            const jobCount = p.jobCount ?? (Array.isArray(p.jobs) ? p.jobs.length : 0);
            return `<tr>
              <td style="font-weight:600">${esc(p.name || "")}</td>
              <td style="font-variant-numeric:tabular-nums">${jobCount}</td>
              <td style="font-size:0.8rem;color:var(--muted)">${esc(p.status || p.state || "—")}</td>
              <td>${
                jobCount > 0
                  ? `<button type="button" class="action-btn danger pq-purge" data-name="${esc(p.name)}">Vider</button>`
                  : `<span style="color:var(--muted);font-size:0.76rem">Vide</span>`
              }</td>
            </tr>`;
          })
          .join("");
        const total = printers.reduce(
          (s, p) => s + (p.jobCount ?? (Array.isArray(p.jobs) ? p.jobs.length : 0)),
          0
        );
        metaEl.textContent = `${printers.length} imprimante${printers.length !== 1 ? "s" : ""} · ${total} travail${total !== 1 ? "x" : ""} en attente`;
        setStatus("File d'impression chargée.", "ok");
      } catch (e) {
        setStatus("Erreur : " + (e.message || e), "error");
      } finally {
        refreshBtn.disabled = false;
      }
    }

    tbodyEl.addEventListener("click", async (ev) => {
      const btn = ev.target.closest(".pq-purge");
      if (!btn || btn.disabled) return;
      const name = btn.getAttribute("data-name");
      const ok = await askConfirm(
        `Vider toute la file de l'imprimante « ${name} » ? Cette action est irréversible.`,
        "Vider la file"
      );
      if (!ok) return;
      btn.disabled = true;
      setStatus(`Suppression des travaux de « ${name} »…`);
      try {
        const api = await waitNs("admin.printqueue", "purge_printer_jobs");
        if (!api) { setStatus("API indisponible.", "error"); btn.disabled = false; return; }
        const res = await api.purge_printer_jobs(name);
        if (!res || !res.ok) {
          setStatus((res && res.error) || "Impossible de vider la file.", "error");
          btn.disabled = false;
          return;
        }
        setStatus(`File de « ${name} » vidée.`, "ok");
        await loadQueue();
      } catch (e) {
        setStatus("Erreur : " + (e.message || e), "error");
        btn.disabled = false;
      }
    });

    refreshBtn.addEventListener("click", loadQueue);
    loadQueue();
  }

  // ─── RESTORE POINTS ────────────────────────────────────────────────────────

  function buildRestorepointPanel() {
    body.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:10px;flex:1;min-height:0;overflow:auto">

        <div class="panel" style="flex-shrink:0">
          <div class="toolbar-row" style="gap:8px">
            <div class="search-wrap">
              <input type="text" id="rpDesc" placeholder="Description du point de restauration…" autocomplete="off" maxlength="128" />
            </div>
            <button type="button" class="btn danger" id="rpCreate">Créer un point</button>
          </div>
        </div>

        <div class="panel flex-fill" style="display:flex;flex-direction:column;overflow:hidden;padding:14px 16px 8px">
          <div class="toolbar-row" style="flex-shrink:0;margin-bottom:8px">
            <span style="font-size:0.84rem;font-weight:600;color:var(--text)">Points existants</span>
            <button type="button" class="btn accent" id="rpRefresh" style="margin-left:auto">Actualiser</button>
          </div>
          <p class="meta" id="rpMeta"></p>
          <div class="table-wrap" style="flex:1;min-height:0;overflow:auto;margin-top:4px">
            <div class="empty-state" id="rpEmpty">Chargement…</div>
            <table class="data" id="rpTable" hidden>
              <thead>
                <tr>
                  <th style="min-width:40px">#</th>
                  <th>Description</th>
                  <th style="min-width:160px">Date de création</th>
                  <th style="min-width:100px">Type</th>
                </tr>
              </thead>
              <tbody id="rpBody"></tbody>
            </table>
          </div>
        </div>

      </div>`;

    const descEl     = body.querySelector("#rpDesc");
    const createBtn  = body.querySelector("#rpCreate");
    const refreshBtn = body.querySelector("#rpRefresh");
    const metaEl     = body.querySelector("#rpMeta");
    const tableEl    = body.querySelector("#rpTable");
    const tbodyEl    = body.querySelector("#rpBody");
    const emptyEl    = body.querySelector("#rpEmpty");

    async function loadPoints() {
      setStatus("Chargement des points de restauration…");
      refreshBtn.disabled = true;
      tableEl.hidden = true;
      emptyEl.hidden = false;
      emptyEl.textContent = "Chargement…";
      try {
        const api = await waitNs("admin.restorepoint", "list_restore_points");
        if (!api) { setStatus("API admin.restorepoint indisponible.", "error"); return; }
        const res = await api.list_restore_points();
        if (!res || !res.ok) {
          setStatus((res && res.error) || "Erreur liste points.", "error");
          return;
        }
        const items = res.items || res.points || [];
        if (!items.length) {
          emptyEl.textContent = "Aucun point de restauration trouvé.";
          metaEl.textContent = "";
          setStatus("", "");
          return;
        }
        emptyEl.hidden = true;
        tableEl.hidden = false;
        tbodyEl.innerHTML = items
          .map(
            (p) => `<tr>
              <td style="font-variant-numeric:tabular-nums;color:var(--muted)">${esc(String(p.SequenceNumber ?? p.sequence ?? ""))}</td>
              <td>${esc(p.Description || p.description || "")}</td>
              <td style="white-space:nowrap;font-variant-numeric:tabular-nums">${esc(
                p.CreationTime || p.creationTime || p.date || ""
              )}</td>
              <td style="font-size:0.8rem;color:var(--muted)">${esc(p.Type || p.type || "—")}</td>
            </tr>`
          )
          .join("");
        metaEl.textContent = `${items.length} point${items.length !== 1 ? "s" : ""}`;
        setStatus("Points de restauration chargés.", "ok");
      } catch (e) {
        setStatus("Erreur : " + (e.message || e), "error");
      } finally {
        refreshBtn.disabled = false;
      }
    }

    createBtn.addEventListener("click", async () => {
      const desc = descEl.value.trim();
      if (!desc) {
        setStatus("Entrer une description avant de créer le point.", "error");
        descEl.focus();
        return;
      }
      const ok = await askConfirm(
        `Créer un point de restauration système : « ${desc} » ?`,
        "Créer un point de restauration"
      );
      if (!ok) return;
      createBtn.disabled = true;
      setStatus("Création du point de restauration…");
      try {
        const api = await waitNs("admin.restorepoint", "create_restore_point");
        if (!api) { setStatus("API indisponible.", "error"); createBtn.disabled = false; return; }
        const res = await api.create_restore_point(desc);
        if (!res || !res.ok) {
          setStatus((res && res.error) || "Impossible de créer le point.", "error");
          createBtn.disabled = false;
          return;
        }
        setStatus("Point de restauration créé avec succès.", "ok");
        descEl.value = "";
        await loadPoints();
      } catch (e) {
        setStatus("Erreur : " + (e.message || e), "error");
      } finally {
        createBtn.disabled = false;
      }
    });

    refreshBtn.addEventListener("click", loadPoints);
    loadPoints();
  }

  // ─── USER SESSIONS ─────────────────────────────────────────────────────────

  function buildUsersessionsPanel() {
    body.innerHTML = `
      <div class="panel flex-fill" style="display:flex;flex-direction:column;overflow:hidden;padding:14px 16px 8px">
        <div class="toolbar-row" style="flex-shrink:0;margin-bottom:8px">
          <span style="font-size:0.84rem;font-weight:600;color:var(--text)">Sessions utilisateurs</span>
          <button type="button" class="btn accent" id="usRefresh" style="margin-left:auto">Actualiser</button>
        </div>
        <p class="meta" id="usMeta"></p>
        <div class="table-wrap" style="flex:1;min-height:0;overflow:auto;margin-top:4px">
          <div class="empty-state" id="usEmpty">Chargement…</div>
          <table class="data" id="usTable" hidden>
            <thead>
              <tr>
                <th style="min-width:50px">ID</th>
                <th style="min-width:140px">Utilisateur</th>
                <th style="min-width:90px">État</th>
                <th style="min-width:140px">Connexion</th>
                <th style="min-width:90px">Action</th>
              </tr>
            </thead>
            <tbody id="usBody"></tbody>
          </table>
        </div>
      </div>`;

    const refreshBtn = body.querySelector("#usRefresh");
    const metaEl     = body.querySelector("#usMeta");
    const tableEl    = body.querySelector("#usTable");
    const tbodyEl    = body.querySelector("#usBody");
    const emptyEl    = body.querySelector("#usEmpty");

    async function loadSessions() {
      setStatus("Chargement des sessions…");
      refreshBtn.disabled = true;
      tableEl.hidden = true;
      emptyEl.hidden = false;
      emptyEl.textContent = "Chargement…";
      try {
        const api = await waitNs("admin.usersessions", "list_sessions");
        if (!api) { setStatus("API admin.usersessions indisponible.", "error"); return; }
        const res = await api.list_sessions();
        if (!res || !res.ok) {
          setStatus((res && res.error) || "Erreur liste sessions.", "error");
          return;
        }
        const items = res.sessions || res.items || [];
        if (!items.length) {
          emptyEl.textContent = "Aucune session active.";
          metaEl.textContent = "";
          setStatus("", "");
          return;
        }
        emptyEl.hidden = true;
        tableEl.hidden = false;
        tbodyEl.innerHTML = items
          .map((s) => {
            const sid = s.SessionId ?? s.id ?? s.sessionId ?? "";
            const user = s.Username || s.username || s.user || "—";
            const state = s.State || s.state || "—";
            const logon = s.LogonTime || s.logonTime || s.logon || "—";
            return `<tr>
              <td style="font-variant-numeric:tabular-nums;color:var(--muted)">${esc(String(sid))}</td>
              <td style="font-weight:600">${esc(user)}</td>
              <td><span style="font-size:0.8rem;color:var(--muted)">${esc(state)}</span></td>
              <td style="font-size:0.8rem;white-space:nowrap;font-variant-numeric:tabular-nums">${esc(logon)}</td>
              <td>
                <button type="button" class="action-btn danger us-logoff"
                  data-id="${esc(String(sid))}" data-user="${esc(user)}">Déconnecter</button>
              </td>
            </tr>`;
          })
          .join("");
        metaEl.textContent = `${items.length} session${items.length !== 1 ? "s" : ""}`;
        setStatus("Sessions chargées.", "ok");
      } catch (e) {
        setStatus("Erreur : " + (e.message || e), "error");
      } finally {
        refreshBtn.disabled = false;
      }
    }

    tbodyEl.addEventListener("click", async (ev) => {
      const btn = ev.target.closest(".us-logoff");
      if (!btn || btn.disabled) return;
      const id   = btn.getAttribute("data-id");
      const user = btn.getAttribute("data-user");
      const ok = await askConfirm(
        `Déconnecter la session de « ${user} » (ID ${id}) ? Les données non enregistrées seront perdues.`,
        "Déconnecter la session"
      );
      if (!ok) return;
      btn.disabled = true;
      setStatus(`Déconnexion de la session ${id}…`);
      try {
        const api = await waitNs("admin.usersessions", "logoff_session");
        if (!api) { setStatus("API indisponible.", "error"); btn.disabled = false; return; }
        const res = await api.logoff_session(id);
        if (!res || !res.ok) {
          setStatus((res && res.error) || "Impossible de déconnecter.", "error");
          btn.disabled = false;
          return;
        }
        setStatus(`Session ${id} (${user}) déconnectée.`, "ok");
        await loadSessions();
      } catch (e) {
        setStatus("Erreur : " + (e.message || e), "error");
        btn.disabled = false;
      }
    });

    refreshBtn.addEventListener("click", loadSessions);
    loadSessions();
  }

  // ─── SEGMENT ROUTER ────────────────────────────────────────────────────────

  async function onSegment(id) {
    if      (id === "powerplan")    buildPowerplanPanel();
    else if (id === "printqueue")   buildPrintqueuePanel();
    else if (id === "restorepoint") buildRestorepointPanel();
    else if (id === "usersessions") buildUsersessionsPanel();
  }

  // Initial render
  buildPowerplanPanel();
}
