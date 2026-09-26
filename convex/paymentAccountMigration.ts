import { internalMutation } from "./functions";
import { v } from "convex/values";
import {
  accountIdentity, accountMatchesSnapshot, historicalAccountIssue,
  normalizePaymentMethod, paymentScopeKey,
} from "./paymentAccountRules";
import { queuePaymentAccountCandidate, upsertPaymentAccount } from "./paymentAccounts";

const phaseValidator = v.union(
  v.literal("transactions"), v.literal("providers"), v.literal("links"),
);

/** Run page by page in the development deployment, then review pending records. */
export const backfillPage = internalMutation({
  args: { phase: phaseValidator, cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args) => {
    const counts = { processed: 0, created: 0, existing: 0, pending: 0, linked: 0, skipped: 0 };
    const paginationOpts = { cursor: args.cursor ?? null, numItems: 100 };

    if (args.phase === "transactions" || args.phase === "links") {
      const page = await ctx.db.query("transacciones").paginate(paginationOpts);
      for (const transaction of page.page) {
        counts.processed++;
        if (!normalizePaymentMethod(transaction.tipo_pago)) { counts.skipped++; continue; }
        if (!transaction.banco && !transaction.numero_cuenta && !transaction.clabe) { counts.skipped++; continue; }
        const project = await ctx.db.get(transaction.proyecto);
        if (!project) { counts.skipped++; continue; }
        const scopeKey = paymentScopeKey(project);
        const identityKey = accountIdentity(transaction.banco, transaction.numero_cuenta, transaction.clabe);

        if (args.phase === "links") {
          if (!transaction.proveedor_id || !identityKey || transaction.payment_account_id) { counts.skipped++; continue; }
          const matches = (await ctx.db.query("payment_accounts")
            .withIndex("by_scope_provider", q => q.eq("scope_key", scopeKey)
              .eq("provider_id", transaction.proveedor_id!)).collect())
            .filter(account => account.status === "active" && accountMatchesSnapshot(account, transaction));
          if (matches.length === 1) {
            await ctx.db.patch(transaction._id, { payment_account_id: matches[0]._id });
            counts.linked++;
          } else counts.skipped++;
          continue;
        }

        const provider = transaction.proveedor_id ? await ctx.db.get(transaction.proveedor_id) : null;
        const reason = !provider ? "sin_proveedor"
          : provider.archived_at || provider.merged_into ? "proveedor_no_disponible"
          : historicalAccountIssue(transaction.banco, transaction.numero_cuenta, transaction.clabe);
        if (reason) {
          if (await queuePaymentAccountCandidate(ctx, {
            scopeKey, sourceKey: `transaction:${transaction._id}`, providerId: transaction.proveedor_id,
            sourceTransactionId: transaction._id, banco: transaction.banco,
            numeroCuenta: transaction.numero_cuenta, clabe: transaction.clabe, reason,
          })) counts.pending++;
          continue;
        }
        const result = await upsertPaymentAccount(ctx, {
          scopeKey, providerId: transaction.proveedor_id!,
          input: { banco: transaction.banco!, numero_cuenta: transaction.numero_cuenta, clabe: transaction.clabe },
          source: "transaction",
        });
        if (result.status === "created") counts.created++;
        else if (result.status === "existing") counts.existing++;
        else if (await queuePaymentAccountCandidate(ctx, {
          scopeKey, sourceKey: `transaction:${transaction._id}`, providerId: transaction.proveedor_id,
          sourceTransactionId: transaction._id, banco: transaction.banco,
          numeroCuenta: transaction.numero_cuenta, clabe: transaction.clabe,
          reason: result.status === "conflict" ? "datos_contradictorios" : "cuenta_archivada",
        })) counts.pending++;
      }
      const nextPhase = args.phase === "transactions" ? "providers" : "done";
      return { ...counts, phase: page.isDone ? nextPhase : args.phase,
        cursor: page.isDone ? null : page.continueCursor, done: page.isDone && args.phase === "links" };
    }

    const page = await ctx.db.query("proveedores").paginate(paginationOpts);
    for (const provider of page.page) {
      counts.processed++;
      if (!provider.banco && !provider.cuenta && !provider.clabe) { counts.skipped++; continue; }
      const scopeKeys = new Set<string>();
      const stats = await ctx.db.query("provider_project_stats")
        .withIndex("by_provider", q => q.eq("provider_id", provider._id)).collect();
      for (const stat of stats) {
        const project = await ctx.db.get(stat.proyecto_id);
        if (project) scopeKeys.add(paymentScopeKey(project));
      }
      const existingAccounts = await ctx.db.query("payment_accounts")
        .withIndex("by_provider", q => q.eq("provider_id", provider._id)).collect();
      for (const account of existingAccounts) scopeKeys.add(account.scope_key);
      if (!scopeKeys.size) { counts.skipped++; continue; }
      for (const scopeKey of scopeKeys) {
        const reason = provider.archived_at || provider.merged_into ? "proveedor_no_disponible"
          : historicalAccountIssue(provider.banco, provider.cuenta, provider.clabe);
        if (reason) {
          if (await queuePaymentAccountCandidate(ctx, { scopeKey,
            sourceKey: `provider:${provider._id}:${scopeKey}`, providerId: provider._id,
            banco: provider.banco, numeroCuenta: provider.cuenta, clabe: provider.clabe, reason,
          })) counts.pending++;
          continue;
        }
        const result = await upsertPaymentAccount(ctx, {
          scopeKey, providerId: provider._id,
          input: { banco: provider.banco!, numero_cuenta: provider.cuenta, clabe: provider.clabe },
          source: "provider",
        });
        if (result.status === "created") counts.created++;
        else if (result.status === "existing") counts.existing++;
        else if (await queuePaymentAccountCandidate(ctx, { scopeKey,
          sourceKey: `provider:${provider._id}:${scopeKey}`, providerId: provider._id,
          banco: provider.banco, numeroCuenta: provider.cuenta, clabe: provider.clabe,
          reason: result.status === "conflict" ? "datos_contradictorios" : "cuenta_archivada",
        })) counts.pending++;
      }
    }
    return { ...counts, phase: page.isDone ? "links" : "providers",
      cursor: page.isDone ? null : page.continueCursor, done: false };
  },
});
