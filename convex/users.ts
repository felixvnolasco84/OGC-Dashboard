import { action, mutation, query } from "./_generated/server";
import { api } from "./_generated/api";
import { v } from "convex/values";

// Get or create user from Clerk
export const getCurrentUser = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    // Check if user exists
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();
    
    return user;
  },
});

// Store/update user in database when they first log in
export const storeUser = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    // Check if user already exists
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (existingUser) {
      // Update last login
      await ctx.db.patch(existingUser._id, {
        last_login: Date.now(),
      });
      return existingUser._id;
    }

    const email = identity.email ?? "";
    const name = identity.name ?? "";

    // If an admin invited the email before Clerk had a user id, claim that
    // pending record instead of creating a duplicate permissions row.
    const pendingUser = email
      ? await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", email))
        .filter((q) => q.eq(q.field("invitation_status"), "pending"))
        .first()
      : null;

    if (pendingUser) {
      await ctx.db.patch(pendingUser._id, {
        clerkId: identity.subject,
        name: pendingUser.name || name,
        invitation_status: "accepted",
        last_login: Date.now(),
      });
      return pendingUser._id;
    }

    // Create new user with default role and no project access
    const userId = await ctx.db.insert("users", {
      clerkId: identity.subject,
      email,
      name,
      role: "viewer", // Default role
      allowed_desarrollos: [], // No cost projects access by default
      allowed_sales_projects: [], // No sales projects access by default
      created_at: Date.now(),
      last_login: Date.now(),
    });

    return userId;
  },
});

export const createOrUpdateInvitedUser = mutation({
  args: {
    email: v.string(),
    name: v.string(),
    role: v.string(),
    allowed_desarrollos: v.array(v.id("desarrollos")),
    invitation_url: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!currentUser || currentUser.role !== "admin") {
      throw new Error("Unauthorized: Admin access required");
    }

    const normalizedEmail = args.email.trim().toLowerCase();
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", normalizedEmail))
      .first();

    const data = {
      email: normalizedEmail,
      name: args.name.trim() || normalizedEmail,
      role: args.role,
      allowed_desarrollos: args.allowed_desarrollos,
      allowed_sales_projects: [] as [],
      invitation_status: "pending",
      invited_at: Date.now(),
      invitation_url: args.invitation_url,
      invited_by: currentUser._id,
    };

    if (existingUser) {
      await ctx.db.patch(existingUser._id, data);
      return existingUser._id;
    }

    return await ctx.db.insert("users", {
      clerkId: `pending:${normalizedEmail}`,
      ...data,
      created_at: Date.now(),
    });
  },
});

export const inviteUser = action({
  args: {
    email: v.string(),
    name: v.string(),
    role: v.string(),
    allowed_desarrollos: v.array(v.id("desarrollos")),
  },
  handler: async (ctx, args) => {
    const currentUser = await ctx.runQuery(api.users.getCurrentUser);
    if (!currentUser || currentUser.role !== "admin") {
      throw new Error("Unauthorized: Admin access required");
    }

    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    const resendApiKey = process.env.RESEND_API_KEY;
    const resendFromEmail = process.env.RESEND_FROM_EMAIL;
    const appUrl = (process.env.APP_URL || process.env.SITE_URL || "").replace(/\/$/, "");

    if (!clerkSecretKey) {
      throw new Error("Missing CLERK_SECRET_KEY Convex environment variable");
    }
    if (!resendApiKey || !resendFromEmail) {
      throw new Error("Missing RESEND_API_KEY or RESEND_FROM_EMAIL Convex environment variable");
    }
    if (!appUrl) {
      throw new Error("Missing APP_URL Convex environment variable");
    }

    const normalizedEmail = args.email.trim().toLowerCase();
    const firstProjectId = args.allowed_desarrollos[0];
    const finalRedirectPath = firstProjectId
      ? `/proyecto/${firstProjectId}/presupuesto`
      : "/";
    const redirectUrl = `${appUrl}/accept-invitation?redirect_url=${encodeURIComponent(finalRedirectPath)}`;

    const invitationResponse = await fetch("https://api.clerk.com/v1/invitations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${clerkSecretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email_address: normalizedEmail,
        redirect_url: redirectUrl,
        notify: false,
        ignore_existing: true,
        public_metadata: {
          role: args.role,
          allowed_desarrollos: args.allowed_desarrollos,
        },
      }),
    });

    const invitation = await invitationResponse.json();
    if (!invitationResponse.ok) {
      throw new Error(invitation?.errors?.[0]?.message || "Unable to create Clerk invitation");
    }

    const invitationUrl = invitation.url || redirectUrl;
    await ctx.runMutation(api.users.createOrUpdateInvitedUser, {
      email: normalizedEmail,
      name: args.name,
      role: args.role,
      allowed_desarrollos: args.allowed_desarrollos,
      invitation_url: invitationUrl,
    });

    const html = renderWelcomeEmail({
      name: args.name || normalizedEmail,
      loginUrl: invitationUrl,
      projectCount: args.allowed_desarrollos.length,
    });

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: resendFromEmail,
        to: [normalizedEmail],
        subject: "Bienvenido a OGC Dashboard",
        html,
      }),
    });

    const emailResult = await emailResponse.json();
    if (!emailResponse.ok) {
      throw new Error(emailResult?.message || "Unable to send welcome email");
    }

    return {
      success: true,
      emailId: emailResult.id,
      invitationUrl,
    };
  },
});

// Get all users (admin only)
export const getAllUsers = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    // Check if current user is admin
    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!currentUser || currentUser.role !== "admin") {
      throw new Error("Unauthorized: Admin access required");
    }

    return await ctx.db.query("users").collect();
  },
});

// Update user permissions (admin only)
export const updateUserPermissions = mutation({
  args: {
    userId: v.id("users"),
    role: v.string(),
    allowed_desarrollos: v.optional(v.array(v.id("desarrollos"))),
    allowed_sales_projects: v.optional(v.array(v.id("sales_projects"))),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    // Check if current user is admin
    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!currentUser || currentUser.role !== "admin") {
      throw new Error("Unauthorized: Admin access required");
    }

    // Build update object with only provided fields
    const updateData: {
      role: string;
      allowed_desarrollos?: typeof args.allowed_desarrollos;
      allowed_sales_projects?: typeof args.allowed_sales_projects;
    } = {
      role: args.role,
    };
    
    if (args.allowed_desarrollos !== undefined) {
      updateData.allowed_desarrollos = args.allowed_desarrollos;
    }
    
    if (args.allowed_sales_projects !== undefined) {
      updateData.allowed_sales_projects = args.allowed_sales_projects;
    }

    await ctx.db.patch(args.userId, updateData);

    return { success: true };
  },
});

// Diagnostic query to inspect a user's record by email (admin only).
// Use from the Convex dashboard or a temporary debug page to verify
// that a user has a valid `name`, `role`, and `allowed_desarrollos`
// array in the database.
export const getUserByEmail = query({
  args: {
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!currentUser || currentUser.role !== "admin") {
      throw new Error("Unauthorized: Admin access required");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();

    if (!user) {
      return { found: false, diagnostics: { email: args.email } };
    }

    return {
      found: true,
      diagnostics: {
        _id: user._id,
        clerkId: user.clerkId,
        email: user.email,
        name: user.name,
        name_is_empty: !user.name || user.name.trim() === "",
        name_length: user.name?.length ?? 0,
        role: user.role,
        allowed_desarrollos_count: user.allowed_desarrollos?.length ?? 0,
        allowed_desarrollos: user.allowed_desarrollos,
        created_at: user.created_at,
        last_login: user.last_login,
      },
    };
  },
});

// Helper to check if user has access to a desarrollo
export const hasAccessToDesarrollo = query({
  args: {
    desarrolloId: v.id("desarrollos"),
  },
  handler: async (ctx, args) => {
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
    return user.allowed_desarrollos.includes(args.desarrolloId);
  },
});

// Helper to check if user has access to a sales project
export const hasAccessToSalesProject = query({
  args: {
    salesProyectoId: v.id("sales_projects"),
  },
  handler: async (ctx, args) => {
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

    const allowedSales = user.allowed_sales_projects || [];

    // Check if sales project is in allowed list
    return allowedSales.includes(args.salesProyectoId);
  },
});

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderWelcomeEmail({
  name,
  loginUrl,
  projectCount,
}: {
  name: string;
  loginUrl: string;
  projectCount: number;
}) {
  const safeName = escapeHtml(name);
  const safeUrl = escapeHtml(loginUrl);
  const projectText = projectCount === 1
    ? "Tienes 1 proyecto asignado."
    : `Tienes ${projectCount} proyectos asignados.`;

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Bienvenido a OGC Dashboard</title>
  </head>
  <body style="margin:0;background:#f6f7f9;font-family:Arial,Helvetica,sans-serif;color:#111827;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f7f9;padding:48px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:8px;border:1px solid #e5e7eb;">
            <tr>
              <td style="padding:40px 40px 20px;">
                <div style="font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#6b7280;">OGC Dashboard</div>
                <h1 style="margin:28px 0 12px;font-size:28px;line-height:1.2;font-weight:600;color:#111827;">Bienvenido, ${safeName}</h1>
                <p style="margin:0;color:#4b5563;font-size:16px;line-height:1.6;">Tu acceso ya fue configurado. ${escapeHtml(projectText)} Usa el botón para crear o entrar a tu cuenta y abrir directamente tu dashboard.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 40px 28px;">
                <a href="${safeUrl}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;border-radius:6px;padding:13px 20px;font-size:15px;font-weight:700;">Entrar a mi cuenta</a>
              </td>
            </tr>
            <tr>
              <td style="padding:0 40px 36px;">
                <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.6;">Si el botón no funciona, copia y pega este enlace en tu navegador:</p>
                <p style="margin:8px 0 0;color:#374151;font-size:13px;line-height:1.6;word-break:break-all;">${safeUrl}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
