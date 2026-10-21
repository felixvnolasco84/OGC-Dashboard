import { it } from "vitest";

it("passes the existing reporting rule assertions with TypeScript module resolution", async () => {
  await import("../scripts/test-reporting-rules.mjs");
});
