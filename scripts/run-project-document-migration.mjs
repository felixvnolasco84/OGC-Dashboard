import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const production = process.argv.includes("--prod");
const apply = process.argv.includes("--apply");
const restart = process.argv.includes("--restart");
const output = resolve(`outputs/project-document-migration-${production ? "prod" : "dev"}-${apply ? "apply" : "diagnostic"}.json`);
const cli = resolve("node_modules/convex/bin/main.js");
function run(name, args) {
  return JSON.parse(execFileSync(process.execPath,
    [cli, "run", `projectDocumentMigration:${name}`, JSON.stringify(args), ...(production ? ["--prod"] : [])],
    { encoding: "utf8", timeout: 60_000 }));
}
mkdirSync(dirname(output), { recursive: true });
const state = !restart && existsSync(output) ? JSON.parse(readFileSync(output, "utf8")) : {
  runId: run("startProjectDocumentMigration", { dryRun: !apply }),
  done: false, pages: 0, changes: [], issues: [],
};
const save = () => writeFileSync(output, `${JSON.stringify(state, null, 2)}\n`);
save();
while (!state.done) {
  const page = run("advanceProjectDocumentMigration", { runId: state.runId });
  state.changes.push(...page.changes);
  state.issues = [...new Set([...state.issues, ...page.issues])];
  state.done = page.isDone;
  state.pages++;
  state.processed = page.processed;
  state.changed = page.changed;
  if (state.phase !== page.phase || state.pages % 25 === 0 || state.done) {
    console.log(`${state.pages}: ${page.phase}; ${page.processed} revisiones; ${page.changed} cambios${apply ? "" : " propuestos"}; ${state.issues.length} incidencias`);
  }
  state.phase = page.phase;
  save();
}
console.log(`Reporte: ${output}`);
