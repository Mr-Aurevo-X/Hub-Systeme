
(function () {
  "use strict";
  function api() { return window.pywebview && window.pywebview.api; }
  async function call(method, ...args) {
    const a = api();
    if (!a || typeof a[method] !== "function") throw new Error("API indisponible");
    return a[method](...args);
  }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function switchTab(id) {
    document.querySelectorAll(".hub-tab").forEach((btn) => {
      const on = btn.dataset.tab === id;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    document.querySelectorAll(".hub-panel").forEach((panel) => {
      const on = panel.dataset.panel === id;
      panel.classList.toggle("active", on);
      panel.hidden = !on;
    });
  }
  document.querySelectorAll(".hub-tab").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  let lastBattFolder = "";
  async function refreshQuiet() {
    const st = document.getElementById("quietStatus");
    const out = document.getElementById("quietOut");
    try {
      st.textContent = "…";
      const res = await call("get_focus_assist_state");
      out.textContent = JSON.stringify(res, null, 2);
      st.textContent = res.ok ? ("Mode: " + (res.modeName || res.mode)) : (res.error || "Erreur");
    } catch (e) { st.textContent = String(e.message || e); }
  }
  async function setQuiet(mode) {
    const st = document.getElementById("quietStatus");
    try {
      const res = await call("set_focus_assist", mode);
      st.textContent = res.ok ? ("OK → " + mode) : (res.error || "Échec");
      await refreshQuiet();
    } catch (e) { st.textContent = String(e.message || e); }
  }
  document.getElementById("btnQuietRefresh")?.addEventListener("click", refreshQuiet);
  document.getElementById("btnQuietOff")?.addEventListener("click", () => setQuiet(0));
  document.getElementById("btnQuietPrio")?.addEventListener("click", () => setQuiet(1));
  document.getElementById("btnQuietAlarms")?.addEventListener("click", () => setQuiet(2));
  document.getElementById("btnQuietSettings")?.addEventListener("click", () => call("open_focus_assist_settings"));
  document.getElementById("btnBattInfo")?.addEventListener("click", async () => {
    const st = document.getElementById("battStatus");
    const out = document.getElementById("battOut");
    try {
      const res = await call("get_battery_info");
      out.textContent = JSON.stringify(res, null, 2);
      st.textContent = res.hasBattery ? "Batterie détectée" : "Pas de batterie";
    } catch (e) { st.textContent = String(e.message || e); }
  });
  document.getElementById("btnBattReport")?.addEventListener("click", async () => {
    const st = document.getElementById("battStatus");
    const out = document.getElementById("battOut");
    const btn = document.getElementById("btnBattOpen");
    try {
      st.textContent = "Génération…";
      const res = await call("generate_battery_report");
      out.textContent = JSON.stringify(res, null, 2);
      if (res.ok) {
        lastBattFolder = res.folder || res.path || "";
        if (btn) btn.disabled = !lastBattFolder;
        st.textContent = "Rapport: " + (res.path || "");
      } else st.textContent = res.error || "Échec";
    } catch (e) { st.textContent = String(e.message || e); }
  });
  document.getElementById("btnBattOpen")?.addEventListener("click", async () => {
    if (lastBattFolder) await call("open_battery_folder", lastBattFolder);
  });

})();
