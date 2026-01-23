import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Generate upload URL for requisicion documents
export const generateUploadUrl = mutation(async (ctx) => {
    return await ctx.storage.generateUploadUrl();
});

// Get document URL by storage ID
export const getDocumentUrl = query({
    args: { storageId: v.id("_storage") },
    handler: async (ctx, args) => {
        return await ctx.storage.getUrl(args.storageId);
    },
});

// Delete a requisicion document
export const deleteDocument = mutation({
    args: { id: v.id("requisicion_documentos") },
    handler: async (ctx, args) => {
        const doc = await ctx.db.get(args.id);
        if (doc) {
            // Delete from storage
            await ctx.storage.delete(doc.storage_id);
            // Delete record
            await ctx.db.delete(args.id);
        }
        return { success: true };
    },
});

// Get all requisiciones for a project
export const getByProyecto = query({
    args: {
        proyecto: v.id("desarrollos"),
    },
    handler: async (ctx, args) => {
        const requisiciones = await ctx.db
            .query("requisiciones")
            .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto))
            .collect();
        
        // Enrich with items, proveedor, and documents data
        const enriched = await Promise.all(
            requisiciones.map(async (req) => {
                const items = await ctx.db
                    .query("requisicion_items")
                    .withIndex("by_requisicion", (q) => q.eq("requisicion_id", req._id))
                    .collect();
                
                const proveedor = req.proveedor_id 
                    ? await ctx.db.get(req.proveedor_id)
                    : null;
                
                // Fetch documents with URLs
                const documentos = await ctx.db
                    .query("requisicion_documentos")
                    .withIndex("by_requisicion", (q) => q.eq("requisicion_id", req._id))
                    .collect();
                
                const enrichedDocumentos = await Promise.all(
                    documentos.map(async (doc) => {
                        const url = await ctx.storage.getUrl(doc.storage_id);
                        return { ...doc, url };
                    })
                );
                
                return {
                    ...req,
                    items,
                    proveedor,
                    documentos: enrichedDocumentos,
                };
            })
        );
        
        return enriched;
    },
});

// Get requisiciones by status
export const getByStatus = query({
    args: {
        proyecto: v.id("desarrollos"),
        status: v.string(),
    },
    handler: async (ctx, args) => {
        const requisiciones = await ctx.db
            .query("requisiciones")
            .withIndex("by_proyecto_status", (q) => 
                q.eq("proyecto", args.proyecto).eq("status", args.status)
            )
            .collect();
        
        const enriched = await Promise.all(
            requisiciones.map(async (req) => {
                const items = await ctx.db
                    .query("requisicion_items")
                    .withIndex("by_requisicion", (q) => q.eq("requisicion_id", req._id))
                    .collect();
                
                return { ...req, items };
            })
        );
        
        return enriched;
    },
});

// Get single requisicion by ID
export const getById = query({
    args: {
        id: v.id("requisiciones"),
    },
    handler: async (ctx, args) => {
        const requisicion = await ctx.db.get(args.id);
        if (!requisicion) return null;
        
        const items = await ctx.db
            .query("requisicion_items")
            .withIndex("by_requisicion", (q) => q.eq("requisicion_id", args.id))
            .collect();
        
        const documentos = await ctx.db
            .query("requisicion_documentos")
            .withIndex("by_requisicion", (q) => q.eq("requisicion_id", args.id))
            .collect();
        
        // Enrich documents with URLs
        const enrichedDocuments = await Promise.all(
            documentos.map(async (doc) => {
                const url = await ctx.storage.getUrl(doc.storage_id);
                return { ...doc, url };
            })
        );
        
        const proveedor = requisicion.proveedor_id
            ? await ctx.db.get(requisicion.proveedor_id)
            : null;
        
        // Enrich items with partida data
        const enrichedItems = await Promise.all(
            items.map(async (item) => {
                const partida = await ctx.db.get(item.partida_id);
                return { ...item, partida };
            })
        );
        
        return {
            ...requisicion,
            items: enrichedItems,
            documentos: enrichedDocuments,
            proveedor,
        };
    },
});

// Create new requisicion with items
export const create = mutation({
    args: {
        proyecto: v.id("desarrollos"),
        tipo: v.string(),
        solicitante_id: v.id("users"),
        solicitante_nombre: v.string(),
        proveedor_id: v.optional(v.id("proveedores")),
        fecha_solicitud: v.string(),
        fecha_entrega: v.optional(v.string()),
        descripcion: v.optional(v.string()),
        items: v.array(v.object({
            partida_id: v.id("partidas"),
            familia: v.string(),
            sub_partida: v.optional(v.string()),
            cantidad: v.number(),
            unidad: v.string(),
            monto: v.optional(v.number()),
        })),
    },
    handler: async (ctx, args) => {
        const { items, ...requisicionData } = args;
        
        // Create requisicion with auto "En proceso" status
        const requisicionId = await ctx.db.insert("requisiciones", {
            ...requisicionData,
            status: "En proceso",
            created_at: Date.now(),
        });
        
        // Create line items
        for (const item of items) {
            await ctx.db.insert("requisicion_items", {
                requisicion_id: requisicionId,
                partida_id: item.partida_id,
                familia: item.familia,
                sub_partida: item.sub_partida,
                cantidad: item.cantidad,
                unidad: item.unidad,
                monto: item.monto,
            });
        }
        
        return requisicionId;
    },
});

// Update requisicion status
export const updateStatus = mutation({
    args: {
        id: v.id("requisiciones"),
        status: v.string(),
    },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.id, {
            status: args.status,
            updated_at: Date.now(),
        });
        return { success: true };
    },
});

// Cancel requisicion
export const cancel = mutation({
    args: {
        id: v.id("requisiciones"),
    },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.id, {
            status: "Cancelado",
            updated_at: Date.now(),
        });
        return { success: true };
    },
});

// Add document to requisicion
export const addDocument = mutation({
    args: {
        requisicion_id: v.id("requisiciones"),
        proyecto: v.id("desarrollos"),
        storage_id: v.id("_storage"),
        nombre: v.string(),
        type: v.string(),
        size: v.number(),
        uploaded_by_id: v.id("users"),
        uploaded_by_name: v.string(),
    },
    handler: async (ctx, args) => {
        return await ctx.db.insert("requisicion_documentos", {
            requisicion_id: args.requisicion_id,
            proyecto: args.proyecto,
            storage_id: args.storage_id,
            nombre: args.nombre,
            type: args.type,
            size: args.size,
            uploaded_at: Date.now(),
            uploaded_by_id: args.uploaded_by_id,
            uploaded_by_name: args.uploaded_by_name,
        });
    },
});

// Update requisicion
export const update = mutation({
    args: {
        id: v.id("requisiciones"),
        tipo: v.optional(v.string()),
        proveedor_id: v.optional(v.id("proveedores")),
        fecha_entrega: v.optional(v.string()),
        descripcion: v.optional(v.string()),
        items: v.optional(v.array(v.object({
            partida_id: v.id("partidas"),
            familia: v.string(),
            sub_partida: v.optional(v.string()),
            cantidad: v.number(),
            unidad: v.string(),
            monto: v.optional(v.number()),
        }))),
    },
    handler: async (ctx, args) => {
        const { id, items, ...updateData } = args;
        
        // Update requisicion data
        await ctx.db.patch(id, {
            ...updateData,
            updated_at: Date.now(),
        });
        
        // If items provided, delete old items and create new ones
        if (items) {
            const oldItems = await ctx.db
                .query("requisicion_items")
                .withIndex("by_requisicion", (q) => q.eq("requisicion_id", id))
                .collect();
            
            for (const item of oldItems) {
                await ctx.db.delete(item._id);
            }
            
            for (const item of items) {
                await ctx.db.insert("requisicion_items", {
                    requisicion_id: id,
                    partida_id: item.partida_id,
                    familia: item.familia,
                    sub_partida: item.sub_partida,
                    cantidad: item.cantidad,
                    unidad: item.unidad,
                    monto: item.monto,
                });
            }
        }
        
        return { success: true };
    },
});

// Delete requisicion and all related items/documents
export const deleteRequisicion = mutation({
    args: {
        id: v.id("requisiciones"),
    },
    handler: async (ctx, args) => {
        // Delete all items
        const items = await ctx.db
            .query("requisicion_items")
            .withIndex("by_requisicion", (q) => q.eq("requisicion_id", args.id))
            .collect();
        
        for (const item of items) {
            await ctx.db.delete(item._id);
        }
        
        // Delete all documents
        const documentos = await ctx.db
            .query("requisicion_documentos")
            .withIndex("by_requisicion", (q) => q.eq("requisicion_id", args.id))
            .collect();
        
        for (const doc of documentos) {
            await ctx.db.delete(doc._id);
        }
        
        // Delete the requisicion
        await ctx.db.delete(args.id);
        
        return { success: true };
    },
});

// Get budget remaining for a partida/familia/sub_partida selection
export const getBudgetRemaining = query({
    args: {
        proyecto: v.id("desarrollos"),
        partida_nombre: v.string(),
        familia: v.optional(v.string()),
        sub_partida: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        // Get partidas matching the selection
        let partidas;
        
        if (args.sub_partida) {
            // Get specific sub_partida (nivel 3)
            partidas = await ctx.db
                .query("partidas")
                .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto))
                .filter((q) => 
                    q.and(
                        q.eq(q.field("nivel"), 3),
                        q.eq(q.field("partida_nombre"), args.partida_nombre),
                        q.eq(q.field("familia"), args.familia),
                        q.eq(q.field("sub_partida"), args.sub_partida)
                    )
                )
                .collect();
        } else if (args.familia) {
            // Get familia level (nivel 2)
            partidas = await ctx.db
                .query("partidas")
                .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto))
                .filter((q) => 
                    q.and(
                        q.eq(q.field("nivel"), 2),
                        q.eq(q.field("partida_nombre"), args.partida_nombre),
                        q.eq(q.field("familia"), args.familia)
                    )
                )
                .collect();
        } else {
            // Get partida level (nivel 1)
            partidas = await ctx.db
                .query("partidas")
                .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto))
                .filter((q) => 
                    q.and(
                        q.eq(q.field("nivel"), 1),
                        q.eq(q.field("nombre"), args.partida_nombre)
                    )
                )
                .collect();
        }
        
        if (partidas.length === 0) {
            return { presupuesto_aprobado: 0, pagado: 0, por_gastar: 0 };
        }
        
        const partida = partidas[0];
        return {
            presupuesto_aprobado: partida.presupuesto_aprobado,
            pagado: partida.pagado,
            por_gastar: partida.por_gastar ?? (partida.presupuesto_aprobado - partida.pagado),
            unidad: partida.unidad,
        };
    },
});
