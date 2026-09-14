import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import {
  isGenericProviderName,
  isProviderComplete,
  normalizeProviderName,
  normalizeRfc,
} from "./providerUtils";
import { calculateProviderStatsDelta } from "./providerStatsRules";
export { calculateProviderStatsDelta } from "./providerStatsRules";

type TransactionStatsInput = Pick<
  Doc<"transacciones">,
  "proveedor_id" | "proyecto" | "monto_total"
>;

export function providerListMetadata(provider: Pick<
  Doc<"proveedores">,
  "razon_social" | "rfc" | "nombre_contacto" | "banco" | "tipo" | "archived_at"
>) {
  const tipo = provider.tipo || (isGenericProviderName(provider.razon_social) ? "generico" : "regular");
  return {
    nameSort: normalizeProviderName(provider.razon_social),
    searchText: [
      provider.razon_social,
      provider.rfc,
      provider.nombre_contacto,
      provider.banco,
    ].filter(Boolean).map((value) => normalizeProviderName(String(value))).join(" "),
    isComplete: isProviderComplete({ ...provider, tipo }),
    isArchived: Boolean(provider.archived_at),
    isGeneric: tipo === "generico",
  };
}

export async function syncProviderListMetadata(
  ctx: MutationCtx,
  providerId: Id<"proveedores">,
) {
  const provider = await ctx.db.get(providerId);
  if (!provider) return;
  const metadata = providerListMetadata(provider);
  await ctx.db.patch(providerId, {
    razon_social_normalizada: metadata.nameSort,
    rfc_normalizado: normalizeRfc(provider.rfc),
    list_search_text: metadata.searchText,
    list_is_complete: metadata.isComplete,
    list_is_archived: metadata.isArchived,
    list_is_generic: metadata.isGeneric,
  });
  const projectStats = await ctx.db
    .query("provider_project_stats")
    .withIndex("by_provider", (q) => q.eq("provider_id", providerId))
    .collect();
  for (const projectStat of projectStats) {
    await ctx.db.patch(projectStat._id, {
      provider_name_sort: metadata.nameSort,
      search_text: metadata.searchText,
      is_complete: metadata.isComplete,
      is_archived: metadata.isArchived,
      is_generic: metadata.isGeneric,
      updated_at: Date.now(),
    });
  }
}

async function applyDelta(
  ctx: MutationCtx,
  transaction: TransactionStatsInput,
  direction: 1 | -1,
) {
  if (!transaction.proveedor_id) return;
  const provider = await ctx.db.get(transaction.proveedor_id);
  if (!provider) return;

  const projectStat = await ctx.db
    .query("provider_project_stats")
    .withIndex("by_provider_project", (q) =>
      q.eq("provider_id", transaction.proveedor_id!).eq("proyecto_id", transaction.proyecto)
    )
    .unique();
  const next = calculateProviderStatsDelta({
    currentProviderTransactionCount: provider.stats_transaction_count || 0,
    currentProviderTotalAmount: provider.stats_total_amount || 0,
    currentProviderProjectCount: provider.stats_project_count || 0,
    currentProjectTransactionCount: projectStat?.transaction_count || 0,
    currentProjectTotalAmount: projectStat?.total_amount || 0,
    transactionAmount: transaction.monto_total,
    direction,
  });

  if (next.projectRemoved && projectStat) {
    await ctx.db.delete(projectStat._id);
  } else if (projectStat) {
    await ctx.db.patch(projectStat._id, {
      transaction_count: next.projectTransactionCount,
      total_amount: next.projectTotalAmount,
      updated_at: Date.now(),
    });
  } else if (next.projectTransactionCount > 0) {
    const metadata = providerListMetadata(provider);
    await ctx.db.insert("provider_project_stats", {
      provider_id: provider._id,
      proyecto_id: transaction.proyecto,
      transaction_count: next.projectTransactionCount,
      total_amount: next.projectTotalAmount,
      provider_name_sort: metadata.nameSort,
      search_text: metadata.searchText,
      is_complete: metadata.isComplete,
      is_archived: metadata.isArchived,
      is_generic: metadata.isGeneric,
      updated_at: Date.now(),
    });
  }

  await ctx.db.patch(provider._id, {
    stats_transaction_count: next.providerTransactionCount,
    stats_total_amount: next.providerTotalAmount,
    stats_project_count: next.providerProjectCount,
    stats_initialized_at: provider.stats_initialized_at || Date.now(),
  });
}

export async function updateProviderStatsForTransactionChange(
  ctx: MutationCtx,
  previous: TransactionStatsInput | null,
  next: TransactionStatsInput | null,
) {
  if (previous) await applyDelta(ctx, previous, -1);
  if (next) await applyDelta(ctx, next, 1);
}
