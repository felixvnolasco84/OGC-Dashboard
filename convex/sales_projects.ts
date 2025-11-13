import { query, mutation as rawMutation } from "./_generated/server";
import { mutation } from "./functions";
import { v } from "convex/values";

// Get all sales projects
export const getAll = query(async (ctx) => {
    return await ctx.db.query("sales_projects").collect();
});

// Get all sales projects with their metrics
export const getAllWithMetrics = query(async (ctx) => {
    const salesProjects = await ctx.db.query("sales_projects").collect();
    
    // For now, return projects without metrics since we don't have sales-specific metrics table yet
    // This can be extended later to include sales metrics
    const salesProjectsWithMetrics = salesProjects.map((project) => {
        return {
            ...project,
            total_ventas: 0, // Placeholder for future sales data
            comision_monto: project.comision_monto || 0,
        };
    });
    
    return salesProjectsWithMetrics;
});

// Get sales project by ID
export const getById = query({
    args: {
        id: v.id("sales_projects"),
    },
    handler: async (ctx, args) => {
        return await ctx.db.get(args.id);
    },
});

// Create new sales project
export const create = mutation({
    args: {
        nombre: v.string(),
        descripcion: v.string(),
        image: v.string(),
        status: v.optional(v.string()),
        fecha_creacion: v.optional(v.string()),
        comision_porcentaje: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const project = await ctx.db.insert("sales_projects", {
            nombre: args.nombre,
            descripcion: args.descripcion,
            image: args.image,
            status: args.status || "Activo",
            fecha_creacion: args.fecha_creacion || new Date().toLocaleDateString("es-MX", {
                day: "2-digit",
                month: "short",
                year: "numeric",
            }),
            comision_porcentaje: args.comision_porcentaje || 0,
            comision_monto: 0, // Initial value
        });
        return project;
    },
});

// Update sales project
export const update = mutation({
    args: {
        id: v.id("sales_projects"),
        nombre: v.optional(v.string()),
        descripcion: v.optional(v.string()),
        image: v.optional(v.string()),
        status: v.optional(v.string()),
        fecha_creacion: v.optional(v.string()),
        comision_porcentaje: v.optional(v.number()),
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

// Delete sales project
export const deleteProject = rawMutation({
    args: {
        id: v.id("sales_projects"),
    },
    handler: async (ctx, args) => {
        // Verify the project exists
        const project = await ctx.db.get(args.id);
        if (!project) {
            throw new Error("Sales project not found");
        }

        // Delete the sales project
        await ctx.db.delete(args.id);

        return {
            success: true,
        };
    },
});

// Manually recalculate commission monto for a sales project
export const recalculateComisionMonto = mutation({
    args: {
        id: v.id("sales_projects"),
    },
    handler: async (ctx, args) => {
        // Verify the project exists
        const project = await ctx.db.get(args.id);
        if (!project) {
            throw new Error("Sales project not found");
        }

        const comisionPorcentaje = project.comision_porcentaje || 0;

        // Placeholder for future sales data calculation
        // For now, we'll keep it at 0 until sales transaction logic is implemented
        const totalSales = 0;

        // Calculate commission amount: total * percentage / 100
        const comisionMonto = totalSales * (comisionPorcentaje / 100);

        // Round to 2 decimal places
        const roundedComisionMonto = Math.round(comisionMonto * 100) / 100;

        // Update the sales project's comision_monto field
        await ctx.db.patch(args.id, { 
            comision_monto: roundedComisionMonto 
        });

        return {
            comision_porcentaje: comisionPorcentaje,
            comision_monto: roundedComisionMonto,
            totalSales,
        };
    },
});
