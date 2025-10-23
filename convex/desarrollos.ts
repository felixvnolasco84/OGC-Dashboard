import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Get all projects
export const getAll = query(async (ctx) => {
    return await ctx.db.query("desarrollos").collect();
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
    },
    handler: async (ctx, args) => {
        const project = await ctx.db.insert("desarrollos", {
            nombre: args.nombre,
            descripcion: args.descripcion,
            image: args.image,
        });
        return project;
    },
});

// Update project
export const update = mutation({
    args: {
        id: v.id("desarrollos"),
        nombre: v.string(),
        descripcion: v.string(),
        image: v.string(),
    },
    handler: async (ctx, args) => {
        const { id, ...rest } = args;
        return await ctx.db.patch(id, rest);
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
