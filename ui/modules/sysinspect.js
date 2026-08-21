/**
 * Copyright (c) 2026 Mr-Aurevo-X. All rights reserved.
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 * Author: Mr-Aurevo-X | https://github.com/Mr-Aurevo-X
 */
/**
 * SysInspect — native in-hub (no iframe / no embedded window).
 * Bridge: pywebview.api.sysinspect.*
 */
import { mountModuleShell, waitNs, esc } from "./_in_hub.js";
import { t } from "../i18n.js";

export async function mount(root) {
  const { body, setStatus } = mountModuleShell(root, {
    title: t("siTitle"),
    subtitle: t("siSubtitle"),
    segments: [
      { id: "events", label: t("siSegEvents") },
      { id: "drivers", label: t("siSegDrivers") },
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
            <input type="number" id="siEvCount" value="50" min="1" max="500" title="${esc(t("siEvCountTitle"))}" />
          </div>
          <div style="min-width:160px">
            <select id="siEvLog">
              <option value="System">System</option>
              <option value="Application">Application</option>
              <option value="Security">Security</option>
            </select>
          </div>
          <div class="search-wrap">
            <input type="search" id="siEvFilter" placeholder="${esc(t("siEvFilterPh"))}" autocomplete="off" />
          </div>
          <button type="button" class="btn accent" id="siEvRefresh">${esc(t("commonRefresh"))}</button>
        </div>
        <p class="meta" id="siEvMeta"></p>
        <div class="table-wrap" style="flex:1;min-height:0;overflow:auto;margin-top:4px">
          <div class="empty-state" id="siEvEmpty">${esc(t("siEvEmptyHint"))}</div>
          <table class="data" id="siEvTable" hidden>
            <thead>
              <tr>
                <th style="min-width:140px">${esc(t("siColDate"))}</th>
                <th style="min-width:50px">${esc(t("siColId"))}</th>
                <th style="min-width:160px">${esc(t("siColSource"))}</th>
                <th>${esc(t("siColMessage"))}</th>
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
        emptyEl.textContent = q ? t("siEvEmptyFilter") : t("siEvEmptyNone");
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
      metaEl.textContent = t("siEvMeta", {
        n: rows.length,
        filtered: q ? t("siEvMetaFiltered") : "",
      });
    }

    filterEl.addEventListener("input", renderEvents);

    async function loadEvents() {
      const count   = Math.max(1, parseInt(countEl.value, 10) || 50);
      const logName = logEl.value;
      setStatus(t("siEvLoading"));
      refreshBtn.disabled = true;
      try {
        const api = await waitNs("sysinspect", "recent_errors");
        if (!api) {
          setStatus(t("siApiUnavailable"), "error");
          return;
        }
        const res = await api.recent_errors(count, logName);
        if (!res || !res.ok) {
          setStatus((res && res.error) || t("siLoadError"), "error");
          return;
        }
        eventsData = res.events || [];
        renderEvents();
        setStatus(t("siEvLoaded", { n: eventsData.length }), "ok");
      } catch (e) {
        setStatus(t("commonError", { err: e.message || e }), "error");
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
            <input type="search" id="siDrvFilter" placeholder="${esc(t("siDrvFilterPh"))}" autocomplete="off" />
          </div>
          <button type="button" class="btn accent" id="siDrvRefresh">${esc(t("commonRefresh"))}</button>
        </div>
        <p class="meta" id="siDrvMeta"></p>
        <div class="table-wrap" style="flex:1;min-height:0;overflow:auto;margin-top:4px">
          <div class="empty-state" id="siDrvEmpty">${esc(t("siDrvEmptyHint"))}</div>
          <table class="data" id="siDrvTable" hidden>
            <thead>
              <tr>
                <th>${esc(t("siColDevice"))}</th>
                <th style="min-width:110px">${esc(t("siColVersion"))}</th>
                <th style="min-width:140px">${esc(t("siColMaker"))}</th>
                <th style="min-width:80px">${esc(t("siColSigned"))}</th>
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
        emptyEl.textContent = q ? t("siDrvEmptyFilter") : t("siDrvEmptyNone");
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
                ? `<span style="color:var(--ok,#3dd68c);font-weight:600">${esc(t("siSigned"))}</span>`
                : `<span style="color:#ff8a95;font-weight:600">${esc(t("siUnsigned"))}</span>`
            }</td>
          </tr>`
        )
        .join("");
      metaEl.textContent = t("siDrvMeta", {
        n: rows.length,
        filtered: q ? t("siEvMetaFiltered") : "",
      });
    }

    filterEl.addEventListener("input", renderDrivers);

    async function loadDrivers() {
      setStatus(t("siDrvLoading"));
      refreshBtn.disabled = true;
      try {
        const api = await waitNs("sysinspect", "list_drivers");
        if (!api) {
          setStatus(t("siApiUnavailable"), "error");
          return;
        }
        const res = await api.list_drivers();
        if (!res || !res.ok) {
          setStatus((res && res.error) || t("siLoadError"), "error");
          return;
        }
        driversData = res.drivers || [];
        renderDrivers();
        setStatus(t("siDrvLoaded", { n: driversData.length }), "ok");
      } catch (e) {
        setStatus(t("commonError", { err: e.message || e }), "error");
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
