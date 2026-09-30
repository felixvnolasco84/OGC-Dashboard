import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/lib/bitacora-offline/**/*.test.ts", "convex/paymentAccounts.test.mjs", "convex/programaObraExecution.test.mjs"],
    pool: "forks",
    fileParallelism: false,
  },
});
