import { mountEmbeddedApp } from "./_hub_util.js";

const APPS = [
  {
    id: "wincleaner",
    ns: "systemclean.wincleaner",
    src: "./embedded/systemclean/index.html",
    title: "WinCleaner",
    subtitle: "Nettoyage & santé système",
  },
  {
    id: "diskmap",
    ns: "systemclean.diskmap",
    src: "./embedded/diskmap/index.html",
    title: "DiskMap",
    subtitle: "Carte disque & recherche",
  },
];

export async function mount(root) {
  let current = APPS[0].id;
  const shell = document.createElement("div");
  shell.className = "hub-embed-shell";
  shell.innerHTML = `
    <header class="hub-embed-head">
      <div>
        <h1 class="hub-embed-title">SystemClean</h1>
        <p class="hub-embed-sub">WinCleaner · DiskMap — interface d'origine in-hub</p>
      </div>
    </header>
    <div class="hub-seg" role="tablist" id="scSeg"></div>
    <div id="scMount" style="flex:1;min-height:0;display:flex;flex-direction:column"></div>`;
  root.innerHTML = "";
  root.appendChild(shell);
  const seg = shell.querySelector("#scSeg");
  const mountEl = shell.querySelector("#scMount");

  function renderSeg() {
    seg.innerHTML = APPS.map(
      (a) =>
        `<button type="button" class="hub-seg-btn${a.id === current ? " is-active" : ""}" data-id="${a.id}">${a.title}</button>`
    ).join("");
  }

  async function show(id) {
    current = id;
    renderSeg();
    const app = APPS.find((a) => a.id === id) || APPS[0];
    mountEl.innerHTML = "";
    await mountEmbeddedApp(mountEl, {
      ns: app.ns,
      src: app.src,
      title: app.title,
      subtitle: app.subtitle,
      segments: null,
    });
    const head = mountEl.querySelector(".hub-embed-head");
    if (head) head.remove();
  }

  seg.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-id]");
    if (!btn) return;
    show(btn.getAttribute("data-id"));
  });

  await show(current);
}
