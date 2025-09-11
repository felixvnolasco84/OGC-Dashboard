"use client";

// import { DropdownMenuLabel } from "@/components/ui/dropdown-menu";
// import { useEditCostModal } from "@/hooks/edit-details-cost";å
import { Doc } from "convex/_generated/dataModel";
import { MoreHorizontal, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "../ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import EditCostForm from "../Forms/EditCostForm";
// import EditCostForm from "../Forms/EditCostForm";


export default function DropdownMenuComponentCosto({
  costo,
}: {
  costo: Doc<"costos">;
}) {
  // const editCostModal = useEditCostModal();


  return (
    <Dialog>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0">
            <span className="sr-only">Open menu</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent>
          <DialogTrigger asChild>
            <Button
              className="flex items-center gap-1"
            // onClick={() => editCostModal.onOpen(costo)}
            >
              <Pencil className="h-4 w-4" />
              Editar
            </Button>
          </DialogTrigger>
        </PopoverContent>
      </Popover>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar Costo</DialogTitle>
          <DialogDescription>Actualiza la información del costo</DialogDescription>
        </DialogHeader>
        {costo && <EditCostForm cost={costo} onClose={() => { }} />}
      </DialogContent>
    </Dialog>

  );
}
