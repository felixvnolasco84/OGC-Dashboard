import assert from "node:assert/strict";
import {
  cleanHierarchyText,
  normalizeHierarchyText,
} from "../convex/partidaRules.ts";

assert.equal(cleanHierarchyText("  VARILLA   DEL NO. 6  "), "VARILLA DEL NO. 6");
assert.equal(
  normalizeHierarchyText(" Varílla_del No. 6 (3/4\"), 2.25 kg/m "),
  "VARILLA DEL NO 6 3 4 2 25 KG M",
);
assert.equal(
  normalizeHierarchyText("VARILLA DEL NO 6 3-4, 2.25 KG/M"),
  "VARILLA DEL NO 6 3 4 2 25 KG M",
);
assert.notEqual(
  normalizeHierarchyText("VARILLA DEL NO. 6 - LOTE 1"),
  normalizeHierarchyText("VARILLA DEL NO. 6 - LOTE 2"),
);

console.log("Partida naming rules: OK");
