import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { v } from "convex/values";

const enrichDocumentUrl = async (ctx: QueryCtx, doc: Doc<"documentos">) => {
    if (doc.storage_id) {
        const url = await ctx.storage.getUrl(doc.storage_id);
        return { ...doc, url };
    }

    return { ...doc, url: doc.image || null };
};

// Get all documents (with URLs)
export const getAll = query(async (ctx) => {
    const documents = await ctx.db.query("documentos").collect();
    
    // Enrich with URLs for Convex storage files
    return await Promise.all(documents.map((doc) => enrichDocumentUrl(ctx, doc)));
});

export const getFileManager = query({
    args: {
        folder_id: v.optional(v.id("document_folders")),
    },
    handler: async (ctx, args) => {
        const [documents, folders, proyectos, salesProjects] = await Promise.all([
            ctx.db
                .query("documentos")
                .withIndex("by_folder", (q) => q.eq("folder_id", args.folder_id))
                .collect(),
            ctx.db.query("document_folders").collect(),
            ctx.db.query("desarrollos").collect(),
            ctx.db.query("sales_projects").collect(),
        ]);

        const documentos = await Promise.all(documents.map((doc) => enrichDocumentUrl(ctx, doc)));

        return {
            documentos,
            folders,
            proyectos,
            salesProjects,
        };
    },
});

const normalize = (value: string) => value.toLowerCase().trim();

export const getFileManagerMetadata = query({
    handler: async (ctx) => {
        const [folders, proyectos, salesProjects] = await Promise.all([
            ctx.db.query("document_folders").collect(),
            ctx.db.query("desarrollos").collect(),
            ctx.db.query("sales_projects").collect(),
        ]);

        return {
            folders,
            proyectos,
            salesProjects,
        };
    },
});

export const listFileManagerDocuments = query({
    args: {
        folder_id: v.optional(v.id("document_folders")),
        proyecto: v.optional(v.id("desarrollos")),
        sales_proyecto: v.optional(v.id("sales_projects")),
        type: v.optional(v.string()),
        search: v.optional(v.string()),
        page: v.number(),
        pageSize: v.number(),
    },
    handler: async (ctx, args) => {
        const search = normalize(args.search || "");
        const page = Math.max(args.page, 1);
        const pageSize = Math.min(Math.max(args.pageSize, 1), 100);

        let queryBuilder;

        if (args.proyecto) {
            queryBuilder = ctx.db
                .query("documentos")
                .withIndex("by_folder_proyecto", (q) =>
                    q.eq("folder_id", args.folder_id).eq("proyecto", args.proyecto)
                );
        } else if (args.sales_proyecto) {
            queryBuilder = ctx.db
                .query("documentos")
                .withIndex("by_folder_sales_proyecto", (q) =>
                    q.eq("folder_id", args.folder_id).eq("sales_proyecto", args.sales_proyecto)
                );
        } else if (args.type) {
            const type = args.type;
            queryBuilder = ctx.db
                .query("documentos")
                .withIndex("by_folder_type", (q) =>
                    q.eq("folder_id", args.folder_id).eq("type", type)
                );
        } else {
            queryBuilder = ctx.db
                .query("documentos")
                .withIndex("by_folder_uploaded", (q) => q.eq("folder_id", args.folder_id));
        }

        if (args.type && (args.proyecto || args.sales_proyecto)) {
            queryBuilder = queryBuilder.filter((q: any) => q.eq(q.field("type"), args.type));
        }

        const documents = await queryBuilder
            .order("desc")
            .collect();

        const filteredDocuments = documents.filter((doc) => {
            if (args.type && doc.type !== args.type) return false;
            if (!search) return true;

            return normalize(`${doc.nombre} ${doc.type} ${doc.descripcion || ""}`).includes(search);
        });

        const total = filteredDocuments.length;
        const totalSize = filteredDocuments.reduce((sum, doc) => sum + (doc.size || 0), 0);
        const documentTypes = Array.from(new Set(documents.map((doc) => doc.type).filter(Boolean))).sort();
        const totalPages = Math.max(Math.ceil(total / pageSize), 1);
        const safePage = Math.min(page, totalPages);
        const start = (safePage - 1) * pageSize;
        const pageItems = filteredDocuments.slice(start, start + pageSize);

        const enrichedPage = await Promise.all(pageItems.map((doc) => enrichDocumentUrl(ctx, doc)));

        return {
            documents: enrichedPage,
            total,
            totalSize,
            documentTypes,
            page: safePage,
            pageSize,
            totalPages,
        };
    },
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
        return await Promise.all(documents.map((doc) => enrichDocumentUrl(ctx, doc)));
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
        return await Promise.all(documents.map((doc) => enrichDocumentUrl(ctx, doc)));
    },
});

export const getByProyectoPaginated = query({
    args: {
        proyecto_id: v.id("desarrollos"),
        search: v.optional(v.string()),
        page: v.number(),
        pageSize: v.number(),
    },
    handler: async (ctx, args) => {
        const search = normalize(args.search || "");
        const page = Math.max(args.page, 1);
        const pageSize = Math.min(Math.max(args.pageSize, 1), 100);

        const documents = await ctx.db
            .query("documentos")
            .withIndex("by_proyecto_uploaded", (q) => q.eq("proyecto", args.proyecto_id))
            .order("desc")
            .collect();

        const filteredDocuments = documents.filter((doc) => {
            if (!search) return true;
            return normalize(`${doc.nombre} ${doc.type} ${doc.descripcion || ""}`).includes(search);
        });

        const total = filteredDocuments.length;
        const totalSize = filteredDocuments.reduce((sum, doc) => sum + (doc.size || 0), 0);
        const documentTypes = Array.from(new Set(documents.map((doc) => doc.type).filter(Boolean))).sort();
        const totalPages = Math.max(Math.ceil(total / pageSize), 1);
        const safePage = Math.min(page, totalPages);
        const start = (safePage - 1) * pageSize;
        const pageItems = filteredDocuments.slice(start, start + pageSize);

        const transaccionIds = pageItems.reduce<NonNullable<Doc<"documentos">["transaccion_id"]>[]>(
            (ids, doc) => {
                if (doc.transaccion_id && !ids.includes(doc.transaccion_id)) {
                    ids.push(doc.transaccion_id);
                }
                return ids;
            },
            []
        );

        const [documentos, transacciones] = await Promise.all([
            Promise.all(pageItems.map((doc) => enrichDocumentUrl(ctx, doc))),
            Promise.all(transaccionIds.map((id) => ctx.db.get(id))),
        ]);

        return {
            documentos,
            transacciones: transacciones.filter(Boolean),
            total,
            totalSize,
            documentTypes,
            page: safePage,
            pageSize,
            totalPages,
        };
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
        folder_id: v.optional(v.id("document_folders")),
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
            folder_id: args.folder_id,
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
        folder_id: v.optional(v.id("document_folders")),
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

export const createFolder = mutation({
    args: {
        nombre: v.string(),
        parent_folder_id: v.optional(v.id("document_folders")),
    },
    handler: async (ctx, args) => {
        const name = args.nombre.trim();
        if (!name) throw new Error("Folder name is required");

        return await ctx.db.insert("document_folders", {
            nombre: name,
            parent_folder_id: args.parent_folder_id,
            created_at: Date.now(),
        });
    },
});

export const renameFolder = mutation({
    args: {
        id: v.id("document_folders"),
        nombre: v.string(),
    },
    handler: async (ctx, args) => {
        const name = args.nombre.trim();
        if (!name) throw new Error("Folder name is required");

        return await ctx.db.patch(args.id, {
            nombre: name,
            updated_at: Date.now(),
        });
    },
});

export const moveDocument = mutation({
    args: {
        id: v.id("documentos"),
        folder_id: v.optional(v.id("document_folders")),
    },
    handler: async (ctx, args) => {
        return await ctx.db.patch(args.id, { folder_id: args.folder_id });
    },
});

export const renameDocument = mutation({
    args: {
        id: v.id("documentos"),
        nombre: v.string(),
    },
    handler: async (ctx, args) => {
        const name = args.nombre.trim();
        if (!name) throw new Error("Document name is required");

        return await ctx.db.patch(args.id, { nombre: name });
    },
});

export const moveFolder = mutation({
    args: {
        id: v.id("document_folders"),
        parent_folder_id: v.optional(v.id("document_folders")),
    },
    handler: async (ctx, args) => {
        if (args.id === args.parent_folder_id) {
            throw new Error("A folder cannot be moved into itself");
        }

        const folders = await ctx.db.query("document_folders").collect();
        let nextParent = args.parent_folder_id;

        while (nextParent) {
            if (nextParent === args.id) {
                throw new Error("A folder cannot be moved into one of its children");
            }

            const parent = folders.find((folder) => folder._id === nextParent);
            nextParent = parent?.parent_folder_id;
        }

        return await ctx.db.patch(args.id, {
            parent_folder_id: args.parent_folder_id,
            updated_at: Date.now(),
        });
    },
});

export const deleteFolder = mutation({
    args: {
        id: v.id("document_folders"),
    },
    handler: async (ctx, args) => {
        const childFolder = await ctx.db
            .query("document_folders")
            .withIndex("by_parent_folder", (q) => q.eq("parent_folder_id", args.id))
            .first();
        const childDocument = await ctx.db
            .query("documentos")
            .withIndex("by_folder", (q) => q.eq("folder_id", args.id))
            .first();

        if (childFolder || childDocument) {
            throw new Error("Folder must be empty before deleting");
        }

        await ctx.db.delete(args.id);
        return { success: true };
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
