"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useEditCostModal } from "@/hooks/edit-details-cost";
import EditCostForm from "@/components/Forms/EditCostForm";

export const EditCostModal = () => {
  const cost = useEditCostModal((state) => state.cost);
  const isOpen = useEditCostModal((state) => state.isOpen);
  const onClose = useEditCostModal((state) => state.onClose);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar Costo</DialogTitle>
          <DialogDescription>Actualiza la información del costo</DialogDescription>
        </DialogHeader>
        {cost && <EditCostForm cost={cost} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
};
