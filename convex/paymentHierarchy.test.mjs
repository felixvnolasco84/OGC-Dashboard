import { describe, expect, it } from "vitest";
import { calculateHierarchyPaymentTotals } from "./paymentHierarchyRules";
import { updatePagadoForHierarchy } from "./functions";
import { repairProjectPaymentTotals } from "./budgetMaintenance";
import { syncMontosPorPartidaNivel1, syncProjectData } from "./partida";

function fixture() {
  const base = { proyecto: "project", pagado: 0, por_gastar: 1000, presupuesto_original: 1000, presupuesto_aprobado: 1000 };
  const tables = {
    desarrollos: [{ _id: "project", nombre: "Obra", honorarios_modo: "transacciones", honorarios_monto: 80 }],
    partidas: [
      { ...base, _id: "root", nivel: 1, nombre: "OBRA" },
      { ...base, _id: "family", nivel: 2, nombre: "OBRA", partida_nombre: "OBRA", familia: "MATERIAL" },
      { ...base, _id: "leaf", nivel: 3, nombre: "OBRA", partida_nombre: "OBRA", familia: "MATERIAL", sub_partida: "ACERO" },
      { ...base, _id: "fee", nivel: 1, nombre: "HONORARIOS", pagado: 80, por_gastar: 920 },
    ],
    transacciones: [
      { _id: "paid", proyecto: "project", status: "Pagado", monto_total: 630 },
      { _id: "pending", proyecto: "project", status: "Por pagar", monto_total: 9000 },
      { _id: "foreign", proyecto: "other", status: "Pagado", monto_total: 9000 },
    ],
    pagos: [
      { _id: "root-pay", transaccion_id: "paid", partida_id: "root", monto: 100 },
      { _id: "family-pay", transaccion_id: "paid", partida_id: "family", monto: 200 },
      { _id: "leaf-pay", transaccion_id: "paid", partida_id: "leaf", monto: 300 },
      { _id: "refund", transaccion_id: "paid", partida_id: "leaf", monto: -50 },
      { _id: "fee-pay", transaccion_id: "paid", partida_id: "fee", monto: 80 },
      { _id: "pending-pay", transaccion_id: "pending", partida_id: "leaf", monto: 9000 },
      { _id: "foreign-pay", transaccion_id: "foreign", partida_id: "leaf", monto: 9000 },
    ],
    meticas_presupuesto: [{ _id: "metrics", proyecto: "project", presupuesto_original: 2000, presupuesto_aprobado: 2000, gasto_total: 80, por_gastar: 1920 }],
    users: [{ _id: "user", clerkId: "test", role: "admin", email: "test@example.com", allowed_desarrollos: ["project"] }],
  };
  const ctx = { auth: { getUserIdentity: async () => ({ subject: "test" }) }, db: {
    normalizeId(table, id) { return tables[table]?.some(doc => doc._id === id) ? id : null; },
    async get(id) { return structuredClone(Object.values(tables).flat().find(doc => doc._id === id) || null); },
    async patch(id, changes) { Object.assign(Object.values(tables).flat().find(doc => doc._id === id), changes); },
    async insert(table, doc) { const id = `new-${table}`; tables[table].push({ _id: id, ...doc }); return id; },
    query(table) {
      const filters = [];
      const query = {
        withIndex(_index, predicate) { const builder = { eq(key, value) { filters.push([key, value]); return builder; } }; predicate(builder); return query; },
        async collect() { return structuredClone((tables[table] || []).filter(doc => filters.every(([key, value]) => doc[key] === value))); },
        async first() { return (await query.collect())[0] || null; },
      };
      return query;
    },
  } };
  return { ctx, tables, get: ctx.db.get };
}

describe("payments at every hierarchy level", () => {
  it("counts direct root, family and leaf payments once regardless of cached totals", () => {
    const f = fixture();
    const totals = calculateHierarchyPaymentTotals(f.tables.partidas.map(p => ({ ...p, pagado: 999999 })), new Map([["root", 100], ["family", 200], ["leaf", 250]]), 80);
    expect(Object.fromEntries(totals)).toEqual({ root: 550, family: 450, leaf: 250, fee: 80 });
  });

  it.each([1, 2, 3])("refreshes the root when a payment on level %s changes", async nivel => {
    const f = fixture();
    await updatePagadoForHierarchy(f.ctx, { proyecto: "project", partida: "OBRA", familia: nivel === 1 ? "" : "MATERIAL", sub_partida: "ACERO", nivel });
    expect((await f.get("root")).pagado).toBe(550);
    if (nivel > 1) expect((await f.get("family")).pagado).toBe(450);
    if (nivel === 3) expect((await f.get("leaf")).pagado).toBe(250);
  });

  it("updates parent totals when a previously paid transaction becomes pending", async () => {
    const f = fixture();
    await updatePagadoForHierarchy(f.ctx, { proyecto: "project", partida: "OBRA", familia: "MATERIAL", sub_partida: "ACERO", nivel: 3 });
    await f.ctx.db.patch("paid", { status: "Por pagar" });
    await updatePagadoForHierarchy(f.ctx, { proyecto: "project", partida: "OBRA", familia: "MATERIAL", sub_partida: "ACERO", nivel: 3 });
    expect((await f.get("root")).pagado).toBe(0);
    expect((await f.get("family")).pagado).toBe(0);
    expect((await f.get("leaf")).pagado).toBe(0);
  });

  it("preserves complete calculated honorarios during hierarchy updates", async () => {
    const f = fixture();
    await f.ctx.db.patch("project", { honorarios_monto: 150 });
    await updatePagadoForHierarchy(f.ctx, { proyecto: "project", partida: "HONORARIOS", familia: "", sub_partida: "", nivel: 1 });
    expect((await f.get("fee")).pagado).toBe(150);
  });

  it("previews changes without any writes", async () => {
    const f = fixture();
    const before = structuredClone(f.tables);
    const result = await repairProjectPaymentTotals(f.ctx, "project", true);
    expect(result.metricsAfter).toMatchObject({ gasto_total: 630, por_gastar: 1370 });
    expect(result.partidasUpdated).toBe(3);
    expect(f.tables).toEqual(before);
  });

  it("repairs all levels and metrics while preserving source payments and budgets", async () => {
    const f = fixture();
    const before = structuredClone(f.tables);
    await repairProjectPaymentTotals(f.ctx, "project");
    expect(f.tables.partidas.map(p => p.pagado)).toEqual([550, 450, 250, 80]);
    expect((await f.get("metrics")).gasto_total).toBe(630);
    expect(f.tables.transacciones).toEqual(before.transacciones);
    expect(f.tables.pagos).toEqual(before.pagos);
    expect(f.tables.partidas.map(p => [p.presupuesto_original, p.presupuesto_aprobado])).toEqual(before.partidas.map(p => [p.presupuesto_original, p.presupuesto_aprobado]));
    expect((await repairProjectPaymentTotals(f.ctx, "project")).partidasUpdated).toBe(0);
  });

  it("creates missing metrics during repair", async () => {
    const f = fixture();
    f.tables.meticas_presupuesto = [];
    await repairProjectPaymentTotals(f.ctx, "project");
    expect(f.tables.meticas_presupuesto[0]).toMatchObject({ proyecto: "project", gasto_total: 630 });
  });

  it("keeps paid parent amounts when synchronizing budget rollups", async () => {
    const f = fixture();
    await repairProjectPaymentTotals(f.ctx, "project");
    await syncMontosPorPartidaNivel1._handler(f.ctx, { projectId: "project" });
    expect((await f.get("root")).pagado).toBe(550);
    expect((await f.get("family")).pagado).toBe(450);
    expect((await f.get("metrics")).gasto_total).toBe(630);
  });

  it("uses the same complete payment aggregation in the UI sync action", async () => {
    const f = fixture();
    await syncProjectData._handler(f.ctx, { projectId: "project" });
    expect(f.tables.partidas.map(p => p.pagado)).toEqual([550, 450, 250, 80]);
    expect((await f.get("metrics")).gasto_total).toBe(630);
  });
});
