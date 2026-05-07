import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";

// Get all chart configurations for current user and project
export const getUserChartConfigs = query({
  args: {
    proyecto_id: v.id("sales_projects"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    // Get user
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) {
      throw new Error("User not found");
    }
    if (user.role === "viewer") {
      throw new Error("Unauthorized: Viewer role is read-only");
    }

    // Get all chart configs for this user and project
    const configs = await ctx.db
      .query("chart_configurations")
      .withIndex("by_user_proyecto", (q) =>
        q.eq("user_id", user._id).eq("proyecto_id", args.proyecto_id)
      )
      .collect();

    return configs;
  },
});

// Get a specific chart configuration
export const getChartConfig = query({
  args: {
    proyecto_id: v.id("sales_projects"),
    chart_id: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null; // Return null instead of throwing to allow graceful fallback
    }

    // Get user
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) {
      return null;
    }

    // Get specific chart config
    const config = await ctx.db
      .query("chart_configurations")
      .withIndex("by_user_proyecto_chart", (q) =>
        q
          .eq("user_id", user._id)
          .eq("proyecto_id", args.proyecto_id)
          .eq("chart_id", args.chart_id)
      )
      .first();

    return config;
  },
});

// Create or update a chart configuration
export const saveChartConfig = mutation({
  args: {
    proyecto_id: v.id("sales_projects"),
    chart_id: v.string(),
    title: v.string(),
    color: v.string(),
    height: v.optional(v.number()),
    partidas: v.optional(v.array(v.string())),
    familias: v.optional(v.array(v.string())),
    sub_partidas: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    // Get user
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) {
      throw new Error("User not found");
    }
    if (user.role === "viewer") {
      throw new Error("Unauthorized: Viewer role is read-only");
    }

    // Check if config already exists
    const existingConfig = await ctx.db
      .query("chart_configurations")
      .withIndex("by_user_proyecto_chart", (q) =>
        q
          .eq("user_id", user._id)
          .eq("proyecto_id", args.proyecto_id)
          .eq("chart_id", args.chart_id)
      )
      .first();

    const now = Date.now();

    if (existingConfig) {
      // Update existing config
      await ctx.db.patch(existingConfig._id, {
        title: args.title,
        color: args.color,
        height: args.height,
        partidas: args.partidas,
        familias: args.familias,
        sub_partidas: args.sub_partidas,
        updated_at: now,
      });

      return {
        success: true,
        configId: existingConfig._id,
        message: "Configuración actualizada",
      };
    } else {
      // Create new config
      const configId = await ctx.db.insert("chart_configurations", {
        user_id: user._id,
        proyecto_id: args.proyecto_id,
        chart_id: args.chart_id,
        title: args.title,
        color: args.color,
        height: args.height,
        partidas: args.partidas,
        familias: args.familias,
        sub_partidas: args.sub_partidas,
        created_at: now,
        updated_at: now,
      });

      return {
        success: true,
        configId,
        message: "Configuración guardada",
      };
    }
  },
});

// Delete a chart configuration
export const deleteChartConfig = mutation({
  args: {
    config_id: v.id("chart_configurations"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    // Get user
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) {
      throw new Error("User not found");
    }
    if (user.role === "viewer") {
      throw new Error("Unauthorized: Viewer role is read-only");
    }

    // Get the config to verify ownership
    const config = await ctx.db.get(args.config_id);
    if (!config) {
      throw new Error("Configuration not found");
    }

    // Verify user owns this config
    if (config.user_id !== user._id) {
      throw new Error("Unauthorized: You can only delete your own configurations");
    }

    await ctx.db.delete(args.config_id);

    return {
      success: true,
      message: "Configuración eliminada",
    };
  },
});

// Reset chart configuration to defaults
export const resetChartConfig = mutation({
  args: {
    proyecto_id: v.id("sales_projects"),
    chart_id: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    // Get user
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) {
      throw new Error("User not found");
    }
    if (user.role === "viewer") {
      throw new Error("Unauthorized: Viewer role is read-only");
    }

    // Find and delete the config
    const config = await ctx.db
      .query("chart_configurations")
      .withIndex("by_user_proyecto_chart", (q) =>
        q
          .eq("user_id", user._id)
          .eq("proyecto_id", args.proyecto_id)
          .eq("chart_id", args.chart_id)
      )
      .first();

    if (config) {
      await ctx.db.delete(config._id);
    }

    return {
      success: true,
      message: "Configuración restablecida a valores predeterminados",
    };
  },
});

// Bulk update multiple chart configurations (useful for dashboard layouts)
export const saveMultipleChartConfigs = mutation({
  args: {
    proyecto_id: v.id("sales_projects"),
    configs: v.array(
      v.object({
        chart_id: v.string(),
        title: v.string(),
        color: v.string(),
        height: v.optional(v.number()),
        partidas: v.optional(v.array(v.string())),
        familias: v.optional(v.array(v.string())),
        sub_partidas: v.optional(v.array(v.string())),
      })
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    // Get user
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    const results: Id<"chart_configurations">[] = [];
    const now = Date.now();

    for (const config of args.configs) {
      // Check if config exists
      const existingConfig = await ctx.db
        .query("chart_configurations")
        .withIndex("by_user_proyecto_chart", (q) =>
          q
            .eq("user_id", user._id)
            .eq("proyecto_id", args.proyecto_id)
            .eq("chart_id", config.chart_id)
        )
        .first();

      if (existingConfig) {
        // Update
        await ctx.db.patch(existingConfig._id, {
          title: config.title,
          color: config.color,
          height: config.height,
          partidas: config.partidas,
          familias: config.familias,
          sub_partidas: config.sub_partidas,
          updated_at: now,
        });
        results.push(existingConfig._id);
      } else {
        // Create
        const configId = await ctx.db.insert("chart_configurations", {
          user_id: user._id,
          proyecto_id: args.proyecto_id,
          chart_id: config.chart_id,
          title: config.title,
          color: config.color,
          height: config.height,
          partidas: config.partidas,
          familias: config.familias,
          sub_partidas: config.sub_partidas,
          created_at: now,
          updated_at: now,
        });
        results.push(configId);
      }
    }

    return {
      success: true,
      configIds: results,
      message: `${results.length} configuraciones guardadas`,
    };
  },
});
