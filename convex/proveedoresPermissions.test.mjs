import { describe, expect, it, vi } from "vitest";
import * as providers from "./proveedores";
import * as imports from "./laborPaymentImports";

// Provider authorization tests exercise import persistence, independent of budget recalculation.
vi.mock("./functions", () => ({
  updateHonorariosMonto: vi.fn(), updateMeticasPresupuesto: vi.fn(), updatePagadoForHierarchy: vi.fn(),
}));

function fixture(role = "admin", { authenticated = true, allowed = true } = {}) {
  const tables = {
    users: [
      { _id: "actor", clerkId: "session", name: "Session actor", email: "actor@example.test", role, organization_id: "org", allowed_desarrollos: allowed ? ["project"] : [] },
      { _id: "other-user", clerkId: "spoofed", name: "Other user", email: "other@example.test", role: "admin", allowed_desarrollos: [] },
    ],
    desarrollos: [{ _id: "project", nombre: "Obra", moneda_principal: "MXN", organization_id: allowed ? "org" : "foreign" }, { _id: "other-project", organization_id: "foreign" }],
    proveedores: [
      { _id: "provider", razon_social: "Proveedor", razon_social_normalizada: "PROVEEDOR", created_by: "actor", tipo: "regular", stats_transaction_count: 1, stats_total_amount: 100, stats_project_count: 1 },
      { _id: "target", razon_social: "Destino", razon_social_normalizada: "DESTINO", created_by: "other-user", tipo: "regular" },
    ],
    provider_project_stats: [{ _id: "project-stat", proyecto_id: "project", provider_id: "provider", transaction_count: 1, total_amount: 100 }],
    partidas: [{ _id: "partida", proyecto: "project", nombre: "OBRA", familia: "FAM", sub_partida: "SUB", nivel: 3, partida_nombre: "OBRA" }],
    invoice_records: [],
    transacciones: [],
    requisiciones: [],
    payment_accounts: [],
    labor_payment_imports: [],
    pagos: [],
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
          order() { return query; },
          async unique() { return (await query.collect())[0] || null; },
          async first() { return (await query.collect())[0] || null; },
        };
        return query;
      },
    },
  };
  return { ctx, tables, writes, storageWrites, find };
}

const mutations = [
  ["create", providers.create, { razon_social: "Nuevo" }],
  ["resolveOrCreate", providers.resolveOrCreate, { razon_social: "Nuevo" }],
  ["update", providers.update, { id: "provider", razon_social: "Actualizado" }],
  ["archive", providers.archive, { id: "provider" }],
  ["reactivate", providers.reactivate, { id: "provider" }],
  ["merge", providers.merge, { source_id: "provider", target_id: "target" }],
  ["deleteProveedor", providers.deleteProveedor, { id: "provider" }],
];

function importArgs(providerName = "Nuevo") {
  return {
    proyecto: "project",
    source: { file_name: "Pagos.xlsx", file_hash: "a".repeat(64), sheet_name: "Pagos", administration: "Obra", currency: "MXN", row_count: 1 },
    weeks: [{
      date: "2026-10-05", total_people: 1, roles: [{ key: "oficial", label: "Oficial", count: 1 }], row_count: 1, amount_total: 100, warnings: [],
      transactions: [{ source_key: "row-2", monto_total: 100, tipo_pago: "efectivo", moneda: "MXN", categoria: "Mano de obra", factura: "Factura", proveedor: providerName,
        line_items: [{ partida_id: "partida", partida: "OBRA", familia: "FAM", sub_partida: "SUB", monto: 100, numero_personas_origen: 1, source_row: 2 }],
      }],
    }],
  };
}

describe("administrator-only provider catalogue management", () => {
  it("covers all exported provider mutations", () => {
    expect(Object.entries(providers).filter(([, fn]) => fn.isMutation).map(([name]) => name).sort()).toEqual(mutations.map(([name]) => name).sort());
  });

  it.each(["finance", "user", "viewer", "contratista", "almacenista", "unknown"])("blocks all writes for %s, including edits to their own provider", async (role) => {
    for (const [name, operation, args] of mutations) {
      const f = fixture(role);
      await expect(operation._handler(f.ctx, args), name).rejects.toThrow(/admin/i);
      expect(f.writes).toEqual([]);
    }
  });

  it("rejects every unauthenticated mutation before any change", async () => {
    for (const [, operation, args] of mutations) {
      const f = fixture("admin", { authenticated: false });
      await expect(operation._handler(f.ctx, args)).rejects.toThrow("Not authenticated");
      expect(f.writes).toEqual([]);
    }
  });

  it.each(mutations)("allows admin to execute %s", async (_name, operation, args) => {
    const f = fixture();
    await operation._handler(f.ctx, args);
    expect(f.writes.length).toBeGreaterThan(0);
  });

  it("allows administrators to edit providers created by another user", async () => {
    const f = fixture();
    await providers.update._handler(f.ctx, { id: "target", razon_social: "Otro nombre" });
    expect(f.find("target").razon_social).toBe("Otro nombre");
  });

  it("attributes new providers to the authenticated administrator", async () => {
    const f = fixture();
    const id = await providers.create._handler(f.ctx, { razon_social: "Nuevo" });
    const resolved = await providers.resolveOrCreate._handler(f.ctx, { razon_social: "Otro nuevo" });
    expect(f.find(id).created_by).toBe("actor");
    expect(f.find(resolved.provider_id).created_by).toBe("actor");
  });

  it.each(["finance", "user", "viewer", "contratista", "almacenista"])("preserves consultation of project providers for %s", async (role) => {
    const f = fixture(role);
    const rows = await providers.getByProyectoWithStats._handler(f.ctx, { proyecto_id: "project" });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ _id: "provider", transaccionesCount: 1, totalAmount: 100 });
    expect(f.writes).toEqual([]);
  });

  it.each([false, true])("rejects project consultation without access (authenticated: %s)", async (authenticated) => {
    const f = fixture("viewer", { authenticated, allowed: false });
    await expect(providers.getByProyectoWithStats._handler(f.ctx, { proyecto_id: "project" })).rejects.toThrow("No tienes acceso");
  });

  it.each(["finance", "user", "contratista"])("prevents %s from creating providers through labor imports before deleting or inserting anything", async (role) => {
    const f = fixture(role);
    f.tables.labor_payment_imports.push({ _id: "old-import", proyecto: "project", status: "active", capture_date: "2026-10-05", source_file_hash: "b".repeat(64) });
    await expect(imports.replaceLaborPaymentImport._handler(f.ctx, importArgs())).rejects.toThrow("Solo admin");
    expect(f.writes).toEqual([]);
    expect(f.find("old-import").status).toBe("active");
  });

  it.each(["finance", "user", "contratista"])("lets %s import with existing providers", async (role) => {
    const f = fixture(role);
    const result = await imports.replaceLaborPaymentImport._handler(f.ctx, importArgs("Proveedor"));
    expect(result).toMatchObject({ providers_created: 0, providers_reused: 1, transaction_count: 1 });
    expect(f.writes.filter(([kind, table]) => kind === "insert" && table === "proveedores")).toEqual([]);
  });

  it("allows admin to create providers through labor imports", async () => {
    const f = fixture();
    const result = await imports.replaceLaborPaymentImport._handler(f.ctx, importArgs());
    expect(result).toMatchObject({ providers_created: 1, transaction_count: 1 });
    expect(f.tables.proveedores.find((provider) => provider.razon_social === "Nuevo")).toMatchObject({ created_by: "actor" });
  });

  it("keeps the computed super-administrator permission", async () => {
    const f = fixture("viewer");
    f.find("actor").email = "ops@ogc.mx";
    const id = await providers.create._handler(f.ctx, { razon_social: "Nuevo" });
    expect(f.find(id).created_by).toBe("actor");
  });
});

