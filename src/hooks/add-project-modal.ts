import { create } from "zustand";

type ProjectFormData = {
    nombre: string;
    descripcion: string;
    excel: File | null;
};

type AddProjectModalStore = {
    formData: ProjectFormData;
    isOpen: boolean;
    onOpen: () => void;
    onClose: () => void;
    updateFormData: (data: Partial<ProjectFormData>) => void;
    resetForm: () => void;
};

const initialFormData: ProjectFormData = {
    nombre: "",
    descripcion: "",
    excel: null,
};

export const useAddProjectModal = create<AddProjectModalStore>((set) => ({
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
    updateFormData: (data: Partial<ProjectFormData>) => set((state) => ({
        formData: { ...state.formData, ...data }
    })),
    resetForm: () => set({ formData: initialFormData }),
}));
