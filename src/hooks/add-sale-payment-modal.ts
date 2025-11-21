import { Id, Doc } from "../../convex/_generated/dataModel";
import { create } from "zustand";

type AddPaymentContext = {
    projectId: Id<"sales_projects">;
    relatedPartida?: Doc<"sales_partidas">; // Optional: auto-prefill based on nivel
};

// Hierarchical structure: Partida -> Familia -> SubPartida
export type SubPartidaItem = {
    id: string;
    partida_id: Id<"sales_partidas"> | "";
    sub_partida: string;
    monto: number;
};

export type FamiliaItem = {
    id: string;
    familia: string;
    subPartidas: SubPartidaItem[];
    isExpanded: boolean;
    isDirect: boolean; // True if familia has no sub-partidas and is a direct payment
    monto?: number; // For direct payments
    partida_id?: Id<"sales_partidas"> | ""; // For direct payments
};

export type PartidaItem = {
    id: string;
    partida: string;
    familias: FamiliaItem[];
    isExpanded: boolean;
};

type AddPaymentModalStore = {
    paymentContext?: AddPaymentContext;
    partidas: PartidaItem[];
    isOpen: boolean;
    onOpen: (context: AddPaymentContext) => void;
    onClose: () => void;
    
    // Partida operations
    addPartida: () => void;
    removePartida: (partidaId: string) => void;
    updatePartida: (partidaId: string, partida: string) => void;
    togglePartidaExpanded: (partidaId: string) => void;
    
    // Familia operations
    addFamilia: (partidaId: string) => void;
    removeFamilia: (partidaId: string, familiaId: string) => void;
    updateFamilia: (partidaId: string, familiaId: string, familia: string) => void;
    toggleFamiliaExpanded: (partidaId: string, familiaId: string) => void;
    toggleFamiliaDirect: (partidaId: string, familiaId: string) => void;
    updateFamiliaDirectPayment: (partidaId: string, familiaId: string, data: { monto?: number; partida_id?: Id<"sales_partidas"> | "" }) => void;
    
    // SubPartida operations
    addSubPartida: (partidaId: string, familiaId: string) => void;
    removeSubPartida: (partidaId: string, familiaId: string, subPartidaId: string) => void;
    updateSubPartida: (partidaId: string, familiaId: string, subPartidaId: string, data: Partial<SubPartidaItem>) => void;
    
    resetForm: () => void;
};

const createEmptySubPartida = (): SubPartidaItem => ({
    id: Date.now().toString() + Math.random(),
    partida_id: "",
    sub_partida: "",
    monto: 0,
});

const createEmptyFamilia = (): FamiliaItem => ({
    id: Date.now().toString() + Math.random(),
    familia: "",
    subPartidas: [createEmptySubPartida()],
    isExpanded: true,
    isDirect: false,
    monto: 0,
    partida_id: "",
});

const createEmptyPartida = (): PartidaItem => ({
    id: Date.now().toString() + Math.random(),
    partida: "",
    familias: [createEmptyFamilia()],
    isExpanded: true,
});

export const useAddPaymentModal = create<AddPaymentModalStore>((set) => ({
    isOpen: false,
    partidas: [createEmptyPartida()],
    
    onOpen: (paymentContext: AddPaymentContext) => set({
        isOpen: true,
        paymentContext,
        partidas: [createEmptyPartida()]
    }),
    
    onClose: () => set({
        isOpen: false,
        paymentContext: undefined,
        partidas: [createEmptyPartida()]
    }),
    
    // Partida operations
    addPartida: () => set((state) => ({
        partidas: [...state.partidas, createEmptyPartida()]
    })),
    
    removePartida: (partidaId: string) => set((state) => ({
        partidas: state.partidas.filter(p => p.id !== partidaId)
    })),
    
    updatePartida: (partidaId: string, partida: string) => set((state) => ({
        partidas: state.partidas.map(p => 
            p.id === partidaId ? { ...p, partida } : p
        )
    })),
    
    togglePartidaExpanded: (partidaId: string) => set((state) => ({
        partidas: state.partidas.map(p => 
            p.id === partidaId ? { ...p, isExpanded: !p.isExpanded } : p
        )
    })),
    
    // Familia operations
    addFamilia: (partidaId: string) => set((state) => ({
        partidas: state.partidas.map(p => 
            p.id === partidaId 
                ? { ...p, familias: [...p.familias, createEmptyFamilia()] }
                : p
        )
    })),
    
    removeFamilia: (partidaId: string, familiaId: string) => set((state) => ({
        partidas: state.partidas.map(p => 
            p.id === partidaId 
                ? { ...p, familias: p.familias.filter(f => f.id !== familiaId) }
                : p
        )
    })),
    
    updateFamilia: (partidaId: string, familiaId: string, familia: string) => set((state) => ({
        partidas: state.partidas.map(p => 
            p.id === partidaId 
                ? {
                    ...p,
                    familias: p.familias.map(f => 
                        f.id === familiaId ? { ...f, familia } : f
                    )
                }
                : p
        )
    })),
    
    toggleFamiliaExpanded: (partidaId: string, familiaId: string) => set((state) => ({
        partidas: state.partidas.map(p => 
            p.id === partidaId 
                ? {
                    ...p,
                    familias: p.familias.map(f => 
                        f.id === familiaId ? { ...f, isExpanded: !f.isExpanded } : f
                    )
                }
                : p
        )
    })),
    
    toggleFamiliaDirect: (partidaId: string, familiaId: string) => set((state) => ({
        partidas: state.partidas.map(p => 
            p.id === partidaId 
                ? {
                    ...p,
                    familias: p.familias.map(f => 
                        f.id === familiaId ? { ...f, isDirect: !f.isDirect } : f
                    )
                }
                : p
        )
    })),
    
    updateFamiliaDirectPayment: (partidaId: string, familiaId: string, data: { monto?: number; partida_id?: Id<"sales_partidas"> | "" }) => set((state) => ({
        partidas: state.partidas.map(p => 
            p.id === partidaId 
                ? {
                    ...p,
                    familias: p.familias.map(f => 
                        f.id === familiaId ? { ...f, ...data } : f
                    )
                }
                : p
        )
    })),
    
    // SubPartida operations
    addSubPartida: (partidaId: string, familiaId: string) => set((state) => ({
        partidas: state.partidas.map(p => 
            p.id === partidaId 
                ? {
                    ...p,
                    familias: p.familias.map(f => 
                        f.id === familiaId 
                            ? { ...f, subPartidas: [...f.subPartidas, createEmptySubPartida()] }
                            : f
                    )
                }
                : p
        )
    })),
    
    removeSubPartida: (partidaId: string, familiaId: string, subPartidaId: string) => set((state) => ({
        partidas: state.partidas.map(p => 
            p.id === partidaId 
                ? {
                    ...p,
                    familias: p.familias.map(f => 
                        f.id === familiaId 
                            ? { ...f, subPartidas: f.subPartidas.filter(sp => sp.id !== subPartidaId) }
                            : f
                    )
                }
                : p
        )
    })),
    
    updateSubPartida: (partidaId: string, familiaId: string, subPartidaId: string, data: Partial<SubPartidaItem>) => set((state) => ({
        partidas: state.partidas.map(p => 
            p.id === partidaId 
                ? {
                    ...p,
                    familias: p.familias.map(f => 
                        f.id === familiaId 
                            ? {
                                ...f,
                                subPartidas: f.subPartidas.map(sp => 
                                    sp.id === subPartidaId ? { ...sp, ...data } : sp
                                )
                            }
                            : f
                    )
                }
                : p
        )
    })),
    
    resetForm: () => set({ partidas: [createEmptyPartida()] }),
}));
