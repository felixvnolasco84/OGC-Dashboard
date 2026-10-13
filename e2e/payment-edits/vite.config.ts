import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
export default defineConfig({ root, plugins: [react()], cacheDir: `${root}/node_modules/.vite-payment-edits`,
  optimizeDeps: { entries: ["e2e/payment-edits/preview.html"] },
  resolve: { alias: { "@": `${root}/src`, "convex/react": `${root}/e2e/payment-edits/convex-stub.ts` } },
  server: { host: "127.0.0.1", port: 4202, strictPort: true } });
