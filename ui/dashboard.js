/**
 * Dashboard Accueil Hub-Systeme — KPIs lecture seule + tuiles modules.
 */

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmt(v, suffix = "") {
  if (v == null || Number.isNaN(Number(v))) return "—";
  return `${v}${suffix}`;
}

function api() {
  return window.pywebview && window.pywebview.api;
}

const FALLBACK_MODULES = [
  {
    id: "systemclean",
    label: "SystemClean",
    desc: "WinCleaner · DiskMap — nettoyage, disque, traces, debloat",
    ico: "⌫",
  },
  {
    id: "processhub",
    label: "ProcessHub",
    desc: "Processus, services, démarrage et tâches planifiées",
    ico: "⚡",
  },
  {
    id: "uninstx",
    label: "UninstX",
    desc: "Programmes installés, désinstallation et résiduels",
    ico: "⊟",
  },
  {
    id: "sysinspect",
    label: "SysInspect",
    desc: "Événements Windows et inventaire des pilotes",
    ico: "◎",
  },
  {
    id: "admin",
    label: "Admin léger",
    desc: "PowerPlan · Impression · Restauration · Sessions",
    ico: "⚙",
  },
];

const ICO = Object.fromEntries(FALLBACK_MODULES.map((m) => [m.id, m.ico]));

export async function mount(root) {
  root.innerHTML = `
    <header class="hub-page-header">
      <h1>Système</h1>
      <p>L'Atelier PC Command — tableau de bord lecture seule · aucun mutator</p>
    </header>
    <div class="hub-dash-toolbar">
      <h2 class="hub-section-title">État global</h2>
      <button type="button" class="hub-refresh-btn" id="kpiRefresh" title="Actualiser les KPIs">Actualiser</button>
    </div>
    <div class="hub-kpi-grid" id="kpiGrid" aria-busy="true">
      <div class="hub-skel kpi"></div>
      <div class="hub-skel kpi"></div>
      <div class="hub-skel kpi"></div>
      <div class="hub-skel kpi"></div>
    </div>
    <h2 class="hub-section-title" style="margin:1.15rem 0 .65rem">Accès rapide</h2>
    <div class="hub-tile-grid" id="tileGrid"></div>
    <p class="hub-status" id="dashStatus"></p>
  `;

  const a = api();
  let modules = [];
  try {
    if (a?.dashboard?.list_modules) {
      const res = await a.dashboard.list_modules();
      modules = (res && res.modules) || [];
    }
  } catch (_) {}

  if (!modules.length) modules = FALLBACK_MODULES;
  else {
    modules = modules.map((m) => ({
      ...m,
      ico: ICO[m.id] || "▪",
      desc: m.desc || FALLBACK_MODULES.find((f) => f.id === m.id)?.desc || "",
    }));
  }

  const tiles = document.getElementById("tileGrid");
  tiles.innerHTML = modules
    .map(
      (m) => `
      <button type="button" class="hub-tile" data-open="${esc(m.id)}">
        <span class="hub-tile-ico" aria-hidden="true">${esc(m.ico || "▪")}</span>
        <strong>${esc(m.label)}</strong>
        <span>${esc(m.desc || "")}</span>
      </button>`
    )
    .join("");

  tiles.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-open]");
    if (!btn) return;
    const id = btn.getAttribute("data-open");
    if (id && window.HubSysteme?.showView) window.HubSysteme.showView(id);
  });

  async function loadKpis() {
    const grid = document.getElementById("kpiGrid");
    const status = document.getElementById("dashStatus");
    grid.setAttribute("aria-busy", "true");
    grid.innerHTML = `
      <div class="hub-skel kpi"></div>
      <div class="hub-skel kpi"></div>
      <div class="hub-skel kpi"></div>
      <div class="hub-skel kpi"></div>`;
    try {
      let kpis = { ok: true };
      if (a?.dashboard?.get_kpis) {
        kpis = await a.dashboard.get_kpis();
      }
      const disk =
        kpis.diskFreeGb != null && kpis.diskTotalGb != null
          ? `${fmt(kpis.diskFreeGb)} / ${fmt(kpis.diskTotalGb)} Go`
          : fmt(kpis.diskFreeGb, " Go libres");
      grid.setAttribute("aria-busy", "false");
      grid.innerHTML = `
        <div class="hub-kpi"><span class="label">Disque C:</span><span class="value">${esc(disk)}</span></div>
        <div class="hub-kpi"><span class="label">RAM utilisée</span><span class="value">${esc(fmt(kpis.ramUsedPct, " %"))}</span></div>
        <div class="hub-kpi"><span class="label">Processus</span><span class="value">${esc(fmt(kpis.processCount))}</span></div>
        <div class="hub-kpi"><span class="label">Admin</span><span class="value">${kpis.admin ? "Oui" : "Non"}</span></div>
      `;
      if (kpis.partial && kpis.error) {
        status.textContent = "KPIs partiels : " + kpis.error;
      } else {
        status.textContent = "Lecture locale · aucune donnée envoyée hors machine.";
      }
    } catch (e) {
      grid.setAttribute("aria-busy", "false");
      grid.innerHTML = `
        <div class="hub-kpi"><span class="label">Disque C:</span><span class="value">—</span></div>
        <div class="hub-kpi"><span class="label">RAM utilisée</span><span class="value">—</span></div>
        <div class="hub-kpi"><span class="label">Processus</span><span class="value">—</span></div>
        <div class="hub-kpi"><span class="label">Admin</span><span class="value">—</span></div>
      `;
      status.textContent = "KPIs indisponibles (API ou bridge).";
    }
  }

  document.getElementById("kpiRefresh")?.addEventListener("click", () => loadKpis());
  await loadKpis();
}
