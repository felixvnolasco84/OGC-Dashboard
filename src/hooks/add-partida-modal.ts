import { Id } from "../../convex/_generated/dataModel";
import { create } from "zustand";

type AddPartidaContext = {
    proyecto: Id<"desarrollos">;
    projectName?: string;
};

type AddPartidaModalStore = {
    partidaContext?: AddPartidaContext;
    isOpen: boolean;
    onOpen: (context: AddPartidaContext) => void;
    onClose: () => void;
};

export const useAddPartidaModal = create<AddPartidaModalStore>((set) => ({
    isOpen: false,
    onOpen: (partidaContext: AddPartidaContext) =>
        set({
            isOpen: true,
            partidaContext,
        }),
    onClose: () =>
        set({
            isOpen: false,
            partidaContext: undefined,
        }),
}));
