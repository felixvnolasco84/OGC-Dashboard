import { describe, expect, it, vi } from "vitest";
import { previewFeeImpact, update, getPnlSummary } from "./desarrollos";
import { getByProyecto } from "./meticas_presupuesto";
import { FEE_IMPACT_LIMIT } from "./projectFeeImpact";
import { projectDraftPatch } from "../src/lib/project-fee-draft";

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
