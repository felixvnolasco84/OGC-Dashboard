import { Doc } from "../../convex/_generated/dataModel";
import { create } from "zustand";

type EditCostModalStore = {
  cost?: Doc<"costos">;
  isOpen: boolean;
  onOpen: (cost: Doc<"costos">) => void;
  onClose: () => void;
};

export const useEditCostModal = create<EditCostModalStore>((set) => ({
  isOpen: false,
  onOpen: (cost: Doc<"costos">) => set({ isOpen: true, cost }),
  onClose: () => set({ isOpen: false, cost: undefined }),
}));
