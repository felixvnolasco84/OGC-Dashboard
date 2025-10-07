import { create } from "zustand";

type AggregatedDetailsContext = {
    name: string;
    level: number;
    levelLabel: string;
    presupuestoOriginal: number;
    presupuestoAprobado: number;
    pagado: number;
    avance: number;
};

type AggregatedDetailsStore = {
    context?: AggregatedDetailsContext;
    isOpen: boolean;
    onOpen: (context: AggregatedDetailsContext) => void;
    onClose: () => void;
};

export const useAggregatedDetailsModal = create<AggregatedDetailsStore>((set) => ({
    isOpen: false,
    onOpen: (context: AggregatedDetailsContext) => set({ isOpen: true, context }),
    onClose: () => set({ isOpen: false, context: undefined }),
}));
