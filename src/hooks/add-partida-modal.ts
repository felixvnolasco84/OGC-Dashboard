import { Id } from "../../convex/_generated/dataModel";
import { create } from "zustand";

type AddPartidaContext = {
    proyecto: Id<"desarrollos">;
    projectName?: string;
};

type PartidaFormData = {
    nombre: string;
    familia: string;
    sub_partida: string;
    Cantidad: number;
    PrecioUnitario: number;
    Subtotal: number;
    Iva: number;
    total: number;
    aprobado: number;
    pagado: number;
    por_liquidar: number;
    actual: number;
    fecha_carga: string;
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
    nombre: "",
    familia: "",
    sub_partida: "",
    Cantidad: 0,
    PrecioUnitario: 0,
    Subtotal: 0,
    Iva: 0,
    total: 0,
    aprobado: 0,
    pagado: 0,
    por_liquidar: 0,
    actual: 0,
    fecha_carga: new Date().toISOString().split('T')[0],
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
