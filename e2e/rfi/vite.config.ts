import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL("../../", import.meta.url));
export default defineConfig({
  root, plugins: [react()], cacheDir: `${root}/node_modules/.vite-rfi-preview`,
  optimizeDeps: { entries: ["e2e/rfi/preview.html"] },
  build: {
    outDir: `${root}/output/rfi-ui-build`,
    rollupOptions: { input: fileURLToPath(new URL("./preview.html", import.meta.url)) },
  },
  resolve: { alias: [
    { find: "convex/react", replacement: fileURLToPath(new URL("./convex-stub.ts", import.meta.url)) },
    { find: "@", replacement: `${root}/src` },
  ] },
  // Keep fixtures stable while other work in the shared checkout changes HTML.
  server: { host: "127.0.0.1", port: 4196, strictPort: true, hmr: false, watch: null },
});
