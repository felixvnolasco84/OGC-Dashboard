import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// ============================================
// QUERIES
// ============================================

// Get IMSS configuration for a project
export const getConfigByProyecto = query({
  args: { proyecto_id: v.id("desarrollos") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("imss_configuracion")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto_id))
      .first();
  },
});

// Get all pagos de cuota for a project (with file URLs)
export const getPagosCuotaByProyecto = query({
  args: { proyecto_id: v.id("desarrollos") },
  handler: async (ctx, args) => {
    const pagos = await ctx.db
      .query("imss_pagos_cuota")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto_id))
      .collect();

    return await Promise.all(
      pagos.map(async (p) => {
        let comprobante_url = null;
        if (p.comprobante_storage_id) {
          comprobante_url = await ctx.storage.getUrl(p.comprobante_storage_id);
        }
        let soporte_url = null;
        if (p.soporte_storage_id) {
          soporte_url = await ctx.storage.getUrl(p.soporte_storage_id);
        }
        return { ...p, comprobante_url, soporte_url };
      })
    );
  },
});

// Get pagos de cuota by parent (contratista_general or subcontratista)
export const getPagosCuotaByParent = query({
  args: {
    parent_type: v.string(),
    parent_id: v.string(),
  },
  handler: async (ctx, args) => {
    const pagos = await ctx.db
      .query("imss_pagos_cuota")
      .withIndex("by_parent", (q) =>
        q.eq("parent_type", args.parent_type).eq("parent_id", args.parent_id)
      )
      .collect();

    return await Promise.all(
      pagos.map(async (p) => {
        let comprobante_url = null;
        if (p.comprobante_storage_id) {
          comprobante_url = await ctx.storage.getUrl(p.comprobante_storage_id);
        }
        let soporte_url = null;
        if (p.soporte_storage_id) {
          soporte_url = await ctx.storage.getUrl(p.soporte_storage_id);
        }
        return { ...p, comprobante_url, soporte_url };
      })
    );
  },
});

// ============================================
// MUTATIONS - Config
// ============================================

export const generateUploadUrl = mutation({
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

// Create or update IMSS config for a project
export const upsertConfig = mutation({
  args: {
    proyecto: v.id("desarrollos"),
    costo_total_imss: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("imss_configuracion")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        costo_total_imss: args.costo_total_imss,
      });
      return existing._id;
    } else {
      return await ctx.db.insert("imss_configuracion", {
        proyecto: args.proyecto,
        costo_total_imss: args.costo_total_imss,
      });
    }
  },
});

// ============================================
// MUTATIONS - Pagos de Cuota
// ============================================

// Create a new pago de cuota
export const createPagoCuota = mutation({
  args: {
    proyecto: v.id("desarrollos"),
    parent_type: v.string(),
    parent_id: v.string(),
    cuota_tipo: v.optional(v.string()),
    monto: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("imss_pagos_cuota", {
      proyecto: args.proyecto,
      parent_type: args.parent_type,
      parent_id: args.parent_id,
      cuota_tipo: args.cuota_tipo,
      monto: args.monto,
    });
  },
});

// Update pago de cuota fields
export const updatePagoCuota = mutation({
  args: {
    id: v.id("imss_pagos_cuota"),
    cuota_tipo: v.optional(v.string()),
    monto: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { id, ...fields } = args;
    const updates: Record<string, unknown> = {};
    if (fields.cuota_tipo !== undefined) updates.cuota_tipo = fields.cuota_tipo;
    if (fields.monto !== undefined) updates.monto = fields.monto;
    await ctx.db.patch(id, updates);
  },
});

// Delete a pago de cuota
export const deletePagoCuota = mutation({
  args: { id: v.id("imss_pagos_cuota") },
  handler: async (ctx, args) => {
    const pago = await ctx.db.get(args.id);
    if (!pago) throw new Error("Pago not found");

    const historyParentTypes = ["imss_comprobante", "imss_soporte"];
    for (const parentType of historyParentTypes) {
      const history = await ctx.db
        .query("autorizaciones_obra_historial")
        .withIndex("by_parent", (q) =>
          q.eq("parent_type", parentType).eq("parent_id", args.id)
        )
        .collect();
      for (const h of history) {
        await ctx.db.delete(h._id);
      }
    }

    await ctx.db.delete(args.id);
  },
});

// Attach comprobante file to a pago (with history support)
export const attachComprobante = mutation({
  args: {
    id: v.id("imss_pagos_cuota"),
    storage_id: v.id("_storage"),
    nombre: v.string(),
    size: v.number(),
    type: v.string(),
    clerk_id: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const pago = await ctx.db.get(args.id);
    if (!pago) throw new Error("Pago not found");

    // Move existing to history
    if (pago.comprobante_storage_id && pago.comprobante_nombre) {
      let replacedByUser = null;
      if (args.clerk_id) {
        replacedByUser = await ctx.db
          .query("users")
          .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerk_id!))
          .first();
      }
      await ctx.db.insert("autorizaciones_obra_historial", {
        proyecto: pago.proyecto,
        parent_type: "imss_comprobante",
        parent_id: pago._id,
        documento_storage_id: pago.comprobante_storage_id,
        documento_nombre: pago.comprobante_nombre,
        documento_size: pago.comprobante_size ?? 0,
        documento_type: pago.comprobante_type ?? "",
        replaced_at: Date.now(),
        replaced_by_id: replacedByUser?._id,
        replaced_by_name: replacedByUser?.name,
      });
    }

    await ctx.db.patch(args.id, {
      comprobante_storage_id: args.storage_id,
      comprobante_nombre: args.nombre,
      comprobante_size: args.size,
      comprobante_type: args.type,
      comprobante_uploaded_at: Date.now(),
    });
  },
});

// Attach soporte file to a pago (with history support)
export const attachSoporte = mutation({
  args: {
    id: v.id("imss_pagos_cuota"),
    storage_id: v.id("_storage"),
    nombre: v.string(),
    size: v.number(),
    type: v.string(),
    clerk_id: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const pago = await ctx.db.get(args.id);
    if (!pago) throw new Error("Pago not found");

    // Move existing to history
    if (pago.soporte_storage_id && pago.soporte_nombre) {
      let replacedByUser = null;
      if (args.clerk_id) {
        replacedByUser = await ctx.db
          .query("users")
          .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerk_id!))
          .first();
      }
      await ctx.db.insert("autorizaciones_obra_historial", {
        proyecto: pago.proyecto,
        parent_type: "imss_soporte",
        parent_id: pago._id,
        documento_storage_id: pago.soporte_storage_id,
        documento_nombre: pago.soporte_nombre,
        documento_size: pago.soporte_size ?? 0,
        documento_type: pago.soporte_type ?? "",
        replaced_at: Date.now(),
        replaced_by_id: replacedByUser?._id,
        replaced_by_name: replacedByUser?.name,
      });
    }

    await ctx.db.patch(args.id, {
      soporte_storage_id: args.storage_id,
      soporte_nombre: args.nombre,
      soporte_size: args.size,
      soporte_type: args.type,
      soporte_uploaded_at: Date.now(),
    });
  },
});

// Remove comprobante file from a pago
export const removeComprobante = mutation({
  args: { id: v.id("imss_pagos_cuota") },
  handler: async (ctx, args) => {
    const pago = await ctx.db.get(args.id);
    if (!pago) throw new Error("Pago not found");
    await ctx.db.patch(args.id, {
      comprobante_storage_id: undefined,
      comprobante_nombre: undefined,
      comprobante_size: undefined,
      comprobante_type: undefined,
      comprobante_uploaded_at: undefined,
    });
  },
});

// Remove soporte file from a pago
export const removeSoporte = mutation({
  args: { id: v.id("imss_pagos_cuota") },
  handler: async (ctx, args) => {
    const pago = await ctx.db.get(args.id);
    if (!pago) throw new Error("Pago not found");
    await ctx.db.patch(args.id, {
      soporte_storage_id: undefined,
      soporte_nombre: undefined,
      soporte_size: undefined,
      soporte_type: undefined,
      soporte_uploaded_at: undefined,
    });
  },
});
