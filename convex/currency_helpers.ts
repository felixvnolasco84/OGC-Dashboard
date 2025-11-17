import { query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Get currency breakdown for a specific partida
 * Returns the amounts paid in each currency (MXN, USD, EUR) and the dominant currency
 */
export const getPartidaCurrencyBreakdown = query({
  args: {
    partida_id: v.id("partidas"),
  },
  handler: async (ctx, args) => {
    // Get all pagos for this partida
    const pagos = await ctx.db
      .query("pagos")
      .withIndex("by_partida_id", (q) => q.eq("partida_id", args.partida_id))
      .collect();

    // Get transaction details for each pago and group by currency
    const currencyTotals = new Map<string, number>();
    
    for (const pago of pagos) {
      const transaction = await ctx.db.get(pago.transaccion_id);
      // Skip if transaction doesn't exist or is not paid
      if (!transaction) continue;
      if (transaction.status !== "Pagado") continue;
      
      const currency = transaction.moneda || "MXN";
      const currentTotal = currencyTotals.get(currency) || 0;
      currencyTotals.set(currency, currentTotal + pago.monto);
    }

    // Convert to array and sort by amount (descending)
    const breakdown = Array.from(currencyTotals.entries())
      .map(([currency, amount]) => ({ currency, amount }))
      .sort((a, b) => b.amount - a.amount);

    // Determine dominant currency (the one with highest total)
    const dominantCurrency = breakdown.length > 0 ? breakdown[0].currency : "MXN";

    return {
      breakdown,
      dominantCurrency,
      hasMixedCurrencies: breakdown.length > 1,
    };
  },
});

/**
 * Get currency breakdown for a sales partida
 */
export const getSalesPartidaCurrencyBreakdown = query({
  args: {
    sales_partida_id: v.id("sales_partidas"),
  },
  handler: async (ctx, args) => {
    // Get all sales_pagos for this sales_partida
    const pagos = await ctx.db
      .query("sales_pagos")
      .withIndex("by_sales_partida_id", (q) => q.eq("sales_partida_id", args.sales_partida_id))
      .collect();

    // Get transaction details for each pago and group by currency
    const currencyTotals = new Map<string, number>();
    
    for (const pago of pagos) {
      const transaction = await ctx.db.get(pago.sales_transaccion_id);
      // Skip if transaction doesn't exist or is not paid
      if (!transaction) continue;
      if (transaction.status !== "Pagado") continue;
      
      const currency = transaction.moneda || "MXN";
      const currentTotal = currencyTotals.get(currency) || 0;
      currencyTotals.set(currency, currentTotal + pago.monto);
    }

    // Convert to array and sort by amount (descending)
    const breakdown = Array.from(currencyTotals.entries())
      .map(([currency, amount]) => ({ currency, amount }))
      .sort((a, b) => b.amount - a.amount);

    // Determine dominant currency
    const dominantCurrency = breakdown.length > 0 ? breakdown[0].currency : "MXN";

    return {
      breakdown,
      dominantCurrency,
      hasMixedCurrencies: breakdown.length > 1,
    };
  },
});

/**
 * Get project's default currency from cached field (efficient)
 * The moneda_principal field is automatically updated by triggers when transactions change
 */
export const getProjectDefaultCurrency = query({
  args: {
    proyecto_id: v.id("desarrollos"),
  },
  handler: async (ctx, args) => {
    // Simply read the cached currency from the proyecto record
    const proyecto = await ctx.db.get(args.proyecto_id);
    
    if (!proyecto) {
      return {
        defaultCurrency: "MXN",
        hasTransactions: false,
      };
    }

    // Return the stored currency (defaults to MXN if not set)
    return {
      defaultCurrency: proyecto.moneda_principal || "MXN",
      hasTransactions: proyecto.moneda_principal ? true : false,
    };
  },
});

/**
 * Get sales project's default currency from cached field (efficient)
 * The moneda_principal field is automatically updated by triggers when transactions change
 */
export const getSalesProjectDefaultCurrency = query({
  args: {
    sales_proyecto_id: v.id("sales_projects"),
  },
  handler: async (ctx, args) => {
    // Simply read the cached currency from the sales_proyecto record
    const salesProyecto = await ctx.db.get(args.sales_proyecto_id);
    
    if (!salesProyecto) {
      return {
        defaultCurrency: "MXN",
        hasTransactions: false,
      };
    }

    // Return the stored currency (defaults to MXN if not set)
    return {
      defaultCurrency: salesProyecto.moneda_principal || "MXN",
      hasTransactions: salesProyecto.moneda_principal ? true : false,
    };
  },
});
