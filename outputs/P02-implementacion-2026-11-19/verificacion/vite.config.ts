import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const fixture = `${root}/outputs/P02-implementacion-2026-11-19/verificacion`;
export default defineConfig({ root, plugins: [react()], cacheDir: `${root}/node_modules/.vite-p02`,
  optimizeDeps: { entries: [`${fixture}/index.html`] },
  resolve: { alias: { "@": `${root}/src`, "convex/react": `${fixture}/convex-stub.ts`, "@clerk/clerk-react": `${fixture}/clerk-stub.ts` } },
  server: { host: "127.0.0.1", port: 5192, strictPort: true, hmr: false },
});
