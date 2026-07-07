import { mutation, query, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

type HistoryVisibilityEntry = {
  requisicion_id: Id<"requisiciones">;
  changed_by_id: Id<"users">;
  old_value?: string;
  new_value?: string;
};

function tryParsePayload(value: string | undefined): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

function payloadReferencesRequester(entry: HistoryVisibilityEntry, userId: Id<"users">) {
  const oldPayload = tryParsePayload(entry.old_value);
  const newPayload = tryParsePayload(entry.new_value);
  const userIdString = String(userId);

  return (
    String(oldPayload?.solicitante_id ?? "") === userIdString ||
    String(newPayload?.solicitante_id ?? "") === userIdString
  );
}

async function canUserSeeHistoryEntry(
  ctx: QueryCtx,
  entry: HistoryVisibilityEntry,
  userId: Id<"users"> | undefined,
  userRole: string | undefined
) {
  if (userRole !== "contratista") return true;
  if (!userId) return false;

  const requisicion = await ctx.db.get(entry.requisicion_id);
  if (requisicion) {
    return requisicion.solicitante_id === userId;
  }

  return entry.changed_by_id === userId || payloadReferencesRequester(entry, userId);
}

async function filterVisibleHistory<T extends HistoryVisibilityEntry>(
  ctx: QueryCtx,
  history: T[],
  userId?: Id<"users">,
  userRole?: string
) {
  if (userRole !== "contratista") return history;

  const visibleEntries = await Promise.all(
    history.map(async (entry) => ({
      entry,
      visible: await canUserSeeHistoryEntry(ctx, entry, userId, userRole),
    }))
  );

  return visibleEntries.filter((item) => item.visible).map((item) => item.entry);
}

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
    user_id: v.optional(v.id("users")),
    user_role: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    const history = await ctx.db
      .query("requisicion_history")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto))
      .order("desc")
      .take(limit * 4);
    
    const visibleHistory = await filterVisibleHistory(ctx, history, args.user_id, args.user_role);
    return visibleHistory.slice(0, limit);
  },
});

// Get history entries for a specific requisicion
export const getByRequisicion = query({
  args: {
    requisicion_id: v.id("requisiciones"),
    user_id: v.optional(v.id("users")),
    user_role: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const history = await ctx.db
      .query("requisicion_history")
      .withIndex("by_requisicion", (q) => q.eq("requisicion_id", args.requisicion_id))
      .order("desc")
      .collect();
    
    return await filterVisibleHistory(ctx, history, args.user_id, args.user_role);
  },
});

// Get unread count for a user in a specific project
export const getUnreadCount = query({
  args: {
    user_id: v.id("users"),
    proyecto: v.id("desarrollos"),
    user_role: v.optional(v.string()),
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
    
    const visibleUnreadHistory = await filterVisibleHistory(ctx, unreadHistory, args.user_id, args.user_role);
    return visibleUnreadHistory.length;
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
    const unreadHistory = await ctx.db
      .query("requisicion_history")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto))
      .filter((q) => q.gt(q.field("created_at"), lastReadAt))
      .collect();
    
    const visibleUnreadHistory = await filterVisibleHistory(ctx, unreadHistory, args.user_id, args.user_role);
    
    // Check for new vs updated
    const hasNew = visibleUnreadHistory.some(h => h.action === "created");
    const hasUpdated = visibleUnreadHistory.some(h =>
      h.action !== "created" && h.action !== "deleted"
    );
    
    return {
      hasNew,
      hasUpdated,
      total: visibleUnreadHistory.length,
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
    const now = Date.now();
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
        last_read_at: now,
      });
    } else {
      // Create new
      await ctx.db.insert("requisicion_read_status", {
        user_id: args.user_id,
        proyecto: args.proyecto,
        last_read_at: now,
      });
    }

    const unreadDeliveries = await ctx.db
      .query("notification_deliveries")
      .withIndex("by_recipient_proyecto", (q) =>
        q.eq("recipient_user_id", args.user_id).eq("proyecto", args.proyecto)
      )
      .filter((q) =>
        q.and(
          q.eq(q.field("status"), "sent"),
          q.eq(q.field("read_at"), undefined)
        )
      )
      .collect();

    await Promise.all(
      unreadDeliveries.map((delivery) =>
        ctx.db.patch(delivery._id, {
          status: delivery.status === "sent" ? "read" : delivery.status,
          read_at: now,
        })
      )
    );
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
    
    const history = await ctx.db
      .query("requisicion_history")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto))
      .order("desc")
      .take(limit * 4); // Get more to account for filtering
    
    const visibleHistory = await filterVisibleHistory(ctx, history, args.user_id, args.user_role);
    
    // Limit after filtering
    const limitedHistory = visibleHistory.slice(0, limit);
    
    // Enrich with requisicion details
    const enrichedHistory = await Promise.all(
      limitedHistory.map(async (h) => {
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
