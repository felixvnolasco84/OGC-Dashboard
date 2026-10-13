import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "../../convex/schema";
import { api } from "../../convex/_generated/api";

const modules = import.meta.glob(["../../convex/**/*.ts", "../../convex/_generated/*.js"]);
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("External transport prohibited in requisition tests"); }));
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const project = await ctx.db.insert("desarrollos", { nombre: "Proyecto de prueba", descripcion: "", image: "", organization_id: "test-org" });
    const otherProject = await ctx.db.insert("desarrollos", { nombre: "Proyecto ajeno", descripcion: "", image: "", organization_id: "other-org" });
    const users = {};
    for (const role of ["admin", "finance", "user", "contratista", "viewer", "almacenista"]) {
      users[role] = await ctx.db.insert("users", { clerkId: role, name: role, email: `${role}@example.test`, role, organization_id: "test-org", allowed_desarrollos: [project], created_at: 0 });
    }
    const common = { proyecto: project, nombre: "OBRA", familia: "", sub_partida: "", nivel: 1, unidad: "piezas", cantidad: 10, precio_unitario: 100, presupuesto_original: 1000, presupuesto_aprobado: 1000, pagado: 0, por_gastar: 1000, archivo_origen: "" };
    const root = await ctx.db.insert("partidas", common);
    const family = await ctx.db.insert("partidas", { ...common, nivel: 2, partida_nombre: "OBRA", familia: "MATERIALES" });
    const leaf = await ctx.db.insert("partidas", { ...common, nivel: 3, partida_nombre: "OBRA", familia: "MATERIALES", sub_partida: "CEMENTO" });
    return { project, otherProject, users, root, family, leaf };
  });
  const as = role => t.withIdentity({ subject: role });
  const item = { partida_id: ids.root, familia: "MATERIALES", sub_partida: "CEMENTO", cantidad: 10, unidad: "piezas", monto: 1000 };
  const args = (role = "user", overrides = {}) => ({ proyecto: ids.project, tipo: "material", solicitante_id: ids.users[role], solicitante_nombre: role, fecha_solicitud: "12/10/2026", items: [item], ...overrides });
  const create = (role = "user", overrides = {}) => as(role).mutation(api.requisiciones.create, args(role, overrides));
  const get = id => t.run(ctx => ctx.db.get(id));
  const rows = table => t.run(ctx => ctx.db.query(table).collect());
  const detail = id => as("user").query(api.requisiciones.getById, { id });
  const approve = async id => {
    const req = await detail(id);
    return as("finance").mutation(api.requisiciones.reviewRequisicion, { id, reviewer_id: ids.users.finance, reviewer_name: "finance", items: req.items.map(i => ({ item_id: i._id, status_revision: "aprobado", cantidad_aprobada: i.cantidad })) });
  };
  const pay = id => as("finance").mutation(api.requisiciones.updateStatus, { id, status: "Pagado", expected_status: "En proceso", changed_by_id: ids.users.finance, changed_by_name: "finance" });
  return { t, ids, as, item, args, create, get, rows, detail, approve, pay };
}

describe("post-fix analysis: unresolved boundaries", () => {
  it("rejects an old edit instead of overwriting materials saved by another editor", async () => {
    const f = await fixture(), id = await f.create();
    // Two editors loaded the same 10-unit form. A changes it to 20 units.
    await f.as("user").mutation(api.requisiciones.update, { id, items: [{ ...f.item, cantidad: 20, monto: 2000 }], changed_by_id: f.ids.users.user, changed_by_name: "user" });
    // B saves only a note but still sends every field from the old form.
    await f.as("admin").mutation(api.requisiciones.update, { id, descripcion: "Nota del segundo editor", items: [f.item], changed_by_id: f.ids.users.admin, changed_by_name: "admin" });
    expect((await f.detail(id)).items[0].cantidad).toBe(20);
  });
  it("invalidates a pending onsite payment request when reviewed materials change", async () => {
    const f = await fixture(), id = await f.create();
    await f.approve(id);
    await f.as("user").mutation(api.requisiciones.requestOnsitePayment, { id, importe: 1000, motivo: "Compra inicial" });
    await f.as("user").mutation(api.requisiciones.update, { id, items: [{ ...f.item, cantidad: 20, monto: 2000 }], changed_by_id: f.ids.users.user, changed_by_name: "user" });
    await f.approve(id);
    expect((await f.detail(id)).items[0].monto).toBe(2000);
    expect((await f.get(id)).pago_obra.importe).toBe(1000);
    expect((await f.get(id)).pago_obra.estado).not.toBe("pendiente");
  });
  it("does not duplicate audit history on an identical bulk approval retry", async () => {
    const f = await fixture(), id = await f.create();
    await f.approve(id);
    const before = await f.rows("requisicion_history");
    await f.approve(id);
    expect(await f.rows("requisicion_history")).toHaveLength(before.length);
  });
});
