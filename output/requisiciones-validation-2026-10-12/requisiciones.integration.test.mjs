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

describe("Current requisition integration: real schema, validators and transactions", () => {
  it("creates, approves, requests onsite payment, receives before payment and preserves the three states", async () => {
    const f = await fixture(), id = await f.create();
    expect(await f.get(id)).toMatchObject({ status: "En proceso", status_entrega: "Pendiente", status_revision: "Pendiente de revisión" });
    await f.approve(id);
    await f.as("user").mutation(api.requisiciones.requestOnsitePayment, { id, importe: 1000, motivo: "Compra de prueba" });
    await f.as("user").mutation(api.requisiciones.updateStatusEntrega, { id, status_entrega: "Completo", expected_status_entrega: "Pendiente", comentario: "Recibido", changed_by_id: f.ids.users.user, changed_by_name: "user" });
    expect(await f.get(id)).toMatchObject({ status: "En proceso", status_entrega: "Completo", status_revision: "Aprobada", pago_obra: { estado: "pendiente" } });
    await f.pay(id);
    expect(await f.get(id)).toMatchObject({ status: "Pagado", status_entrega: "Completo", status_revision: "Aprobada", pago_obra: { estado: "pagado" } });
    expect((await f.rows("requisicion_history")).map(h => h.action)).toEqual(expect.arrayContaining(["created", "reviewed", "onsite_payment_requested", "status_changed", "status_entrega_changed"]));
    const count = (await f.rows("requisicion_history")).length;
    await f.as("finance").mutation(api.requisiciones.updateStatus, { id, status: "Pagado", changed_by_id: f.ids.users.finance, changed_by_name: "finance" });
    expect(await f.rows("requisicion_history")).toHaveLength(count);
  });
  it("queues app/email notices without sending email and excludes the acting user", async () => {
    const f = await fixture(), id = await f.create();
    const events = await f.rows("notification_events"), deliveries = await f.rows("notification_deliveries");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ requisicion_id: id, type: "created", recipient_count: 2 });
    expect(deliveries).toHaveLength(4);
    expect(deliveries.every(d => d.recipient_user_id !== f.ids.users.user)).toBe(true);
    expect(deliveries.filter(d => d.channel === "in_app").every(d => d.status === "sent")).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["admin", "user", "contratista"])("allows creation for %s", async role => {
    const f = await fixture(), id = await f.create(role);
    expect(await f.get(id)).toMatchObject({ solicitante_id: f.ids.users[role] });
  });
  it.each(["finance", "viewer", "almacenista"])("denies creation for %s with no partial writes", async role => {
    const f = await fixture();
    await expect(f.create(role)).rejects.toThrow("Sin permisos");
    expect(await f.rows("requisiciones")).toEqual([]);
    expect(await f.rows("requisicion_history")).toEqual([]);
  });
  it("denies another organization and unauthenticated queries", async () => {
    const f = await fixture(), id = await f.create();
    await expect(f.as("user").query(api.requisiciones.getByProyecto, { proyecto: f.ids.otherProject })).rejects.toThrow();
    await expect(f.t.query(api.requisiciones.getById, { id })).rejects.toThrow("Not authenticated");
  });
  it("limits a contractor's list and details to their own requisitions", async () => {
    const f = await fixture(), own = await f.create("contratista"), other = await f.create();
    expect((await f.as("contratista").query(api.requisiciones.getByProyecto, { proyecto: f.ids.project })).map(r => r._id)).toEqual([own]);
    await expect(f.as("contratista").query(api.requisiciones.getById, { id: other })).rejects.toThrow("Sin acceso");
  });
  it("rejects an incomplete review atomically", async () => {
    const f = await fixture(), id = await f.create(), before = await f.detail(id);
    await expect(f.as("finance").mutation(api.requisiciones.reviewRequisicion, { id, reviewer_id: f.ids.users.finance, reviewer_name: "finance", items: [] })).rejects.toThrow();
    expect(await f.detail(id)).toEqual(before);
  });
  it("resubmits rejected items for review while preserving payment and delivery", async () => {
    const f = await fixture(), id = await f.create(), req = await f.detail(id);
    await f.as("finance").mutation(api.requisiciones.reviewRequisicion, { id, reviewer_id: f.ids.users.finance, reviewer_name: "finance", items: [{ item_id: req.items[0]._id, status_revision: "rechazado" }] });
    await f.as("user").mutation(api.requisiciones.update, { id, descripcion: "Corregida", items: [f.item], changed_by_id: f.ids.users.user, changed_by_name: "user" });
    expect(await f.get(id)).toMatchObject({ status_revision: "Pendiente de revisión", status: "En proceso", status_entrega: "Pendiente" });
    await expect(f.pay(id)).rejects.toThrow("Primero completa la revisión");
  });
});

describe("Expected contracts: regression probes (failures identify current defects)", () => {
  it("accepts the level-3 budget reference submitted by the current creation form", async () => {
    const f = await fixture();
    const id = await f.create("user", { items: [{ ...f.item, partida_id: f.ids.leaf }] });
    expect(await f.get(id)).toBeTruthy();
  });
  it("invalidates approval when materials change after full approval", async () => {
    const f = await fixture(), id = await f.create();
    await f.approve(id);
    await f.as("user").mutation(api.requisiciones.update, { id, items: [{ ...f.item, cantidad: 20 }], changed_by_id: f.ids.users.user, changed_by_name: "user" });
    expect(await f.get(id)).toMatchObject({ status_revision: "Pendiente de revisión" });
    await expect(f.pay(id)).rejects.toThrow();
  });
  it("blocks payment of modified materials that have not been reviewed again", async () => {
    const f = await fixture(), id = await f.create();
    await f.approve(id);
    await f.as("user").mutation(api.requisiciones.update, { id, items: [{ ...f.item, cantidad: 20 }], changed_by_id: f.ids.users.user, changed_by_name: "user" });
    await expect(f.pay(id)).rejects.toThrow();
  });
  it.each([{ label: "empty", invalid: [] }, { label: "zero", invalid: [{ cantidad: 0 }] }, { label: "negative", invalid: [{ cantidad: -2 }] }])("rejects $label requested quantities", async ({ invalid }) => {
    const f = await fixture();
    await expect(f.create("user", { items: invalid.map(overrides => ({ ...f.item, ...overrides })) })).rejects.toThrow();
    expect(await f.rows("requisiciones")).toEqual([]);
  });
});
