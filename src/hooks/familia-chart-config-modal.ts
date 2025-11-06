import { create } from "zustand";

export interface FamiliaChartConfig {
  chartId: string;
  title: string;
  color: string;
  partidas: string[];
  familias: string[];
  sub_partidas: string[];
}

interface FamiliaChartConfigModalState {
  isOpen: boolean;
  config: FamiliaChartConfig | null;
  
  // Available options for dropdowns (populated from project data)
  availablePartidas: string[];
  availableFamilias: string[];
  availableSubPartidas: string[];
  
  open: (config: FamiliaChartConfig, options: {
    availablePartidas: string[];
    availableFamilias: string[];
    availableSubPartidas: string[];
  }) => void;
  close: () => void;
  updateConfig: (updates: Partial<FamiliaChartConfig>) => void;
  setAvailableOptions: (options: {
    availablePartidas: string[];
    availableFamilias: string[];
    availableSubPartidas: string[];
  }) => void;
}

export const useFamiliaChartConfigModal = create<FamiliaChartConfigModalState>((set) => ({
  isOpen: false,
  config: null,
  availablePartidas: [],
  availableFamilias: [],
  availableSubPartidas: [],
  
  open: (config, options) => set({ 
    isOpen: true, 
    config,
    availablePartidas: options.availablePartidas,
    availableFamilias: options.availableFamilias,
    availableSubPartidas: options.availableSubPartidas,
  }),
  
  close: () => set({ isOpen: false, config: null }),
  
  updateConfig: (updates) => set((state) => ({
    config: state.config ? { ...state.config, ...updates } : null,
  })),
  
  setAvailableOptions: (options) => set(options),
}));
