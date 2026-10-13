import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
export default defineConfig({ root, plugins: [react()], cacheDir: `${root}/node_modules/.vite-partida-edit`,
  optimizeDeps: { entries: ["e2e/partida-edit/preview.html"] },
  resolve: { alias: { "@": `${root}/src`, "convex/react": `${root}/e2e/partida-edit/convex-stub.ts` } },
  server: { host: "127.0.0.1", port: 4207, strictPort: true, hmr: false, watch: null } });
