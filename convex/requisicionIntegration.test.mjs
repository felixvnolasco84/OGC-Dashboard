import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import { buildRequestedRequisicionItems } from "../src/lib/requisicion-draft";

const modules = import.meta.glob(["./**/*.ts", "./_generated/*.js"]);
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
  it.each([
    { label: "another requester", override: f => ({ solicitante_id: f.ids.users.admin }), message: "El solicitante no coincide con tu sesión" },
    { label: "an unassigned project", override: f => ({ proyecto: f.ids.otherProject }), message: "No tienes acceso al proyecto" },
  ])("returns a public validation error for $label without creating a requisition", async ({ override, message }) => {
    const f = await fixture();
    await expect(f.create("user", override(f))).rejects.toMatchObject({ data: expect.stringContaining(message) });
    expect(await f.rows("requisiciones")).toEqual([]);
    expect(await f.rows("notification_events")).toEqual([]);
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

describe("requisition regressions", () => {
  it.each(["Sergio Sánchez", "Yaneth Cosio Avilés"])("creates a custom OTRO family under ESTACIONAMIENTO for %s", async name => {
    const f = await fixture();
    await f.t.run(async ctx => {
      await ctx.db.patch(f.ids.project, { nombre: "Larena - Urbanización 01" });
      await ctx.db.patch(f.ids.users.user, { name });
      await ctx.db.patch(f.ids.root, { nombre: "ESTACIONAMIENTO" });
      await ctx.db.patch(f.ids.family, { nombre: "ESTACIONAMIENTO", partida_nombre: "ESTACIONAMIENTO", familia: "CEMENTANTES" });
    });
    const id = await f.create("user", { solicitante_nombre: name, items: [{ ...f.item, familia: "OTRO", sub_partida: "Material para estacionamiento" }] });
    expect(await f.get(id)).toMatchObject({ solicitante_nombre: name, status_revision: "Pendiente de revisión" });
    expect((await f.detail(id)).items[0]).toMatchObject({ partida_id: f.ids.root, familia: "OTRO", sub_partida: "Material para estacionamiento" });
    expect(await f.rows("requisicion_history")).toHaveLength(1);
  });
  it("allows a custom OTRO family under a root without budget families", async () => {
    const f = await fixture();
    await f.t.run(ctx => ctx.db.delete(f.ids.family));
    const id = await f.create("user", { items: [{ ...f.item, familia: "OTRO" }] });
    expect((await f.detail(id)).items[0]).toMatchObject({ partida_id: f.ids.root, familia: "OTRO" });
  });
  it("allows editing materials into the custom OTRO family and resets their approval", async () => {
    const f = await fixture(), id = await f.create();
    await f.approve(id);
    await f.as("user").mutation(api.requisiciones.update, { id, items: [{ ...f.item, familia: "OTRO", sub_partida: "Material manual" }], changed_by_id: f.ids.users.user, changed_by_name: "user" });
    expect((await f.detail(id)).items[0]).toMatchObject({ partida_id: f.ids.root, familia: "OTRO", sub_partida: "Material manual", status_revision: "pendiente" });
    expect((await f.get(id)).status_revision).toBe("Pendiente de revisión");
    await expect(f.pay(id)).rejects.toThrow();
  });
  it.each(["foreign project", "missing root"])("rejects custom OTRO items with a %s before writing", async issue => {
    const f = await fixture();
    await f.t.run(async ctx => {
      if (issue === "foreign project") await ctx.db.patch(f.ids.root, { proyecto: f.ids.otherProject });
      if (issue === "missing root") await ctx.db.delete(f.ids.root);
    });
    await expect(f.create("user", { items: [{ ...f.item, familia: "OTRO" }] })).rejects.toThrow();
    expect(await f.rows("requisiciones")).toEqual([]);
    expect(await f.rows("notification_events")).toEqual([]);
  });
  it.each(["leaf", "family"])("accepts a legacy %s reference and stores the root instead", async level => {
    const f = await fixture();
    const id = await f.create("user", { items: [{ ...f.item, partida_id: f.ids[level] }] });
    expect((await f.detail(id)).items[0]).toMatchObject({ ...f.item, partida_id: f.ids.root });
  });
  it.each(["Sergio Sánchez", "Yaneth Cosio Avilés"])("creates the pictured cement request for %s with a legacy leaf reference", async name => {
    const f = await fixture();
    await f.t.run(async ctx => {
      await ctx.db.patch(f.ids.users.user, { name });
      await ctx.db.patch(f.ids.root, { nombre: "ALBAÑILERÍAS" });
      await ctx.db.patch(f.ids.family, { nombre: "ALBAÑILERÍAS", partida_nombre: "ALBAÑILERÍAS", familia: "CEMENTANTES" });
      await ctx.db.patch(f.ids.leaf, { nombre: "ALBAÑILERÍAS", partida_nombre: "ALBAÑILERÍAS", familia: "CEMENTANTES", sub_partida: "CEMENTO GRIS", unidad: "TON", precio_unitario: 6450 });
    });
    const id = await f.create("user", { solicitante_nombre: name, items: [{ partida_id: f.ids.leaf, familia: "CEMENTANTES", sub_partida: "CEMENTO GRIS", cantidad: 4, unidad: "TON", monto: 25800 }] });
    const saved = await f.detail(id);
    expect(saved).toMatchObject({ solicitante_nombre: name, status_revision: "Pendiente de revisión" });
    expect(saved.items[0]).toMatchObject({ partida_id: f.ids.root, cantidad: 4, unidad: "TON", monto: 25800 });
  });
  it("preserves approval when an old form sends unchanged items using a leaf reference", async () => {
    const f = await fixture(), id = await f.create();
    await f.approve(id);
    const before = await f.detail(id);
    await f.as("user").mutation(api.requisiciones.update, { id, items: [{ ...f.item, partida_id: f.ids.leaf }], changed_by_id: f.ids.users.user, changed_by_name: "user" });
    expect((await f.detail(id)).items).toEqual(before.items);
    expect((await f.get(id)).status_revision).toBe("Aprobada");
  });
  it.each(["leaf", "family"])("stores the root and resets approval when a legacy %s reference changes quantities", async level => {
    const f = await fixture(), id = await f.create();
    await f.approve(id);
    await f.as("user").mutation(api.requisiciones.update, { id, items: [{ ...f.item, partida_id: f.ids[level], cantidad: 20 }], changed_by_id: f.ids.users.user, changed_by_name: "user" });
    expect((await f.detail(id)).items[0]).toMatchObject({ partida_id: f.ids.root, cantidad: 20, status_revision: "pendiente" });
    expect((await f.get(id)).status_revision).toBe("Pendiente de revisión");
    await expect(f.pay(id)).rejects.toThrow();
  });
  it.each(["foreign project", "wrong family", "missing root", "missing family", "invalid level", "ambiguous root"])("rejects a legacy reference with %s before writing", async issue => {
    const f = await fixture();
    await f.t.run(async ctx => {
      if (issue === "foreign project") await ctx.db.patch(f.ids.leaf, { proyecto: f.ids.otherProject });
      if (issue === "wrong family") await ctx.db.patch(f.ids.leaf, { familia: "OTRA" });
      if (issue === "missing root") await ctx.db.delete(f.ids.root);
      if (issue === "missing family") await ctx.db.delete(f.ids.family);
      if (issue === "invalid level") await ctx.db.patch(f.ids.leaf, { nivel: 8 });
      if (issue === "ambiguous root") {
        const { _id, _creationTime, ...root } = await ctx.db.get(f.ids.root);
        await ctx.db.insert("partidas", root);
      }
    });
    await expect(f.create("user", { items: [{ ...f.item, partida_id: f.ids.leaf }] })).rejects.toThrow();
    expect(await f.rows("requisiciones")).toEqual([]);
    expect(await f.rows("requisicion_items")).toEqual([]);
    expect(await f.rows("requisicion_history")).toEqual([]);
    expect(await f.rows("notification_events")).toEqual([]);
  });
  it.each(["leaf", "family"])("saves the selected root when the form contains a %s budget reference", async level => {
    const f = await fixture();
    const items = buildRequestedRequisicionItems(f.ids.root, [{ id: "group", familia: "MATERIALES", partida_id: f.ids.family,
      subPartidas: [{ id: "row", sub_partida: "CEMENTO", cantidad: 10, unidad: "piezas", monto: 1000, partida_id: f.ids[level] }] }]);
    const id = await f.create("user", { items });
    expect((await f.detail(id)).items[0].partida_id).toBe(f.ids.root);
  });
  it("invalidates approval when materials change after full approval", async () => {
    const f = await fixture(), id = await f.create();
    await f.approve(id);
    await f.as("user").mutation(api.requisiciones.update, { id, items: [{ ...f.item, cantidad: 20 }], changed_by_id: f.ids.users.user, changed_by_name: "user" });
    expect(await f.get(id)).toMatchObject({ status_revision: "Pendiente de revisión" });
    expect((await f.get(id)).revisado_at).toBeUndefined();
    expect((await f.detail(id)).items[0]).toMatchObject({ cantidad: 20, status_revision: "pendiente" });
    expect((await f.detail(id)).items[0].cantidad_aprobada).toBeUndefined();
  });
  it("blocks payment of modified materials that have not been reviewed again", async () => {
    const f = await fixture(), id = await f.create();
    await f.approve(id);
    await f.as("user").mutation(api.requisiciones.update, { id, items: [{ ...f.item, cantidad: 20 }], changed_by_id: f.ids.users.user, changed_by_name: "user" });
    const history = await f.rows("requisicion_history");
    await expect(f.pay(id)).rejects.toThrow();
    expect((await f.get(id)).status).toBe("En proceso");
    expect(await f.rows("requisicion_history")).toEqual(history);
  });
  it.each([{ label: "empty", invalid: [] }, { label: "zero", invalid: [{ cantidad: 0 }] }, { label: "negative", invalid: [{ cantidad: -2 }] }])("rejects $label requested quantities", async ({ invalid }) => {
    const f = await fixture();
    await expect(f.create("user", { items: invalid.map(overrides => ({ ...f.item, ...overrides })) })).rejects.toThrow();
    expect(await f.rows("requisiciones")).toEqual([]);
  });
});

describe("requisition boundary cases", () => {
  it.each([NaN, Infinity, -Infinity])("rejects nonfinite requested quantity %s without writes", async cantidad => {
    const f = await fixture();
    await expect(f.create("user", { items: [{ ...f.item, cantidad }] })).rejects.toThrow("cantidad solicitada");
    expect(await f.rows("requisiciones")).toEqual([]);
    expect(await f.rows("notification_events")).toEqual([]);
  });
  it.each([-1, NaN, Infinity])("rejects invalid estimated amount %s without writes", async monto => {
    const f = await fixture();
    await expect(f.create("user", { items: [{ ...f.item, monto }] })).rejects.toThrow("importe del material");
    expect(await f.rows("requisiciones")).toEqual([]);
  });
  it.each(["familia", "unidad", "sub_partida"])("rejects a blank %s", async field => {
    const f = await fixture();
    await expect(f.create("user", { items: [{ ...f.item, [field]: " " }] })).rejects.toThrow();
    expect(await f.rows("requisiciones")).toEqual([]);
  });
  it("accepts fractional quantities and an optional or zero estimated amount", async () => {
    const f = await fixture();
    for (const monto of [undefined, 0]) {
      const id = await f.create("user", { items: [{ ...f.item, cantidad: 0.25, monto }] });
      expect((await f.detail(id)).items[0].cantidad).toBe(0.25);
    }
  });
  it.each([[], [{ cantidad: 0 }], [{ cantidad: -2 }]].map((invalid, index) => ({ invalid, index })))("rejects invalid edit $index atomically", async ({ invalid }) => {
    const f = await fixture(), id = await f.create();
    await f.approve(id);
    const before = await f.detail(id), history = await f.rows("requisicion_history");
    await expect(f.as("user").mutation(api.requisiciones.update, { id, items: invalid.map(i => ({ ...f.item, ...i })), changed_by_id: f.ids.users.user, changed_by_name: "user" })).rejects.toThrow();
    expect(await f.detail(id)).toEqual(before);
    expect(await f.rows("requisicion_history")).toEqual(history);
  });
  it("preserves item identities and approvals when submitting unchanged material values", async () => {
    const f = await fixture(), id = await f.create();
    await f.approve(id);
    const before = await f.detail(id);
    await f.as("user").mutation(api.requisiciones.update, { id, items: [f.item], changed_by_id: f.ids.users.user, changed_by_name: "user" });
    expect((await f.detail(id)).items).toEqual(before.items);
    expect((await f.get(id)).status_revision).toBe("Aprobada");
  });
  it("preserves a fully approved request when only its description changes", async () => {
    const f = await fixture(), id = await f.create();
    await f.approve(id);
    const before = await f.detail(id);
    await f.as("user").mutation(api.requisiciones.update, { id, descripcion: "Nota administrativa", items: [f.item], changed_by_id: f.ids.users.user, changed_by_name: "user" });
    expect((await f.detail(id)).items).toEqual(before.items);
    expect((await f.get(id)).status_revision).toBe("Aprobada");
  });
  it("preserves partial approvals and reviewer notes on a metadata-only edit", async () => {
    const f = await fixture(), id = await f.create(), initial = await f.detail(id);
    await f.as("finance").mutation(api.requisiciones.reviewRequisicion, { id, reviewer_id: f.ids.users.finance, reviewer_name: "finance",
      items: [{ item_id: initial.items[0]._id, status_revision: "aprobado", cantidad_aprobada: 6, nota_item: "Sólo seis" }] });
    const before = await f.detail(id);
    await f.as("user").mutation(api.requisiciones.update, { id, descripcion: "Nota administrativa", items: [f.item], changed_by_id: f.ids.users.user, changed_by_name: "user" });
    expect((await f.detail(id)).items).toEqual(before.items);
    expect((await f.get(id)).status_revision).toBe("Parcialmente Aprobada");
  });
  it("reordering unchanged materials does not replace or unapprove them", async () => {
    const f = await fixture(), second = { ...f.item, sub_partida: "ARENA", cantidad: 2, monto: 200 };
    const id = await f.create("user", { items: [f.item, second] });
    await f.approve(id);
    const before = await f.detail(id);
    await f.as("user").mutation(api.requisiciones.update, { id, items: [second, f.item], changed_by_id: f.ids.users.user, changed_by_name: "user" });
    expect((await f.detail(id)).items).toEqual(before.items);
    expect((await f.get(id)).status_revision).toBe("Aprobada");
  });
  it("changing request type invalidates review while preserving payment and delivery", async () => {
    const f = await fixture(), id = await f.create();
    await f.approve(id);
    await f.t.run(ctx => ctx.db.patch(id, { status: "Pagado", status_entrega: "Completo" }));
    await f.as("user").mutation(api.requisiciones.update, { id, tipo: "equipo", changed_by_id: f.ids.users.user, changed_by_name: "user" });
    expect(await f.get(id)).toMatchObject({ status: "Pagado", status_entrega: "Completo", status_revision: "Pendiente de revisión" });
    expect((await f.detail(id)).items[0]).toMatchObject({ status_revision: "pendiente" });
  });
  it("rejects invalid request type", async () => {
    const f = await fixture();
    await expect(f.create("user", { tipo: "unknown" })).rejects.toThrow("Tipo");
  });
  it("keeps free-text material descriptions when OTRO is selected", async () => {
    const f = await fixture();
    const items = buildRequestedRequisicionItems(f.ids.root, [{ id: "group", familia: "MATERIALES", partida_id: f.ids.family,
      subPartidas: [{ id: "row", sub_partida: "OTRO", descripcion_otro: " Material especial ", cantidad: 2, unidad: " m ", partida_id: f.ids.leaf }] }]);
    const id = await f.create("user", { items });
    expect((await f.detail(id)).items[0]).toMatchObject({ partida_id: f.ids.root, sub_partida: "Material especial", unidad: "m" });
  });
  it("continues rejecting unknown budget families for root and legacy references", async () => {
    const f = await fixture();
    for (const item of [{ ...f.item, partida_id: f.ids.leaf, familia: "INVALID" }, { ...f.item, familia: "INVALID" }]) {
      await expect(f.create("user", { items: [item] })).rejects.toThrow();
    }
    expect(await f.rows("requisiciones")).toEqual([]);
  });
});
