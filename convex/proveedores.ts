import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { paginationOptsValidator } from "convex/server";
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
import {
  providerListMetadata,
  syncProviderListMetadata,
  updateProviderStatsForTransactionChange,
} from "./providerStats";

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

const providerSortValidator = v.union(
  v.literal("name"),
  v.literal("transactions"),
  v.literal("projects"),
  v.literal("amount"),
);
const providerSortDirectionValidator = v.union(v.literal("asc"), v.literal("desc"));
const providerStatusFilterValidator = v.union(
  v.literal("all"),
  v.literal("active"),
  v.literal("archived"),
  v.literal("incomplete"),
  v.literal("generic"),
);

export const getPaginatedWithStats = query({
  args: {
    paginationOpts: paginationOptsValidator,
    proyecto_id: v.optional(v.id("desarrollos")),
    search: v.optional(v.string()),
    status: providerStatusFilterValidator,
    sort: providerSortValidator,
    direction: providerSortDirectionValidator,
  },
  handler: async (ctx, args) => {
    await assertAdmin(ctx);
    const search = args.search ? normalizeProviderName(args.search) : undefined;
    const matchesStatus = (row: {
      is_archived?: boolean;
      is_complete?: boolean;
      is_generic?: boolean;
    }) => args.status === "all"
      || (args.status === "active" && !row.is_archived)
      || (args.status === "archived" && Boolean(row.is_archived))
      || (args.status === "incomplete" && !row.is_complete && !row.is_generic)
      || (args.status === "generic" && Boolean(row.is_generic));

    if (args.proyecto_id) {
      const page = search
        ? await ctx.db.query("provider_project_stats")
          .withSearchIndex("search_project_provider_list", (q) => {
            const scoped = q.search("search_text", search).eq("proyecto_id", args.proyecto_id!);
            if (args.status === "active") return scoped.eq("is_archived", false);
            if (args.status === "archived") return scoped.eq("is_archived", true);
            if (args.status === "generic") return scoped.eq("is_generic", true);
            if (args.status === "incomplete") {
              return scoped.eq("is_complete", false).eq("is_generic", false);
            }
            return scoped;
          })
          .paginate(args.paginationOpts)
        : await (args.sort === "transactions"
          ? ctx.db.query("provider_project_stats").withIndex("by_project_transaction_count", (q) => q.eq("proyecto_id", args.proyecto_id!))
          : args.sort === "amount"
            ? ctx.db.query("provider_project_stats").withIndex("by_project_total_amount", (q) => q.eq("proyecto_id", args.proyecto_id!))
            : ctx.db.query("provider_project_stats").withIndex("by_project_name", (q) => q.eq("proyecto_id", args.proyecto_id!)))
          .filter((q) => {
            if (args.status === "active") return q.eq(q.field("is_archived"), false);
            if (args.status === "archived") return q.eq(q.field("is_archived"), true);
            if (args.status === "generic") return q.eq(q.field("is_generic"), true);
            if (args.status === "incomplete") {
              return q.and(
                q.eq(q.field("is_complete"), false),
                q.eq(q.field("is_generic"), false),
              );
            }
            return q.eq(q.field("provider_id"), q.field("provider_id"));
          })
          .order(args.direction)
          .paginate(args.paginationOpts);

      const rows = await Promise.all(page.page.map(async (stat) => {
        const provider = await ctx.db.get(stat.provider_id);
        if (!provider || provider.merged_into || !matchesStatus({
          is_archived: stat.is_archived,
          is_complete: stat.is_complete,
          is_generic: stat.is_generic,
        })) return null;
        return {
          ...enrichProvider(provider, await getCreatorName(ctx, provider)),
          transaccionesCount: stat.transaction_count,
          totalAmount: stat.total_amount,
          proyectosCount: 1,
        };
      }));
      return { ...page, page: rows.filter((row) => row !== null) };
    }

    const page = search
      ? await ctx.db.query("proveedores")
        .withSearchIndex("search_provider_list", (q) => {
          const searched = q.search("list_search_text", search);
          if (args.status === "active") return searched.eq("list_is_archived", false);
          if (args.status === "archived") return searched.eq("list_is_archived", true);
          if (args.status === "generic") return searched.eq("list_is_generic", true);
          if (args.status === "incomplete") {
            return searched.eq("list_is_complete", false).eq("list_is_generic", false);
          }
          return searched;
        })
        .paginate(args.paginationOpts)
      : await (args.sort === "transactions"
        ? ctx.db.query("proveedores").withIndex("by_stats_transaction_count")
        : args.sort === "projects"
          ? ctx.db.query("proveedores").withIndex("by_stats_project_count")
          : args.sort === "amount"
            ? ctx.db.query("proveedores").withIndex("by_stats_total_amount")
          : ctx.db.query("proveedores").withIndex("by_razon_social_normalizada"))
        .filter((q) => {
          const isNotMerged = q.eq(q.field("merged_into"), undefined);
          if (args.status === "active") {
            return q.and(isNotMerged, q.eq(q.field("archived_at"), undefined));
          }
          if (args.status === "archived") {
            return q.and(isNotMerged, q.neq(q.field("archived_at"), undefined));
          }
          if (args.status === "generic") {
            return q.and(isNotMerged, q.eq(q.field("tipo"), "generico"));
          }
          if (args.status === "incomplete") {
            return q.and(
              isNotMerged,
              q.eq(q.field("list_is_complete"), false),
              q.eq(q.field("list_is_generic"), false),
            );
          }
          return isNotMerged;
        })
        .order(args.direction)
        .paginate(args.paginationOpts);

    const rows = await Promise.all(page.page.map(async (provider) => {
      if (provider.merged_into || !matchesStatus({
        is_archived: provider.list_is_archived ?? Boolean(provider.archived_at),
        is_complete: provider.list_is_complete ?? isProviderComplete(provider),
        is_generic: provider.list_is_generic ?? provider.tipo === "generico",
      })) return null;
      return {
        ...enrichProvider(provider, await getCreatorName(ctx, provider)),
        transaccionesCount: provider.stats_transaction_count || 0,
        totalAmount: provider.stats_total_amount || 0,
        proyectosCount: provider.stats_project_count || 0,
      };
    }));
    return { ...page, page: rows.filter((row) => row !== null) };
  },
});

export const getByProyectoWithStats = query({
  args: { proyecto_id: v.id("desarrollos") },
  handler: async (ctx, args) => {
    if (!(await checkDesarrolloAccess(ctx, args.proyecto_id))) {
      throw new Error("No tienes acceso a este proyecto.");
    }

    const projectStats = await ctx.db
      .query("provider_project_stats")
      .withIndex("by_project_name", (q) => q.eq("proyecto_id", args.proyecto_id))
      .collect();
    const results = [];
    for (const stats of projectStats) {
      const provider = await ctx.db.get(stats.provider_id);
      if (!provider) continue;
      results.push({
        ...enrichProvider(provider, await getCreatorName(ctx, provider)),
        transaccionesCount: stats.transaction_count,
        totalAmount: stats.total_amount,
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
    const metadata = providerListMetadata({
      razon_social: razonSocial,
      rfc: cleanOptional(args.rfc),
      nombre_contacto: cleanOptional(args.nombre_contacto),
      banco: cleanOptional(args.banco),
      tipo,
      archived_at: undefined,
    });
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
      stats_transaction_count: 0,
      stats_total_amount: 0,
      stats_project_count: 0,
      stats_initialized_at: Date.now(),
      list_search_text: metadata.searchText,
      list_is_complete: metadata.isComplete,
      list_is_archived: false,
      list_is_generic: metadata.isGeneric,
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
      stats_transaction_count: 0,
      stats_total_amount: 0,
      stats_project_count: 0,
      stats_initialized_at: Date.now(),
      list_search_text: normalizedName,
      list_is_complete: tipo === "generico",
      list_is_archived: false,
      list_is_generic: tipo === "generico",
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
    await syncProviderListMetadata(ctx, args.id);
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
    await syncProviderListMetadata(ctx, args.id);
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
    await syncProviderListMetadata(ctx, args.id);
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
      await updateProviderStatsForTransactionChange(ctx, transaction, {
        ...transaction,
        proveedor_id: args.target_id,
      });
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
    await syncProviderListMetadata(ctx, source._id);
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
    await syncProviderListMetadata(ctx, args.id);
    return { success: true };
  },
});
