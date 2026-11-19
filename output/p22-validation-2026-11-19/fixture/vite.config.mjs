import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: fileURLToPath(new URL("./", import.meta.url)),
  base: "./",
  publicDir: false,
  plugins: [react()],
  resolve: { alias: [
    { find: "@", replacement: fileURLToPath(new URL("../../../src", import.meta.url)) },
    { find: /^convex\/react$/, replacement: fileURLToPath(new URL("./convex-stub.ts", import.meta.url)) },
  ] },
  build: { outDir: fileURLToPath(new URL("../fixture-dist", import.meta.url)) },
});
