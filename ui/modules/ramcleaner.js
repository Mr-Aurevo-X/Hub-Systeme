/**
 * Copyright (c) 2026 Mr-Aurevo-X. All rights reserved.
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 * Author: Mr-Aurevo-X | https://github.com/Mr-Aurevo-X
 */
/**
 * RamCleaner — native in-hub (Lab/Ram Cleaner SoT parity).
 * Bridge: pywebview.api.ramcleaner.*
 * ConfirmGate on ALL mutators (kill_selected / trim_selected).
 */
import { esc } from "../_hub_util.js";
import { ensureInHubCss, waitNs } from "./_in_hub.js";
import { locale, t } from "../i18n.js";

function ensureCss() {
  const id = "hub-ramcleaner-css";
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = "./modules/ramcleaner.css";
  document.head.appendChild(link);
}

function skeletonMarkup(n = 4) {
  return `<div class="rc-skel" aria-hidden="true">${Array.from(
    { length: n },
    () => `<div class="rc-skel-row"></div>`
  ).join("")}</div>`;
}

export async function mount(root) {
  ensureInHubCss();
  ensureCss();

  root.innerHTML = `
    <div class="hub-ramcleaner hub-inhub" style="position:relative">
      <header class="hub-page-header rc-hero">
        <div>
          <h1>${esc(t("rcTitle"))}</h1>
          <p>${esc(t("rcSubtitle"))}</p>
        </div>
        <div class="rc-meter" aria-live="polite">
          <div class="rc-meter-top">
            <span id="rcRamLabel">—</span>
            <span id="rcRamPct">—</span>
          </div>
          <div class="rc-bar"><div id="rcRamFill" class="rc-fill"></div></div>
          <p id="rcRamDetail" class="rc-detail">—</p>
        </div>
      </header>

      <div class="rc-toolbar">
        <button type="button" class="btn accent" id="rcAnalyze">${esc(t("rcAnalyze"))}</button>
        <button type="button" class="btn danger" id="rcKill" disabled>${esc(t("rcKill"))}</button>
        <button type="button" class="btn ghost" id="rcTrim" disabled>${esc(t("rcTrim"))}</button>
        <span class="status" id="rcStatus"></span>
      </div>

      <div class="rc-panels">
        <section class="rc-panel">
          <div class="rc-panel-head">
            <h2>${esc(t("rcRecTitle"))}</h2>
            <p class="rc-panel-sub">${esc(t("rcRecSub"))}</p>
          </div>
          <div id="rcRecList" class="rc-list">${skeletonMarkup(3)}</div>
        </section>
        <section class="rc-panel">
          <div class="rc-panel-head">
            <h2>${esc(t("rcCautionTitle"))}</h2>
            <p class="rc-panel-sub">${esc(t("rcCautionSub"))}</p>
          </div>
          <div id="rcCautionList" class="rc-list">${skeletonMarkup(2)}</div>
          <div class="rc-panel-head rc-panel-head-spaced">
            <h2>${esc(t("rcFamTitle"))}</h2>
          </div>
          <div id="rcFamList" class="rc-fam-list"></div>
        </section>
      </div>

      <div class="confirm-overlay" id="rcConfirm" hidden>
        <div class="confirm-box" role="dialog" aria-modal="true">
          <h3 id="rcConfirmTitle">${esc(t("confirmTitle"))}</h3>
          <p id="rcConfirmMsg"></p>
          <div class="btn-row">
            <button type="button" class="btn" id="rcConfirmCancel">${esc(t("confirmCancel"))}</button>
            <button type="button" class="btn danger" id="rcConfirmOk">${esc(t("confirmOk"))}</button>
          </div>
        </div>
      </div>
    </div>`;

  const api = await waitNs("ramcleaner", "analyze");
  const btnAnalyze = root.querySelector("#rcAnalyze");
  const btnKill = root.querySelector("#rcKill");
  const btnTrim = root.querySelector("#rcTrim");
  const statusEl = root.querySelector("#rcStatus");
  const recList = root.querySelector("#rcRecList");
  const cautionList = root.querySelector("#rcCautionList");
  const famList = root.querySelector("#rcFamList");
  const ramLabel = root.querySelector("#rcRamLabel");
  const ramPct = root.querySelector("#rcRamPct");
  const ramFill = root.querySelector("#rcRamFill");
  const ramDetail = root.querySelector("#rcRamDetail");
  const confirmOverlay = root.querySelector("#rcConfirm");
  const confirmTitle = root.querySelector("#rcConfirmTitle");
  const confirmMsg = root.querySelector("#rcConfirmMsg");
  const confirmOk = root.querySelector("#rcConfirmOk");
  const confirmCancel = root.querySelector("#rcConfirmCancel");

  let confirmResolver = null;
  let busy = false;

  function setStatus(msg, cls) {
    statusEl.textContent = msg || "";
    statusEl.className = "status" + (cls ? " " + cls : "");
  }

  function askConfirm(message, titleText) {
    confirmTitle.textContent = titleText || t("confirmTitle");
    confirmMsg.textContent = message;
    confirmOverlay.hidden = false;
    return new Promise((resolve) => {
      confirmResolver = resolve;
    });
  }

  function closeConfirm(ok) {
    confirmOverlay.hidden = true;
    if (confirmResolver) {
      const r = confirmResolver;
      confirmResolver = null;
      r(ok);
    }
  }

  confirmOk.addEventListener("click", () => closeConfirm(true));
  confirmCancel.addEventListener("click", () => closeConfirm(false));

  function updateActions() {
    const n = root.querySelectorAll('.rc-card input[type="checkbox"]:checked').length;
    btnKill.disabled = busy || n === 0;
    btnTrim.disabled = busy || n === 0;
    btnAnalyze.disabled = busy;
  }

  function selectedPayload() {
    const pids = [];
    let mb = 0;
    root.querySelectorAll(".rc-card").forEach((card) => {
      const cb = card.querySelector('input[type="checkbox"]');
      if (!cb || !cb.checked) return;
      let list = [];
      try {
        list = JSON.parse(card.getAttribute("data-pids") || "[]");
      } catch (_) {
        list = [];
      }
      list.forEach((p) => pids.push(Number(p)));
      mb += Number(card.getAttribute("data-mb") || 0);
    });
    return { pids: [...new Set(pids)].filter((p) => p > 0), mb: Math.round(mb * 10) / 10 };
  }

  function renderOverview(ov) {
    if (!ov || !ov.ok) return;
    const used = ov.usedMb;
    const total = ov.totalMb;
    const pct = ov.percent;
    const loc = locale();
    ramLabel.textContent = `${Number(used).toLocaleString(loc)} / ${Number(total).toLocaleString(loc)} Mo`;
    ramPct.textContent = `${Number(pct).toFixed(1)} %`;
    ramFill.style.width = `${Math.min(100, Number(pct) || 0)}%`;
    ramDetail.textContent = t("rcAvailable", { n: Number(ov.availableMb).toLocaleString(loc) });
    famList.innerHTML = "";
    (ov.topFamilies || []).slice(0, 12).forEach((f) => {
      const row = document.createElement("div");
      row.className = "rc-fam-row";
      row.innerHTML = `<span>${esc(f.name)} ×${esc(f.count)}</span><span>${Number(f.wsMb).toLocaleString(loc)} Mo</span>`;
      famList.appendChild(row);
    });
  }

  function renderCard(rec, caution) {
    const card = document.createElement("label");
    card.className = "rc-card" + (caution ? " caution" : "");
    card.setAttribute("data-pids", JSON.stringify(rec.pids || []));
    card.setAttribute("data-mb", String(rec.estFreedMb || 0));
    const checked = rec.defaultChecked ? "checked" : "";
    const pids = (rec.pids || []).slice(0, 6).join(", ") + ((rec.pids || []).length > 6 ? "…" : "");
    const loc = locale();
    card.innerHTML = `
      <input type="checkbox" ${checked} />
      <div>
        <p class="rc-title">${esc(rec.title || "")}</p>
        <p class="rc-reason">${esc(rec.reason || "")} · PID ${esc(pids)}</p>
      </div>
      <div class="rc-meta">~${Number(rec.estFreedMb || 0).toLocaleString(loc)} Mo</div>
    `;
    card.querySelector("input").addEventListener("change", updateActions);
    return card;
  }

  function renderLists(data) {
    recList.innerHTML = "";
    cautionList.innerHTML = "";
    const recs = data.recommendations || [];
    const caution = data.caution || [];
    if (!recs.length) {
      recList.innerHTML = `<p class="rc-empty">${esc(t("rcEmptyRec"))}</p>`;
    } else {
      recs.forEach((r) => recList.appendChild(renderCard(r, false)));
    }
    if (!caution.length) {
      cautionList.innerHTML = `<p class="rc-empty">${esc(t("rcEmptyCaution"))}</p>`;
    } else {
      caution.forEach((r) => cautionList.appendChild(renderCard(r, true)));
    }
    updateActions();
  }

  async function runAnalyze() {
    if (!api || typeof api.analyze !== "function") {
      setStatus(t("rcApiUnavailable"), "error");
      return;
    }
    busy = true;
    updateActions();
    recList.innerHTML = skeletonMarkup(4);
    cautionList.innerHTML = skeletonMarkup(3);
    setStatus(t("rcAnalyzing"));
    try {
      const data = await api.analyze();
      if (!data || !data.ok) {
        setStatus((data && data.error) || t("rcAnalyzeFail"), "error");
        recList.innerHTML = `<p class="rc-empty">${esc(t("rcAnalyzeFail"))}.</p>`;
        cautionList.innerHTML = "";
        return;
      }
      if (data.overview) renderOverview(data.overview);
      renderLists(data);
      setStatus(t("rcAnalyzeDone"));
    } catch (e) {
      setStatus(t("rcAnalyzeFail"), "error");
      recList.innerHTML = `<p class="rc-empty">${esc(t("rcAnalyzeFail"))}.</p>`;
      cautionList.innerHTML = "";
    } finally {
      busy = false;
      updateActions();
    }
  }

  btnAnalyze.addEventListener("click", () => {
    runAnalyze();
  });

  btnKill.addEventListener("click", async () => {
    const { pids, mb } = selectedPayload();
    if (!pids.length) {
      setStatus(t("rcNoneChecked"));
      return;
    }
    const msg = t("rcKillConfirm", { n: pids.length, mb });
    if (!(await askConfirm(msg, t("rcKillConfirmTitle")))) return;
    busy = true;
    updateActions();
    try {
      const prep = await api.prepare_kill(pids);
      if (!prep || !prep.ok || !prep.token) {
        setStatus((prep && prep.error) || t("commonFailed"), "error");
        return;
      }
      const res = await api.kill_selected(pids, prep.token);
      if (!res || !res.ok) {
        setStatus((res && res.error) || t("commonFailed"), "error");
        return;
      }
      setStatus(t("rcKillDone", { n: res.killedCount || 0 }));
      await runAnalyze();
    } catch (e) {
      setStatus(t("commonFailed"), "error");
    } finally {
      busy = false;
      updateActions();
    }
  });

  btnTrim.addEventListener("click", async () => {
    const { pids } = selectedPayload();
    if (!pids.length) {
      setStatus(t("rcNoneChecked"));
      return;
    }
    const msg = t("rcTrimConfirm", { n: pids.length });
    if (!(await askConfirm(msg, t("rcTrimConfirmTitle")))) return;
    busy = true;
    updateActions();
    try {
      const prep = await api.prepare_trim(pids);
      if (!prep || !prep.ok || !prep.token) {
        setStatus((prep && prep.error) || t("commonFailed"), "error");
        return;
      }
      const res = await api.trim_selected(pids, prep.token);
      if (!res || !res.ok) {
        setStatus((res && res.error) || t("commonFailed"), "error");
        return;
      }
      setStatus(t("rcTrimDone", { n: res.trimmedCount || 0 }));
      await runAnalyze();
    } catch (e) {
      setStatus(t("commonFailed"), "error");
    } finally {
      busy = false;
      updateActions();
    }
  });

  // Boot: overview + empty recs (skeleton cleared)
  if (api && typeof api.get_overview === "function") {
    try {
      const ov = await api.get_overview();
      if (ov && ov.ok) renderOverview(ov);
    } catch (_) {}
  }
  recList.innerHTML = `<p class="rc-empty">${esc(t("rcEmptyRec"))}</p>`;
  cautionList.innerHTML = `<p class="rc-empty">${esc(t("rcEmptyCaution"))}</p>`;
  updateActions();
}
