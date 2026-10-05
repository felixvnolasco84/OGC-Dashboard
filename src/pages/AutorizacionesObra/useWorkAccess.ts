import { useCallback } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReference, OptionalRestArgs } from "convex/server";
import { api } from "../../../convex/_generated/api";

export function useWorkAccess() {
  const user = useQuery(api.users.getCurrentUser);
  return user?.role === "admin";
}

export function useWorkMutation<Mutation extends FunctionReference<"mutation">>(reference: Mutation) {
  const mutate = useMutation(reference);
  const canManage = useWorkAccess();
  return useCallback((...args: OptionalRestArgs<Mutation>) => {
    if (!canManage) return Promise.reject(new Error("Solo admin puede realizar esta acción."));
    return mutate(...args);
  }, [canManage, mutate]);
}
