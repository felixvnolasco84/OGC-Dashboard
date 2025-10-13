import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Id } from "../../convex/_generated/dataModel";

export type Desarrollo = {
    _id: Id<"desarrollos">;
    _creationTime: number;
    nombre: string;
    descripcion: string;
    image: string;
};

type DesarrolloStore = {
    selectedDesarrollo: Desarrollo | null;
    setSelectedDesarrollo: (desarrollo: Desarrollo | null) => void;
    clearSelectedDesarrollo: () => void;
};

export const useDesarrolloStore = create<DesarrolloStore>()(
    persist(
        (set) => ({
            selectedDesarrollo: null,
            setSelectedDesarrollo: (desarrollo) => set({ selectedDesarrollo: desarrollo }),
            clearSelectedDesarrollo: () => set({ selectedDesarrollo: null }),
        }),
        {
            name: "desarrollo-storage", // localStorage key
        }
    )
);
