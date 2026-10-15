import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import { planPartidaEdit } from "./partidaEdit";
import { partidaEditDraft, partidaEditValues, rebasePartidaEdit } from "../src/lib/partida-edit-draft";

const modules = import.meta.glob(["./**/*.ts", "./_generated/*.js"]);
async function fixture({ currency = "MXN", indirectos = 5 } = {}) {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const project = await ctx.db.insert("desarrollos", { nombre: "Obra de prueba", descripcion: "", image: "", organization_id: "org",
      moneda_principal: currency, honorarios_monto: 80, honorarios_porcentaje: 10,
      ...(indirectos === undefined ? {} : { indirectos_porcentaje: indirectos, indirectos_fecha_inicio: "2026-10-01" }) });
    const otherProject = await ctx.db.insert("desarrollos", { nombre: "Otra", descripcion: "", image: "", organization_id: "other" });
    const user = await ctx.db.insert("users", { clerkId: "writer", email: "writer@test.invalid", name: "Writer", role: "finance", organization_id: "org", allowed_desarrollos: [project], created_at: 0 });
    const common = { proyecto: project, nombre: "OBRA", nivel: 1, familia: "", sub_partida: "", unidad: "m", cantidad: 4, precio_unitario: 100, archivo_origen: "test" };
    const root = await ctx.db.insert("partidas", { ...common, presupuesto_original: 2000, presupuesto_aprobado: 900, pagado: 650, por_gastar: 250 });
    const family = await ctx.db.insert("partidas", { ...common, nivel: 2, partida_nombre: "OBRA", familia: "ACERO", presupuesto_original: 999, presupuesto_aprobado: 600, pagado: 550, por_gastar: 50 });
    const emptyFamily = await ctx.db.insert("partidas", { ...common, nivel: 2, partida_nombre: "OBRA", familia: "OTROS", presupuesto_original: 300, presupuesto_aprobado: 300, pagado: 0, por_gastar: 300 });
    const leaf = await ctx.db.insert("partidas", { ...common, nivel: 3, partida_nombre: "OBRA", familia: "ACERO", sub_partida: "VARILLA", presupuesto_original: 350, presupuesto_aprobado: 400, pagado: 250, por_gastar: 150 });
    const sibling = await ctx.db.insert("partidas", { ...common, nivel: 3, partida_nombre: "OBRA", familia: "ACERO", sub_partida: "MALLA", presupuesto_original: 200, presupuesto_aprobado: 200, pagado: 100, por_gastar: 100 });
    const standalone = await ctx.db.insert("partidas", { ...common, nombre: "DIRECTA", presupuesto_original: 100, presupuesto_aprobado: 100, pagado: 20, por_gastar: 80 });
    const fee = await ctx.db.insert("partidas", { ...common, nombre: " HONORARIOS ", presupuesto_original: 0, presupuesto_aprobado: 0, pagado: 80, por_gastar: -80 });
    const tx = await ctx.db.insert("transacciones", { proyecto: project, monto_total: 650, fecha: "05/10/2026", tipo_pago: "TRANSFERENCIA", moneda: currency, tipo_cambio: "1", status: "Pagado" });
    const pago = await ctx.db.insert("pagos", { transaccion_id: tx, partida_id: leaf, monto: 250, sub_partida_snapshot: "VARILLA" });
    await ctx.db.insert("pagos", { transaccion_id: tx, partida_id: sibling, monto: 100 });
    await ctx.db.insert("pagos", { transaccion_id: tx, partida_id: family, monto: 200 });
    await ctx.db.insert("pagos", { transaccion_id: tx, partida_id: root, monto: 100 });
    const schedule = await ctx.db.insert("programa_obra", { proyecto: project, partida_id: root, anticipo_porcentaje: 20 });
    const detail = await ctx.db.insert("programa_obra_detalle", { proyecto: project, programa_obra_id: schedule, nivel: 3, partida: " Obra ", familia: " Acéro ", subpartida: " Varílla " });
    const unrelatedDetail = await ctx.db.insert("programa_obra_detalle", { proyecto: project, programa_obra_id: schedule, nivel: 3, partida: "OBRA", familia: "OTROS", subpartida: "VARILLA" });
    await ctx.db.insert("meticas_presupuesto", { proyecto: project, presupuesto_original: 2100, presupuesto_aprobado: 1000, gasto_total: 782.5, por_gastar: 217.5 });
    return { project, otherProject, user, root, family, emptyFamily, leaf, sibling, standalone, fee, tx, pago, detail, unrelatedDetail };
  });
  const writer = t.withIdentity({ subject: "writer" });
  const get = id => t.run(ctx => ctx.db.get(id));
  const snapshot = () => t.run(async ctx => Object.fromEntries(await Promise.all(
    ["partidas", "pagos", "transacciones", "desarrollos", "meticas_presupuesto", "programa_obra_detalle"]
      .map(async table => [table, await ctx.db.query(table).collect()]))));
  const identity = async id => ({ id, proyecto: ids.project, nivel: (await get(id)).nivel });
  const review = async (id, changes) => writer.query(api.partida.getEditImpact, { ...await identity(id), changes });
  const save = async (id, changes, impact) => writer.mutation(api.partida.update, { ...await identity(id), changes, expectedReview: impact.expectedReview });
  return { t, ids, writer, get, snapshot, identity, review, save };
}

describe("reviewed budget edits with real Convex triggers", () => {
  it.each(["root", "family", "emptyFamily", "leaf", "standalone"])("saves zero original on %s independently of approval and payments", async key => {
    const f = await fixture(); const id = f.ids[key]; const before = await f.snapshot();
    const original = await f.get(id); const changes = { presupuesto_original: 0 };
    const impact = await f.review(id, changes);
    expect(impact.changedFields).toEqual([{ field: "presupuesto_original", before: original.presupuesto_original, after: 0 }]);
    await f.save(id, changes, impact);
    expect(await f.get(id)).toMatchObject({ presupuesto_original: 0, presupuesto_aprobado: original.presupuesto_aprobado, pagado: original.pagado });
    for (const row of impact.rows) expect(await f.get(row.id)).toMatchObject(row.after);
    expect((await f.snapshot()).meticas_presupuesto[0]).toMatchObject(impact.project.after);
    const after = await f.snapshot();
    expect(after.pagos).toEqual(before.pagos); expect(after.transacciones).toEqual(before.transacciones);
    for (const row of before.partidas.filter(p => p.nivel > original.nivel)) expect(await f.get(row._id)).toEqual(row);
  });

  it("keeps a zero original when quantities, price or approval are edited later", async () => {
    const f = await fixture(); const id = f.ids.leaf;
    await f.save(id, { presupuesto_original: 0 }, await f.review(id, { presupuesto_original: 0 }));
    const changes = { cantidad: 10, precio_unitario: 500, presupuesto_aprobado: 1500 };
    await f.save(id, changes, await f.review(id, changes));
    expect(await f.get(id)).toMatchObject({ ...changes, presupuesto_original: 0 });
    expect((await f.get(f.ids.family)).presupuesto_original).toBe(200);
    expect((await f.get(f.ids.root)).presupuesto_original).toBe(500);
  });

  it.each([NaN, Infinity, -Infinity, -1])("rejects invalid original input %s without writes", async value => {
    const f = await fixture(); const before = await f.snapshot();
    await expect(f.review(f.ids.root, { presupuesto_original: value })).rejects.toThrow(/finitos/);
    expect(await f.snapshot()).toEqual(before);
  });

  it("creates a new hierarchy with zero original and a positive approved budget", async () => {
    const f = await fixture(); const before = await f.snapshot();
    const common = { proyecto: f.ids.project, nombre: "NUEVA", familia: "", sub_partida: "", unidad: "LOTE", cantidad: 1,
      precio_unitario: 1200, presupuesto_original: 0, presupuesto_aprobado: 1200, pagado: 0, archivo_origen: "" };
    const root = await f.writer.mutation(api.partida.createPartida, { ...common, nivel: 1 });
    const family = await f.writer.mutation(api.partida.createPartida, { ...common, nivel: 2, partida_nombre: "NUEVA", familia: "NUEVA FAMILIA" });
    const leaf = await f.writer.mutation(api.partida.createPartida, { ...common, nivel: 3, partida_nombre: "NUEVA", familia: "NUEVA FAMILIA", sub_partida: "NUEVA SUBPARTIDA" });
    for (const id of [root, family, leaf]) expect(await f.get(id)).toMatchObject({ presupuesto_original: 0, presupuesto_aprobado: 1200, por_gastar: 1200 });
    const changes = { presupuesto_original: 123.45 };
    await f.save(leaf, changes, await f.review(leaf, changes));
    for (const id of [root, family, leaf]) expect(await f.get(id)).toMatchObject({ presupuesto_original: 123.45, presupuesto_aprobado: 1200 });
    const after = await f.snapshot();
    expect(after.pagos).toEqual(before.pagos); expect(after.transacciones).toEqual(before.transacciones);
  });

  it("reviews and persists the automatic charge removed by setting a fee original to zero", async () => {
    const f = await fixture({ indirectos: 0 });
    await f.t.run(async ctx => {
      await ctx.db.patch(f.ids.user, { role: "admin" });
      await ctx.db.patch(f.ids.standalone, { presupuesto_original: 100, presupuesto_aprobado: 100 });
    });
    const fee_concepts = [{ concepto: "general_conditions", partida_id: f.ids.standalone, excluded_partidas: [] }];
    const preview = await f.writer.query(api.desarrollos.previewFeeImpact, { id: f.ids.project, fee_concepts });
    expect(preview.status, preview.message).toBe("ready");
    await f.writer.mutation(api.desarrollos.update, { id: f.ids.project, fee_concepts, expected_impact: preview.expectedImpact });
    const before = await f.snapshot(); const changes = { presupuesto_original: 0 };
    const impact = await f.review(f.ids.standalone, changes);
    expect(impact.rows[0].after).toMatchObject({ presupuesto_original: 0, presupuesto_aprobado: 100, pagado: 0, por_gastar: 100 });
    expect(impact.project.indirectosAfter.automaticos).toBe(0);
    await f.save(f.ids.standalone, changes, impact);
    expect(await f.get(f.ids.standalone)).toMatchObject(impact.rows[0].after);
    expect((await f.get(f.ids.project)).fee_concepts[0]).toMatchObject({ monto_original: 0, porcentaje: 0 });
    expect((await f.snapshot()).meticas_presupuesto[0]).toMatchObject(impact.project.after);
    const after = await f.snapshot();
    expect(after.pagos).toEqual(before.pagos); expect(after.transacciones).toEqual(before.transacciones);
  });

  it("sets the last fee leaf original to zero with the same reviewed zero on its ancestors", async () => {
    const f = await fixture({ indirectos: 0 });
    const leaf = await f.t.run(async ctx => {
      await ctx.db.patch(f.ids.user, { role: "admin" });
      const common = { proyecto: f.ids.project, nombre: "DIRECTA", partida_nombre: "DIRECTA", familia: "NUEVA", sub_partida: "",
        unidad: "LOTE", cantidad: 1, precio_unitario: 100, presupuesto_original: 100, presupuesto_aprobado: 100, pagado: 0, archivo_origen: "" };
      await ctx.db.insert("partidas", { ...common, nivel: 2 });
      return ctx.db.insert("partidas", { ...common, nivel: 3, sub_partida: "NUEVA" });
    });
    const fee_concepts = [{ concepto: "general_conditions", partida_id: f.ids.standalone, excluded_partidas: [] }];
    const preview = await f.writer.query(api.desarrollos.previewFeeImpact, { id: f.ids.project, fee_concepts });
    expect(preview.status, preview.message).toBe("ready");
    await f.writer.mutation(api.desarrollos.update, { id: f.ids.project, fee_concepts, expected_impact: preview.expectedImpact });
    const changes = { presupuesto_original: 0 }; const impact = await f.review(leaf, changes);
    await f.save(leaf, changes, impact);
    for (const row of impact.rows) expect(await f.get(row.id)).toMatchObject(row.after);
    expect((await f.get(f.ids.project)).fee_concepts[0]).toMatchObject({ monto_original: 0, porcentaje: 0 });
  });

  it.each([
    { excluded: "root", base: 200, rate: 50, fee: 325, expense: 975 },
    { excluded: "standalone", base: 1100, rate: 100 / 1100 * 100, fee: 59.09, expense: 709.09 },
  ])("approved budget review and save respect $excluded exclusions and update Control", async ({ excluded, base, rate, fee, expense }) => {
    const f = await fixture({ indirectos: 0 });
    await f.t.run(async ctx => {
      await ctx.db.patch(f.ids.user, { role: "admin" });
      await ctx.db.patch(f.ids.fee, { presupuesto_original: 100, presupuesto_aprobado: 100 });
    });
    const fee_concepts = [{ concepto: "honorarios", partida_id: f.ids.fee, excluded_partidas: [f.ids[excluded]] }];
    const preview = await f.writer.query(api.desarrollos.previewFeeImpact, { id: f.ids.project, fee_concepts });
    expect(preview.status, preview.message).toBe("ready");
    await f.writer.mutation(api.desarrollos.update, { id: f.ids.project, fee_concepts, expected_impact: preview.expectedImpact });
    const changes = { presupuesto_aprobado: 500 };
    const impact = await f.review(f.ids.leaf, changes);
    expect(impact.project.after.gasto_total).toBeCloseTo(expense, 8);
    await f.save(f.ids.leaf, changes, impact);
    expect((await f.get(f.ids.project)).fee_concepts[0].base_aprobada).toBe(base);
    expect((await f.get(f.ids.project)).fee_concepts[0].porcentaje).toBeCloseTo(rate, 10);
    expect((await f.get(f.ids.project)).honorarios_monto).toBe(fee);
    expect((await f.writer.query(api.meticas_presupuesto.getByProyecto, { proyecto_id: f.ids.project })).gasto_total).toBeCloseTo(expense, 8);
  });
  it("previews complete hierarchy/global metrics without any writes", async () => {
    const f = await fixture(); const before = await f.snapshot();
    const impact = await f.review(f.ids.leaf, { presupuesto_aprobado: 500 });
    expect(impact.rows.map(r => r.nivel)).toEqual([3, 2, 1]);
    expect(impact.project.after).toEqual({ presupuesto_original: 950, presupuesto_aprobado: 1100, gasto_total: 782.5, por_gastar: 317.5 });
    expect(impact.rows.find(r => r.nivel === 2).after).toMatchObject({ presupuesto_original: 550, presupuesto_aprobado: 700, pagado: 550, por_gastar: 150 });
    expect(await f.snapshot()).toEqual(before);
  });

  it.each([["root", 2000, 2000], ["family", 500, 800], ["emptyFamily", 400, 1000], ["leaf", 500, 1000], ["standalone", 0, 900]])(
    "saves %s approved amount and matches the complete preview", async (key, value, rootApproved) => {
      const f = await fixture(); const id = f.ids[key]; const original = await f.get(id); const source = await f.snapshot();
      const changes = { presupuesto_aprobado: value }; const impact = await f.review(id, changes);
      await f.save(id, changes, impact);
      expect((await f.get(id)).presupuesto_aprobado).toBe(value);
      expect((await f.get(id)).presupuesto_original).toBe(original.presupuesto_original);
      expect((await f.get(f.ids.root)).presupuesto_aprobado).toBe(rootApproved);
      for (const row of impact.rows) expect(await f.get(row.id)).toMatchObject(row.after);
      const metrics = await f.writer.query(api.meticas_presupuesto.getByProyecto, { proyecto_id: f.ids.project });
      expect(metrics).toMatchObject(impact.project.after);
      const after = await f.snapshot();
      expect(after.meticas_presupuesto[0]).toMatchObject(impact.project.after);
      expect(after.pagos).toEqual(source.pagos); expect(after.transacciones).toEqual(source.transacciones);
      for (const partida of source.partidas) expect((await f.get(partida._id)).pagado).toBe(partida.pagado);
    });

  it("keeps parent direct edits until a subsequent child edit rolls them up", async () => {
    const f = await fixture();
    await f.save(f.ids.family, { presupuesto_aprobado: 50 }, await f.review(f.ids.family, { presupuesto_aprobado: 50 }));
    expect((await f.get(f.ids.leaf)).presupuesto_aprobado).toBe(400);
    expect((await f.get(f.ids.family)).presupuesto_aprobado).toBe(50);
    await f.save(f.ids.leaf, { presupuesto_aprobado: 450 }, await f.review(f.ids.leaf, { presupuesto_aprobado: 450 }));
    expect((await f.get(f.ids.family)).presupuesto_aprobado).toBe(650);
  });

  it("accepts zero/below-paid approvals and preserves direct parent payments", async () => {
    const f = await fixture(); const changes = { presupuesto_aprobado: 0 }; const impact = await f.review(f.ids.leaf, changes);
    await f.save(f.ids.leaf, changes, impact);
    expect(await f.get(f.ids.leaf)).toMatchObject({ pagado: 250, presupuesto_aprobado: 0, por_gastar: -250 });
    expect(await f.get(f.ids.family)).toMatchObject({ pagado: 550, presupuesto_aprobado: 200, por_gastar: -350 });
    expect(await f.get(f.ids.root)).toMatchObject({ pagado: 650, presupuesto_aprobado: 500, por_gastar: -150 });
    expect(impact.project.after.por_gastar).toBe(-182.5);
  });

  it("edits units/quantities/prices without inventing quantity × price approval", async () => {
    const f = await fixture(); const changes = { unidad: "kg", cantidad: 3.14159, precio_unitario: 123.45678 }; const impact = await f.review(f.ids.leaf, changes);
    await f.save(f.ids.leaf, changes, impact);
    expect(await f.get(f.ids.leaf)).toMatchObject({ ...changes, presupuesto_aprobado: 400, presupuesto_original: 350 });
    expect(impact.rows.find(r => r.nivel === 1).after.presupuesto_original).toBe(850);
  });

  it("renames only matching live Programa details, preserving IDs/payment snapshots", async () => {
    const f = await fixture(); const before = await f.snapshot(); const changes = { sub_partida: "  VARILLA   NUEVA " };
    const impact = await f.review(f.ids.leaf, changes); expect(impact.programming.count).toBe(1);
    await f.save(f.ids.leaf, changes, impact);
    expect(await f.get(f.ids.leaf)).toMatchObject({ _id: f.ids.leaf, sub_partida: "VARILLA NUEVA" });
    expect((await f.get(f.ids.detail)).subpartida).toBe("VARILLA NUEVA");
    expect((await f.get(f.ids.unrelatedDetail)).subpartida).toBe("VARILLA");
    expect((await f.snapshot()).pagos).toEqual(before.pagos);
  });

  it("keeps old Programa names when an equivalent old sibling remains", async () => {
    const f = await fixture(); await f.t.run(ctx => ctx.db.patch(f.ids.sibling, { sub_partida: "Varílla" }));
    const changes = { sub_partida: "OTRA VARILLA" }; const impact = await f.review(f.ids.leaf, changes);
    expect(impact.programming).toMatchObject({ count: 0, oldNameStillExists: true });
    await f.save(f.ids.leaf, changes, impact);
    expect((await f.get(f.ids.detail)).subpartida).toBe(" Varílla ");
  });

  it.each([" MÁLLA ", "malla___", "Malla."])("rejects normalized duplicate %s before writes", async name => {
    const f = await fixture(); const before = await f.snapshot();
    await expect(f.review(f.ids.leaf, { sub_partida: name })).rejects.toThrow(/equivalente/);
    expect(await f.snapshot()).toEqual(before);
  });

  it("previews indirectos classification changed by a renamed leaf", async () => {
    const f = await fixture(); const changes = { sub_partida: "VIÁTICOS" }; const impact = await f.review(f.ids.leaf, changes);
    expect(impact.project.indirectosAfter.manualesSustituidos).toBe(250);
    expect(impact.project.after.gasto_total).toBe(532.5);
    await f.save(f.ids.leaf, changes, impact);
    expect(await f.writer.query(api.meticas_presupuesto.getByProyecto, { proyecto_id: f.ids.project })).toMatchObject(impact.project.after);
  });

  it.each(["MXN", "USD", "EUR"])("uses %s global metrics and keeps honorarios once", async currency => {
    const f = await fixture({ currency }); const impact = await f.review(f.ids.leaf, { presupuesto_aprobado: 500 });
    expect(impact.currency).toBe(currency); expect(impact.project.before.gasto_total).toBe(782.5);
    await f.save(f.ids.leaf, { presupuesto_aprobado: 500 }, impact);
    expect(await f.writer.query(api.meticas_presupuesto.getByProyecto, { proyecto_id: f.ids.project })).toMatchObject(impact.project.after);
  });

  it.each(["pagado", "presupuesto_aprobado", "sub_partida"])("rejects a concurrent %s change without overwriting it", async field => {
    const f = await fixture(); const changes = { presupuesto_aprobado: 500 }; const impact = await f.review(f.ids.leaf, changes);
    await f.t.run(ctx => ctx.db.patch(f.ids.leaf, { [field]: field === "sub_partida" ? "RENOMBRE EXTERNO" : 321 }));
    const before = await f.snapshot();
    await expect(f.save(f.ids.leaf, changes, impact)).rejects.toThrow(/cambió/);
    expect(await f.snapshot()).toEqual(before);
    const fresh = await f.review(f.ids.leaf, changes); await f.save(f.ids.leaf, changes, fresh);
    if (field === "pagado") expect((await f.get(f.ids.leaf)).pagado).toBe(321);
    if (field === "sub_partida") expect((await f.get(f.ids.leaf)).sub_partida).toBe("RENOMBRE EXTERNO");
  });

  it("rejects a real concurrent payment edit and preserves the new payment totals", async () => {
    const f = await fixture(); const changes = { unidad: "kg" }; const impact = await f.review(f.ids.leaf, changes);
    await f.writer.mutation(api.pagos.updatePago, { id: f.ids.pago, monto: 350 });
    const before = await f.snapshot();
    await expect(f.save(f.ids.leaf, changes, impact)).rejects.toThrow(/cambió/);
    expect(await f.snapshot()).toEqual(before);
  });

  it.each(["sibling", "project", "program"])("rejects changed %s impact after review", async kind => {
    const f = await fixture(); const changes = { sub_partida: "VARILLA NUEVA", presupuesto_aprobado: 500 }; const impact = await f.review(f.ids.leaf, changes);
    await f.t.run(async ctx => {
      if (kind === "sibling") await ctx.db.patch(f.ids.sibling, { presupuesto_aprobado: 700 });
      if (kind === "project") await ctx.db.patch(f.ids.project, { moneda_principal: "USD", indirectos_porcentaje: 8 });
      if (kind === "program") await ctx.db.insert("programa_obra_detalle", { ...(await ctx.db.get(f.ids.detail)), _id: undefined, _creationTime: undefined });
    });
    const before = await f.snapshot(); await expect(f.save(f.ids.leaf, changes, impact)).rejects.toThrow(/cambió/);
    expect(await f.snapshot()).toEqual(before);
  });

  it("rejects double submission and deletion after review without side effects", async () => {
    const f = await fixture(); const changes = { presupuesto_aprobado: 500 }; const impact = await f.review(f.ids.leaf, changes);
    await f.save(f.ids.leaf, changes, impact); const saved = await f.snapshot();
    await expect(f.save(f.ids.leaf, changes, impact)).rejects.toThrow(/cambió/);
    expect(await f.snapshot()).toEqual(saved);
    const args = { ...await f.identity(f.ids.leaf), changes, expectedReview: impact.expectedReview };
    await f.t.run(ctx => ctx.db.delete(f.ids.leaf)); const deleted = await f.snapshot();
    await expect(f.writer.mutation(api.partida.update, args)).rejects.toThrow(/ya no existe/);
    expect(await f.snapshot()).toEqual(deleted);
  });

  it.each([NaN, Infinity, -Infinity, -1])("rejects invalid approved input %s", async value => {
    const f = await fixture(); const before = await f.snapshot();
    await expect(f.review(f.ids.leaf, { presupuesto_aprobado: value })).rejects.toThrow(/finitos/);
    expect(await f.snapshot()).toEqual(before);
  });

  it("rejects forbidden fields, blank names and overflowed rollups", async () => {
    const f = await fixture(); const before = await f.snapshot();
    await expect(f.review(f.ids.family, { cantidad: 10 })).rejects.toThrow(/ese campo/i);
    await expect(f.review(f.ids.leaf, { sub_partida: "   " })).rejects.toThrow(/obligatorio/);
    await expect(f.review(f.ids.leaf, { pagado: 0 })).rejects.toThrow();
    await f.t.run(ctx => ctx.db.patch(f.ids.sibling, { presupuesto_aprobado: Number.MAX_VALUE }));
    await expect(f.review(f.ids.leaf, { presupuesto_aprobado: Number.MAX_VALUE })).rejects.toThrow(/totales/);
    expect((await f.get(f.ids.leaf)).pagado).toBe(before.partidas.find(p => p._id === f.ids.leaf).pagado);
  });

  it.each(["viewer", "almacenista", "outsider", "anonymous", "wrong-project", "wrong-level"])("rejects %s access before any edit", async kind => {
    const f = await fixture(); const args = { ...await f.identity(f.ids.leaf), changes: { presupuesto_aprobado: 500 } };
    let client = f.writer;
    if (["viewer", "almacenista"].includes(kind)) await f.t.run(ctx => ctx.db.patch(f.ids.user, { role: kind }));
    if (kind === "outsider") await f.t.run(ctx => ctx.db.patch(f.ids.user, { allowed_desarrollos: [] }));
    if (kind === "anonymous") client = f.t;
    if (kind === "wrong-project") args.proyecto = f.ids.otherProject;
    if (kind === "wrong-level") args.nivel = 2;
    const before = await f.snapshot();
    await expect(client.query(api.partida.getEditImpact, args)).rejects.toThrow();
    await expect(client.mutation(api.partida.update, { ...args, expectedReview: "untrusted" })).rejects.toThrow();
    expect(await f.snapshot()).toEqual(before);
  });

  it("revalidates revoked access at save", async () => {
    const f = await fixture(); const changes = { presupuesto_aprobado: 500 }; const impact = await f.review(f.ids.leaf, changes);
    await f.t.run(ctx => ctx.db.patch(f.ids.user, { allowed_desarrollos: [] })); const before = await f.snapshot();
    await expect(f.save(f.ids.leaf, changes, impact)).rejects.toThrow(/permiso/); expect(await f.snapshot()).toEqual(before);
  });

  it("reports actual grouped duplicate parent records and sums all siblings", async () => {
    const f = await fixture(); await f.t.run(async ctx => {
      const { _id, _creationTime, ...family } = await ctx.db.get(f.ids.family);
      await ctx.db.insert("partidas", family);
    });
    const impact = await f.review(f.ids.leaf, { presupuesto_aprobado: 500 });
    expect(impact.rows.filter(r => r.nivel === 2)).toHaveLength(2);
    expect(impact.rows.find(r => r.nivel === 1).after.presupuesto_aprobado).toBe(1700);
    await f.save(f.ids.leaf, { presupuesto_aprobado: 500 }, impact);
    expect((await f.get(f.ids.root)).presupuesto_aprobado).toBe(1700);
  });

  it("bounds analysis capacity without claiming a complete preview", async () => {
    const f = await fixture(); await f.t.run(async ctx => {
      const { _id, _creationTime, ...base } = await ctx.db.get(f.ids.standalone);
      for (let i = 0; i < 5000; i++) await ctx.db.insert("partidas", { ...base, nombre: `EXTRA ${i}` });
    });
    await expect(f.review(f.ids.leaf, { presupuesto_aprobado: 500 })).rejects.toThrow(/volumen/);
    expect((await f.get(f.ids.leaf)).presupuesto_aprobado).toBe(400);
  });

  it("no-op proposals do not recalculate or write", async () => {
    const f = await fixture(); const before = await f.snapshot(); const impact = await f.review(f.ids.leaf, {});
    expect(impact.hasChanges).toBe(false); expect(impact.project.after).toEqual(impact.project.before);
    expect(impact.rows[0].after).toEqual(impact.rows[0].before);
    await f.save(f.ids.leaf, {}, impact); expect(await f.snapshot()).toEqual(before);
  });
});

describe("budget draft rebasing", () => {
  it("keeps an explicitly edited zero original while rebasing other amounts at every level", () => {
    for (const nivel of [1, 2, 3]) {
      const base = { nivel, sub_partida: "NUEVA", unidad: "LOTE", cantidad: 1, precio_unitario: 100, presupuesto_original: 100, presupuesto_aprobado: 150 };
      const values = { ...partidaEditValues(base), presupuesto_original: 0 };
      const current = { ...base, presupuesto_original: 200, presupuesto_aprobado: 300 };
      expect(partidaEditDraft(base, values)).toEqual({ presupuesto_original: 0 });
      expect(rebasePartidaEdit(base, current, values)).toEqual({ ...partidaEditValues(current), presupuesto_original: 0 });
    }
  });
  it("preserves edited fields and replaces untouched stale fields", () => {
    const base = { nivel: 3, sub_partida: "VARILLA", unidad: "m", cantidad: 4, precio_unitario: 100, presupuesto_aprobado: 400 };
    const values = { ...partidaEditValues(base), unidad: "kg" };
    const current = { ...base, cantidad: 7, presupuesto_aprobado: 800, sub_partida: "RENOMBRE EXTERNO" };
    expect(partidaEditDraft(base, values)).toEqual({ unidad: "kg" });
    expect(rebasePartidaEdit(base, current, values)).toEqual({ ...partidaEditValues(current), unidad: "kg" });
    expect(partidaEditDraft({ ...base, nivel: 1 }, values)).toEqual({});
    const historical = { ...base, sub_partida: "  VARILLA   DEL NO. 6 " };
    expect(partidaEditDraft(historical, partidaEditValues(historical))).toEqual({});
    expect(partidaEditDraft(historical, { ...partidaEditValues(historical), sub_partida: "VARILLA DEL NO. 6" })).toEqual({});
    expect(() => planPartidaEdit([base], base, { precio_unitario: Infinity })).toThrow(/finitos/);
  });
});
