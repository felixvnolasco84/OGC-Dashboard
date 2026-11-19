import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";

const modules = import.meta.glob(["./**/*.ts", "./_generated/*.js"]);
async function fixture({ role = "user", org = "org-a", allowed = true, email = "writer@test.invalid" } = {}) {
  const test = convexTest(schema, modules);
  const ids = await test.run(async ctx => {
    const project = await ctx.db.insert("sales_projects", { nombre: "Ventas ficticias", descripcion: "", image: "", organization_id: "org-a" });
    const other = await ctx.db.insert("sales_projects", { nombre: "Otro proyecto ficticio", descripcion: "", image: "", organization_id: "org-b" });
    await ctx.db.insert("users", { clerkId: "fixture-writer", email, role, name: "Prueba", organization_id: org,
      allowed_desarrollos: [], allowed_sales_projects: allowed ? [project] : [], created_at: 0 });
    const base = { nombre: "Unidad", familia: "", sub_partida: "", unidad: "", cantidad: 1, precio_unitario: 1000,
      presupuesto_original: 1000, presupuesto_aprobado: 800, pagado: 999, por_gastar: -199, archivo_origen: "fixture", sales_proyecto: project };
    const root = await ctx.db.insert("sales_partidas", { ...base, nivel: 1 });
    const family = await ctx.db.insert("sales_partidas", { ...base, nivel: 2, partida_nombre: "Unidad", familia: "Interior" });
    const leaf = await ctx.db.insert("sales_partidas", { ...base, nivel: 3, partida_nombre: "Unidad", familia: "Interior", sub_partida: "Acabados" });
    const otherRoot = await ctx.db.insert("sales_partidas", { ...base, nivel: 1, sales_proyecto: other });
    const transaction = { sales_proyecto: project, monto_total: 200, fecha: "2026-11-19", tipo_pago: "TRANSFERENCIA", moneda: "USD", tipo_cambio: "1" };
    const paid = await ctx.db.insert("sales_transacciones", { ...transaction, status: "Pagado" });
    const pending = await ctx.db.insert("sales_transacciones", { ...transaction, status: "Por pagar" });
    await ctx.db.insert("sales_pagos", { sales_transaccion_id: paid, sales_partida_id: leaf, monto: 200 });
    await ctx.db.insert("sales_pagos", { sales_transaccion_id: pending, sales_partida_id: leaf, monto: 500 });
    return { project, other, root, family, leaf, otherRoot };
  });
  const writer = test.withIdentity({ subject: "fixture-writer" });
  const sync = (client = writer, project = ids.project) => client.mutation(api.sales_partidas_sync.syncSalesPartidasFromTransactions, { salesProjectId: project });
  const snapshot = () => test.run(ctx => ctx.db.query("sales_partidas").collect());
  return { test, ids, sync, snapshot };
}

describe("P24 · ventas: sincronización manual y permisos", () => {
  it.each([
    { role: "user" },
    { role: "admin", allowed: false },
    { role: "admin", org: "", allowed: false },
    { role: "user", email: "ops@ogc.mx", org: "other-org", allowed: false },
  ])("conserva la cascada para usuarios con acceso: %j", async options => {
    const f = await fixture(options);
    const before = await f.test.run(ctx => ctx.db.get(f.ids.otherRoot));
    const result = await f.sync();
    expect(result).toMatchObject({ success: true, updatedCount: 3 });
    for (const id of [f.ids.root, f.ids.family, f.ids.leaf]) {
      expect(await f.test.run(ctx => ctx.db.get(id))).toMatchObject({ pagado: 200, por_gastar: 600, presupuesto_original: 1000, presupuesto_aprobado: 800, avance: 25 });
    }
    expect(await f.test.run(ctx => ctx.db.get(f.ids.otherRoot))).toEqual(before);
    expect((await f.sync()).updatedCount).toBe(0);
  });

  it.each([
    { role: "viewer" }, { role: "almacenista" }, { role: "finance" }, { role: "contratista" },
    { role: "user", allowed: false }, { role: "admin", org: "other-org", allowed: false },
  ])("rechaza acceso y deja datos intactos: %j", async options => {
    const f = await fixture(options);
    const before = await f.snapshot();
    await expect(f.sync()).rejects.toThrow(/No tienes/);
    expect(await f.snapshot()).toEqual(before);
  });

  it("rechaza peticiones sin autenticación y un proyecto diferente", async () => {
    const f = await fixture();
    const before = await f.snapshot();
    await expect(f.sync(f.test)).rejects.toThrow("Not authenticated");
    await expect(f.sync(undefined, f.ids.other)).rejects.toThrow("No tienes acceso");
    expect(await f.snapshot()).toEqual(before);
  });

  it("rechaza un proyecto que ya no existe", async () => {
    const f = await fixture({ role: "admin" });
    await f.test.run(ctx => ctx.db.delete(f.ids.project));
    const before = await f.snapshot();
    await expect(f.sync()).rejects.toThrow("Proyecto de ventas no encontrado");
    expect(await f.snapshot()).toEqual(before);
  });
});
