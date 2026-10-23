import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
const apply = process.argv.includes("--apply");
const production = process.argv.includes("--prod");
for (const kind of ["expense", "collection"]) {
  let cursor = null; let projects = 0; let pending = 0;
  for (;;) {
    const page = JSON.parse(execFileSync(process.execPath, [resolve("node_modules/convex/bin/main.js"), "run", "projectionImports:migrateLegacy",
      JSON.stringify({ kind, cursor, dry_run: !apply }), ...(production ? ["--prod"] : [])], { encoding: "utf8", timeout: 60000 }));
    projects += page.projects; pending += page.pending;
    console.log(`${apply ? "Migración" : "Diagnóstico"} ${kind}: ${projects} proyectos revisados; ${pending} proyectos ${apply ? "incorporados" : "por incorporar"}.`);
    if (page.isDone) break;
    cursor = page.cursor;
  }
}
