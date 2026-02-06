import { create } from "zustand";
import { Id } from "../../convex/_generated/dataModel";

interface ReviewRequisicionModalState {
  isOpen: boolean;
  requisicionId: Id<"requisiciones"> | null;
  open: (requisicionId: Id<"requisiciones">) => void;
  close: () => void;
}

export const useReviewRequisicionModal = create<ReviewRequisicionModalState>((set) => ({
  isOpen: false,
  requisicionId: null,
  open: (requisicionId) => set({ isOpen: true, requisicionId }),
  close: () => set({ isOpen: false, requisicionId: null }),
}));
