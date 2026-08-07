import { create } from "zustand";
import type { Id } from "../../convex/_generated/dataModel";

type ProjectPlanNavigationStore = {
  folderId?: Id<"plano_carpetas">;
  path: string[];
  projectId?: Id<"desarrollos">;
  setCurrentLocation: (
    projectId: Id<"desarrollos">,
    folderId?: Id<"plano_carpetas">,
    path?: string[],
  ) => void;
};

export const useProjectPlanNavigation = create<ProjectPlanNavigationStore>((set) => ({
  folderId: undefined,
  path: [],
  projectId: undefined,
  setCurrentLocation: (projectId, folderId, path = []) =>
    set({ folderId, path: [...path], projectId }),
}));
