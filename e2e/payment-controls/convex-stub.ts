import { useSyncExternalStore } from "react";
import { getFunctionName } from "convex/server";

const scenario = new URLSearchParams(location.search);
const listeners = new Set<() => void>();
export const recorded: { name: string; args: any }[] = [];
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const useMutationCount = () => useSyncExternalStore(subscribe, () => recorded.length);
const partida = { proyecto: "fixture-project", partida_nombre: "OBRA", nombre: "OBRA", familia: "", sub_partida: "" };
const partidas = [
  { ...partida, _id: "root", nivel: 1 },
  { ...partida, _id: "steel", nivel: 2, familia: "ACERO" },
  { ...partida, _id: "leaf", nivel: 3, familia: "ACERO", sub_partida: "VARILLA" },
  { ...partida, _id: "direct", nivel: 2, familia: "CONCRETO" },
];
const providers = [{ _id: "fixture-provider", razon_social: "Proveedor ficticio P04", rfc: "TEST010101AAA" }];
const currentUser = { _id: "fixture-user", role: scenario.get("role") || "admin" };

export function useQuery(query: any, args: any) {
  if (args === "skip") return undefined;
  const name = getFunctionName(query);
  if (name === "users:getCurrentUser") return currentUser;
  if (name === "partida:getByProject") return scenario.has("loading") ? undefined : partidas;
  if (name === "proveedores:getAll") return providers;
  if (name === "paymentAccounts:permissions") return { canWrite: false, canReview: false };
  if (name.startsWith("paymentAccounts:")) return [];
  throw new Error(`Unexpected fixture query: ${name}`);
}

export function useMutation(query: any) {
  return async (args: any) => {
    const name = getFunctionName(query);
    recorded.push({ name, args });
    listeners.forEach(listener => listener());
    if (name === "transacciones:createTransaction") {
      if (scenario.has("busy")) await new Promise(resolve => setTimeout(resolve, 15000));
      return { transaccionId: "fixture-transaction", pagoIds: args.lineItems.map((_: any, index: number) => `fixture-payment-${index}`) };
    }
    if (name === "documentos:generateUploadUrl") return `${location.origin}/__p04_mock_upload`;
    if (name === "documentos:createWithStorage") {
      await new Promise(resolve => setTimeout(resolve, 15000));
      return "fixture-document";
    }
    throw new Error(`Unexpected fixture mutation: ${name}`);
  };
}
export function useConvexAuth() { return { isAuthenticated: true, isLoading: false }; }
