import { createLaunchModule } from "./_launch.js";

const mod = createLaunchModule({
  id: "uninstx",
  title: "UninstX",
  blurb: "Désinstallation et leftovers",
});

export const mount = mod.mount;
