import { createLaunchModule } from "./_launch.js";

const mod = createLaunchModule({
  id: "processhub",
  title: "ProcessHub",
  blurb: "ProcessGuard · StartupX",
});

export const mount = mod.mount;
