import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import {
  assertAdmin,
  assertCanWrite,
  checkDesarrolloAccess,
  getCurrentUserOrThrow,
} from "./permissions";
import {
  buildProviderMatchIndex,
  classifyProviderMatch,
  cleanOptional,
  isGenericProviderName,
  isProviderComplete,
  normalizeProviderName,
  normalizeRfc,
} from "./providerUtils";
import {
  markInvoicesStaleForProvider,
  markInvoicesStaleForTransaction,
} from "./invoiceIntegrity";

const providerTypeValidator = v.union(v.literal("regular"), v.literal("generico"));

const providerFields = {
  razon_social: v.string(),
  rfc: v.optional(v.string()),
  direccion: v.optional(v.string()),
  nombre_contacto: v.optional(v.string()),
  telefono_contacto: v.optional(v.string()),
  cuenta: v.optional(v.string()),
  clabe: v.optional(v.string()),
  banco: v.optional(v.string()),
  tipo: v.optional(providerTypeValidator),
};

function enrichProvider(provider: Doc<"proveedores">, creatorName: string | null = null) {
  const tipo = provider.tipo || (isGenericProviderName(provider.razon_social) ? "generico" : "regular");
  return {
    ...provider,
    tipo,
    creator_name: creatorName,
    is_complete: isProviderComplete({ ...provider, tipo }),
    is_archived: Boolean(provider.archived_at),
  };
}

async function findByNormalizedName(
  ctx: QueryCtx | MutationCtx,
  normalizedName: string
) {
  const indexed = await ctx.db
    .query("proveedores")
    .withIndex("by_razon_social_normalizada", (q) =>
      q.eq("razon_social_normalizada", normalizedName)
    )
    .collect();
  const legacy = (await ctx.db.query("proveedores").collect()).filter(
    (provider) =>
      !provider.razon_social_normalizada &&
      normalizeProviderName(provider.razon_social) === normalizedName
  );
  return [...new Map([...indexed, ...legacy].map((provider) => [provider._id, provider])).values()];
}

async function assertProviderUniqueness(
  ctx: MutationCtx,
  normalizedName: string,
  normalizedRfc: string | undefined,
  excludingId?: Id<"proveedores">
) {
  const sameName = (await findByNormalizedName(ctx, normalizedName)).filter(
    (provider: Doc<"proveedores">) => provider._id !== excludingId && !provider.merged_into
  );
  if (sameName.length > 0) {
    throw new Error("Ya existe un proveedor con una razón social equivalente.");
  }

  if (normalizedRfc) {
    const indexedRfcs = await ctx.db
      .query("proveedores")
      .withIndex("by_rfc_normalizado", (q) => q.eq("rfc_normalizado", normalizedRfc))
      .collect();
    const legacyRfcs = (await ctx.db.query("proveedores").collect()).filter(
      (provider) => !provider.rfc_normalizado && normalizeRfc(provider.rfc) === normalizedRfc
    );
    const sameRfc = [...new Map(
      [...indexedRfcs, ...legacyRfcs].map((provider) => [provider._id, provider])
    ).values()].find(
        (provider: Doc<"proveedores">) =>
          provider._id !== excludingId && !provider.merged_into
      );
    if (sameRfc && !sameRfc.merged_into) {
      throw new Error("El RFC ya está registrado en otro proveedor.");
    }
  }
}

async function getCreatorName(ctx: QueryCtx, provider: Doc<"proveedores">) {
  if (!provider.created_by) return null;
  const creator = await ctx.db.get(provider.created_by);
  return creator?.name || null;
}

// Active provider summaries used by selectors and requisitions.
export const getAll = query(async (ctx) => {
  await getCurrentUserOrThrow(ctx);
  const providers = await ctx.db.query("proveedores").collect();
  const active = providers.filter((provider) => !provider.archived_at && !provider.merged_into);
  return await Promise.all(
    active.map(async (provider) => enrichProvider(provider, await getCreatorName(ctx, provider)))
  );
});

export const getAllWithStats = query({
  args: {
    include_archived: v.optional(v.boolean()),
    proyecto_id: v.optional(v.id("desarrollos")),
  },
  handler: async (ctx, args) => {
    await assertAdmin(ctx);
    const [providers, transactions] = await Promise.all([
      ctx.db.query("proveedores").collect(),
      ctx.db.query("transacciones").collect(),
    ]);

    const stats = new Map<string, { count: number; amount: number; projects: Set<string> }>();
    for (const transaction of transactions) {
      if (args.proyecto_id && transaction.proyecto !== args.proyecto_id) continue;
      if (!transaction.proveedor_id) continue;
      const key = transaction.proveedor_id as string;
      const current = stats.get(key) || { count: 0, amount: 0, projects: new Set<string>() };
      current.count += 1;
      current.amount += transaction.monto_total;
      current.projects.add(transaction.proyecto as string);
      stats.set(key, current);
    }

    return await Promise.all(
      providers
        .filter((provider) => !provider.merged_into)
        .filter((provider) => args.include_archived || !provider.archived_at)
        .filter((provider) => !args.proyecto_id || stats.has(provider._id as string))
        .map(async (provider) => {
          const providerStats = stats.get(provider._id as string);
          return {
            ...enrichProvider(provider, await getCreatorName(ctx, provider)),
            transaccionesCount: providerStats?.count || 0,
            totalAmount: providerStats?.amount || 0,
            proyectosCount: providerStats?.projects.size || 0,
          };
        })
    );
  },
});

export const getByProyectoWithStats = query({
  args: { proyecto_id: v.id("desarrollos") },
  handler: async (ctx, args) => {
    if (!(await checkDesarrolloAccess(ctx, args.proyecto_id))) {
      throw new Error("No tienes acceso a este proyecto.");
    }

    const transactions = await ctx.db
      .query("transacciones")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto_id))
      .collect();
    const grouped = new Map<string, { count: number; amount: number }>();
    for (const transaction of transactions) {
      if (!transaction.proveedor_id) continue;
      const key = transaction.proveedor_id as string;
      const current = grouped.get(key) || { count: 0, amount: 0 };
      current.count += 1;
      current.amount += transaction.monto_total;
      grouped.set(key, current);
    }

    const results = [];
    for (const [providerId, stats] of grouped) {
      const provider = await ctx.db.get(providerId as Id<"proveedores">);
      if (!provider) continue;
      results.push({
        ...enrichProvider(provider, await getCreatorName(ctx, provider)),
        transaccionesCount: stats.count,
        totalAmount: stats.amount,
      });
    }
    return results;
  },
});

export const getById = query({
  args: { id: v.id("proveedores") },
  handler: async (ctx, args) => {
    await getCurrentUserOrThrow(ctx);
    const provider = await ctx.db.get(args.id);
    return provider ? enrichProvider(provider, await getCreatorName(ctx, provider)) : null;
  },
});

export const getByRFC = query({
  args: { rfc: v.string() },
  handler: async (ctx, args) => {
    await getCurrentUserOrThrow(ctx);
    const normalized = normalizeRfc(args.rfc);
    if (!normalized) return null;
    const indexedProvider = await ctx.db
      .query("proveedores")
      .withIndex("by_rfc_normalizado", (q) => q.eq("rfc_normalizado", normalized))
      .first();
    const provider = indexedProvider || (await ctx.db.query("proveedores").collect()).find(
      (candidate) => !candidate.rfc_normalizado && normalizeRfc(candidate.rfc) === normalized
    );
    return provider ? enrichProvider(provider, await getCreatorName(ctx, provider)) : null;
  },
});

export const matchByNames = query({
  args: { names: v.array(v.string()) },
  handler: async (ctx, args) => {
    await getCurrentUserOrThrow(ctx);
    const providersByName = buildProviderMatchIndex(
      await ctx.db.query("proveedores").collect(),
    );
    const results = [];
    for (const name of [...new Set(args.names.map((value) => value.trim()).filter(Boolean))]) {
      const match = classifyProviderMatch(name, providersByName);
      results.push({
        name,
        normalized: match.normalized,
        status: match.status === "unmatched" ? "new" as const : match.status,
        provider_id: match.provider?._id,
        matches: match.matches.map((provider) => ({
          _id: provider._id,
          razon_social: provider.razon_social,
          archived: Boolean(provider.archived_at),
        })),
        tipo: isGenericProviderName(name) ? "generico" as const : "regular" as const,
      });
    }
    return results;
  },
});

export const create = mutation({
  args: providerFields,
  handler: async (ctx, args) => {
    const user = await assertCanWrite(ctx);
    const razonSocial = args.razon_social.trim();
    if (!razonSocial) throw new Error("La razón social es obligatoria.");
    const normalizedName = normalizeProviderName(razonSocial);
    const normalizedRfc = normalizeRfc(args.rfc);
    await assertProviderUniqueness(ctx, normalizedName, normalizedRfc);

    const tipo = args.tipo || (isGenericProviderName(razonSocial) ? "generico" : "regular");
    return await ctx.db.insert("proveedores", {
      razon_social: razonSocial,
      razon_social_normalizada: normalizedName,
      rfc: cleanOptional(args.rfc),
      rfc_normalizado: normalizedRfc,
      direccion: cleanOptional(args.direccion),
      nombre_contacto: cleanOptional(args.nombre_contacto),
      telefono_contacto: cleanOptional(args.telefono_contacto),
      cuenta: cleanOptional(args.cuenta),
      clabe: cleanOptional(args.clabe),
      banco: cleanOptional(args.banco),
      tipo,
      created_by: user._id,
      created_at: Date.now(),
      updated_at: Date.now(),
    });
  },
});

export const resolveOrCreate = mutation({
  args: { razon_social: v.string(), tipo: v.optional(providerTypeValidator) },
  handler: async (ctx, args) => {
    const user = await assertCanWrite(ctx);
    const razonSocial = args.razon_social.trim();
    if (!razonSocial) return { status: "empty" as const };
    const normalizedName = normalizeProviderName(razonSocial);
    const matches = (await findByNormalizedName(ctx, normalizedName)).filter(
      (provider: Doc<"proveedores">) => !provider.merged_into
    );
    const active = matches.filter((provider: Doc<"proveedores">) => !provider.archived_at);
    if (active.length === 1) {
      return { status: "matched" as const, provider_id: active[0]._id };
    }
    if (active.length > 1) {
      return {
        status: "conflict" as const,
        matches: active.map((provider: Doc<"proveedores">) => provider._id),
      };
    }
    if (matches.length > 0) {
      return {
        status: "archived" as const,
        matches: matches.map((provider: Doc<"proveedores">) => provider._id),
      };
    }

    const tipo = args.tipo || (isGenericProviderName(razonSocial) ? "generico" : "regular");
    const providerId = await ctx.db.insert("proveedores", {
      razon_social: razonSocial,
      razon_social_normalizada: normalizedName,
      tipo,
      created_by: user._id,
      created_at: Date.now(),
      updated_at: Date.now(),
    });
    return { status: "created" as const, provider_id: providerId };
  },
});

export const update = mutation({
  args: { id: v.id("proveedores"), ...providerFields },
  handler: async (ctx, args) => {
    const user = await assertCanWrite(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Proveedor no encontrado.");
    if (existing.archived_at) throw new Error("Reactiva el proveedor antes de editarlo.");
    if (user.role !== "admin" && existing.created_by !== user._id) {
      throw new Error("No tienes permiso para editar este proveedor.");
    }

    const razonSocial = args.razon_social.trim();
    if (!razonSocial) throw new Error("La razón social es obligatoria.");
    const normalizedName = normalizeProviderName(razonSocial);
    const normalizedRfc = normalizeRfc(args.rfc);
    await assertProviderUniqueness(ctx, normalizedName, normalizedRfc, args.id);

    const invoiceEvidenceChanged = razonSocial !== existing.razon_social ||
      normalizedRfc !== (existing.rfc_normalizado || normalizeRfc(existing.rfc)) ||
      (args.tipo || existing.tipo || "regular") !== (existing.tipo || "regular");
    if (invoiceEvidenceChanged) await markInvoicesStaleForProvider(ctx, args.id);

    await ctx.db.patch(args.id, {
      razon_social: razonSocial,
      razon_social_normalizada: normalizedName,
      rfc: cleanOptional(args.rfc),
      rfc_normalizado: normalizedRfc,
      direccion: cleanOptional(args.direccion),
      nombre_contacto: cleanOptional(args.nombre_contacto),
      telefono_contacto: cleanOptional(args.telefono_contacto),
      cuenta: cleanOptional(args.cuenta),
      clabe: cleanOptional(args.clabe),
      banco: cleanOptional(args.banco),
      tipo: args.tipo || existing.tipo || "regular",
      updated_at: Date.now(),
    });
    return args.id;
  },
});

export const archive = mutation({
  args: { id: v.id("proveedores") },
  handler: async (ctx, args) => {
    await assertAdmin(ctx);
    const user = await getCurrentUserOrThrow(ctx);
    const provider = await ctx.db.get(args.id);
    if (!provider) throw new Error("Proveedor no encontrado.");
    await markInvoicesStaleForProvider(ctx, args.id);
    await ctx.db.patch(args.id, {
      archived_at: Date.now(),
      archived_by: user._id,
      updated_at: Date.now(),
    });
    return args.id;
  },
});

export const reactivate = mutation({
  args: { id: v.id("proveedores") },
  handler: async (ctx, args) => {
    await assertAdmin(ctx);
    const user = await getCurrentUserOrThrow(ctx);
    const provider = await ctx.db.get(args.id);
    if (!provider) throw new Error("Proveedor no encontrado.");
    await assertProviderUniqueness(
      ctx,
      provider.razon_social_normalizada || normalizeProviderName(provider.razon_social),
      provider.rfc_normalizado || normalizeRfc(provider.rfc),
      provider._id
    );
    await markInvoicesStaleForProvider(ctx, args.id);
    await ctx.db.patch(args.id, {
      archived_at: undefined,
      archived_by: undefined,
      reactivated_at: Date.now(),
      reactivated_by: user._id,
      updated_at: Date.now(),
    });
    return args.id;
  },
});

export const merge = mutation({
  args: { source_id: v.id("proveedores"), target_id: v.id("proveedores") },
  handler: async (ctx, args) => {
    await assertAdmin(ctx);
    const user = await getCurrentUserOrThrow(ctx);
    if (args.source_id === args.target_id) throw new Error("Selecciona dos proveedores distintos.");
    const [source, target] = await Promise.all([
      ctx.db.get(args.source_id),
      ctx.db.get(args.target_id),
    ]);
    if (!source || !target) throw new Error("Proveedor no encontrado.");
    if (target.archived_at || target.merged_into) {
      throw new Error("El proveedor destino debe estar activo.");
    }

    await markInvoicesStaleForProvider(ctx, source._id);

    const [transactions, requisitions] = await Promise.all([
      ctx.db
        .query("transacciones")
        .withIndex("by_proveedor", (q) => q.eq("proveedor_id", args.source_id))
        .collect(),
      ctx.db
        .query("requisiciones")
        .withIndex("by_proveedor", (q) => q.eq("proveedor_id", args.source_id))
        .collect(),
    ]);
    for (const transaction of transactions) {
      await markInvoicesStaleForTransaction(ctx, transaction._id);
      await ctx.db.patch(transaction._id, { proveedor_id: args.target_id });
    }
    for (const requisition of requisitions) {
      await ctx.db.patch(requisition._id, {
        proveedor_id: args.target_id,
        updated_at: Date.now(),
      });
    }
    await ctx.db.patch(source._id, {
      archived_at: Date.now(),
      archived_by: user._id,
      merged_into: target._id,
      updated_at: Date.now(),
    });
    return {
      source_id: source._id,
      target_id: target._id,
      transacciones_actualizadas: transactions.length,
      requisiciones_actualizadas: requisitions.length,
    };
  },
});

// Backward-compatible endpoint. It now archives instead of hard-deleting.
export const deleteProveedor = mutation({
  args: { id: v.id("proveedores") },
  handler: async (ctx, args) => {
    await assertAdmin(ctx);
    const user = await getCurrentUserOrThrow(ctx);
    const provider = await ctx.db.get(args.id);
    if (!provider) throw new Error("Proveedor no encontrado.");
    await markInvoicesStaleForProvider(ctx, args.id);
    await ctx.db.patch(args.id, {
      archived_at: Date.now(),
      archived_by: user._id,
      updated_at: Date.now(),
    });
    return { success: true };
  },
});
