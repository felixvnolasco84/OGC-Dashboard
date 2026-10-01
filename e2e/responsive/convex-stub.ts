import { getFunctionName, type FunctionReference } from "convex/server";

const transaction = { _id: "tx-1", fecha: "30/09/2026", tipo_pago: "Transferencia internacional con descripción larga", status: "Pagado", codigo_referencia: "REFERENCIA_LARGA_1234567890_1234567890_1234567890" };
const partida = { _id: "item", proyecto: "project", nivel: 3, nombre: "Instalaciones", sub_partida: "Partida con un nombre extenso para revisar campos, importes y documentos", presupuesto_aprobado: 101517413.99, pagado: 20000000, pagos: [
  { _id: "payment-1", monto: 10000000, moneda: "MXN", status: "Pagado", transaction },
  { _id: "payment-2", monto: 10000000, moneda: "MXN", status: "Pagado", transaction },
] };

type Query = FunctionReference<"query">;
export function useQuery<T>(query: Query): T {
  const name = getFunctionName(query);
  if (name === "sales_projects:getAll") return [{ _id: "sales-project", nombre: "Proyecto de ventas" }] as T;
  if (name === "sales_transacciones:getAllWithDetails") return Array.from({ length: 88 }, (_, index) => ({ _id: `sale-${index}`, sales_proyecto: "sales-project", proyectoNombre: "Proyecto de ventas", factura: `FACTURA-${index}`, monto_total: 10000, fecha: "30/09/2026", status: "Pagado", moneda: "MXN" })) as T;
  if (name !== "partida:getById") throw new Error("Unexpected query in responsive fixture");
  return partida as T;
}
export function useQueries(requests: Record<string, { query: Query; args: { transaccion_id: string } }>) {
  const transactionIds = Object.values(requests).map(({ query, args }) => {
    if (getFunctionName(query) !== "documentos:getByTransaccion") throw new Error("Unbounded document query in payment detail");
    return args.transaccion_id;
  });
  Object.assign(window, { responsiveDocumentRequests: transactionIds });
  return Object.fromEntries(transactionIds.map((id) => [id, new URLSearchParams(window.location.search).has("document-error") ? new Error("Documento de prueba no disponible") : [{ _id: "doc-1", transaccion_id: id, nombre: "Documento bancario de prueba con nombre largo.pdf", type: "Comprobante" }]]));
}
export function useMutation() { return async () => { throw new Error("Business mutation is disabled in the responsive fixture"); }; }
