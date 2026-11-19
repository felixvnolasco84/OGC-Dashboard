import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL("../../", import.meta.url));
export default defineConfig({
  root,
  plugins: [react(), {
    name: "plan-viewer-preview-routes",
    configureServer(server) {
      server.middlewares.use((request, _response, next) => {
        if (request.url?.startsWith("/proyecto/")) {
          const query = request.url.includes("?") ? request.url.slice(request.url.indexOf("?")) : "";
          request.url = `/e2e/plan-viewer/preview.html${query}`;
        }
        next();
      });
    },
  }],
  cacheDir: `${root}/node_modules/.vite-plan-viewer`,
  optimizeDeps: { entries: ["e2e/plan-viewer/preview.html"] },
  resolve: { alias: [
    { find: "convex/react", replacement: fileURLToPath(new URL("./convex-stub.ts", import.meta.url)) },
    { find: "@", replacement: `${root}/src` },
  ] },
  server: { host: "127.0.0.1", port: 4215, strictPort: true, hmr: false },
});
