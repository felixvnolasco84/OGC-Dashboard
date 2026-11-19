import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL("../../", import.meta.url));
export default defineConfig({
  root,
  plugins: [react(), {
    name: "task-filter-fixture-routes",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (/^\/(tareas|board-scoped|proyecto\/[^/]+\/tareas)(\?|$)/.test(req.url || "")) {
          const query = (req.url || "").split("?")[1];
          req.url = `/e2e/task-filters/preview.html${query ? `?${query}` : ""}`;
        }
        next();
      });
    },
  }],
  cacheDir: `${root}/node_modules/.vite-task-filters`,
  optimizeDeps: { entries: ["e2e/task-filters/preview.html"] },
  resolve: { alias: [
    { find: "convex/react", replacement: fileURLToPath(new URL("./convex-stub.ts", import.meta.url)) },
    { find: "@", replacement: `${root}/src` },
  ] },
  server: { host: "127.0.0.1", port: 5226, strictPort: true, hmr: false, watch: null },
  appType: "mpa",
});
