import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
const fixture = fileURLToPath(new URL("./", import.meta.url));
export default defineConfig({
  root,
  plugins: [react()],
  cacheDir: `${root}node_modules/.vite-requisiciones-form-test`,
  optimizeDeps: { entries: ["output/requisiciones-validation-2026-10-12/form-preview.html"] },
  resolve: { alias: [
    { find: "convex/react", replacement: `${fixture}form-convex-stub.ts` },
    { find: "@clerk/clerk-react", replacement: `${fixture}clerk-stub.ts` },
    { find: "@", replacement: `${root}src` },
  ] },
  server: { host: "127.0.0.1", port: 4198, strictPort: true },
});
