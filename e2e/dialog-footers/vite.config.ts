import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
export default defineConfig({
  root, plugins: [react()], cacheDir: `${root}/node_modules/.vite-p23-footers`,
  define: { "import.meta.env.VITE_CONVEX_SITE_URL": JSON.stringify("http://127.0.0.1:4236") },
  optimizeDeps: { entries: ["e2e/dialog-footers/preview.html", "e2e/document-row-actions/preview.html", "e2e/budget-creation/preview.html"] },
  resolve: { alias: { "@": `${root}/src`, "convex/react": `${root}/e2e/dialog-footers/convex-stub.ts`, "@clerk/clerk-react": `${root}/e2e/budget-creation/clerk-stub.ts` } },
  server: { host: "127.0.0.1", port: 4236, strictPort: true, hmr: false, watch: null },
});
