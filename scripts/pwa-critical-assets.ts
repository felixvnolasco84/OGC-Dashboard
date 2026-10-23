import type { Plugin } from "vite";
import type { ManifestTransform } from "workbox-build";

/** Derive the offline code closure from the final bundle, including shared chunks. */
export function criticalOfflineAssets() {
  const files = new Map<string, number>();
  const plugin: Plugin = {
    name: "ogc-offline-code-closure",
    generateBundle(_options, bundle) {
      files.clear();
      const visit = (name: string) => {
        if (files.has(name)) return;
        const chunk = bundle[name];
        if (!chunk || chunk.type !== "chunk") return;
        files.set(name, Buffer.byteLength(chunk.code));
        chunk.imports.forEach(visit);
      };
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== "chunk") continue;
        if (chunk.isEntry || Object.keys(chunk.modules).some(id =>
          id.replaceAll("\\", "/").endsWith("/src/pages/Bitacora/OfflineBitacoraApp.tsx"),
        )) visit(chunk.fileName);
      }
    },
  };
  const transform: ManifestTransform = async entries => {
    const existing = new Set(entries.map(entry => entry.url));
    return {
      manifest: [...entries, ...Array.from(files).filter(([url]) => !existing.has(url)).map(([url, size]) => ({ url, size, revision: null }))],
      warnings: [],
    };
  };
  return { plugin, transform };
}
