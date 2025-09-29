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
        return await ctx.db.insert("desarrollos", {
            nombre: args.nombre,
            descripcion: args.descripcion,
            image: args.image,
        });
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

// Delete project
export const deleteProject = mutation({
    args: {
        id: v.id("desarrollos"),
    },
    handler: async (ctx, args) => {
        return await ctx.db.delete(args.id);
    },
});
