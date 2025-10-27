import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Get all projects
export const getAll = query(async (ctx) => {
    return await ctx.db.query("desarrollos").collect();
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

// Delete project and all related data (cascade delete)
export const deleteProject = mutation({
    args: {
        id: v.id("desarrollos"),
    },
    handler: async (ctx, args) => {
        // Verify the project exists
        const project = await ctx.db.get(args.id);
        if (!project) {
            throw new Error("Project not found");
        }

        // 1. Get all partidas for this proyecto
        const partidas = await ctx.db
            .query("partidas")
            .withIndex("by_proyecto", (q) => q.eq("proyecto", args.id))
            .collect();

        // 2. Delete all pagos associated with this proyecto's partidas
        const partidaIds = partidas.map(p => p._id);
        const pagos = await ctx.db
            .query("pagos")
            .filter((q) => partidaIds.some(pid => q.eq(q.field("partida_id"), pid)))
            .collect();

        // Delete all pagos
        await Promise.all(pagos.map((pago) => ctx.db.delete(pago._id)));

        // 3. Delete all transacciones for this proyecto
        const transacciones = await ctx.db
            .query("transacciones")
            .withIndex("by_proyecto", (q) => q.eq("proyecto", args.id))
            .collect();
        
        await Promise.all(transacciones.map((transaccion) => ctx.db.delete(transaccion._id)));

        // 4. Delete all documentos for this proyecto
        const documentos = await ctx.db
            .query("documentos")
            .withIndex("by_proyecto", (q) => q.eq("proyecto", args.id))
            .collect();

        // Delete all documentos (Note: Appwrite files should be deleted separately)
        await Promise.all(documentos.map((doc) => ctx.db.delete(doc._id)));

        // 5. Delete all partidas for this proyecto
        await Promise.all(partidas.map((partida) => ctx.db.delete(partida._id)));

        // 6. Finally, delete the proyecto itself
        await ctx.db.delete(args.id);

        return {
            success: true,
            deletedPartidas: partidas.length,
            deletedPagos: pagos.length,
            deletedTransacciones: transacciones.length,
            deletedDocumentos: documentos.length,
            appwriteFileIds: documentos.map(doc => doc.image), // Return file IDs for manual cleanup
        };
    },
});
