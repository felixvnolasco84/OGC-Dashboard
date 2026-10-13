import { getFunctionName } from "convex/server";
export const budget = [
  { _id: "root", nombre: "OBRA", nivel: 1, familia: "", sub_partida: "", presupuesto_aprobado: 1000, pagado: 0 },
  { _id: "family", nombre: "OBRA", partida_nombre: "OBRA", nivel: 2, familia: "MATERIALES", sub_partida: "", presupuesto_aprobado: 1000, pagado: 0 },
  { _id: "leaf", nombre: "OBRA", partida_nombre: "OBRA", nivel: 3, familia: "MATERIALES", sub_partida: "CEMENTO", cantidad: 10, unidad: "piezas", precio_unitario: 100, presupuesto_aprobado: 1000, pagado: 0 },
];
const roots = [budget[0]];
const user = { _id: "user", name: "Prueba local", role: "admin" };
const req = { _id: "req", proyecto: "project", tipo: "material", status: "En proceso", status_revision: "Aprobada", solicitante_nombre: "Prueba local", fecha_solicitud: "12/10/2026", descripcion: "", documentos: [], items: [{ _id: "item", partida_id: "root", partida: budget[0], familia: "MATERIALES", sub_partida: "CEMENTO", cantidad: 10, unidad: "piezas", monto: 1000, status_revision: "aprobado", cantidad_aprobada: 10 }] };
const state = window as unknown as { calls: { name: string; args: unknown }[] };
state.calls = [];
export function useQuery(ref: Parameters<typeof getFunctionName>[0], args?: unknown) {
  if (args === "skip") return undefined;
  switch (getFunctionName(ref)) {
    case "users:getCurrentUser": return user;
    case "partida:getByNivel": return roots;
    case "partida:getByProject": return budget;
    case "partida:getDistinctSubPartidasByFamilia": return ["CEMENTO"];
    case "requisiciones:getById": return req;
    default: throw new Error(`Unimplemented fixture query: ${getFunctionName(ref)}`);
  }
}
export function useMutation(ref: Parameters<typeof getFunctionName>[0]) {
  return async (args: unknown) => {
    const name = getFunctionName(ref);
    state.calls.push({ name, args });
    console.info("REQUISICION_TEST_PAYLOAD", JSON.stringify({ name, args }));
    // The schema/transaction integration probes separately validate this payload.
    return name === "requisiciones:create" ? "created" : {};
  };
}
