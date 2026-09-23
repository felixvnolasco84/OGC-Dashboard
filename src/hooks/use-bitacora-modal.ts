import { create } from "zustand";
interface LogEntry {
  _id: string;
  client_id?: string;
  departamento?: string; // Enriched by backend
  categoria: string;
  partida_id: string;
  familias_tags: string[];
  responsable: string;
  fecha: string;
  avance_dia: string;
  comentarios?: string;
  status?: string;
}

interface BitacoraModalState {
  isOpen: boolean;
  mode: "create" | "edit" | "view";
  proyectoId?: string;
  logEntry?: LogEntry;
  categoria?: string; // Auto-populate category when creating from a specific group
  fecha?: string; // Auto-populate date when creating from calendar
  onOpen: (data: {
    proyectoId: string;
    mode: "create" | "edit" | "view";
    logEntry?: LogEntry;
    categoria?: string; // Optional category to pre-fill
    fecha?: string; // Optional date to pre-fill (DD/MM/YYYY format)
  }) => void;
  onClose: () => void;
}

export const useBitacoraModal = create<BitacoraModalState>((set) => ({
  isOpen: false,
  mode: "create",
  proyectoId: undefined,
  logEntry: undefined,
  categoria: undefined,
  fecha: undefined,
  onOpen: (data) =>
    set({
      isOpen: true,
      mode: data.mode,
      proyectoId: data.proyectoId,
      logEntry: data.logEntry,
      categoria: data.categoria,
      fecha: data.fecha,
    }),
  onClose: () =>
    set({
      isOpen: false,
      mode: "create",
      proyectoId: undefined,
      logEntry: undefined,
      categoria: undefined,
      fecha: undefined,
    }),
}));
