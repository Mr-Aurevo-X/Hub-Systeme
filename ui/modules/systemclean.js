import { createLaunchModule } from "./_launch.js";

const mod = createLaunchModule({
  id: "systemclean",
  title: "SystemClean",
  blurb: "WinCleaner · DiskMap (Ram Cleaner plus tard)",
});

export const mount = mod.mount;
