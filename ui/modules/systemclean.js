import { apiNs, esc, confirmMutator } from "./_hub_util.js";

export async function mount(root) {
  const api = apiNs("systemclean");
  root.innerHTML = `
    <div class="hub-module-panel">
      <header class="hub-page-header">
        <h1>SystemClean</h1>
        <p>WinCleaner · DiskMap — ConfirmGate</p>
      </header>
      <div class="hub-module-apps" style="margin-bottom:.75rem">
        <button type="button" class="hub-btn" data-seg="clean">WinCleaner</button>
        <button type="button" class="hub-btn" data-seg="disk">DiskMap</button>
        <button type="button" class="hub-btn accent" data-open="WinCleaner">App WinCleaner</button>
        <button type="button" class="hub-btn accent" data-open="DiskMap">App DiskMap</button>
      </div>
      <div id="scBody" class="hub-skel kpi" style="min-height:12rem"></div>
      <p class="hub-status" id="scStatus"></p>
    </div>`;
  const body = root.querySelector("#scBody");
  const status = root.querySelector("#scStatus");

  async function showClean() {
    body.classList.remove("hub-skel", "kpi");
    body.innerHTML = `
      <div class="hub-module-apps" style="flex-wrap:wrap;gap:.5rem">
        <button type="button" class="hub-btn accent" id="scRecycle">Vider corbeille</button>
        <button type="button" class="hub-btn" id="scIcons">Rebuild icon cache</button>
        <button type="button" class="hub-btn" id="scRecent">Effacer fichiers récents</button>
        <button type="button" class="hub-btn" id="scListRecent">Lister récents</button>
      </div>
      <pre id="scOut" class="hub-note" style="margin-top:.75rem;white-space:pre-wrap;max-height:14rem;overflow:auto"></pre>`;
    const out = body.querySelector("#scOut");
    body.querySelector("#scRecycle")?.addEventListener("click", async () => {
      const c = await confirmMutator("systemclean", "empty_recycle_bin", {}, "Vider la corbeille ?");
      if (!c.ok) return;
      const r = await api.empty_recycle_bin(c.token);
      status.textContent = r.ok ? "Corbeille vidée" : (r.error || "Échec");
      out.textContent = JSON.stringify(r, null, 2);
    });
    body.querySelector("#scIcons")?.addEventListener("click", async () => {
      const c = await confirmMutator("systemclean", "rebuild_icon_cache", {}, "Reconstruire le cache d'icônes ?");
      if (!c.ok) return;
      const r = await api.rebuild_icon_cache(c.token);
      status.textContent = r.ok ? "Icon cache OK" : (r.error || "Échec");
      out.textContent = JSON.stringify(r, null, 2);
    });
    body.querySelector("#scRecent")?.addEventListener("click", async () => {
      const c = await confirmMutator("systemclean", "clear_recent_files", {}, "Effacer les fichiers récents ?");
      if (!c.ok) return;
      const r = await api.clear_recent_files(c.token);
      status.textContent = r.ok ? "Récents effacés" : (r.error || "Échec");
      out.textContent = JSON.stringify(r, null, 2);
    });
    body.querySelector("#scListRecent")?.addEventListener("click", async () => {
      const r = await api.list_recent_files();
      out.textContent = JSON.stringify(r, null, 2);
      status.textContent = r.ok ? "Liste récents" : (r.error || "Échec");
    });
    status.textContent = "Mutators WinCleaner";
  }

  async function showDisk() {
    body.classList.add("hub-skel", "kpi");
    body.innerHTML = "";
    const drives = await api.list_drives();
    body.classList.remove("hub-skel", "kpi");
    const list = drives?.drives || [];
    body.innerHTML = `
      <div class="hub-module-apps" style="margin-bottom:.5rem;flex-wrap:wrap">
        <select id="scRoot">${list
          .map((d) => `<option value="${esc(d.path)}">${esc(d.label)} — libre ${esc(d.freeLabel)}</option>`)
          .join("")}</select>
        <button type="button" class="hub-btn" id="scScanLarge">Gros fichiers</button>
        <button type="button" class="hub-btn" id="scEmpty">Dossiers vides</button>
      </div>
      <div id="scDiskOut" style="max-height:16rem;overflow:auto;font-size:.8rem"></div>`;
    const out = body.querySelector("#scDiskOut");

    body.querySelector("#scScanLarge")?.addEventListener("click", async () => {
      const rootPath = body.querySelector("#scRoot")?.value || "C:\\";
      status.textContent = "Scan gros fichiers…";
      out.innerHTML = `<p class="hub-note hub-skel kpi">Scan…</p>`;
      const r = await api.scan_large(rootPath, 25, 80);
      if (!r.ok) {
        out.innerHTML = `<p class="hub-note">${esc(r.error)}</p>`;
        status.textContent = r.error;
        return;
      }
      const files = r.files || [];
      out.innerHTML = `<table style="width:100%"><thead><tr><th>Mo</th><th>Chemin</th><th></th></tr></thead>
        <tbody id="scLarge"></tbody></table>`;
      const tb = out.querySelector("#scLarge");
      files.forEach((f) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${esc(f.sizeMb)}</td><td><code>${esc(f.path)}</code></td>
          <td><button type="button" class="hub-btn" data-del="${esc(f.path)}">Corbeille</button></td>`;
        tb.appendChild(tr);
      });
      tb.addEventListener("click", async (ev) => {
        const t = ev.target;
        if (!(t instanceof HTMLElement) || !t.dataset.del) return;
        const path = t.dataset.del;
        const payload = { path };
        const c = await confirmMutator("systemclean", "delete_large_file", payload, `Envoyer à la corbeille ?\n${path}`);
        if (!c.ok) return;
        const del = await api.delete_large_file(path, c.token);
        status.textContent = del.ok ? "Fichier recyclé" : (del.error || "Échec");
      });
      status.textContent = `${files.length} gros fichiers`;
    });

    body.querySelector("#scEmpty")?.addEventListener("click", async () => {
      const rootPath = body.querySelector("#scRoot")?.value || "C:\\";
      status.textContent = "Scan dossiers vides…";
      out.innerHTML = `<p class="hub-note hub-skel kpi">Scan…</p>`;
      const r = await api.find_empty(rootPath);
      if (!r.ok) {
        out.innerHTML = `<p class="hub-note">${esc(r.error)}</p>`;
        return;
      }
      const folders = (r.folders || r.paths || []).slice(0, 80);
      out.innerHTML = `<ul id="scEmptyList" style="list-style:none;padding:0"></ul>`;
      const ul = out.querySelector("#scEmptyList");
      folders.forEach((p) => {
        const path = typeof p === "string" ? p : p.path || "";
        const li = document.createElement("li");
        li.style.cssText = "display:flex;gap:.35rem;margin:.25rem 0";
        li.innerHTML = `<code style="flex:1">${esc(path)}</code>
          <button type="button" class="hub-btn" data-rm="${esc(path)}">Suppr.</button>`;
        ul.appendChild(li);
      });
      ul.addEventListener("click", async (ev) => {
        const t = ev.target;
        if (!(t instanceof HTMLElement) || !t.dataset.rm) return;
        const path = t.dataset.rm;
        const payload = { path };
        const c = await confirmMutator("systemclean", "delete_empty_folder", payload, `Supprimer dossier vide ?\n${path}`);
        if (!c.ok) return;
        const del = await api.delete_empty_folder(path, c.token);
        status.textContent = del.ok ? "Dossier supprimé" : (del.error || "Échec");
        if (del.ok) t.closest("li")?.remove();
      });
      status.textContent = `${folders.length} dossiers vides`;
    });

    status.textContent = drives?.ok ? `${list.length} lecteurs` : (drives?.error || "Échec");
  }

  root.querySelectorAll("[data-seg]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.seg === "disk") showDisk();
      else showClean();
    });
  });
  root.querySelectorAll("[data-open]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const r = await api.open_app(btn.dataset.open);
      status.textContent = r?.ok ? `${btn.dataset.open} lancé` : (r?.error || "Échec");
    });
  });
  await showClean();
}
