import { query } from "./_generated/server";
import { mutation } from "./functions";
import { v } from "convex/values";
import { syncSalesPartidasInternal } from "./sales_partidas_sync";

// Create a new sales transaction with line items
export const createSalesTransaction = mutation({
    args: {
        sales_proyecto: v.id("sales_projects"),
        nombre_cliente: v.string(),
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
        lineItems: v.array(
            v.object({
                sales_partida_id: v.id("sales_partidas"),
                monto: v.number(),
            })
        ),
    },
    handler: async (ctx, args) => {
        const { lineItems, ...transactionData } = args;

        // Normalize fecha to DD/MM/YYYY if it arrives as YYYY-MM-DD (from HTML date input)
        if (transactionData.fecha && transactionData.fecha.includes("-")) {
            const [year, month, day] = transactionData.fecha.split("-");
            transactionData.fecha = `${day}/${month}/${year}`;
        }

        // Create the parent transaction
        const transactionId = await ctx.db.insert("sales_transacciones", transactionData);

        // Create all line items (pagos)
        const pagoPromises = lineItems.map((item) =>
            ctx.db.insert("sales_pagos", {
                sales_transaccion_id: transactionId,
                sales_partida_id: item.sales_partida_id,
                monto: item.monto,
            })
        );

        await Promise.all(pagoPromises);

        // Sync partidas to update pagado and por_gastar fields
        await syncSalesPartidasInternal(ctx, args.sales_proyecto);

        return transactionId;
    },
});


// Get all transactions with project name, line items count, and documents count
export const getAllWithDetails = query({
    args: {},
    handler: async (ctx) => {
        const transactions = await ctx.db
            .query("sales_transacciones")
            .order("desc")
            .collect();

        // For each transaction, get related data
        const transactionsWithDetails = await Promise.all(
            transactions.map(async (transaction) => {
                // Get project name
                const proyecto = await ctx.db.get(transaction.sales_proyecto);

                // Count line items
                const lineItems = await ctx.db
                    .query("sales_pagos")
                    .withIndex("by_sales_transaccion", (q) =>
                        q.eq("sales_transaccion_id", transaction._id)
                    )
                    .collect();

                // Count documents
                const documents = await ctx.db
                    .query("documentos")
                    .withIndex("by_sales_transaccion", (q) =>
                        q.eq("sales_transaccion_id", transaction._id)
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

// Get transactions by project with line items and documents count
export const getByProyectoWithDetails = query({
    args: {
        proyecto_id: v.id("sales_projects"),
    },
    handler: async (ctx, args) => {
        const transactions = await ctx.db
            .query("sales_transacciones")
            .withIndex("by_sales_proyecto", (q) => q.eq("sales_proyecto", args.proyecto_id))
            .order("desc")
            .collect();

        // For each transaction, count related data and get partida info
        const transactionsWithDetails = await Promise.all(
            transactions.map(async (transaction) => {
                // Get line items with partida details
                const lineItems = await ctx.db
                    .query("sales_pagos")
                    .withIndex("by_sales_transaccion", (q) =>
                        q.eq("sales_transaccion_id", transaction._id)
                    )
                    .collect();

                // Get partida names for display
                const partidaNames: string[] = [];
                for (const item of lineItems) {
                    const partida = await ctx.db.get(item.sales_partida_id);
                    if (partida) {
                        partidaNames.push(partida.partida_nombre || partida.familia || "Sin nombre");
                    }
                }

                // Get documents with URLs
                const documents = await ctx.db
                    .query("documentos")
                    .withIndex("by_sales_transaccion", (q) =>
                        q.eq("sales_transaccion_id", transaction._id)
                    )
                    .collect();

                // Get URL for the first document (factura)
                let firstDocumentUrl: string | null = null;
                if (documents.length > 0) {
                    const firstDoc = documents[0];
                    if (firstDoc.storage_id) {
                        firstDocumentUrl = await ctx.storage.getUrl(firstDoc.storage_id);
                    } else if (firstDoc.image) {
                        firstDocumentUrl = firstDoc.image;
                    }
                }

                // Count documents
                const documentsCount = documents.length;

                return {
                    ...transaction,
                    lineItemsCount: lineItems.length,
                    documentsCount,
                    partidaNames: partidaNames.slice(0, 3), // First 3 partida names
                    documentUrl: firstDocumentUrl, // URL to open the document
                };
            })
        );

        return transactionsWithDetails;
    },
});

// Delete transaction and all its line items
export const deleteTransaction = mutation({
    args: {
        id: v.id("sales_transacciones"),
    },
    handler: async (ctx, args) => {
        const existingTransaction = await ctx.db.get(args.id);
        if (!existingTransaction) {
            throw new Error("Transaction not found");
        }

        // Store the project ID for sync later
        const projectId = existingTransaction.sales_proyecto;

        // Delete all line items (pagos) associated with this transaction
        const lineItems = await ctx.db
            .query("sales_pagos")
            .withIndex("by_sales_transaccion", (q) => q.eq("sales_transaccion_id", args.id))
            .collect();

        for (const item of lineItems) {
            await ctx.db.delete(item._id);
        }

        // Delete associated documents
        const documents = await ctx.db
            .query("documentos")
            .withIndex("by_sales_transaccion", (q) => q.eq("sales_transaccion_id", args.id))
            .collect();

        for (const doc of documents) {
            await ctx.db.delete(doc._id);
        }

        // Delete the transaction
        await ctx.db.delete(args.id);

        // Sync partidas to update pagado and por_gastar fields
        await syncSalesPartidasInternal(ctx, projectId);
    },
});


export const getTransactionById = query({
    args: {
        id: v.id("sales_transacciones"),
    },
    handler: async (ctx, args) => {
        const transaction = await ctx.db.get(args.id);
        if (!transaction) {
            return null;
        }

        // Get all line items for this transaction
        const lineItems = await ctx.db
            .query("sales_pagos")
            .withIndex("by_sales_transaccion", (q) => q.eq("sales_transaccion_id", args.id))
            .collect();

        // Enrich lineItems with partida information
        const enrichedLineItems = await Promise.all(
            lineItems.map(async (item) => {
                const partida = await ctx.db.get(item.sales_partida_id);
                return {
                    ...item,
                    partida,
                };
            })
        );

        // Get associated documents
        const documents = await ctx.db
            .query("documentos")
            .withIndex("by_sales_transaccion", (q) => q.eq("sales_transaccion_id", args.id))
            .collect();

        return {
            ...transaction,
            lineItems: enrichedLineItems,
            documents,
        };
    },
});

// Get progress chart data for a sales project (cumulative spending over time)
export const getProgressChartData = query({
    args: {
        proyecto_id: v.id("sales_projects"),
    },
    handler: async (ctx, args) => {
        // Get all sales partidas for the project to calculate total budget
        const partidas = await ctx.db
            .query("sales_partidas")
            .withIndex("by_sales_proyecto", (q) => q.eq("sales_proyecto", args.proyecto_id))
            .collect();

        const totalPresupuestoAprobado = partidas.reduce(
            (sum, p) => sum + (p.presupuesto_aprobado || 0),
            0
        );

        // Get all sales transactions for the project sorted by date (ascending)
        const transactions = await ctx.db
            .query("sales_transacciones")
            .withIndex("by_sales_proyecto", (q) => q.eq("sales_proyecto", args.proyecto_id))
            .collect();

        // Sort transactions by date (handle both DD/MM/YYYY and YYYY-MM-DD formats)
        const sortedTransactions = transactions.sort((a, b) => {
            const parseDate = (dateStr: string | undefined) => {
                if (!dateStr) return 0;

                // Handle "DD/MM/YYYY" format
                if (dateStr.includes('/')) {
                    const parts = dateStr.split('/').map(Number);
                    if (parts.length !== 3) return 0;
                    const [day, month, year] = parts;
                    return new Date(year, month - 1, day).getTime();
                }

                // Handle "YYYY-MM-DD" format (ISO)
                if (dateStr.includes('-')) {
                    const parts = dateStr.split('-').map(Number);
                    if (parts.length !== 3) return 0;
                    const [year, month, day] = parts;
                    return new Date(year, month - 1, day).getTime();
                }

                return 0;
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

            // Skip transactions without a valid date
            if (!transaction.fecha || typeof transaction.fecha !== 'string') {
                console.warn('Sales transaction missing fecha:', transaction._id);
                continue;
            }

            // Only count "Pagado" or "Cobrado" transactions for sales
            if (transaction.status === "Pagado" || transaction.status === "Cobrado") {
                cumulativeGasto += transaction.monto_total;
            }

            // Calculate programmed spending (linear projection from 0 to total budget)
            const progress = (i + 1) / sortedTransactions.length;
            const gastoProgramado = totalPresupuestoAprobado * progress;

            // Calculate real progress percentage
            const avanceReal = totalPresupuestoAprobado > 0
                ? (cumulativeGasto / totalPresupuestoAprobado) * 100
                : 0;

            // Format date as "DD Mon YYYY" with full year for better compatibility
            let day: string, month: string, year: string;

            if (transaction.fecha.includes('/')) {
                // Format: "DD/MM/YYYY"
                const parts = transaction.fecha.split('/');
                if (parts.length !== 3) {
                    console.warn('Invalid fecha format (expected DD/MM/YYYY):', transaction.fecha);
                    continue;
                }
                [day, month, year] = parts;
            } else if (transaction.fecha.includes('-')) {
                // Format: "YYYY-MM-DD"
                const parts = transaction.fecha.split('-');
                if (parts.length !== 3) {
                    console.warn('Invalid fecha format (expected YYYY-MM-DD):', transaction.fecha);
                    continue;
                }
                [year, month, day] = parts;
            } else {
                console.warn('Invalid fecha format (unknown format):', transaction.fecha);
                continue;
            }

            const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
            const monthName = monthNames[parseInt(month, 10) - 1] || 'Ene';
            const dateLabel = `${day} ${monthName} ${year}`;

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

// Get chart data for sales - supports filtering by partida names, familia names, and sub-partida names
export const getFamiliaChartData = query({
    args: {
        proyecto_id: v.id("sales_projects"),
        familia: v.optional(v.string()), // Made optional for flexibility
        partidas: v.optional(v.array(v.string())), // Filter by specific partida names
        familias: v.optional(v.array(v.string())), // Filter by specific familia names
        sub_partidas: v.optional(v.array(v.string())), // Filter by specific sub-partida names
    },
    handler: async (ctx, args) => {
        // Get all sales partidas for this project
        const partidas = await ctx.db
            .query("sales_partidas")
            .withIndex("by_sales_proyecto", (q) => q.eq("sales_proyecto", args.proyecto_id))
            .collect();

        // Apply filters based on provided criteria
        let filteredPartidas = partidas;

        // Filter by partida names (nivel 1)
        if (args.partidas && args.partidas.length > 0) {
            filteredPartidas = filteredPartidas.filter(p =>
                args.partidas!.includes(p.nombre) ||
                args.partidas!.includes(p.partida_nombre || "")
            );
        }

        // Filter by familia names
        if (args.familias && args.familias.length > 0) {
            filteredPartidas = filteredPartidas.filter(p => args.familias!.includes(p.familia));
        } else if (args.familia) {
            // Backward compatibility: use single familia if provided
            filteredPartidas = filteredPartidas.filter(p => p.familia === args.familia);
        }

        // Filter by sub-partida names
        if (args.sub_partidas && args.sub_partidas.length > 0) {
            filteredPartidas = filteredPartidas.filter(p => args.sub_partidas!.includes(p.sub_partida));
        }

        const partidaIds = filteredPartidas.map(p => p._id);

        if (partidaIds.length === 0) {
            return { dataPoints: [], total: 0 };
        }

        // Get all sales pagos for these partidas
        const allPagos: Array<{
            monto: number;
            transaction: {
                fecha: string;
                status: string;
            };
        }> = [];

        for (const partidaId of partidaIds) {
            const pagos = await ctx.db
                .query("sales_pagos")
                .withIndex("by_sales_partida_id", (q) => q.eq("sales_partida_id", partidaId))
                .collect();

            for (const pago of pagos) {
                const transaction = await ctx.db.get(pago.sales_transaccion_id);
                if (transaction && (transaction.status === "Pagado" || transaction.status === "Cobrado")) {
                    allPagos.push({
                        monto: pago.monto,
                        transaction,
                    });
                }
            }
        }

        // Sort by transaction date (handle both DD/MM/YYYY and YYYY-MM-DD formats)
        const sortedPagos = allPagos.sort((a, b) => {
            const parseDate = (dateStr: string) => {
                // Handle "DD/MM/YYYY" format
                if (dateStr.includes('/')) {
                    const [day, month, year] = dateStr.split('/').map(Number);
                    return new Date(year, month - 1, day).getTime();
                }
                // Handle "YYYY-MM-DD" format (ISO)
                if (dateStr.includes('-')) {
                    const [year, month, day] = dateStr.split('-').map(Number);
                    return new Date(year, month - 1, day).getTime();
                }
                return 0;
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

            // Format date as "DD Mon" (handle both DD/MM/YYYY and YYYY-MM-DD formats)
            let day: string, month: string;

            if (pago.transaction.fecha.includes('/')) {
                // Format: "DD/MM/YYYY"
                [day, month] = pago.transaction.fecha.split('/');
            } else {
                // Format: "YYYY-MM-DD"
                const parts = pago.transaction.fecha.split('-');
                [, month, day] = parts; // Extract year, month, day
            }

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