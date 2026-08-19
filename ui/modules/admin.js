/**
 * Copyright (c) 2026 Mr-Aurevo-X. All rights reserved.
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 * Author: Mr-Aurevo-X | https://github.com/Mr-Aurevo-X
 */
/**
 * Admin léger — native in-hub (no iframe / no embedded window).
 * Bridge: pywebview.api.admin.*
 * Segments: powerplan | printqueue | restorepoint | usersessions
 * Mutators: UI confirm + ConfirmGate prepare_action + token.
 */
import { mountModuleShell, waitNs, esc } from "./_in_hub.js";

const FOCUS_MODE_BY_NAME = { off: 0, priority: 1, alarms: 2 };
const FOCUS_MODE_LABELS = {
  0: "Désactivé",
  1: "Priorité uniquement",
  2: "Alarmes seulement",
  off: "Désactivé",
  priority: "Priorité uniquement",
  alarms: "Alarmes seulement",
};

function focusModeKey(res) {
  if (!res) return "unknown";
  if (res.modeName && FOCUS_MODE_BY_NAME[res.modeName] != null) return res.modeName;
  const m = res.mode;
  if (m === 0 || m === 1 || m === 2) return ["off", "priority", "alarms"][m];
  if (typeof m === "string" && FOCUS_MODE_BY_NAME[m] != null) return m;
  return "unknown";
}

async function gatedCall(nsPath, action, payload, invoke, askConfirm, message, title) {
  const ok = await askConfirm(message, title || "Confirmer");
  if (!ok) return { ok: false, error: "Annulé", cancelled: true };
  const api = await waitNs(nsPath, "prepare_action");
  if (!api) return { ok: false, error: "API indisponible." };
  const prep = await api.prepare_action(action, payload || {});
  if (!prep || !prep.ok || !prep.token) {
    return { ok: false, error: (prep && prep.error) || "Confirmation refusée" };
  }
  try {
    return (await invoke(api, prep.token)) || { ok: false, error: "Échec" };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

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
    let lastBattFolder = "";

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

          <div class="panel" style="flex:1;min-width:260px" id="ppBattCard">
            <p style="font-size:0.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin-bottom:8px">Batterie</p>
            <div id="ppBattInfo" class="empty-state" style="padding:8px 0">Chargement…</div>
            <div class="toolbar-row" style="margin-top:10px;gap:6px;flex-wrap:wrap">
              <button type="button" class="btn accent" id="ppBattReport">Générer rapport</button>
              <button type="button" class="btn ghost" id="ppBattOpen" disabled>Ouvrir dossier</button>
            </div>
            <p class="meta" id="ppBattStatus" style="margin-top:8px"></p>
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
    const battStatus = body.querySelector("#ppBattStatus");
    const battOpen   = body.querySelector("#ppBattOpen");
    const battReport = body.querySelector("#ppBattReport");
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
      btn.disabled = true;
      setStatus("Activation du plan…");
      const res = await gatedCall(
        "admin.powerplan",
        "set_plan",
        { guid },
        (api, token) => api.set_plan(guid, token),
        askConfirm,
        `Activer le plan « ${name} » ? Cela remplacera le plan d'alimentation actif.`,
        "Changer de plan"
      );
      if (res.cancelled) {
        btn.disabled = false;
        setStatus("", "");
        return;
      }
      if (!res.ok) {
        setStatus(res.error || "Impossible d'activer le plan.", "error");
        btn.disabled = false;
        return;
      }
      setStatus(`Plan « ${name} » activé.`, "ok");
      await loadPlans();
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
        if (!res.hasBattery) {
          battInfo.innerHTML = `<p style="font-size:0.84rem;color:var(--muted)">Pas de batterie détectée (PC fixe ou info indisponible).</p>`;
          return;
        }
        const bats = Array.isArray(res.batteries) ? res.batteries : [];
        if (!bats.length) {
          battInfo.innerHTML = `<p style="font-size:0.84rem;color:var(--muted)">Batterie détectée sans détail.</p>`;
          return;
        }
        battInfo.innerHTML = bats
          .map((b) => {
            const pct = b.chargePercent != null ? `${b.chargePercent}%` : "—";
            const st = b.statusLabelFr || b.statusLabelEn || b.status || "—";
            const name = b.name || "Batterie";
            const design = Number(b.designCapacity);
            const full = Number(b.fullChargeCapacity);
            let capLine = "";
            if (Number.isFinite(design) && design > 0 && Number.isFinite(full) && full > 0) {
              const z = Math.round((full / design) * 100);
              capLine = `<p style="font-size:0.84rem;margin:2px 0">Capacité : <strong>${esc(String(full))} mWh / ${esc(String(design))} mWh design (~${z}%)</strong></p>`;
            }
            return `<div style="margin-bottom:8px">
              <p style="font-size:0.84rem;margin:2px 0"><strong>${esc(name)}</strong></p>
              <p style="font-size:0.84rem;margin:2px 0">Charge : <strong>${esc(pct)}</strong></p>
              <p style="font-size:0.84rem;margin:2px 0">État : <strong>${esc(String(st))}</strong></p>
              ${capLine}
            </div>`;
          })
          .join("");
      } catch {
        battInfo.textContent = "Batterie non disponible.";
      }
    }

    battReport.addEventListener("click", async () => {
      battReport.disabled = true;
      battStatus.textContent = "Génération du rapport powercfg…";
      setStatus("Rapport batterie…");
      try {
        const api = await waitNs("admin.powerplan", "generate_battery_report");
        if (!api) {
          battStatus.textContent = "API indisponible.";
          setStatus("API indisponible.", "error");
          return;
        }
        const res = await api.generate_battery_report();
        if (!res || !res.ok) {
          battStatus.textContent = (res && res.error) || "Échec génération.";
          setStatus(battStatus.textContent, "error");
          return;
        }
        lastBattFolder = res.folder || res.path || "";
        battOpen.disabled = !lastBattFolder;
        battStatus.textContent = res.path ? `Rapport : ${res.path}` : "Rapport généré.";
        setStatus("Rapport batterie prêt.", "ok");
      } catch (e) {
        battStatus.textContent = String(e.message || e);
        setStatus(battStatus.textContent, "error");
      } finally {
        battReport.disabled = false;
      }
    });

    battOpen.addEventListener("click", async () => {
      if (!lastBattFolder) return;
      try {
        const api = await waitNs("admin.powerplan", "open_battery_folder");
        if (!api) return;
        const res = await api.open_battery_folder(lastBattFolder);
        if (!res || !res.ok) {
          setStatus((res && res.error) || "Impossible d'ouvrir le dossier.", "error");
        }
      } catch (e) {
        setStatus(String(e.message || e), "error");
      }
    });

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
        const key = focusModeKey(res);
        focusInfo.innerHTML = `<p style="font-size:0.84rem;margin:3px 0">Mode actuel : <strong>${esc(
          FOCUS_MODE_LABELS[key] || key
        )}</strong></p>`;
        focusBtns.hidden = false;
        focusBtns.querySelectorAll("[data-mode]").forEach((b) => {
          const on = b.getAttribute("data-mode") === key;
          b.classList.toggle("accent", on);
          b.classList.toggle("active", on);
        });
      } catch {
        focusInfo.textContent = "Focus Assist non disponible.";
      }
    }

    focusBtns.addEventListener("click", async (ev) => {
      const btn = ev.target.closest("[data-mode]");
      if (!btn || btn.disabled) return;
      const modeName = btn.getAttribute("data-mode");
      const modeInt = FOCUS_MODE_BY_NAME[modeName];
      if (modeInt == null) return;
      focusBtns.querySelectorAll("[data-mode]").forEach((b) => (b.disabled = true));
      setStatus("Modification de Focus Assist…");
      const res = await gatedCall(
        "admin.powerplan",
        "set_focus_assist",
        { mode: modeInt },
        (api, token) => api.set_focus_assist(modeInt, token),
        askConfirm,
        `Changer Focus Assist en « ${FOCUS_MODE_LABELS[modeName] || modeName} » ?`,
        "Focus Assist"
      );
      focusBtns.querySelectorAll("[data-mode]").forEach((b) => (b.disabled = false));
      if (res.cancelled) {
        setStatus("", "");
        return;
      }
      if (!res.ok) {
        setStatus(res.error || "Échec de la modification.", "error");
        return;
      }
      setStatus(`Focus Assist : ${FOCUS_MODE_LABELS[modeName] || modeName}.`, "ok");
      await loadFocusAssist();
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
      btn.disabled = true;
      setStatus(`Suppression des travaux de « ${name} »…`);
      const res = await gatedCall(
        "admin.printqueue",
        "purge_printer_jobs",
        { printer_name: name },
        (api, token) => api.purge_printer_jobs(name, token),
        askConfirm,
        `Vider toute la file de l'imprimante « ${name} » ? Cette action est irréversible.`,
        "Vider la file"
      );
      if (res.cancelled) {
        btn.disabled = false;
        setStatus("", "");
        return;
      }
      if (!res.ok) {
        setStatus(res.error || "Impossible de vider la file.", "error");
        btn.disabled = false;
        return;
      }
      setStatus(`File de « ${name} » vidée.`, "ok");
      await loadQueue();
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
              <td style="font-size:0.8rem;color:var(--muted)">${esc(p.Type || p.type || p.restorePointType || "—")}</td>
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
      createBtn.disabled = true;
      setStatus("Création du point de restauration…");
      const res = await gatedCall(
        "admin.restorepoint",
        "create_restore_point",
        { description: desc },
        (api, token) => api.create_restore_point(desc, token),
        askConfirm,
        `Créer un point de restauration système : « ${desc} » ?`,
        "Créer un point de restauration"
      );
      createBtn.disabled = false;
      if (res.cancelled) {
        setStatus("", "");
        return;
      }
      if (!res.ok) {
        setStatus(res.error || "Impossible de créer le point.", "error");
        return;
      }
      setStatus("Point de restauration créé avec succès.", "ok");
      descEl.value = "";
      await loadPoints();
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
            const sidNum = Number(sid);
            return `<tr>
              <td style="font-variant-numeric:tabular-nums;color:var(--muted)">${esc(String(sid))}</td>
              <td style="font-weight:600">${esc(user)}</td>
              <td><span style="font-size:0.8rem;color:var(--muted)">${esc(state)}</span></td>
              <td style="font-size:0.8rem;white-space:nowrap;font-variant-numeric:tabular-nums">${esc(logon)}</td>
              <td>
                <button type="button" class="action-btn danger us-logoff"
                  data-id="${esc(String(sid))}" data-sid="${esc(String(Number.isFinite(sidNum) ? sidNum : sid))}"
                  data-user="${esc(user)}">Déconnecter</button>
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
      const id = btn.getAttribute("data-id");
      const sid = Number(btn.getAttribute("data-sid") || id);
      const user = btn.getAttribute("data-user");
      if (!Number.isFinite(sid) || sid <= 0) {
        setStatus("ID de session invalide.", "error");
        return;
      }
      btn.disabled = true;
      setStatus(`Déconnexion de la session ${id}…`);
      const res = await gatedCall(
        "admin.usersessions",
        "logoff_session",
        { session_id: sid },
        (api, token) => api.logoff_session(sid, token),
        askConfirm,
        `Déconnecter la session de « ${user} » (ID ${id}) ? Les données non enregistrées seront perdues.`,
        "Déconnecter la session"
      );
      if (res.cancelled) {
        btn.disabled = false;
        setStatus("", "");
        return;
      }
      if (!res.ok) {
        setStatus(res.error || "Impossible de déconnecter.", "error");
        btn.disabled = false;
        return;
      }
      setStatus(`Session ${id} (${user}) déconnectée.`, "ok");
      await loadSessions();
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
