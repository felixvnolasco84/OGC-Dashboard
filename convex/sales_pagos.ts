import { query } from "./_generated/server";
import { v } from "convex/values";
import { Doc } from "./_generated/dataModel";

// Type for enriched sales payment with transaction and partida data
type EnrichedSalesPayment = Doc<"sales_pagos"> & {
  proyecto?: string;
  fecha?: string;
  tipo_pago?: string;
  moneda?: string;
  status?: string;
  nombre_cliente?: string;
  codigo_referencia?: string;
  partida?: string;
  familia?: string;
  sub_partida?: string;
  transaction?: Doc<"sales_transacciones"> | null;
};

// Get payments by sales_partida_id (for nivel 3 - sub-partidas)
export const getBySalesPartidaId = query({
  args: { sales_partida_id: v.id("sales_partidas") },
  handler: async (ctx, args) => {
    const pagos = await ctx.db
      .query("sales_pagos")
      .withIndex("by_sales_partida_id", (q) => q.eq("sales_partida_id", args.sales_partida_id))
      .collect();

    // Enrich with transaction and partida data
    const enrichedPayments: EnrichedSalesPayment[] = [];
    for (const pago of pagos) {
      const transaction = await ctx.db.get(pago.sales_transaccion_id);
      const partida = await ctx.db.get(pago.sales_partida_id);
      
      enrichedPayments.push({
        ...pago,
        proyecto: transaction?.sales_proyecto || "",
        fecha: transaction?.fecha || "",
        tipo_pago: transaction?.tipo_pago || "",
        moneda: transaction?.moneda || "",
        status: transaction?.status || "",
        nombre_cliente: transaction?.nombre_cliente || "",
        codigo_referencia: transaction?.codigo_referencia || "",
        partida: partida?.nombre || "",
        familia: partida?.familia || "",
        sub_partida: partida?.sub_partida || "",
        transaction,
      });
    }

    return enrichedPayments;
  },
});

// Get payments by partida name (for nivel 1 - partidas)
export const getByPartidaName = query({
  args: {
    partida_name: v.string(),
    sales_proyecto_id: v.id("sales_projects"),
  },
  handler: async (ctx, args) => {
    // Get all sales_partidas in this project with this partida name
    const partidas = await ctx.db
      .query("sales_partidas")
      .withIndex("by_sales_proyecto", (q) => q.eq("sales_proyecto", args.sales_proyecto_id))
      .filter((q) => q.eq(q.field("nombre"), args.partida_name))
      .collect();

    // Get all sales_transacciones for this sales project
    const transacciones = await ctx.db
      .query("sales_transacciones")
      .withIndex("by_sales_proyecto", (q) => q.eq("sales_proyecto", args.sales_proyecto_id))
      .filter((q) => q.eq(q.field("status"), "Pagado"))
      .collect();

    // Get sales_pagos for each of these partidas and enrich
    const allPagos: EnrichedSalesPayment[] = [];
    for (const partida of partidas) {
      const pagos = await ctx.db
        .query("sales_pagos")
        .withIndex("by_sales_partida_id", (q) => q.eq("sales_partida_id", partida._id))
        .collect();
      
      // Filter pagos to only include those from "Pagado" transactions and enrich
      for (const pago of pagos) {
        const transaction = transacciones.find(tx => tx._id === pago.sales_transaccion_id);
        if (transaction) {
          allPagos.push({
            ...pago,
            proyecto: transaction.sales_proyecto || "",
            fecha: transaction.fecha || "",
            tipo_pago: transaction.tipo_pago || "",
            moneda: transaction.moneda || "",
            status: transaction.status || "",
            nombre_cliente: transaction.nombre_cliente || "",
            codigo_referencia: transaction.codigo_referencia || "",
            partida: partida.nombre || "",
            familia: partida.familia || "",
            sub_partida: partida.sub_partida || "",
            transaction,
          });
        }
      }
    }

    return allPagos;
  },
});

// Get payments by familia (for nivel 2 - familias)
export const getByFamilia = query({
  args: {
    partida_name: v.string(),
    familia_name: v.string(),
    sales_proyecto_id: v.id("sales_projects"),
  },
  handler: async (ctx, args) => {
    // Get all sales_partidas in this project with this partida and familia
    const partidas = await ctx.db
      .query("sales_partidas")
      .withIndex("by_sales_proyecto", (q) => q.eq("sales_proyecto", args.sales_proyecto_id))
      .filter((q) => 
        q.and(
          q.eq(q.field("nombre"), args.partida_name),
          q.eq(q.field("familia"), args.familia_name)
        )
      )
      .collect();

    // Get all sales_transacciones for this sales project with status "Pagado"
    const transacciones = await ctx.db
      .query("sales_transacciones")
      .withIndex("by_sales_proyecto", (q) => q.eq("sales_proyecto", args.sales_proyecto_id))
      .filter((q) => q.eq(q.field("status"), "Pagado"))
      .collect();

    // Get sales_pagos for each of these partidas and enrich
    const allPagos: EnrichedSalesPayment[] = [];
    for (const partida of partidas) {
      const pagos = await ctx.db
        .query("sales_pagos")
        .withIndex("by_sales_partida_id", (q) => q.eq("sales_partida_id", partida._id))
        .collect();
      
      // Filter pagos to only include those from "Pagado" transactions and enrich
      for (const pago of pagos) {
        const transaction = transacciones.find(tx => tx._id === pago.sales_transaccion_id);
        if (transaction) {
          allPagos.push({
            ...pago,
            proyecto: transaction.sales_proyecto || "",
            fecha: transaction.fecha || "",
            tipo_pago: transaction.tipo_pago || "",
            moneda: transaction.moneda || "",
            status: transaction.status || "",
            nombre_cliente: transaction.nombre_cliente || "",
            codigo_referencia: transaction.codigo_referencia || "",
            partida: partida.nombre || "",
            familia: partida.familia || "",
            sub_partida: partida.sub_partida || "",
            transaction,
          });
        }
      }
    }

    return allPagos;
  },
});
