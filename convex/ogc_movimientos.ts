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
import {
  classifyOgcImportDuplicate,
  getOgcImportCompletionStatus,
  isOgcImportLeaseActive,
  isValidOgcImportFile,
} from "./ogcImportRules";

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
const deliveryNoteDocumentValidator = v.object({
  storage_id: v.id("_storage"),
  nombre: v.string(),
  type: v.string(),
  size: v.number(),
  uploaded_at: v.number(),
});
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
  nota_recepcion_documentos: v.optional(v.array(deliveryNoteDocumentValidator)),
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
  nota_recepcion_documentos?: Array<{
    storage_id: Id<"_storage">;
    nombre: string;
    type: string;
    size: number;
    uploaded_at: number;
  }>;
}) => {
  const explicitDocuments = item.nota_recepcion_documentos || [];
  const hasAnyNoteField = Boolean(
    item.nota_recepcion_status ||
    item.nota_recepcion_storage_id ||
    item.nota_recepcion_nombre ||
    item.nota_recepcion_type ||
    item.nota_recepcion_size ||
    item.nota_recepcion_uploaded_at ||
    explicitDocuments.length > 0
  );

  if (!hasAnyNoteField) return {};

  const legacyDocument = item.nota_recepcion_storage_id && item.nota_recepcion_nombre?.trim()
    ? [{
      storage_id: item.nota_recepcion_storage_id,
      nombre: item.nota_recepcion_nombre.trim(),
      type: item.nota_recepcion_type?.trim() || "application/octet-stream",
      size: Number.isFinite(item.nota_recepcion_size) && item.nota_recepcion_size! >= 0 ? item.nota_recepcion_size : 0,
      uploaded_at: Number.isFinite(item.nota_recepcion_uploaded_at) ? item.nota_recepcion_uploaded_at! : Date.now(),
    }]
    : [];

  const documents = explicitDocuments.length > 0 ? explicitDocuments : legacyDocument;

  if (!item.nota_recepcion_status || documents.length === 0) {
    throw new Error("La nota de recepcion requiere archivo y estado.");
  }

  const normalizedDocuments = documents.map((document) => {
    const name = document.nombre.trim();
    const size = Number(document.size);
    const uploadedAt = Number(document.uploaded_at);
    if (!name) throw new Error("Cada documento de recepcion requiere nombre.");

    return {
      storage_id: document.storage_id,
      nombre: name,
      type: document.type?.trim() || "application/octet-stream",
      size: Number.isFinite(size) && size >= 0 ? size : 0,
      uploaded_at: Number.isFinite(uploadedAt) ? uploadedAt : Date.now(),
    };
  });

  const primaryDocument = normalizedDocuments[0];

  return {
    nota_recepcion_status: item.nota_recepcion_status,
    nota_recepcion_storage_id: primaryDocument.storage_id,
    nota_recepcion_nombre: primaryDocument.nombre,
    nota_recepcion_type: primaryDocument.type,
    nota_recepcion_size: primaryDocument.size,
    nota_recepcion_uploaded_at: primaryDocument.uploaded_at,
    nota_recepcion_documentos: normalizedDocuments,
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

const findActiveDuplicates = async (
  ctx: MutationCtx,
  duplicateKey: string,
  exceptId?: Id<"ogc_movimientos">
) => {
  const matches = await ctx.db
    .query("ogc_movimientos")
    .withIndex("by_duplicate_key", (q) => q.eq("duplicate_key", duplicateKey))
    .collect();

  return matches.filter((movement) => movement._id !== exceptId && isActiveMovement(movement));
};

const findActiveDuplicate = async (
  ctx: MutationCtx,
  duplicateKey: string,
  exceptId?: Id<"ogc_movimientos">
) => {
  return (await findActiveDuplicates(ctx, duplicateKey, exceptId))[0];
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

    const visibleMovements = allMovements
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

    const importIds = Array.from(new Set(
      visibleMovements.flatMap((movement) => movement.importacion_id ? [movement.importacion_id] : [])
    ));
    const imports = await Promise.all(importIds.map((id) => ctx.db.get(id)));
    const importById = new Map(imports.flatMap((importRecord) => (
      importRecord ? [[String(importRecord._id), importRecord] as const] : []
    )));

    const importUrlById = new Map<string, string | null>();
    await Promise.all(imports.map(async (importRecord) => {
      if (!importRecord) return;
      importUrlById.set(
        String(importRecord._id),
        importRecord.storage_id ? await ctx.storage.getUrl(importRecord.storage_id) : null
      );
    }));

    return visibleMovements.map((movement) => {
      const importRecord = movement.importacion_id
        ? importById.get(String(movement.importacion_id))
        : undefined;
      if (!importRecord) return movement;

      return {
        ...movement,
        importacion: {
          _id: importRecord._id,
          nombre: importRecord.nombre,
          type: importRecord.type,
          size: importRecord.size,
          imported_at: importRecord.imported_at,
          imported_by_name: importRecord.imported_by_name,
          url: importUrlById.get(String(importRecord._id)) || null,
        },
      };
    });
  },
});

export const getIncomeTotalsByProyecto = query({
  args: { proyecto_id: v.id("desarrollos") },
  handler: async (ctx, args) => {
    const hasAccess = await checkDesarrolloAccess(ctx, args.proyecto_id);
    if (!hasAccess) {
      throw new Error("No tienes acceso a esta obra.");
    }

    const movements = await ctx.db
      .query("ogc_movimientos")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto_id))
      .collect();

    const activeIncomeMovements = movements.filter((movement) => (
      movement.tipo === "ingreso" && isActiveMovement(movement)
    ));

    const total_ingresos = activeIncomeMovements.reduce((sum, movement) => {
      const monto = Math.abs(movement.monto || 0);
      const moneda = (movement.moneda || "MXN").toUpperCase();
      if (moneda === "MXN") return sum + monto;
      return sum + monto * (movement.tipo_cambio || 0);
    }, 0);

    return {
      proyecto: args.proyecto_id,
      total_ingresos,
      total_count: activeIncomeMovements.length,
      last_updated: Date.now(),
    };
  },
});

export const getIncomeByProyecto = query({
  args: { proyecto_id: v.id("desarrollos") },
  handler: async (ctx, args) => {
    const hasAccess = await checkDesarrolloAccess(ctx, args.proyecto_id);
    if (!hasAccess) {
      throw new Error("No tienes acceso a esta obra.");
    }

    const movements = await ctx.db
      .query("ogc_movimientos")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto_id))
      .collect();

    return movements
      .filter((movement) => movement.tipo === "ingreso" && isActiveMovement(movement))
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

const assertImportAccess = (importRecord: Doc<"ogc_movimientos_importaciones">, user: CurrentUser) => {
  if (hasGlobalAdminAccess(user)) return;
  const organizationId = getScopedOrganizationId(user);
  const hasAccess = organizationId
    ? importRecord.organization_id === organizationId
    : importRecord.imported_by_id === user._id;
  if (!hasAccess) {
    throw new Error("No tienes acceso a esta importacion.");
  }
};

const getImportScopeKey = (user: CurrentUser, organizationId?: string) => {
  return organizationId ? `organization:${organizationId}` : `user:${user._id}`;
};

export const startImport = mutation({
  args: {
    nombre: v.string(),
    type: v.string(),
    size: v.number(),
    file_hash: v.string(),
    total_filas: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await assertCanWrite(ctx);
    const organizationId = getScopedOrganizationId(user);
    const scopeKey = getImportScopeKey(user, organizationId);
    const nombre = args.nombre.trim();
    const fileHash = args.file_hash.trim().toLowerCase();
    if (!nombre) throw new Error("El archivo de importacion requiere nombre.");
    if (!isValidOgcImportFile(nombre, args.size, fileHash)) {
      throw new Error("El archivo de importacion no es un Excel valido o excede el limite permitido.");
    }
    if (!Number.isInteger(args.total_filas) || args.total_filas < 1) throw new Error("La importacion no contiene filas validas.");

    const existing = await ctx.db
      .query("ogc_movimientos_importaciones")
      .withIndex("by_scope_file_hash", (q) => (
        q.eq("scope_key", scopeKey).eq("file_hash", fileHash)
      ))
      .first();

    const existingStorageMetadata = existing?.storage_id
      ? await ctx.storage.getMetadata(existing.storage_id)
      : null;

    if (existing?.status === "completada" && existingStorageMetadata) {
      return {
        id: existing._id,
        needs_upload: false,
        already_completed: true,
        already_in_progress: false,
      };
    }

    if (
      existing && isOgcImportLeaseActive(
        existing.status,
        existing.updated_at || existing.imported_at,
        Date.now()
      )
    ) {
      return {
        id: existing._id,
        needs_upload: !existingStorageMetadata,
        already_completed: false,
        already_in_progress: true,
      };
    }

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...(!existingStorageMetadata ? {
          nombre,
          type: args.type.trim() || existing.type,
          size: args.size,
          storage_id: undefined,
        } : {}),
        status: "procesando",
        total_filas: args.total_filas,
        updated_at: Date.now(),
        completed_at: undefined,
      });
      return {
        id: existing._id,
        needs_upload: !existingStorageMetadata,
        already_completed: false,
        already_in_progress: false,
      };
    }

    const id = await ctx.db.insert("ogc_movimientos_importaciones", {
      nombre,
      type: args.type.trim() || "application/octet-stream",
      size: args.size,
      file_hash: fileHash,
      status: "procesando",
      total_filas: args.total_filas,
      movimientos_creados: 0,
      duplicados_omitidos: 0,
      rechazados: 0,
      organization_id: organizationId,
      scope_key: scopeKey,
      imported_by_id: user._id,
      imported_by_name: user.name,
      imported_at: Date.now(),
      updated_at: Date.now(),
    });
    return { id, needs_upload: true, already_completed: false, already_in_progress: false };
  },
});

export const attachImportFile = mutation({
  args: {
    id: v.id("ogc_movimientos_importaciones"),
    storage_id: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const user = await assertCanWrite(ctx);
    const importRecord = await ctx.db.get(args.id);
    if (!importRecord) throw new Error("Importacion no encontrada.");
    assertImportAccess(importRecord, user);
    if (importRecord.status !== "procesando") throw new Error("La importacion ya no acepta archivos.");
    if (importRecord.storage_id) {
      if (importRecord.storage_id === args.storage_id) return { ok: true };
      throw new Error("La importacion ya tiene un archivo asociado.");
    }

    const metadata = await ctx.storage.getMetadata(args.storage_id);
    if (!metadata) throw new Error("El archivo no existe en Convex Storage.");
    if (metadata.sha256.toLowerCase() !== importRecord.file_hash) {
      throw new Error("El archivo guardado no corresponde al Excel validado.");
    }
    if (metadata.size !== importRecord.size) {
      throw new Error("El tamano del archivo guardado no coincide con el Excel validado.");
    }

    await ctx.db.patch(args.id, {
      storage_id: args.storage_id,
      type: metadata.contentType || importRecord.type,
      size: metadata.size,
      updated_at: Date.now(),
    });
    return { ok: true };
  },
});

export const completeImport = mutation({
  args: {
    id: v.id("ogc_movimientos_importaciones"),
    duplicados_omitidos: v.number(),
    rechazados: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await assertCanWrite(ctx);
    const importRecord = await ctx.db.get(args.id);
    if (!importRecord) throw new Error("Importacion no encontrada.");
    assertImportAccess(importRecord, user);
    if (!importRecord.storage_id) throw new Error("La importacion no tiene un archivo asociado.");

    const movements = await ctx.db
      .query("ogc_movimientos")
      .withIndex("by_importacion", (q) => q.eq("importacion_id", args.id))
      .collect();
    const duplicates = Math.max(0, Math.floor(args.duplicados_omitidos));
    const rejected = Math.max(0, Math.floor(args.rechazados));
    const status = getOgcImportCompletionStatus({
      totalRows: importRecord.total_filas,
      linkedMovements: movements.length,
      skippedDuplicates: duplicates,
      rejectedRows: rejected,
    });

    await ctx.db.patch(args.id, {
      status,
      movimientos_creados: movements.length,
      duplicados_omitidos: duplicates,
      rechazados: rejected,
      updated_at: Date.now(),
      completed_at: Date.now(),
    });
    return { ok: true, status };
  },
});

export const failImport = mutation({
  args: { id: v.id("ogc_movimientos_importaciones") },
  handler: async (ctx, args) => {
    const user = await assertCanWrite(ctx);
    const importRecord = await ctx.db.get(args.id);
    if (!importRecord) return { ok: true };
    assertImportAccess(importRecord, user);
    const movements = await ctx.db
      .query("ogc_movimientos")
      .withIndex("by_importacion", (q) => q.eq("importacion_id", args.id))
      .collect();
    await ctx.db.patch(args.id, {
      status: "parcial",
      movimientos_creados: movements.length,
      updated_at: Date.now(),
      completed_at: Date.now(),
    });
    return { ok: true };
  },
});

export const validateBulkCreate = mutation({
  args: {
    movimientos: v.array(ogcMovementInputValidator),
    allow_repeated_rows: v.optional(v.boolean()),
    file_hash: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await assertCanWrite(ctx);
    const organizationId = getScopedOrganizationId(user);
    const scopeKey = getImportScopeKey(user, organizationId);
    const validRows: number[] = [];
    const duplicateRows: number[] = [];
    const rejectedRows: number[] = [];
    const pendingDuplicateKeys = new Set<string>();
    const fileHash = args.file_hash?.trim().toLowerCase();
    const existingImport = fileHash && /^[a-f0-9]{64}$/.test(fileHash)
      ? await ctx.db
        .query("ogc_movimientos_importaciones")
        .withIndex("by_scope_file_hash", (q) => (
          q.eq("scope_key", scopeKey).eq("file_hash", fileHash)
        ))
        .first()
      : null;

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
      const duplicates = await findActiveDuplicates(ctx, duplicateKey);
      const duplicateDisposition = classifyOgcImportDuplicate(
        duplicates.map((movement) => ({
          importacionId: movement.importacion_id ? String(movement.importacion_id) : undefined,
          filaOrigen: movement.fila_origen,
        })),
        existingImport?.status !== "completada" ? String(existingImport?._id || "") || undefined : undefined,
        item.fila_origen
      );
      const isDatabaseDuplicate = duplicateDisposition === "external_duplicate" ||
        (existingImport?.status === "completada" && duplicates.length > 0);
      if (isDatabaseDuplicate || (!args.allow_repeated_rows && pendingDuplicateKeys.has(duplicateKey))) {
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
    importacion_id: v.optional(v.id("ogc_movimientos_importaciones")),
  },
  handler: async (ctx, args) => {
    const user = await assertCanWrite(ctx);
    const organizationId = getScopedOrganizationId(user);
    const importRecord = args.importacion_id ? await ctx.db.get(args.importacion_id) : null;
    if (args.importacion_id && !importRecord) throw new Error("Importacion no encontrada.");
    if (importRecord) {
      assertImportAccess(importRecord, user);
      if (importRecord.status !== "procesando" || !importRecord.storage_id) {
        throw new Error("La importacion no esta lista para recibir movimientos.");
      }
    }
    const ids: Id<"ogc_movimientos">[] = [];
    const now = Date.now();
    let skippedDuplicates = 0;
    let alreadyImported = 0;
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
      const duplicates = await findActiveDuplicates(ctx, duplicateKey);
      const duplicateDisposition = classifyOgcImportDuplicate(
        duplicates.map((movement) => ({
          importacionId: movement.importacion_id ? String(movement.importacion_id) : undefined,
          filaOrigen: movement.fila_origen,
        })),
        args.importacion_id ? String(args.importacion_id) : undefined,
        item.fila_origen
      );
      if (duplicateDisposition !== "create") {
        if (duplicateDisposition === "already_imported") {
          alreadyImported += 1;
        } else {
          skippedDuplicates += 1;
        }
        continue;
      }

      const deliveryNote = normalizeDeliveryNoteInput(item);
      const id = await ctx.db.insert("ogc_movimientos", {
        ...normalized,
        archivo_origen: importRecord?.nombre || item.archivo_origen,
        fila_origen: item.fila_origen,
        importacion_id: args.importacion_id,
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

    if (args.importacion_id) {
      await ctx.db.patch(args.importacion_id, { updated_at: Date.now() });
    }

    return { created: ids.length, ids, skippedDuplicates, alreadyImported, rejected };
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
