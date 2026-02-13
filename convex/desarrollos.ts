import { query, mutation as rawMutation } from "./_generated/server";
import { mutation } from "./functions";
import { v } from "convex/values";
import { getUserDesarrollos } from "./permissions";

// Get all projects (filtered by user permissions)
export const getAll = query(async (ctx) => {
    // If not authenticated, return all (for backward compatibility during migration)
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
        return await ctx.db.query("desarrollos").collect();
    }

    // Return only desarrollos the user has access to
    return await getUserDesarrollos(ctx);
});

// Get all projects with their metrics
export const getAllWithMetrics = query(async (ctx) => {
    const proyectos = await ctx.db.query("desarrollos").collect();
    
    const proyectosWithMetrics = await Promise.all(
        proyectos.map(async (proyecto) => {
            // Get metrics for this project
            const metrics = await ctx.db
                .query("meticas_presupuesto")
                .withIndex("by_proyecto", (q) => q.eq("proyecto", proyecto._id))
                .first();
            
            const presupuestoAprobado = metrics?.presupuesto_aprobado || 0;
            const gastoTotal = metrics?.gasto_total || 0;
            
            return {
                ...proyecto,
                presupuesto_original: metrics?.presupuesto_original || 0,
                presupuesto_aprobado: presupuestoAprobado,
                pagado: gastoTotal,
                avance: presupuestoAprobado > 0 
                    ? Math.round((gastoTotal / presupuestoAprobado) * 100)
                    : 0,
            };
        })
    );
    
    return proyectosWithMetrics;
});

// Get project by ID
export const getById = query({
    args: {
        id: v.id("desarrollos"),
    },
    handler: async (ctx, args) => {
        return await ctx.db.get(args.id);
    },
});

// Create new project
export const create = mutation({
    args: {
        nombre: v.string(),
        descripcion: v.string(),
        image: v.string(),
        status: v.optional(v.string()),
        fecha_creacion: v.optional(v.string()),
        honorarios_porcentaje: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const project = await ctx.db.insert("desarrollos", {
            nombre: args.nombre,
            descripcion: args.descripcion,
            image: args.image,
            status: args.status || "Activo",
            fecha_creacion: args.fecha_creacion || new Date().toLocaleDateString("es-MX", {
                day: "2-digit",
                month: "short",
                year: "numeric",
            }),
            honorarios_porcentaje: args.honorarios_porcentaje || 0,
            honorarios_monto: 0, // Initial value, will be calculated by triggers
        });
        return project;
    },
});

// Update project
export const update = mutation({
    args: {
        id: v.id("desarrollos"),
        nombre: v.optional(v.string()),
        descripcion: v.optional(v.string()),
        image: v.optional(v.string()),
        status: v.optional(v.string()),
        fecha_creacion: v.optional(v.string()),
        honorarios_porcentaje: v.optional(v.number()),
        excluded_partidas_honorarios: v.optional(v.array(v.id("partidas"))),
    },
    handler: async (ctx, args) => {
        const { id, ...rest } = args;
        // Filter out undefined valuese
        const updateData = Object.fromEntries(
            Object.entries(rest).filter(([, value]) => value !== undefined)
        );
        return await ctx.db.patch(id, updateData);
    },
});

// Batch size for paginated deletes to avoid hitting read limits
const BATCH_SIZE = 100;

// Delete project and all related data (cascade delete)
// Uses rawMutation to bypass triggers and avoid timeout during bulk deletes
// Deletes in batches to avoid hitting the 4096 read limit
export const deleteProject = rawMutation({
    args: {
        id: v.id("desarrollos"),
    },
    handler: async (ctx, args) => {
        // Verify the project exists
        const project = await ctx.db.get(args.id);
        if (!project) {
            throw new Error("Project not found");
        }

        let deletedPagos = 0;
        let deletedTransacciones = 0;
        let deletedPartidas = 0;
        let deletedDocumentos = 0;
        let deletedMeticas = 0;
        let deletedProjectedTransactions = 0;
        let deletedWeeklyTotals = 0;
        let deletedBitacora = 0;
        let deletedPhotoComments = 0;
        const appwriteFileIds: string[] = [];

        // 1. Delete pagos in batches (paginate to avoid too many reads)
        // First get transacciones with pagination
        let transaccionesCursor = await ctx.db
            .query("transacciones")
            .withIndex("by_proyecto", (q) => q.eq("proyecto", args.id))
            .take(BATCH_SIZE);
        
        while (transaccionesCursor.length > 0) {
            // For each transaction batch, get and delete pagos
            for (const transaccion of transaccionesCursor) {
                const pagos = await ctx.db
                    .query("pagos")
                    .withIndex("by_transaccion", (q) => q.eq("transaccion_id", transaccion._id))
                    .collect();
                for (const pago of pagos) {
                    await ctx.db.delete(pago._id);
                    deletedPagos++;
                }
            }
            
            // Delete this batch of transacciones
            for (const t of transaccionesCursor) {
                await ctx.db.delete(t._id);
                deletedTransacciones++;
            }
            
            // Get next batch (items after the last one we processed)
            const lastId = transaccionesCursor[transaccionesCursor.length - 1]._id;
            transaccionesCursor = await ctx.db
                .query("transacciones")
                .withIndex("by_proyecto", (q) => q.eq("proyecto", args.id))
                .filter((q) => q.gt(q.field("_id"), lastId))
                .take(BATCH_SIZE);
        }

        // 2. Delete documentos in batches (and collect file IDs)
        let documentosCursor = await ctx.db
            .query("documentos")
            .withIndex("by_proyecto", (q) => q.eq("proyecto", args.id))
            .take(BATCH_SIZE);
        
        while (documentosCursor.length > 0) {
            // Collect file IDs and delete photo_comments before deleting docs
            for (const doc of documentosCursor) {
                if (doc.image) appwriteFileIds.push(doc.image);
                
                // Delete any photo_comments for this document
                const comments = await ctx.db
                    .query("photo_comments")
                    .withIndex("by_photo", (q) => q.eq("photo_id", doc._id))
                    .collect();
                for (const comment of comments) {
                    await ctx.db.delete(comment._id);
                    deletedPhotoComments++;
                }
                
                await ctx.db.delete(doc._id);
                deletedDocumentos++;
            }
            
            const lastId = documentosCursor[documentosCursor.length - 1]._id;
            documentosCursor = await ctx.db
                .query("documentos")
                .withIndex("by_proyecto", (q) => q.eq("proyecto", args.id))
                .filter((q) => q.gt(q.field("_id"), lastId))
                .take(BATCH_SIZE);
        }

        // 3. Delete partidas in batches
        let partidasCursor = await ctx.db
            .query("partidas")
            .withIndex("by_proyecto", (q) => q.eq("proyecto", args.id))
            .take(BATCH_SIZE);
        
        while (partidasCursor.length > 0) {
            for (const p of partidasCursor) {
                await ctx.db.delete(p._id);
                deletedPartidas++;
            }
            
            const lastId = partidasCursor[partidasCursor.length - 1]._id;
            partidasCursor = await ctx.db
                .query("partidas")
                .withIndex("by_proyecto", (q) => q.eq("proyecto", args.id))
                .filter((q) => q.gt(q.field("_id"), lastId))
                .take(BATCH_SIZE);
        }

        // 4. Delete bitacora entries in batches
        let bitacoraCursor = await ctx.db
            .query("bitacora")
            .withIndex("by_proyecto", (q) => q.eq("proyecto", args.id))
            .take(BATCH_SIZE);
        
        while (bitacoraCursor.length > 0) {
            for (const b of bitacoraCursor) {
                await ctx.db.delete(b._id);
                deletedBitacora++;
            }
            
            const lastId = bitacoraCursor[bitacoraCursor.length - 1]._id;
            bitacoraCursor = await ctx.db
                .query("bitacora")
                .withIndex("by_proyecto", (q) => q.eq("proyecto", args.id))
                .filter((q) => q.gt(q.field("_id"), lastId))
                .take(BATCH_SIZE);
        }

        // 5. Delete meticas_presupuesto (usually just one per project)
        const meticas = await ctx.db
            .query("meticas_presupuesto")
            .withIndex("by_proyecto", (q) => q.eq("proyecto", args.id))
            .collect();
        for (const m of meticas) {
            await ctx.db.delete(m._id);
            deletedMeticas++;
        }

        // 6. Delete projected_transactions in batches
        let projectedCursor = await ctx.db
            .query("projected_transactions")
            .withIndex("by_proyecto", (q) => q.eq("proyecto", args.id))
            .take(BATCH_SIZE);
        
        while (projectedCursor.length > 0) {
            for (const pt of projectedCursor) {
                await ctx.db.delete(pt._id);
                deletedProjectedTransactions++;
            }
            
            const lastId = projectedCursor[projectedCursor.length - 1]._id;
            projectedCursor = await ctx.db
                .query("projected_transactions")
                .withIndex("by_proyecto", (q) => q.eq("proyecto", args.id))
                .filter((q) => q.gt(q.field("_id"), lastId))
                .take(BATCH_SIZE);
        }

        // 7. Delete weekly_projected_totals in batches
        let weeklyCursor = await ctx.db
            .query("weekly_projected_totals")
            .withIndex("by_proyecto", (q) => q.eq("proyecto", args.id))
            .take(BATCH_SIZE);
        
        while (weeklyCursor.length > 0) {
            for (const wt of weeklyCursor) {
                await ctx.db.delete(wt._id);
                deletedWeeklyTotals++;
            }
            
            const lastId = weeklyCursor[weeklyCursor.length - 1]._id;
            weeklyCursor = await ctx.db
                .query("weekly_projected_totals")
                .withIndex("by_proyecto", (q) => q.eq("proyecto", args.id))
                .filter((q) => q.gt(q.field("_id"), lastId))
                .take(BATCH_SIZE);
        }

        // 8. Finally, delete the proyecto itself
        await ctx.db.delete(args.id);

        return {
            success: true,
            deletedPartidas,
            deletedPagos,
            deletedTransacciones,
            deletedDocumentos,
            deletedMeticas,
            deletedProjectedTransactions,
            deletedWeeklyTotals,
            deletedBitacora,
            deletedPhotoComments,
            appwriteFileIds,
        };
    },
});

// Manually recalculate honorarios monto for a proyecto
export const recalculateHonorariosMonto = mutation({
    args: {
        id: v.id("desarrollos"),
    },
    handler: async (ctx, args) => {
        // Verify the project exists
        const project = await ctx.db.get(args.id);
        if (!project) {
            throw new Error("Project not found");
        }

        const honorariosPorcentaje = project.honorarios_porcentaje || 0;

        // Get all transactions for this proyecto
        const allTransactions = await ctx.db
            .query("transacciones")
            .withIndex("by_proyecto", (q) => q.eq("proyecto", args.id))
            .collect();

        // Calculate total amount from all transactions
        const totalAmount = allTransactions.reduce(
            (sum, t) => sum + (t.monto_total || 0),
            0
        );

        // Calculate honorarios amount: total * percentage / 100
        const honorariosMonto = totalAmount * (honorariosPorcentaje / 100);

        // Round to 2 decimal places
        const roundedHonorariosMonto = Math.round(honorariosMonto * 100) / 100;

        // Update the desarrollo's honorarios_monto field
        await ctx.db.patch(args.id, { 
            honorarios_monto: roundedHonorariosMonto 
        });

        return {
            honorarios_porcentaje: honorariosPorcentaje,
            honorarios_monto: roundedHonorariosMonto,
            totalAmount,
        };
    },
});

// Recalculate honorarios monto for all projects (useful for bulk updates)
export const recalculateAllHonorariosMonto = mutation({
    args: {},
    handler: async (ctx) => {
        // Get all projects
        const allProjects = await ctx.db.query("desarrollos").collect();
        
        const results = [];
        
        for (const project of allProjects) {
            const honorariosPorcentaje = project.honorarios_porcentaje || 0;

            // Get all transactions for this proyecto
            const allTransactions = await ctx.db
                .query("transacciones")
                .withIndex("by_proyecto", (q) => q.eq("proyecto", project._id))
                .collect();

            // Calculate total amount from all transactions
            const totalAmount = allTransactions.reduce(
                (sum, t) => sum + (t.monto_total || 0),
                0
            );

            // Calculate honorarios amount: total * percentage / 100
            const honorariosMonto = totalAmount * (honorariosPorcentaje / 100);

            // Round to 2 decimal places
            const roundedHonorariosMonto = Math.round(honorariosMonto * 100) / 100;

            // Update the desarrollo's honorarios_monto field
            await ctx.db.patch(project._id, { 
                honorarios_monto: roundedHonorariosMonto 
            });

            results.push({
                projectId: project._id,
                projectName: project.nombre,
                honorarios_porcentaje: honorariosPorcentaje,
                honorarios_monto: roundedHonorariosMonto,
            });
        }

        return {
            success: true,
            projectsUpdated: results.length,
            results,
        };
    },
});

// Debug query to check HONORARIOS partida and gasto_total breakdown
export const debugHonorariosPartida = query({
    args: {
        id: v.id("desarrollos"),
    },
    handler: async (ctx, args) => {
        // Get the project
        const project = await ctx.db.get(args.id);
        if (!project) {
            throw new Error("Project not found");
        }

        // Get all nivel 1 partidas for this project
        const nivel1Partidas = await ctx.db
            .query("partidas")
            .filter((q) => 
                q.and(
                    q.eq(q.field("nivel"), 1),
                    q.eq(q.field("proyecto"), args.id)
                )
            )
            .collect();

        // Find the HONORARIOS partida with case-insensitive matching
        const honorariosPartida = nivel1Partidas.find((p) => 
            p.nombre.toLowerCase() === "honorarios"
        );

        // Calculate sum of all nivel 1 partidas' pagado
        const sumPagadoNivel1 = nivel1Partidas.reduce(
            (sum, p) => sum + (p.pagado || 0),
            0
        );

        // Get metrics from meticas_presupuesto table
        const metrics = await ctx.db
            .query("meticas_presupuesto")
            .withIndex("by_proyecto", (q) => q.eq("proyecto", args.id))
            .first();

        // Get all transactions to calculate base gasto
        const allTransactions = await ctx.db
            .query("transacciones")
            .withIndex("by_proyecto", (q) => q.eq("proyecto", args.id))
            .collect();

        const totalFromTransactions = allTransactions.reduce(
            (sum, t) => sum + (t.monto_total || 0),
            0
        );

        return {
            project: {
                id: project._id,
                nombre: project.nombre,
                honorarios_porcentaje: project.honorarios_porcentaje,
                honorarios_monto: project.honorarios_monto,
            },
            honorariosPartida: honorariosPartida ? {
                id: honorariosPartida._id,
                nombre: honorariosPartida.nombre,
                pagado: honorariosPartida.pagado,
                presupuesto_aprobado: honorariosPartida.presupuesto_aprobado,
                por_gastar: honorariosPartida.por_gastar,
            } : null,
            nivel1PartidasCount: nivel1Partidas.length,
            sumPagadoNivel1,
            metrics: metrics ? {
                gasto_total: metrics.gasto_total,
                presupuesto_aprobado: metrics.presupuesto_aprobado,
                por_gastar: metrics.por_gastar,
            } : null,
            totalFromTransactions,
            expectedGastoTotal: totalFromTransactions + (project.honorarios_monto || 0),
            diagnosis: {
                honorariosPartidaExists: !!honorariosPartida,
                honorariosPartidaPagadoMatchesMonto: honorariosPartida?.pagado === project.honorarios_monto,
                metricsGastoMatchesSumPagado: metrics?.gasto_total === sumPagadoNivel1,
            }
        };
    },
});
