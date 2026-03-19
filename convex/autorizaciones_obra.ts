import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// ============================================
// QUERIES
// ============================================

// Get all autorizaciones sections for a project (with responsable user info and document URLs)
export const getByProyecto = query({
  args: { proyecto_id: v.id("desarrollos") },
  handler: async (ctx, args) => {
    const sections = await ctx.db
      .query("autorizaciones_obra")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto_id))
      .collect();

    // Enrich with responsable info and document URLs
    return await Promise.all(
      sections.map(async (section) => {
        let responsable = null;
        if (section.responsable_id) {
          const user = await ctx.db.get(section.responsable_id);
          if (user) {
            responsable = { _id: user._id, name: user.name, email: user.email };
          }
        }
        let documento_url = null;
        if (section.documento_storage_id) {
          documento_url = await ctx.storage.getUrl(section.documento_storage_id);
        }
        return { ...section, responsable, documento_url };
      })
    );
  },
});

// Get tramites for a specific autorizacion section
export const getTramitesByAutorizacion = query({
  args: { autorizacion_id: v.id("autorizaciones_obra") },
  handler: async (ctx, args) => {
    const tramites = await ctx.db
      .query("autorizaciones_obra_tramites")
      .withIndex("by_autorizacion", (q) =>
        q.eq("autorizacion_id", args.autorizacion_id)
      )
      .collect();

    // Enrich with document URLs
    return await Promise.all(
      tramites.map(async (tramite) => {
        let documento_url = null;
        if (tramite.documento_storage_id) {
          documento_url = await ctx.storage.getUrl(tramite.documento_storage_id);
        }
        return { ...tramite, documento_url };
      })
    );
  },
});

// Get tramites by proyecto (for initial load when autorizacion_id is not yet known)
export const getTramitesByProyecto = query({
  args: { proyecto_id: v.id("desarrollos") },
  handler: async (ctx, args) => {
    const tramites = await ctx.db
      .query("autorizaciones_obra_tramites")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto_id))
      .collect();

    return await Promise.all(
      tramites.map(async (tramite) => {
        let documento_url = null;
        if (tramite.documento_storage_id) {
          documento_url = await ctx.storage.getUrl(tramite.documento_storage_id);
        }
        return { ...tramite, documento_url };
      })
    );
  },
});

// Get file history for a parent record
export const getHistorial = query({
  args: {
    parent_type: v.string(),
    parent_id: v.string(),
  },
  handler: async (ctx, args) => {
    const history = await ctx.db
      .query("autorizaciones_obra_historial")
      .withIndex("by_parent", (q) =>
        q.eq("parent_type", args.parent_type).eq("parent_id", args.parent_id)
      )
      .collect();

    // Enrich with URLs
    return await Promise.all(
      history.map(async (entry) => {
        const url = await ctx.storage.getUrl(entry.documento_storage_id);
        return { ...entry, url };
      })
    );
  },
});

// Get all users (for responsable selector)
export const getAllUsers = query({
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    return users.map((u) => ({ _id: u._id, name: u.name, email: u.email }));
  },
});

// ============================================
// MUTATIONS - Sections
// ============================================

// Generate upload URL
export const generateUploadUrl = mutation({
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

// Upsert a section (create if not exists, update if exists)
export const upsertSeccion = mutation({
  args: {
    proyecto: v.id("desarrollos"),
    seccion: v.string(),
    status_manual: v.optional(v.string()),
    responsable_id: v.optional(v.id("users")),
    numero_licencia: v.optional(v.string()),
    fecha_emision: v.optional(v.string()),
    fecha_vencimiento: v.optional(v.string()),
    suma_asegurada: v.optional(v.number()),
    vigencia: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("autorizaciones_obra")
      .withIndex("by_proyecto_seccion", (q) =>
        q.eq("proyecto", args.proyecto).eq("seccion", args.seccion)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        status_manual: args.status_manual,
        responsable_id: args.responsable_id,
        numero_licencia: args.numero_licencia,
        fecha_emision: args.fecha_emision,
        fecha_vencimiento: args.fecha_vencimiento,
        suma_asegurada: args.suma_asegurada,
        vigencia: args.vigencia,
      });
      return existing._id;
    } else {
      return await ctx.db.insert("autorizaciones_obra", {
        proyecto: args.proyecto,
        seccion: args.seccion,
        status_manual: args.status_manual,
        responsable_id: args.responsable_id,
        numero_licencia: args.numero_licencia,
        fecha_emision: args.fecha_emision,
        fecha_vencimiento: args.fecha_vencimiento,
        suma_asegurada: args.suma_asegurada,
        vigencia: args.vigencia,
      });
    }
  },
});

// Update manual status for a section
export const updateStatus = mutation({
  args: {
    id: v.id("autorizaciones_obra"),
    status_manual: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { status_manual: args.status_manual });
  },
});

// Update responsable for a section
export const updateResponsable = mutation({
  args: {
    id: v.id("autorizaciones_obra"),
    responsable_id: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { responsable_id: args.responsable_id });
  },
});

// Update section fields (dates, amounts, etc.)
export const updateSeccionFields = mutation({
  args: {
    id: v.id("autorizaciones_obra"),
    numero_licencia: v.optional(v.string()),
    fecha_emision: v.optional(v.string()),
    fecha_vencimiento: v.optional(v.string()),
    suma_asegurada: v.optional(v.number()),
    vigencia: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...fields } = args;
    await ctx.db.patch(id, fields);
  },
});

// Attach document to a section (first upload or replace)
export const attachDocument = mutation({
  args: {
    proyecto: v.id("desarrollos"),
    seccion: v.string(),
    storage_id: v.id("_storage"),
    nombre: v.string(),
    size: v.number(),
    type: v.string(),
    clerk_id: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Find or create the section
    let section = await ctx.db
      .query("autorizaciones_obra")
      .withIndex("by_proyecto_seccion", (q) =>
        q.eq("proyecto", args.proyecto).eq("seccion", args.seccion)
      )
      .first();

    if (!section) {
      const newId = await ctx.db.insert("autorizaciones_obra", {
        proyecto: args.proyecto,
        seccion: args.seccion,
        documento_storage_id: args.storage_id,
        documento_nombre: args.nombre,
        documento_size: args.size,
        documento_type: args.type,
        documento_uploaded_at: Date.now(),
      });
      return newId;
    }

    // If there's an existing document, move it to history
    if (section.documento_storage_id && section.documento_nombre) {
      let replacedByUser = null;
      if (args.clerk_id) {
        replacedByUser = await ctx.db
          .query("users")
          .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerk_id!))
          .first();
      }

      await ctx.db.insert("autorizaciones_obra_historial", {
        proyecto: args.proyecto,
        parent_type: "autorizacion",
        parent_id: section._id,
        documento_storage_id: section.documento_storage_id,
        documento_nombre: section.documento_nombre,
        documento_size: section.documento_size ?? 0,
        documento_type: section.documento_type ?? "",
        replaced_at: Date.now(),
        replaced_by_id: replacedByUser?._id,
        replaced_by_name: replacedByUser?.name,
      });
    }

    // Update with new document
    await ctx.db.patch(section._id, {
      documento_storage_id: args.storage_id,
      documento_nombre: args.nombre,
      documento_size: args.size,
      documento_type: args.type,
      documento_uploaded_at: Date.now(),
    });

    return section._id;
  },
});

// ============================================
// MUTATIONS - Trámites
// ============================================

// Create a new tramite item
export const createTramite = mutation({
  args: {
    proyecto: v.id("desarrollos"),
    autorizacion_id: v.id("autorizaciones_obra"),
    servicio: v.string(),
    tramite: v.string(),
    estado: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("autorizaciones_obra_tramites", {
      proyecto: args.proyecto,
      autorizacion_id: args.autorizacion_id,
      servicio: args.servicio,
      tramite: args.tramite,
      estado: args.estado,
    });
  },
});

// Update a tramite item
export const updateTramite = mutation({
  args: {
    id: v.id("autorizaciones_obra_tramites"),
    servicio: v.optional(v.string()),
    tramite: v.optional(v.string()),
    estado: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...fields } = args;
    // Filter out undefined values
    const updates: Record<string, string> = {};
    if (fields.servicio !== undefined) updates.servicio = fields.servicio;
    if (fields.tramite !== undefined) updates.tramite = fields.tramite;
    if (fields.estado !== undefined) updates.estado = fields.estado;
    await ctx.db.patch(id, updates);
  },
});

// Delete a tramite item
export const deleteTramite = mutation({
  args: { id: v.id("autorizaciones_obra_tramites") },
  handler: async (ctx, args) => {
    // Delete related history
    const history = await ctx.db
      .query("autorizaciones_obra_historial")
      .withIndex("by_parent", (q) =>
        q.eq("parent_type", "tramite").eq("parent_id", args.id)
      )
      .collect();
    for (const h of history) {
      await ctx.db.delete(h._id);
    }
    await ctx.db.delete(args.id);
  },
});

// Attach document to a tramite
export const attachTramiteDocument = mutation({
  args: {
    tramite_id: v.id("autorizaciones_obra_tramites"),
    storage_id: v.id("_storage"),
    nombre: v.string(),
    size: v.number(),
    type: v.string(),
    clerk_id: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const tramite = await ctx.db.get(args.tramite_id);
    if (!tramite) throw new Error("Tramite not found");

    // If there's an existing document, move it to history
    if (tramite.documento_storage_id && tramite.documento_nombre) {
      let replacedByUser = null;
      if (args.clerk_id) {
        replacedByUser = await ctx.db
          .query("users")
          .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerk_id!))
          .first();
      }

      await ctx.db.insert("autorizaciones_obra_historial", {
        proyecto: tramite.proyecto,
        parent_type: "tramite",
        parent_id: tramite._id,
        documento_storage_id: tramite.documento_storage_id,
        documento_nombre: tramite.documento_nombre,
        documento_size: tramite.documento_size ?? 0,
        documento_type: tramite.documento_type ?? "",
        replaced_at: Date.now(),
        replaced_by_id: replacedByUser?._id,
        replaced_by_name: replacedByUser?.name,
      });
    }

    await ctx.db.patch(args.tramite_id, {
      documento_storage_id: args.storage_id,
      documento_nombre: args.nombre,
      documento_size: args.size,
      documento_type: args.type,
      documento_uploaded_at: Date.now(),
    });
  },
});

// Ensure a section exists (idempotent create)
export const ensureSeccion = mutation({
  args: {
    proyecto: v.id("desarrollos"),
    seccion: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("autorizaciones_obra")
      .withIndex("by_proyecto_seccion", (q) =>
        q.eq("proyecto", args.proyecto).eq("seccion", args.seccion)
      )
      .first();

    if (existing) return existing._id;

    return await ctx.db.insert("autorizaciones_obra", {
      proyecto: args.proyecto,
      seccion: args.seccion,
    });
  },
});
