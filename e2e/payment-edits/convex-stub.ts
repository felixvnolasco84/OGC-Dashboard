import { useMemo, useSyncExternalStore } from "react";
import { getFunctionName } from "convex/server";
const scenario = new URLSearchParams(location.search).get("case");
let version = 0;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const recorded = { mutations: [] as unknown[] };
Object.assign(window, { paymentEditRecorded: recorded });
window.addEventListener("payment-edit-change", () => { version++; listeners.forEach(l => l()); });
const transaction = { _id: "tx", _creationTime: 0, proyecto: "project", proveedor_id: "provider", monto_total: 1000, concepto_adicional: "Entrega original",
  fecha: "05/10/2026", tipo_pago: "TRANSFERENCIA", moneda: "MXN", tipo_cambio: "1", status: "Pagado", banco: "Banco histórico", numero_cuenta: "0012345678" };
const partida = { _id: "leaf", nombre: "OBRA", partida_nombre: "OBRA", nivel: 3, familia: "ACERO", sub_partida: "VARILLA", proyecto: "project" };
const items = [ { _id: "a", _creationTime: 0, transaccion_id: "tx", partida_id: "leaf", monto: 300, concepto_adicional: "Entrega original", label: "OBRA › ACERO › VARILLA", partida },
  { _id: "b", _creationTime: 0, transaccion_id: "tx", partida_id: "root", monto: 700, concepto_adicional: undefined as string | undefined, label: "OBRA › CONCRETO", partida: { ...partida, _id: "root", nivel: 1, familia: "", sub_partida: "" } } ];
export const initial = { transaction, lineItems: items, source: "source-0" };
let recoveredContext: typeof initial | undefined;
const bankDefaults = { payment_account_id: undefined, clabe: undefined, codigo_referencia: undefined, factura: undefined, comprobante: undefined, categoria: undefined };
function review(args: any) {
  if (scenario === "preview-error") return { status: "error", message: "No se pudo consultar el impacto. Conservamos tu borrador." };
  if (args.expectedSource !== `source-${version}`) return { status: "conflict", message: "La transacción cambió" };
  const before = { ...bankDefaults, ...transaction, codigo_referencia: version ? "Cambio externo" : undefined };
  const concepts = items.map(p => ({ id: p._id, label: p.label, before: p.monto, after: args.amounts.find((a: any) => a.id === p._id)?.monto ?? p.monto }));
  const after = { ...before, ...args.fields, monto_total: concepts.reduce((sum, p) => sum + p.after, 0) };
  const paid = after.status === "Pagado";
  const budget = (total: number, eligible: boolean) => ({ presupuesto_original: 4000, presupuesto_aprobado: 4000,
    gasto_total: (eligible ? total * 1.05 : 0) + total * .1, por_gastar: 4000 - ((eligible ? total * 1.05 : 0) + total * .1), honorarios: total * .1, indirectos: eligible ? total * .05 : 0, manualesSustituidos: 0 });
  const pnl = (t: typeof transaction) => ({ totalPagado: t.status === "Pagado" ? t.monto_total : 0, honorarios: t.status === "Pagado" ? t.monto_total * .1 : 0,
    indirectos: t.status === "Pagado" ? t.monto_total * .05 : 0, costosDirectosObra: t.status === "Pagado" ? t.monto_total : 0, monthly: t.status === "Pagado" ? { "2026-10": { honorarios: t.monto_total * .1, indirectos: t.monto_total * .05, costosDirectosObra: t.monto_total } } : {} });
  return { status: "ready", expectedScope: JSON.stringify([args, version]), source: args.expectedSource, before, after, concepts,
    hasChanges: args.amounts.length > 0 || Object.keys(args.fields).length > 0,
    hierarchy: [{ id: "root", label: "OBRA", pagadoBefore: 1000, pagadoAfter: paid ? after.monto_total : 0, remainingBefore: 1000, remainingAfter: 2000 - (paid ? after.monto_total : 0) }],
    beforeBudget: budget(1000, true), afterBudget: budget(after.monto_total, paid), beforeBudgetCurrency: "MXN", afterBudgetCurrency: "MXN",
    beforePnl: pnl(before), afterPnl: pnl(after), invoiceCount: 1, providerBefore: "Proveedor de prueba", providerAfter: "Proveedor de prueba", rateBefore: 1, rateAfter: 1, warnings: [] };
}
export function useQuery(query: any, args: any) {
  const state = useSyncExternalStore(subscribe, () => version);
  const name = getFunctionName(query), key = JSON.stringify(args);
  return useMemo(() => {
    if (args === "skip") return undefined;
    if (name === "transacciones:getEditContext") return scenario === "denied" ? { status: "error", message: "No tienes permiso para editar esta transacción." }
      : { status: "ready", context: { ...initial, transaction: { ...transaction, codigo_referencia: state ? "Cambio externo" : undefined }, source: `source-${state}` } };
    if (name === "transacciones:previewEdit") return review(args);
    if (name === "users:getCurrentUser") return { _id: "writer", role: "admin" };
    if (name === "partida:getByProject") return [
      { ...partida, _id: "root", nivel: 1, familia: "", sub_partida: "" },
      { ...partida, _id: "family", nivel: 2, sub_partida: "" }, partida,
      { ...partida, _id: "family-direct", nivel: 2, familia: "CONCRETO", sub_partida: "" },
    ];
    if (name === "transacciones:getTransactionConceptosById") return { ...transaction, lineItems: items };
    if (name === "proveedores:getAll") return [{ _id: "provider", razon_social: "Proveedor de prueba", rfc: "TEST010101AAA" }];
    if (name === "paymentAccounts:permissions") return { canWrite: true, canReview: false };
    if (name.startsWith("paymentAccounts:")) return [];
    throw new Error(`Unexpected query: ${name}`);
  }, [name, key, state]);
}
export function useMutation(query: any) {
  return async (args: any) => {
    recorded.mutations.push({ name: getFunctionName(query), args });
    await new Promise(resolve => setTimeout(resolve, 120));
    if (getFunctionName(query) === "transacciones:createTransaction") return { transaccionId: "new-tx", pagoIds: ["new-payment"] };
    if (scenario === "save-error") throw new Error("No se pudo guardar: la cuenta dejó de estar disponible.");
    if (scenario === "lost-response" || scenario === "lost-response-drift") {
      const saved = review(args);
      recoveredContext = { ...initial, transaction: { ...saved.after, ...(scenario === "lost-response-drift" ? { banco: "Cambio posterior" } : {}) },
        lineItems: items.map(p => ({ ...p, monto: saved.concepts.find((c: any) => c.id === p._id).after })) };
      throw new Error("Se perdió la respuesta de guardado. Tu borrador se conserva.");
    }
    return { id: "tx", changed: true };
  };
}
export function useConvex() { return { query: async () => ({ status: "ready", context: recoveredContext || initial }) }; }
export function useConvexAuth() { return { isAuthenticated: true, isLoading: false }; }
