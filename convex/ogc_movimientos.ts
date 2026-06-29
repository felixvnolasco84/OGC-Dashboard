import { v } from "convex/values";
import { query } from "./_generated/server";
import { mutation } from "./functions";
import { Id } from "./_generated/dataModel";
import {
  assertCanWrite,
  checkDesarrolloAccess,
  getCurrentUserOrThrow,
  getScopedOrganizationId,
  hasGlobalAdminAccess,
} from "./permissions";

const normalizeTipo = (value: string) => {
  const normalized = value.toLowerCase().trim();
  return normalized === "ingreso" ? "ingreso" : "costo_estructura";
};

const normalizeCategoria = (value: string) => {
  return value.trim().toUpperCase() || "OTROS";
};

export const getAll = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUserOrThrow(ctx);
    const allMovements = await ctx.db.query("ogc_movimientos").collect();

    if (hasGlobalAdminAccess(user)) {
      return allMovements;
    }

    const allowedIds = new Set(user.allowed_desarrollos.map((id) => id as string));

    return allMovements.filter((movement) => {
      if (user.organization_id && movement.organization_id === user.organization_id) {
        return true;
      }

      if (!movement.proyecto) {
        return false;
      }

      return allowedIds.has(movement.proyecto as string);
    });
  },
});

export const bulkCreate = mutation({
  args: {
    movimientos: v.array(
      v.object({
        tipo: v.string(),
        categoria: v.string(),
        monto: v.number(),
        fecha: v.string(),
        descripcion: v.optional(v.string()),
        moneda: v.string(),
        proyecto: v.optional(v.id("desarrollos")),
        archivo_origen: v.optional(v.string()),
        fila_origen: v.optional(v.number()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const user = await assertCanWrite(ctx);
    const organizationId = getScopedOrganizationId(user);
    const ids: Id<"ogc_movimientos">[] = [];
    const now = Date.now();

    for (const item of args.movimientos) {
      if (!Number.isFinite(item.monto) || item.monto === 0 || !item.fecha) {
        continue;
      }

      if (item.proyecto) {
        const hasAccess = await checkDesarrolloAccess(ctx, item.proyecto);
        if (!hasAccess) {
          throw new Error("No tienes acceso a una de las obras seleccionadas.");
        }
      }

      const id = await ctx.db.insert("ogc_movimientos", {
        tipo: normalizeTipo(item.tipo),
        categoria: normalizeCategoria(item.categoria),
        monto: Math.abs(item.monto),
        fecha: item.fecha,
        descripcion: item.descripcion || undefined,
        moneda: item.moneda || "MXN",
        proyecto: item.proyecto,
        archivo_origen: item.archivo_origen,
        fila_origen: item.fila_origen,
        organization_id: organizationId,
        created_by_id: user._id,
        created_by_name: user.name,
        created_at: now,
      });

      ids.push(id);
    }

    return { created: ids.length, ids };
  },
});
