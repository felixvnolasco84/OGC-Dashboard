import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../../", import.meta.url));
export default defineConfig({
  root: fileURLToPath(new URL("./", import.meta.url)), base: "./", plugins: [react()], cacheDir: `${root}/node_modules/.vite-p06`,
  optimizeDeps: { entries: ["index.html"] },
  resolve: { alias: { "@": `${root}/src`, "convex/react": fileURLToPath(new URL("./convex-stub.ts", import.meta.url)) } },
  server: { host: "127.0.0.1", port: 5186, strictPort: true },
  build: { outDir: "compiled", emptyOutDir: false },
});
