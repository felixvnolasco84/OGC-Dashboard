import { Id } from "../../convex/_generated/dataModel";
import { create } from "zustand";

// Sub-partida item within a familia
export type SubPartidaItem = {
    id: string;
    sub_partida: string; // Can be from budget or custom text
    descripcion_otro?: string; // Custom description when OTRO is selected
    cantidad: number;
    unidad: string;
    precio_unitario?: number; // Price per unit
    monto?: number; // Total = cantidad × precio_unitario
    partida_id?: Id<"partidas">; // The specific partida_id for this sub_partida
    presupuesto_aprobado?: number;
    pagado?: number;
    por_gastar?: number;
};

// Each item represents a Familia within the selected Partida
export type RequisicionItem = {
    id: string;
    familia: string;
    isCustomItem?: boolean; // True when familia has no sub-partidas in budget
    // Nested sub-partidas array
    subPartidas: SubPartidaItem[];
    // Budget info for the familia level
    partida_id?: Id<"partidas">; // The familia-level partida_id
    presupuesto_aprobado?: number;
    pagado?: number;
    por_gastar?: number;
};

// Legacy flat type for backward compatibility with form submission
export type RequisicionItemFlat = {
    id: string;
    familia: string;
    sub_partida: string;
    descripcion_otro?: string;
    cantidad: number;
    unidad: string;
    precio_unitario?: number;
    monto?: number;
    isCustomItem?: boolean;
    partida_id?: Id<"partidas">;
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
    
    // Form state - ONE partida for the entire requisicion
    tipo: "material" | "equipo";
    selectedPartida: {
        id: Id<"partidas"> | "";
        nombre: string;
    };
    items: RequisicionItem[]; // Each item is a Familia within the selected Partida
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
    setSelectedPartida: (partida: { id: Id<"partidas"> | ""; nombre: string }) => void;
    setProveedorId: (id: Id<"proveedores"> | "") => void;
    setFechaEntrega: (fecha: string) => void;
    setDescripcion: (descripcion: string) => void;
    setStatus: (status: string) => void;
    
    // Pre-fill for edit/view mode
    prefillForm: (data: {
        tipo: "material" | "equipo";
        selectedPartida: { id: Id<"partidas"> | ""; nombre: string };
        items: RequisicionItem[];
        proveedor_id: Id<"proveedores"> | "";
        fecha_entrega: string;
        descripcion: string;
        status: string;
        solicitante_nombre: string;
        fecha_solicitud: string;
    }) => void;
    
    // Familia (item) operations
    addItem: () => void;
    removeItem: (itemId: string) => void;
    updateItem: (itemId: string, data: Partial<Omit<RequisicionItem, 'subPartidas'>>) => void;
    
    // Sub-partida operations within a familia
    addSubPartida: (itemId: string) => void;
    removeSubPartida: (itemId: string, subPartidaId: string) => void;
    updateSubPartida: (itemId: string, subPartidaId: string, data: Partial<SubPartidaItem>) => void;
    
    resetForm: () => void;
};

const createEmptySubPartida = (): SubPartidaItem => ({
    id: Date.now().toString() + Math.random(),
    sub_partida: "",
    cantidad: 0,
    unidad: "",
});

const createEmptyItem = (): RequisicionItem => ({
    id: Date.now().toString() + Math.random(),
    familia: "",
    subPartidas: [createEmptySubPartida()],
});

const initialState = {
    isOpen: false,
    mode: "create" as RequisicionModalMode,
    context: undefined,
    tipo: "material" as const,
    selectedPartida: { id: "" as Id<"partidas"> | "", nombre: "" },
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
        selectedPartida: { id: "", nombre: "" },
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
    setSelectedPartida: (selectedPartida) => set((state) => ({
        selectedPartida,
        // Reset items when partida changes
        items: state.selectedPartida.nombre !== selectedPartida.nombre ? [createEmptyItem()] : state.items,
    })),
    setProveedorId: (proveedor_id) => set({ proveedor_id }),
    setFechaEntrega: (fecha_entrega) => set({ fecha_entrega }),
    setDescripcion: (descripcion) => set({ descripcion }),
    setStatus: (status) => set({ status }),
    
    prefillForm: (data) => set({
        tipo: data.tipo,
        selectedPartida: data.selectedPartida,
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
    
    updateItem: (itemId: string, data: Partial<Omit<RequisicionItem, 'subPartidas'>>) => set((state) => ({
        items: state.items.map(item => 
            item.id === itemId ? { ...item, ...data } : item
        )
    })),
    
    // Sub-partida operations
    addSubPartida: (itemId: string) => set((state) => ({
        items: state.items.map(item =>
            item.id === itemId
                ? { ...item, subPartidas: [...item.subPartidas, createEmptySubPartida()] }
                : item
        )
    })),
    
    removeSubPartida: (itemId: string, subPartidaId: string) => set((state) => ({
        items: state.items.map(item =>
            item.id === itemId
                ? { ...item, subPartidas: item.subPartidas.filter(sp => sp.id !== subPartidaId) }
                : item
        )
    })),
    
    updateSubPartida: (itemId: string, subPartidaId: string, data: Partial<SubPartidaItem>) => set((state) => ({
        items: state.items.map(item =>
            item.id === itemId
                ? {
                    ...item,
                    subPartidas: item.subPartidas.map(sp =>
                        sp.id === subPartidaId ? { ...sp, ...data } : sp
                    )
                }
                : item
        )
    })),
    
    resetForm: () => set(initialState),
}));

// Backward compatibility alias
export const useNuevaRequisicionModal = useRequisicionModal;
