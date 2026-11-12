import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { getPnlSummary, getProfitabilitySummary } from "./desarrollos";
import { getPaymentsByDateRange } from "./pagos";
import { calculateIndirectosFromRecords, isAutomaticIndirectos, validateIndirectosPercentage } from "./indirectosRules";
import { calculatePresupuestoMetrics } from "./presupuestoRules";
import { getByProyecto } from "./meticas_presupuesto";
import { getFamiliaChartData } from "./transacciones";
import { getAllWithMetrics } from "./desarrollos";
import { deriveFeeConcepts } from "./feeConceptRules";

const period = { periodYear: 2026, cutoffMonth: 2, usdToMxn: 17, eurToMxn: 18.5 };

function database(input = {}, { documentLimit = Infinity } = {}) {
  const reads = { documents: 0 };
  const recordRead = (documents) => {
    reads.documents += documents.length;
    if (reads.documents > documentLimit) throw new Error("Too many documents read in a single function execution");
    return documents;
  };
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
      async get(id) { return recordRead(Object.values(tables).flat().filter(doc => doc._id === id))[0] || null; },
      query(table) {
        const filters = [];
        const query = {
          withIndex(_index, predicate) {
            const builder = { eq(key, value) { filters.push([key, value]); return builder; } };
            predicate?.(builder);
            return query;
          },
          async collect() { return recordRead((tables[table] || []).filter(doc => filters.every(([key, value]) => doc[key] === value))); },
          async first() { return recordRead((tables[table] || []).filter(doc => filters.every(([key, value]) => doc[key] === value)).slice(0, 1))[0] || null; },
        };
        return query;
      },
    },
  };
  return { ctx, tables, reads };
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
    { categoria: "OTROS", descripcion: "Dispersión de honorarios", tipo: "costo_estructura" },
  ])("excludes DISP from rows, costs, income and margins with $tipo / $categoria", async patch => {
    const f = database({ ogc_movimientos: [movement(patch)] });
    const before = structuredClone(f.tables);
    const result = await query._handler(f.ctx, period);
    expect(f.tables).toEqual(before);
    expect(result.totals.honorarios).toBe(100);
    expect(result.totals).toMatchObject({ ingresosOgc: 100, costosEstructuraOgc: 0, costosEstructuraMasIndirectos: 0, ebitda: 100, ebitdaMargin: 1 });
    expect(result.totals.structureBreakdown.some(row => row.key === "disp_honorarios")).toBe(false);
    if (result.structureGroups) expect(result.structureGroups.some(row => row.key === "disp_honorarios")).toBe(false);
    expect(structureAmount(result, "renta")).toBe(0);
    expect(structureAmount(result, "transporte")).toBe(0);
    expect(structureAmount(result, "otros")).toBe(0);
    expect(result.totals.hasOgcIncomeMovements).toBe(false);
    expect(result.totals.hasOgcStructureMovements).toBe(false);
    expect(result.projects[0].monthlyOgcMovements["2026-1"].structureBreakdown).not.toHaveProperty("disp_honorarios");
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
    expect(result.totals.honorarios).toBe(query === getProfitabilitySummary ? 485 : 385);
    expect(result.projects[0].monthlyOgcMovements["2026-1"].honorarios).toBe(200);
    expect(result.projects[0].monthlyOgcMovements["2026-2"].honorarios).toBe(185);
  });

  it("converts active costs while excluding DISP, inactive, invalid and future movements", async () => {
    const f = database({ ogc_movimientos: [
      movement({ _id: "jan", tipo: "costo_estructura", categoria: "RENTA", monto: 10, moneda: "USD", tipo_cambio: 20 }),
      movement({ _id: "feb", tipo: "costo_estructura", categoria: "RENTA", monto: 10, moneda: "EUR", fecha: "28/02/2026" }),
      movement({ _id: "void", tipo: "costo_estructura", categoria: "RENTA", status: "anulado" }),
      movement({ _id: "duplicate", tipo: "costo_estructura", categoria: "RENTA", status: "duplicado" }),
      movement({ _id: "future", tipo: "costo_estructura", categoria: "RENTA", fecha: "01/03/2026" }),
      movement({ _id: "old", tipo: "costo_estructura", categoria: "RENTA", fecha: "31/12/2025", monto: 25 }),
      movement({ _id: "invalid", tipo: "costo_estructura", categoria: "RENTA", fecha: "NaN/NaN/NaN" }),
      movement({ _id: "disp", categoria: "DISP HONORARIOS", monto: 5000, moneda: "USD" }),
    ] });
    const result = await query._handler(f.ctx, period);
    const monthly = result.projects[0].monthlyOgcMovements;
    expect(result.totals.honorarios).toBe(100);
    const expectedCost = query === getProfitabilitySummary ? 410 : 385;
    expect(structureAmount(result, "renta")).toBe(expectedCost);
    expect(monthly["2026-1"].structureBreakdown.renta).toBe(200);
    expect(monthly["2026-2"].structureBreakdown.renta).toBe(185);
    expect(Object.values(monthly).reduce((sum, month) => sum + month.honorarios, 0)).toBe(result.totals.honorarios);
    expect(Object.values(monthly).reduce((sum, month) => sum + month.structureBreakdown.renta, 0)).toBe(expectedCost);
  });

  it("returns zero honorarios for a project without a percentage", async () => {
    const f = database({ desarrollos: [{ _id: "project", nombre: "Obra", honorarios_modo: "transacciones" }], ogc_movimientos: [movement()] });
    expect((await query._handler(f.ctx, period)).totals.honorarios).toBe(0);
  });
});

it("excludes project and corporate DISP from both reports and WIP income", async () => {
  const f = database({
    ingresos: [{ _id: "income", proyecto: "project", monto: 200, fecha: "01/01/2026", moneda: "MXN" }],
    ogc_movimientos: [movement({ categoria: "DISP HONORARIOS" }), movement({ _id: "corporate", proyecto: undefined, categoria: "DISP HONORARIOS", monto: 70 })],
  });
  const pnl = await getPnlSummary._handler(f.ctx, period);
  const profitability = await getProfitabilitySummary._handler(f.ctx, period);
  expect(pnl.totals.costosEstructuraOgc).toBe(0);
  expect(pnl.monthlyOgcMovements["2026-1"].structureBreakdown).not.toHaveProperty("disp_honorarios");
  expect(profitability.totals.costosEstructuraOgc).toBe(0);
  expect(profitability.unassignedOgc).toEqual({ ingresosOgc: 0, costosOgc: 0, margen: 0 });
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

function automaticDatabase(patch = {}) {
  return database({
    desarrollos: [{ _id: "project", nombre: "Obra", honorarios_porcentaje: 15, indirectos_porcentaje: 10, indirectos_fecha_inicio: "2026-10-01", honorarios_monto: 15000 }],
    partidas: [{ _id: "work", proyecto: "project", nivel: 1, nombre: "OBRA", pagado: 100000, presupuesto_aprobado: 200000 }],
    transacciones: [{ _id: "transaction", proyecto: "project", fecha: "2026-10-01", status: "Pagado", monto_total: 100000, moneda: "MXN" }],
    pagos: [{ _id: "payment", transaccion_id: "transaction", partida_id: "work", monto: 100000 }],
    ogc_movimientos: [movement({ tipo: "costo_estructura", categoria: "INDIRECTOS", monto: 7000, fecha: "2026-10-02" })],
    ...patch,
  });
}
const october = { ...period, cutoffMonth: 10 };

it("loads profitability within the document limit for a portfolio with 15,000 historical payments", async () => {
  const desarrollos = Array.from({ length: 5 }, (_, index) => ({
    _id: `project-${index}`, nombre: `Obra ${index}`, honorarios_porcentaje: 15, indirectos_porcentaje: 10,
  }));
  const partidas = desarrollos.flatMap(project => Array.from({ length: 30 }, (_, index) => ({
    _id: `${project._id}-work-${index}`, proyecto: project._id, nivel: 1, nombre: `OBRA ${index}`, pagado: 10000,
  })));
  const transacciones = desarrollos.flatMap(project => Array.from({ length: 150 }, (_, index) => ({
    _id: `${project._id}-transaction-${index}`, proyecto: project._id, fecha: "2026-10-01", status: "Pagado", monto_total: 2000, moneda: "MXN",
  })));
  // Legacy payments intentionally have no proyecto_id; load them through their transaction.
  const pagos = transacciones.flatMap(transaction => Array.from({ length: 20 }, (_, index) => ({
    _id: `${transaction._id}-payment-${index}`, transaccion_id: transaction._id,
    partida_id: `${transaction.proyecto}-work-${index}`, monto: 100,
  })));
  const f = database({ desarrollos, partidas, transacciones, pagos, meticas_presupuesto: [] }, { documentLimit: 32000 });
  const result = await getProfitabilitySummary._handler(f.ctx, october);
  expect(result.projects).toHaveLength(5);
  expect(result.totals).toMatchObject({ honorarios: 225000, indirectos: 150000 });
  expect(result.totals.wip.costoReal).toBe(1650000);
  expect(f.reads.documents).toBeLessThan(17000);
});

it("accumulates profitability through cutoff while keeping monthly P&L annual and WIP costs unchanged", async () => {
  const f = automaticDatabase({
    desarrollos: [{ _id: "project", nombre: "Obra", honorarios_porcentaje: 15, indirectos_porcentaje: 10, honorarios_monto: 0 }],
    partidas: [{ _id: "work", proyecto: "project", nivel: 1, nombre: "OBRA", pagado: 6000 }],
    transacciones: [
      { _id: "old", proyecto: "project", fecha: "2025-12-01", status: "Pagado", monto_total: 1000, moneda: "MXN" },
      { _id: "current", proyecto: "project", fecha: "2026-10-01", status: "Pagado", monto_total: 2000, moneda: "MXN" },
      { _id: "future", proyecto: "project", fecha: "2026-11-01", status: "Pagado", monto_total: 3000, moneda: "MXN" },
    ],
    pagos: [
      { transaccion_id: "old", partida_id: "work", monto: 1000 },
      { transaccion_id: "current", partida_id: "work", monto: 2000 },
      { transaccion_id: "future", partida_id: "work", monto: 3000 },
    ],
    ogc_movimientos: [],
  });
  const result = await getProfitabilitySummary._handler(f.ctx, october);
  expect(result.totals).toMatchObject({ honorarios: 450, indirectos: 300, ingresosOgc: 750, currentMonthIngresos: 500 });
  const pnl = await getPnlSummary._handler(f.ctx, october);
  expect(pnl.totals).toMatchObject({ honorarios: 300, indirectos: 200, ingresosOgc: 500 });
  expect(pnl.monthlyOgcMovements).not.toHaveProperty("2025-12");
  expect(result.projects[0].wip).toMatchObject({ costoReal: 6600, averageMonthlyExpense: 1500 });
});

it("matches accumulated Presupuesto honorarios plus indirectos across project years", async () => {
  // Synthetic records reproduce the paid amounts in the reported example.
  const honorarios = 11069963.72;
  const indirectos = 2665542.77;
  const partidas = [
    { _id: "work", proyecto: "project", nivel: 1, nombre: "OBRA", presupuesto_original: 100000000 - honorarios - indirectos, presupuesto_aprobado: 100000000 - honorarios - indirectos, pagado: 100000000 },
    { _id: "fee", proyecto: "project", nivel: 1, nombre: "HONORARIOS", presupuesto_original: honorarios, presupuesto_aprobado: honorarios, pagado: 0 },
    { _id: "indirect", proyecto: "project", nivel: 1, nombre: "INDIRECTOS", presupuesto_original: indirectos, presupuesto_aprobado: indirectos, pagado: 0 },
  ];
  const fee_concepts = deriveFeeConcepts([
    { concepto: "honorarios", partida_id: "fee", excluded_partidas: [] },
    { concepto: "indirectos", partida_id: "indirect", excluded_partidas: [] },
  ], partidas, "project");
  const f = database({
    desarrollos: [{ _id: "project", nombre: "Obra", moneda_principal: "MXN", fee_concepts, honorarios_monto: 0 }],
    partidas,
    transacciones: [
      { _id: "old", proyecto: "project", fecha: "15/01/2024", status: "Pagado", monto_total: 60000000, moneda: "MXN" },
      { _id: "current", proyecto: "project", fecha: "2026-10-01", status: "Pagado", monto_total: 40000000, moneda: "MXN" },
    ],
    pagos: [
      { transaccion_id: "old", partida_id: "work", monto: 60000000 },
      { transaccion_id: "current", partida_id: "work", monto: 40000000 },
    ],
  });
  const before = structuredClone(f.tables);
  const budget = await getPaymentsByDateRange._handler(f.ctx, { proyecto_id: "project", end_date: "2026-10-31" });
  const metrics = await getByProyecto._handler(f.ctx, { proyecto_id: "project" });
  const profitability = await getProfitabilitySummary._handler(f.ctx, october);
  const project = profitability.projects[0];
  expect(budget.honorarios).toBe(honorarios);
  expect(budget.indirectos).toBe(indirectos);
  expect(metrics.honorarios_monto).toBe(honorarios);
  expect(project.honorarios).toBeCloseTo(budget.honorarios, 2);
  expect(project.indirectos).toBeCloseTo(budget.indirectos, 2);
  expect(project.ingresosOgc).toBeCloseTo(13735506.49, 2);
  expect(project.ingresosOgc).toBeCloseTo(budget.honorarios + budget.indirectos, 2);
  expect(project.margen).toBeCloseTo(project.ingresosOgc - project.costosOgc, 2);
  expect(profitability.totals.ingresosOgc).toBe(project.ingresosOgc);
  expect(f.tables).toEqual(before);
});

it("reconciles corporate and project structure, cutoff, currency and location without allocating corporate costs to a project", async () => {
  const f = database({
    desarrollos: [
      { _id: "project", nombre: "Obra", ubicacion: "Los Cabos", honorarios_porcentaje: 10 },
      { _id: "other-project", nombre: "Otra obra", ubicacion: "La Paz" },
    ],
    ogc_movimientos: [
      movement({ _id: "assigned", tipo: "costo_estructura", categoria: "RENTA", monto: 50 }),
      movement({ _id: "corporate", proyecto: undefined, tipo: "costo_estructura", categoria: "NOMINA", monto: 10, moneda: "USD", tipo_cambio: 20 }),
      movement({ _id: "old-corporate", proyecto: undefined, tipo: "costo_estructura", categoria: "NOMINA", monto: 30, fecha: "2025-12-01" }),
      movement({ _id: "other-project-cost", proyecto: "other-project", tipo: "costo_estructura", categoria: "RENTA", monto: 90 }),
      movement({ _id: "future", proyecto: undefined, tipo: "costo_estructura", categoria: "RENTA", fecha: "2026-03-01", monto: 2000 }),
      movement({ _id: "void", proyecto: undefined, tipo: "costo_estructura", categoria: "RENTA", status: "anulado", monto: 2000 }),
      movement({ _id: "disp", proyecto: undefined, categoria: "DISP HONORARIOS", monto: 9000 }),
    ],
  });
  const args = { ...period, locationKey: "Los Cabos" };
  const pnl = await getPnlSummary._handler(f.ctx, args);
  const profitability = await getProfitabilitySummary._handler(f.ctx, args);
  expect(profitability.projects).toHaveLength(1);
  expect(profitability.projects[0]).toMatchObject({ costosEstructuraOgc: 50, costosOgc: 50, margen: 50 });
  expect(profitability.unassignedOgc).toEqual({ ingresosOgc: 0, costosOgc: 230, margen: -230 });
  expect(profitability.totals).toMatchObject({ costosEstructuraOgc: 280, costosOgc: 280, margen: -180, ebitda: -180, currentMonthCostos: 0 });
  expect(structureAmount(profitability, "nomina")).toBe(230);
  expect(structureAmount(profitability, "renta")).toBe(50);
  expect(profitability.totals.structureBreakdown.reduce((sum, row) => sum + row.amount, 0)).toBe(profitability.totals.costosEstructuraOgc);
  expect(profitability.projects.reduce((sum, project) => sum + project.costosOgc, profitability.unassignedOgc.costosOgc)).toBe(profitability.totals.costosOgc);
  expect(pnl.totals.costosEstructuraOgc).toBe(250);
});

describe.each([["P&L", getPnlSummary], ["Profitability", getProfitabilitySummary]])("Automatic indirectos: %s", (_name, query) => {
  it("charges 10% and subtracts only actual costs, once", async () => {
    const f = automaticDatabase();
    const before = structuredClone(f.tables);
    const result = await query._handler(f.ctx, october);
    expect(result.totals).toMatchObject({ honorarios: 15000, indirectos: 10000, costosRealesIndirectos: 7000, saldoIndirectos: 3000, ingresosOgc: 25000, costosEstructuraMasIndirectos: 7000, ebitda: 18000 });
    expect(result.projects[0].monthlyOgcMovements["2026-10"]).toMatchObject({ indirectos: 10000, indirectosLegacyCosto: 0 });
    expect(f.tables).toEqual(before);
  });

  it("calculates general indirectos for September and October without duplicating manual income", async () => {
    const f = automaticDatabase({
      partidas: [{ _id: "work", proyecto: "project", nivel: 1, nombre: "OBRA" }, { _id: "indirect", proyecto: "project", nivel: 1, nombre: "INDIRECTOS" }],
      transacciones: [
        { _id: "september", proyecto: "project", fecha: "30/09/2026", status: "Pagado", monto_total: 1000, moneda: "MXN" },
        { _id: "transaction", proyecto: "project", fecha: "01/10/2026", status: "Pagado", monto_total: 100000, moneda: "MXN" },
      ],
      pagos: [{ transaccion_id: "september", partida_id: "indirect", monto: 1000 }, { transaccion_id: "transaction", partida_id: "work", monto: 100000 }],
      ogc_movimientos: [movement({ categoria: "INDIRECTOS", monto: 9999, fecha: "2026-10-02" })],
    });
    const september = await query._handler(f.ctx, { ...october, cutoffMonth: 9 });
    expect(september.totals).toMatchObject({ indirectos: 100, indirectosLegacyCosto: 0, ebitda: 250 });
    const mixed = await query._handler(f.ctx, october);
    expect(mixed.totals).toMatchObject({ indirectos: 10100, indirectosLegacyCosto: 0, ebitda: 25250 });
    expect(mixed.projects[0].monthlyOgcMovements["2026-9"].indirectos).toBe(100);
    expect(mixed.projects[0].monthlyOgcMovements["2026-10"].indirectos).toBe(10000);
  });

  it("supports zero percent without falling back to explicit indirect income", async () => {
    const f = automaticDatabase({ desarrollos: [{ _id: "project", nombre: "Obra", indirectos_porcentaje: 0 }], ogc_movimientos: [movement({ categoria: "INDIRECTOS", fecha: "2026-10-01" })] });
    expect((await query._handler(f.ctx, october)).totals.indirectos).toBe(0);
  });

  it("recalculates percentages, dates and payment changes reactively", async () => {
    const f = automaticDatabase();
    f.tables.desarrollos[0].indirectos_porcentaje = 20;
    expect((await query._handler(f.ctx, october)).totals.indirectos).toBe(20000);
    f.tables.pagos[0].monto = 50000;
    expect((await query._handler(f.ctx, october)).totals.indirectos).toBe(10000);
    f.tables.transacciones[0].status = "Por pagar";
    expect((await query._handler(f.ctx, october)).totals.indirectos).toBe(0);
    f.tables.transacciones[0].status = "Pagado";
    f.tables.transacciones[0].fecha = "2026-11-01";
    expect((await query._handler(f.ctx, october)).totals.indirectos).toBe(0);
    f.tables.transacciones.length = 0;
    expect((await query._handler(f.ctx, october)).totals.indirectos).toBe(0);
  });

  it("uses honorarios exclusions and converts USD and EUR on eligible paid amounts", async () => {
    const f = automaticDatabase({
      desarrollos: [{ _id: "project", nombre: "Obra", honorarios_porcentaje: 15, indirectos_porcentaje: 10, excluded_partidas_honorarios: ["excluded"] }],
      partidas: [{ _id: "work", proyecto: "project", nivel: 1, nombre: "OBRA" }, { _id: "excluded", proyecto: "project", nivel: 1, nombre: "EXCLUIDA" }, { _id: "child", proyecto: "project", nivel: 3, nombre: "Material", partida_nombre: "EXCLUIDA" }, { _id: "fee", proyecto: "project", nivel: 1, nombre: "HONORARIOS" }],
      transacciones: [{ _id: "usd", proyecto: "project", status: "Pagado", fecha: "2026-10-01", moneda: "USD", tipo_cambio: "20" }, { _id: "eur", proyecto: "project", status: "Pagado", fecha: "2026-10-02", moneda: "EUR" }],
      pagos: [{ transaccion_id: "usd", partida_id: "work", monto: 100 }, { transaccion_id: "eur", partida_id: "work", monto: 100 }, { transaccion_id: "usd", partida_id: "child", monto: 999 }, { transaccion_id: "usd", partida_id: "fee", monto: 999 }],
      ogc_movimientos: [],
    });
    expect((await query._handler(f.ctx, october)).totals).toMatchObject({ honorarios: 577.5, indirectos: 385 });
  });
});

it("includes corporate real indirect expenses once in both consolidated reports", async () => {
  const f = automaticDatabase({ ogc_movimientos: [movement({ proyecto: undefined, categoria: "INDIRECTOS", tipo: "costo_estructura", fecha: "2026-10-02", monto: 12000 })] });
  const pnl = await getPnlSummary._handler(f.ctx, october);
  const profitability = await getProfitabilitySummary._handler(f.ctx, october);
  expect(pnl.totals).toMatchObject({ saldoIndirectos: -2000, costosRealesIndirectos: 12000, ebitda: 13000 });
  expect(profitability.totals).toMatchObject({ saldoIndirectos: -2000, costosRealesIndirectos: 12000, ebitda: 13000, margen: 13000, currentMonthMargen: 13000, currentMonthCostos: 12000 });
  expect(profitability.projects[0]).toMatchObject({ costosOgc: 0, margen: 25000 });
  expect(profitability.unassignedOgc).toEqual({ ingresosOgc: 0, costosOgc: 12000, margen: -12000 });
});

it("substitutes automatic indirectos in budget, control, filtered payments and WIP", async () => {
  const f = automaticDatabase({
    partidas: [{ _id: "work", proyecto: "project", nivel: 1, nombre: "OBRA", pagado: 100000, presupuesto_aprobado: 200000 }, { _id: "indirect", proyecto: "project", nivel: 1, nombre: "INDIRECTOS", pagado: 8000 }],
    pagos: [{ transaccion_id: "transaction", partida_id: "work", monto: 100000 }, { transaccion_id: "transaction", partida_id: "indirect", monto: 8000 }],
  });
  const metrics = await getByProyecto._handler(f.ctx, { proyecto_id: "project" });
  expect(metrics).toMatchObject({ indirectos_monto: 10800, gasto_total: 125800, por_gastar: 74200 });
  const payments = await getPaymentsByDateRange._handler(f.ctx, { proyecto_id: "project", start_date: "2026-10-01", end_date: "2026-10-31" });
  expect(payments.indirectos).toBe(10800);
  expect(payments.paymentsByPartida.indirect).toBe(0);
  expect(payments.total).toBe(110800);
  const profitability = await getProfitabilitySummary._handler(f.ctx, october);
  expect(profitability.projects[0].wip.costoReal).toBe(125800);
  expect(calculatePresupuestoMetrics(f.tables.partidas, 15000, { automaticos: 10800, manualesSustituidos: 8000 }).gasto_total).toBe(metrics.gasto_total);
});

it("ignores stored activation dates while validating percentages and calendar dates", () => {
  for (const value of [-1, 101, NaN, Infinity]) expect(() => validateIndirectosPercentage(value)).toThrow();
  for (const value of [undefined, 0, 10, 100]) expect(() => validateIndirectosPercentage(value)).not.toThrow();
  expect(isAutomaticIndirectos({}, "2026-10-01")).toBe(false);
  expect(isAutomaticIndirectos({ indirectos_porcentaje: 0 }, "2026-10-01")).toBe(true);
  expect(isAutomaticIndirectos({ indirectos_porcentaje: 10 }, "31/09/2026")).toBe(false);
  expect(isAutomaticIndirectos({ indirectos_porcentaje: 10, indirectos_fecha_inicio: "2099-01-01" }, "2020-01-01")).toBe(true);
  const f = automaticDatabase();
  const calculate = () => calculateIndirectosFromRecords({ config: f.tables.desarrollos[0], partidas: f.tables.partidas, transactions: f.tables.transacciones, pagos: f.tables.pagos });
  expect(calculate().automaticos).toBe(10000);
  f.tables.desarrollos[0].indirectos_fecha_inicio = "2026-11-01";
  expect(calculate().automaticos).toBe(10000);
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
  expect(profitability.totals.honorarios).toBeGreaterThanOrEqual(pnl.totals.honorarios);
  expect(pnl.totals.structureBreakdown.some(row => row.key === "disp_honorarios")).toBe(false);
  expect(Object.values(pnl.monthlyOgcMovements).reduce((sum, month) => sum + month.honorarios, 0)).toBeCloseTo(pnl.totals.honorarios, 6);
});


describe("query read optimizations", () => {
  it("reuses one partida read for current metrics and project summaries", async () => {
    for (const query of [getByProyecto, getAllWithMetrics]) {
      const f = database({ desarrollos: [{ _id: "project", nombre: "Obra", indirectos_porcentaje: 10 }] });
      let partidaReads = 0;
      const original = f.ctx.db.query;
      f.ctx.db.query = table => {
        const result = original(table);
        if (table === "partidas") {
          const collect = result.collect;
          result.collect = async () => { partidaReads++; return collect(); };
        }
        return result;
      };
      const before = structuredClone(f.tables);
      await query._handler(f.ctx, { proyecto_id: "project" });
      expect(partidaReads).toBe(1);
      expect(f.tables).toEqual(before);
    }
  });

  it("reads each shared chart transaction once and preserves equal-date accumulation", async () => {
    const f = database({
      partidas: [{ _id: "a", proyecto: "project", nivel: 1, nombre: "A" }, { _id: "b", proyecto: "project", nivel: 1, nombre: "B" }],
      transacciones: [
        { _id: "same", fecha: "02/01/2026", status: "Pagado" },
        { _id: "early", fecha: "2026-01-01", status: "Pagado" },
        { _id: "pending", fecha: "01/01/2026", status: "Pendiente" },
      ],
      // Historical rows deliberately have no proyecto_id/classification fields.
      pagos: [
        { _id: "1", partida_id: "a", transaccion_id: "same", monto: .1 },
        { _id: "2", partida_id: "a", transaccion_id: "early", monto: 2 },
        { _id: "3", partida_id: "a", transaccion_id: "pending", monto: 20 },
        { _id: "4", partida_id: "b", transaccion_id: "same", monto: .2 },
        { _id: "5", partida_id: "b", transaccion_id: "missing", monto: 30 },
      ],
    });
    const idsRead = [];
    const get = f.ctx.db.get;
    f.ctx.db.get = async id => { idsRead.push(id); return get(id); };
    const result = await getFamiliaChartData._handler(f.ctx, { proyecto_id: "project" });
    expect(result).toEqual({ dataPoints: [
      { date: "2026-01-01", monto: 2 }, { date: "2026-01-02", monto: 2.1 }, { date: "2026-01-02", monto: 2.3000000000000003 },
    ], total: 2.3000000000000003 });
    expect(idsRead.filter(id => id === "same")).toHaveLength(1);
    expect(idsRead).toHaveLength(4);
  });

  it("preserves filtered historical payments, pending status behavior and empty ranges", async () => {
    const f = database({
      desarrollos: [{ _id: "project", nombre: "Obra", honorarios_porcentaje: 0 }],
      transacciones: [
        { _id: "early", proyecto: "project", fecha: "01/01/2026", status: "Pagado" },
        { _id: "late", proyecto: "project", fecha: "2026-02-02", status: "Pendiente" },
      ],
      pagos: [
        { _id: "p1", transaccion_id: "early", partida_id: "work", monto: 10 },
        { _id: "p2", transaccion_id: "late", partida_id: "work", monto: 20 },
      ],
    });
    const all = await getPaymentsByDateRange._handler(f.ctx, { proyecto_id: "project" });
    expect(all.paymentsByPartida).toEqual({ work: 30 });
    const january = await getPaymentsByDateRange._handler(f.ctx, { proyecto_id: "project", end_date: "2026-01-31" });
    expect(january.paymentsByPartida).toEqual({ work: 10 });
    const empty = await getPaymentsByDateRange._handler(f.ctx, { proyecto_id: "project", start_date: "2027-01-01" });
    expect(empty.paymentsByPartida).toEqual({});
    expect(empty.total).toBe(0);
  });
});
