import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Id, TableNames } from "./_generated/dataModel";
import { checkDesarrolloAccess, getCurrentUserOrThrow } from "./permissions";

type WorkTable = "autorizaciones_obra" | "autorizaciones_obra_tramites" |
  "subcontratistas" | "contratistas_generales" | "imss_pagos_cuota";

export async function assertWorkAdmin(ctx: QueryCtx | MutationCtx) {
  const user = await getCurrentUserOrThrow(ctx);
  if (user.role !== "admin") {
    throw new Error("Solo admin puede gestionar autorizaciones de obra, IMSS/SIROC y subcontratistas.");
  }
  return user;
}

export async function assertWorkProjectAccess(ctx: QueryCtx | MutationCtx, proyecto: Id<"desarrollos">) {
  if (!(await checkDesarrolloAccess(ctx, proyecto))) {
    throw new Error("No tienes acceso al proyecto.");
  }
}

export async function assertWorkRecordAccess<T extends WorkTable>(ctx: QueryCtx | MutationCtx, id: Id<T>) {
  const record = await ctx.db.get(id);
  if (!record) throw new Error("Registro no encontrado.");
  await assertWorkProjectAccess(ctx, record.proyecto);
  return record;
}

const parentTables = {
  autorizacion: "autorizaciones_obra",
  tramite: "autorizaciones_obra_tramites",
  subcontratista: "subcontratistas",
  subcontratista_presupuesto: "subcontratistas",
  subcontratista_contrato: "subcontratistas",
  imss_siroc_sub: "subcontratistas",
  contratista_general: "contratistas_generales",
  imss_cg_contrato: "contratistas_generales",
  imss_cg_siroc: "contratistas_generales",
  imss_comprobante: "imss_pagos_cuota",
  imss_soporte: "imss_pagos_cuota",
} satisfies Record<string, TableNames>;

export async function findWorkParentForRead(ctx: QueryCtx | MutationCtx, parentType: string, parentId: string) {
  if (!Object.prototype.hasOwnProperty.call(parentTables, parentType)) {
    throw new Error("Tipo de registro no válido.");
  }
  const table = parentTables[parentType as keyof typeof parentTables];
  const id = ctx.db.normalizeId(table, parentId);
  if (!id) return null;
  const record = await ctx.db.get(id);
  if (!record) return null;
  await assertWorkProjectAccess(ctx, record.proyecto);
  return record;
}

export async function assertWorkParentAccess(ctx: QueryCtx | MutationCtx, parentType: string, parentId: string) {
  const record = await findWorkParentForRead(ctx, parentType, parentId);
  if (!record) throw new Error("Registro no encontrado.");
  return record;
}

export async function assertWorkRecordProject<T extends WorkTable>(ctx: QueryCtx | MutationCtx, id: Id<T>, proyecto: Id<"desarrollos">) {
  const record = await assertWorkRecordAccess(ctx, id);
  if (record.proyecto !== proyecto) throw new Error("El registro no pertenece al proyecto.");
}
