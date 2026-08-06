
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

  function fmtMb(n) { return (Number(n) || 0).toFixed(1); }
  document.getElementById("btnTempSizes")?.addEventListener("click", async () => {
    const body = document.getElementById("tempBody");
    try {
      const res = await call("temp_sizes");
      body.innerHTML = "";
      (res.folders || []).forEach((f) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${esc(f.path)}</td><td>${fmtMb(f.sizeMb)}</td><td>${esc(f.files)}</td>
          <td><button type="button" class="btn" data-path="${esc(f.path)}">Ouvrir</button></td>`;
        tr.querySelector("button")?.addEventListener("click", () => call("open_temp_folder", f.path));
        body.appendChild(tr);
      });
    } catch (e) { console.warn(e); }
  });
  document.getElementById("btnRecycleList")?.addEventListener("click", async () => {
    const body = document.getElementById("recycleBody");
    const meta = document.getElementById("recycleMeta");
    const res = await call("list_recycle_bin");
    body.innerHTML = "";
    (res.items || []).slice(0, 200).forEach((it) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${esc(it.name)}</td><td>${esc(it.size)}</td><td>${esc(it.type)}</td>`;
      body.appendChild(tr);
    });
    meta.textContent = (res.count || 0) + " element(s), " + Math.round((res.totalBytes || 0) / 1048576) + " Mo";
  });
  document.getElementById("btnRecycleEmpty")?.addEventListener("click", async () => {
    if (!confirm("Vider la corbeille Windows ?")) return;
    const prep = await call("prepare_empty_recycle_bin");
    if (!prep || !prep.ok || !prep.token) {
      document.getElementById("recycleMeta").textContent = (prep && prep.error) || "Confirmation refusee";
      return;
    }
    const res = await call("empty_recycle_bin", prep.token);
    document.getElementById("recycleMeta").textContent = res.ok ? "Corbeille videe" : (res.error || "Echec");
    if (res.ok) document.getElementById("btnRecycleList").click();
  });
  document.getElementById("btnIconRebuild")?.addEventListener("click", async () => {
    if (!confirm("Reconstruire le cache d icones (Explorer redemarre) ?")) return;
    const out = document.getElementById("iconOut");
    out.textContent = "...";
    const prep = await call("prepare_rebuild_icon_cache");
    if (!prep || !prep.ok || !prep.token) {
      out.textContent = (prep && prep.error) || "Confirmation refusee";
      return;
    }
    const res = await call("rebuild_icon_cache", prep.token);
    out.textContent = res.ok ? (res.output || "OK") : (res.error || "Echec");
  });
  document.getElementById("btnRecentList")?.addEventListener("click", async () => {
    const body = document.getElementById("recentBody");
    const meta = document.getElementById("recentMeta");
    const res = await call("list_recent_files");
    body.innerHTML = "";
    (res.items || []).slice(0, 300).forEach((it) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${esc(it.name)}</td><td>${esc(it.target)}</td><td>${esc(it.modified)}</td>
        <td><button type="button" class="btn">Ouvrir</button></td>`;
      tr.querySelector("button")?.addEventListener("click", () => call("open_recent_target", it.target || it.lnkPath));
      body.appendChild(tr);
    });
    meta.textContent = (res.count || 0) + " .lnk — " + (res.recentDir || "");
  });
  document.getElementById("btnRecentClear")?.addEventListener("click", async () => {
    if (!confirm("Supprimer les raccourcis .lnk du dossier Recent ? (Traces Recent reste disponible)")) return;
    const prep = await call("prepare_clear_recent_files");
    if (!prep || !prep.ok || !prep.token) {
      document.getElementById("recentMeta").textContent = (prep && prep.error) || "Confirmation refusee";
      return;
    }
    const res = await call("clear_recent_files", prep.token);
    document.getElementById("recentMeta").textContent = res.ok ? ("Supprimes: " + res.deleted) : (res.error || "Echec");
    if (res.ok) document.getElementById("btnRecentList").click();
  });

})();
