import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["convex/comments.test.mjs"],
    fileParallelism: false,
  },
});
