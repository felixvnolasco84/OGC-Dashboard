import { create } from "zustand";
import { Id } from "../../convex/_generated/dataModel";

type SalesProjectFormData = {
  nombre: string;
  descripcion: string;
  status: string;
  comision_porcentaje: number;
};

type EditSalesProjectModalStore = {
  projectId: Id<"sales_projects"> | null;
  formData: SalesProjectFormData;
  isOpen: boolean;
  onOpen: (projectId: Id<"sales_projects">) => void;
  onClose: () => void;
  updateFormData: (data: Partial<SalesProjectFormData>) => void;
  resetForm: () => void;
};

const initialFormData: SalesProjectFormData = {
  nombre: "",
  descripcion: "",
  status: "Activo",
  comision_porcentaje: 0,
};

export const useEditSalesProjectModal = create<EditSalesProjectModalStore>((set) => ({
  isOpen: false,
  projectId: null,
  formData: initialFormData,
  onOpen: (projectId: Id<"sales_projects">) => set({
    isOpen: true,
    projectId,
    formData: { ...initialFormData }
  }),
  onClose: () => set({
    isOpen: false,
    projectId: null,
    formData: initialFormData
  }),
  updateFormData: (data: Partial<SalesProjectFormData>) => set((state) => ({
    formData: { ...state.formData, ...data }
  })),
  resetForm: () => set({ formData: initialFormData }),
}));
