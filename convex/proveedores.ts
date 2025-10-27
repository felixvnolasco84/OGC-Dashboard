import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Get all proveedores
export const getAll = query(async (ctx) => {
    return await ctx.db.query("proveedores").collect();
});

// Get proveedor by ID
export const getById = query({
    args: {
        id: v.id("proveedores"),
    },
    handler: async (ctx, args) => {
        return await ctx.db.get(args.id);
    },
});

// Get proveedor by RFC
export const getByRFC = query({
    args: {
        rfc: v.string(),
    },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("proveedores")
            .withIndex("by_rfc", (q) => q.eq("rfc", args.rfc))
            .first();
    },
});

// Create new proveedor
export const create = mutation({
    args: {
        razon_social: v.string(),
        rfc: v.string(),
        direccion: v.string(),
        nombre_contacto: v.string(),
        telefono_contacto: v.string(),
        cuenta: v.string(),
        clabe: v.string(),
        banco: v.string(),
    },
    handler: async (ctx, args) => {
        const proveedor = await ctx.db.insert("proveedores", {
            razon_social: args.razon_social,
            rfc: args.rfc,
            direccion: args.direccion,
            nombre_contacto: args.nombre_contacto,
            telefono_contacto: args.telefono_contacto,
            cuenta: args.cuenta,
            clabe: args.clabe,
            banco: args.banco,
        });
        return proveedor;
    },
});

// Update proveedor
export const update = mutation({
    args: {
        id: v.id("proveedores"),
        razon_social: v.optional(v.string()),
        rfc: v.optional(v.string()),
        direccion: v.optional(v.string()),
        nombre_contacto: v.optional(v.string()),
        telefono_contacto: v.optional(v.string()),
        cuenta: v.optional(v.string()),
        clabe: v.optional(v.string()),
        banco: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const { id, ...rest } = args;
        // Filter out undefined values
        const updateData = Object.fromEntries(
            Object.entries(rest).filter(([, value]) => value !== undefined)
        );
        return await ctx.db.patch(id, updateData);
    },
});

// Delete proveedor
export const deleteProveedor = mutation({
    args: {
        id: v.id("proveedores"),
    },
    handler: async (ctx, args) => {
        // Verify the proveedor exists
        const proveedor = await ctx.db.get(args.id);
        if (!proveedor) {
            throw new Error("Proveedor not found");
        }

        // Delete the proveedor
        await ctx.db.delete(args.id);

        return {
            success: true,
        };
    },
});
