import { createLaunchModule } from "./_launch.js";

const mod = createLaunchModule({
  id: "admin",
  title: "Admin léger",
  blurb: "PowerPlan · PrintQueue · RestorePoint · UserSessions",
});

export const mount = mod.mount;
