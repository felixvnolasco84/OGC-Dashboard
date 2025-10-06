import { Doc } from "../../convex/_generated/dataModel";
import { create } from "zustand";

type ManagePartidaContext = {
    partida?: Doc<"partidas">; // Optional - for editing existing cost
    mode: "create" | "edit";
};

type PartidaFormData = {
    // Payment status
    paymentStatus: "pagado" | "por_pagar";

    // Cost details
    partida: string;
    familia: string;
    sub_partida: string;
    categoria: string; // anticipo, material, estimación

    // Payment details
    tipo_pago: string;
    moneda: string;
    monto: string;
    fecha_pago: string;

    // File uploads (URLs from EdgeStore)
    factura: string;
    comprobante: string;
    presupuesto: string;

    // Description
    descripcion: string;

    // Additional fields from schema
    administracion: string;
    codigo_referencia: string;
};

type ManagePartidaModalStore = {
    context?: ManagePartidaContext;
    formData: PartidaFormData;
    isOpen: boolean;
    onOpen: (context: ManagePartidaContext) => void;
    onClose: () => void;
    updateFormData: (data: Partial<PartidaFormData>) => void;
    resetForm: () => void;
};

const initialFormData: PartidaFormData = {
    paymentStatus: "por_pagar",
    partida: "",
    familia: "",
    sub_partida: "",
    categoria: "",
    tipo_pago: "efectivo",
    moneda: "MXN",
    monto: "",
    fecha_pago: new Date().toISOString().split('T')[0],
    factura: "",
    comprobante: "",
    presupuesto: "",
    descripcion: "",
    administracion: "",
    codigo_referencia: "",
};

export const useManagePartidaModal = create<ManagePartidaModalStore>((set) => ({
    isOpen: false,
    formData: initialFormData,
    onOpen: (context: ManagePartidaContext) => {
        // If editing, pre-fill form with existing cost data
        if (context.mode === "edit" && context.partida) {
            set({
                isOpen: true,
                context,
                formData: {
                    ...initialFormData,
                    partida: context.partida.nombre,
                    familia: context.partida.familia,
                    sub_partida: context.partida.sub_partida,
                    monto: context.partida.Cantidad,
                    fecha_pago: context.partida.fecha_carga,
                    factura: context.partida.archivo_origen,
                }
            });
        } else {
            set({
                isOpen: true,
                context,
                formData: { ...initialFormData }
            });
        }
    },
    onClose: () => set({
        isOpen: false,
        context: undefined,
        formData: initialFormData
    }),
    updateFormData: (data: Partial<PartidaFormData>) => set((state) => ({
        formData: { ...state.formData, ...data }
    })),
    resetForm: () => set({ formData: initialFormData }),
}));