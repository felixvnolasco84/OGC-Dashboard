// Real ProgramaObra with a local-only transport; writes fail immediately.
import { getFunctionName } from "convex/server";
import { useQuery as importQuery } from "./import-convex-stub";
export { useConvex, useConvexConnectionState } from "./import-convex-stub";

const params = new URLSearchParams(location.search);
const queries: { name: string; args: unknown }[] = [];
const writes: string[] = [];
Object.assign(window, { toolbarTest: { queries, writes } });

export function useQuery(reference: Parameters<typeof getFunctionName>[0], args?: any) {
  const base = importQuery(reference, args);
  if (args === "skip") return undefined;
  const name = getFunctionName(reference);
  queries.push({ name, args });
  if (params.has("no-program") && ["programa_obra:getSchedulesByProyecto", "programa_obra:getDetallesByProyecto"].includes(name)) return [];
  if (name === "desarrollos:getById") return { ...base, nombre: args.id === "other" ? "Otra obra ficticia" : "Obra ficticia · Archivo" };
  if (name === "programa_obra:getExecutionProgram") {
    return {
      ...base,
      capabilities: {
        ...base.capabilities,
        write: !params.has("viewer") && !params.has("no-write"),
        plan: !params.has("no-plan"),
      },
    };
  }
  return base;
}
export const useMutation = (reference: Parameters<typeof getFunctionName>[0]) => async () => {
  writes.push(getFunctionName(reference));
  throw new Error("P08 no debe ejecutar escrituras");
};
export const useAction = useMutation;
