import { defineConfig } from "vitest/config";

export default defineConfig({ test: {
  environment: "node",
  include: ["convex/salesPartidasSync.test.mjs"],
  pool: "forks",
  fileParallelism: false,
} });
