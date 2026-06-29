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

const normalizeDate = (value: string) => {
  const trimmed = value.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [year, month, day] = trimmed.split("-");
    return `${day}/${month}/${year}`;
  }

  const match = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (!match) return trimmed;

  const day = match[1].padStart(2, "0");
  const month = match[2].padStart(2, "0");
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  return `${day}/${month}/${year}`;
};

const isValidDate = (value: string) => {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return false;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const parsed = new Date(year, month - 1, day);

  return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day;
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
      const fecha = normalizeDate(item.fecha);
      const monto = Math.abs(item.monto);

      if (!Number.isFinite(monto) || monto === 0 || !isValidDate(fecha)) {
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
        monto,
        fecha,
        descripcion: item.descripcion || undefined,
        moneda: (item.moneda || "MXN").trim().toUpperCase(),
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
