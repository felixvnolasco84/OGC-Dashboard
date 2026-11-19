import { getFunctionName } from "convex/server";

const state = new URLSearchParams(location.search).get("state") || "list";
const projects = [{ _id: "sales_project_fixture_a", nombre: "Proyecto ficticio A" }, { _id: "sales_project_fixture_b", nombre: "Proyecto ficticio B" }];
const documents = [
  { _id: "document_fixture_a", _creationTime: Date.UTC(2026, 10, 19, 12), nombre: "Factura ficticia A.pdf", type: "Factura", sales_proyecto: projects[0]._id, sales_transaccion_id: "transaction_fixture_a" },
  { _id: "document_fixture_b", _creationTime: Date.UTC(2026, 10, 19, 12), nombre: "Comprobante ficticio B.pdf", type: "Comprobante", sales_proyecto: projects[1]._id, sales_transaccion_id: "transaction_fixture_b" },
];
const transactions = [
  { _id: "transaction_fixture_a", nombre_cliente: "Cliente ficticio A", factura: "FICTICIA-A" },
  { _id: "transaction_fixture_b", nombre_cliente: "Cliente ficticio B", codigo_referencia: "FICTICIA-B" },
];

export function useQuery(reference: Parameters<typeof getFunctionName>[0]) {
  const name = getFunctionName(reference);
  if (name === "sales_projects:getAll") return projects;
  if (name === "sales_documentos:getAll") return state === "loading" ? undefined : state === "empty" ? [] : documents;
  if (name === "sales_transacciones_queries:getAllWithDetails") return transactions;
  throw new Error(`Consulta no permitida en el fixture P22: ${name}`);
}

export function useMutation() {
  return async () => { throw new Error("Las mutaciones están bloqueadas en el fixture P22"); };
}
