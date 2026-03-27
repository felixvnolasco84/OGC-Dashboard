import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// ============================================
// QUERIES
// ============================================

// Get all subcontratistas for a project (with document URLs)
export const getByProyecto = query({
  args: { proyecto_id: v.id("desarrollos") },
  handler: async (ctx, args) => {
    const subs = await ctx.db
      .query("subcontratistas")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto_id))
      .collect();

    return await Promise.all(
      subs.map(async (s) => {
        let presupuesto_url = null;
        if (s.presupuesto_storage_id) {
          presupuesto_url = await ctx.storage.getUrl(s.presupuesto_storage_id);
        }
        let contrato_url = null;
        if (s.contrato_storage_id) {
          contrato_url = await ctx.storage.getUrl(s.contrato_storage_id);
        }
        let siroc_url = null;
        if (s.siroc_storage_id) {
          siroc_url = await ctx.storage.getUrl(s.siroc_storage_id);
        }
        return { ...s, presupuesto_url, contrato_url, siroc_url };
      })
    );
  },
});

// Get contratistas generales for a project
export const getContratistasGeneralesByProyecto = query({
  args: { proyecto_id: v.id("desarrollos") },
  handler: async (ctx, args) => {
    const contratistas = await ctx.db
      .query("contratistas_generales")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto_id))
      .collect();

    return await Promise.all(
      contratistas.map(async (c) => {
        let responsable = null;
        if (c.responsable_id) {
          const user = await ctx.db.get(c.responsable_id);
          if (user) {
            responsable = { _id: user._id, name: user.name, email: user.email };
          }
        }
        let contrato_url = null;
        if (c.contrato_storage_id) {
          contrato_url = await ctx.storage.getUrl(c.contrato_storage_id);
        }
        let siroc_url = null;
        if (c.siroc_storage_id) {
          siroc_url = await ctx.storage.getUrl(c.siroc_storage_id);
        }
        return { ...c, responsable, contrato_url, siroc_url };
      })
    );
  },
});

// ============================================
// MUTATIONS - Subcontratistas
// ============================================

export const generateUploadUrl = mutation({
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

// Create a new subcontratista
export const createSubcontratista = mutation({
  args: {
    proyecto: v.id("desarrollos"),
    contratista_general_id: v.optional(v.id("contratistas_generales")),
    nombre: v.string(),
    partida_id: v.optional(v.id("partidas")),
    partida_nombre: v.optional(v.string()),
    monto: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("subcontratistas", {
      proyecto: args.proyecto,
      contratista_general_id: args.contratista_general_id,
      nombre: args.nombre,
      partida_id: args.partida_id,
      partida_nombre: args.partida_nombre,
      monto: args.monto,
      status_manual: "inactivo",
    });
  },
});

// Update subcontratista fields
export const updateSubcontratista = mutation({
  args: {
    id: v.id("subcontratistas"),
    nombre: v.optional(v.string()),
    partida_id: v.optional(v.id("partidas")),
    partida_nombre: v.optional(v.string()),
    monto: v.optional(v.number()),
    status_manual: v.optional(v.string()),
    contratista_general_id: v.optional(v.id("contratistas_generales")),
  },
  handler: async (ctx, args) => {
    const { id, ...fields } = args;
    // Filter out undefined values
    const updates: Record<string, unknown> = {};
    if (fields.nombre !== undefined) updates.nombre = fields.nombre;
    if (fields.partida_id !== undefined) updates.partida_id = fields.partida_id;
    if (fields.partida_nombre !== undefined) updates.partida_nombre = fields.partida_nombre;
    if (fields.monto !== undefined) updates.monto = fields.monto;
    if (fields.status_manual !== undefined) updates.status_manual = fields.status_manual;
    if (fields.contratista_general_id !== undefined) updates.contratista_general_id = fields.contratista_general_id;
    await ctx.db.patch(id, updates);
  },
});

// Delete a subcontratista
export const deleteSubcontratista = mutation({
  args: { id: v.id("subcontratistas") },
  handler: async (ctx, args) => {
    // Delete related history entries
    const historyPresupuesto = await ctx.db
      .query("autorizaciones_obra_historial")
      .withIndex("by_parent", (q) =>
        q.eq("parent_type", "subcontratista_presupuesto").eq("parent_id", args.id)
      )
      .collect();
    for (const h of historyPresupuesto) {
      await ctx.db.delete(h._id);
    }
    const historyContrato = await ctx.db
      .query("autorizaciones_obra_historial")
      .withIndex("by_parent", (q) =>
        q.eq("parent_type", "subcontratista_contrato").eq("parent_id", args.id)
      )
      .collect();
    for (const h of historyContrato) {
      await ctx.db.delete(h._id);
    }
    await ctx.db.delete(args.id);
  },
});

// Attach presupuesto file to subcontratista
export const attachPresupuesto = mutation({
  args: {
    id: v.id("subcontratistas"),
    storage_id: v.id("_storage"),
    nombre: v.string(),
    size: v.number(),
    type: v.string(),
    clerk_id: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const sub = await ctx.db.get(args.id);
    if (!sub) throw new Error("Subcontratista not found");

    // Move existing to history
    if (sub.presupuesto_storage_id && sub.presupuesto_nombre) {
      let replacedByUser = null;
      if (args.clerk_id) {
        replacedByUser = await ctx.db
          .query("users")
          .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerk_id!))
          .first();
      }
      await ctx.db.insert("autorizaciones_obra_historial", {
        proyecto: sub.proyecto,
        parent_type: "subcontratista_presupuesto",
        parent_id: sub._id,
        documento_storage_id: sub.presupuesto_storage_id,
        documento_nombre: sub.presupuesto_nombre,
        documento_size: sub.presupuesto_size ?? 0,
        documento_type: sub.presupuesto_type ?? "",
        replaced_at: Date.now(),
        replaced_by_id: replacedByUser?._id,
        replaced_by_name: replacedByUser?.name,
      });
    }

    await ctx.db.patch(args.id, {
      presupuesto_storage_id: args.storage_id,
      presupuesto_nombre: args.nombre,
      presupuesto_size: args.size,
      presupuesto_type: args.type,
      presupuesto_uploaded_at: Date.now(),
    });
  },
});

// Attach contrato file to subcontratista
export const attachContrato = mutation({
  args: {
    id: v.id("subcontratistas"),
    storage_id: v.id("_storage"),
    nombre: v.string(),
    size: v.number(),
    type: v.string(),
    clerk_id: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const sub = await ctx.db.get(args.id);
    if (!sub) throw new Error("Subcontratista not found");

    // Move existing to history
    if (sub.contrato_storage_id && sub.contrato_nombre) {
      let replacedByUser = null;
      if (args.clerk_id) {
        replacedByUser = await ctx.db
          .query("users")
          .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerk_id!))
          .first();
      }
      await ctx.db.insert("autorizaciones_obra_historial", {
        proyecto: sub.proyecto,
        parent_type: "subcontratista_contrato",
        parent_id: sub._id,
        documento_storage_id: sub.contrato_storage_id,
        documento_nombre: sub.contrato_nombre,
        documento_size: sub.contrato_size ?? 0,
        documento_type: sub.contrato_type ?? "",
        replaced_at: Date.now(),
        replaced_by_id: replacedByUser?._id,
        replaced_by_name: replacedByUser?.name,
      });
    }

    await ctx.db.patch(args.id, {
      contrato_storage_id: args.storage_id,
      contrato_nombre: args.nombre,
      contrato_size: args.size,
      contrato_type: args.type,
      contrato_uploaded_at: Date.now(),
    });
  },
});

// Remove presupuesto file from subcontratista
export const removePresupuesto = mutation({
  args: { id: v.id("subcontratistas") },
  handler: async (ctx, args) => {
    const sub = await ctx.db.get(args.id);
    if (!sub) throw new Error("Subcontratista not found");
    await ctx.db.patch(args.id, {
      presupuesto_storage_id: undefined,
      presupuesto_nombre: undefined,
      presupuesto_size: undefined,
      presupuesto_type: undefined,
      presupuesto_uploaded_at: undefined,
    });
  },
});

// Remove contrato file from subcontratista
export const removeContrato = mutation({
  args: { id: v.id("subcontratistas") },
  handler: async (ctx, args) => {
    const sub = await ctx.db.get(args.id);
    if (!sub) throw new Error("Subcontratista not found");
    await ctx.db.patch(args.id, {
      contrato_storage_id: undefined,
      contrato_nombre: undefined,
      contrato_size: undefined,
      contrato_type: undefined,
      contrato_uploaded_at: undefined,
    });
  },
});

// ============================================
// MUTATIONS - Contratistas Generales
// ============================================

export const createContratistaGeneral = mutation({
  args: {
    proyecto: v.id("desarrollos"),
    nombre: v.string(),
    responsable_id: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("contratistas_generales", {
      proyecto: args.proyecto,
      nombre: args.nombre,
      responsable_id: args.responsable_id,
      status_manual: "inactivo",
    });
  },
});

export const updateContratistaGeneral = mutation({
  args: {
    id: v.id("contratistas_generales"),
    nombre: v.optional(v.string()),
    responsable_id: v.optional(v.id("users")),
    status_manual: v.optional(v.string()),
    siroc_numero: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...fields } = args;
    const updates: Record<string, unknown> = {};
    if (fields.nombre !== undefined) updates.nombre = fields.nombre;
    if (fields.responsable_id !== undefined) updates.responsable_id = fields.responsable_id;
    if (fields.status_manual !== undefined) updates.status_manual = fields.status_manual;
    if (fields.siroc_numero !== undefined) updates.siroc_numero = fields.siroc_numero;
    await ctx.db.patch(id, updates);
  },
});

// Attach contrato file to contratista general
export const attachContratistaGeneralContrato = mutation({
  args: {
    id: v.id("contratistas_generales"),
    storage_id: v.id("_storage"),
    nombre: v.string(),
    size: v.number(),
    type: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      contrato_storage_id: args.storage_id,
      contrato_nombre: args.nombre,
      contrato_size: args.size,
      contrato_type: args.type,
      contrato_uploaded_at: Date.now(),
    });
  },
});

// Attach SIROC file to contratista general
export const attachContratistaGeneralSiroc = mutation({
  args: {
    id: v.id("contratistas_generales"),
    storage_id: v.id("_storage"),
    nombre: v.string(),
    size: v.number(),
    type: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      siroc_storage_id: args.storage_id,
      siroc_nombre: args.nombre,
      siroc_size: args.size,
      siroc_type: args.type,
      siroc_uploaded_at: Date.now(),
    });
  },
});

// Update subcontratista SIROC number
export const updateSubcontratistaSiroc = mutation({
  args: {
    id: v.id("subcontratistas"),
    siroc_numero: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const updates: Record<string, unknown> = {};
    if (args.siroc_numero !== undefined) updates.siroc_numero = args.siroc_numero;
    await ctx.db.patch(args.id, updates);
  },
});

// Attach SIROC file to subcontratista
export const attachSubcontratistaSiroc = mutation({
  args: {
    id: v.id("subcontratistas"),
    storage_id: v.id("_storage"),
    nombre: v.string(),
    size: v.number(),
    type: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      siroc_storage_id: args.storage_id,
      siroc_nombre: args.nombre,
      siroc_size: args.size,
      siroc_type: args.type,
      siroc_uploaded_at: Date.now(),
    });
  },
});
