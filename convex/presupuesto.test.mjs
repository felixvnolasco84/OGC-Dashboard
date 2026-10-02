import { describe, expect, it, vi } from "vitest";
import { calculatePresupuestoMetrics } from "./presupuestoRules";
import { getByProyecto } from "./meticas_presupuesto";
import { updateMeticasPresupuesto } from "./functions";

const { triggers } = vi.hoisted(() => ({ triggers: new Map() }));
vi.mock("convex-helpers/server/triggers", () => ({
  Triggers: class {
    register(table, handler) { triggers.set(table, handler); }
    wrapDB(ctx) { return ctx.db; }
  },
}));

function fixture({ honorarios = 200, feePagado = 50, cachedGasto = 1050 } = {}) {
  const tables = {
    desarrollos: [{ _id: "project", honorarios_monto: honorarios }],
    partidas: [
      { _id: "work", proyecto: "project", nivel: 1, nombre: "OBRA", presupuesto_original: 2000, presupuesto_aprobado: 2000, pagado: 1000 },
      { _id: "fee", proyecto: "project", nivel: 1, nombre: " HONORARIOS ", presupuesto_original: 500, presupuesto_aprobado: 500, pagado: feePagado },
      { _id: "child", proyecto: "project", nivel: 3, nombre: "Material", pagado: 1000 },
      { _id: "other", proyecto: "other-project", nivel: 1, nombre: "OBRA", pagado: 9000 },
    ],
    meticas_presupuesto: [{ _id: "metrics", proyecto: "project", presupuesto_original: 2500, presupuesto_aprobado: 2500, gasto_total: cachedGasto, por_gastar: 2500 - cachedGasto }],
  };
  const ctx = {
    db: {
      async get(id) { return Object.values(tables).flat().find(doc => doc._id === id) || null; },
      async patch(id, changes) { Object.assign(await ctx.db.get(id), changes); },
      query(table) {
        const filters = [];
        const query = {
          withIndex(_index, predicate) {
            const builder = { eq(key, value) { filters.push([key, value]); return builder; } };
            predicate(builder);
            return query;
          },
          async collect() { return tables[table].filter(doc => filters.every(([key, value]) => doc[key] === value)); },
          async first() { return (await query.collect())[0] || null; },
        };
        return query;
      },
    },
  };
  return { ctx, tables };
}

describe("presupuesto honorarios totals", () => {
  it.each([0, 50, 200])("includes full honorarios once when the fee partida has %s cached", feePagado => {
    const f = fixture({ feePagado });
    const result = calculatePresupuestoMetrics(f.tables.partidas.filter(p => p.proyecto === "project"), 200);
    expect(result).toEqual({ presupuesto_original: 2500, presupuesto_aprobado: 2500, gasto_total: 1200, por_gastar: 1300 });
  });

  it("counts manual transaction honorarios once", async () => {
    const f = fixture({ feePagado: 200, cachedGasto: 1200 });
    f.tables.desarrollos[0].honorarios_modo = "transacciones";
    expect((await getByProyecto._handler(f.ctx, { proyecto_id: "project" })).gasto_total).toBe(1200);
  });

  it("uses stored pagado for legacy projects without a calculated honorarios amount", () => {
    const f = fixture();
    expect(calculatePresupuestoMetrics(f.tables.partidas.filter(p => p.proyecto === "project")).gasto_total).toBe(1050);
  });

  it("includes honorarios even without a HONORARIOS root and preserves refunds", () => {
    const roots = [{ nivel: 1, nombre: "OBRA", presupuesto_aprobado: 2000, pagado: 1000 }, { nivel: 1, nombre: "DEVOLUCION", pagado: -100 }];
    expect(calculatePresupuestoMetrics(roots, 200).gasto_total).toBe(1100);
  });

  it("replaces old fee totals with zero when honorarios are disabled", async () => {
    const f = fixture({ honorarios: 0 });
    expect((await getByProyecto._handler(f.ctx, { proyecto_id: "project" })).gasto_total).toBe(1000);
  });

  it("returns current totals without mutating a stale metrics cache", async () => {
    const f = fixture();
    const before = structuredClone(f.tables);
    expect(await getByProyecto._handler(f.ctx, { proyecto_id: "project" })).toMatchObject({ gasto_total: 1200, por_gastar: 1300, honorarios_monto: 200 });
    await f.ctx.db.patch("work", { pagado: 1500 });
    expect(await getByProyecto._handler(f.ctx, { proyecto_id: "project" })).toMatchObject({ gasto_total: 1700, por_gastar: 800 });
    expect(f.tables.meticas_presupuesto).toEqual(before.meticas_presupuesto);
  });

  it("reproduces the Urbanización 01 discrepancy from the October 1 snapshot", async () => {
    const f = fixture({ honorarios: 5268881.18, feePagado: 5268881.18, cachedGasto: 36852970.65509641 });
    Object.assign(f.tables.partidas[0], { presupuesto_original: 91047592.6951618, presupuesto_aprobado: 91047592.6951618, pagado: 33115971.975096405 });
    Object.assign(f.tables.partidas[1], { presupuesto_original: 0, presupuesto_aprobado: 0 });
    const result = await getByProyecto._handler(f.ctx, { proyecto_id: "project" });
    expect(result.gasto_total).toBeCloseTo(38384853.16, 2);
    expect(result.por_gastar).toBeCloseTo(52662739.54, 2);
  });

  it("writes complete honorarios when updating the cache", async () => {
    const f = fixture();
    await updateMeticasPresupuesto(f.ctx, "project");
    expect(f.tables.meticas_presupuesto[0]).toMatchObject({ gasto_total: 1200, por_gastar: 1300 });
  });

  it.each(["pagado", "presupuesto_original"])("refreshes metrics when a root changes only %s", async field => {
    const f = fixture();
    const oldDoc = structuredClone(f.tables.partidas[0]);
    const newDoc = { ...oldDoc, [field]: oldDoc[field] + 100 };
    await f.ctx.db.patch("work", newDoc);
    await triggers.get("partidas")(f.ctx, { operation: "update", id: "work", oldDoc, newDoc });
    expect(f.tables.meticas_presupuesto[0]).toMatchObject({ gasto_total: field === "pagado" ? 1300 : 1200, presupuesto_original: field === "presupuesto_original" ? 2600 : 2500 });
  });

  it.each(["insert", "delete"])("refreshes metrics after a root %s", async operation => {
    const f = fixture();
    const partida = { _id: "extra", proyecto: "project", nivel: 1, nombre: "EXTRA", presupuesto_original: 300, presupuesto_aprobado: 300, pagado: 100 };
    if (operation === "insert") f.tables.partidas.push(partida);
    await triggers.get("partidas")(f.ctx, { operation, id: partida._id, oldDoc: operation === "delete" ? partida : null, newDoc: operation === "insert" ? partida : null });
    expect(f.tables.meticas_presupuesto[0]).toMatchObject({ gasto_total: operation === "insert" ? 1300 : 1200, presupuesto_aprobado: operation === "insert" ? 2800 : 2500 });
  });
});
