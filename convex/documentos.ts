import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import {
    assertCanWrite,
    checkDesarrolloAccess,
    getCurrentUserOrThrow,
    hasAdminAccess,
} from "./permissions";
import { markLinkedInvoiceStaleForDocument } from "./invoiceIntegrity";

async function assertSalesProjectAccess(ctx: QueryCtx | MutationCtx, projectId: Doc<"sales_projects">["_id"]) {
    const user = await getCurrentUserOrThrow(ctx);
    if (hasAdminAccess(user) || user.allowed_sales_projects?.includes(projectId)) return user;
    throw new Error("No tienes acceso al proyecto de ventas.");
}

async function assertDocumentAccess(ctx: QueryCtx | MutationCtx, document: Doc<"documentos">) {
    if (document.proyecto) {
        if (!(await checkDesarrolloAccess(ctx, document.proyecto))) throw new Error("No tienes acceso al documento.");
        return;
    }
    if (document.sales_proyecto) {
        await assertSalesProjectAccess(ctx, document.sales_proyecto);
        return;
    }
    const user = await getCurrentUserOrThrow(ctx);
    if (!hasAdminAccess(user)) throw new Error("No tienes acceso al documento.");
}

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

const normalizeFolderKey = (value: string) => normalize(value).replace(/\s+/g, " ");

const getOrCreateFolder = async (
    ctx: MutationCtx,
    folderSiblingsByParent: Map<string, Doc<"document_folders">[]>,
    nombre: string,
    parent_folder_id?: Doc<"document_folders">["_id"]
) => {
    const key = normalizeFolderKey(nombre);
    const parentKey = parent_folder_id || "root";
    let siblingFolders = folderSiblingsByParent.get(parentKey);

    if (!siblingFolders) {
        siblingFolders = await ctx.db
            .query("document_folders")
            .withIndex("by_parent_folder", (q) => q.eq("parent_folder_id", parent_folder_id))
            .collect();
        folderSiblingsByParent.set(parentKey, siblingFolders);
    }

    const existingFolder = siblingFolders.find(
        (folder) =>
            normalizeFolderKey(folder.nombre) === key &&
            folder.parent_folder_id === parent_folder_id
    );

    if (existingFolder) {
        return { folderId: existingFolder._id, created: false };
    }

    const now = Date.now();
    const folderId = await ctx.db.insert("document_folders", {
        nombre,
        parent_folder_id,
        created_at: now,
    });

    siblingFolders.push({
        _id: folderId,
        _creationTime: now,
        nombre,
        parent_folder_id,
        created_at: now,
    });

    return { folderId, created: true };
};

export const getFileManagerMetadata = query({
    handler: async (ctx) => {
        const [folders, proyectos, salesProjects] = await Promise.all([
            ctx.db.query("document_folders").collect(),
            ctx.db.query("desarrollos").collect(),
            ctx.db.query("sales_projects").collect(),
        ]);

        return {
            folders,
            documentCountsByFolder: {},
            proyectos,
            salesProjects,
        };
    },
});

export const getProjectFileManagerMetadata = query({
    args: {
        proyecto: v.id("desarrollos"),
    },
    handler: async (ctx, args) => {
        const [projectFolders, documents, proyectos, salesProjects] = await Promise.all([
            ctx.db
                .query("document_folders")
                .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto))
                .collect(),
            ctx.db
                .query("documentos")
                .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto))
                .collect(),
            ctx.db.query("desarrollos").collect(),
            ctx.db.query("sales_projects").collect(),
        ]);

        const folderById = new Map<string, Doc<"document_folders">>();
        const includeFolderIds = new Set<string>();

        projectFolders.forEach((folder) => {
            folderById.set(folder._id, folder);
            includeFolderIds.add(folder._id);
        });

        for (const doc of documents) {
            let folderId = doc.folder_id;

            while (folderId) {
                includeFolderIds.add(folderId);
                let folder = folderById.get(folderId);

                if (!folder) {
                    folder = (await ctx.db.get(folderId)) || undefined;
                    if (!folder) break;
                    folderById.set(folder._id, folder);
                }

                folderId = folder.parent_folder_id;
            }
        }

        const documentCountsByFolder = documents.reduce<Record<string, number>>((counts, doc) => {
            const key = doc.folder_id || "root";
            counts[key] = (counts[key] || 0) + 1;
            return counts;
        }, {});

        return {
            folders: Array.from(includeFolderIds)
                .map((folderId) => folderById.get(folderId))
                .filter(Boolean),
            documentCountsByFolder,
            proyectos,
            salesProjects,
        };
    },
});

export const organizeDocumentsByProjectAndType = mutation({
    args: {
        paginationOpts: paginationOptsValidator,
    },
    handler: async (ctx, args) => {
        const documentsPage = await ctx.db
            .query("documentos")
            .order("asc")
            .paginate(args.paginationOpts);
        const projectNameById = new Map<string, string>();
        const folderSiblingsByParent = new Map<string, Doc<"document_folders">[]>();
        let createdFolders = 0;
        let movedDocuments = 0;

        for (const doc of documentsPage.page) {
            let projectName = "Sin proyecto";

            if (doc.proyecto) {
                projectName = projectNameById.get(doc.proyecto) || "";
                if (!projectName) {
                    const project = await ctx.db.get(doc.proyecto);
                    projectName = project?.nombre || "Proyecto sin nombre";
                    projectNameById.set(doc.proyecto, projectName);
                }
            } else if (doc.sales_proyecto) {
                projectName = projectNameById.get(doc.sales_proyecto) || "";
                if (!projectName) {
                    const project = await ctx.db.get(doc.sales_proyecto);
                    projectName = project?.nombre ? `${project.nombre} (Ventas)` : "Proyecto sin nombre";
                    projectNameById.set(doc.sales_proyecto, projectName);
                }
            }

            const typeName = doc.type?.trim() || "Sin tipo";

            const projectFolder = await getOrCreateFolder(ctx, folderSiblingsByParent, projectName);
            if (projectFolder.created) createdFolders += 1;

            const typeFolder = await getOrCreateFolder(ctx, folderSiblingsByParent, typeName, projectFolder.folderId);
            if (typeFolder.created) createdFolders += 1;

            if (doc.folder_id !== typeFolder.folderId) {
                await ctx.db.patch(doc._id, { folder_id: typeFolder.folderId });
                movedDocuments += 1;
            }
        }

        return {
            createdFolders,
            isDone: documentsPage.isDone,
            movedDocuments,
            processedDocuments: documentsPage.page.length,
            continueCursor: documentsPage.continueCursor,
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
        const transaccionIds = pageItems.reduce<NonNullable<Doc<"documentos">["transaccion_id"]>[]>(
            (ids, doc) => {
                if (doc.transaccion_id && !ids.includes(doc.transaccion_id)) {
                    ids.push(doc.transaccion_id);
                }
                return ids;
            },
            []
        );

        const [enrichedPage, transacciones] = await Promise.all([
            Promise.all(pageItems.map((doc) => enrichDocumentUrl(ctx, doc))),
            Promise.all(transaccionIds.map((id) => ctx.db.get(id))),
        ]);

        return {
            documents: enrichedPage,
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


// Get documents by transaction (with URLs)
export const getByTransaccion = query({
    args: {
        transaccion_id: v.id("transacciones"),
    },
    handler: async (ctx, args) => {
        const transaction = await ctx.db.get(args.transaccion_id);
        if (!transaction || !(await checkDesarrolloAccess(ctx, transaction.proyecto))) {
            throw new Error("No tienes acceso a la transacción.");
        }
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
        if (!(await checkDesarrolloAccess(ctx, args.proyecto_id))) throw new Error("No tienes acceso al proyecto.");
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
        if (!(await checkDesarrolloAccess(ctx, args.proyecto_id))) throw new Error("No tienes acceso al proyecto.");
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
        const document = await ctx.db.get(args.id);
        if (!document) return null;
        await assertDocumentAccess(ctx, document);
        return document;
    },
});

// Get file URL from storage
export const getUrl = query({
    args: {
        storage_id: v.id("_storage"),
    },
    handler: async (ctx, args) => {
        const document = await ctx.db
            .query("documentos")
            .withIndex("by_storage", (q) => q.eq("storage_id", args.storage_id))
            .first();
        if (!document) throw new Error("Documento no encontrado.");
        await assertDocumentAccess(ctx, document);
        return await ctx.storage.getUrl(args.storage_id);
    },
});

// Generate upload URL for file upload
export const generateUploadUrl = mutation({
    handler: async (ctx) => {
        await assertCanWrite(ctx);
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
        mime_type: v.optional(v.string()),
        proyecto: v.optional(v.id("desarrollos")),
        transaccion_id: v.optional(v.id("transacciones")),
        sales_proyecto: v.optional(v.id("sales_projects")),
        sales_transaccion_id: v.optional(v.id("sales_transacciones")),
        folder_id: v.optional(v.id("document_folders")),
    },
    handler: async (ctx, args) => {
        await assertCanWrite(ctx);
        if (args.proyecto && !(await checkDesarrolloAccess(ctx, args.proyecto))) {
            throw new Error("No tienes acceso al proyecto.");
        }
        if (args.transaccion_id) {
            const transaction = await ctx.db.get(args.transaccion_id);
            if (!transaction || !args.proyecto || transaction.proyecto !== args.proyecto) {
                throw new Error("La transacción no pertenece al proyecto del documento.");
            }
        }
        if (args.sales_proyecto) await assertSalesProjectAccess(ctx, args.sales_proyecto);
        if (args.sales_transaccion_id) {
            const transaction = await ctx.db.get(args.sales_transaccion_id);
            if (!transaction || !args.sales_proyecto || transaction.sales_proyecto !== args.sales_proyecto) {
                throw new Error("La transacción no pertenece al proyecto de ventas del documento.");
            }
        }
        const documento = await ctx.db.insert("documentos", {
            nombre: args.nombre,
            descripcion: args.descripcion,
            storage_id: args.storage_id,
            type: args.type,
            size: args.size,
            mime_type: args.mime_type,
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
        await assertCanWrite(ctx);
        if (!(await checkDesarrolloAccess(ctx, args.proyecto))) throw new Error("No tienes acceso al proyecto.");
        const transaction = await ctx.db.get(args.transaccion_id);
        if (!transaction || transaction.proyecto !== args.proyecto) throw new Error("La transacción no pertenece al proyecto.");
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
        await assertCanWrite(ctx);
        const existing = await ctx.db.get(args.id);
        if (!existing) throw new Error("Documento no encontrado.");
        await assertDocumentAccess(ctx, existing);
        if (args.proyecto && !(await checkDesarrolloAccess(ctx, args.proyecto))) throw new Error("No tienes acceso al proyecto destino.");
        const targetProject = args.proyecto || existing.proyecto;
        const targetTransactionId = args.transaccion_id || existing.transaccion_id;
        if (targetTransactionId) {
            const transaction = await ctx.db.get(targetTransactionId);
            if (!transaction || !targetProject || transaction.proyecto !== targetProject) {
                throw new Error("La transacción no pertenece al proyecto del documento.");
            }
        }
        const sourceRelationshipChanged = Boolean(
            existing.invoice_id && (
                (args.proyecto !== undefined && args.proyecto !== existing.proyecto) ||
                (args.transaccion_id !== undefined && args.transaccion_id !== existing.transaccion_id) ||
                (args.type !== undefined && args.type !== existing.type) ||
                (args.nombre !== undefined && args.nombre !== existing.nombre) ||
                (args.image !== undefined && args.image !== existing.image)
            )
        );
        const { id, ...updateData } = args;
        
        // Filter out undefined values
        const cleanUpdateData = Object.fromEntries(
            Object.entries(updateData).filter(([, value]) => value !== undefined)
        );
        
        const result = await ctx.db.patch(id, cleanUpdateData);
        if (sourceRelationshipChanged) await markLinkedInvoiceStaleForDocument(ctx, existing._id);
        return result;
    },
});

export const createFolder = mutation({
    args: {
        nombre: v.string(),
        parent_folder_id: v.optional(v.id("document_folders")),
        proyecto: v.optional(v.id("desarrollos")),
        sales_proyecto: v.optional(v.id("sales_projects")),
    },
    handler: async (ctx, args) => {
        await assertCanWrite(ctx);
        if (args.proyecto && !(await checkDesarrolloAccess(ctx, args.proyecto))) throw new Error("No tienes acceso al proyecto.");
        if (args.sales_proyecto) await assertSalesProjectAccess(ctx, args.sales_proyecto);
        const name = args.nombre.trim();
        if (!name) throw new Error("Folder name is required");

        return await ctx.db.insert("document_folders", {
            nombre: name,
            parent_folder_id: args.parent_folder_id,
            proyecto: args.proyecto,
            sales_proyecto: args.sales_proyecto,
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
        await assertCanWrite(ctx);
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
        await assertCanWrite(ctx);
        const document = await ctx.db.get(args.id);
        if (!document) throw new Error("Documento no encontrado.");
        await assertDocumentAccess(ctx, document);
        return await ctx.db.patch(args.id, { folder_id: args.folder_id });
    },
});

export const renameDocument = mutation({
    args: {
        id: v.id("documentos"),
        nombre: v.string(),
    },
    handler: async (ctx, args) => {
        await assertCanWrite(ctx);
        const document = await ctx.db.get(args.id);
        if (!document) throw new Error("Documento no encontrado.");
        await assertDocumentAccess(ctx, document);
        const name = args.nombre.trim();
        if (!name) throw new Error("Document name is required");

        if (name !== document.nombre) {
            await markLinkedInvoiceStaleForDocument(ctx, document._id);
        }
        return await ctx.db.patch(args.id, { nombre: name });
    },
});

export const moveFolder = mutation({
    args: {
        id: v.id("document_folders"),
        parent_folder_id: v.optional(v.id("document_folders")),
    },
    handler: async (ctx, args) => {
        await assertCanWrite(ctx);
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
        await assertCanWrite(ctx);
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
        await assertCanWrite(ctx);
        const documento = await ctx.db.get(args.id);
        if (!documento) {
            throw new Error("Document not found");
        }
        await assertDocumentAccess(ctx, documento);

        await markLinkedInvoiceStaleForDocument(ctx, documento._id);

        await ctx.db.delete(args.id);

        return {
            success: true,
            fileId: documento.image, // Return the Appwrite file ID so it can be deleted from storage
        };
    },
});
