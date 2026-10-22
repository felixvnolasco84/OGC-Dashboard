import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
export default defineConfig({ root, plugins: [react()], cacheDir: `${root}/node_modules/.vite-budget-creation`,
  define: { "import.meta.env.VITE_CONVEX_SITE_URL": JSON.stringify("http://127.0.0.1:4207") },
  optimizeDeps: { entries: ["e2e/budget-creation/preview.html"] },
  resolve: { alias: { "@": `${root}/src`, "convex/react": `${root}/e2e/budget-creation/convex-stub.ts`, "@clerk/clerk-react": `${root}/e2e/budget-creation/clerk-stub.ts` } },
  server: { host: "127.0.0.1", port: 4207, strictPort: true, hmr: false },
});
