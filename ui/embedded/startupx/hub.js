
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

  let selectedTask = null;
  async function refreshTasks() {
    const st = document.getElementById("tasksStatus");
    const body = document.getElementById("tasksBody");
    const filter = (document.getElementById("taskFilter").value || "").toLowerCase();
    try {
      st.textContent = "...";
      const res = await call("list_tasks");
      if (!res.ok) { st.textContent = res.error || "Erreur"; return; }
      const rows = (res.tasks || []).filter((t) => {
        const blob = ((t.TaskName || "") + " " + (t.TaskPath || "")).toLowerCase();
        return !filter || blob.includes(filter);
      });
      body.innerHTML = "";
      rows.forEach((t) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${esc(t.TaskName)}</td><td>${esc(t.TaskPath)}</td><td>${esc(t.State)}</td><td>${esc(t.Enabled)}</td>`;
        tr.addEventListener("click", () => {
          body.querySelectorAll("tr").forEach((x) => x.classList.remove("selected"));
          tr.classList.add("selected");
          selectedTask = t;
          document.getElementById("btnTaskEnable").disabled = false;
          document.getElementById("btnTaskDisable").disabled = false;
        });
        body.appendChild(tr);
      });
      st.textContent = rows.length + " tache(s)";
    } catch (e) { st.textContent = String(e.message || e); }
  }
  document.getElementById("btnTasksRefresh")?.addEventListener("click", refreshTasks);
  document.getElementById("taskFilter")?.addEventListener("input", refreshTasks);
  async function setEnabled(en) {
    if (!selectedTask) return;
    const st = document.getElementById("tasksStatus");
    const res = await call("set_task_enabled", selectedTask.TaskName, selectedTask.TaskPath || "\\", en);
    st.textContent = res.ok ? "OK" : (res.error || "Echec");
    if (res.ok) refreshTasks();
  }
  document.getElementById("btnTaskEnable")?.addEventListener("click", () => setEnabled(true));
  document.getElementById("btnTaskDisable")?.addEventListener("click", () => setEnabled(false));
  document.getElementById("btnTaskCreate")?.addEventListener("click", async () => {
    const st = document.getElementById("tasksStatus");
    const name = document.getElementById("newTaskName").value;
    const prog = document.getElementById("newTaskProg").value;
    const args = document.getElementById("newTaskArgs").value;
    if (!window.confirm("Creer cette tache au logon ?")) return;
    try {
      const prep = await call("prepare_create_at_logon", name, prog, args);
      if (!prep || !prep.ok || !prep.token) {
        st.textContent = (prep && prep.error) || "Echec";
        return;
      }
      const res = await call("create_at_logon", name, prog, args, prep.token);
      st.textContent = res.ok ? "Creee" : (res.error || "Echec");
      if (res.ok) refreshTasks();
    } catch (e) {
      st.textContent = String(e.message || e);
    }
  });

})();
