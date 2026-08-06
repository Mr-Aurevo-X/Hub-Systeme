import { mountEmbeddedApp } from "./_hub_util.js";

export async function mount(root) {
  await mountEmbeddedApp(root, {
    ns: 'uninstx',
    src: './embedded/uninstx/index.html',
    title: 'UninstX',
    subtitle: 'Désinstallation & leftovers',
    segments: null,
  });
}
