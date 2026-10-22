import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

// Read-only diagnosis by default; no network calls are made merely by adding this script.
const apply = process.argv.includes("--apply"), production = process.argv.includes("--prod");
let cursor = null, processed = 0, migrated = 0;
for (;;) {
  const page = JSON.parse(execFileSync(process.execPath, [resolve("node_modules/convex/bin/main.js"), "run",
    "programaObraImportHistory:migrateLegacyAttempts", JSON.stringify({ cursor, dry_run: !apply }), ...(production ? ["--prod"] : []),
  ], { encoding: "utf8", timeout: 60000 }));
  processed += page.processed; migrated += page.migrated;
  console.log(`${apply ? "Migración" : "Diagnóstico"}: ${processed} revisiones examinadas; ${migrated} importaciones ${apply ? "incorporadas" : "por incorporar"}.`);
  if (page.isDone) break;
  cursor = page.cursor;
}
