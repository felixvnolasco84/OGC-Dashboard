import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
export default defineConfig({ root, plugins: [react()], cacheDir: `${root}/node_modules/.vite-projection-import-history`,
  optimizeDeps: { entries: ["e2e/projection-import-history/preview.html"] },
  resolve: { alias: { "@": `${root}/src`, "convex/react": `${root}/e2e/projection-import-history/convex-stub.ts` } },
  server: { host: "127.0.0.1", port: 4215, strictPort: true } });
