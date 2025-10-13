import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Get all documents
export const getAll = query(async (ctx) => {
    return await ctx.db.query("documentos").collect();
});


// Get documents by pago
export const getByPago = query({
    args: {
        pago_id: v.id("pagos"),
    },
    handler: async (ctx, args) => {
        const allDocuments = await ctx.db.query("documentos").collect();
        return allDocuments.filter(doc => doc.pago_ids.includes(args.pago_id));
    },
});

// Get document by ID
export const getById = query({
    args: {
        id: v.id("documentos"),
    },
    handler: async (ctx, args) => {
        return await ctx.db.get(args.id);
    },
});

// Create new document
export const create = mutation({
    args: {
        nombre: v.string(),
        descripcion: v.string(),
        image: v.string(), // Appwrite file ID
        type: v.string(),
        proyecto: v.id("desarrollos"),
        pago_ids: v.array(v.id("pagos")),
    },
    handler: async (ctx, args) => {
        const documento = await ctx.db.insert("documentos", {
            nombre: args.nombre,
            descripcion: args.descripcion,
            image: args.image,
            type: args.type,
            proyecto: args.proyecto,
            pago_ids: args.pago_ids,
        });
        return documento;
    },
});

// Update document
export const update = mutation({
    args: {
        id: v.id("documentos"),
        nombre: v.string(),
        descripcion: v.string(),
        image: v.string(),
        type: v.string(),
        proyecto: v.id("desarrollos"),
        pago_ids: v.array(v.id("pagos")),
    },
    handler: async (ctx, args) => {
        const { id, ...rest } = args;
        return await ctx.db.patch(id, rest);
    },
});

// Delete document
export const deleteDocument = mutation({
    args: {
        id: v.id("documentos"),
    },
    handler: async (ctx, args) => {
        const documento = await ctx.db.get(args.id);
        if (!documento) {
            throw new Error("Document not found");
        }

        await ctx.db.delete(args.id);

        return {
            success: true,
            fileId: documento.image, // Return the Appwrite file ID so it can be deleted from storage
        };
    },
});
