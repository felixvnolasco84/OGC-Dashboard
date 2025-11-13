import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Get all documents (with URLs)
export const getAll = query(async (ctx) => {
    const documents = await ctx.db.query("documentos").collect();
    
    // Enrich with URLs for Convex storage files
    return await Promise.all(
        documents.map(async (doc) => {
            if (doc.storage_id) {
                const url = await ctx.storage.getUrl(doc.storage_id);
                return { ...doc, url };
            }
            // For legacy Appwrite files, return the image field as-is
            return { ...doc, url: doc.image || null };
        })
    );
});


// Get documents by transaction (with URLs)
export const getByTransaccion = query({
    args: {
        transaccion_id: v.id("transacciones"),
    },
    handler: async (ctx, args) => {
        const documents = await ctx.db
            .query("documentos")
            .withIndex("by_transaccion", (q) => q.eq("transaccion_id", args.transaccion_id))
            .collect();
        
        // Enrich with URLs for Convex storage files
        return await Promise.all(
            documents.map(async (doc) => {
                if (doc.storage_id) {
                    const url = await ctx.storage.getUrl(doc.storage_id);
                    return { ...doc, url };
                }
                // For legacy Appwrite files, return the image field as-is
                return { ...doc, url: doc.image || null };
            })
        );
    },
});

// Get documents by proyecto (with URLs)
export const getByProyecto = query({
    args: {
        proyecto_id: v.id("desarrollos"),
    },
    handler: async (ctx, args) => {
        const documents = await ctx.db
            .query("documentos")
            .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto_id))
            .collect();
        
        // Enrich with URLs for Convex storage files
        return await Promise.all(
            documents.map(async (doc) => {
                if (doc.storage_id) {
                    const url = await ctx.storage.getUrl(doc.storage_id);
                    return { ...doc, url };
                }
                // For legacy Appwrite files, return the image field as-is
                return { ...doc, url: doc.image || null };
            })
        );
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

// Get file URL from storage
export const getUrl = query({
    args: {
        storage_id: v.id("_storage"),
    },
    handler: async (ctx, args) => {
        return await ctx.storage.getUrl(args.storage_id);
    },
});

// Generate upload URL for file upload
export const generateUploadUrl = mutation({
    handler: async (ctx) => {
        return await ctx.storage.generateUploadUrl();
    },
});

// Create new document with Convex storage
export const createWithStorage = mutation({
    args: {
        nombre: v.string(),
        descripcion: v.string(),
        storage_id: v.id("_storage"),
        type: v.string(),
        size: v.number(),
        proyecto: v.optional(v.id("desarrollos")),
        transaccion_id: v.optional(v.id("transacciones")),
        sales_proyecto: v.optional(v.id("sales_projects")),
        sales_transaccion_id: v.optional(v.id("sales_transacciones")),
    },
    handler: async (ctx, args) => {
        const documento = await ctx.db.insert("documentos", {
            nombre: args.nombre,
            descripcion: args.descripcion,
            storage_id: args.storage_id,
            type: args.type,
            size: args.size,
            proyecto: args.proyecto,
            transaccion_id: args.transaccion_id,
            sales_proyecto: args.sales_proyecto,
            sales_transaccion_id: args.sales_transaccion_id,
            uploaded_at: Date.now(),
        });
        return documento;
    },
});

// Legacy: Create new document (kept for backward compatibility with Appwrite)
export const create = mutation({
    args: {
        nombre: v.string(),
        descripcion: v.string(),
        image: v.string(), // Appwrite file ID
        type: v.string(),
        proyecto: v.id("desarrollos"),
        transaccion_id: v.id("transacciones"),
    },
    handler: async (ctx, args) => {
        const documento = await ctx.db.insert("documentos", {
            nombre: args.nombre,
            descripcion: args.descripcion,
            image: args.image,
            type: args.type,
            proyecto: args.proyecto,
            transaccion_id: args.transaccion_id,
            uploaded_at: Date.now(),
        });
        return documento;
    },
});

// Update document
export const update = mutation({
    args: {
        id: v.id("documentos"),
        nombre: v.optional(v.string()),
        descripcion: v.optional(v.string()),
        image: v.optional(v.string()),
        type: v.optional(v.string()),
        proyecto: v.optional(v.id("desarrollos")),
        transaccion_id: v.optional(v.id("transacciones")),
    },
    handler: async (ctx, args) => {
        const { id, ...updateData } = args;
        
        // Filter out undefined values
        const cleanUpdateData = Object.fromEntries(
            Object.entries(updateData).filter(([, value]) => value !== undefined)
        );
        
        return await ctx.db.patch(id, cleanUpdateData);
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
