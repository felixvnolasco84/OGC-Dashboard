import { describe, expect, it } from "vitest";
import * as ingresos from "./ingresos";
import * as documents from "./ingresos_documentos";
import * as movements from "./ogc_movimientos";

function fixture(role = "finance", { authenticated = true, allowed = true } = {}) {
  const tables = {
    users: [
      { _id: "actor", clerkId: "session", name: "Session actor", email: "actor@example.test", role, organization_id: "org", allowed_desarrollos: allowed ? ["project"] : [] },
      { _id: "other-user", clerkId: "spoofed", name: "Other user", email: "other@example.test", role: "admin", allowed_desarrollos: [] },
    ],
    desarrollos: [{ _id: "project", organization_id: allowed ? "org" : "foreign" }, { _id: "other-project", organization_id: "foreign" }],
    ingresos: [{ _id: "income", proyecto: "project", monto: 100, fecha: "01/01/2026", moneda: "MXN" }],
    ingresos_totals: [{ _id: "totals", proyecto: "project", total_ingresos: 100, total_count: 1 }],
    ingresos_documentos: [{ _id: "document", ingreso_id: "income", proyecto: "project", storage_id: "file", nombre: "Factura" }],
    ogc_movimientos: [{ _id: "movement", proyecto: "project", organization_id: "org", tipo: "ingreso", categoria: "HONORARIOS", monto: 100, fecha: "01/01/2026", moneda: "MXN", status: "activo" }],
    ogc_movimientos_audit: [],
  };
  const writes = [];
  const storageWrites = [];
  const find = (id) => Object.values(tables).flat().find((row) => row._id === id);
  let serial = 0;
  const ctx = {
    auth: { getUserIdentity: async () => authenticated ? { subject: "session" } : null },
    storage: {
      generateUploadUrl: async () => { storageWrites.push("upload"); return "upload-url"; },
      delete: async (id) => { storageWrites.push(["delete", id]); },
      getUrl: async (id) => `https://storage.example.test/${id}`,
    },
    db: {
      normalizeId(table, id) { return tables[table]?.some((row) => row._id === id) ? id : null; },
      async get(id) { return structuredClone(find(id) || null); },
      async insert(table, fields) {
        const id = `${table}-${++serial}`;
        writes.push(["insert", table]);
        (tables[table] ||= []).push({ _id: id, ...fields });
        return id;
      },
      async patch(id, fields) { writes.push(["patch", id]); Object.assign(find(id), fields); },
      async delete(id) {
        writes.push(["delete", id]);
        for (const rows of Object.values(tables)) {
          const index = rows.findIndex((row) => row._id === id);
          if (index >= 0) rows.splice(index, 1);
        }
      },
      query(table) {
        const filters = [];
        const builder = { eq(key, value) { filters.push([key, value]); return builder; }, field(key) { return key; } };
        const query = {
          withIndex(_index, predicate) { predicate?.(builder); return query; },
          filter(predicate) { predicate(builder); return query; },
          async collect() { return structuredClone((tables[table] || []).filter((row) => filters.every(([key, value]) => row[key] === value))); },
          async first() { return (await query.collect())[0] || null; },
        };
        return query;
      },
    },
  };
  return { ctx, tables, writes, storageWrites, find };
}

const createArgs = { proyecto: "project", monto: 50, fecha: "02/01/2026", moneda: "MXN", clerk_id: "spoofed" };
const documentArgs = { ingreso_id: "income", proyecto: "project", nombre: "Factura", storage_id: "new-file", type: "factura", size: 100, clerk_id: "spoofed" };
const writeOperations = [
  ["create", ingresos.create, createArgs],
  ["bulk create", ingresos.bulkCreate, { proyecto: "project", clerk_id: "spoofed", ingresos: [{ monto: 50, fecha: "02/01/2026", moneda: "MXN" }] }],
  ["update", ingresos.update, { id: "income", monto: 150 }],
  ["remove", ingresos.remove, { id: "income" }],
  ["upload URL", documents.generateUploadUrl, {}],
  ["attach document", documents.create, documentArgs],
  ["remove document", documents.remove, { id: "document" }],
  ["remove documents", documents.removeByIngreso, { ingreso_id: "income" }],
];

describe("income authorization", () => {
  it.each(["user", "viewer", "contratista", "almacenista", "unknown"])("rejects every write for %s before changing records or storage", async (role) => {
    for (const [, operation, args] of writeOperations) {
      const f = fixture(role);
      await expect(operation._handler(f.ctx, args)).rejects.toThrow("Solo finance y admin");
      expect(f.writes).toEqual([]);
      expect(f.storageWrites).toEqual([]);
    }
  });

  it("rejects unauthenticated writes, including calls with another user's Clerk ID", async () => {
    for (const [, operation, args] of writeOperations) {
      const f = fixture("admin", { authenticated: false });
      await expect(operation._handler(f.ctx, args)).rejects.toThrow("Not authenticated");
      expect(f.writes).toEqual([]);
      expect(f.storageWrites).toEqual([]);
    }
  });

  it.each(["finance", "admin"])("allows every write for %s within project scope", async (role) => {
    for (const [, operation, args] of writeOperations) {
      const f = fixture(role);
      await operation._handler(f.ctx, args);
      expect(f.writes.length + f.storageWrites.length).toBeGreaterThan(0);
    }
  });

  it.each(["finance", "admin"])("rejects writes outside the project scope for %s", async (role) => {
    for (const [, operation, args] of writeOperations.filter(([, operation]) => operation !== documents.generateUploadUrl)) {
      const f = fixture(role, { allowed: false });
      await expect(operation._handler(f.ctx, args)).rejects.toThrow("No tienes acceso");
      expect(f.writes).toEqual([]);
      expect(f.storageWrites).toEqual([]);
    }
  });

  it("uses the authenticated actor for income and attachment attribution", async () => {
    const f = fixture();
    const id = await ingresos.create._handler(f.ctx, createArgs);
    const documentId = await documents.create._handler(f.ctx, documentArgs);
    expect(f.find(id)).toMatchObject({ added_by_id: "actor", added_by_name: "Session actor" });
    expect(f.find(documentId)).toMatchObject({ uploaded_by_id: "actor", uploaded_by_name: "Session actor" });
  });

  it("rejects linking an attachment to a different project", async () => {
    const f = fixture("admin");
    await expect(documents.create._handler(f.ctx, { ...documentArgs, proyecto: "other-project" })).rejects.toThrow("no pertenece");
    expect(f.writes).toEqual([]);
  });

  it("keeps project income and document consultation available to a viewer", async () => {
    const f = fixture("viewer");
    expect(await ingresos.getByProyecto._handler(f.ctx, { proyecto_id: "project" })).toHaveLength(1);
    expect(await ingresos.getById._handler(f.ctx, { id: "income" })).toMatchObject({ _id: "income" });
    expect(await ingresos.getTotalsByProyecto._handler(f.ctx, { proyecto_id: "project" })).toMatchObject({ total_ingresos: 100 });
    expect(await documents.getByIngreso._handler(f.ctx, { ingreso_id: "income" })).toHaveLength(1);
    expect(await documents.getByProyecto._handler(f.ctx, { proyecto_id: "project" })).toHaveLength(1);
    expect(await documents.getById._handler(f.ctx, { id: "document" })).toMatchObject({ url: expect.stringContaining("/file") });
    expect(await documents.getUrl._handler(f.ctx, { storage_id: "file" })).toContain("/file");
  });

  it.each([false, true])("rejects reads without project access (authenticated: %s)", async (authenticated) => {
    const reads = [
      [ingresos.getByProyecto, { proyecto_id: "project" }], [ingresos.getById, { id: "income" }],
      [ingresos.getTotalsByProyecto, { proyecto_id: "project" }],
      [documents.getByIngreso, { ingreso_id: "income" }], [documents.getByProyecto, { proyecto_id: "project" }],
      [documents.getById, { id: "document" }], [documents.getUrl, { storage_id: "file" }],
    ];
    for (const [operation, args] of reads) {
      const f = fixture("viewer", { authenticated, allowed: false });
      await expect(operation._handler(f.ctx, args)).rejects.toThrow("No tienes acceso");
    }
  });
});

const ogcCreateArgs = { movimientos: [{ tipo: "ingreso", categoria: "HONORARIOS", monto: 50, fecha: "02/01/2026", moneda: "MXN", proyecto: "project" }] };
const ogcOperations = [
  [movements.bulkCreate, ogcCreateArgs],
  [movements.validateBulkCreate, ogcCreateArgs],
  [movements.update, { id: "movement", patch: { monto: 150 } }],
  [movements.voidMovement, { id: "movement", reason: "Correction" }],
  [movements.setInvoiceEvidence, { id: "movement", referencia: "INV-1" }],
  [movements.reconcile, { id: "movement", reconciled: true }],
  [movements.markDuplicate, { id: "movement" }],
];

describe("OGC income authorization", () => {
  it.each(["user", "contratista"])("prevents %s from bypassing income rules through OGC operations", async (role) => {
    for (const [operation, args] of ogcOperations) {
      const f = fixture(role);
      await expect(operation._handler(f.ctx, args)).rejects.toThrow("Solo finance y admin");
      expect(f.writes).toEqual([]);
      expect(f.storageWrites).toEqual([]);
    }
  });

  it.each(["finance", "admin"])("allows %s to manage OGC incomes", async (role) => {
    for (const [operation, args] of ogcOperations) {
      const f = fixture(role);
      await operation._handler(f.ctx, args);
    }
  });

  it("prevents reclassifying a cost into income or income into cost to bypass permissions", async () => {
    const f = fixture("user");
    await expect(movements.update._handler(f.ctx, { id: "movement", patch: { tipo: "costo_estructura" } })).rejects.toThrow("Solo finance y admin");
    f.find("movement").tipo = "costo_estructura";
    await expect(movements.update._handler(f.ctx, { id: "movement", patch: { tipo: "ingresos" } })).rejects.toThrow("Solo finance y admin");
    expect(f.writes).toEqual([]);
  });

  it("preserves the existing permission to update non-income OGC movements", async () => {
    const f = fixture("user");
    f.find("movement").tipo = "costo_estructura";
    await movements.update._handler(f.ctx, { id: "movement", patch: { monto: 150 } });
    expect(f.find("movement").monto).toBe(150);
  });
});
