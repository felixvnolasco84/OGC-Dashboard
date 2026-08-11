/**
 * DEPRECATED: This file maintains backward compatibility with old payment queries.
 * New code should use convex/transacciones.ts which implements the transaction-based model.
 * 
 * OLD MODEL: Individual payments (pagos) with all payment details
 * NEW MODEL: Transactions (parent) with line items (pagos as children)
 */

import { query } from "./_generated/server";
import { mutation } from "./functions";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";

// Type for enriched payment with transaction and partida data
type EnrichedPayment = Doc<"pagos"> & {
  proyecto?: Id<"desarrollos">;
  fecha?: string;
  tipo_pago?: string;
  moneda?: string;
  status?: string;
  banco?: string;
  codigo_referencia?: string;
  partida?: string;
  familia?: string;
  sub_partida?: string;
  administracion?: string;
  transaction?: Doc<"transacciones"> | null;
};

// Backward-compatible query: Get all line items for a project
// Returns pagos enriched with transaction and partida data
export const getByProyecto = query({
  args: {
    proyecto_id: v.id("desarrollos"),
  },
  handler: async (ctx, args) => {
    // Get all transactions for this project
    const transactions = await ctx.db
      .query("transacciones")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto_id))
      .collect();

    // Get all pagos for these transactions
    const allPayments: EnrichedPayment[] = [];
    for (const transaction of transactions) {
      const pagos = await ctx.db
        .query("pagos")
        .withIndex("by_transaccion", (q) => q.eq("transaccion_id", transaction._id))
        .collect();

      // Enrich each pago with transaction and partida data
      for (const pago of pagos) {
        const partida = pago.partida_id ? await ctx.db.get(pago.partida_id) : null;
        allPayments.push({
          ...pago,
          // Transaction data
          proyecto: transaction.proyecto,
          fecha: transaction.fecha,
          tipo_pago: transaction.tipo_pago,
          moneda: transaction.moneda,
          status: transaction.status,
          banco: transaction.banco,
          codigo_referencia: transaction.codigo_referencia,
          // Partida data
          partida: partida?.nombre || "",
          familia: partida?.familia || "",
          sub_partida: partida?.sub_partida || "",
          administracion: partida?.nombre || "",
          transaction,
        });
      }
    }

    return allPayments;
  },
});

// Backward-compatible query: Get line items by partida_id
export const getByPartidaId = query({
  args: {
    partida_id: v.id("partidas"),
  },
  handler: async (ctx, args) => {
    const payments = await ctx.db
      .query("pagos")
      .withIndex("by_partida_id", (q) => q.eq("partida_id", args.partida_id))
      .collect();

    // Enrich with transaction and partida data
    const paymentsWithTransactions = await Promise.all(
      payments.map(async (pago) => {
        const transaction = await ctx.db.get(pago.transaccion_id);
        const partida = pago.partida_id ? await ctx.db.get(pago.partida_id) : null;
        return {
          ...pago,
          // Transaction data
          fecha: transaction?.fecha,
          tipo_pago: transaction?.tipo_pago,
          moneda: transaction?.moneda,
          status: transaction?.status,
          proyecto: transaction?.proyecto,
          // Partida data
          partida: partida?.nombre || "",
          familia: partida?.familia || "",
          sub_partida: partida?.sub_partida || "",
          transaction,
        };
      })
    );

    return paymentsWithTransactions;
  },
});

// Backward-compatible query: Get line items by partida name
export const getByPartidaName = query({
  args: {
    partida_name: v.string(),
    proyecto_id: v.optional(v.id("desarrollos")),
  },
  handler: async (ctx, args) => {
    // Find all partidas with this name
    const allPartidas = await ctx.db.query("partidas").collect();
    const matchingPartidas = allPartidas.filter(p => 
      p.nombre === args.partida_name && 
      (!args.proyecto_id || p.proyecto === args.proyecto_id)
    );

    // Get pagos for these partidas
    const allPayments: EnrichedPayment[] = [];
    for (const partida of matchingPartidas) {
      const pagos = await ctx.db
        .query("pagos")
        .withIndex("by_partida_id", (q) => q.eq("partida_id", partida._id))
        .collect();

      for (const pago of pagos) {
        const transaction = await ctx.db.get(pago.transaccion_id);
        if (!args.proyecto_id || transaction?.proyecto === args.proyecto_id) {
          allPayments.push({
            ...pago,
            fecha: transaction?.fecha,
            tipo_pago: transaction?.tipo_pago,
            status: transaction?.status,
            proyecto: transaction?.proyecto,
            partida: partida.nombre,
            familia: partida.familia,
            sub_partida: partida.sub_partida,
            transaction,
          });
        }
      }
    }

    return allPayments;
  },
});

// Backward-compatible query: Get line items by familia
export const getByFamilia = query({
  args: {
    partida_name: v.string(),
    familia_name: v.string(),
    proyecto_id: v.optional(v.id("desarrollos")),
  },
  handler: async (ctx, args) => {
    // Find all partidas with matching partida name and familia
    const allPartidas = await ctx.db.query("partidas").collect();
    const matchingPartidas = allPartidas.filter(p => 
      p.nombre === args.partida_name &&
      p.familia === args.familia_name &&
      (!args.proyecto_id || p.proyecto === args.proyecto_id)
    );

    // Get pagos for these partidas
    const allPayments: EnrichedPayment[] = [];
    for (const partida of matchingPartidas) {
      const pagos = await ctx.db
        .query("pagos")
        .withIndex("by_partida_id", (q) => q.eq("partida_id", partida._id))
        .collect();

      for (const pago of pagos) {
        const transaction = await ctx.db.get(pago.transaccion_id);
        if (!args.proyecto_id || transaction?.proyecto === args.proyecto_id) {
          allPayments.push({
            ...pago,
            fecha: transaction?.fecha,
            tipo_pago: transaction?.tipo_pago,
            status: transaction?.status,
            proyecto: transaction?.proyecto,
            partida: partida.nombre,
            familia: partida.familia,
            sub_partida: partida.sub_partida,
            transaction,
          });
        }
      }
    }

    return allPayments;
  },
});

// Get all pagos (line items) with enriched transaction and partida data
export const getAll = query({
  args: {},
  handler: async (ctx) => {
    // Get all pagos
    const allPagos = await ctx.db.query("pagos").collect();
    
    // Enrich each pago with transaction and partida data
    const enrichedPagos = await Promise.all(
      allPagos.map(async (pago) => {
        const transaction = await ctx.db.get(pago.transaccion_id);
        const partida = pago.partida_id ? await ctx.db.get(pago.partida_id) : null;
        
        // Get proyecto name
        let proyectoNombre = "";
        if (transaction?.proyecto) {
          const proyecto = await ctx.db.get(transaction.proyecto);
          proyectoNombre = proyecto?.nombre || "";
        }
        
        return {
          ...pago,
          // Transaction data
          fecha: transaction?.fecha || "",
          tipo_pago: transaction?.tipo_pago || "",
          moneda: transaction?.moneda || "MXN",
          status: transaction?.status || "",
          banco: transaction?.banco,
          codigo_referencia: transaction?.codigo_referencia,
          proyecto: transaction?.proyecto,
          proyectoNombre,
          // Partida data
          partida: partida?.partida_nombre || partida?.nombre || "",
          familia: partida?.familia || "",
          sub_partida: partida?.sub_partida || "",
          transaction,
        };
      })
    );
    
    return enrichedPagos;
  },
});

// Get last week's payments grouped by partida_id
// "Last week" = Monday to Sunday of the previous week (not including current week)
export const getLastWeekPaymentsByProject = query({
  args: {
    proyecto_id: v.id("desarrollos"),
  },
  handler: async (ctx, args) => {
    // Calculate last week's date range
    const now = new Date();
    const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
    
    // Get Monday of current week
    const mondayThisWeek = new Date(now);
    const daysFromMonday = currentDay === 0 ? 6 : currentDay - 1;
    mondayThisWeek.setDate(now.getDate() - daysFromMonday);
    mondayThisWeek.setHours(0, 0, 0, 0);
    
    // Get Monday of last week
    const mondayLastWeek = new Date(mondayThisWeek);
    mondayLastWeek.setDate(mondayThisWeek.getDate() - 7);
    
    // Get Sunday of last week (end of last week)
    const sundayLastWeek = new Date(mondayThisWeek);
    sundayLastWeek.setDate(mondayThisWeek.getDate() - 1);
    sundayLastWeek.setHours(23, 59, 59, 999);
    
    // Format dates for comparison (YYYY-MM-DD)
    const formatDate = (d: Date) => d.toISOString().split('T')[0];
    const lastWeekStart = formatDate(mondayLastWeek);
    const lastWeekEnd = formatDate(sundayLastWeek);
    
    // Get all transactions for this project
    const transactions = await ctx.db
      .query("transacciones")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto_id))
      .collect();
    
    // Filter transactions from last week
    const lastWeekTransactions = transactions.filter(tx => {
      const txDate = tx.fecha; // Format: YYYY-MM-DD or similar
      return txDate >= lastWeekStart && txDate <= lastWeekEnd;
    });
    
    // Get all pagos for last week transactions and group by partida_id
    const paymentsByPartida: Record<string, number> = {};
    
    for (const transaction of lastWeekTransactions) {
      const pagos = await ctx.db
        .query("pagos")
        .withIndex("by_transaccion", (q) => q.eq("transaccion_id", transaction._id))
        .collect();
      
      for (const pago of pagos) {
        const partidaId = pago.partida_id as string;
        paymentsByPartida[partidaId] = (paymentsByPartida[partidaId] || 0) + pago.monto;
      }
    }
    
    return {
      paymentsByPartida,
      weekRange: {
        start: lastWeekStart,
        end: lastWeekEnd,
      },
    };
  },
});

// Get payments grouped by partida_id for a date range
// Dates should be in YYYY-MM-DD format. If both are empty, returns all payments (total).
export const getPaymentsByDateRange = query({
  args: {
    proyecto_id: v.id("desarrollos"),
    start_date: v.optional(v.string()),
    end_date: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Get all transactions for this project
    const transactions = await ctx.db
      .query("transacciones")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto_id))
      .collect();

    // Helper: normalize fecha to YYYY-MM-DD for comparison
    const toISO = (fecha: string): string => {
      if (fecha.includes("/")) {
        const [d, m, y] = fecha.split("/");
        return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
      }
      return fecha;
    };

    // Filter transactions by date range (if provided)
    const filtered = (args.start_date || args.end_date)
      ? transactions.filter((tx) => {
          const txDate = toISO(tx.fecha);
          if (args.start_date && txDate < args.start_date) return false;
          if (args.end_date && txDate > args.end_date) return false;
          return true;
        })
      : transactions;

    // Aggregate pagos by partida_id
    const paymentsByPartida: Record<string, number> = {};
    let total = 0;

    for (const transaction of filtered) {
      const pagos = await ctx.db
        .query("pagos")
        .withIndex("by_transaccion", (q) => q.eq("transaccion_id", transaction._id))
        .collect();

      for (const pago of pagos) {
        const partidaId = pago.partida_id as string;
        paymentsByPartida[partidaId] = (paymentsByPartida[partidaId] || 0) + pago.monto;
        total += pago.monto;
      }
    }

    return { paymentsByPartida, total };
  },
});

// Update a pago (line item) amount
export const updatePago = mutation({
  args: {
    id: v.id("pagos"),
    monto: v.number(),
  },
  handler: async (ctx, args) => {
    const existingPago = await ctx.db.get(args.id);
    if (!existingPago) {
      throw new Error("Pago not found");
    }

    await ctx.db.patch(args.id, { monto: args.monto });
    return args.id;
  },
});
