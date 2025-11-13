import { create } from "zustand";

type SalesProjectFormData = {
  nombre: string;
  descripcion: string;
  comision_porcentaje: number;
  excel: File | null;
};

type AddSalesProjectModalStore = {
  formData: SalesProjectFormData;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  updateFormData: (data: Partial<SalesProjectFormData>) => void;
  resetForm: () => void;
};

const initialFormData: SalesProjectFormData = {
  nombre: "",
  descripcion: "",
  comision_porcentaje: 0,
  excel: null,
};

export const useAddSalesProjectModal = create<AddSalesProjectModalStore>((set) => ({
  isOpen: false,
  formData: initialFormData,
  onOpen: () => set({
    isOpen: true,
    formData: { ...initialFormData }
  }),
  onClose: () => set({
    isOpen: false,
    formData: initialFormData
  }),
  updateFormData: (data: Partial<SalesProjectFormData>) => set((state) => ({
    formData: { ...state.formData, ...data }
  })),
  resetForm: () => set({ formData: initialFormData }),
}));
