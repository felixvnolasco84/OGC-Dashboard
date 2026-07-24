import { create } from "zustand";
import { Id } from "../../convex/_generated/dataModel";

type ProjectDocumentNavigationStore = {
  folderId?: Id<"document_folders">;
  projectId?: Id<"desarrollos">;
  setCurrentFolder: (
    projectId: Id<"desarrollos">,
    folderId?: Id<"document_folders">,
  ) => void;
};

export const useProjectDocumentNavigation = create<ProjectDocumentNavigationStore>((set) => ({
  folderId: undefined,
  projectId: undefined,
  setCurrentFolder: (projectId, folderId) => set({ projectId, folderId }),
}));
