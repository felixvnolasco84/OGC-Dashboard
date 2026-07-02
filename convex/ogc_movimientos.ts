import { v } from "convex/values";
import { query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { mutation } from "./functions";
import {
  assertCanWrite,
  checkDesarrolloAccess,
  getCurrentUserOrThrow,
  getScopedOrganizationId,
  hasGlobalAdminAccess,
} from "./permissions";

type OgcMovement = Doc<"ogc_movimientos">;
type CurrentUser = Awaited<ReturnType<typeof getCurrentUserOrThrow>>;
type NormalizedMovement = Pick<
  OgcMovement,
  "tipo" | "categoria" | "monto" | "fecha" | "moneda"
> & {
  descripcion?: string;
  tipo_cambio?: number;
  proyecto?: Id<"desarrollos">;
};

const ACTIVE_STATUSES = new Set([undefined, "activo"]);
const deliveryNoteStatusValidator = v.union(v.literal("parcial"), v.literal("completa"));
const ogcMovementInputValidator = v.object({
  tipo: v.string(),
  categoria: v.string(),
  monto: v.number(),
  fecha: v.string(),
  descripcion: v.optional(v.string()),
  moneda: v.string(),
  tipo_cambio: v.optional(v.number()),
  proyecto: v.optional(v.id("desarrollos")),
  archivo_origen: v.optional(v.string()),
  fila_origen: v.optional(v.number()),
  nota_recepcion_status: v.optional(deliveryNoteStatusValidator),
  nota_recepcion_storage_id: v.optional(v.id("_storage")),
  nota_recepcion_nombre: v.optional(v.string()),
  nota_recepcion_type: v.optional(v.string()),
  nota_recepcion_size: v.optional(v.number()),
  nota_recepcion_uploaded_at: v.optional(v.number()),
});

const normalizeTipo = (value: string) => {
  const normalized = value.toLowerCase().trim();
  return normalized === "ingreso" ? "ingreso" : "costo_estructura";
};

const normalizeCategoria = (value: string) => {
  return value.trim().toUpperCase() || "OTROS";
};

const normalizeCurrency = (value?: string) => {
  const currency = (value || "MXN").trim().toUpperCase();
  return ["MXN", "USD", "EUR"].includes(currency) ? currency : "MXN";
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

const normalizeExchangeRate = (value?: number) => {
  return Number.isFinite(value) && value! > 0 ? Number(value) : undefined;
};

const normalizeLookupText = (value?: string) => {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
};

const buildDuplicateKey = (movement: NormalizedMovement, organizationId?: string) => {
  const projectKey = movement.proyecto ? String(movement.proyecto) : "empresa";
  const amountKey = Math.round(Math.abs(movement.monto) * 100);
  const exchangeRateKey = movement.tipo_cambio ? movement.tipo_cambio.toFixed(6) : "default";

  return [
    organizationId || "global",
    projectKey,
    movement.tipo,
    normalizeCategoria(movement.categoria),
    amountKey,
    movement.fecha,
    normalizeCurrency(movement.moneda),
    exchangeRateKey,
    normalizeLookupText(movement.descripcion),
  ].join("|");
};

const normalizeMovementInput = (item: {
  tipo: string;
  categoria: string;
  monto: number;
  fecha: string;
  descripcion?: string;
  moneda?: string;
  tipo_cambio?: number;
  proyecto?: Id<"desarrollos">;
}) => {
  const fecha = normalizeDate(item.fecha);
  const monto = Math.abs(item.monto);
  const moneda = normalizeCurrency(item.moneda);

  if (!Number.isFinite(monto) || monto === 0 || !isValidDate(fecha)) {
    return null;
  }

  return {
    tipo: normalizeTipo(item.tipo),
    categoria: normalizeCategoria(item.categoria),
    monto,
    fecha,
    descripcion: item.descripcion?.trim() || undefined,
    moneda,
    tipo_cambio: moneda === "MXN" ? undefined : normalizeExchangeRate(item.tipo_cambio),
    proyecto: item.proyecto,
  };
};

const normalizeDeliveryNoteInput = (item: {
  nota_recepcion_status?: "parcial" | "completa";
  nota_recepcion_storage_id?: Id<"_storage">;
  nota_recepcion_nombre?: string;
  nota_recepcion_type?: string;
  nota_recepcion_size?: number;
  nota_recepcion_uploaded_at?: number;
}) => {
  const hasAnyNoteField = Boolean(
    item.nota_recepcion_status ||
    item.nota_recepcion_storage_id ||
    item.nota_recepcion_nombre ||
    item.nota_recepcion_type ||
    item.nota_recepcion_size ||
    item.nota_recepcion_uploaded_at
  );

  if (!hasAnyNoteField) return {};

  if (!item.nota_recepcion_status || !item.nota_recepcion_storage_id || !item.nota_recepcion_nombre?.trim()) {
    throw new Error("La nota de recepcion requiere archivo y estado.");
  }

  return {
    nota_recepcion_status: item.nota_recepcion_status,
    nota_recepcion_storage_id: item.nota_recepcion_storage_id,
    nota_recepcion_nombre: item.nota_recepcion_nombre.trim(),
    nota_recepcion_type: item.nota_recepcion_type?.trim() || "application/octet-stream",
    nota_recepcion_size: Number.isFinite(item.nota_recepcion_size) && item.nota_recepcion_size! >= 0
      ? item.nota_recepcion_size
      : 0,
    nota_recepcion_uploaded_at: Number.isFinite(item.nota_recepcion_uploaded_at)
      ? item.nota_recepcion_uploaded_at
      : Date.now(),
  };
};

const isActiveMovement = (movement: Pick<OgcMovement, "status">) => {
  return ACTIVE_STATUSES.has(movement.status);
};

const serializeMovement = (movement: OgcMovement) => {
  return JSON.stringify(movement);
};

const assertMovementAccess = async (ctx: QueryCtx | MutationCtx, movement: OgcMovement, user: CurrentUser) => {
  if (hasGlobalAdminAccess(user)) return;

  const organizationId = getScopedOrganizationId(user);
  if (!movement.proyecto) {
    if (movement.organization_id === organizationId) return;
    throw new Error("No tienes acceso a este movimiento.");
  }

  if (movement.organization_id && movement.organization_id !== organizationId) {
    throw new Error("No tienes acceso a este movimiento.");
  }

  const hasAccess = await checkDesarrolloAccess(ctx, movement.proyecto);
  if (!hasAccess) {
    throw new Error("No tienes acceso a este movimiento.");
  }
};

const auditMovement = async (
  ctx: MutationCtx,
  args: {
    movimiento_id: Id<"ogc_movimientos">;
    action: string;
    user: CurrentUser;
    organization_id?: string;
    reason?: string;
    before?: OgcMovement;
    after?: OgcMovement;
  }
) => {
  await ctx.db.insert("ogc_movimientos_audit", {
    movimiento_id: args.movimiento_id,
    action: args.action,
    reason: args.reason?.trim() || undefined,
    before_json: args.before ? serializeMovement(args.before) : undefined,
    after_json: args.after ? serializeMovement(args.after) : undefined,
    actor_id: args.user._id,
    actor_name: args.user.name,
    organization_id: args.organization_id,
    created_at: Date.now(),
  });
};

const findActiveDuplicate = async (
  ctx: MutationCtx,
  duplicateKey: string,
  exceptId?: Id<"ogc_movimientos">
) => {
  const matches = await ctx.db
    .query("ogc_movimientos")
    .withIndex("by_duplicate_key", (q) => q.eq("duplicate_key", duplicateKey))
    .collect();

  return matches.find((movement) => movement._id !== exceptId && isActiveMovement(movement));
};

export const getAll = query({
  args: {
    includeInactive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const allMovements = await ctx.db.query("ogc_movimientos").collect();
    const includeInactive = args.includeInactive ?? true;

    const allowedIds = new Set(user.allowed_desarrollos.map((id) => id as string));

    return allMovements
      .filter((movement) => includeInactive || isActiveMovement(movement))
      .filter((movement) => {
        if (hasGlobalAdminAccess(user)) {
          return true;
        }

        if (user.organization_id && movement.organization_id === user.organization_id) {
          return true;
        }

        if (!movement.proyecto) {
          return false;
        }

        return allowedIds.has(movement.proyecto as string);
      })
      .sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
  },
});

export const getAudit = query({
  args: {
    movimiento_id: v.id("ogc_movimientos"),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const movement = await ctx.db.get(args.movimiento_id);
    if (!movement) return [];

    await assertMovementAccess(ctx, movement, user);

    return await ctx.db
      .query("ogc_movimientos_audit")
      .withIndex("by_movimiento", (q) => q.eq("movimiento_id", args.movimiento_id))
      .collect();
  },
});

export const generateUploadUrl = mutation({
  handler: async (ctx) => {
    await assertCanWrite(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const validateBulkCreate = mutation({
  args: {
    movimientos: v.array(ogcMovementInputValidator),
  },
  handler: async (ctx, args) => {
    const user = await assertCanWrite(ctx);
    const organizationId = getScopedOrganizationId(user);
    const validRows: number[] = [];
    const duplicateRows: number[] = [];
    const rejectedRows: number[] = [];
    const pendingDuplicateKeys = new Set<string>();

    for (const [index, item] of args.movimientos.entries()) {
      const row = item.fila_origen ?? index + 1;
      const normalized = normalizeMovementInput(item);

      if (!normalized) {
        rejectedRows.push(row);
        continue;
      }

      if (normalized.proyecto) {
        const hasAccess = await checkDesarrolloAccess(ctx, normalized.proyecto);
        if (!hasAccess) {
          throw new Error("No tienes acceso a una de las obras seleccionadas.");
        }
      }

      const duplicateKey = buildDuplicateKey(normalized, organizationId);
      const duplicate = await findActiveDuplicate(ctx, duplicateKey);
      if (duplicate || pendingDuplicateKeys.has(duplicateKey)) {
        duplicateRows.push(row);
      } else {
        pendingDuplicateKeys.add(duplicateKey);
        validRows.push(row);
      }
    }

    return { validRows, duplicateRows, rejectedRows };
  },
});

export const bulkCreate = mutation({
  args: {
    movimientos: v.array(ogcMovementInputValidator),
  },
  handler: async (ctx, args) => {
    const user = await assertCanWrite(ctx);
    const organizationId = getScopedOrganizationId(user);
    const ids: Id<"ogc_movimientos">[] = [];
    const now = Date.now();
    let skippedDuplicates = 0;
    let rejected = 0;

    for (const item of args.movimientos) {
      const normalized = normalizeMovementInput(item);
      if (!normalized) {
        rejected += 1;
        continue;
      }

      if (normalized.proyecto) {
        const hasAccess = await checkDesarrolloAccess(ctx, normalized.proyecto);
        if (!hasAccess) {
          throw new Error("No tienes acceso a una de las obras seleccionadas.");
        }
      }

      const duplicateKey = buildDuplicateKey(normalized, organizationId);
      const duplicate = await findActiveDuplicate(ctx, duplicateKey);
      if (duplicate) {
        skippedDuplicates += 1;
        continue;
      }

      const deliveryNote = normalizeDeliveryNoteInput(item);
      const id = await ctx.db.insert("ogc_movimientos", {
        ...normalized,
        archivo_origen: item.archivo_origen,
        fila_origen: item.fila_origen,
        ...deliveryNote,
        status: "activo",
        duplicate_key: duplicateKey,
        reconciled: false,
        organization_id: organizationId,
        created_by_id: user._id,
        created_by_name: user.name,
        created_at: now,
      });

      const after = await ctx.db.get(id);
      if (after) {
        await auditMovement(ctx, {
          movimiento_id: id,
          action: "created",
          user,
          organization_id: organizationId,
          after,
        });
      }

      ids.push(id);
    }

    return { created: ids.length, ids, skippedDuplicates, rejected };
  },
});

export const update = mutation({
  args: {
    id: v.id("ogc_movimientos"),
    patch: v.object({
      tipo: v.optional(v.string()),
      categoria: v.optional(v.string()),
      monto: v.optional(v.number()),
      fecha: v.optional(v.string()),
      descripcion: v.optional(v.string()),
      moneda: v.optional(v.string()),
      tipo_cambio: v.optional(v.number()),
      proyecto: v.optional(v.union(v.id("desarrollos"), v.null())),
    }),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await assertCanWrite(ctx);
    const before = await ctx.db.get(args.id);
    if (!before) throw new Error("Movimiento no encontrado.");
    await assertMovementAccess(ctx, before, user);
    if (!isActiveMovement(before)) throw new Error("Solo se pueden editar movimientos activos.");

    const projectPatch = "proyecto" in args.patch
      ? args.patch.proyecto === null ? undefined : args.patch.proyecto
      : before.proyecto;

    if (projectPatch) {
      const hasAccess = await checkDesarrolloAccess(ctx, projectPatch);
      if (!hasAccess) throw new Error("No tienes acceso a la obra seleccionada.");
    }

    const normalized = normalizeMovementInput({
      tipo: args.patch.tipo ?? before.tipo,
      categoria: args.patch.categoria ?? before.categoria,
      monto: args.patch.monto ?? before.monto,
      fecha: args.patch.fecha ?? before.fecha,
      descripcion: args.patch.descripcion ?? before.descripcion,
      moneda: args.patch.moneda ?? before.moneda,
      tipo_cambio: args.patch.tipo_cambio ?? before.tipo_cambio,
      proyecto: projectPatch,
    });
    if (!normalized) throw new Error("Movimiento invalido.");

    const organizationId = before.organization_id;
    const duplicateKey = buildDuplicateKey(normalized, organizationId);
    const duplicate = await findActiveDuplicate(ctx, duplicateKey, args.id);
    if (duplicate) {
      throw new Error("Ya existe un movimiento activo con los mismos datos.");
    }

    await ctx.db.patch(args.id, {
      ...normalized,
      duplicate_key: duplicateKey,
      updated_by_id: user._id,
      updated_by_name: user.name,
      updated_at: Date.now(),
    });

    const after = await ctx.db.get(args.id);
    if (after) {
      await auditMovement(ctx, {
        movimiento_id: args.id,
        action: "updated",
        reason: args.reason,
        user,
        organization_id: before.organization_id,
        before,
        after,
      });
    }

    return { ok: true };
  },
});

export const voidMovement = mutation({
  args: {
    id: v.id("ogc_movimientos"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await assertCanWrite(ctx);
    const before = await ctx.db.get(args.id);
    if (!before) throw new Error("Movimiento no encontrado.");
    await assertMovementAccess(ctx, before, user);
    if (!isActiveMovement(before)) throw new Error("Este movimiento ya no esta activo.");

    const reason = args.reason.trim();
    if (!reason) throw new Error("Captura un motivo de anulacion.");

    await ctx.db.patch(args.id, {
      status: "anulado",
      void_reason: reason,
      voided_by_id: user._id,
      voided_by_name: user.name,
      voided_at: Date.now(),
      updated_by_id: user._id,
      updated_by_name: user.name,
      updated_at: Date.now(),
    });

    const after = await ctx.db.get(args.id);
    if (after) {
      await auditMovement(ctx, {
        movimiento_id: args.id,
        action: "voided",
        reason,
        user,
        organization_id: before.organization_id,
        before,
        after,
      });
    }

    return { ok: true };
  },
});

export const reconcile = mutation({
  args: {
    id: v.id("ogc_movimientos"),
    reconciled: v.boolean(),
    reference: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await assertCanWrite(ctx);
    const before = await ctx.db.get(args.id);
    if (!before) throw new Error("Movimiento no encontrado.");
    await assertMovementAccess(ctx, before, user);
    if (!isActiveMovement(before)) throw new Error("Solo se pueden conciliar movimientos activos.");

    await ctx.db.patch(args.id, {
      reconciled: args.reconciled,
      reconciliation_reference: args.reconciled ? args.reference?.trim() || undefined : undefined,
      reconciliation_note: args.reconciled ? args.note?.trim() || undefined : undefined,
      reconciled_by_id: args.reconciled ? user._id : undefined,
      reconciled_by_name: args.reconciled ? user.name : undefined,
      reconciled_at: args.reconciled ? Date.now() : undefined,
      updated_by_id: user._id,
      updated_by_name: user.name,
      updated_at: Date.now(),
    });

    const after = await ctx.db.get(args.id);
    if (after) {
      await auditMovement(ctx, {
        movimiento_id: args.id,
        action: args.reconciled ? "reconciled" : "unreconciled",
        user,
        organization_id: before.organization_id,
        before,
        after,
      });
    }

    return { ok: true };
  },
});

export const markDuplicate = mutation({
  args: {
    id: v.id("ogc_movimientos"),
    duplicate_of: v.optional(v.id("ogc_movimientos")),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await assertCanWrite(ctx);
    const before = await ctx.db.get(args.id);
    if (!before) throw new Error("Movimiento no encontrado.");
    await assertMovementAccess(ctx, before, user);
    if (!isActiveMovement(before)) throw new Error("Este movimiento ya no esta activo.");

    if (args.duplicate_of) {
      if (args.duplicate_of === args.id) throw new Error("Un movimiento no puede duplicarse contra si mismo.");
      const original = await ctx.db.get(args.duplicate_of);
      if (!original) throw new Error("Movimiento original no encontrado.");
      await assertMovementAccess(ctx, original, user);
    }

    await ctx.db.patch(args.id, {
      status: "duplicado",
      duplicate_of: args.duplicate_of,
      updated_by_id: user._id,
      updated_by_name: user.name,
      updated_at: Date.now(),
    });

    const after = await ctx.db.get(args.id);
    if (after) {
      await auditMovement(ctx, {
        movimiento_id: args.id,
        action: "marked_duplicate",
        reason: args.reason,
        user,
        organization_id: before.organization_id,
        before,
        after,
      });
    }

    return { ok: true };
  },
});
