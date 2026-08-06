import { mountEmbeddedApp } from "./_hub_util.js";

const APPS = [
  {
    id: "processguard",
    ns: "processhub",
    src: "./embedded/processhub/index.html",
    title: "ProcessGuard",
    subtitle: "Processus & services",
  },
  {
    id: "startupx",
    ns: "processhub",
    src: "./embedded/startupx/index.html",
    title: "StartupX",
    subtitle: "Démarrage & tâches",
  },
];

export async function mount(root) {
  let current = APPS[0].id;
  const shell = document.createElement("div");
  shell.className = "hub-embed-shell";
  shell.innerHTML = `
    <header class="hub-embed-head">
      <div>
        <h1 class="hub-embed-title">ProcessHub</h1>
        <p class="hub-embed-sub">ProcessGuard · StartupX — interface d'origine in-hub</p>
      </div>
    </header>
    <div class="hub-seg" role="tablist" id="phSeg"></div>
    <div id="phMount" style="flex:1;min-height:0;display:flex;flex-direction:column"></div>`;
  root.innerHTML = "";
  root.appendChild(shell);
  const seg = shell.querySelector("#phSeg");
  const mountEl = shell.querySelector("#phMount");

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
