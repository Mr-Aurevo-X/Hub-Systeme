import { mountEmbeddedApp } from "./_hub_util.js";

const APPS = [
  {
    id: "powerplan",
    ns: "admin.powerplan",
    src: "./embedded/admin_powerplan/index.html",
    title: "PowerPlan",
    subtitle: "Plans d'alimentation",
  },
  {
    id: "printqueue",
    ns: "admin.printqueue",
    src: "./embedded/admin_printqueue/index.html",
    title: "PrintQueue",
    subtitle: "Files d'impression",
  },
  {
    id: "restorepoint",
    ns: "admin.restorepoint",
    src: "./embedded/admin_restorepoint/index.html",
    title: "RestorePoint",
    subtitle: "Points de restauration",
  },
  {
    id: "usersessions",
    ns: "admin.usersessions",
    src: "./embedded/admin_usersessions/index.html",
    title: "UserSessions",
    subtitle: "Sessions utilisateurs",
  },
];

export async function mount(root) {
  let current = APPS[0].id;
  const shell = document.createElement("div");
  shell.className = "hub-embed-shell";
  shell.innerHTML = `
    <header class="hub-embed-head">
      <div>
        <h1 class="hub-embed-title">Admin léger</h1>
        <p class="hub-embed-sub">PowerPlan · PrintQueue · RestorePoint · UserSessions</p>
      </div>
    </header>
    <div class="hub-seg" role="tablist" id="adSeg"></div>
    <div id="adMount" style="flex:1;min-height:0;display:flex;flex-direction:column"></div>`;
  root.innerHTML = "";
  root.appendChild(shell);
  const seg = shell.querySelector("#adSeg");
  const mountEl = shell.querySelector("#adMount");

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
