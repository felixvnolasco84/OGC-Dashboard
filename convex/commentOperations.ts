import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { commentError } from "./commentRules";

// Receipts survive physical deletion. They are not comment history or an offline queue.
export async function commentOperation(
  ctx: MutationCtx,
  userId: Id<"users">,
  projectId: Id<"desarrollos">,
  operationId: string,
  fingerprint: string,
  apply: () => Promise<string>,
) {
  if (!/^[\w-]{10,100}$/.test(operationId))
    commentError("INVALID", "La operación de comentario no es válida.");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(fingerprint),
  );
  const requestHash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  const previous = await ctx.db
    .query("comment_operation_receipts")
    .withIndex("by_user_operation", (q) =>
      q.eq("user_id", userId).eq("operation_id", operationId),
    )
    .unique();
  if (previous) {
    if (
      previous.proyecto !== projectId ||
      previous.fingerprint !== requestHash
    ) {
      commentError("INVALID", "Esta operación corresponde a otra solicitud.");
    }
    return previous.result_id;
  }
  const resultId = await apply();
  await ctx.db.insert("comment_operation_receipts", {
    user_id: userId,
    proyecto: projectId,
    operation_id: operationId,
    fingerprint: requestHash,
    result_id: resultId,
    created_at: Date.now(),
  });
  return resultId;
}
