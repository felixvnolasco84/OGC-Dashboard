import { execFileSync } from "node:child_process";
import { closeSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const manifestIndex = process.argv.indexOf("--manifest");
if (manifestIndex < 0 || !process.argv[manifestIndex + 1]) {
  throw new Error("Uso: node scripts/run-ogc-classification-repair.mjs --manifest archivo.json [--push] [--apply]");
}
const manifestPath = resolve(process.argv[manifestIndex + 1]);
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const apply = process.argv.includes("--apply");
const args = [resolve("node_modules/convex/bin/main.js"), "run", "ogc_movimientos:recategorizeFromSource",
  JSON.stringify({ ...manifest, dry_run: !apply })];
if (process.argv.includes("--push")) args.push("--push");
// A file descriptor avoids losing CLI stdout if it exits before a pipe flushes.
const rawPath = resolve(dirname(manifestPath), "repair-response.json");
const output = openSync(rawPath, "w");
try {
  execFileSync(process.execPath, args, { stdio: ["ignore", output, "inherit"], timeout: 120_000 });
} finally {
  closeSync(output);
}
const result = JSON.parse(readFileSync(rawPath, "utf8"));
const reportPath = resolve(dirname(manifestPath), apply ? "repair-result.json" : "repair-preview.json");
writeFileSync(reportPath, `${JSON.stringify(result, null, 2)}\n`);
const groups = {};
for (const correction of result.corrections) {
  const key = `${correction.after.tipo}: ${correction.after.categoria}`;
  groups[key] = (groups[key] || 0) + 1;
}
console.log(JSON.stringify({ dryRun: result.dryRun, count: result.count, groups, reportPath }, null, 2));
