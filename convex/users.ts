import { action, mutation, query } from "./_generated/server";
import { api } from "./_generated/api";
import { v } from "convex/values";

const TEMPLATE_DOWNLOAD_URL = "https://drive.google.com/drive/folders/1uzn_nHnoryv2M_syMDVjPqWabc-SyzQK?usp=sharing";

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

    const html = args.role === "viewer" ? renderWelcomeViewerEmail({
      name: args.name || normalizedEmail,
      loginUrl: invitationUrl,
      projectCount: args.allowed_desarrollos.length,
    }) : renderWelcomeAdminEmail({
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

// Remove a user from the dashboard access list (admin only)
export const removeUser = mutation({
  args: {
    userId: v.id("users"),
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

    if (currentUser._id === args.userId) {
      throw new Error("No puedes quitar tu propio usuario");
    }

    const userToRemove = await ctx.db.get(args.userId);
    if (!userToRemove) {
      throw new Error("Usuario no encontrado");
    }

    await ctx.db.delete(args.userId);

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

function renderWelcomeAdminEmail({
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
  const safeTemplateUrl = escapeHtml(TEMPLATE_DOWNLOAD_URL);
  const projectCopy = projectCount === 1
    ? "el proyecto que ya cargamos a tu cuenta"
    : "los proyectos que ya cargamos a tu cuenta";

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Tu acceso a OGC Dashboard ya está listo</title>
  </head>
  <body style="margin:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#242424;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#ffffff;padding:56px 16px 40px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:660px;">
            <tr>
              <td style="padding:0 38px 70px;">
                <table role="presentation" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="font-size:42px;line-height:38px;font-weight:700;color:#252525;padding-right:18px;">↱</td>
                    <td style="font-size:22px;line-height:1.2;font-weight:500;color:#242424;">Build smarter. Spend better.</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 38px;">
                <h1 style="margin:0 0 22px;font-size:31px;line-height:1.2;font-weight:500;color:#242424;letter-spacing:-.2px;">Tu acceso<br />ya está listo.</h1>
                <p style="margin:0 0 56px;color:#3f3f3f;font-size:18px;line-height:1.45;font-weight:400;">Hola ${safeName}, configuramos tu cuenta en la plataforma. Desde hoy puedes monitorear presupuesto, avance de obra y documentos de proyecto, todo en un solo lugar.</p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 44px;">
                  <tr>
                    <td valign="top" width="36" style="color:#b7b7b7;font-size:18px;line-height:1.5;padding:0 0 32px;">01</td>
                    <td style="color:#3f3f3f;font-size:15px;line-height:1.55;padding:0 0 32px;"><strong style="color:#242424;font-weight:700;">Inicia sesión</strong> y revisa ${escapeHtml(projectCopy)}.</td>
                  </tr>
                  <tr>
                    <td valign="top" width="36" style="color:#b7b7b7;font-size:18px;line-height:1.5;padding:0 0 32px;">02</td>
                    <td style="color:#3f3f3f;font-size:15px;line-height:1.55;padding:0 0 32px;"><strong style="color:#242424;font-weight:700;">Dime si algo no cuadra</strong>: partidas, etapas, nombres de proyecto o permisos. Lo ajustamos de inmediato.</td>
                  </tr>
                  <tr>
                    <td valign="top" width="36" style="color:#b7b7b7;font-size:18px;line-height:1.5;padding:0;">03</td>
                    <td style="color:#3f3f3f;font-size:15px;line-height:1.55;padding:0;"><strong style="color:#242424;font-weight:700;">Agendamos 30 minutos</strong> para resolver dudas y afinar el setup antes de que empieces a operar.</td>
                  </tr>
                </table>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td align="center" style="padding:0 0 48px;">
                      <a href="${safeUrl}" style="display:inline-block;width:260px;max-width:100%;background:#dfff00;color:#242424;text-decoration:none;border-radius:6px;padding:15px 20px;font-size:13px;font-weight:700;text-align:center;">Entrar a mi cuenta</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 0 10px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e8e8e8;border-radius:7px;background:#fbfbfb;">
                  <tr>
                    <td style="padding:48px 56px 56px;">
                      <p style="margin:0 0 20px;color:#3f3f3f;font-size:17px;line-height:1.45;">Para que la plataforma funcione desde el primer día, necesitamos que cargues tu información en los formatos correctos. Preparamos dos templates listos para llenar:</p>
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                        <tr>
                          <td align="center" style="padding:4px 0 58px;">
                            <a href="${safeTemplateUrl}" style="display:inline-block;width:260px;max-width:100%;background:#ffffff;color:#8b8b8b;text-decoration:none;border:1px solid #cfcfcf;border-radius:6px;padding:13px 18px;font-size:13px;font-weight:700;text-align:center;">Descargar templates</a>
                          </td>
                        </tr>
                      </table>
                      <p style="margin:0 0 4px;color:#242424;font-size:16px;line-height:1.45;font-weight:700;">Template 1 — Presupuesto de obra</p>
                      <p style="margin:0 0 28px;color:#3f3f3f;font-size:16px;line-height:1.45;">Captura tus partidas, subpartidas y montos aprobados por proyecto. Este archivo es la base del control financiero; sin él, no hay presupuesto contra qué comparar.</p>
                      <p style="margin:0 0 4px;color:#242424;font-size:16px;line-height:1.45;font-weight:700;">Template 2 — Carga de transacciones</p>
                      <p style="margin:0 0 28px;color:#3f3f3f;font-size:16px;line-height:1.45;">Registra tus gastos, pagos a proveedores y movimientos de obra. Puedes exportar directo de tu sistema contable o llenarlo manualmente.</p>
                      <p style="margin:0;color:#3f3f3f;font-size:16px;line-height:1.45;">Si tienes dudas sobre cómo llenar algún campo, escríbeme antes de nuestra llamada y lo resolvemos juntos.</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 38px 0;">
                <p style="margin:0;color:#8b8b8b;font-size:12px;line-height:1.5;">Si el botón no funciona, copia y pega este enlace en tu navegador:</p>
                <p style="margin:6px 0 0;color:#6f6f6f;font-size:12px;line-height:1.5;word-break:break-all;">${safeUrl}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
	  </body>
	</html>`;
}

function renderWelcomeViewerEmail({
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
  const projectCopy = projectCount === 1
    ? "el proyecto asignado a tu cuenta"
    : "los proyectos asignados a tu cuenta";

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Tu acceso a OGC Dashboard ya está listo</title>
  </head>
  <body style="margin:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#242424;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#ffffff;padding:56px 16px 40px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:660px;">
            <tr>
              <td style="padding:0 38px 70px;">
                <table role="presentation" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="font-size:42px;line-height:38px;font-weight:700;color:#252525;padding-right:18px;">↱</td>
                    <td style="font-size:22px;line-height:1.2;font-weight:500;color:#242424;">Build smarter. Spend better.</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 38px;">
                <h1 style="margin:0 0 22px;font-size:31px;line-height:1.2;font-weight:500;color:#242424;letter-spacing:-.2px;">Tu acceso<br />ya está listo.</h1>
                <p style="margin:0 0 56px;color:#3f3f3f;font-size:18px;line-height:1.45;font-weight:400;">Hola ${safeName}, configuramos tu cuenta en la plataforma. Desde hoy puedes consultar la información de ${escapeHtml(projectCopy)}: presupuesto, avance de obra, documentos y bitácora, todo en un solo lugar.</p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 44px;">
                  <tr>
                    <td valign="top" width="36" style="color:#b7b7b7;font-size:18px;line-height:1.5;padding:0 0 32px;">01</td>
                    <td style="color:#3f3f3f;font-size:15px;line-height:1.55;padding:0 0 32px;"><strong style="color:#242424;font-weight:700;">Inicia sesión</strong> con el botón de este correo.</td>
                  </tr>
                  <tr>
                    <td valign="top" width="36" style="color:#b7b7b7;font-size:18px;line-height:1.5;padding:0 0 32px;">02</td>
                    <td style="color:#3f3f3f;font-size:15px;line-height:1.55;padding:0 0 32px;"><strong style="color:#242424;font-weight:700;">Explora tus proyectos</strong> y consulta la información disponible en modo de solo lectura.</td>
                  </tr>
                  <tr>
                    <td valign="top" width="36" style="color:#b7b7b7;font-size:18px;line-height:1.5;padding:0;">03</td>
                    <td style="color:#3f3f3f;font-size:15px;line-height:1.55;padding:0;"><strong style="color:#242424;font-weight:700;">Reporta cualquier duda</strong> con tu administrador si necesitas acceso a otro proyecto o notas algún dato pendiente.</td>
                  </tr>
                </table>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td align="center" style="padding:0 0 48px;">
                      <a href="${safeUrl}" style="display:inline-block;width:260px;max-width:100%;background:#dfff00;color:#242424;text-decoration:none;border-radius:6px;padding:15px 20px;font-size:13px;font-weight:700;text-align:center;">Entrar a mi cuenta</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 0 10px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e8e8e8;border-radius:7px;background:#fbfbfb;">
                  <tr>
                    <td style="padding:48px 56px 56px;">
                      <p style="margin:0 0 4px;color:#242424;font-size:16px;line-height:1.45;font-weight:700;">Tu acceso es de consulta</p>
                      <p style="margin:0 0 28px;color:#3f3f3f;font-size:16px;line-height:1.45;">Tu perfil viewer está pensado para revisar información sin modificarla. Podrás navegar por los proyectos asignados y ver el avance actualizado que el equipo administrador cargue en la plataforma.</p>
                      <p style="margin:0 0 4px;color:#242424;font-size:16px;line-height:1.45;font-weight:700;">Qué puedes revisar</p>
                      <p style="margin:0 0 28px;color:#3f3f3f;font-size:16px;line-height:1.45;">Presupuesto, control financiero, programa de obra, bitácora y documentos del proyecto, según los permisos asignados a tu cuenta.</p>
                      <p style="margin:0;color:#3f3f3f;font-size:16px;line-height:1.45;">Si algo no aparece como esperabas, responde este correo o contacta a tu administrador para revisar tus permisos.</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 38px 0;">
                <p style="margin:0;color:#8b8b8b;font-size:12px;line-height:1.5;">Si el botón no funciona, copia y pega este enlace en tu navegador:</p>
                <p style="margin:6px 0 0;color:#6f6f6f;font-size:12px;line-height:1.5;word-break:break-all;">${safeUrl}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
