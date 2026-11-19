import { getFunctionName } from "convex/server";
import * as documents from "../document-row-actions/convex-stub";
import * as budget from "../budget-creation/convex-stub";

// All persistence stays in memory. The entries render the production components.
const isDocument = location.pathname.includes("document-row-actions");
const isBudget = location.pathname.includes("budget-creation");
const calls: { name: string; args: unknown }[] = [];
Object.assign(window, { footerProviderCalls: calls });
export function useQuery(ref: any, args?: any): any {
  if (isDocument) return documents.useQuery(ref, args);
  if (isBudget) return budget.useQuery(ref, args);
  if (getFunctionName(ref) === "users:getCurrentUser") return { role: new URLSearchParams(location.search).has("viewer") ? "viewer" : "admin" };
  throw new Error(`Unexpected P23 query: ${getFunctionName(ref)}`);
}
export function useMutation(ref: any): any {
  if (isDocument) return documents.useMutation(ref);
  if (isBudget) return budget.useMutation(ref);
  return async (args: unknown) => {
    calls.push({ name: getFunctionName(ref), args });
    await new Promise(resolve => setTimeout(resolve, 900));
    return "provider-test";
  };
}
export const useAction = budget.useAction;
export const useConvex = budget.useConvex;
