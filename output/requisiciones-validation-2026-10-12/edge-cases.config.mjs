import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    environment: "node",
    include: ["output/requisiciones-validation-2026-10-12/edge-cases.test.mjs"],
    fileParallelism: false,
    isolate: false,
  },
});
