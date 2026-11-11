import { describe, expect, it } from "vitest";
import { getFamiliaChartData as getProjectChartData } from "./transacciones";
import { getFamiliaChartData as getSalesChartData } from "./sales_transacciones";

describe.each([
    ["project", getProjectChartData, "partidas", "pagos", "transaccion_id", "Pagado"],
    ["sales", getSalesChartData, "sales_partidas", "sales_pagos", "sales_transaccion_id", "Cobrado"],
])("%s cumulative chart dates", (_name, query, partidaTable, pagoTable, transactionKey, status) => {
    it("preserves years and daily closing totals across overlapping dates and a year boundary", async () => {
        const transactions = [
            { _id: "last", fecha: "04/10/2026", status },
            { _id: "first", fecha: "05/01/2025", status },
            { _id: "new-year", fecha: "2026-01-05", status },
            { _id: "year-end", fecha: "2025-12-31", status },
            { _id: "fall", fecha: "2025-10-04", status },
            { _id: "same-day", fecha: "5/1/2026", status },
            { _id: "pending", fecha: "2026-10-05", status: "Pendiente" },
        ];
        const tables = {
            [partidaTable]: [{ _id: "work", proyecto: "project", sales_proyecto: "project", familia: "MANO DE OBRA" }],
            [pagoTable]: transactions.map(transaction => ({
                partida_id: "work", sales_partida_id: "work", [transactionKey]: transaction._id, monto: 1_000,
            })),
        };
        const ctx = { db: {
            async get(id) { return transactions.find(transaction => transaction._id === id) ?? null; },
            query(table) {
                const filters = [];
                const result = {
                    withIndex(_index, predicate) {
                        const builder = { eq(key, value) { filters.push([key, value]); return builder; } };
                        predicate(builder);
                        return result;
                    },
                    async collect() { return tables[table].filter(row => filters.every(([key, value]) => row[key] === value)); },
                };
                return result;
            },
        } };

        const result = await query._handler(ctx, { proyecto_id: "project", familia: "MANO DE OBRA" });

        expect(result).toEqual({ dataPoints: [
            { date: "2025-01-05", monto: 1_000 },
            { date: "2025-10-04", monto: 2_000 },
            { date: "2025-12-31", monto: 3_000 },
            { date: "2026-01-05", monto: 4_000 },
            { date: "2026-01-05", monto: 5_000 },
            { date: "2026-10-04", monto: 6_000 },
        ], total: 6_000 });
    });
});
