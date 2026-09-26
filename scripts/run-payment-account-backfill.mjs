import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const production = process.argv.includes("--prod");
const reset = process.argv.includes("--restart");
const output = resolve(`outputs/payment-account-backfill-${production ? "prod" : "dev"}.json`);
const emptyCounts = () => ({ processed: 0, created: 0, existing: 0, pending: 0, linked: 0, skipped: 0 });
const state = !reset && existsSync(output)
  ? JSON.parse(readFileSync(output, "utf8"))
  : { deployment: production ? "prod" : "dev", phase: "transactions", cursor: null,
      pages: 0, counts: emptyCounts(), done: false };

if (state.done) {
  console.log(JSON.stringify(state, null, 2));
  process.exit(0);
}

const convexCli = resolve("node_modules/convex/bin/main.js");
mkdirSync(dirname(output), { recursive: true });
while (!state.done) {
  const args = [convexCli, "run", "paymentAccountMigration:backfillPage",
    JSON.stringify({ phase: state.phase, cursor: state.cursor })];
  if (production) args.push("--prod");
  const raw = execFileSync(process.execPath, args, { encoding: "utf8", timeout: 120_000 });
  const page = JSON.parse(raw);
  for (const key of Object.keys(state.counts)) state.counts[key] += page[key];
  state.phase = page.phase;
  state.cursor = page.cursor;
  state.done = page.done;
  state.pages++;
  state.updatedAt = new Date().toISOString();
  writeFileSync(output, `${JSON.stringify(state, null, 2)}\n`);
  console.log(`${state.pages}: ${page.processed} registros, ${page.created} cuentas, ${page.pending} pendientes; fase ${state.phase}`);
}
console.log(`Reporte: ${output}`);
