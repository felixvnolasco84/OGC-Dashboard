import { create } from "zustand";
import { Id } from "../../convex/_generated/dataModel";

type UploadProyectoDocumentsModalOptions = {
    files?: File[];
    folderId?: Id<"document_folders">;
    transactionId?: Id<"transacciones">;
};

interface UploadProyectoDocumentsModalStore {
    isOpen: boolean;
    proyectoId?: Id<"desarrollos">;
    transactionId?: Id<"transacciones">;
    folderId?: Id<"document_folders">;
    initialFiles: File[];
    onOpen: (
        proyectoId: Id<"desarrollos">,
        options?: UploadProyectoDocumentsModalOptions,
    ) => void;
    onClose: () => void;
}

export const useUploadProyectoDocumentsModal = create<UploadProyectoDocumentsModalStore>((set) => ({
    isOpen: false,
    proyectoId: undefined,
    transactionId: undefined,
    folderId: undefined,
    initialFiles: [],
    onOpen: (proyectoId, options = {}) => set({
        isOpen: true,
        proyectoId,
        transactionId: options.transactionId,
        folderId: options.folderId,
        initialFiles: options.files || [],
    }),
    onClose: () => set({
        isOpen: false,
        proyectoId: undefined,
        transactionId: undefined,
        folderId: undefined,
        initialFiles: [],
    }),
}));
