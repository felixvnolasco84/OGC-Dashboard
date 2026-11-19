import { useMemo } from "react";
import { getFunctionName } from "convex/server";

const params = new URLSearchParams(location.search);
const users = [{ _id: "user-p20", name: "Ana de prueba", email: "ana@example.test" }, { _id: "other-p20", name: "Luis de prueba", email: "luis@example.test" }];
const uploadedAt = new Date("2026-11-19T12:00:00Z").getTime();
const file = (prefix: string) => params.has("empty") ? {} : { [`${prefix}_nombre`]: `${prefix}-prueba.pdf`, [`${prefix}_uploaded_at`]: uploadedAt, [`${prefix}_url`]: `/p20-file-${prefix}.pdf` };
const sections = ["licencia", "poliza", "plan_seguridad", "tramites", "contratos_subcontratistas"].map((seccion, i) => ({ _id: `section-${seccion}`, proyecto: "project-p20", seccion, status_manual: i === 0 ? "activo" : "inactivo", ...(i === 0 ? { responsable_id: users[0]._id, responsable: users[0] } : {}), ...file("documento") }));
const cg = { _id: "cg-p20", proyecto: "project-p20", nombre: "Constructora de prueba", status_manual: "activo", responsable_id: users[0]._id, responsable: users[0], siroc_numero: "SIROC-PRUEBA", ...file("contrato"), ...file("siroc") };
const sub = { _id: "sub-p20", proyecto: "project-p20", contratista_general_id: cg._id, nombre: "Instalaciones de prueba", status_manual: "activo", partida_id: "partida-p20", partida_nombre: "Instalaciones", monto: 1000, siroc_numero: "SUB-PRUEBA", ...file("presupuesto"), ...file("contrato"), ...file("siroc") };
const tramites = [{ _id: "tramite-p20", autorizacion_id: "section-tramites", servicio: "Agua de prueba", tramite: "Conexión de prueba", estado: "Pendiente", ...file("documento") }];
const pagos = [
  { _id: "pago-cg-p20", parent_type: "contratista_general", parent_id: cg._id, cuota_tipo: "Mano de Obra", monto: 100, ...file("comprobante"), ...file("soporte") },
  { _id: "pago-sub-p20", parent_type: "subcontratista", parent_id: sub._id, monto: 50, ...file("comprobante"), ...file("soporte") },
];

export const fixture = { mutations: [] as { name: string; args: unknown }[], queries: [] as { name: string; args: unknown }[], uploads: 0 };
Object.assign(window, { p20Fixture: fixture });

export function useQuery(reference: Parameters<typeof getFunctionName>[0], args?: unknown) {
  const name = getFunctionName(reference), key = JSON.stringify(args);
  return useMemo(() => {
    if (args === "skip") return undefined;
    fixture.queries.push({ name, args });
    if (name === "users:getCurrentUser") return { ...users[0], role: params.has("readonly") ? "user" : "admin" };
    if (name === "autorizaciones_obra:getAllUsers") return users;
    if (name === "autorizaciones_obra:getByProyecto") return sections;
    if (name === "autorizaciones_obra:getTramitesByProyecto") return tramites;
    if (name === "subcontratistas:getContratistasGeneralesByProyecto") return [cg];
    if (name === "subcontratistas:getByProyecto") return [sub];
    if (name === "partida:getByNivel") return [{ _id: "partida-p20", nombre: "Instalaciones" }];
    if (name === "imss_siroc:getConfigByProyecto") return { costo_total_imss: 1000 };
    if (name === "imss_siroc:getPagosCuotaByProyecto") return pagos;
    if (name === "autorizaciones_obra:getHistorial") {
      if (params.has("empty") || params.has("nohistory")) return [];
      const { parent_type, parent_id } = args as { parent_type: string; parent_id: string };
      return [{ _id: `history-${parent_type}-${parent_id}`, documento_nombre: `anterior-${parent_type}-${parent_id}.pdf`, documento_type: "application/pdf", documento_size: 12, replaced_at: uploadedAt - 86400000, replaced_by_name: users[0].name, url: `/p20-history-${parent_type}.pdf` }];
    }
    throw Error(`Consulta sin simular: ${name}`);
  }, [name, key]);
}

export function useMutation(reference: Parameters<typeof getFunctionName>[0]) {
  const name = getFunctionName(reference);
  return useMemo(() => async (args?: unknown) => {
    fixture.mutations.push({ name, args });
    if (params.has("readonly")) throw Error("Mutation de lector inesperada");
    await new Promise(resolve => setTimeout(resolve, 300));
    if (name.endsWith("generateUploadUrl")) return "/p20-upload";
    return "fixture-p20-id";
  }, [name]);
}

// Uploads never leave this in-memory fixture; no live service is reachable.
window.fetch = async (input) => {
  if (input !== "/p20-upload") throw Error(`Red bloqueada en fixture: ${input}`);
  fixture.uploads++;
  await new Promise(resolve => setTimeout(resolve, 700));
  return Response.json({ storageId: "storage-p20" });
};
