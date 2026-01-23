import { Id } from "../../convex/_generated/dataModel";
import { create } from "zustand";

export type RequisicionItem = {
    id: string;
    partida_id: Id<"partidas"> | "";
    partida_nombre: string;
    familia: string;
    sub_partida: string; // Can be from budget or custom text
    cantidad: number;
    unidad: string;
    precio_unitario?: number; // Price per unit for custom items
    monto?: number; // Total = cantidad × precio_unitario (auto-calculated for custom items)
    isCustomItem?: boolean; // True when item is not from budget (no sub-partidas exist)
    // Budget info for display
    presupuesto_aprobado?: number;
    pagado?: number;
    por_gastar?: number;
};

export type RequisicionModalMode = "create" | "edit" | "view";

type RequisicionContext = {
    projectId: Id<"desarrollos">;
    requisicionId?: Id<"requisiciones">; // For edit/view modes
};

type RequisicionModalStore = {
    isOpen: boolean;
    mode: RequisicionModalMode;
    context?: RequisicionContext;
    
    // Form state
    tipo: "material" | "equipo";
    items: RequisicionItem[];
    proveedor_id: Id<"proveedores"> | "";
    fecha_entrega: string;
    descripcion: string;
    status: string;
    solicitante_nombre: string;
    fecha_solicitud: string;
    
    // Actions
    onOpen: (context: RequisicionContext, mode?: RequisicionModalMode) => void;
    onClose: () => void;
    
    // Form actions
    setTipo: (tipo: "material" | "equipo") => void;
    setProveedorId: (id: Id<"proveedores"> | "") => void;
    setFechaEntrega: (fecha: string) => void;
    setDescripcion: (descripcion: string) => void;
    setStatus: (status: string) => void;
    
    // Pre-fill for edit/view mode
    prefillForm: (data: {
        tipo: "material" | "equipo";
        items: RequisicionItem[];
        proveedor_id: Id<"proveedores"> | "";
        fecha_entrega: string;
        descripcion: string;
        status: string;
        solicitante_nombre: string;
        fecha_solicitud: string;
    }) => void;
    
    // Item operations
    addItem: () => void;
    removeItem: (itemId: string) => void;
    updateItem: (itemId: string, data: Partial<RequisicionItem>) => void;
    
    resetForm: () => void;
};

const createEmptyItem = (): RequisicionItem => ({
    id: Date.now().toString() + Math.random(),
    partida_id: "",
    partida_nombre: "",
    familia: "",
    sub_partida: "",
    cantidad: 0,
    unidad: "",
});

const initialState = {
    isOpen: false,
    mode: "create" as RequisicionModalMode,
    context: undefined,
    tipo: "material" as const,
    items: [createEmptyItem()],
    proveedor_id: "" as Id<"proveedores"> | "",
    fecha_entrega: "",
    descripcion: "",
    status: "En proceso",
    solicitante_nombre: "",
    fecha_solicitud: "",
};

export const useRequisicionModal = create<RequisicionModalStore>((set) => ({
    ...initialState,
    
    onOpen: (context: RequisicionContext, mode: RequisicionModalMode = "create") => set({
        isOpen: true,
        mode,
        context,
        tipo: "material",
        items: [createEmptyItem()],
        proveedor_id: "",
        fecha_entrega: "",
        descripcion: "",
        status: "En proceso",
        solicitante_nombre: "",
        fecha_solicitud: "",
    }),
    
    onClose: () => set(initialState),
    
    setTipo: (tipo) => set({ tipo }),
    setProveedorId: (proveedor_id) => set({ proveedor_id }),
    setFechaEntrega: (fecha_entrega) => set({ fecha_entrega }),
    setDescripcion: (descripcion) => set({ descripcion }),
    setStatus: (status) => set({ status }),
    
    prefillForm: (data) => set({
        tipo: data.tipo,
        items: data.items,
        proveedor_id: data.proveedor_id,
        fecha_entrega: data.fecha_entrega,
        descripcion: data.descripcion,
        status: data.status,
        solicitante_nombre: data.solicitante_nombre,
        fecha_solicitud: data.fecha_solicitud,
    }),
    
    addItem: () => set((state) => ({
        items: [...state.items, createEmptyItem()]
    })),
    
    removeItem: (itemId: string) => set((state) => ({
        items: state.items.filter(item => item.id !== itemId)
    })),
    
    updateItem: (itemId: string, data: Partial<RequisicionItem>) => set((state) => ({
        items: state.items.map(item => 
            item.id === itemId ? { ...item, ...data } : item
        )
    })),
    
    resetForm: () => set(initialState),
}));

// Backward compatibility alias
export const useNuevaRequisicionModal = useRequisicionModal;
