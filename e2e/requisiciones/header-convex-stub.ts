import { useSyncExternalStore } from "react";
import { getFunctionName } from "convex/server";
import { useQuery as baseQuery } from "./convex-stub";
export { useAction, useMutation } from "./convex-stub";

const params = new URLSearchParams(location.search);
let scenario = { role: params.get("role") || "admin", unread: params.get("unread") || "positive" };
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const updateHeaderFixture = (update: Partial<typeof scenario>) => {
    scenario = { ...scenario, ...update };
    listeners.forEach(listener => listener());
};
export function useHeaderFixture() {
    return useSyncExternalStore(subscribe, () => scenario);
}

export function useQuery(reference: Parameters<typeof getFunctionName>[0], args?: unknown) {
    const fixture = useHeaderFixture();
    const name = getFunctionName(reference);
    // These query references stay constant at their call sites, including when skipped.
    switch (name) {
        case "users:getCurrentUser": return args === "skip" ? undefined : { _id: "current", name: "Usuario de prueba", role: fixture.role };
        case "desarrollos:getById": {
            const id = (args as { id?: string })?.id;
            return args === "skip" ? undefined : { _id: id, nombre: id === "project-b" ? "Proyecto B" : "Proyecto A" };
        }
        case "requisicion_history:getUnreadRequisiciones":
            if (args === "skip" || fixture.unread === "loading") return undefined;
            if (fixture.unread === "zero" || (args as { proyecto: string }).proyecto === "project-b") return {};
            return fixture.unread === "single" ? { pending: 1 } : { pending: 3, paid: 2 };
        case "requisicion_history:getRecentWithDetails":
            return args === "skip" ? undefined : [{
                _id: "header-history", proyecto: (args as { proyecto: string }).proyecto, requisicion_id: "pending",
                action: "updated", changed_by_id: "current", changed_by_name: `Historial global ${(args as { proyecto: string }).proyecto}`,
                created_at: Date.now(), field_changed: "descripcion", old_value: "Antes", new_value: "Después",
            }];
        case "requisicion_history:getByRequisicion": return args === "skip" ? undefined : [];
        default: return baseQuery(reference, args);
    }
}
