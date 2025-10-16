import { Id } from "../../convex/_generated/dataModel";
import { create } from "zustand";

type AddPartidaContext = {
    proyecto: Id<"desarrollos">;
    projectName?: string;
};

type PartidaFormData = {
    nivel: number;
    nombre: string;
    familia: string;
    sub_partida: string;
    unidad: string;
    partida_nombre: string;
    cantidad: number;
    precio_unitario: number;        
    presupuesto_original: number; 
    presupuesto_aprobado: number; 
    pagado: number; 
    archivo_origen: string;
};

type AddPartidaModalStore = {
    partidaContext?: AddPartidaContext;
    formData: PartidaFormData;
    isOpen: boolean;
    onOpen: (context: AddPartidaContext) => void;
    onClose: () => void;
    updateFormData: (data: Partial<PartidaFormData>) => void;
    resetForm: () => void;
};

const initialFormData: PartidaFormData = {
    nivel: 1,
    nombre: "",
    familia: "",
    sub_partida: "",
    unidad: "",
    partida_nombre: "",
    cantidad: 0,
    precio_unitario: 0,        
    presupuesto_original: 0, 
    presupuesto_aprobado: 0, 
    pagado: 0, 
    archivo_origen: "",
};

export const useAddPartidaModal = create<AddPartidaModalStore>((set) => ({
    isOpen: false,
    formData: initialFormData,
    onOpen: (partidaContext: AddPartidaContext) => set({
        isOpen: true,
        partidaContext,
        formData: { ...initialFormData }
    }),
    onClose: () => set({
        isOpen: false,
        partidaContext: undefined,
        formData: initialFormData
    }),
    updateFormData: (data: Partial<PartidaFormData>) => set((state) => ({
        formData: { ...state.formData, ...data }
    })),
    resetForm: () => set({ formData: initialFormData }),
}));
