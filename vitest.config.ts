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
    include: [
      "convex/projectDocumentFolders.test.mjs",
      "src/lib/bitacora-offline/**/*.test.ts",
      "convex/paymentAccounts.test.mjs",
      "convex/programaObraExecution.test.mjs",
      "convex/pnl.test.mjs",
      "convex/presupuesto.test.mjs",
      "convex/paymentHierarchy.test.mjs",
      "convex/partidaDeletion.test.mjs",
      "convex/ogcClassification.test.mjs",
      "convex/ingresosPermissions.test.mjs",
      "convex/autorizacionesPermissions.test.mjs",
      "convex/proveedoresPermissions.test.mjs",
    ],
    pool: "forks",
    fileParallelism: false,
  },
});
