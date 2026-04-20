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
                const rawItems = await ctx.db
                    .query("requisicion_items")
                    .withIndex("by_requisicion", (q) => q.eq("requisicion_id", req._id))
                    .collect();
                
                // Enrich items with partida budget data
                const items = await Promise.all(
                    rawItems.map(async (item) => {
                        const partida = await ctx.db.get(item.partida_id);
                        return {
                            ...item,
                            precio_unitario: partida?.precio_unitario ?? 0,
                            presupuesto_aprobado: partida?.presupuesto_aprobado ?? 0,
                            pagado: partida?.pagado ?? 0,
                        };
                    })
                );
                
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
        
        // Create requisicion with default statuses
        const requisicionId = await ctx.db.insert("requisiciones", {
            ...requisicionData,
            status: "En proceso",
            status_entrega: "Pendiente",
            status_revision: "Pendiente de revisión",
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
                status_revision: "pendiente",
            });
        }
        
        // Log history with detailed info
        const familias = [...new Set(items.map(i => i.familia))];
        const totalMonto = items.reduce((sum, i) => sum + (i.monto || 0), 0);
        await ctx.db.insert("requisicion_history", {
            proyecto: args.proyecto,
            requisicion_id: requisicionId,
            action: "created",
            new_value: JSON.stringify({
                tipo: args.tipo,
                solicitante: args.solicitante_nombre,
                fecha_solicitud: args.fecha_solicitud,
                items_count: items.length,
                familias,
                total_monto: totalMonto,
                descripcion: args.descripcion || null,
            }),
            changed_by_id: args.solicitante_id,
            changed_by_name: args.solicitante_nombre,
            created_at: Date.now(),
        });
        
        return requisicionId;
    },
});

// Update requisicion payment status
export const updateStatus = mutation({
    args: {
        id: v.id("requisiciones"),
        status: v.string(),
        changed_by_id: v.id("users"),
        changed_by_name: v.string(),
    },
    handler: async (ctx, args) => {
        const requisicion = await ctx.db.get(args.id);
        if (!requisicion) throw new Error("Requisicion not found");
        
        const oldStatus = requisicion.status;
        
        await ctx.db.patch(args.id, {
            status: args.status,
            updated_at: Date.now(),
        });
        
        // Log history with requisicion context
        await ctx.db.insert("requisicion_history", {
            proyecto: requisicion.proyecto,
            requisicion_id: args.id,
            action: "status_changed",
            field_changed: "status",
            old_value: JSON.stringify({
                status: oldStatus,
                solicitante: requisicion.solicitante_nombre,
                tipo: requisicion.tipo,
            }),
            new_value: JSON.stringify({
                status: args.status,
                solicitante: requisicion.solicitante_nombre,
                tipo: requisicion.tipo,
            }),
            changed_by_id: args.changed_by_id,
            changed_by_name: args.changed_by_name,
            created_at: Date.now(),
        });
        
        return { success: true };
    },
});

// Update requisicion delivery status
export const updateStatusEntrega = mutation({
    args: {
        id: v.id("requisiciones"),
        status_entrega: v.string(),
        changed_by_id: v.id("users"),
        changed_by_name: v.string(),
    },
    handler: async (ctx, args) => {
        const requisicion = await ctx.db.get(args.id);
        if (!requisicion) throw new Error("Requisicion not found");
        
        const oldStatusEntrega = requisicion.status_entrega;
        
        await ctx.db.patch(args.id, {
            status_entrega: args.status_entrega,
            updated_at: Date.now(),
        });
        
        // Log history with requisicion context
        await ctx.db.insert("requisicion_history", {
            proyecto: requisicion.proyecto,
            requisicion_id: args.id,
            action: "status_entrega_changed",
            field_changed: "status_entrega",
            old_value: JSON.stringify({
                status_entrega: oldStatusEntrega,
                solicitante: requisicion.solicitante_nombre,
                tipo: requisicion.tipo,
            }),
            new_value: JSON.stringify({
                status_entrega: args.status_entrega,
                solicitante: requisicion.solicitante_nombre,
                tipo: requisicion.tipo,
            }),
            changed_by_id: args.changed_by_id,
            changed_by_name: args.changed_by_name,
            created_at: Date.now(),
        });
        
        return { success: true };
    },
});

// Cancel requisicion
export const cancel = mutation({
    args: {
        id: v.id("requisiciones"),
        changed_by_id: v.id("users"),
        changed_by_name: v.string(),
    },
    handler: async (ctx, args) => {
        const requisicion = await ctx.db.get(args.id);
        if (!requisicion) throw new Error("Requisicion not found");
        
        const oldStatus = requisicion.status;
        
        await ctx.db.patch(args.id, {
            status: "Cancelado",
            updated_at: Date.now(),
        });
        
        // Log history
        await ctx.db.insert("requisicion_history", {
            proyecto: requisicion.proyecto,
            requisicion_id: args.id,
            action: "cancelled",
            field_changed: "status",
            old_value: oldStatus,
            new_value: "Cancelado",
            changed_by_id: args.changed_by_id,
            changed_by_name: args.changed_by_name,
            created_at: Date.now(),
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
        const docId = await ctx.db.insert("requisicion_documentos", {
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
        
        // Log history
        await ctx.db.insert("requisicion_history", {
            proyecto: args.proyecto,
            requisicion_id: args.requisicion_id,
            action: "document_added",
            new_value: args.nombre,
            changed_by_id: args.uploaded_by_id,
            changed_by_name: args.uploaded_by_name,
            created_at: Date.now(),
        });
        
        return docId;
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
        changed_by_id: v.id("users"),
        changed_by_name: v.string(),
    },
    handler: async (ctx, args) => {
        const { id, items, changed_by_id, changed_by_name, ...updateData } = args;
        
        const requisicion = await ctx.db.get(id);
        if (!requisicion) throw new Error("Requisicion not found");
        
        // Fetch old items for comparison
        const oldItems = await ctx.db
            .query("requisicion_items")
            .withIndex("by_requisicion", (q) => q.eq("requisicion_id", id))
            .collect();
        
        // Resolve old proveedor name
        let oldProveedorName: string | null = null;
        if (requisicion.proveedor_id) {
            const oldProv = await ctx.db.get(requisicion.proveedor_id);
            oldProveedorName = oldProv?.razon_social ?? null;
        }
        
        // Resolve new proveedor name
        let newProveedorName: string | null = null;
        if (updateData.proveedor_id) {
            const newProv = await ctx.db.get(updateData.proveedor_id);
            newProveedorName = newProv?.razon_social ?? null;
        }
        
        // Build per-field diffs
        const fieldDiffs: { field: string; old_val: string; new_val: string }[] = [];
        
        if (updateData.tipo && updateData.tipo !== requisicion.tipo) {
            fieldDiffs.push({ field: "tipo", old_val: requisicion.tipo, new_val: updateData.tipo });
        }
        if (updateData.proveedor_id && updateData.proveedor_id !== requisicion.proveedor_id) {
            fieldDiffs.push({ field: "proveedor", old_val: oldProveedorName || "Sin proveedor", new_val: newProveedorName || "Sin proveedor" });
        }
        if (updateData.fecha_entrega && updateData.fecha_entrega !== requisicion.fecha_entrega) {
            fieldDiffs.push({ field: "fecha_entrega", old_val: requisicion.fecha_entrega || "Sin fecha", new_val: updateData.fecha_entrega });
        }
        if (updateData.descripcion !== undefined && updateData.descripcion !== requisicion.descripcion) {
            fieldDiffs.push({ field: "descripcion", old_val: requisicion.descripcion || "Sin descripción", new_val: updateData.descripcion || "Sin descripción" });
        }
        if (items) {
            // Build readable items summary
            const oldItemsSummary = oldItems.map(i => `${i.familia}${i.sub_partida ? ` > ${i.sub_partida}` : ""}: ${i.cantidad} ${i.unidad}${i.monto ? ` ($${i.monto.toLocaleString()})` : ""}`).join("; ");
            const newItemsSummary = items.map(i => `${i.familia}${i.sub_partida ? ` > ${i.sub_partida}` : ""}: ${i.cantidad} ${i.unidad}${i.monto ? ` ($${i.monto.toLocaleString()})` : ""}`).join("; ");
            fieldDiffs.push({ field: "items", old_val: oldItemsSummary || "Sin items", new_val: newItemsSummary });
        }
        
        // Check if this is a re-submission after review
        const wasReviewed = requisicion.status_revision === "Rechazada" || requisicion.status_revision === "Parcialmente Aprobada";
        
        // Update requisicion data
        const patchData: Record<string, unknown> = {
            ...updateData,
            updated_at: Date.now(),
        };
        
        // Reset review fields on re-submission
        if (wasReviewed) {
            patchData.status_revision = "Pendiente de revisión";
            patchData.nota_revision = undefined;
            patchData.revisado_por_id = undefined;
            patchData.revisado_por_nombre = undefined;
            patchData.revisado_at = undefined;
        }
        
        await ctx.db.patch(id, patchData);
        
        // If items provided, delete old items and create new ones
        if (items) {
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
                    status_revision: "pendiente",
                });
            }
        } else if (wasReviewed) {
            // Reset item review status even if items weren't changed
            for (const item of oldItems) {
                await ctx.db.patch(item._id, {
                    status_revision: "pendiente",
                    cantidad_aprobada: undefined,
                    nota_item: undefined,
                });
            }
        }
        
        // Log one history entry per changed field
        if (fieldDiffs.length > 0) {
            for (const diff of fieldDiffs) {
                await ctx.db.insert("requisicion_history", {
                    proyecto: requisicion.proyecto,
                    requisicion_id: id,
                    action: "updated",
                    field_changed: diff.field,
                    old_value: diff.old_val,
                    new_value: diff.new_val,
                    changed_by_id: changed_by_id,
                    changed_by_name: changed_by_name,
                    created_at: Date.now(),
                });
            }
        }
        
        // Log re-submission history
        if (wasReviewed) {
            await ctx.db.insert("requisicion_history", {
                proyecto: requisicion.proyecto,
                requisicion_id: id,
                action: "resubmitted",
                old_value: JSON.stringify({
                    previous_status_revision: requisicion.status_revision,
                    nota_revision: requisicion.nota_revision,
                    solicitante: requisicion.solicitante_nombre,
                    tipo: requisicion.tipo,
                }),
                new_value: JSON.stringify({
                    status_revision: "Pendiente de revisión",
                    solicitante: requisicion.solicitante_nombre,
                    tipo: requisicion.tipo,
                }),
                changed_by_id: changed_by_id,
                changed_by_name: changed_by_name,
                created_at: Date.now(),
            });
        }
        
        return { success: true };
    },
});

// Delete requisicion and all related items/documents
export const deleteRequisicion = mutation({
    args: {
        id: v.id("requisiciones"),
        changed_by_id: v.id("users"),
        changed_by_name: v.string(),
    },
    handler: async (ctx, args) => {
        const requisicion = await ctx.db.get(args.id);
        if (!requisicion) throw new Error("Requisicion not found");
        
        // Log history before deletion
        await ctx.db.insert("requisicion_history", {
            proyecto: requisicion.proyecto,
            requisicion_id: args.id,
            action: "deleted",
            old_value: JSON.stringify({
                tipo: requisicion.tipo,
                status: requisicion.status,
                solicitante_nombre: requisicion.solicitante_nombre,
            }),
            changed_by_id: args.changed_by_id,
            changed_by_name: args.changed_by_name,
            created_at: Date.now(),
        });
        
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
        
        // Delete all history entries for this requisicion
        const historyEntries = await ctx.db
            .query("requisicion_history")
            .withIndex("by_requisicion", (q) => q.eq("requisicion_id", args.id))
            .collect();
        
        for (const entry of historyEntries) {
            await ctx.db.delete(entry._id);
        }
        
        // Delete the requisicion
        await ctx.db.delete(args.id);
        
        return { success: true };
    },
});

// Review requisicion - Finance/Admin approve, partially approve, or reject
export const reviewRequisicion = mutation({
    args: {
        id: v.id("requisiciones"),
        reviewer_id: v.id("users"),
        reviewer_name: v.string(),
        nota_revision: v.optional(v.string()),
        items: v.array(v.object({
            item_id: v.id("requisicion_items"),
            status_revision: v.string(), // "aprobado" | "rechazado"
            cantidad_aprobada: v.optional(v.number()),
            nota_item: v.optional(v.string()),
        })),
    },
    handler: async (ctx, args) => {
        const requisicion = await ctx.db.get(args.id);
        if (!requisicion) throw new Error("Requisicion not found");
        
        // Patch each item with review decision
        for (const itemDecision of args.items) {
            const item = await ctx.db.get(itemDecision.item_id);
            if (!item) continue;
            
            await ctx.db.patch(itemDecision.item_id, {
                status_revision: itemDecision.status_revision,
                cantidad_aprobada: itemDecision.status_revision === "aprobado"
                    ? (itemDecision.cantidad_aprobada ?? item.cantidad)
                    : undefined,
                nota_item: itemDecision.nota_item,
            });
        }
        
        // Compute overall status_revision
        const approvedCount = args.items.filter(i => i.status_revision === "aprobado").length;
        const rejectedCount = args.items.filter(i => i.status_revision === "rechazado").length;
        const totalCount = args.items.length;
        
        let overallStatus: string;
        if (approvedCount === totalCount) {
            // Check if any quantities were modified
            let hasModifiedQty = false;
            for (const itemDecision of args.items) {
                if (itemDecision.cantidad_aprobada !== undefined) {
                    const item = await ctx.db.get(itemDecision.item_id);
                    if (item && itemDecision.cantidad_aprobada !== item.cantidad) {
                        hasModifiedQty = true;
                        break;
                    }
                }
            }
            overallStatus = hasModifiedQty ? "Parcialmente Aprobada" : "Aprobada";
        } else if (rejectedCount === totalCount) {
            overallStatus = "Rechazada";
        } else {
            overallStatus = "Parcialmente Aprobada";
        }
        
        // Update requisicion with review result
        await ctx.db.patch(args.id, {
            status_revision: overallStatus,
            nota_revision: args.nota_revision,
            revisado_por_id: args.reviewer_id,
            revisado_por_nombre: args.reviewer_name,
            revisado_at: Date.now(),
            updated_at: Date.now(),
        });
        
        // Fetch items for history details
        const allItems = await ctx.db
            .query("requisicion_items")
            .withIndex("by_requisicion", (q) => q.eq("requisicion_id", args.id))
            .collect();
        
        // Build detailed history
        const itemDetails = allItems.map(item => {
            const decision = args.items.find(d => d.item_id === item._id);
            return {
                familia: item.familia,
                sub_partida: item.sub_partida,
                cantidad_solicitada: item.cantidad,
                cantidad_aprobada: item.cantidad_aprobada,
                unidad: item.unidad,
                monto: item.monto,
                status_revision: item.status_revision,
                nota_item: decision?.nota_item,
            };
        });
        
        await ctx.db.insert("requisicion_history", {
            proyecto: requisicion.proyecto,
            requisicion_id: args.id,
            action: "reviewed",
            new_value: JSON.stringify({
                status_revision: overallStatus,
                nota_revision: args.nota_revision,
                solicitante: requisicion.solicitante_nombre,
                tipo: requisicion.tipo,
                items_approved: approvedCount,
                items_rejected: rejectedCount,
                items_total: totalCount,
                items: itemDetails,
            }),
            old_value: JSON.stringify({
                status_revision: requisicion.status_revision,
                solicitante: requisicion.solicitante_nombre,
                tipo: requisicion.tipo,
            }),
            changed_by_id: args.reviewer_id,
            changed_by_name: args.reviewer_name,
            created_at: Date.now(),
        });
        
        return { success: true, status_revision: overallStatus };
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
