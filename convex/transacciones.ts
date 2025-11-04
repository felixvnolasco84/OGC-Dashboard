import { query } from "./_generated/server";
import { mutation } from "./functions";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

// Create a transaction with multiple line items (concepts)
export const createTransaction = mutation({
  args: {
    proyecto: v.id("desarrollos"),
    monto_total: v.number(),
    fecha: v.string(),
    tipo_pago: v.string(),
    moneda: v.string(),
    tipo_cambio: v.string(),
    status: v.string(),
    categoria: v.optional(v.string()),
    banco: v.optional(v.string()),
    tarjeta: v.optional(v.string()),
    numero_cuenta: v.optional(v.string()),
    numero_transferencia: v.optional(v.string()),
    codigo_referencia: v.optional(v.string()),
    factura: v.optional(v.string()),
    comprobante: v.optional(v.string()),
    presupuesto_archivo: v.optional(v.string()),
    // Array of line items
    lineItems: v.array(
      v.object({
        partida_id: v.id("partidas"),
        partida: v.string(),
        familia: v.string(),
        sub_partida: v.string(),
        monto: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const { lineItems, ...transactionData } = args;

    // Create the parent transaction
    const transaccionId = await ctx.db.insert("transacciones", transactionData);

    // Create all line items referencing this transaction
    const pagoIds = [];
    const uniqueHierarchies = new Map<string, { partida: string; familia: string; sub_partida: string }>();
    
    for (const item of lineItems) {
      const pagoId = await ctx.db.insert("pagos", {
        transaccion_id: transaccionId,
        partida_id: item.partida_id,
        monto: item.monto,
      });
      pagoIds.push(pagoId);
      
      // Collect unique hierarchies (partida > familia > sub_partida combinations)
      const hierarchyKey = `${item.partida}|${item.familia}|${item.sub_partida}`;
      if (!uniqueHierarchies.has(hierarchyKey)) {
        uniqueHierarchies.set(hierarchyKey, {
          partida: item.partida,
          familia: item.familia,
          sub_partida: item.sub_partida,
        });
      }
    }

    // Note: Individual triggers will still fire for each pago insert
    // The optimization in updatePagadoForHierarchy (using indexed queries)
    // ensures each trigger execution is efficient
    
    console.log(`Created transaction with ${pagoIds.length} line items affecting ${uniqueHierarchies.size} unique hierarchies`);

    return {
      transaccionId,
      pagoIds,
    };
  },
});

// Update transaction details (not the line items)
export const updateTransaction = mutation({
  args: {
    id: v.id("transacciones"),
    monto_total: v.optional(v.number()),
    fecha: v.optional(v.string()),
    tipo_pago: v.optional(v.string()),
    moneda: v.optional(v.string()),
    tipo_cambio: v.optional(v.string()),
    status: v.optional(v.string()),
    categoria: v.optional(v.string()),
    banco: v.optional(v.string()),
    tarjeta: v.optional(v.string()),
    numero_cuenta: v.optional(v.string()),
    numero_transferencia: v.optional(v.string()),
    codigo_referencia: v.optional(v.string()),
    factura: v.optional(v.string()),
    comprobante: v.optional(v.string()),
    presupuesto_archivo: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...updateData } = args;

    const existingTransaction = await ctx.db.get(id);
    if (!existingTransaction) {
      throw new Error("Transaction not found");
    }

    // Filter out undefined values
    const cleanUpdateData = Object.fromEntries(
      Object.entries(updateData).filter(([, value]) => value !== undefined)
    );

    await ctx.db.patch(id, cleanUpdateData);
    return id;
  },
});

// Delete transaction and all its line items
export const deleteTransaction = mutation({
  args: {
    id: v.id("transacciones"),
  },
  handler: async (ctx, args) => {
    const existingTransaction = await ctx.db.get(args.id);
    if (!existingTransaction) {
      throw new Error("Transaction not found");
    }

    // Delete all line items (pagos) associated with this transaction
    const lineItems = await ctx.db
      .query("pagos")
      .withIndex("by_transaccion", (q) => q.eq("transaccion_id", args.id))
      .collect();

    for (const item of lineItems) {
      await ctx.db.delete(item._id);
    }

    // Delete associated documents
    const documents = await ctx.db
      .query("documentos")
      .withIndex("by_transaccion", (q) => q.eq("transaccion_id", args.id))
      .collect();

    for (const doc of documents) {
      await ctx.db.delete(doc._id);
    }

    // Delete the transaction
    await ctx.db.delete(args.id);
  },
});

// Get transaction with all its line items and documents
export const getTransactionById = query({
  args: {
    id: v.id("transacciones"),
  },
  handler: async (ctx, args) => {
    const transaction = await ctx.db.get(args.id);
    if (!transaction) {
      return null;
    }

    // Get all line items for this transaction
    const pagos = await ctx.db
      .query("pagos")
      .withIndex("by_transaccion", (q) => q.eq("transaccion_id", args.id))
      .collect();

    // Enrich each pago with its partida data
    const lineItems = await Promise.all(
      pagos.map(async (pago) => {
        const partida = await ctx.db.get(pago.partida_id);
        return {
          ...pago,
          partida: partida ? {
            _id: partida._id,
            nombre: partida.nombre,
            familia: partida.familia,
            sub_partida: partida.sub_partida,
          } : undefined,
        };
      })
    );

    // Get associated documents
    const documents = await ctx.db
      .query("documentos")
      .withIndex("by_transaccion", (q) => q.eq("transaccion_id", args.id))
      .collect();

    return {
      ...transaction,
      lineItems,
      documents,
    };
  },
});

// List all transactions for a project
export const listByProyecto = query({
  args: {
    proyecto_id: v.id("desarrollos"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("transacciones")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto_id))
      .order("desc")
      .paginate(args.paginationOpts);

    // For each transaction, get its line items count
    const transactionsWithCounts = await Promise.all(
      result.page.map(async (transaction) => {
        const lineItemsCount = await ctx.db
          .query("pagos")
          .withIndex("by_transaccion", (q) =>
            q.eq("transaccion_id", transaction._id)
          )
          .collect()
          .then((items) => items.length);

        return {
          ...transaction,
          lineItemsCount,
        };
      })
    );

    return {
      ...result,
      page: transactionsWithCounts,
    };
  },
});

// Get all transactions for a proyecto (non-paginated)
export const getByProyecto = query({
  args: {
    proyecto_id: v.id("desarrollos"),
  },
  handler: async (ctx, args) => {
    const transactions = await ctx.db
      .query("transacciones")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto_id))
      .collect();

    return transactions;
  },
});

// Get aggregated payment data by partida (for backward compatibility with existing views)
export const getByPartidaName = query({
  args: {
    partida_name: v.string(),
    proyecto_id: v.optional(v.id("desarrollos")),
  },
  handler: async (ctx, args) => {
    // Use indexed query based on whether proyecto_id is provided
    const matchingPartidas = args.proyecto_id
      ? await ctx.db
          .query("partidas")
          .withIndex("by_nombre_proyecto", (q) => 
            q.eq("nombre", args.partida_name).eq("proyecto", args.proyecto_id)
          )
          .collect()
      : await ctx.db
          .query("partidas")
          .withIndex("by_nombre", (q) => q.eq("nombre", args.partida_name))
          .collect();

    // Get pagos for these partidas
    const allPayments = [];
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

// Get aggregated payment data by familia (for backward compatibility)
export const getByFamilia = query({
  args: {
    partida_name: v.string(),
    familia_name: v.string(),
    proyecto_id: v.optional(v.id("desarrollos")),
  },
  handler: async (ctx, args) => {
    // Use indexed query based on whether proyecto_id is provided
    const matchingPartidas = args.proyecto_id
      ? await ctx.db
          .query("partidas")
          .withIndex("by_nombre_familia_proyecto", (q) => 
            q.eq("nombre", args.partida_name)
             .eq("familia", args.familia_name)
             .eq("proyecto", args.proyecto_id)
          )
          .collect()
      : await ctx.db
          .query("partidas")
          .withIndex("by_nombre_familia", (q) => 
            q.eq("nombre", args.partida_name).eq("familia", args.familia_name)
          )
          .collect();

    // Get pagos for these partidas
    const allPayments = [];
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

// Get all line items (pagos) for a specific partida_id
export const getByPartidaId = query({
  args: {
    partida_id: v.id("partidas"),
  },
  handler: async (ctx, args) => {
    const payments = await ctx.db
      .query("pagos")
      .withIndex("by_partida_id", (q) => q.eq("partida_id", args.partida_id))
      .collect();

    // For each payment, get its parent transaction
    const paymentsWithTransactions = await Promise.all(
      payments.map(async (pago) => {
        const transaction = await ctx.db.get(pago.transaccion_id);
        return {
          ...pago,
          transaction,
        };
      })
    );

    return paymentsWithTransactions;
  },
});

// Get all transactions with project name, line items count, and documents count
export const getAllWithDetails = query({
  args: {},
  handler: async (ctx) => {
    const transactions = await ctx.db
      .query("transacciones")
      .order("desc")
      .collect();

    // For each transaction, get related data
    const transactionsWithDetails = await Promise.all(
      transactions.map(async (transaction) => {
        // Get project name
        const proyecto = await ctx.db.get(transaction.proyecto);
        
        // Count line items
        const lineItems = await ctx.db
          .query("pagos")
          .withIndex("by_transaccion", (q) =>
            q.eq("transaccion_id", transaction._id)
          )
          .collect();

        // Count documents
        const documents = await ctx.db
          .query("documentos")
          .withIndex("by_transaccion", (q) =>
            q.eq("transaccion_id", transaction._id)
          )
          .collect();

        return {
          ...transaction,
          proyectoNombre: proyecto?.nombre,
          lineItemsCount: lineItems.length,
          documentsCount: documents.length,
        };
      })
    );

    return transactionsWithDetails;
  },
});

// Get progress chart data for a project (cumulative spending over time)
export const getProgressChartData = query({
  args: {
    proyecto_id: v.id("desarrollos"),
  },
  handler: async (ctx, args) => {
    // Get all partidas for the project to calculate total budget
    const partidas = await ctx.db
      .query("partidas")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto_id))
      .collect();

    const totalPresupuestoAprobado = partidas.reduce(
      (sum, p) => sum + (p.presupuesto_aprobado || 0),
      0
    );

    // Get all transactions for the project sorted by date (ascending)
    const transactions = await ctx.db
      .query("transacciones")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto_id))
      .collect();

    // Sort transactions by date (parse DD/MM/YYYY format)
    const sortedTransactions = transactions.sort((a, b) => {
      const parseDate = (dateStr: string) => {
        const [day, month, year] = dateStr.split('/').map(Number);
        return new Date(year, month - 1, day).getTime();
      };
      return parseDate(a.fecha) - parseDate(b.fecha);
    });

    // Create cumulative data points
    const dataPoints: Array<{
      date: string;
      gastoProgramado: number;
      gastoTotal: number;
      avanceReal: number;
    }> = [];

    let cumulativeGasto = 0;

    for (let i = 0; i < sortedTransactions.length; i++) {
      const transaction = sortedTransactions[i];
      
      // Only count "Pagado" transactions
      if (transaction.status === "Pagado") {
        cumulativeGasto += transaction.monto_total;
      }

      // Calculate programmed spending (linear projection from 0 to total budget)
      const progress = (i + 1) / sortedTransactions.length;
      const gastoProgramado = totalPresupuestoAprobado * progress;

      // Calculate real progress percentage
      const avanceReal = totalPresupuestoAprobado > 0 
        ? (cumulativeGasto / totalPresupuestoAprobado) * 100 
        : 0;

      // Format date as "DD Mon"
      const [day, month] = transaction.fecha.split('/');
      const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
      const monthName = monthNames[parseInt(month, 10) - 1] || 'Ene';
      const dateLabel = `${day} ${monthName}`;

      dataPoints.push({
        date: dateLabel,
        gastoProgramado,
        gastoTotal: cumulativeGasto,
        avanceReal,
      });
    }

    return dataPoints;
  },
});

// Get chart data for a specific familia (e.g., MANO DE OBRA, HONORARIOS)
export const getFamiliaChartData = query({
  args: {
    proyecto_id: v.id("desarrollos"),
    familia: v.string(),
  },
  handler: async (ctx, args) => {
    // Get all partidas for this familia in the project
    const partidas = await ctx.db
      .query("partidas")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto_id))
      .collect();

    // Filter by familia
    const familiaPartidas = partidas.filter(p => p.familia === args.familia);
    const partidaIds = familiaPartidas.map(p => p._id);

    if (partidaIds.length === 0) {
      return { dataPoints: [], total: 0 };
    }

    // Get all pagos for these partidas
    const allPagos: Array<{
      monto: number;
      transaction: {
        fecha: string;
        status: string;
      };
    }> = [];

    for (const partidaId of partidaIds) {
      const pagos = await ctx.db
        .query("pagos")
        .withIndex("by_partida_id", (q) => q.eq("partida_id", partidaId))
        .collect();

      for (const pago of pagos) {
        const transaction = await ctx.db.get(pago.transaccion_id);
        if (transaction && transaction.status === "Pagado") {
          allPagos.push({
            monto: pago.monto,
            transaction,
          });
        }
      }
    }

    // Sort by transaction date
    const sortedPagos = allPagos.sort((a, b) => {
      const parseDate = (dateStr: string) => {
        const [day, month, year] = dateStr.split('/').map(Number);
        return new Date(year, month - 1, day).getTime();
      };
      return parseDate(a.transaction.fecha) - parseDate(b.transaction.fecha);
    });

    // Create cumulative data points
    const dataPoints: Array<{
      date: string;
      monto: number;
    }> = [];

    let cumulativeMonto = 0;

    for (let i = 0; i < sortedPagos.length; i++) {
      const pago = sortedPagos[i];
      cumulativeMonto += pago.monto;

      // Format date as "DD Mon"
      const [day, month] = pago.transaction.fecha.split('/');
      const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
      const monthName = monthNames[parseInt(month, 10) - 1] || 'Ene';
      const dateLabel = `${day} ${monthName}`;

      dataPoints.push({
        date: dateLabel,
        monto: cumulativeMonto,
      });
    }

    return {
      dataPoints,
      total: cumulativeMonto,
    };
  },
});
