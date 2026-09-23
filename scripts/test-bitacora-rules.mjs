import assert from "node:assert/strict";
import {
  canCreateBitacora,
  classifyBitacoraRevision,
  validateBitacoraAttachmentMetadata,
} from "../convex/bitacoraRules.ts";
import { canUserAccessDesarrollo } from "../convex/permissions.ts";

for (const role of ["admin", "user", "finance", "contratista"]) {
  assert.equal(canCreateBitacora(role), true, `${role} debe poder crear`);
}
assert.equal(canCreateBitacora("viewer"), false);
assert.equal(canCreateBitacora("unknown"), false);

assert.equal(classifyBitacoraRevision(2, 2, false), "match");
assert.equal(classifyBitacoraRevision(1, 2, false), "changed");
assert.equal(classifyBitacoraRevision(2, 2, true), "deleted");

assert.equal(validateBitacoraAttachmentMetadata("photo", 1024, "image/jpeg"), null);
assert.equal(validateBitacoraAttachmentMetadata("document", 1024, "application/pdf"), null);
assert.match(validateBitacoraAttachmentMetadata("photo", 1024, "image/svg+xml"), /no permitido/);
assert.match(validateBitacoraAttachmentMetadata("document", 11 * 1024 * 1024, "application/pdf"), /10 MiB/);

const project = { _id: "project-1", organization_id: "org-a" };
assert.equal(canUserAccessDesarrollo({ role: "admin", email: "admin@example.com", organization_id: "org-a", allowed_desarrollos: [] }, project), true);
assert.equal(canUserAccessDesarrollo({ role: "user", email: "user@example.com", organization_id: "org-b", allowed_desarrollos: ["project-1"] }, project), true);
assert.equal(canUserAccessDesarrollo({ role: "viewer", email: "viewer@example.com", organization_id: "org-b", allowed_desarrollos: [] }, project), false);

console.log("Bitácora Convex rules passed: roles, project scope, revisions and attachment metadata.");
