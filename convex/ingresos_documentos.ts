import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// ============================================
// QUERIES
// ============================================

// Get all documents for an ingreso (with URLs)
export const getByIngreso = query({
  args: { ingreso_id: v.id("ingresos") },
  handler: async (ctx, args) => {
    const documents = await ctx.db
      .query("ingresos_documentos")
      .withIndex("by_ingreso", (q) => q.eq("ingreso_id", args.ingreso_id))
      .collect();
    
    // Enrich with URLs for Convex storage files
    return await Promise.all(
      documents.map(async (doc) => {
        const url = await ctx.storage.getUrl(doc.storage_id);
        return { ...doc, url };
      })
    );
  },
});

// Get all documents for a proyecto (with URLs)
export const getByProyecto = query({
  args: { proyecto_id: v.id("desarrollos") },
  handler: async (ctx, args) => {
    const documents = await ctx.db
      .query("ingresos_documentos")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto_id))
      .collect();
    
    // Enrich with URLs for Convex storage files
    return await Promise.all(
      documents.map(async (doc) => {
        const url = await ctx.storage.getUrl(doc.storage_id);
        return { ...doc, url };
      })
    );
  },
});

// Get document by ID (with URL)
export const getById = query({
  args: { id: v.id("ingresos_documentos") },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.id);
    if (!doc) return null;
    
    const url = await ctx.storage.getUrl(doc.storage_id);
    return { ...doc, url };
  },
});

// Get file URL from storage
export const getUrl = query({
  args: { storage_id: v.id("_storage") },
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storage_id);
  },
});

// ============================================
// MUTATIONS
// ============================================

// Generate upload URL for file upload
export const generateUploadUrl = mutation({
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

// Create new ingreso document with Convex storage
export const create = mutation({
  args: {
    ingreso_id: v.id("ingresos"),
    proyecto: v.id("desarrollos"),
    nombre: v.string(),
    descripcion: v.optional(v.string()),
    storage_id: v.id("_storage"),
    type: v.string(),
    size: v.number(),
    clerk_id: v.string(), // Clerk user ID to look up internal user
  },
  handler: async (ctx, args) => {
    // Look up internal user by Clerk ID
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerk_id))
      .first();
    
    if (!user) {
      throw new Error("User not found");
    }
    
    const documentId = await ctx.db.insert("ingresos_documentos", {
      ingreso_id: args.ingreso_id,
      proyecto: args.proyecto,
      nombre: args.nombre,
      descripcion: args.descripcion,
      storage_id: args.storage_id,
      type: args.type,
      size: args.size,
      uploaded_at: Date.now(),
      uploaded_by_id: user._id,
      uploaded_by_name: user.name,
    });
    
    return documentId;
  },
});

// Delete ingreso document (also deletes from storage)
export const remove = mutation({
  args: { id: v.id("ingresos_documentos") },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.id);
    if (!doc) {
      throw new Error("Document not found");
    }
    
    // Delete from storage
    await ctx.storage.delete(doc.storage_id);
    
    // Delete document record
    await ctx.db.delete(args.id);
    
    return { success: true };
  },
});

// Delete all documents for an ingreso (called when ingreso is deleted)
export const removeByIngreso = mutation({
  args: { ingreso_id: v.id("ingresos") },
  handler: async (ctx, args) => {
    const documents = await ctx.db
      .query("ingresos_documentos")
      .withIndex("by_ingreso", (q) => q.eq("ingreso_id", args.ingreso_id))
      .collect();
    
    // Delete each document from storage and database
    for (const doc of documents) {
      await ctx.storage.delete(doc.storage_id);
      await ctx.db.delete(doc._id);
    }
    
    return { success: true, deletedCount: documents.length };
  },
});
