import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Log a history entry for a requisicion change
export const logChange = mutation({
  args: {
    proyecto: v.id("desarrollos"),
    requisicion_id: v.id("requisiciones"),
    action: v.string(),
    field_changed: v.optional(v.string()),
    old_value: v.optional(v.string()),
    new_value: v.optional(v.string()),
    changed_by_id: v.id("users"),
    changed_by_name: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("requisicion_history", {
      proyecto: args.proyecto,
      requisicion_id: args.requisicion_id,
      action: args.action,
      field_changed: args.field_changed,
      old_value: args.old_value,
      new_value: args.new_value,
      changed_by_id: args.changed_by_id,
      changed_by_name: args.changed_by_name,
      created_at: Date.now(),
    });
  },
});

// Get all history entries for a project (paginated, most recent first)
export const getByProyecto = query({
  args: {
    proyecto: v.id("desarrollos"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    const history = await ctx.db
      .query("requisicion_history")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto))
      .order("desc")
      .take(limit);
    
    return history;
  },
});

// Get history entries for a specific requisicion
export const getByRequisicion = query({
  args: {
    requisicion_id: v.id("requisiciones"),
  },
  handler: async (ctx, args) => {
    const history = await ctx.db
      .query("requisicion_history")
      .withIndex("by_requisicion", (q) => q.eq("requisicion_id", args.requisicion_id))
      .order("desc")
      .collect();
    
    return history;
  },
});

// Get unread count for a user in a specific project
export const getUnreadCount = query({
  args: {
    user_id: v.id("users"),
    proyecto: v.id("desarrollos"),
  },
  handler: async (ctx, args) => {
    // Get user's last read timestamp
    const readStatus = await ctx.db
      .query("requisicion_read_status")
      .withIndex("by_user_proyecto", (q) => 
        q.eq("user_id", args.user_id).eq("proyecto", args.proyecto)
      )
      .first();
    
    const lastReadAt = readStatus?.last_read_at ?? 0;
    
    // Count history entries since last read
    const unreadHistory = await ctx.db
      .query("requisicion_history")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto))
      .filter((q) => q.gt(q.field("created_at"), lastReadAt))
      .collect();
    
    return unreadHistory.length;
  },
});

// Get unread summary for sidebar notification dot
// Returns: { hasNew: boolean, hasUpdated: boolean, total: number }
export const getUnreadSummary = query({
  args: {
    user_id: v.id("users"),
    proyecto: v.id("desarrollos"),
    user_role: v.optional(v.string()), // "admin", "contratista", etc.
  },
  handler: async (ctx, args) => {
    // Get user's last read timestamp
    const readStatus = await ctx.db
      .query("requisicion_read_status")
      .withIndex("by_user_proyecto", (q) => 
        q.eq("user_id", args.user_id).eq("proyecto", args.proyecto)
      )
      .first();
    
    const lastReadAt = readStatus?.last_read_at ?? 0;
    
    // Get history entries since last read
    let unreadHistory = await ctx.db
      .query("requisicion_history")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto))
      .filter((q) => q.gt(q.field("created_at"), lastReadAt))
      .collect();
    
    // Filter by role: contratistas only see their own requisiciones
    if (args.user_role === "contratista") {
      unreadHistory = unreadHistory.filter(h => h.changed_by_id === args.user_id);
    }
    
    // Check for new vs updated
    const hasNew = unreadHistory.some(h => h.action === "created");
    const hasUpdated = unreadHistory.some(h => 
      h.action !== "created" && h.action !== "deleted"
    );
    
    return {
      hasNew,
      hasUpdated,
      total: unreadHistory.length,
    };
  },
});

// Mark requisiciones as read for a user in a project
export const markAsRead = mutation({
  args: {
    user_id: v.id("users"),
    proyecto: v.id("desarrollos"),
  },
  handler: async (ctx, args) => {
    // Check if read status exists
    const existing = await ctx.db
      .query("requisicion_read_status")
      .withIndex("by_user_proyecto", (q) => 
        q.eq("user_id", args.user_id).eq("proyecto", args.proyecto)
      )
      .first();
    
    if (existing) {
      // Update existing
      await ctx.db.patch(existing._id, {
        last_read_at: Date.now(),
      });
    } else {
      // Create new
      await ctx.db.insert("requisicion_read_status", {
        user_id: args.user_id,
        proyecto: args.proyecto,
        last_read_at: Date.now(),
      });
    }
  },
});

// Get recent history with requisicion details (for history modal)
export const getRecentWithDetails = query({
  args: {
    proyecto: v.id("desarrollos"),
    limit: v.optional(v.number()),
    user_id: v.optional(v.id("users")),
    user_role: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    
    let history = await ctx.db
      .query("requisicion_history")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto))
      .order("desc")
      .take(limit * 2); // Get more to account for filtering
    
    // Filter by role: contratistas only see their own
    if (args.user_role === "contratista" && args.user_id) {
      history = history.filter(h => h.changed_by_id === args.user_id);
    }
    
    // Limit after filtering
    history = history.slice(0, limit);
    
    // Enrich with requisicion details
    const enrichedHistory = await Promise.all(
      history.map(async (h) => {
        const requisicion = await ctx.db.get(h.requisicion_id);
        return {
          ...h,
          requisicion: requisicion ? {
            _id: requisicion._id,
            tipo: requisicion.tipo,
            status: requisicion.status,
            status_entrega: requisicion.status_entrega,
            solicitante_nombre: requisicion.solicitante_nombre,
            fecha_solicitud: requisicion.fecha_solicitud,
          } : null,
        };
      })
    );
    
    return enrichedHistory;
  },
});
