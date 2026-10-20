import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

// Diagnostic by default. --apply writes; --prod explicitly selects production.
const apply = process.argv.includes("--apply");
const production = process.argv.includes("--prod");
let cursor = null;
let processed = 0;
let migrated = 0;
for (;;) {
  const page = JSON.parse(execFileSync(process.execPath, [resolve("node_modules/convex/bin/main.js"), "run",
    "laborImportHistory:migrateLegacyAttempts", JSON.stringify({ cursor, dry_run: !apply }),
    ...(production ? ["--prod"] : []),
  ], { encoding: "utf8", timeout: 60000 }));
  processed += page.processed;
  migrated += page.migrated;
  console.log(`${apply ? "Migración" : "Diagnóstico"}: ${processed} cortes revisados; ${migrated} cortes ${apply ? "incorporados" : "por incorporar"}.`);
  if (page.isDone) break;
  cursor = page.cursor;
}
