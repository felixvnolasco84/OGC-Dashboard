import { Doc } from "../../convex/_generated/dataModel";
import { create } from "zustand";

type ManageCostContext = {
    cost?: Doc<"partidas">; // Optional - for editing existing cost
    mode: "create" | "edit";
};

type CostFormData = {
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

type ManageCostModalStore = {
    context?: ManageCostContext;
    formData: CostFormData;
    isOpen: boolean;
    onOpen: (context: ManageCostContext) => void;
    onClose: () => void;
    updateFormData: (data: Partial<CostFormData>) => void;
    resetForm: () => void;
};

const initialFormData: CostFormData = {
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

export const useManageCostModal = create<ManageCostModalStore>((set) => ({
    isOpen: false,
    formData: initialFormData,
    onOpen: (context: ManageCostContext) => {
        // If editing, pre-fill form with existing cost data
        if (context.mode === "edit" && context.cost) {
            set({
                isOpen: true,
                context,
                formData: {
                    ...initialFormData,
                    partida: context.cost.nombre,
                    familia: context.cost.familia,
                    sub_partida: context.cost.sub_partida,
                    monto: context.cost.Cantidad,
                    fecha_pago: context.cost.fecha_carga,
                    factura: context.cost.archivo_origen,
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
    updateFormData: (data: Partial<CostFormData>) => set((state) => ({
        formData: { ...state.formData, ...data }
    })),
    resetForm: () => set({ formData: initialFormData }),
}));