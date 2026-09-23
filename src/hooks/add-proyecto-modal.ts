import { create } from "zustand";
import type { ProjectLocation } from "@/lib/project-locations";

type ProyectoFormData = {
  nombre: string;
  descripcion: string;
  excel: File | null;
  honorarios_porcentaje: number;
  ubicacion?: ProjectLocation;
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
  ubicacion: undefined,
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
