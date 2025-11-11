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

// Delete project and all related data (cascade delete)
// Uses rawMutation to bypass triggers and avoid timeout during bulk deletes
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

        // 1. Get all transacciones for this proyecto (do this FIRST)
        const transacciones = await ctx.db
            .query("transacciones")
            .withIndex("by_proyecto", (q) => q.eq("proyecto", args.id))
            .collect();

        // 2. Delete all pagos associated with this proyecto's transacciones
        // Query pagos for each transaction using the by_transaccion index
        const allPagos = [];
        for (const transaccion of transacciones) {
            const pagosForTransaccion = await ctx.db
                .query("pagos")
                .withIndex("by_transaccion", (q) => q.eq("transaccion_id", transaccion._id))
                .collect();
            allPagos.push(...pagosForTransaccion);
        }

        // Delete all pagos
        await Promise.all(allPagos.map((pago) => ctx.db.delete(pago._id)));

        // 3. Delete all transacciones for this proyecto
        await Promise.all(transacciones.map((transaccion) => ctx.db.delete(transaccion._id)));

        // 4. Get all partidas for this proyecto
        const partidas = await ctx.db
            .query("partidas")
            .withIndex("by_proyecto", (q) => q.eq("proyecto", args.id))
            .collect();

        // 5. Delete all documentos for this proyecto
        const documentos = await ctx.db
            .query("documentos")
            .withIndex("by_proyecto", (q) => q.eq("proyecto", args.id))
            .collect();

        // Delete all documentos (Note: Appwrite files should be deleted separately)
        await Promise.all(documentos.map((doc) => ctx.db.delete(doc._id)));

        // 6. Delete all partidas for this proyecto
        await Promise.all(partidas.map((partida) => ctx.db.delete(partida._id)));

        // 7. Delete meticas_presupuesto for this proyecto
        const meticas = await ctx.db
            .query("meticas_presupuesto")
            .withIndex("by_proyecto", (q) => q.eq("proyecto", args.id))
            .collect();
        await Promise.all(meticas.map((m) => ctx.db.delete(m._id)));

        // 8. Delete projected_transactions for this proyecto
        const projectedTransactions = await ctx.db
            .query("projected_transactions")
            .withIndex("by_proyecto", (q) => q.eq("proyecto", args.id))
            .collect();
        await Promise.all(projectedTransactions.map((pt) => ctx.db.delete(pt._id)));

        // 9. Delete weekly_projected_totals for this proyecto
        const weeklyTotals = await ctx.db
            .query("weekly_projected_totals")
            .withIndex("by_proyecto", (q) => q.eq("proyecto", args.id))
            .collect();
        await Promise.all(weeklyTotals.map((wt) => ctx.db.delete(wt._id)));

        // 10. Finally, delete the proyecto itself
        await ctx.db.delete(args.id);

        return {
            success: true,
            deletedPartidas: partidas.length,
            deletedPagos: allPagos.length,
            deletedTransacciones: transacciones.length,
            deletedDocumentos: documentos.length,
            deletedMeticas: meticas.length,
            deletedProjectedTransactions: projectedTransactions.length,
            deletedWeeklyTotals: weeklyTotals.length,
            appwriteFileIds: documentos.map(doc => doc.image), // Return file IDs for manual cleanup
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
