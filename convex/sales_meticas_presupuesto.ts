import { query } from "./_generated/server";
import { mutation } from "./functions";
import { v } from "convex/values";

// Query to get metrics for a specific proyecto
export const getByProyecto = query({
    args: {
        proyecto_id: v.id("sales_projects"),
    },
    handler: async (ctx, args) => {
        const metrics = await ctx.db
            .query("sales_meticas_presupuesto")
            .withIndex("by_sales_proyecto", (q) => q.eq("sales_proyecto", args.proyecto_id))
            .first();
        return metrics;
    },
});

// Query to get all metrics
export const getAll = query({
    args: {},
    handler: async (ctx) => {
        const metrics = await ctx.db
            .query("sales_meticas_presupuesto")
            .collect();

        return metrics;
    },
});

// Query to get filtered metrics based on date range
export const getFilteredMetrics = query({
    args: {
        proyecto_id: v.id("sales_projects"),
        rango_fechas: v.optional(v.string()), // "Ultimos 7 dias", "Ultimos 30 dias", etc.
    },
    handler: async (ctx, args) => {
        // Calculate date range
        const now = new Date();
        let startDate: Date | null = null;

        if (args.rango_fechas) {
            switch (args.rango_fechas) {
                case "Ultimos 7 dias":
                    startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                    break;
                case "Ultimos 30 dias":
                    startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                    break;
                case "Ultimos 60 dias":
                    startDate = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
                    break;
                case "Ultimos 90 dias":
                    startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
                    break;
                case "Ultimos 180 dias":
                    startDate = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
                    break;
                case "Ultimos 365 dias":
                    startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
                    break;
                case "Todo el tiempo":
                default:
                    startDate = null; // No filter
                    break;
            }
        }

        // Get all transactions for the project
        const allTransactions = await ctx.db
            .query("sales_transacciones")
            .withIndex("by_sales_proyecto", (q) => q.eq("sales_proyecto", args.proyecto_id))
            .collect();

        // Filter transactions by date range if specified
        const filteredTransactions = startDate
            ? allTransactions.filter((t) => {
                if (!t.fecha) return false;

                // Parse date (handle both DD/MM/YYYY and YYYY-MM-DD formats)
                let transactionDate: Date;
                if (t.fecha.includes('/')) {
                    const [day, month, year] = t.fecha.split('/').map(Number);
                    transactionDate = new Date(year, month - 1, day);
                } else if (t.fecha.includes('-')) {
                    const [year, month, day] = t.fecha.split('-').map(Number);
                    transactionDate = new Date(year, month - 1, day);
                } else {
                    return false;
                }

                return transactionDate >= startDate;
            })
            : allTransactions;

        // Get all partidas for this proyecto
        const allPartidas = await ctx.db
            .query("sales_partidas")
            .withIndex("by_sales_proyecto", (q) => q.eq("sales_proyecto", args.proyecto_id))
            .collect();

        // Get presupuesto_aprobado from nivel 1 partidas
        const presupuesto_aprobado = allPartidas
            .filter((p) => p.nivel === 1)
            .reduce((sum, p) => sum + (p.presupuesto_aprobado || 0), 0);

        // Calculate gasto - use partidas.pagado for "Todo el tiempo" to match Main Metrics
        let gasto: number;
        if (!startDate) {
            // "Todo el tiempo" - use partidas.pagado (same as Main Metrics)
            gasto = allPartidas
                .filter((p) => p.nivel === 1)
                .reduce((sum, p) => sum + (p.pagado || 0), 0);
        } else {
            // Date filtered - calculate from transactions
            gasto = filteredTransactions
                .filter((t) => t.status === "Pagado")
                .reduce((sum, t) => sum + (t.monto_total || 0), 0);
        }

        // Calculate por_ejercer (remaining budget)
        const por_ejercer = presupuesto_aprobado - gasto;

        // Calculate honorarios based on date filter
        const proyecto = await ctx.db.get(args.proyecto_id);
        const comisionPorcentaje = proyecto?.comision_porcentaje || 0;

        let comision = 0;
        if (!startDate) {
            // "Todo el tiempo" - use pre-calculated comision_monto
            comision = proyecto?.comision_monto || 0;
        } else {
            // Date filtered - calculate comision from filtered transactions
            // comision = filtered total * (comision_porcentaje / 100)
            const filteredTotal = filteredTransactions.reduce(
                (sum, t) => sum + (t.monto_total || 0),
                0
            );
            comision = filteredTotal * (comisionPorcentaje / 100);
        }

        return {
            gasto,
            por_ejercer,
            comision,
            presupuesto_aprobado,
        };
    },
});

// Manual mutation to recalculate metrics for a proyecto
// Useful for initialization or fixing data issues
export const recalculate = mutation({
    args: {
        proyecto_id: v.id("sales_projects"),
    },
    handler: async (ctx, args) => {
        // Get all partidas for this proyecto (nivel 1 only for aggregated totals)
        const nivel1Partidas = await ctx.db
            .query("sales_partidas")
            .filter((q) =>
                q.and(
                    q.eq(q.field("nivel"), 1),
                    q.eq(q.field("sales_proyecto"), args.proyecto_id)
                )
            )
            .collect();

        // Calculate totals by summing nivel 1 partidas
        const presupuesto_original = nivel1Partidas.reduce(
            (sum, p) => sum + (p.presupuesto_original || 0),
            0
        );

        const presupuesto_aprobado = nivel1Partidas.reduce(
            (sum, p) => sum + (p.presupuesto_aprobado || 0),
            0
        );

        const gasto_total = nivel1Partidas.reduce(
            (sum, p) => sum + (p.pagado || 0),
            0
        );

        const por_gastar = presupuesto_aprobado - gasto_total;

        // Check if sales_meticas_presupuesto already exists for this proyecto
        const existingMetrics = await ctx.db
            .query("sales_meticas_presupuesto")
            .withIndex("by_sales_proyecto", (q) => q.eq("sales_proyecto", args.proyecto_id))
            .first();

        if (existingMetrics) {
            // Update existing record
            await ctx.db.patch(existingMetrics._id, {
                presupuesto_original,
                presupuesto_aprobado,
                gasto_total,
                por_gastar
            });
            return { success: true, operation: "updated", metrics: existingMetrics._id };
        } else {
            // Create new record
            const newMetrics = await ctx.db.insert("sales_meticas_presupuesto", {
                sales_proyecto: args.proyecto_id,
                presupuesto_original,
                presupuesto_aprobado,
                gasto_total,
                por_gastar
            });
            return { success: true, operation: "created", metrics: newMetrics };
        }
    },
});
