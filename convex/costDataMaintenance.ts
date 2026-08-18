import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { assertAdmin, checkDesarrolloAccess } from "./permissions";
import { updateMeticasPresupuesto, updatePagadoForHierarchy } from "./functions";
import {
  canonicalTransactionStatus,
  moneyDelta,
  mostSpecificCostLabel,
  normalizeCostCurrency,
  normalizeCostText,
  parseCostDate,
} from "./costRules";

function hierarchySnapshot(partida: Doc<"partidas">) {
  const partidaNombre = String(
    partida.nivel === 1 ? partida.nombre : partida.partida_nombre || partida.nombre || "",
  ).trim();
  const familia = String(partida.familia || "").trim();
  const subPartida = String(partida.sub_partida || "").trim();
  const concepto = mostSpecificCostLabel({
    sub_partida: subPartida,
    familia,
    partida: partidaNombre,
    nombre: partida.nombre,
  });
  return {
    concepto,
    concepto_normalizado: normalizeCostText(concepto),
    partida_nombre_snapshot: partidaNombre,
    familia_snapshot: familia,
    sub_partida_snapshot: subPartida,
  };
}

function hierarchyKey(partida: Doc<"partidas">) {
  const snapshot = hierarchySnapshot(partida);
  return [
    snapshot.partida_nombre_snapshot,
    snapshot.familia_snapshot,
    snapshot.sub_partida_snapshot,
  ].map(normalizeCostText).join("|");
}

async function assertProjectScope(ctx: Parameters<typeof checkDesarrolloAccess>[0], projectId: Id<"desarrollos">) {
  await assertAdmin(ctx);
  if (!(await checkDesarrolloAccess(ctx, projectId))) {
    throw new Error("No tienes acceso a este proyecto.");
  }
}

export const auditProjectCostTraceability = query({
  args: {
    project_id: v.id("desarrollos"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await assertProjectScope(ctx, args.project_id);
    const page = await ctx.db
      .query("transacciones")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.project_id))
      .paginate(args.paginationOpts);
    const currencies = new Set<string>();
    const signatures = new Set<string>();
    const duplicateSignatures = new Set<string>();
    const samples: Array<{ transaction_id: string; codes: string[] }> = [];
    const counts = {
      transactions: page.page.length,
      payments: 0,
      transactions_without_payments: 0,
      total_mismatches: 0,
      invalid_dates: 0,
      noncanonical_statuses: 0,
      possible_duplicates: 0,
      cross_project_partidas: 0,
      missing_partidas: 0,
      missing_traceability: 0,
      unresolved_payments: 0,
      invalid_currencies: 0,
    };

    for (const transaction of page.page) {
      const codes: string[] = [];
      const currency = normalizeCostCurrency(transaction.moneda);
      currencies.add(currency);
      if (currency === "SIN_MONEDA") {
        counts.invalid_currencies += 1;
        codes.push("invalid_currency");
      }
      if (!parseCostDate(transaction.fecha)) {
        counts.invalid_dates += 1;
        codes.push("invalid_date");
      }
      if (canonicalTransactionStatus(transaction.status) === "other") {
        counts.noncanonical_statuses += 1;
        codes.push("noncanonical_status");
      }
      if (transaction.import_signature) {
        if (signatures.has(transaction.import_signature)) {
          duplicateSignatures.add(transaction.import_signature);
          counts.possible_duplicates += 1;
          codes.push("possible_duplicate");
        }
        signatures.add(transaction.import_signature);
      }
      const payments = await ctx.db
        .query("pagos")
        .withIndex("by_transaccion", (q) => q.eq("transaccion_id", transaction._id))
        .collect();
      counts.payments += payments.length;
      if (!payments.length) {
        counts.transactions_without_payments += 1;
        codes.push("without_payments");
      }
      const lineTotal = payments.reduce((sum, payment) => sum + (payment.monto || 0), 0);
      if (Math.abs(moneyDelta(transaction.monto_total, lineTotal)) > 0.01) {
        counts.total_mismatches += 1;
        codes.push("total_mismatch");
      }
      for (const payment of payments) {
        if (!payment.proyecto_id || !payment.concepto_normalizado || !payment.classification_status) {
          counts.missing_traceability += 1;
          if (!codes.includes("missing_traceability")) codes.push("missing_traceability");
        }
        if (payment.classification_status === "unresolved") counts.unresolved_payments += 1;
        if (!payment.partida_id) {
          if (!payment.concepto) counts.missing_partidas += 1;
          continue;
        }
        const partida = await ctx.db.get(payment.partida_id);
        if (!partida) {
          counts.missing_partidas += 1;
          if (!codes.includes("missing_partida")) codes.push("missing_partida");
        } else if (partida.proyecto !== args.project_id) {
          counts.cross_project_partidas += 1;
          if (!codes.includes("cross_project_partida")) codes.push("cross_project_partida");
        }
      }
      if (codes.length && samples.length < 25) samples.push({ transaction_id: String(transaction._id), codes });
    }

    return {
      ...counts,
      currencies: [...currencies].sort(),
      has_mixed_currencies: currencies.size > 1,
      duplicate_signature_count: duplicateSignatures.size,
      samples,
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

export const backfillProjectCostTraceability = mutation({
  args: {
    project_id: v.id("desarrollos"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await assertProjectScope(ctx, args.project_id);
    const projectPartidas = await ctx.db
      .query("partidas")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.project_id))
      .collect();
    const targetByHierarchy = new Map<string, Doc<"partidas">[]>();
    for (const partida of projectPartidas) {
      const key = hierarchyKey(partida);
      const current = targetByHierarchy.get(key) || [];
      current.push(partida);
      targetByHierarchy.set(key, current);
    }

    const page = await ctx.db
      .query("transacciones")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.project_id))
      .paginate(args.paginationOpts);
    const counts = { mapped: 0, repaired: 0, custom: 0, unresolved: 0, unchanged: 0 };
    const affectedHierarchies = new Map<string, {
      partida: string;
      familia: string;
      sub_partida: string;
      nivel: number;
      proyecto: string;
    }>();
    const affectedProjects = new Set<string>();
    const trackHierarchy = (partida: Doc<"partidas">) => {
      const snapshot = hierarchySnapshot(partida);
      const context = {
        partida: snapshot.partida_nombre_snapshot,
        familia: snapshot.familia_snapshot,
        sub_partida: snapshot.sub_partida_snapshot,
        nivel: partida.nivel,
        proyecto: String(partida.proyecto),
      };
      affectedHierarchies.set(`${context.proyecto}|${hierarchyKey(partida)}`, context);
      affectedProjects.add(context.proyecto);
    };

    for (const transaction of page.page) {
      const payments = await ctx.db
        .query("pagos")
        .withIndex("by_transaccion", (q) => q.eq("transaccion_id", transaction._id))
        .collect();
      for (const payment of payments) {
        const partida = payment.partida_id ? await ctx.db.get(payment.partida_id) : null;
        if (partida) trackHierarchy(partida);
        if (partida && partida.proyecto === args.project_id) {
          const snapshot = hierarchySnapshot(partida);
          const desired = {
            proyecto_id: args.project_id,
            ...snapshot,
            classification_status: "mapped" as const,
          };
          const alreadyCurrent = payment.proyecto_id === desired.proyecto_id &&
            payment.concepto === desired.concepto &&
            payment.concepto_normalizado === desired.concepto_normalizado &&
            payment.partida_nombre_snapshot === desired.partida_nombre_snapshot &&
            payment.familia_snapshot === desired.familia_snapshot &&
            payment.sub_partida_snapshot === desired.sub_partida_snapshot &&
            payment.classification_status === desired.classification_status;
          if (alreadyCurrent) counts.unchanged += 1;
          else {
            await ctx.db.patch(payment._id, desired);
            counts.mapped += 1;
          }
          continue;
        }

        const sourceSnapshot = partida
          ? hierarchySnapshot(partida)
          : {
              concepto: payment.concepto || "",
              concepto_normalizado: normalizeCostText(payment.concepto || ""),
              partida_nombre_snapshot: payment.partida_nombre_snapshot || "",
              familia_snapshot: payment.familia_snapshot || "",
              sub_partida_snapshot: payment.sub_partida_snapshot || "",
            };
        const sourceKey = [
          sourceSnapshot.partida_nombre_snapshot,
          sourceSnapshot.familia_snapshot,
          sourceSnapshot.sub_partida_snapshot,
        ].map(normalizeCostText).join("|");
        const targetMatches = sourceKey.replace(/\|/g, "")
          ? targetByHierarchy.get(sourceKey) || []
          : [];
        if (targetMatches.length === 1) {
          const target = targetMatches[0];
          trackHierarchy(target);
          await ctx.db.patch(payment._id, {
            partida_id: target._id,
            proyecto_id: args.project_id,
            ...hierarchySnapshot(target),
            classification_status: "mapped",
          });
          counts.repaired += 1;
        } else if (targetMatches.length === 0 && sourceSnapshot.concepto_normalizado) {
          await ctx.db.patch(payment._id, {
            partida_id: undefined,
            proyecto_id: args.project_id,
            ...sourceSnapshot,
            classification_status: "custom",
          });
          counts.custom += 1;
        } else {
          await ctx.db.patch(payment._id, {
            partida_id: undefined,
            proyecto_id: args.project_id,
            ...sourceSnapshot,
            classification_status: "unresolved",
          });
          counts.unresolved += 1;
        }
      }
    }

    for (const context of affectedHierarchies.values()) {
      await updatePagadoForHierarchy(ctx, context);
    }
    for (const projectId of affectedProjects) {
      await updateMeticasPresupuesto(ctx, projectId);
    }

    return {
      ...counts,
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});
