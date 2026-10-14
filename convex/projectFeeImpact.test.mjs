import { describe, expect, it, vi } from "vitest";
import { previewFeeImpact, update, getPnlSummary } from "./desarrollos";
import { getByProyecto } from "./meticas_presupuesto";
import { FEE_IMPACT_LIMIT } from "./projectFeeImpact";
import { projectDraftPatch } from "../src/lib/project-fee-draft";
import { deriveFeeConcepts, calculateFeeConceptPayments } from "./feeConceptRules";
import { getPaymentsByDateRange } from "./pagos";
import { mutation } from "./functions";

// Indexed database double running the actual mutation wrapper and triggers.
// Rollback models Convex transaction behavior; this is not a deployed-db test.
function fixture(overrides = {}) {
  const tables = structuredClone({
    users: [{ _id: "users:u", clerkId: "test", role: "admin", email: "fees@example.test", organization_id: "org", allowed_desarrollos: [] }],
    desarrollos: [{ _id: "desarrollos:p", nombre: "Obra", descripcion: "Prueba", status: "Activo", organization_id: "org", moneda_principal: "MXN", honorarios_porcentaje: 10, honorarios_monto: 10000 }],
    partidas: [
      { _id: "partidas:work", proyecto: "desarrollos:p", nivel: 1, nombre: "OBRA", presupuesto_original: 200000, presupuesto_aprobado: 200000, pagado: 100000 },
      { _id: "partidas:fee", proyecto: "desarrollos:p", nivel: 1, nombre: "HONORARIOS", presupuesto_original: 30000, presupuesto_aprobado: 30000, pagado: 10000 },
    ],
    transacciones: [{ _id: "transacciones:t", proyecto: "desarrollos:p", monto_total: 100000, fecha: "2026-10-01", moneda: "MXN", tipo_cambio: "1", status: "Pagado" }],
    pagos: [{ _id: "pagos:p", transaccion_id: "transacciones:t", partida_id: "partidas:work", monto: 100000 }],
    ogc_movimientos: [{ _id: "ogc_movimientos:m", proyecto: "desarrollos:p", organization_id: "org", tipo: "costo_estructura", categoria: "INDIRECTOS", monto: 7000, fecha: "2026-10-02", moneda: "MXN", status: "activo" }],
    meticas_presupuesto: [{ _id: "meticas_presupuesto:m", proyecto: "desarrollos:p", presupuesto_original: 230000, presupuesto_aprobado: 230000, gasto_total: 110000, por_gastar: 120000 }],
    documentos: [], ...overrides,
  });
  const writes = [], reads = [];
  let failDerived = false;
  const find = id => Object.values(tables).flat().find(d => d._id === id);
  const ctx = { auth: { getUserIdentity: async () => ({ subject: "test" }) }, db: {
    normalizeId(table, id) { return id.startsWith(`${table}:`) ? id : null; },
    async get(id) { return structuredClone(find(id) || null); },
    async patch(id, fields) {
      if (failDerived && id.startsWith("meticas_presupuesto:")) throw new Error("fallo derivado");
      writes.push([id, fields]);
      const doc = find(id); if (!doc) throw new Error("missing");
      for (const [key, value] of Object.entries(fields)) { if (value === undefined) delete doc[key]; else doc[key] = structuredClone(value); }
    },
    async insert(table, fields) { const id = `${table}:new`; writes.push([id, fields]); (tables[table] ||= []).push({ _id: id, ...fields }); return id; },
    async delete(id) {
      const table = Object.values(tables).find(rows => rows.some(doc => doc._id === id));
      if (table) table.splice(table.findIndex(doc => doc._id === id), 1);
      writes.push([id, { deleted: true }]);
    },
    query(table) {
      const filters = [];
      const query = {
        withIndex(index, predicate) { const q = { eq(key, value) { filters.push([key, value]); return q; } }; predicate(q); reads.push([table, index]); return query; },
        async take(limit) { return structuredClone((tables[table] || []).filter(d => filters.every(([key, value]) => d[key] === value)).slice(0, limit)); },
        async collect() { return query.take(Infinity); },
        async first() { return (await query.take(1))[0] || null; },
      }; return query;
    },
  } };
  const preview = proposal => previewFeeImpact._handler(ctx, { id: "desarrollos:p", ...proposal });
  const save = async (proposal, scope) => {
    const snapshot = structuredClone(tables);
    try { await update._handler(ctx, { id: "desarrollos:p", ...proposal, ...(scope ? { expected_impact: scope } : {}) }); }
    catch (e) { for (const key of Object.keys(tables)) tables[key] = snapshot[key]; throw e; }
  };
  return { ctx, tables, writes, reads, preview, save, failDerived: () => { failDerived = true; } };
}

describe("reviewed project fee changes", () => {
  it.each([20, 5, 0])("previews and saves an active indirectos change to %s percent", async percentage => {
    const f = fixture();
    Object.assign(f.tables.desarrollos[0], { indirectos_porcentaje: 10, indirectos_fecha_inicio: "2026-10-01" });
    const proposal = { indirectos_porcentaje: percentage };
    const impact = await f.preview(proposal);
    expect(impact.beforeBudget.indirectos).toBe(10000);
    expect(impact.afterBudget.indirectos).toBe(percentage * 1000);
    await f.save(proposal, impact.expectedImpact);
    expect((await getByProyecto._handler(f.ctx, { proyecto_id: "desarrollos:p" })).gasto_total).toBe(impact.afterBudget.gasto_total);
  });
  it("returns to automatic honorarios using the retained percentage", async () => {
    const f = fixture();
    Object.assign(f.tables.desarrollos[0], { honorarios_modo: "transacciones", honorarios_monto: 4000 });
    const proposal = { honorarios_modo: "automatico" };
    const impact = await f.preview(proposal);
    expect(impact.afterBudget.honorarios).toBe(10000);
    expect(impact.afterPnl.honorarios).toBe(impact.beforePnl.honorarios);
    await f.save(proposal, impact.expectedImpact);
    expect(f.tables.desarrollos[0].honorarios_monto).toBe(10000);
  });
  it("simulates without writes and matches saved budget and P&L through actual triggers", async () => {
    const f = fixture();
    const proposal = { indirectos_porcentaje: 10, honorarios_porcentaje: 15 };
    const impact = await f.preview(proposal);
    expect(impact.status).toBe("ready"); expect(f.writes).toEqual([]);
    expect(impact.afterBudget).toMatchObject({ honorarios: 15000, indirectos: 10000, gasto_total: 125000, por_gastar: 105000 });
    await f.save(proposal, impact.expectedImpact);
    const budget = await getByProyecto._handler(f.ctx, { proyecto_id: "desarrollos:p" });
    expect(budget.gasto_total).toBe(impact.afterBudget.gasto_total);
    expect(budget.por_gastar).toBe(impact.afterBudget.por_gastar);
    expect(f.tables.partidas.find(p => p.nombre === "HONORARIOS").pagado).toBe(impact.afterBudget.honorarios);
    const pnl = await getPnlSummary._handler(f.ctx, { periodYear: 2026, cutoffMonth: 10 });
    expect(pnl.totals).toMatchObject({ honorarios: impact.afterPnl.honorarios, indirectos: impact.afterPnl.indirectos, saldoIndirectos: impact.afterPnl.saldoIndirectos, ebitda: impact.afterPnl.ebitda });
  });
  it("zero activation substitutes manual budget and ledger income without deleting records", async () => {
    const f = fixture();
    f.tables.partidas.push({ _id: "partidas:i", proyecto: "desarrollos:p", nivel: 1, nombre: "INDIRECTOS", pagado: 8000, presupuesto_aprobado: 10000 });
    f.tables.pagos.push({ _id: "pagos:i", transaccion_id: "transacciones:t", partida_id: "partidas:i", monto: 8000 });
    f.tables.ogc_movimientos.push({ _id: "ogc_movimientos:i", proyecto: "desarrollos:p", tipo: "ingreso", categoria: "INDIRECTOS", monto: 3000, fecha: "2026-10-01", moneda: "MXN" });
    const impact = await f.preview({ indirectos_porcentaje: 0 });
    expect(impact.beforeBudget.manualesSustituidos).toBe(0);
    expect(impact.afterBudget).toMatchObject({ indirectosBase: 108000, indirectos: 0, manualesSustituidos: 8000, gasto_total: 110000 });
    expect(impact.beforePnl.indirectosHistoricos).toBe(11000); expect(impact.afterPnl.indirectos).toBe(0);
    const payments = structuredClone(f.tables.pagos), movements = structuredClone(f.tables.ogc_movimientos);
    await f.save({ indirectos_porcentaje: 0 }, impact.expectedImpact);
    expect(f.tables.pagos).toEqual(payments); expect(f.tables.ogc_movimientos).toEqual(movements);
    expect(f.tables.desarrollos[0].indirectos_fecha_inicio).toBe("2026-10-01");
  });
  it("retains signed refunds in budget while applying absolute converted payments in P&L and indirectos", async () => {
    const f = fixture();
    f.tables.transacciones[0] = { ...f.tables.transacciones[0], monto_total: -100, moneda: "USD", tipo_cambio: "20" };
    f.tables.pagos[0].monto = -100;
    const impact = await f.preview({ indirectos_porcentaje: 10 });
    expect(impact.afterBudget.honorarios).toBe(-10);
    expect(impact.afterBudget.indirectosBase).toBe(2000); expect(impact.afterBudget.indirectos).toBe(200);
    expect(impact.afterPnl.honorarios).toBe(200); expect(impact.afterPnl.indirectosAutomaticos).toBe(200);
    await f.save({ indirectos_porcentaje: 10 }, impact.expectedImpact);
    expect((await getByProyecto._handler(f.ctx, { proyecto_id: "desarrollos:p" })).gasto_total).toBe(impact.afterBudget.gasto_total);
  });
  it("uses descendants and all transaction statuses for budget; mode does not change P&L", async () => {
    const f = fixture();
    f.tables.partidas.push({ _id: "partidas:child", proyecto: "desarrollos:p", nivel: 3, nombre: "Hoja", partida_nombre: "OBRA" });
    f.tables.pagos[0].partida_id = "partidas:child";
    f.tables.transacciones.push({ _id: "transacciones:pending", proyecto: "desarrollos:p", monto_total: 5000, fecha: "2026-10-04", moneda: "MXN", status: "Por pagar" });
    f.tables.pagos.push({ _id: "pagos:pending", transaccion_id: "transacciones:pending", partida_id: "partidas:fee", monto: 5000 });
    const excluded = await f.preview({ indirectos_porcentaje: 10, excluded_partidas_honorarios: ["partidas:work"] });
    expect(excluded.afterBudget.honorariosBase).toBe(5000); expect(excluded.afterPnl.baseHonorarios).toBe(0);
    const manual = await f.preview({ honorarios_modo: "transacciones" });
    expect(manual.afterBudget.honorarios).toBe(5000); expect(manual.afterPnl.honorarios).toBe(manual.beforePnl.honorarios);
    await f.save({ honorarios_modo: "transacciones" }, manual.expectedImpact);
    expect(f.tables.desarrollos[0].honorarios_monto).toBe(5000);
  });
  it("keeps pre-start amounts historical, monthly detail, invalid dates and fallback rates", async () => {
    const f = fixture();
    f.tables.transacciones[0].moneda = "EUR"; f.tables.transacciones[0].tipo_cambio = ""; f.tables.pagos[0].monto = .335;
    f.tables.transacciones.push({ _id: "transacciones:old", proyecto: "desarrollos:p", monto_total: 100, fecha: "2025-09-30", moneda: "MXN", status: "Pagado" }, { _id: "transacciones:bad", proyecto: "desarrollos:p", monto_total: 100, fecha: "31/09/2026", moneda: "MXN", status: "Pagado" });
    f.tables.pagos.push({ _id: "pagos:old", transaccion_id: "transacciones:old", partida_id: "partidas:work", monto: 100 }, { _id: "pagos:bad", transaccion_id: "transacciones:bad", partida_id: "partidas:work", monto: 100 });
    const impact = await f.preview({ indirectos_porcentaje: 10 });
    expect(impact.counts.invalidDates).toBe(1); expect(impact.period.start).toBe("2025-09-30");
    expect(impact.afterPnl.indirectosAutomaticos).toBe(.62);
    expect(impact.afterPnl.monthly["2025-9"].indirectosAutomaticos).toBe(0);
    expect(impact.afterPnl.baseHonorarios).toBeCloseTo(106.1975);
  });
  it.each(["payment", "transaction", "partida", "movement", "configuration"])("rejects stale %s input before any writes", async kind => {
    const f = fixture(), proposal = { indirectos_porcentaje: 10 };
    const impact = await f.preview(proposal);
    if (kind === "payment") f.tables.pagos[0].monto += 1;
    if (kind === "transaction") f.tables.transacciones[0].status = "Por pagar";
    if (kind === "partida") f.tables.partidas[0].presupuesto_aprobado += 1;
    if (kind === "movement") f.tables.ogc_movimientos[0].monto += 1;
    if (kind === "configuration") f.tables.desarrollos[0].honorarios_porcentaje = 20;
    await expect(f.save(proposal, impact.expectedImpact)).rejects.toThrow("impacto cambió"); expect(f.writes).toEqual([]);
  });
  it("requires preview, validates fields and keeps unrelated concurrent changes", async () => {
    const f = fixture();
    await expect(f.save({ honorarios_porcentaje: 20 })).rejects.toThrow("Revisa el impacto");
    const impact = await f.preview({ honorarios_porcentaje: 20 });
    f.tables.desarrollos[0].descripcion = "Edición externa";
    await f.save({ honorarios_porcentaje: 20 }, impact.expectedImpact);
    expect(f.tables.desarrollos[0].descripcion).toBe("Edición externa");
    const g = fixture();
    g.tables.desarrollos[0].nombre = "Externo";
    await expect(g.save({ nombre: "Borrador", expected_fields: { nombre: "Obra" } })).rejects.toThrow("campo nombre cambió"); expect(g.writes).toEqual([]);
  });
  it("propagates errors from derived updates and rolls back in the transactional double", async () => {
    const f = fixture(), proposal = { honorarios_porcentaje: 20 };
    const impact = await f.preview(proposal), snapshot = structuredClone(f.tables);
    f.failDerived();
    const logging = vi.spyOn(console, "error").mockImplementation(() => {});
    try { await expect(f.save(proposal, impact.expectedImpact)).rejects.toThrow("fallo derivado"); expect(f.tables).toEqual(snapshot); }
    finally { logging.mockRestore(); }
  });
  it.each(["unauthenticated", "nonadmin", "organization", "revoked"])("revalidates %s access without returning amounts", async kind => {
    const f = fixture(), proposal = { indirectos_porcentaje: 10 };
    const impact = await f.preview(proposal);
    if (kind === "unauthenticated") f.ctx.auth.getUserIdentity = async () => null;
    if (kind === "nonadmin") f.tables.users[0].role = "viewer";
    if (kind === "organization" || kind === "revoked") f.tables.users[0].organization_id = "other";
    expect((await f.preview(proposal)).status).toBe("error");
    await expect(f.save(proposal, impact.expectedImpact)).rejects.toThrow(); expect(f.writes).toEqual([]);
  });
  it("handles empty records, missing fee root, stale persisted fees and invalid exclusions", async () => {
    const f = fixture({ partidas: [], transacciones: [], pagos: [], ogc_movimientos: [] });
    const impact = await f.preview({ honorarios_porcentaje: 20 });
    expect(impact.afterBudget.honorarios).toBe(0); expect(impact.beforeBudget.honorarios).toBe(10000);
    expect(impact.afterPnl.ebitda).toBe(0); expect(impact.period.start).toBeNull();
    await f.save({ honorarios_porcentaje: 20 }, impact.expectedImpact); expect(f.tables.desarrollos[0].honorarios_monto).toBe(0);
    const g = fixture();
    expect((await g.preview({ excluded_partidas_honorarios: ["partidas:missing"] })).status).toBe("error");
    expect((await g.preview({ indirectos_porcentaje: 101 })).status).toBe("error"); expect(g.writes).toEqual([]);
  });
  it("bounds full-project reads and refuses oversized previews", async () => {
    const f = fixture({ transacciones: Array.from({ length: 600 }, (_, i) => ({ _id: `transacciones:${i}`, proyecto: "desarrollos:p", monto_total: 100, moneda: "MXN", status: "Pagado", fecha: "2026-10-01" })), pagos: [] });
    const impact = await f.preview({ indirectos_porcentaje: 10 });
    expect(impact.status).toBe("ready");
    expect(f.reads.every(([, index]) => index.startsWith("by_"))).toBe(true); expect(f.writes).toEqual([]);
    await f.save({ indirectos_porcentaje: 10 }, impact.expectedImpact);
    expect((await getByProyecto._handler(f.ctx, { proyecto_id: "desarrollos:p" })).gasto_total).toBe(impact.afterBudget.gasto_total);
    f.tables.partidas = Array.from({ length: FEE_IMPACT_LIMIT + 1 }, (_, i) => ({ _id: `partidas:${i}`, proyecto: "desarrollos:p", nivel: 1, nombre: `${i}` }));
    expect(await f.preview({ indirectos_porcentaje: 10 })).toMatchObject({ status: "error", message: expect.stringContaining("límite") });
  });
});

describe("project draft payload", () => {
  it("distinguishes untouched, zero activation, disabled and invalid empty active indirectos", () => {
    const baseline = fixture().tables.desarrollos[0];
    const draft = { nombre: "Obra", descripcion: "Prueba", status: "Activo", honorariosPorcentaje: "10", indirectosPorcentaje: "", honorariosModo: "automatico", excludedPartidas: [] };
    expect(projectDraftPatch(baseline, draft)).toMatchObject({ changed: false, invalid: false, financial: {} });
    expect(projectDraftPatch(baseline, { ...draft, indirectosPorcentaje: "0" }).financial).toEqual({ indirectos_porcentaje: 0 });
    expect(projectDraftPatch({ ...baseline, indirectos_porcentaje: 10 }, draft).invalid).toBe(true);
    const patch = projectDraftPatch(baseline, { ...draft, nombre: "Otro" });
    expect(patch.fields).toEqual({ nombre: "Otro" }); expect(patch.expectedFields).toEqual({ nombre: "Obra" }); expect(patch.financial).toEqual({});
  });
});

describe("concept percentages over total approved budget", () => {
  const input = (concepto, source, excluded = []) => ({ concepto, partida_id: `partidas:${source}`, excluded_partidas: excluded.map(id => `partidas:${id}`) });
  const root = (id, name, original, approved = original, paid = 0) => ({ _id: `partidas:${id}`, proyecto: "desarrollos:p", nivel: 1, nombre: name, presupuesto_original: original, presupuesto_aprobado: approved, pagado: paid });
  const roots = () => [root("work", "OBRA", 100000, 170000, 100000), root("fee", "HONORARIOS", 20000), root("v", "VIÁTICOS", 10000)];
  const proposal = () => ({ fee_concepts: [input("honorarios", "fee", ["fee", "work", "v"]), input("viaticos", "v", ["fee", "work", "v"])] });
  const children = () => [
    { ...root("familyA", "VIÁTICOS", 4000), nivel: 2, partida_nombre: "VIÁTICOS", familia: "Personal" },
    { ...root("familyB", "VIÁTICOS", 6000), nivel: 2, partida_nombre: "VIÁTICOS", familia: "Traslados" },
    ...[["a1", "Personal", 1000], ["a2", "Personal", 3000], ["b1", "Traslados", 1000], ["b2", "Traslados", 2000], ["b3", "Traslados", 3000]].map(([id, family, amount]) =>
      ({ ...root(id, "VIÁTICOS", amount), nivel: 3, partida_nombre: "VIÁTICOS", familia: family, sub_partida: id })),
  ];

  it("uses original concept amounts divided by all approved roots, ignoring exclusions and descendants", () => {
    const rows = [...roots(), ...children()];
    rows[1].presupuesto_aprobado = 40000; rows[0].presupuesto_aprobado = 150000;
    const configs = deriveFeeConcepts(proposal().fee_concepts, rows);
    expect(configs.map(c => c.base_aprobada)).toEqual([200000, 200000]);
    expect(configs.map(c => c.porcentaje)).toEqual([10, 5]);
    expect(configs.every(c => c.excluded_partidas.length === 0)).toBe(true);
  });

  it("applies every rate to every paid line, including its own source and previously excluded rows", () => {
    const rows = roots();
    const configs = deriveFeeConcepts(proposal().fee_concepts, rows);
    const result = calculateFeeConceptPayments({ configs, partidas: rows,
      transactions: [{ _id: "tx", status: "Pagado", fecha: "2026-10-01" }],
      pagos: [{ transaccion_id: "tx", partida_id: "partidas:work", monto: 1000 }, { transaccion_id: "tx", partida_id: "partidas:fee", monto: 100 }, { transaccion_id: "tx", partida_id: "partidas:v", monto: 100 }] });
    expect(result.concepts.map(c => c.basePagada)).toEqual([1200, 1200]);
    expect(result.concepts.map(c => c.monto)).toEqual([120, 60]);
  });

  it("preview, cached hierarchy, Control metrics and P&L agree without counting substituted manual charges twice", async () => {
    const rows = roots(); rows[2].pagado = 2000;
    const f = fixture({ partidas: rows, pagos: [
      { _id: "pagos:p", transaccion_id: "transacciones:t", partida_id: "partidas:work", monto: 100000 },
      { _id: "pagos:v", transaccion_id: "transacciones:t", partida_id: "partidas:v", monto: 2000 },
    ] });
    const before = structuredClone(f.tables);
    const impact = await f.preview(proposal());
    expect(f.tables).toEqual(before);
    expect(impact.afterBudget).toMatchObject({ honorarios: 10200, indirectos: 5100, manualesSustituidos: 2000, gasto_total: 115300 });
    expect(impact.afterPnl).toMatchObject({ honorarios: 10200, indirectos: 5100, saldoIndirectos: -1900, ebitda: 8300 });
    await f.save(proposal(), impact.expectedImpact);
    const metrics = await getByProyecto._handler(f.ctx, { proyecto_id: "desarrollos:p" });
    expect(metrics.gasto_total).toBe(115300);
    expect(f.tables.partidas.find(p => p._id === "partidas:v").pagado).toBe(5100);
    const payments = await getPaymentsByDateRange._handler(f.ctx, { proyecto_id: "desarrollos:p" });
    expect(payments.total).toBe(115300); expect(payments.paymentsByPartida["partidas:v"]).toBe(5100);
    const pnl = await getPnlSummary._handler(f.ctx, { periodYear: 2026, cutoffMonth: 10 });
    expect(pnl.totals.honorarios).toBe(10200); expect(pnl.totals.indirectos).toBe(5100);
    expect(f.tables.pagos).toEqual(before.pagos);
  });

  it("automatically updates rates and charges through an approved budget mutation without resaving configuration", async () => {
    const f = fixture({ partidas: roots() });
    const impact = await f.preview(proposal()); await f.save(proposal(), impact.expectedImpact);
    const change = mutation({ args: {}, handler: async ctx => ctx.db.patch("partidas:work", { presupuesto_aprobado: 370000 }) });
    await change._handler(f.ctx, {});
    expect(f.tables.desarrollos[0].fee_concepts.map(c => c.porcentaje)).toEqual([5, 2.5]);
    expect(f.tables.desarrollos[0].fee_concepts.map(c => c.base_aprobada)).toEqual([400000, 400000]);
    expect(f.tables.desarrollos[0].honorarios_monto).toBe(5000);
    expect(f.tables.partidas.find(p => p._id === "partidas:v").pagado).toBe(2500);
    expect((await getByProyecto._handler(f.ctx, { proyecto_id: "desarrollos:p" })).gasto_total).toBe(107500);
    const pnl = await getPnlSummary._handler(f.ctx, { periodYear: 2026, cutoffMonth: 10 });
    expect(pnl.totals.honorarios).toBe(5000); expect(pnl.totals.indirectos).toBe(2500);
  });

  it("an approved change in the source changes the denominator while the numerator stays original", () => {
    const rows = roots(); rows[2].presupuesto_aprobado = 110000;
    const configs = deriveFeeConcepts(proposal().fee_concepts, rows);
    expect(configs[1].monto_original).toBe(10000);
    expect(configs[1].base_aprobada).toBe(300000);
    expect(configs[1].porcentaje).toBeCloseTo(10 / 3, 10);
  });

  it("refreshes query calculations even when the stored snapshot predates a budget change", async () => {
    const f = fixture({ partidas: roots() });
    const impact = await f.preview(proposal()); await f.save(proposal(), impact.expectedImpact);
    f.tables.partidas[0].presupuesto_aprobado = 370000;
    const pnl = await getPnlSummary._handler(f.ctx, { periodYear: 2026, cutoffMonth: 10 });
    expect(pnl.totals.honorarios).toBe(5000); expect(pnl.totals.indirectos).toBe(2500);
  });

  it("distributes viaticos across five leaves and both families with exact cent rollup", async () => {
    const f = fixture({ partidas: [...roots(), ...children()],
      pagos: [{ _id: "pagos:p", transaccion_id: "transacciones:t", partida_id: "partidas:work", monto: 1000.20 }] });
    const impact = await f.preview(proposal()); await f.save(proposal(), impact.expectedImpact);
    const payments = await getPaymentsByDateRange._handler(f.ctx, { proyecto_id: "desarrollos:p" });
    expect(payments.indirectos).toBe(50.01);
    const leafIds = children().filter(p => p.nivel === 3).map(p => p._id);
    const sum = leafIds.reduce((total,id) => total + payments.paymentsByPartida[id], 0);
    expect(sum).toBeCloseTo(50.01, 8);
    expect(payments.paymentsByPartida["partidas:v"] || 0).toBe(0);
    expect(payments.paymentsByPartida["partidas:familyA"] || 0).toBe(0);
    expect(leafIds.every(id => payments.paymentsByPartida[id] > 0)).toBe(true);
    expect(payments.feePercentagesByPartida).toMatchObject({ "partidas:v": 5, "partidas:familyA": 2, "partidas:familyB": 3, "partidas:a1": .5, "partidas:a2": 1.5 });
    const travel = f.tables.partidas.find(p => p._id === "partidas:v");
    expect(travel.pagado).toBe(50.01);
    expect(travel.por_gastar).toBeCloseTo(9949.99, 8);
    const familySum = f.tables.partidas.filter(p => p.nivel === 2).reduce((total,p) => total + p.pagado, 0);
    expect(familySum).toBeCloseTo(travel.pagado, 8);
    expect((await getByProyecto._handler(f.ctx, { proyecto_id: "desarrollos:p" })).gasto_total).toBeCloseTo(1150.23, 8);
  });

  it("an approved leaf change rolls up the total and automatically refreshes every concept and leaf", async () => {
    const f = fixture({ partidas: [...roots(), ...children()] });
    const impact = await f.preview(proposal()); await f.save(proposal(), impact.expectedImpact);
    const change = mutation({ args: {}, handler: async ctx => ctx.db.patch("partidas:a1", { presupuesto_aprobado: 201000 }) });
    await change._handler(f.ctx, {});
    expect(f.tables.partidas.find(p => p._id === "partidas:v").presupuesto_aprobado).toBe(210000);
    expect(f.tables.desarrollos[0].fee_concepts.map(c => c.porcentaje)).toEqual([5, 2.5]);
    const payments = await getPaymentsByDateRange._handler(f.ctx, { proyecto_id: "desarrollos:p" });
    expect(payments.indirectos).toBe(2500);
    expect(f.tables.partidas.find(p => p._id === "partidas:a1").pagado).toBe(250);
  });

  it("the cent allocations by period add up to the same leaves as the accumulated calculation", () => {
    const rows = [...roots(), { ...root("family", "VIÁTICOS", 10000), nivel: 2, partida_nombre: "VIÁTICOS", familia: "Viaje" },
      ...["a", "b"].map(id => ({ ...root(id, "VIÁTICOS", 5000), nivel: 3, partida_nombre: "VIÁTICOS", familia: "Viaje" }))];
    const configs = deriveFeeConcepts([input("viaticos", "v")], rows);
    const txs = [{ _id: "oct", fecha: "2026-10-01", status: "Pagado" }, { _id: "nov", fecha: "2026-11-01", status: "Pagado" }];
    const pagos = txs.map(tx => ({ transaccion_id: tx._id, partida_id: "partidas:work", monto: .2 }));
    const calculate = transactions => calculateFeeConceptPayments({ configs, partidas: rows, transactions, pagos });
    const full = calculate(txs), oct = calculate([txs[0]]), nov = calculate([txs[1]]);
    expect(full.concepts[0].monto).toBe(.02);
    for (const id of ["partidas:a", "partidas:b"]) expect(full.automaticosPorPartida[id]).toBe(oct.automaticosPorPartida[id] + nov.automaticosPorPartida[id]);
  });

  it("refreshes allocated rows through payment insert, update and delete triggers", async () => {
    const f = fixture({ partidas: [...roots(), ...children()], pagos: [] });
    const preview = await f.preview(proposal()); await f.save(proposal(), preview.expectedImpact);
    const insert = mutation({ args: {}, handler: async ctx => ctx.db.insert("pagos", { transaccion_id: "transacciones:t", partida_id: "partidas:work", monto: 100000 }) });
    const id = await insert._handler(f.ctx, {});
    expect(f.tables.partidas.find(p => p._id === "partidas:v").pagado).toBe(5000);
    const change = mutation({ args: {}, handler: async ctx => ctx.db.patch(id, { monto: 50000 }) });
    await change._handler(f.ctx, {});
    expect(f.tables.partidas.find(p => p._id === "partidas:v").pagado).toBe(2500);
    const remove = mutation({ args: {}, handler: async ctx => ctx.db.delete(id) });
    await remove._handler(f.ctx, {});
    expect(f.tables.partidas.filter(p => p.partida_nombre === "VIÁTICOS").every(p => p.pagado === 0)).toBe(true);
    expect(f.tables.desarrollos[0].honorarios_monto).toBe(0);
  });

  it("keeps pre-cutoff honorarios rules and ignores pending payments in the new period", async () => {
    const f = fixture({ partidas: roots() });
    f.tables.transacciones.push({ _id: "transacciones:sep", proyecto: "desarrollos:p", fecha: "2026-09-30", status: "Pagado", monto_total: 100000, moneda: "MXN" }, { _id: "transacciones:pending", proyecto: "desarrollos:p", fecha: "2026-10-01", status: "Por pagar", monto_total: 100000, moneda: "MXN" });
    f.tables.pagos.push({ _id: "pagos:sep", transaccion_id: "transacciones:sep", partida_id: "partidas:work", monto: 100000 }, { _id: "pagos:pending", transaccion_id: "transacciones:pending", partida_id: "partidas:work", monto: 100000 });
    const impact = await f.preview(proposal()); await f.save(proposal(), impact.expectedImpact);
    const pnl = await getPnlSummary._handler(f.ctx, { periodYear: 2026, cutoffMonth: 10 });
    expect(pnl.monthlyOgcMovements["2026-9"].honorarios).toBe(10000);
    expect(pnl.monthlyOgcMovements["2026-10"].honorarios).toBe(10000);
    expect(pnl.monthlyOgcMovements["2026-10"].indirectos).toBe(5000);
  });

  it("rejects nonpositive approved totals, invalid sources and duplicate concepts without writes", async () => {
    const f = fixture({ partidas: roots() });
    for (const fee_concepts of [[input("honorarios", "missing")], [input("honorarios", "fee"), input("viaticos", "fee")], [input("honorarios", "fee"), input("honorarios", "v")]]) expect((await f.preview({ fee_concepts })).status).toBe("error");
    f.tables.partidas.forEach(p => { p.presupuesto_aprobado = 0; });
    expect((await f.preview(proposal())).status).toBe("error");
    expect(f.writes).toEqual([]);
  });

  it("blocks saving a stale review when the approved budget changed", async () => {
    const f = fixture({ partidas: roots() });
    const impact = await f.preview(proposal()); f.tables.partidas[0].presupuesto_aprobado++;
    await expect(f.save(proposal(), impact.expectedImpact)).rejects.toThrow("impacto cambió");
    expect(f.tables.desarrollos[0].fee_concepts).toBeUndefined();
  });

  it("deactivating concepts restores manual hierarchy and the previous calculation", async () => {
    const f = fixture({ partidas: [...roots(), ...children()] });
    const impact = await f.preview(proposal()); await f.save(proposal(), impact.expectedImpact);
    const disable = { fee_concepts: [] };
    const next = await f.preview(disable); await f.save(disable, next.expectedImpact);
    expect(f.tables.partidas.filter(p => p._id === "partidas:v" || p.partida_nombre === "VIÁTICOS").every(p => p.pagado === 0)).toBe(true);
    expect((await getByProyecto._handler(f.ctx, { proyecto_id: "desarrollos:p" })).gasto_total).toBe(110000);
  });

  it("converts paid foreign-currency lines before applying the project rates", async () => {
    const f = fixture({ partidas: roots(), transacciones: [{ _id: "transacciones:t", proyecto: "desarrollos:p", fecha: "2026-10-01", status: "Pagado", monto_total: 100, moneda: "USD", tipo_cambio: "20" }], pagos: [{ _id: "pagos:p", transaccion_id: "transacciones:t", partida_id: "partidas:work", monto: 100 }] });
    const impact = await f.preview(proposal());
    expect(impact.afterPnl).toMatchObject({ honorarios: 200, indirectos: 100 });
    expect(impact.afterBudget).toMatchObject({ honorarios: 200, indirectos: 100 });
    await f.save(proposal(), impact.expectedImpact);
    expect((await getPnlSummary._handler(f.ctx, { periodYear: 2026, cutoffMonth: 10 })).totals.honorarios).toBe(200);
  });
});
