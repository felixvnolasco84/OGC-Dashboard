import { describe, expect, it } from "vitest";
import { analyzePartidaDeletion, executePartidaDeletion, DELETION_LIMITS } from "./partidaDeletion";
import { assertBudgetParent, assertBudgetReference, assertRequisicionBudgetItems, assertBudgetFamilyTags } from "./partidaReferences";
import { getDeletionImpact, deletePartida, deleteSubPartida, getSubPartidaDeletionImpact } from "./partida";
import { create as createRequisicion, update as updateRequisicion } from "./requisiciones";
import { createSubcontratista, updateSubcontratista } from "./subcontratistas";
import { update as updateDesarrollo } from "./desarrollos";
import { addSubPartida } from "./programa_obra";
import { deriveFeeConcepts } from "./feeConceptRules";

function fixture() {
  const base = { proyecto: "project", presupuesto_original: 100, presupuesto_aprobado: 120, pagado: 0, por_gastar: 120, unidad: "m", cantidad: 1, precio_unitario: 120, archivo_origen: "test", familia: "", sub_partida: "" };
  const tables = {
    users: [{ _id: "user", clerkId: "test", role: "admin", email: "test@example.test", organization_id: "org", allowed_desarrollos: [] }],
    desarrollos: [{ _id: "project", organization_id: "org", nombre: "Obra", honorarios_monto: 0 }],
    partidas: [
      { ...base, _id: "root", nivel: 1, nombre: "OBRA" },
      { ...base, _id: "family", nivel: 2, nombre: "OBRA", partida_nombre: "OBRA", familia: "ACERO" },
      { ...base, _id: "leaf", nivel: 3, nombre: "OBRA", partida_nombre: "OBRA", familia: "ACERO", sub_partida: "VARILLA" },
    ],
    meticas_presupuesto: [{ _id: "metrics", proyecto: "project" }],
  };
  const writes = [];
  const reads = [];
  const find = id => Object.values(tables).flat().find(doc => doc._id === id);
  const ctx = { auth: { getUserIdentity: async () => ({ subject: "test" }) }, db: {
    async get(id) { return structuredClone(find(id) || null); },
    async delete(id) { writes.push(["delete", id]); for (const rows of Object.values(tables)) { const index = rows.findIndex(p => p._id === id); if (index >= 0) rows.splice(index, 1); } },
    async patch(id, fields) { writes.push(["patch", id]); Object.assign(find(id), fields); },
    async insert(table, fields) { const id = `new-${table}`; writes.push(["insert", table]); (tables[table] ||= []).push({ _id: id, ...fields }); return id; },
    query(table) {
      const filters = [];
      const query = {
        async *[Symbol.asyncIterator]() {
          reads.push([table, "stream"]);
          for (const row of tables[table] || []) {
            if (filters.every(([key, value]) => row[key] === value)) yield structuredClone(row);
          }
        },
        withIndex(index, predicate) { const builder = { eq(key, value) { filters.push([key, value]); return builder; } }; predicate(builder); reads.push([table, index]); return query; },
        async take(limit) { reads.push([table, "take", limit]); return structuredClone((tables[table] || []).filter(doc => filters.every(([key, value]) => doc[key] === value)).slice(0, limit)); },
        async collect() { return query.take(Infinity); },
        async first() { return (await query.take(1))[0] || null; },
      };
      return query;
    },
  } };
  const impact = (id = "root") => analyzePartidaDeletion(ctx, id, "project");
  const remove = async (id = "root") => { const preview = await impact(id); return executePartidaDeletion(ctx, id, "project", preview.expectedScope); };
  return { ctx, tables, writes, reads, find, impact, remove };
}

describe("complete budget deletion", () => {
  it("removes an unused excluded root and cleans its concept references on confirmation", async () => {
    const f = fixture();
    f.tables.partidas.push({ ...f.find("root"), _id: "fee", nombre: "HONORARIOS", presupuesto_original: 20, presupuesto_aprobado: 20 });
    f.tables.desarrollos[0].fee_concepts = deriveFeeConcepts([{ concepto: "honorarios", partida_id: "fee", excluded_partidas: ["root"] }], f.tables.partidas);
    const impact = await f.impact();
    expect(impact).toMatchObject({ canDelete: true, counts: { exclusiones: 0 }, exclusionCleanup: { concepts: ["honorarios"], shared: false } });
    expect(impact.budget.before.gasto_total).toBe(impact.budget.after.gasto_total);
    expect(f.writes).toEqual([]);
    await executePartidaDeletion(f.ctx, "root", "project", impact.expectedScope);
    expect(f.find("root")).toBeUndefined();
    expect(f.tables.desarrollos[0].fee_concepts[0]).toMatchObject({ excluded_partidas: [], porcentaje: 100, base_aprobada: 20 });
  });

  it("deletes General Conditions after disabling its calculation while retaining exclusions in other concepts", async () => {
    const f = fixture();
    for (const row of f.tables.partidas) { row.nombre = "GENERAL CONDITIONS"; if (row.nivel > 1) row.partida_nombre = row.nombre; }
    f.tables.partidas.push(
      { ...f.find("root"), _id: "fee", nombre: "HONORARIOS", presupuesto_original: 20, presupuesto_aprobado: 20 },
      { ...f.find("root"), _id: "indirect", nombre: "INDIRECTOS", presupuesto_original: 10, presupuesto_aprobado: 10 },
      { ...f.find("root"), _id: "other", nombre: "OTRA", presupuesto_aprobado: 180, pagado: 100 },
    );
    const inputs = [
      { concepto: "general_conditions", partida_id: "root", excluded_partidas: ["root"] },
      { concepto: "honorarios", partida_id: "fee", excluded_partidas: ["root"] },
      { concepto: "indirectos", partida_id: "indirect", excluded_partidas: ["root", "fee"] },
    ];
    f.tables.desarrollos[0].fee_concepts = deriveFeeConcepts(inputs, f.tables.partidas);
    expect((await f.impact()).blockers.join()).toContain("origen de un concepto automático: General Conditions");
    expect(f.writes).toEqual([]);
    // The user has saved Editar proyecto with General Conditions disabled.
    f.tables.desarrollos[0].fee_concepts = deriveFeeConcepts(inputs.slice(1), f.tables.partidas);
    f.tables.desarrollos[0].excluded_partidas_honorarios = ["root", "other"];
    f.tables.transacciones = [{ _id: "tx", proyecto: "project", monto_total: 100, status: "Pagado", fecha: "2026-09-01", moneda: "MXN" }];
    f.tables.pagos = [{ _id: "pay", transaccion_id: "tx", partida_id: "other", monto: 100 }];
    const beforePayments = structuredClone(f.tables.pagos);
    const preview = await f.impact();
    expect(preview).toMatchObject({ canDelete: true, exclusionCleanup: { concepts: ["honorarios", "indirectos"], shared: true } });
    expect(preview.budget.after.gasto_total).toBe(preview.budget.before.gasto_total);
    expect(preview.budget.after.presupuesto_aprobado).toBe(210);
    expect(f.writes).toEqual([]);
    const rates = f.tables.desarrollos[0].fee_concepts.map(c => c.porcentaje);
    await executePartidaDeletion(f.ctx, "root", "project", preview.expectedScope);
    expect(f.tables.desarrollos[0].fee_concepts.map(c => c.excluded_partidas)).toEqual([[], ["fee"]]);
    expect(f.tables.desarrollos[0].fee_concepts.map(c => c.porcentaje)).toEqual(rates);
    expect(f.tables.desarrollos[0].excluded_partidas_honorarios).toEqual(["other"]);
    expect(f.find("fee").pagado).toBe(9.52);
    expect(f.find("indirect").pagado).toBe(5.26);
    expect(f.tables.meticas_presupuesto[0]).toMatchObject(preview.budget.after);
    expect(f.tables.pagos).toEqual(beforePayments);
    expect(f.tables.partidas).toHaveLength(3);
  });

  it("cleans legacy shared exclusions without requiring a configured budget concept", async () => {
    const f = fixture();
    f.tables.desarrollos[0].excluded_partidas_honorarios = ["root"];
    const preview = await f.impact();
    expect(preview).toMatchObject({ canDelete: true, exclusionCleanup: { concepts: [], shared: true } });
    await f.remove();
    expect(f.tables.desarrollos[0].excluded_partidas_honorarios).toEqual([]);
    expect(f.tables.meticas_presupuesto[0].gasto_total).toBe(0);
  });

  it.each(["payment", "foreign-exclusion", "foreign-source"])("keeps %s as a blocker without cleaning any exclusions", async reference => {
    const f = fixture();
    f.tables.partidas.push({ ...f.find("root"), _id: "fee", nombre: "HONORARIOS" });
    f.tables.desarrollos[0].fee_concepts = deriveFeeConcepts([{ concepto: "honorarios", partida_id: "fee", excluded_partidas: ["root"] }], f.tables.partidas);
    if (reference === "payment") f.tables.pagos = [{ _id: "pay", partida_id: "leaf", monto: 1 }];
    if (reference === "foreign-exclusion") f.tables.desarrollos.push({ _id: "foreign", fee_concepts: [{ concepto: "indirectos", partida_id: "foreign-fee", excluded_partidas: ["root"] }] });
    if (reference === "foreign-source") f.tables.desarrollos.push({ _id: "foreign", fee_concepts: [{ concepto: "indirectos", partida_id: "root", excluded_partidas: [] }] });
    expect((await f.impact()).canDelete).toBe(false);
    await expect(f.remove()).rejects.toThrow();
    expect(f.writes).toEqual([]);
    expect(f.tables.desarrollos[0].fee_concepts[0].excluded_partidas).toEqual(["root"]);
  });

  it.each(["fee_concepts", "excluded_partidas_honorarios", "honorarios_modo", "honorarios_porcentaje", "indirectos_porcentaje", "moneda_principal"])("rejects concurrent changes to %s before cleaning references", async field => {
    const f = fixture();
    f.tables.partidas.push({ ...f.find("root"), _id: "fee", nombre: "HONORARIOS" });
    const preview = await f.impact();
    f.tables.desarrollos[0][field] = {
      fee_concepts: deriveFeeConcepts([{ concepto: "honorarios", partida_id: "fee", excluded_partidas: ["root"] }], f.tables.partidas),
      excluded_partidas_honorarios: ["root"], honorarios_modo: "transacciones", honorarios_porcentaje: 5,
      indirectos_porcentaje: 3, moneda_principal: "USD",
    }[field];
    await expect(executePartidaDeletion(f.ctx, "root", "project", preview.expectedScope)).rejects.toThrow("cambió");
    expect(f.writes).toEqual([]);
  });

  it("uses a compact confirmation for complete financial snapshots larger than 512 KiB and reuses the inspected records", async () => {
    const f = fixture();
    f.tables.partidas.push({ ...f.find("root"), _id: "fee", nombre: "HONORARIOS" },
      { ...f.find("root"), _id: "other", nombre: "OTRA", pagado: 100 });
    f.tables.desarrollos[0].fee_concepts = deriveFeeConcepts([{ concepto: "honorarios", partida_id: "fee", excluded_partidas: ["root"] }], f.tables.partidas);
    f.tables.transacciones = [{ _id: "tx", proyecto: "project", monto_total: 100, status: "Pagado", fecha: "2026-09-01", descripcion: "x".repeat(600000) }];
    f.tables.pagos = [{ _id: "pay", transaccion_id: "tx", partida_id: "other", monto: 100 }];
    const preview = await f.impact();
    expect(preview.canDelete).toBe(true);
    expect(preview.expectedScope).toMatch(/^sha256:[0-9a-f]{64}$/);
    f.reads.length = 0;
    await executePartidaDeletion(f.ctx, "root", "project", preview.expectedScope);
    expect(f.reads.filter(([table, method]) => table === "transacciones" && method === "stream")).toHaveLength(1);
    expect(f.reads.filter(([table, method]) => table === "transacciones" && method === "take")).toHaveLength(0);
    expect(f.tables.meticas_presupuesto[0]).toMatchObject(preview.budget.after);
  });
  it("deleting an unused branch recalculates configured rates over the remaining approved total", async () => {
    const f = fixture();
    f.tables.partidas.push({ ...f.find("root"), _id: "fee", nombre: "HONORARIOS", presupuesto_original: 20, presupuesto_aprobado: 20, pagado: 6.25 },
      { ...f.find("root"), _id: "other", nombre: "OTRA", presupuesto_original: 100, presupuesto_aprobado: 180, pagado: 100 });
    f.tables.transacciones = [{ _id: "tx", proyecto: "project", monto_total: 100, status: "Pagado", fecha: "2026-10-01", moneda: "MXN" }];
    f.tables.pagos = [{ _id: "pay", transaccion_id: "tx", partida_id: "other", monto: 100 }];
    Object.assign(f.tables.desarrollos[0], { honorarios_monto: 6.25,
      fee_concepts: deriveFeeConcepts([{ concepto: "honorarios", partida_id: "fee", excluded_partidas: [] }], f.tables.partidas) });
    const preview = await f.impact();
    expect(preview.canDelete).toBe(true); expect(preview.budget.after.gasto_total).toBe(110);
    await f.remove();
    expect(f.tables.desarrollos[0].fee_concepts[0].porcentaje).toBe(10);
    expect(f.tables.desarrollos[0].honorarios_monto).toBe(10);
    expect(f.tables.meticas_presupuesto[0].gasto_total).toBe(110);
    expect((await f.impact("fee")).canDelete).toBe(false);
  });
  it.each([["root", 3], ["family", 2], ["leaf", 1]])("deletes only the confirmed %s branch (%i records)", async (id, count) => {
    const f = fixture();
    const preview = await getDeletionImpact._handler(f.ctx, { id, projectId: "project" });
    expect(preview.canDelete).toBe(true);
    expect(preview.scope.total).toBe(count);
    expect(f.writes).toEqual([]);
    const result = await deletePartida._handler(f.ctx, { id, projectId: "project", expectedScope: preview.expectedScope });
    expect(result.deletedIds).toHaveLength(count);
    expect(f.tables.partidas).toHaveLength(3 - count);
    expect(f.tables.meticas_presupuesto[0]).toMatchObject({ presupuesto_original: 0, presupuesto_aprobado: 0, gasto_total: 0, por_gastar: 0 });
  });

  it("keeps other projects and unrelated direct budgets intact", async () => {
    const f = fixture();
    const other = { ...f.find("root"), _id: "other", proyecto: "foreign" };
    const standalone = { ...f.find("root"), _id: "standalone", nombre: "OTRA" };
    f.tables.partidas.push(other, standalone);
    await f.remove();
    expect(f.tables.partidas).toEqual([other, standalone]);
    expect(f.tables.meticas_presupuesto[0].presupuesto_aprobado).toBe(120);
  });

  it("includes exact root and family duplicates represented by a grouped row", async () => {
    const f = fixture();
    f.tables.partidas.push({ ...f.find("root"), _id: "root2" }, { ...f.find("family"), _id: "family2" });
    const preview = await f.impact();
    expect(preview.scope).toMatchObject({ partidas: 2, familias: 2, subpartidas: 1, duplicates: 1 });
    expect((await f.remove()).deletedIds).toHaveLength(5);
  });

  it("does not delete an equivalent leaf and preserves name-only references", async () => {
    const f = fixture();
    f.tables.partidas.push({ ...f.find("leaf"), _id: "leaf2", sub_partida: " Varílla " });
    f.tables.requisicion_items = [{ _id: "req", partida_id: "root", familia: "ACERO", sub_partida: "VARILLA" }];
    f.tables.programa_obra_detalle = [{ _id: "detail", proyecto: "project", nivel: 3, partida: "OBRA", familia: "ACERO", subpartida: "VARILLA" }];
    expect(await f.impact("leaf")).toMatchObject({ canDelete: true, hasEquivalentSibling: true });
    await f.remove("leaf");
    expect(f.find("leaf2")).toBeDefined();
    expect(f.find("family").presupuesto_aprobado).toBe(120);
  });

  it("checks name references against the entire deleted set rather than individual duplicates", async () => {
    const f = fixture();
    f.tables.partidas.push({ ...f.find("family"), _id: "family2" });
    f.tables.bitacora = [{ _id: "log", partida_id: "root", familias_tags: [" ACÉRO "], deleted_at: 1 }];
    expect(await f.impact("family")).toMatchObject({ canDelete: false, counts: { bitacoras: 1 } });
  });

  it("rolls up surviving siblings and preserves direct parent payments and negative remaining budgets", async () => {
    const f = fixture();
    f.find("root").pagado = 300;
    f.find("family").pagado = 200;
    f.tables.pagos = [{ _id: "rootpay", partida_id: "root", monto: 300 }, { _id: "familypay", partida_id: "family", monto: 200 }];
    f.tables.partidas.push({ ...f.find("leaf"), _id: "leaf2", sub_partida: "MALLA", presupuesto_original: 40, presupuesto_aprobado: 50 });
    await f.remove("leaf");
    expect(f.find("family")).toMatchObject({ pagado: 200, presupuesto_original: 40, presupuesto_aprobado: 50, por_gastar: -150 });
    expect(f.find("root")).toMatchObject({ pagado: 300, presupuesto_aprobado: 50, por_gastar: -250 });
    expect(f.find("metrics")).toMatchObject({ gasto_total: 300, por_gastar: -250 });
    expect(f.tables.pagos).toHaveLength(2);
  });

  it.each([0, -100, 100])("allows direct budgets of %i with no dependents and creates missing metrics", async amount => {
    const f = fixture();
    f.tables.partidas = [{ ...f.find("root"), presupuesto_original: amount, presupuesto_aprobado: amount }];
    f.tables.meticas_presupuesto = [];
    await f.remove();
    expect(f.tables.meticas_presupuesto[0]).toMatchObject({ presupuesto_aprobado: 0, por_gastar: 0 });
  });

  it("recognizes unambiguous historical nombre parent references", async () => {
    const f = fixture();
    delete f.find("family").partida_nombre;
    delete f.find("leaf").partida_nombre;
    expect((await f.impact()).scope.total).toBe(3);
    await f.remove("leaf");
    expect(f.find("family").presupuesto_aprobado).toBe(0);
  });

  it.each(["root", "family", "leaf"])("protects HONORARIOS including %s", async id => {
    const f = fixture();
    for (const p of f.tables.partidas) { p.nombre = " Honorarios "; if (p.nivel > 1) p.partida_nombre = " Honorarios "; }
    expect((await f.impact(id)).blockers.join()).toContain("HONORARIOS");
    await expect(f.remove(id)).rejects.toThrow();
    expect(f.writes).toEqual([]);
  });

  it.each([
    ["pagos", "pagos", { monto: 0, transaccion_id: "missing" }],
    ["programa_obra", "programacion", { archived: true }],
    ["programa_obra_ponderacion", "ponderaciones", { peso: 0 }],
    ["avance_real", "avances", { porcentaje: 0 }],
    ["programa_obra_hito_links", "hitos", { decision: "rejected" }],
    ["documentos", "documentos", { deleted_at: 1 }],
    ["bitacora", "bitacoras", { familias_tags: [], deleted_at: 1 }],
    ["requisicion_items", "requisiciones", { familia: "OTRA", status_revision: "rechazado" }],
    ["rfis", "rfis", { status: "closed" }],
    ["subcontratistas", "subcontratistas", { status_manual: "inactivo" }],
    ["invoice_items", "facturas", { budget_mapping_status: "confirmed" }],
    ["invoice_budget_mapping_memory", "memoria", { confirmations: 1 }],
  ])("blocks a descendant reference in %s even with inconsistent project metadata", async (table, category, extra) => {
    const f = fixture();
    f.tables[table] = [{ _id: "dependency", proyecto: "foreign", project_id: "foreign", partida_id: "leaf", ...extra }];
    expect(await f.impact()).toMatchObject({ canDelete: false, counts: { [category]: 1 } });
    await expect(f.remove()).rejects.toThrow();
    expect(f.writes).toEqual([]);
  });

  it("deduplicates confirmed/proposed invoice references and blocks suggestions alone", async () => {
    const f = fixture();
    f.tables.invoice_items = [{ _id: "invoice", partida_id: "leaf", proposed_partida_id: "leaf" }];
    expect((await f.impact()).counts.facturas).toBe(1);
    delete f.tables.invoice_items[0].partida_id;
    expect((await f.impact()).counts.facturas).toBe(1);
  });

  it("finds cross-project references in task and exclusion arrays", async () => {
    const f = fixture();
    f.tables.tareas = [{ _id: "task", proyecto: "foreign", status: "Completada", partidas: ["leaf", "root", "root"] }];
    f.tables.desarrollos.push({ _id: "foreign", excluded_partidas_honorarios: ["leaf"] });
    expect(await f.impact()).toMatchObject({ counts: { tareas: 1, exclusiones: 1 } });
  });

  it.each([
    ["programa_obra_detalle", "programacion", { nivel: 3, partida: " ÓBRA ", familia: "ACÉRO", subpartida: "VARILLA", archived: true }],
    ["programa_obra_avance_historial", "historial", { partida: "OBRA", familia: "ACERO", detalle_id: "missing" }],
    ["projected_transactions", "proyecciones", { partida: " óbra " }],
    ["subcontratistas", "subcontratistas", { partida_nombre: "OBRA" }],
  ])("blocks preserved name/history records in %s", async (table, category, extra) => {
    const f = fixture(); f.tables[table] = [{ _id: "name-ref", proyecto: "project", ...extra }];
    expect(await f.impact()).toMatchObject({ canDelete: false, counts: { [category]: 1 } });
  });

  it.each(["requisicion_items", "rfis"])("blocks name-only child references in %s", async table => {
    const f = fixture(); f.tables[table] = [{ _id: "name-ref", partida_id: "root", familia: "ACÉRO", sub_partida: " Varílla " }];
    expect((await f.impact("leaf")).canDelete).toBe(false);
  });

  it("ignores descriptive payment snapshots without a linked ID and chart filters", async () => {
    const f = fixture();
    f.tables.pagos = [{ _id: "historical", partida_nombre_snapshot: "OBRA", familia_snapshot: "ACERO" }];
    f.tables.chart_configurations = [{ _id: "chart", proyecto_id: "project", partidas: ["OBRA"] }];
    expect((await f.impact()).canDelete).toBe(true);
    await f.remove(); expect(f.find("chart")).toBeDefined();
  });

  it("blocks unexplained paid amounts without falsely labeling supported aggregate payments", async () => {
    const f = fixture(); f.find("root").pagado = 100;
    expect((await f.impact()).blockers.join()).toContain("conciliación");
    f.tables.pagos = [{ _id: "childpay", partida_id: "leaf", monto: 100 }];
    expect((await f.impact()).blockers.join()).not.toContain("conciliación");
  });

  it.each(["nombre", "presupuesto_original", "presupuesto_aprobado", "pagado"])("rejects changed %s without writes", async field => {
    const f = fixture(); const preview = await f.impact("leaf");
    f.find("root")[field] = field === "nombre" ? "RENAMED" : 999;
    await expect(executePartidaDeletion(f.ctx, "leaf", "project", preview.expectedScope)).rejects.toThrow();
    expect(f.writes).toEqual([]);
  });

  it("rejects added descendants and newly created dependencies after confirmation", async () => {
    const f = fixture(); const preview = await f.impact();
    f.tables.partidas.push({ ...f.find("leaf"), _id: "newleaf" });
    await expect(executePartidaDeletion(f.ctx, "root", "project", preview.expectedScope)).rejects.toThrow("cambió");
    f.tables.partidas.pop(); f.tables.pagos = [{ _id: "newpay", partida_id: "leaf" }];
    await expect(executePartidaDeletion(f.ctx, "root", "project", preview.expectedScope)).rejects.toThrow();
    expect(f.writes).toEqual([]);
  });

  it("handles double deletion and missing targets without writes", async () => {
    const f = fixture(); await f.remove(); const before = f.writes.length;
    expect(await executePartidaDeletion(f.ctx, "root", "project", "old-preview")).toMatchObject({ status: "already_deleted" });
    expect(await f.impact()).toMatchObject({ status: "missing", canDelete: false });
    expect(f.writes).toHaveLength(before);
  });

  it.each(["viewer", "user", "finance", "almacenista", "contratista"])("rejects role %s, including compatibility endpoints", async role => {
    const f = fixture(); f.tables.users[0].role = role;
    await expect(f.impact()).rejects.toThrow();
    await expect(deleteSubPartida._handler(f.ctx, { id: "leaf" })).rejects.toThrow();
    expect(f.writes).toEqual([]);
  });

  it("rejects unauthenticated and out-of-project admins without leaking dependency data", async () => {
    const f = fixture(); f.ctx.auth.getUserIdentity = async () => null;
    await expect(f.impact()).rejects.toThrow();
    f.ctx.auth.getUserIdentity = async () => ({ subject: "test" });
    f.tables.users[0].organization_id = "another-org";
    await expect(f.impact()).rejects.toThrow();
    expect(f.reads.some(([table]) => table === "pagos")).toBe(false);
    f.tables.users[0].allowed_desarrollos = ["project"];
    expect((await f.impact()).canDelete).toBe(true);
  });

  it("revalidates revoked project access on delete", async () => {
    const f = fixture(); const preview = await f.impact();
    f.tables.users[0].organization_id = "another-org";
    await expect(executePartidaDeletion(f.ctx, "root", "project", preview.expectedScope)).rejects.toThrow();
    expect(f.writes).toEqual([]);
  });

  it("retains compatible single-leaf endpoint behavior with stronger validation", async () => {
    const f = fixture();
    expect(await getSubPartidaDeletionImpact._handler(f.ctx, { id: "leaf" })).toMatchObject({ canDelete: true });
    expect(await deleteSubPartida._handler(f.ctx, { id: "leaf" })).toEqual({ deletedId: "leaf" });
    expect(f.find("root")).toBeDefined();
    await expect(deleteSubPartida._handler(f.ctx, { id: "root" })).rejects.toThrow();
  });

  it.each(["parent", "alias", "level", "project"])("blocks invalid hierarchy: %s", async issue => {
    const f = fixture();
    if (issue === "parent") f.tables.partidas = f.tables.partidas.filter(p => p._id !== "family");
    if (issue === "alias") f.tables.partidas.push({ ...f.find("root"), _id: "alias", nombre: " ÓBRA " });
    if (issue === "level") f.find("leaf").nivel = 8;
    if (issue === "project") f.find("leaf").proyecto = "foreign";
    if (issue === "project") await expect(f.impact("leaf")).rejects.toThrow();
    else expect((await f.impact("leaf")).canDelete).toBe(false);
    expect(f.writes).toEqual([]);
  });

  it.each(["orphan", "empty-family", "family-alias"])("validates every descendant before deleting a root: %s", async issue => {
    const f = fixture();
    if (issue === "orphan") f.find("leaf").familia = "HUÉRFANA";
    if (issue === "empty-family") f.find("family").familia = "";
    if (issue === "family-alias") f.tables.partidas.push({ ...f.find("family"), _id: "alias-family", familia: " ACÉRO " });
    expect((await f.impact()).canDelete).toBe(false);
    await expect(f.remove()).rejects.toThrow();
    expect(f.writes).toEqual([]);
  });

  it.each(["scope", "documents", "bytes", "index-ranges"])("fails closed when the %s analysis limit is exceeded", async limit => {
    const f = fixture();
    if (limit === "scope") for (let i = 0; i < DELETION_LIMITS.scope; i++) f.tables.partidas.push({ ...f.find("leaf"), _id: `leaf${i}` });
    if (limit === "documents") f.tables.tareas = Array.from({ length: DELETION_LIMITS.documents }, (_, i) => ({ _id: `task${i}`, partidas: [] }));
    if (limit === "bytes") f.tables.tareas = Array.from({ length: 5 }, (_, i) => ({ _id: `task${i}`, partidas: [], descripcion: "x".repeat(900000) }));
    if (limit === "index-ranges") for (let i = 0; i < 1500; i++) f.tables.partidas.push({ ...f.find("root"), _id: `root${i}` });
    const target = limit === "index-ranges" ? "leaf" : "root";
    expect(await f.impact(target)).toMatchObject({ canDelete: false, verified: false, status: "blocked", expectedScope: "" });
    await expect(f.remove(target)).rejects.toThrow(); expect(f.writes).toEqual([]);
  });

  it("deletes a verified branch of exactly 500 records without exhausting indexed reads", async () => {
    const f = fixture();
    for (let i = 3; i < DELETION_LIMITS.scope; i++) f.tables.partidas.push({ ...f.find("leaf"), _id: `leaf${i}` });
    expect((await f.impact()).scope.total).toBe(500);
    expect((await f.remove()).deletedIds).toHaveLength(500);
    expect(f.tables.partidas).toEqual([]);
  });

  it("large branch scans still detect cross-project payments and deduplicate invoice proposals", async () => {
    const f = fixture();
    for (let i = 0; i < 210; i++) f.tables.partidas.push({ ...f.find("leaf"), _id: `leaf${i}` });
    f.tables.pagos = [{ _id: "payment", proyecto: "foreign", partida_id: "leaf100", monto: 0 }];
    f.tables.invoice_items = [{ _id: "invoice", partida_id: "leaf200", proposed_partida_id: "leaf201" }];
    expect(await f.impact()).toMatchObject({ canDelete: false, counts: { pagos: 1, facturas: 1 } });
    await expect(f.remove()).rejects.toThrow();
    expect(f.writes).toEqual([]);
  });

  it("returns only vanished filter names and preserves a family shared by another root", async () => {
    const f = fixture(); f.tables.partidas.push({ ...f.find("root"), _id: "other-root", nombre: "OTRA" }, { ...f.find("family"), _id: "other-family", nombre: "OTRA", partida_nombre: "OTRA" });
    expect((await f.remove()).removedFilters).toEqual({ partidas: ["OBRA"], familias: [] });
  });
});

describe("stale forms cannot recreate budget references", () => {
  it("allows Programa children under valid historical parents using nombre", async () => {
    const f = fixture();
    delete f.find("family").partida_nombre;
    await expect(assertBudgetParent(f.ctx, "project", "OBRA", "ACERO")).resolves.toMatchObject({ _id: "root", nivel: 1 });
  });
  it.each([NaN, Infinity, -Infinity])("blocks invalid monetary values: %s", async value => {
    const f = fixture(); f.find("root").presupuesto_aprobado = value;
    expect((await f.impact()).canDelete).toBe(false);
    await expect(f.remove()).rejects.toThrow(); expect(f.writes).toEqual([]);
  });
  it("requires an existing root, family and matching project/level", async () => {
    const f = fixture();
    await assertBudgetParent(f.ctx, "project", "OBRA", "ACERO");
    await f.remove();
    await expect(assertBudgetReference(f.ctx, "root", "project", 1)).rejects.toThrow();
    await expect(assertBudgetParent(f.ctx, "project", "OBRA", "ACERO")).rejects.toThrow();
  });
  it("validates requisition root/family links while allowing custom subpartida text", async () => {
    const f = fixture(); const item = { partida_id: "root", familia: "acéro", sub_partida: "custom text" };
    await assertRequisicionBudgetItems(f.ctx, "project", [item]);
    await expect(assertRequisicionBudgetItems(f.ctx, "foreign", [item])).rejects.toThrow();
    await f.remove("family");
    await expect(assertRequisicionBudgetItems(f.ctx, "project", [item])).rejects.toThrow();
  });
  it("validates bitacora family tags and detects stale tags after a family deletion", async () => {
    const f = fixture();
    await assertBudgetFamilyTags(f.ctx, "project", "root", [" ACÉRO "]);
    await f.remove("family");
    await expect(assertBudgetFamilyTags(f.ctx, "project", "root", ["ACERO"])).rejects.toThrow();
    await assertBudgetFamilyTags(f.ctx, "project", "root", []);
  });
  it("rejects stale root IDs in actual requisicion create/update mutations before any writes", async () => {
    const f = fixture();
    f.tables.requisiciones = [{ _id: "req", proyecto: "project", solicitante_id: "user" }];
    const items = [{ partida_id: "missing", familia: "ACERO", sub_partida: "custom", cantidad: 1, unidad: "m" }];
    await expect(createRequisicion._handler(f.ctx, { proyecto: "project", solicitante_id: "user", items })).rejects.toThrow();
    await expect(updateRequisicion._handler(f.ctx, { id: "req", changed_by_id: "user", items })).rejects.toThrow();
    expect(f.writes).toEqual([]);
  });
  it("rejects stale subcontractor links by ID and by name before any writes", async () => {
    const f = fixture();
    f.tables.subcontratistas = [{ _id: "sub", proyecto: "project", nombre: "Proveedor" }];
    await expect(createSubcontratista._handler(f.ctx, { proyecto: "project", nombre: "Proveedor", partida_id: "missing" })).rejects.toThrow();
    await expect(createSubcontratista._handler(f.ctx, { proyecto: "project", nombre: "Proveedor", partida_nombre: "REMOVED" })).rejects.toThrow();
    await expect(updateSubcontratista._handler(f.ctx, { id: "sub", partida_id: "missing" })).rejects.toThrow();
    expect(f.writes).toEqual([]);
  });
  it("rejects stale honorarios exclusions and orphan program children before any writes", async () => {
    const f = fixture();
    await expect(updateDesarrollo._handler(f.ctx, { id: "project", excluded_partidas_honorarios: ["missing"] })).rejects.toThrow();
    f.tables.partidas = f.tables.partidas.filter(p => p._id !== "root");
    await expect(addSubPartida._handler(f.ctx, { proyecto: "project", partida_nombre: "OBRA", familia: "ACERO", sub_partida: "NUEVA" })).rejects.toThrow();
    expect(f.writes).toEqual([]);
  });
});
