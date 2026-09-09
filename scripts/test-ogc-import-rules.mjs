import assert from "node:assert/strict";
import {
  OGC_IMPORT_LEASE_MS,
  OGC_IMPORT_MAX_FILE_SIZE,
  classifyOgcImportDuplicate,
  getOgcImportCompletionStatus,
  isOgcImportLeaseActive,
  isValidOgcImportFile,
} from "../convex/ogcImportRules.ts";

const hash = "a".repeat(64);

assert.equal(isValidOgcImportFile("movimientos.XLSX", 1024, hash), true);
assert.equal(isValidOgcImportFile("movimientos.csv", 1024, hash), false);
assert.equal(isValidOgcImportFile("movimientos.xlsx", 0, hash), false);
assert.equal(isValidOgcImportFile("movimientos.xlsx", OGC_IMPORT_MAX_FILE_SIZE + 1, hash), false);
assert.equal(isValidOgcImportFile("movimientos.xlsx", 1024, "incorrecto"), false);

const now = Date.now();
assert.equal(isOgcImportLeaseActive("procesando", now, now), true);
assert.equal(isOgcImportLeaseActive("procesando", now - OGC_IMPORT_LEASE_MS - 1, now), false);
assert.equal(isOgcImportLeaseActive("parcial", now, now), false);

assert.equal(classifyOgcImportDuplicate([], "import-1", 10), "create");
assert.equal(
  classifyOgcImportDuplicate([{ importacionId: "import-1", filaOrigen: 10 }], "import-1", 10),
  "already_imported",
);
assert.equal(
  classifyOgcImportDuplicate([{ importacionId: "import-1", filaOrigen: 9 }], "import-1", 10),
  "create",
  "Filas distintas e identicas del mismo Excel deben conservarse",
);
assert.equal(
  classifyOgcImportDuplicate([{ importacionId: "import-2", filaOrigen: 10 }], "import-1", 10),
  "external_duplicate",
);

assert.equal(getOgcImportCompletionStatus({
  totalRows: 2,
  linkedMovements: 2,
  skippedDuplicates: 0,
  rejectedRows: 0,
}), "completada");
assert.equal(getOgcImportCompletionStatus({
  totalRows: 2,
  linkedMovements: 1,
  skippedDuplicates: 0,
  rejectedRows: 0,
}), "parcial");
assert.equal(getOgcImportCompletionStatus({
  totalRows: 2,
  linkedMovements: 2,
  skippedDuplicates: 1,
  rejectedRows: 0,
}), "parcial");

console.log("OGC import rules tests passed");
