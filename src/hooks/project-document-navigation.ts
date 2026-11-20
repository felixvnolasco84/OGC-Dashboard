import { create } from "zustand";
import { Id } from "../../convex/_generated/dataModel";

export type ProjectDocumentFolderAction = "rename" | "move" | "delete";

type FolderActionRequest = {
  projectId: Id<"desarrollos">;
  folderId: Id<"document_folders">;
  action: ProjectDocumentFolderAction;
  trigger: HTMLButtonElement;
};

type ProjectDocumentNavigationStore = {
  folderId?: Id<"document_folders">;
  projectId?: Id<"desarrollos">;
  folderActionRequest?: FolderActionRequest;
  requestFolderAction: (request: FolderActionRequest) => void;
  clearFolderActionRequest: (request: FolderActionRequest) => void;
  setCurrentFolder: (
    projectId: Id<"desarrollos">,
    folderId?: Id<"document_folders">,
  ) => void;
};

export const useProjectDocumentNavigation = create<ProjectDocumentNavigationStore>((set) => ({
  folderId: undefined,
  projectId: undefined,
  folderActionRequest: undefined,
  requestFolderAction: (request) => set({ folderActionRequest: request }),
  clearFolderActionRequest: (request) => set((state) =>
    state.folderActionRequest === request ? { folderActionRequest: undefined } : state),
  setCurrentFolder: (projectId, folderId) => set({ projectId, folderId }),
}));
