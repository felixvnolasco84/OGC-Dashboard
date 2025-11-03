import { create } from "zustand";

type ProyectoFormData = {
  nombre: string;
  descripcion: string;
  excel: File | null;
  honorarios_porcentaje: number;
};

type AddProyectoModalStore = {
  formData: ProyectoFormData;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  updateFormData: (data: Partial<ProyectoFormData>) => void;
  resetForm: () => void;
};

const initialFormData: ProyectoFormData = {
  nombre: "",
  descripcion: "",
  excel: null,
  honorarios_porcentaje: 0,
};

export const useAddProyectoModal = create<AddProyectoModalStore>((set) => ({
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
  updateFormData: (data: Partial<ProyectoFormData>) => set((state) => ({
    formData: { ...state.formData, ...data }
  })),
  resetForm: () => set({ formData: initialFormData }),
}));
