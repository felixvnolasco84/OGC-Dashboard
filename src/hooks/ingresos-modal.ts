import { Id, Doc } from "../../convex/_generated/dataModel";
import { create } from "zustand";

export type IngresoFormData = {
  monto: number;
  fecha: string;
  descripcion: string;
  moneda: string;
  documento_adjunto: string;
  documento_nombre: string;
};

type IngresosModalContext = {
  projectId: Id<"desarrollos">;
  projectName: string;
};

type EditingIngreso = Doc<"ingresos"> | null;

type IngresosModalStore = {
  isOpen: boolean;
  context?: IngresosModalContext;
  editingIngreso: EditingIngreso;
  formData: IngresoFormData;
  
  // Modal operations
  onOpen: (context: IngresosModalContext) => void;
  onClose: () => void;
  
  // Form operations
  setFormData: (data: Partial<IngresoFormData>) => void;
  resetForm: () => void;
  
  // Edit operations
  setEditingIngreso: (ingreso: Doc<"ingresos"> | null) => void;
  startEditing: (ingreso: Doc<"ingresos">) => void;
  cancelEditing: () => void;
};

// Helper to format date as DD/MM/YYYY
const formatTodayDate = (): string => {
  const today = new Date();
  const day = String(today.getDate()).padStart(2, "0");
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const year = today.getFullYear();
  return `${day}/${month}/${year}`;
};

const defaultFormData: IngresoFormData = {
  monto: 0,
  fecha: formatTodayDate(),
  descripcion: "",
  moneda: "MXN",
  documento_adjunto: "",
  documento_nombre: "",
};

export const useIngresosModal = create<IngresosModalStore>((set) => ({
  isOpen: false,
  context: undefined,
  editingIngreso: null,
  formData: { ...defaultFormData },
  
  onOpen: (context: IngresosModalContext) => set({
    isOpen: true,
    context,
    editingIngreso: null,
    formData: { ...defaultFormData },
  }),
  
  onClose: () => set({
    isOpen: false,
    context: undefined,
    editingIngreso: null,
    formData: { ...defaultFormData },
  }),
  
  setFormData: (data: Partial<IngresoFormData>) => set((state) => ({
    formData: { ...state.formData, ...data },
  })),
  
  resetForm: () => set({
    formData: { ...defaultFormData },
    editingIngreso: null,
  }),
  
  setEditingIngreso: (ingreso: Doc<"ingresos"> | null) => set({
    editingIngreso: ingreso,
  }),
  
  startEditing: (ingreso: Doc<"ingresos">) => set({
    editingIngreso: ingreso,
    formData: {
      monto: ingreso.monto,
      fecha: ingreso.fecha,
      descripcion: ingreso.descripcion || "",
      moneda: ingreso.moneda,
      documento_adjunto: ingreso.documento_adjunto || "",
      documento_nombre: ingreso.documento_nombre || "",
    },
  }),
  
  cancelEditing: () => set({
    editingIngreso: null,
    formData: { ...defaultFormData },
  }),
}));
