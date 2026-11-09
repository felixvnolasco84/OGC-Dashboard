import { useSyncExternalStore } from "react";
import { getFunctionName } from "convex/server";

let version = 0;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const publish = () => { version++; listeners.forEach(listener => listener()); };
const finance = new URLSearchParams(location.search).get("role") === "finance";
let projectEnabled = false;
let user = { _id: "user", _creationTime: 1, clerkId: "user", email: "usuario@example.test", name: "Responsable de obra", role: "user", allowed_desarrollos: [], created_at: 1, whatsapp_phone: "", whatsapp_enabled: false, whatsapp_consent_at: undefined as number | undefined, whatsapp_consent_by: undefined as string | undefined };
const state = window as unknown as { whatsappMutations: Array<{ name: string; args: Record<string, unknown> }> };
state.whatsappMutations = [];
export function useQuery(reference: Parameters<typeof getFunctionName>[0]) {
  useSyncExternalStore(subscribe, () => version);
  switch (getFunctionName(reference)) {
    case "users:getCurrentUser": return user;
    case "whatsapp:projectSettings": return { enabled: projectEnabled, can_manage: !finance };
    default: throw new Error("Consulta inesperada");
  }
}
export function useMutation(reference: Parameters<typeof getFunctionName>[0]) {
  return async (args: Record<string, unknown>) => {
    const name = getFunctionName(reference); state.whatsappMutations.push({ name, args });
    if (name === "whatsapp:setProjectEnabled") projectEnabled = args.enabled === true;
    else if (name === "whatsapp:saveContact") user = { ...user, whatsapp_phone: String(args.phone), whatsapp_enabled: args.enabled === true, whatsapp_consent_at: args.confirm_consent ? Date.now() : user.whatsapp_consent_at, whatsapp_consent_by: args.confirm_consent ? "admin" : user.whatsapp_consent_by };
    else throw new Error("Mutación inesperada");
    publish();
  };
}
