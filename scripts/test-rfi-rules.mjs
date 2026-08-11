import assert from "node:assert/strict";
import {
  canDeleteRfi,
  canEditRfi,
  nextRfiNumber,
} from "../convex/rfiRules.ts";

const admin = { _id: "admin-1", role: "admin" };
const creator = { _id: "user-1", role: "contratista" };
const manager = { _id: "user-2", role: "user" };
const viewer = { _id: "viewer-1", role: "viewer" };
const draft = { creator_id: creator._id, status: "draft" };

assert.equal(canDeleteRfi(admin, draft), true);
assert.equal(canDeleteRfi(creator, draft), true);
assert.equal(canDeleteRfi(manager, draft), false);
assert.equal(canDeleteRfi(viewer, draft), false);
assert.equal(
  canDeleteRfi(admin, { ...draft, status: "pending_manager_review" }),
  false,
);
assert.equal(canDeleteRfi(admin, { ...draft, status: "open" }), false);
assert.equal(canDeleteRfi(admin, { ...draft, status: "closed" }), false);

const pendingReview = {
  ...draft,
  rfi_manager_id: manager._id,
  status: "pending_manager_review",
};
assert.equal(canEditRfi(admin, draft), true);
assert.equal(canEditRfi(creator, draft), true);
assert.equal(canEditRfi(manager, draft), false);
assert.equal(canEditRfi(admin, pendingReview), true);
assert.equal(canEditRfi(creator, pendingReview), true);
assert.equal(canEditRfi(manager, pendingReview), true);
assert.equal(canEditRfi(viewer, pendingReview), false);
assert.equal(canEditRfi(creator, { ...pendingReview, status: "open" }), false);
assert.equal(canEditRfi(creator, { ...pendingReview, status: "closed" }), false);

assert.equal(nextRfiNumber([]), 1);
assert.equal(nextRfiNumber([1, 2, 3]), 4);
assert.equal(nextRfiNumber([1, 2], 5), 6);
assert.equal(nextRfiNumber([1, 5], 3), 6);
assert.equal(nextRfiNumber([1, 2], 3), 4);

console.log(
  "RFI rules passed: edit/delete permissions, protected states, and monotonic numbering.",
);
