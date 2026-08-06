
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

  let selectedSvc = null;
  function setSvcBtns(on) {
    ["btnSvcStart","btnSvcStop","btnSvcRestart"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.disabled = !on;
    });
  }
  async function refreshSvc() {
    const st = document.getElementById("svcStatus");
    const body = document.getElementById("svcBody");
    const filter = (document.getElementById("svcFilter").value || "").toLowerCase();
    try {
      st.textContent = "...";
      const res = await call("list_services");
      if (!res.ok) { st.textContent = res.error || "Erreur"; return; }
      const rows = (res.services || []).filter((s) => {
        const blob = ((s.Name || "") + " " + (s.DisplayName || "")).toLowerCase();
        return !filter || blob.includes(filter);
      });
      body.innerHTML = "";
      rows.forEach((s) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${esc(s.Name)}</td><td>${esc(s.DisplayName)}</td><td>${esc(s.Status)}</td><td>${esc(s.StartType)}</td>`;
        tr.addEventListener("click", () => {
          body.querySelectorAll("tr").forEach((x) => x.classList.remove("selected"));
          tr.classList.add("selected");
          selectedSvc = s;
          setSvcBtns(true);
        });
        body.appendChild(tr);
      });
      st.textContent = rows.length + " service(s)" + (res.admin ? "" : " · admin recommande pour actions");
    } catch (e) { st.textContent = String(e.message || e); }
  }
  async function act(action) {
    if (!selectedSvc) return;
    const st = document.getElementById("svcStatus");
    let token = null;
    if (action === "start" || action === "stop" || action === "restart") {
      const labels = { start: "Démarrer", stop: "Arrêter", restart: "Redémarrer" };
      if (!window.confirm(`${labels[action] || action} le service ${selectedSvc.Name} ?`)) return;
      const prep = await call("prepare_service_action", selectedSvc.Name, action);
      if (!prep || !prep.ok || !prep.token) {
        st.textContent = (prep && prep.error) || "Confirmation refusée";
        return;
      }
      token = prep.token;
    }
    const res = await call("service_action", selectedSvc.Name, action, token);
    st.textContent = res.ok ? ("OK " + action) : (res.error || "Echec");
    if (res.ok) refreshSvc();
  }
  document.getElementById("btnSvcRefresh")?.addEventListener("click", refreshSvc);
  document.getElementById("svcFilter")?.addEventListener("input", refreshSvc);
  document.getElementById("btnSvcStart")?.addEventListener("click", () => act("start"));
  document.getElementById("btnSvcStop")?.addEventListener("click", () => act("stop"));
  document.getElementById("btnSvcRestart")?.addEventListener("click", () => act("restart"));

})();
