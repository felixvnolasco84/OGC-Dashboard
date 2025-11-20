import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Get or create user from Clerk
export const getCurrentUser = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    // Check if user exists
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();
    
    return user;
  },
});

// Store/update user in database when they first log in
export const storeUser = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    // Check if user already exists
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (existingUser) {
      // Update last login
      await ctx.db.patch(existingUser._id, {
        last_login: Date.now(),
      });
      return existingUser._id;
    }

    // Create new user with default role and no project access
    const userId = await ctx.db.insert("users", {
      clerkId: identity.subject,
      email: identity.email ?? "",
      name: identity.name ?? "",
      role: "viewer", // Default role
      allowed_desarrollos: [], // No cost projects access by default
      allowed_sales_projects: [], // No sales projects access by default
      created_at: Date.now(),
      last_login: Date.now(),
    });

    return userId;
  },
});

// Get all users (admin only)
export const getAllUsers = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    // Check if current user is admin
    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!currentUser || currentUser.role !== "admin") {
      throw new Error("Unauthorized: Admin access required");
    }

    return await ctx.db.query("users").collect();
  },
});

// Update user permissions (admin only)
export const updateUserPermissions = mutation({
  args: {
    userId: v.id("users"),
    role: v.string(),
    allowed_desarrollos: v.optional(v.array(v.id("desarrollos"))),
    allowed_sales_projects: v.optional(v.array(v.id("sales_projects"))),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    // Check if current user is admin
    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!currentUser || currentUser.role !== "admin") {
      throw new Error("Unauthorized: Admin access required");
    }

    // Build update object with only provided fields
    const updateData: {
      role: string;
      allowed_desarrollos?: typeof args.allowed_desarrollos;
      allowed_sales_projects?: typeof args.allowed_sales_projects;
    } = {
      role: args.role,
    };
    
    if (args.allowed_desarrollos !== undefined) {
      updateData.allowed_desarrollos = args.allowed_desarrollos;
    }
    
    if (args.allowed_sales_projects !== undefined) {
      updateData.allowed_sales_projects = args.allowed_sales_projects;
    }

    await ctx.db.patch(args.userId, updateData);

    return { success: true };
  },
});

// Helper to check if user has access to a desarrollo
export const hasAccessToDesarrollo = query({
  args: {
    desarrolloId: v.id("desarrollos"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return false;
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) {
      return false;
    }

    // Admins have access to everything
    if (user.role === "admin") {
      return true;
    }

    // Check if desarrollo is in allowed list
    return user.allowed_desarrollos.includes(args.desarrolloId);
  },
});

// Helper to check if user has access to a sales project
export const hasAccessToSalesProject = query({
  args: {
    salesProyectoId: v.id("sales_projects"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return false;
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) {
      return false;
    }

    // Admins have access to everything
    if (user.role === "admin") {
      return true;
    }

    const allowedSales = user.allowed_sales_projects || [];

    // Check if sales project is in allowed list
    return allowedSales.includes(args.salesProyectoId);
  },
});
