import { query, mutation as rawMutation } from "./_generated/server";
import { mutation } from "./functions";
import { v } from "convex/values";
import {
    getCurrentUserOrThrow,
    getScopedOrganizationId,
    hasAdminAccess,
    hasGlobalAdminAccess,
} from "./permissions";

// Get all sales projects
export const getAll = query(async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
        return await ctx.db.query("sales_projects").collect();
    }

    const user = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
        .first();

    if (!user) {
        return [];
    }

    if (hasAdminAccess(user)) {
        if (hasGlobalAdminAccess(user)) {
            return await ctx.db.query("sales_projects").collect();
        }

        return await ctx.db
            .query("sales_projects")
            .withIndex("by_organization", (q) => q.eq("organization_id", user.organization_id))
            .collect();
    }

    const allowedSales = user.allowed_sales_projects || [];
    const projects = await Promise.all(allowedSales.map((id) => ctx.db.get(id)));
    return projects.filter((project) => project !== null);
});

// Get all sales projects with their metrics
export const getAllWithMetrics = query(async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
        return [];
    }

    const user = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
        .first();

    if (!user) {
        return [];
    }

    const salesProjects = hasAdminAccess(user)
        ? hasGlobalAdminAccess(user)
            ? await ctx.db.query("sales_projects").collect()
            : await ctx.db
                .query("sales_projects")
                .withIndex("by_organization", (q) => q.eq("organization_id", user.organization_id))
                .collect()
        : (await Promise.all((user.allowed_sales_projects || []).map((id) => ctx.db.get(id))))
            .filter((project) => project !== null);
    
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
        const currentUser = await getCurrentUserOrThrow(ctx);
        const project = await ctx.db.get(args.id);
        if (!project) {
            return null;
        }

        if (hasAdminAccess(currentUser)) {
            if (hasGlobalAdminAccess(currentUser)) {
                return project;
            }

            return project.organization_id === currentUser.organization_id ? project : null;
        }

        if ((currentUser.allowed_sales_projects || []).includes(args.id)) {
            return project;
        }

        return null;
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
        const currentUser = await getCurrentUserOrThrow(ctx);
        if (!hasAdminAccess(currentUser)) {
            throw new Error("Unauthorized: Admin access required");
        }

        const organizationId = getScopedOrganizationId(currentUser);
        const projectId = await ctx.db.insert("sales_projects", {
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
            ...(organizationId ? { organization_id: organizationId } : {}),
        });

        if (organizationId) {
            const allowedSales = currentUser.allowed_sales_projects || [];
            if (!allowedSales.includes(projectId)) {
                await ctx.db.patch(currentUser._id, {
                    allowed_sales_projects: [...allowedSales, projectId],
                });
            }
        }

        // Automatically create sales_meticas_presupuesto record with initial values
        await ctx.db.insert("sales_meticas_presupuesto", {
            sales_proyecto: projectId,
            presupuesto_original: 0,
            presupuesto_aprobado: 0,
            gasto_total: 0,
            por_gastar: 0,
        });

        return projectId;
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
        const currentUser = await getCurrentUserOrThrow(ctx);
        if (!hasAdminAccess(currentUser)) {
            throw new Error("Unauthorized: Admin access required");
        }

        const project = await ctx.db.get(id);
        if (!project) {
            throw new Error("Sales project not found");
        }

        if (
            !hasGlobalAdminAccess(currentUser) &&
            currentUser.organization_id &&
            project.organization_id !== currentUser.organization_id
        ) {
            throw new Error("Unauthorized: Project belongs to another organization");
        }

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
        const currentUser = await getCurrentUserOrThrow(ctx);
        if (!hasAdminAccess(currentUser)) {
            throw new Error("Unauthorized: Admin access required");
        }

        // Verify the project exists
        const project = await ctx.db.get(args.id);
        if (!project) {
            throw new Error("Sales project not found");
        }

        if (
            !hasGlobalAdminAccess(currentUser) &&
            currentUser.organization_id &&
            project.organization_id !== currentUser.organization_id
        ) {
            throw new Error("Unauthorized: Project belongs to another organization");
        }

        // Delete associated sales_meticas_presupuesto record
        const metricsRecord = await ctx.db
            .query("sales_meticas_presupuesto")
            .withIndex("by_sales_proyecto", (q) => q.eq("sales_proyecto", args.id))
            .first();
        
        if (metricsRecord) {
            await ctx.db.delete(metricsRecord._id);
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
