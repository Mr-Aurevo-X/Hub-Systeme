import { mountEmbeddedApp } from "./_hub_util.js";

export async function mount(root) {
  await mountEmbeddedApp(root, {
    ns: 'sysinspect',
    src: './embedded/sysinspect/index.html',
    title: 'SysInspect',
    subtitle: 'Événements & drivers',
    segments: null,
  });
}
