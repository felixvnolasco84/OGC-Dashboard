import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL("../../", import.meta.url));
export default defineConfig({
  root,
  plugins: [react()],
  cacheDir: `${root}/node_modules/.vite-p24-sales-budget`,
  optimizeDeps: { entries: ["e2e/sales-budget-header/preview.html"] },
  resolve: { alias: [
    { find: "convex/react", replacement: fileURLToPath(new URL("./convex-stub.ts", import.meta.url)) },
    { find: "@", replacement: `${root}/src` },
  ] },
  server: { host: "127.0.0.1", port: 4224, strictPort: true, hmr: false, watch: null },
});
