import { getFunctionName } from "convex/server";
// Test-only transport: the production application never imports this module.
export function useMutation(reference: Parameters<typeof getFunctionName>[0]) {
  return async (args: unknown) => {
    const state = window as unknown as { recordedMutations: unknown[] };
    state.recordedMutations ??= [];
    state.recordedMutations.push({ name: getFunctionName(reference), args });
  };
}
export function useQuery(reference: Parameters<typeof getFunctionName>[0], args?: unknown) {
  if (args === "skip") return undefined;
  const name = getFunctionName(reference);
  if (name.endsWith("getCurrentUser")) return { _id: "supervisor", name: "Supervisor" };
  if (name.endsWith("getExecutionHistory")) return { events: [], legacy: [] };
  if (name.endsWith("previewExcelImport")) {
    const input = args as { rows: { partida: string; familia?: string; detalle_id?: string }[] };
    return { rows: input.rows.map((r, index) => ({ index, name: `${r.partida} / ${r.familia}`, status: r.detalle_id ? "update" : "create", issues: [] })), warnings: [], absent: [], proposal: null, canApply: true, fingerprint: "test-preview" };
  }
  return [];
}
