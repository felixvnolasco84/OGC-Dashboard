import { create } from "zustand";
import { Id } from "../../convex/_generated/dataModel";

interface UploadDocumentsModalStore {
    isOpen: boolean;
    transactionId?: Id<"transacciones">;
    projectId?: Id<"desarrollos">;
    onOpen: (data?: { transactionId?: Id<"transacciones">; projectId?: Id<"desarrollos"> }) => void;
    onClose: () => void;
}

export const useUploadDocumentsModal = create<UploadDocumentsModalStore>((set) => ({
    isOpen: false,
    transactionId: undefined,
    projectId: undefined,
    onOpen: (data) => set({ 
        isOpen: true, 
        transactionId: data?.transactionId, 
        projectId: data?.projectId 
    }),
    onClose: () => set({ isOpen: false, transactionId: undefined, projectId: undefined }),
}));
