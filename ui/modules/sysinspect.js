import { createLaunchModule } from "./_launch.js";

const mod = createLaunchModule({
  id: "sysinspect",
  title: "SysInspect",
  blurb: "Événements Windows · pilotes (lecture)",
});

export const mount = mod.mount;
