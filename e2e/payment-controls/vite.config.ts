import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
export default defineConfig({
  root,
  plugins: [react(), {
    name: "payment-controls-mock-upload",
    configureServer(server) {
      server.middlewares.use("/__p04_mock_upload", (_request, response) => {
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify({ storageId: "fixture-storage" }));
      });
    },
  }],
  cacheDir: `${root}/node_modules/.vite-payment-controls`,
  optimizeDeps: { entries: ["e2e/payment-controls/preview.html"] },
  resolve: { alias: { "@": `${root}/src`, "convex/react": `${root}/e2e/payment-controls/convex-stub.ts` } },
  server: { host: "127.0.0.1", port: 5194, strictPort: true, hmr: false,
    watch: { ignored: ["**/outputs/**", "**/output/**", "**/e2e/**"] },
  },
});
