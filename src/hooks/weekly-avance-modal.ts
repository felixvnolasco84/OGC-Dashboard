import { Id } from "../../convex/_generated/dataModel";
import { create } from "zustand";

export type WeeklyAvanceData = {
  week_date: number; // Excel serial date
  week_date_formatted: string; // Formatted date string
  avance_real: number; // Progress percentage (0-100)
};

type WeeklyAvanceContext = {
  proyectoId: Id<"desarrollos">;
  proyectoNombre: string;
};

type WeeklyAvanceModalStore = {
  context?: WeeklyAvanceContext;
  weeklyData: WeeklyAvanceData[];
  isOpen: boolean;
  onOpen: (context: WeeklyAvanceContext) => void;
  onClose: () => void;
  
  // Week data operations
  setWeeklyData: (data: WeeklyAvanceData[]) => void;
  updateWeekAvance: (weekDate: number, avanceReal: number) => void;
  resetData: () => void;
};

export const useWeeklyAvanceModal = create<WeeklyAvanceModalStore>((set) => ({
  context: undefined,
  weeklyData: [],
  isOpen: false,
  
  onOpen: (context) => {
    set({
      context,
      isOpen: true,
      weeklyData: [],
    });
  },
  
  onClose: () => {
    set({
      isOpen: false,
      context: undefined,
      weeklyData: [],
    });
  },
  
  setWeeklyData: (data) => {
    set({ weeklyData: data });
  },
  
  updateWeekAvance: (weekDate, avanceReal) => {
    set((state) => ({
      weeklyData: state.weeklyData.map((week) =>
        week.week_date === weekDate
          ? { ...week, avance_real: avanceReal }
          : week
      ),
    }));
  },
  
  resetData: () => {
    set({ weeklyData: [] });
  },
}));
