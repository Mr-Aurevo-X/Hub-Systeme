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
import { getLang, t } from "../i18n.js";

const FOCUS_MODE_BY_NAME = { off: 0, priority: 1, alarms: 2 };
function focusModeLabels() {
  return {
    0: t("adFocusOff"),
    1: t("adFocusPriority"),
    2: t("adFocusAlarms"),
    off: t("adFocusOff"),
    priority: t("adFocusPriority"),
    alarms: t("adFocusAlarms"),
  };
}

function focusModeKey(res) {
  if (!res) return "unknown";
  if (res.modeName && FOCUS_MODE_BY_NAME[res.modeName] != null) return res.modeName;
  const m = res.mode;
  if (m === 0 || m === 1 || m === 2) return ["off", "priority", "alarms"][m];
  if (typeof m === "string" && FOCUS_MODE_BY_NAME[m] != null) return m;
  return "unknown";
}

async function gatedCall(nsPath, action, payload, invoke, askConfirm, message, title) {
  const ok = await askConfirm(message, title || t("confirmTitle"));
  if (!ok) return { ok: false, error: t("commonCancelled"), cancelled: true };
  const api = await waitNs(nsPath, "prepare_action");
  if (!api) return { ok: false, error: t("commonApiUnavailable") };
  const prep = await api.prepare_action(action, payload || {});
  if (!prep || !prep.ok || !prep.token) {
    return { ok: false, error: (prep && prep.error) || t("commonFailed") };
  }
  try {
    return (await invoke(api, prep.token)) || { ok: false, error: t("commonFailed") };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

export async function mount(root) {
  const { body, setStatus, askConfirm } = mountModuleShell(root, {
    title: t("adTitle"),
    subtitle: t("adSubtitle"),
    segments: [
      { id: "powerplan",    label: t("adSegPowerplan") },
      { id: "printqueue",   label: t("adSegPrintqueue") },
      { id: "restorepoint", label: t("adSegRestorepoint") },
      { id: "usersessions", label: t("adSegUsersessions") },
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
            <span style="font-size:0.84rem;font-weight:600;color:var(--text)">${t("adPowerPlans")}</span>
            <button type="button" class="btn accent" id="ppRefresh" style="margin-left:auto">${t("commonRefresh")}</button>
          </div>
          <p class="meta" id="ppMeta"></p>
          <div class="table-wrap" style="flex:1;min-height:0;overflow:auto;margin-top:4px">
            <div class="empty-state" id="ppEmpty">${t("commonLoading")}</div>
            <table class="data" id="ppTable" hidden>
              <thead>
                <tr>
                  <th>${t("adPlanName")}</th>
                  <th>GUID</th>
                  <th style="min-width:70px">${t("commonStatus")}</th>
                  <th style="min-width:80px">${t("commonAction")}</th>
                </tr>
              </thead>
              <tbody id="ppBody"></tbody>
            </table>
          </div>
        </div>

        <div style="display:flex;gap:10px;flex-wrap:wrap;flex-shrink:0">

          <div class="panel" style="flex:1;min-width:260px" id="ppBattCard">
            <p style="font-size:0.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin-bottom:8px">${t("adBattery")}</p>
            <div id="ppBattInfo" class="empty-state" style="padding:8px 0">${t("commonLoading")}</div>
            <div class="toolbar-row" style="margin-top:10px;gap:6px;flex-wrap:wrap">
              <button type="button" class="btn accent" id="ppBattReport">${t("adGenerateReport")}</button>
              <button type="button" class="btn ghost" id="ppBattOpen" disabled>${t("commonOpenFolder")}</button>
            </div>
            <p class="meta" id="ppBattStatus" style="margin-top:8px"></p>
          </div>

          <div class="panel" style="flex:1;min-width:220px" id="ppFocusCard">
            <p style="font-size:0.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin-bottom:8px">Focus Assist</p>
            <div id="ppFocusInfo" class="empty-state" style="padding:6px 0">${t("commonLoading")}</div>
            <div class="toolbar-row" style="margin-top:10px;gap:6px" id="ppFocusBtns" hidden>
              <button type="button" class="btn ghost" data-mode="off"    id="ppFocOff">${t("adFocusOff")}</button>
              <button type="button" class="btn ghost" data-mode="priority" id="ppFocPri">${t("adFocusPriorityShort")}</button>
              <button type="button" class="btn ghost" data-mode="alarms" id="ppFocAlarm">${t("adFocusAlarms")}</button>
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
      setStatus(t("adPowerPlansLoading"));
      refreshBtn.disabled = true;
      tableEl.hidden = true;
      emptyEl.hidden = false;
      emptyEl.textContent = t("commonLoading");
      try {
        const api = await waitNs("admin.powerplan", "list_plans");
        if (!api) { setStatus(t("commonApiUnavailable"), "error"); return; }
        const res = await api.list_plans();
        if (!res || !res.ok) {
          setStatus((res && res.error) || t("adPlanListError"), "error");
          return;
        }
        const plans = res.plans || [];
        if (!plans.length) {
          emptyEl.textContent = t("adNoPowerPlan");
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
                  ? `<span style="color:var(--ok,#3dd68c);font-weight:600">✓ ${t("commonActive")}</span>`
                  : `<span style="color:var(--muted)">—</span>`
              }</td>
              <td>${
                p.active
                  ? ""
                  : `<button type="button" class="action-btn pp-activate" data-guid="${esc(p.guid)}" data-name="${esc(p.name || p.guid)}">${t("phEnable")}</button>`
              }</td>
            </tr>`
          )
          .join("");
        metaEl.textContent = t("adPlanCount", { n: plans.length, plural: plans.length !== 1 ? "s" : "" });
        setStatus(t("adPlansLoaded"), "ok");
      } catch (e) {
        setStatus(t("commonError", { err: e.message || e }), "error");
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
      setStatus(t("adActivatingPlan"));
      const res = await gatedCall(
        "admin.powerplan",
        "set_plan",
        { guid },
        (api, token) => api.set_plan(guid, token),
        askConfirm,
        t("adConfirmSetPlan", { name }),
        t("adChangePlanTitle")
      );
      if (res.cancelled) {
        btn.disabled = false;
        setStatus("", "");
        return;
      }
      if (!res.ok) {
        setStatus(res.error || t("adPlanActivateFailed"), "error");
        btn.disabled = false;
        return;
      }
      setStatus(t("adPlanActivated", { name }), "ok");
      await loadPlans();
    });

    async function loadBattery() {
      battInfo.textContent = t("commonLoading");
      try {
        const api = await waitNs("admin.powerplan", "get_battery_info");
        if (!api) { battInfo.textContent = t("commonApiUnavailable"); return; }
        const res = await api.get_battery_info();
        if (!res || !res.ok) {
          battInfo.textContent = (res && res.error) || t("commonUnavailable");
          return;
        }
        if (!res.hasBattery) {
          battInfo.innerHTML = `<p style="font-size:0.84rem;color:var(--muted)">${t("adBatteryNoDetected")}</p>`;
          return;
        }
        const bats = Array.isArray(res.batteries) ? res.batteries : [];
        if (!bats.length) {
          battInfo.innerHTML = `<p style="font-size:0.84rem;color:var(--muted)">${t("adBatteryNoDetail")}</p>`;
          return;
        }
        battInfo.innerHTML = bats
          .map((b) => {
            const pct = b.chargePercent != null ? `${b.chargePercent}%` : "—";
            const st =
              getLang() === "en"
                ? b.statusLabelEn || b.statusLabelFr || b.status || "—"
                : b.statusLabelFr || b.statusLabelEn || b.status || "—";
            const name = b.name || t("adBatteryName");
            const design = Number(b.designCapacity);
            const full = Number(b.fullChargeCapacity);
            let capLine = "";
            if (Number.isFinite(design) && design > 0 && Number.isFinite(full) && full > 0) {
              const z = Math.round((full / design) * 100);
              capLine = `<p style="font-size:0.84rem;margin:2px 0">${t("adCapacity")}<strong>${esc(String(full))} mWh / ${esc(String(design))} mWh design (~${z}%)</strong></p>`;
            }
            return `<div style="margin-bottom:8px">
              <p style="font-size:0.84rem;margin:2px 0"><strong>${esc(name)}</strong></p>
              <p style="font-size:0.84rem;margin:2px 0">${t("adCharge")}<strong>${esc(pct)}</strong></p>
              <p style="font-size:0.84rem;margin:2px 0">${t("adState")}<strong>${esc(String(st))}</strong></p>
              ${capLine}
            </div>`;
          })
          .join("");
      } catch {
        battInfo.textContent = t("commonUnavailable");
      }
    }

    battReport.addEventListener("click", async () => {
      battReport.disabled = true;
      battStatus.textContent = t("adGeneratingBatteryReport");
      setStatus(t("adBatteryReportStatus"));
      try {
        const api = await waitNs("admin.powerplan", "generate_battery_report");
        if (!api) {
          battStatus.textContent = t("commonApiUnavailable");
          setStatus(t("commonApiUnavailable"), "error");
          return;
        }
        const res = await api.generate_battery_report();
        if (!res || !res.ok) {
          battStatus.textContent = (res && res.error) || t("adGenerationFailed");
          setStatus(battStatus.textContent, "error");
          return;
        }
        lastBattFolder = res.folder || res.path || "";
        battOpen.disabled = !lastBattFolder;
        battStatus.textContent = res.path ? t("adReportPath", { path: res.path }) : t("adReportGenerated");
        setStatus(t("adBatteryReportReady"), "ok");
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
          setStatus((res && res.error) || t("adOpenFolderFailed"), "error");
        }
      } catch (e) {
        setStatus(String(e.message || e), "error");
      }
    });

    async function loadFocusAssist() {
      focusInfo.textContent = t("commonLoading");
      focusBtns.hidden = true;
      try {
        const api = await waitNs("admin.powerplan", "get_focus_assist_state");
        if (!api) { focusInfo.textContent = t("commonApiUnavailable"); return; }
        const res = await api.get_focus_assist_state();
        if (!res || !res.ok) {
          focusInfo.textContent = (res && res.error) || t("commonUnavailable");
          return;
        }
        const key = focusModeKey(res);
        const labels = focusModeLabels();
        focusInfo.innerHTML = `<p style="font-size:0.84rem;margin:3px 0">${t("adCurrentMode")}<strong>${esc(
          labels[key] || key
        )}</strong></p>`;
        focusBtns.hidden = false;
        focusBtns.querySelectorAll("[data-mode]").forEach((b) => {
          const on = b.getAttribute("data-mode") === key;
          b.classList.toggle("accent", on);
          b.classList.toggle("active", on);
        });
      } catch {
        focusInfo.textContent = t("adFocusUnavailable");
      }
    }

    focusBtns.addEventListener("click", async (ev) => {
      const btn = ev.target.closest("[data-mode]");
      if (!btn || btn.disabled) return;
      const modeName = btn.getAttribute("data-mode");
      const modeInt = FOCUS_MODE_BY_NAME[modeName];
      if (modeInt == null) return;
      focusBtns.querySelectorAll("[data-mode]").forEach((b) => (b.disabled = true));
      setStatus(t("adChangingFocus"));
      const res = await gatedCall(
        "admin.powerplan",
        "set_focus_assist",
        { mode: modeInt },
        (api, token) => api.set_focus_assist(modeInt, token),
        askConfirm,
        t("adConfirmFocusChange", { mode: focusModeLabels()[modeName] || modeName }),
        "Focus Assist"
      );
      focusBtns.querySelectorAll("[data-mode]").forEach((b) => (b.disabled = false));
      if (res.cancelled) {
        setStatus("", "");
        return;
      }
      if (!res.ok) {
        setStatus(res.error || t("adFocusChangeFailed"), "error");
        return;
      }
      setStatus(t("adFocusChanged", { mode: focusModeLabels()[modeName] || modeName }), "ok");
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
          <span style="font-size:0.84rem;font-weight:600;color:var(--text)">${t("adPrintQueues")}</span>
          <button type="button" class="btn accent" id="pqRefresh" style="margin-left:auto">${t("commonRefresh")}</button>
        </div>
        <p class="meta" id="pqMeta"></p>
        <div class="table-wrap" style="flex:1;min-height:0;overflow:auto;margin-top:4px">
          <div class="empty-state" id="pqEmpty">${t("commonLoading")}</div>
          <table class="data" id="pqTable" hidden>
            <thead>
              <tr>
                <th>${t("adPrinter")}</th>
                <th style="min-width:70px">${t("adJobs")}</th>
                <th style="min-width:100px">État</th>
                <th style="min-width:80px">${t("commonAction")}</th>
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
      setStatus(t("adPrintQueueLoading"));
      refreshBtn.disabled = true;
      tableEl.hidden = true;
      emptyEl.hidden = false;
      emptyEl.textContent = t("commonLoading");
      try {
        const api = await waitNs("admin.printqueue", "list_print_queue");
        if (!api) { setStatus(t("commonApiUnavailable"), "error"); return; }
        const res = await api.list_print_queue();
        if (!res || !res.ok) {
          setStatus((res && res.error) || t("adPrinterListError"), "error");
          return;
        }
        const printers = res.printers || [];
        if (!printers.length) {
          emptyEl.textContent = t("adNoPrinter");
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
                  ? `<button type="button" class="action-btn danger pq-purge" data-name="${esc(p.name)}">${t("adEmpty")}</button>`
                  : `<span style="color:var(--muted);font-size:0.76rem">${t("adEmpty")}</span>`
              }</td>
            </tr>`;
          })
          .join("");
        const total = printers.reduce(
          (s, p) => s + (p.jobCount ?? (Array.isArray(p.jobs) ? p.jobs.length : 0)),
          0
        );
        metaEl.textContent = t("adPrintQueueMeta", { printers: printers.length, printerPlural: printers.length !== 1 ? "s" : "", jobs: total, jobPlural: total !== 1 ? "x" : "" });
        setStatus(t("adPrintQueueLoaded"), "ok");
      } catch (e) {
        setStatus(t("commonError", { err: e.message || e }), "error");
      } finally {
        refreshBtn.disabled = false;
      }
    }

    tbodyEl.addEventListener("click", async (ev) => {
      const btn = ev.target.closest(".pq-purge");
      if (!btn || btn.disabled) return;
      const name = btn.getAttribute("data-name");
      btn.disabled = true;
      setStatus(t("adPurgingPrinter", { name }));
      const res = await gatedCall(
        "admin.printqueue",
        "purge_printer_jobs",
        { printer_name: name },
        (api, token) => api.purge_printer_jobs(name, token),
        askConfirm,
        t("adConfirmPurgePrinter", { name }),
        t("adPurgeQueueTitle")
      );
      if (res.cancelled) {
        btn.disabled = false;
        setStatus("", "");
        return;
      }
      if (!res.ok) {
        setStatus(res.error || t("adPurgeQueueFailed"), "error");
        btn.disabled = false;
        return;
      }
      setStatus(t("adPrinterPurged", { name }), "ok");
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
              <input type="text" id="rpDesc" placeholder="${esc(t("adRestoreDescriptionPh"))}" autocomplete="off" maxlength="128" />
            </div>
            <button type="button" class="btn danger" id="rpCreate">${t("adCreatePoint")}</button>
          </div>
        </div>

        <div class="panel flex-fill" style="display:flex;flex-direction:column;overflow:hidden;padding:14px 16px 8px">
          <div class="toolbar-row" style="flex-shrink:0;margin-bottom:8px">
            <span style="font-size:0.84rem;font-weight:600;color:var(--text)">${t("adExistingPoints")}</span>
            <button type="button" class="btn accent" id="rpRefresh" style="margin-left:auto">${t("commonRefresh")}</button>
          </div>
          <p class="meta" id="rpMeta"></p>
          <div class="table-wrap" style="flex:1;min-height:0;overflow:auto;margin-top:4px">
            <div class="empty-state" id="rpEmpty">${t("commonLoading")}</div>
            <table class="data" id="rpTable" hidden>
              <thead>
                <tr>
                  <th style="min-width:40px">${t("adIndex")}</th>
                  <th>${t("adDescription")}</th>
                  <th style="min-width:160px">${t("adCreatedAt")}</th>
                  <th style="min-width:100px">${t("adRestoreType")}</th>
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
      setStatus(t("adRestorePointsLoading"));
      refreshBtn.disabled = true;
      tableEl.hidden = true;
      emptyEl.hidden = false;
      emptyEl.textContent = t("commonLoading");
      try {
        const api = await waitNs("admin.restorepoint", "list_restore_points");
        if (!api) { setStatus(t("commonApiUnavailable"), "error"); return; }
        const res = await api.list_restore_points();
        if (!res || !res.ok) {
          setStatus((res && res.error) || t("adRestorePointListError"), "error");
          return;
        }
        const items = res.items || res.points || [];
        if (!items.length) {
          emptyEl.textContent = t("adNoRestorePoint");
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
        metaEl.textContent = t("adRestorePointCount", { n: items.length, plural: items.length !== 1 ? "s" : "" });
        setStatus(t("adRestorePointsLoaded"), "ok");
      } catch (e) {
        setStatus(t("commonError", { err: e.message || e }), "error");
      } finally {
        refreshBtn.disabled = false;
      }
    }

    createBtn.addEventListener("click", async () => {
      const desc = descEl.value.trim();
      if (!desc) {
        setStatus(t("adDescriptionRequired"), "error");
        descEl.focus();
        return;
      }
      createBtn.disabled = true;
      setStatus(t("adCreatingRestorePoint"));
      const res = await gatedCall(
        "admin.restorepoint",
        "create_restore_point",
        { description: desc },
        (api, token) => api.create_restore_point(desc, token),
        askConfirm,
        t("adConfirmCreateRestorePoint", { desc }),
        t("adCreateRestorePointTitle")
      );
      createBtn.disabled = false;
      if (res.cancelled) {
        setStatus("", "");
        return;
      }
      if (!res.ok) {
        setStatus(res.error || t("adCreateRestorePointFailed"), "error");
        return;
      }
      setStatus(t("adRestorePointCreated"), "ok");
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
          <span style="font-size:0.84rem;font-weight:600;color:var(--text)">${t("adUserSessions")}</span>
          <button type="button" class="btn accent" id="usRefresh" style="margin-left:auto">${t("commonRefresh")}</button>
        </div>
        <p class="meta" id="usMeta"></p>
        <div class="table-wrap" style="flex:1;min-height:0;overflow:auto;margin-top:4px">
          <div class="empty-state" id="usEmpty">${t("commonLoading")}</div>
          <table class="data" id="usTable" hidden>
            <thead>
              <tr>
                <th style="min-width:50px">${t("adSessionId")}</th>
                <th style="min-width:140px">${t("commonUser")}</th>
                <th style="min-width:90px">${t("commonStatus")}</th>
                <th style="min-width:140px">${t("adConnection")}</th>
                <th style="min-width:90px">${t("commonAction")}</th>
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
      setStatus(t("adSessionsLoading"));
      refreshBtn.disabled = true;
      tableEl.hidden = true;
      emptyEl.hidden = false;
      emptyEl.textContent = t("commonLoading");
      try {
        const api = await waitNs("admin.usersessions", "list_sessions");
        if (!api) { setStatus(t("commonApiUnavailable"), "error"); return; }
        const res = await api.list_sessions();
        if (!res || !res.ok) {
          setStatus((res && res.error) || t("adSessionListError"), "error");
          return;
        }
        const items = res.sessions || res.items || [];
        if (!items.length) {
          emptyEl.textContent = t("adNoActiveSession");
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
                  data-user="${esc(user)}">${t("adLogoff")}</button>
              </td>
            </tr>`;
          })
          .join("");
        metaEl.textContent = t("adSessionCount", { n: items.length, plural: items.length !== 1 ? "s" : "" });
        setStatus(t("adSessionsLoaded"), "ok");
      } catch (e) {
        setStatus(t("commonError", { err: e.message || e }), "error");
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
        setStatus(t("adInvalidSessionId"), "error");
        return;
      }
      btn.disabled = true;
      setStatus(t("adLoggingOffSession", { id }));
      const res = await gatedCall(
        "admin.usersessions",
        "logoff_session",
        { session_id: sid },
        (api, token) => api.logoff_session(sid, token),
        askConfirm,
        t("adConfirmLogoffSession", { user, id }),
        t("adLogoffSessionTitle")
      );
      if (res.cancelled) {
        btn.disabled = false;
        setStatus("", "");
        return;
      }
      if (!res.ok) {
        setStatus(res.error || t("adLogoffFailed"), "error");
        btn.disabled = false;
        return;
      }
      setStatus(t("adSessionLoggedOff", { id, user }), "ok");
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
