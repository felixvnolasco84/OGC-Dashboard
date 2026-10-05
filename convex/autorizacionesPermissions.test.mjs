import { describe, expect, it } from "vitest";
import * as work from "./autorizaciones_obra";
import * as imss from "./imss_siroc";
import * as subs from "./subcontratistas";

function fixture(role = "admin", { authenticated = true, allowed = true } = {}) {
  const tables = {
    users: [
      { _id: "actor", clerkId: "session", name: "Session actor", email: "actor@example.test", role, organization_id: "org", allowed_desarrollos: allowed ? ["project"] : [] },
      { _id: "other-user", clerkId: "spoofed", name: "Other user", email: "other@example.test", role: "admin", allowed_desarrollos: [] },
    ],
    desarrollos: [{ _id: "project", organization_id: allowed ? "org" : "foreign" }, { _id: "other-project", organization_id: "foreign" }],
    autorizaciones_obra: [{ _id: "section", proyecto: "project", seccion: "licencia", responsable_id: "actor", documento_storage_id: "old-file", documento_nombre: "Anterior" }],
    autorizaciones_obra_tramites: [{ _id: "tramite", proyecto: "project", autorizacion_id: "section", servicio: "CFE", tramite: "Alta", estado: "Pendiente", documento_storage_id: "old-file", documento_nombre: "Anterior" }],
    autorizaciones_obra_historial: [{ _id: "history", proyecto: "project", parent_type: "autorizacion", parent_id: "section", documento_storage_id: "old-file", documento_nombre: "Anterior" }],
    subcontratistas: [{ _id: "sub", proyecto: "project", nombre: "Subcontratista", presupuesto_storage_id: "old-file", presupuesto_nombre: "Anterior", contrato_storage_id: "old-file", contrato_nombre: "Anterior" }],
    contratistas_generales: [{ _id: "cg", proyecto: "project", nombre: "General", responsable_id: "actor" }],
    imss_configuracion: [{ _id: "config", proyecto: "project", costo_total_imss: 100 }],
    imss_pagos_cuota: [{ _id: "pago", proyecto: "project", parent_type: "subcontratista", parent_id: "sub", monto: 50, comprobante_storage_id: "old-file", comprobante_nombre: "Anterior", soporte_storage_id: "old-file", soporte_nombre: "Anterior" }],
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

const file = { storage_id: "new-file", nombre: "Nuevo", size: 10, type: "application/pdf", clerk_id: "spoofed" };
const mutations = [
  [work, {
    generateUploadUrl: {}, upsertSeccion: { proyecto: "project", seccion: "licencia", status_manual: "activo" },
    updateStatus: { id: "section", status_manual: "activo" }, updateResponsable: { id: "section", responsable_id: "actor" },
    updateSeccionFields: { id: "section", numero_licencia: "123" }, attachDocument: { proyecto: "project", seccion: "licencia", ...file },
    createTramite: { proyecto: "project", autorizacion_id: "section", servicio: "Agua", tramite: "Alta", estado: "Pendiente" },
    updateTramite: { id: "tramite", estado: "Activo" }, deleteTramite: { id: "tramite" },
    attachTramiteDocument: { tramite_id: "tramite", ...file }, ensureSeccion: { proyecto: "project", seccion: "poliza" },
  }],
  [imss, {
    generateUploadUrl: {}, upsertConfig: { proyecto: "project", costo_total_imss: 200 },
    createPagoCuota: { proyecto: "project", parent_type: "subcontratista", parent_id: "sub", monto: 20 },
    updatePagoCuota: { id: "pago", monto: 100 }, deletePagoCuota: { id: "pago" },
    attachComprobante: { id: "pago", ...file }, attachSoporte: { id: "pago", ...file },
    removeComprobante: { id: "pago" }, removeSoporte: { id: "pago" },
  }],
  [subs, {
    generateUploadUrl: {}, createSubcontratista: { proyecto: "project", nombre: "Nuevo", contratista_general_id: "cg" },
    updateSubcontratista: { id: "sub", nombre: "Actualizado", contratista_general_id: "cg" }, deleteSubcontratista: { id: "sub" },
    attachPresupuesto: { id: "sub", ...file }, attachContrato: { id: "sub", ...file },
    removePresupuesto: { id: "sub" }, removeContrato: { id: "sub" },
    createContratistaGeneral: { proyecto: "project", nombre: "Nuevo" }, updateContratistaGeneral: { id: "cg", nombre: "Actualizado" },
    deleteContratistaGeneral: { id: "cg" }, attachContratistaGeneralContrato: { id: "cg", ...file },
    attachContratistaGeneralSiroc: { id: "cg", ...file }, updateSubcontratistaSiroc: { id: "sub", siroc_numero: "123" },
    attachSubcontratistaSiroc: { id: "sub", ...file },
  }],
];
const writes = mutations.flatMap(([module, argsByName]) => Object.entries(argsByName).map(([name, args]) => [name, module[name], args]));
const reads = [
  [work.getByProyecto, { proyecto_id: "project" }], [work.getTramitesByProyecto, { proyecto_id: "project" }],
  [work.getTramitesByAutorizacion, { autorizacion_id: "section" }], [work.getHistorial, { parent_type: "autorizacion", parent_id: "section" }],
  [subs.getByProyecto, { proyecto_id: "project" }], [subs.getContratistasGeneralesByProyecto, { proyecto_id: "project" }],
  [imss.getConfigByProyecto, { proyecto_id: "project" }], [imss.getPagosCuotaByProyecto, { proyecto_id: "project" }],
  [imss.getPagosCuotaByParent, { parent_type: "subcontratista", parent_id: "sub" }],
];

describe("admin-only work authorization, IMSS/SIROC and subcontractor management", () => {
  it("covers every exported mutation in the three modules", () => {
    for (const [module, args] of mutations) {
      expect(Object.entries(module).filter(([, fn]) => fn.isMutation).map(([name]) => name).sort()).toEqual(Object.keys(args).sort());
    }
  });

  it.each(["finance", "user", "viewer", "contratista", "almacenista", "unknown"])("blocks all writes for %s before any database or storage change", async (role) => {
    for (const [, operation, args] of writes) {
      const f = fixture(role);
      await expect(operation._handler(f.ctx, args)).rejects.toThrow("Solo admin");
      expect(f.writes).toEqual([]);
      expect(f.storageWrites).toEqual([]);
    }
  });

  it("blocks unauthenticated requests despite supplied Clerk IDs", async () => {
    for (const [, operation, args] of writes) {
      const f = fixture("admin", { authenticated: false });
      await expect(operation._handler(f.ctx, args)).rejects.toThrow("Not authenticated");
      expect(f.writes).toEqual([]);
      expect(f.storageWrites).toEqual([]);
    }
  });

  it.each(writes)("allows admin to execute %s in the authorized project", async (_name, operation, args) => {
    const f = fixture();
    await operation._handler(f.ctx, args);
    expect(f.writes.length + f.storageWrites.length).toBeGreaterThan(0);
  });

  it("blocks every project write for an administrator outside its scope", async () => {
    for (const [name, operation, args] of writes.filter(([name]) => name !== "generateUploadUrl")) {
      const f = fixture("admin", { allowed: false });
      await expect(operation._handler(f.ctx, args), name).rejects.toThrow("No tienes acceso");
      expect(f.writes).toEqual([]);
      expect(f.storageWrites).toEqual([]);
    }
  });

  it.each(["finance", "user", "viewer", "contratista", "almacenista"])("preserves project consultation for %s", async (role) => {
    const f = fixture(role);
    for (const [operation, args] of reads) expect(await operation._handler(f.ctx, args)).toBeTruthy();
    expect(f.writes).toEqual([]);
  });

  it.each([false, true])("rejects project reads without access (authenticated: %s)", async (authenticated) => {
    const f = fixture("viewer", { authenticated, allowed: false });
    for (const [operation, args] of reads) await expect(operation._handler(f.ctx, args)).rejects.toThrow("No tienes acceso");
  });

  it("uses the session administrator for all document replacement histories", async () => {
    for (const [name, operation, args] of writes.filter(([name]) => ["attachDocument", "attachTramiteDocument", "attachComprobante", "attachSoporte", "attachPresupuesto", "attachContrato"].includes(name))) {
      const f = fixture();
      await operation._handler(f.ctx, args);
      expect(f.tables.autorizaciones_obra_historial.at(-1), name).toMatchObject({ replaced_by_id: "actor", replaced_by_name: "Session actor" });
    }
  });

  it("rejects parent links across projects even when the admin can access both projects", async () => {
    const operations = [
      [work.createTramite, { proyecto: "other-project", autorizacion_id: "section", servicio: "CFE", tramite: "Alta", estado: "Activo" }],
      [imss.createPagoCuota, { proyecto: "other-project", parent_type: "subcontratista", parent_id: "sub", monto: 10 }],
      [subs.createSubcontratista, { proyecto: "other-project", nombre: "Nuevo", contratista_general_id: "cg" }],
      [subs.updateSubcontratista, { id: "sub", contratista_general_id: "foreign-cg" }],
    ];
    for (const [operation, args] of operations) {
      const f = fixture();
      f.find("actor").allowed_desarrollos.push("other-project");
      f.tables.contratistas_generales.push({ _id: "foreign-cg", proyecto: "other-project", nombre: "Otro" });
      await expect(operation._handler(f.ctx, args)).rejects.toThrow("no pertenece al proyecto");
      expect(f.writes).toEqual([]);
    }
  });

  it("rejects unknown history parents and invalid or missing payment parents", async () => {
    const f = fixture();
    await expect(work.getHistorial._handler(f.ctx, { parent_type: "users", parent_id: "actor" })).rejects.toThrow("Tipo de registro");
    await expect(work.getHistorial._handler(f.ctx, { parent_type: "__proto__", parent_id: "actor" })).rejects.toThrow("Tipo de registro");
    await expect(imss.createPagoCuota._handler(f.ctx, { proyecto: "project", parent_type: "autorizacion", parent_id: "section", monto: 10 })).rejects.toThrow("Tipo de cuota");
    await expect(imss.createPagoCuota._handler(f.ctx, { proyecto: "project", parent_type: "subcontratista", parent_id: "missing", monto: 10 })).rejects.toThrow("Registro no encontrado");
    expect(f.writes).toEqual([]);
  });

  it("restricts the assignment user directory to administrators", async () => {
    const viewer = fixture("viewer");
    await expect(work.getAllUsers._handler(viewer.ctx, {})).rejects.toThrow("Solo admin");
    expect(await work.getAllUsers._handler(fixture().ctx, {})).toHaveLength(2);
  });

  it.each([
    ["autorizacion", "section"], ["tramite", "tramite"],
    ["subcontratista_presupuesto", "sub"], ["subcontratista_contrato", "sub"], ["imss_siroc_sub", "sub"],
    ["imss_cg_contrato", "cg"], ["imss_cg_siroc", "cg"], ["imss_comprobante", "pago"], ["imss_soporte", "pago"],
  ])("scopes the %s document history to its owning project", async (parent_type, parent_id) => {
    const args = { parent_type, parent_id };
    const viewer = fixture("viewer");
    expect(await work.getHistorial._handler(viewer.ctx, args)).toBeInstanceOf(Array);
    await expect(work.getHistorial._handler(fixture("viewer", { allowed: false }).ctx, args)).rejects.toThrow("No tienes acceso");
  });

  it("excludes legacy histories and payments with an inconsistent parent project", async () => {
    const f = fixture("viewer");
    f.tables.autorizaciones_obra_historial.push({ ...f.find("history"), _id: "foreign-history", proyecto: "other-project" });
    f.tables.imss_pagos_cuota.push({ ...f.find("pago"), _id: "foreign-payment", proyecto: "other-project" });
    expect(await work.getHistorial._handler(f.ctx, { parent_type: "autorizacion", parent_id: "section" })).toHaveLength(1);
    expect(await imss.getPagosCuotaByParent._handler(f.ctx, { parent_type: "subcontratista", parent_id: "sub" })).toHaveLength(1);
  });

  it("returns empty reactive histories and payments after the parent is deleted", async () => {
    const f = fixture();
    await subs.deleteSubcontratista._handler(f.ctx, { id: "sub" });
    expect(await work.getHistorial._handler(f.ctx, { parent_type: "subcontratista_contrato", parent_id: "sub" })).toEqual([]);
    expect(await imss.getPagosCuotaByParent._handler(f.ctx, { parent_type: "subcontratista", parent_id: "sub" })).toEqual([]);
  });

  it("keeps the existing computed super-administrator permission", async () => {
    const f = fixture("viewer");
    f.find("actor").email = "ops@ogc.mx";
    await work.updateStatus._handler(f.ctx, { id: "section", status_manual: "activo" });
    expect(f.find("section").status_manual).toBe("activo");
  });
});
