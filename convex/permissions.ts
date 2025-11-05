import { QueryCtx, MutationCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";

// Get current user or throw error
export async function getCurrentUserOrThrow(
  ctx: QueryCtx | MutationCtx
) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not authenticated");
  }

  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
    .first();

  if (!user) {
    throw new Error("User not found in database");
  }

  return user;
}

// Check if user has access to a specific desarrollo
export async function checkDesarrolloAccess(
  ctx: QueryCtx | MutationCtx,
  desarrolloId: Id<"desarrollos">
): Promise<boolean> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    return false;
  }

  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
    .first();

  if (!user) {
    return false;
  }

  // Admins have access to everything
  if (user.role === "admin") {
    return true;
  }

  // Check if desarrollo is in allowed list
  return user.allowed_desarrollos.includes(desarrolloId);
}

// Get all desarrollos the user has access to
export async function getUserDesarrollos(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    return [];
  }

  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
    .first();

  if (!user) {
    return [];
  }

  // Admins have access to all
  if (user.role === "admin") {
    return await ctx.db.query("desarrollos").collect();
  }

  // Return only allowed desarrollos
  const desarrollos = await Promise.all(
    user.allowed_desarrollos.map((id) => ctx.db.get(id))
  );

  return desarrollos.filter((d) => d !== null);
}

// Check if user is admin
export async function isAdmin(ctx: QueryCtx | MutationCtx): Promise<boolean> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    return false;
  }

  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
    .first();

  return user?.role === "admin";
}
