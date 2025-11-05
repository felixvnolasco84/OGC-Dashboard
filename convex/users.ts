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
      allowed_desarrollos: [], // No access by default
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
    allowed_desarrollos: v.array(v.id("desarrollos")),
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

    await ctx.db.patch(args.userId, {
      role: args.role,
      allowed_desarrollos: args.allowed_desarrollos,
    });

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
