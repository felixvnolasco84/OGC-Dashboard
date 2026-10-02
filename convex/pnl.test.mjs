import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { getPnlSummary, getProfitabilitySummary } from "./desarrollos";
import { getPaymentsByDateRange } from "./pagos";

const period = { periodYear: 2026, cutoffMonth: 2, usdToMxn: 17, eurToMxn: 18.5 };

function database(input = {}) {
  const tables = structuredClone({
    desarrollos: [{ _id: "project", nombre: "Obra", ubicacion: "Los Cabos", status: "Activo", honorarios_porcentaje: 10 }],
    partidas: [{ _id: "work", proyecto: "project", nivel: 1, nombre: "OBRA" }],
    transacciones: [{ _id: "transaction", proyecto: "project", fecha: "15/01/2026", status: "Pagado", monto_total: 1000, moneda: "MXN", tipo_cambio: "1" }],
    pagos: [{ _id: "payment", transaccion_id: "transaction", partida_id: "work", monto: 1000 }],
    ogc_movimientos: [],
    meticas_presupuesto: [{ _id: "metrics", proyecto: "project", presupuesto_aprobado: 2000, gasto_total: 500 }],
    ...input,
    users: [{ _id: "user", clerkId: "pnl-test-user", email: "pnl-test@example.com", role: "admin", allowed_desarrollos: [] }],
  });
  const ctx = {
    auth: { getUserIdentity: async () => ({ subject: "pnl-test-user" }) },
    db: {
      async get(id) { return Object.values(tables).flat().find(doc => doc._id === id) || null; },
      query(table) {
        const filters = [];
        const query = {
          withIndex(_index, predicate) {
            const builder = { eq(key, value) { filters.push([key, value]); return builder; } };
            predicate?.(builder);
            return query;
          },
          async collect() { return (tables[table] || []).filter(doc => filters.every(([key, value]) => doc[key] === value)); },
          async first() { return (await query.collect())[0] || null; },
        };
        return query;
      },
    },
  };
  return { ctx, tables };
}

const movement = (patch = {}) => ({
  _id: "movement", proyecto: "project", tipo: "ingreso", categoria: "HONORARIOS", monto: 300,
  fecha: "15/01/2026", moneda: "MXN", status: "activo", ...patch,
});
const structureAmount = (result, key) => result.totals.structureBreakdown.find(item => item.key === key).amount;

describe.each([
  ["P&L", getPnlSummary],
  ["Project profitability", getProfitabilitySummary],
])("%s", (_name, query) => {
  it.each([undefined, "automatico", "transacciones"])("uses the project percentage even with budget mode %s", async modo => {
    const f = database({
      desarrollos: [{ _id: "project", nombre: "Obra", honorarios_porcentaje: 10, honorarios_modo: modo }],
      partidas: [{ _id: "work", proyecto: "project", nivel: 1, nombre: "OBRA" }, { _id: "fee", proyecto: "project", nivel: 1, nombre: "HONORARIOS" }],
      pagos: [{ _id: "payment", transaccion_id: "transaction", partida_id: "work", monto: 1000 }, { _id: "explicit-fee", transaccion_id: "transaction", partida_id: "fee", monto: 600 }],
      transacciones: [{ _id: "transaction", proyecto: "project", fecha: "15/01/2026", status: "Pagado", monto_total: 1600, moneda: "MXN" }],
    });
    const before = structuredClone(f.tables);
    const result = await query._handler(f.ctx, period);
    expect(result.totals.honorarios).toBe(100);
    expect(result.projects[0].monthlyOgcMovements["2026-1"].honorarios).toBe(100);
    expect(f.tables).toEqual(before);
    if (modo === "transacciones") {
      const budget = await getPaymentsByDateRange._handler(f.ctx, { proyecto_id: "project" });
      expect(budget.honorarios).toBe(600);
    }
  });

  it("does not add project or corporate HONORARIOS/OTROS movements or reclassify contributions as costs", async () => {
    const f = database({ ogc_movimientos: [
      movement(),
      movement({ _id: "other", categoria: "OTROS", monto: 400 }),
      movement({ _id: "corporate", proyecto: undefined, monto: 3960180, descripcion: "APORTACIÓN FLUJO OGC" }),
    ] });
    const result = await query._handler(f.ctx, period);
    expect(result.totals.honorarios).toBe(100);
    expect(result.totals.ingresosOgc).toBe(100);
    expect(result.totals.costosEstructuraOgc).toBe(0);
    expect(result.totals.hasOgcIncomeMovements).toBe(false);
    expect(result.projects[0].monthlyOgcMovements["2026-1"].honorarios).toBe(100);
  });

  it.each([
    { categoria: "  disp   HONORARIOS ", descripcion: "Renta y transporte", tipo: "ingreso" },
    { categoria: "OTROS", descripcion: "Transporte y renta: DISP   HONORARIOS", tipo: "ingreso" },
    { categoria: "DISP HONORARIOS", descripcion: "Administración y nómina", tipo: "costo_estructura" },
  ])("puts DISP exclusively in its cost row with $tipo / $categoria", async patch => {
    const result = await query._handler(database({ ogc_movimientos: [movement(patch)] }).ctx, period);
    expect(result.totals.honorarios).toBe(100);
    expect(result.totals.costosEstructuraOgc).toBe(300);
    expect(structureAmount(result, "disp_honorarios")).toBe(300);
    expect(structureAmount(result, "renta")).toBe(0);
    expect(structureAmount(result, "transporte")).toBe(0);
    expect(structureAmount(result, "otros")).toBe(0);
    expect(result.totals.hasOgcIncomeMovements).toBe(false);
    expect(result.totals.hasOgcStructureMovements).toBe(true);
    expect(result.projects[0].monthlyOgcMovements["2026-1"].structureBreakdown.disp_honorarios).toBe(300);
  });

  it("preserves indirect income and normal structure costs", async () => {
    const f = database({ ogc_movimientos: [
      movement({ _id: "indirect", categoria: "INDIRECTOS", monto: 80 }),
      movement({ _id: "travel", categoria: "VIÁTICOS", monto: 20, fecha: "02/02/2026" }),
      movement({ _id: "rent", tipo: "costo_estructura", categoria: "RENTA", monto: 50 }),
    ] });
    const result = await query._handler(f.ctx, period);
    expect(result.totals.honorarios).toBe(100);
    expect(result.totals.indirectos).toBe(100);
    expect(result.totals.ingresosOgc).toBe(200);
    expect(structureAmount(result, "renta")).toBe(50);
    expect(result.projects[0].monthlyOgcMovements["2026-2"].indirectos).toBe(20);
  });

  it("preserves payment eligibility, hierarchy exclusions, currency and cutoff", async () => {
    const f = database({
      desarrollos: [{ _id: "project", nombre: "Obra", honorarios_porcentaje: 10, honorarios_modo: "transacciones", excluded_partidas_honorarios: ["excluded"] }],
      partidas: [
        { _id: "work", proyecto: "project", nivel: 1, nombre: "OBRA" },
        { _id: "excluded", proyecto: "project", nivel: 1, nombre: "EXCLUIDA" },
        { _id: "child", proyecto: "project", nivel: 3, nombre: "Material", partida_nombre: "EXCLUIDA" },
      ],
      transacciones: [
        { _id: "jan", proyecto: "project", fecha: "15/01/2026", status: "Pagado", moneda: "USD", tipo_cambio: "20" },
        { _id: "feb", proyecto: "project", fecha: "2026-02-28", status: "Pagado", moneda: "EUR", tipo_cambio: "" },
        { _id: "pending", proyecto: "project", fecha: "15/01/2026", status: "Por pagar", moneda: "MXN" },
        { _id: "future", proyecto: "project", fecha: "01/03/2026", status: "Pagado", moneda: "MXN" },
        { _id: "old", proyecto: "project", fecha: "31/12/2025", status: "Pagado", moneda: "MXN" },
        { _id: "invalid", proyecto: "project", fecha: "NaN/NaN/NaN", status: "Pagado", moneda: "MXN" },
      ],
      pagos: [
        { transaccion_id: "jan", partida_id: "work", monto: 100 },
        { transaccion_id: "jan", partida_id: "child", monto: 500 },
        { transaccion_id: "feb", partida_id: "work", monto: 100 },
        ...["pending", "future", "old", "invalid"].map(id => ({ transaccion_id: id, partida_id: "work", monto: 1000 })),
      ],
    });
    const result = await query._handler(f.ctx, period);
    expect(result.totals.honorarios).toBe(385);
    expect(result.projects[0].monthlyOgcMovements["2026-1"].honorarios).toBe(200);
    expect(result.projects[0].monthlyOgcMovements["2026-2"].honorarios).toBe(185);
  });

  it("skips inactive, invalid-date and outside-period DISP movements and converts active costs", async () => {
    const f = database({ ogc_movimientos: [
      movement({ _id: "jan", categoria: "DISP HONORARIOS", monto: 10, moneda: "USD", tipo_cambio: 20 }),
      movement({ _id: "feb", categoria: "DISP HONORARIOS", monto: 10, moneda: "EUR", fecha: "28/02/2026" }),
      movement({ _id: "void", categoria: "DISP HONORARIOS", status: "anulado" }),
      movement({ _id: "duplicate", categoria: "DISP HONORARIOS", status: "duplicado" }),
      movement({ _id: "future", categoria: "DISP HONORARIOS", fecha: "01/03/2026" }),
      movement({ _id: "old", categoria: "DISP HONORARIOS", fecha: "31/12/2025" }),
      movement({ _id: "invalid", categoria: "DISP HONORARIOS", fecha: "NaN/NaN/NaN" }),
    ] });
    const result = await query._handler(f.ctx, period);
    const monthly = result.projects[0].monthlyOgcMovements;
    expect(result.totals.honorarios).toBe(100);
    expect(structureAmount(result, "disp_honorarios")).toBe(385);
    expect(monthly["2026-1"].structureBreakdown.disp_honorarios).toBe(200);
    expect(monthly["2026-2"].structureBreakdown.disp_honorarios).toBe(185);
    expect(Object.values(monthly).reduce((sum, month) => sum + month.honorarios, 0)).toBe(result.totals.honorarios);
    expect(Object.values(monthly).reduce((sum, month) => sum + month.structureBreakdown.disp_honorarios, 0)).toBe(385);
  });

  it("returns zero honorarios for a project without a percentage", async () => {
    const f = database({ desarrollos: [{ _id: "project", nombre: "Obra", honorarios_modo: "transacciones" }], ogc_movimientos: [movement()] });
    expect((await query._handler(f.ctx, period)).totals.honorarios).toBe(0);
  });
});

it("keeps corporate DISP in consolidated P&L and excludes misclassified costs from WIP income", async () => {
  const f = database({
    ingresos: [{ _id: "income", proyecto: "project", monto: 200, fecha: "01/01/2026", moneda: "MXN" }],
    ogc_movimientos: [movement({ categoria: "DISP HONORARIOS" }), movement({ _id: "corporate", proyecto: undefined, categoria: "DISP HONORARIOS", monto: 70 })],
  });
  const pnl = await getPnlSummary._handler(f.ctx, period);
  const profitability = await getProfitabilitySummary._handler(f.ctx, period);
  expect(structureAmount(pnl, "disp_honorarios")).toBe(370);
  expect(pnl.monthlyOgcMovements["2026-1"].structureBreakdown.disp_honorarios).toBe(370);
  expect(structureAmount(profitability, "disp_honorarios")).toBe(300);
  expect(profitability.projects[0].wip.pagado).toBe(200);
  expect(profitability.projects[0].wip.costoReal).toBe(500);
  expect(profitability.projects[0].wip.averageMonthlyExpense).toBe(1000);
});

it("excludes informative source categories from costs and collected income even with legacy types", async () => {
  const f = database({ ogc_movimientos: [
    movement({ tipo: "costo_estructura", categoria: "CARGA SOCIAL OBRA (SIROC-RECUPERABLE)", descripcion: "PAGO IMSS", monto: 500 }),
    movement({ _id: "fiscal", tipo: "ingreso", categoria: "FLUJO FISCAL (IVA + RETENCIONES)", monto: 400 }),
    movement({ _id: "informative", tipo: "informativo", categoria: "OTROS", monto: 100 }),
    movement({ _id: "rent", tipo: "costo_estructura", categoria: "RENTA", descripcion: "Renta, transporte e impuestos", monto: 50 }),
    movement({ _id: "nomina", tipo: "costo_estructura", categoria: "NOMINA", descripcion: "Pago con IMSS", monto: 60 }),
    movement({ _id: "other", tipo: "costo_estructura", categoria: "OTROS", descripcion: "Gastos de transporte", monto: 70 }),
    movement({ _id: "actual-income", categoria: "HONORARIOS", monto: 80 }),
  ] });
  const pnl = await getPnlSummary._handler(f.ctx, period);
  const profitability = await getProfitabilitySummary._handler(f.ctx, period);
  expect(pnl.totals.costosEstructuraOgc).toBe(180);
  expect(structureAmount(pnl, "renta")).toBe(50);
  expect(structureAmount(pnl, "nomina")).toBe(60);
  expect(structureAmount(pnl, "otros")).toBe(70);
  expect(structureAmount(pnl, "transporte")).toBe(0);
  expect(structureAmount(pnl, "cargas_sociales")).toBe(0);
  expect(profitability.projects[0].wip.pagado).toBe(80);
});

const snapshotPath = process.env.PNL_AUDIT_SNAPSHOT;
it.skipIf(!snapshotPath)("matches the audited real-data January–October 2026 totals", async () => {
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
  const f = database(snapshot.tables);
  const args = { ...period, cutoffMonth: 10 };
  const pnl = await getPnlSummary._handler(f.ctx, args);
  const cabos = await getPnlSummary._handler(f.ctx, { ...args, locationKey: "Los Cabos" });
  const profitability = await getProfitabilitySummary._handler(f.ctx, args);
  expect(pnl.totals.honorarios).toBeCloseTo(21595310.46, 2);
  expect(cabos.totals.honorarios).toBeCloseTo(19477017.38, 2);
  expect(profitability.totals.honorarios).toBeCloseTo(pnl.totals.honorarios, 6);
  expect(structureAmount(pnl, "disp_honorarios")).toBe(0);
  expect(Object.values(pnl.monthlyOgcMovements).reduce((sum, month) => sum + month.honorarios, 0)).toBeCloseTo(pnl.totals.honorarios, 6);
});
