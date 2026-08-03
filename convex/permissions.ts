import type { ActionCtx, QueryCtx, MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const SUPER_ADMIN_EMAILS = new Set([
  "ops@ogc.mx",
  "felix@polygonag.com",
]);

export function isSuperAdminEmail(email?: string | null): boolean {
  return SUPER_ADMIN_EMAILS.has((email ?? "").trim().toLowerCase());
}

export function hasAdminAccess(user?: { role: string; email: string } | null): boolean {
  return user?.role === "admin" || isSuperAdminEmail(user?.email);
}

export function hasGlobalAdminAccess(
  user?: { role: string; email: string; organization_id?: string } | null
): boolean {
  return hasAdminAccess(user) && (!user?.organization_id || isSuperAdminEmail(user.email));
}

export function getScopedOrganizationId(
  user: { role: string; email: string; organization_id?: string }
): string | undefined {
  return hasGlobalAdminAccess(user) ? undefined : user.organization_id;
}

export function withComputedPermissions<T extends { role: string; email: string; organization_id?: string }>(
  user: T
) {
  const isSuperAdmin = isSuperAdminEmail(user.email);

  return {
    ...user,
    role: isSuperAdmin ? "admin" : user.role,
    is_super_admin: isSuperAdmin,
  };
}

type ProjectAccessUser = {
  role: string;
  email: string;
  organization_id?: string;
  allowed_desarrollos: Id<"desarrollos">[];
};

type ProjectAccessRecord = {
  _id: Id<"desarrollos">;
  organization_id?: string;
};

/**
 * Fuente única de verdad para acceso a proyectos. También se usa al volver a
 * validar destinatarios justo antes de enviar un reporte programado.
 */
export function canUserAccessDesarrollo(
  user: ProjectAccessUser,
  desarrollo: ProjectAccessRecord,
): boolean {
  if (hasGlobalAdminAccess(user)) return true;

  if (
    hasAdminAccess(user) &&
    Boolean(user.organization_id) &&
    desarrollo.organization_id === user.organization_id
  ) {
    return true;
  }

  return user.allowed_desarrollos.includes(desarrollo._id);
}

export function canUserReceiveProjectReport(
  user: ProjectAccessUser & { invitation_status?: string },
  desarrollo: ProjectAccessRecord,
): boolean {
  return Boolean(
    user.email.trim() &&
    user.invitation_status !== "pending" &&
    canUserAccessDesarrollo(user, desarrollo),
  );
}

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

  return withComputedPermissions(user);
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

  const desarrollo = await ctx.db.get(desarrolloId);
  return desarrollo ? canUserAccessDesarrollo(user, desarrollo) : false;
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

  if (hasAdminAccess(user)) {
    if (hasGlobalAdminAccess(user)) {
      return await ctx.db.query("desarrollos").collect();
    }

    const organizationProjects = await ctx.db
      .query("desarrollos")
      .withIndex("by_organization", (q) => q.eq("organization_id", user.organization_id))
      .collect();

    const allowedProjects = await Promise.all(
      user.allowed_desarrollos.map((id) => ctx.db.get(id))
    );

    const projectsById = new Map(
      [...organizationProjects, ...allowedProjects.filter((d) => d !== null)]
        .map((project) => [project._id, project])
    );

    return Array.from(projectsById.values());
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

  return hasAdminAccess(user);
}

export async function assertAdmin(ctx: QueryCtx | MutationCtx | ActionCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not authenticated");
  }

  if (!("db" in ctx)) {
    return identity;
  }

  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
    .first();

  if (!user || !hasAdminAccess(user)) {
    throw new Error("Unauthorized: Admin access required");
  }

  return withComputedPermissions(user);
}

export async function assertCanWrite(ctx: MutationCtx) {
  const user = await getCurrentUserOrThrow(ctx);

  if (user.role === "viewer") {
    throw new Error("Unauthorized: Viewer role is read-only");
  }

  return user;
}
