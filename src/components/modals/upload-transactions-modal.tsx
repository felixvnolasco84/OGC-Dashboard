import { useState } from "react";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useUploadTransactionsModal } from "@/hooks/upload-transactions-modal";
import { useUploadProjectTransactionsModal } from "@/hooks/upload-project-transactions-modal";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileSpreadsheet } from "lucide-react";

export default function UploadTransactionsModal() {
  const { isOpen, onClose } = useUploadTransactionsModal();
  const { isAuthenticated } = useConvexAuth();
  const projectUploader = useUploadProjectTransactionsModal();
  const proyectos = useQuery(
    api.desarrollos.getAll,
    isOpen && isAuthenticated ? {} : "skip"
  );
  const [selectedProyecto, setSelectedProyecto] = useState<Id<"desarrollos"> | "">("");

  const handleClose = () => {
    setSelectedProyecto("");
    onClose();
  };

  const handleContinue = () => {
    if (!selectedProyecto) return;
    const proyecto = proyectos?.find((item) => item._id === selectedProyecto);
    if (!proyecto) return;
    handleClose();
    projectUploader.onOpen(proyecto._id, proyecto.nombre);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-2xl font-normal">Importar transacciones</DialogTitle>
          <DialogDescription>
            Selecciona el proyecto. En el siguiente paso revisarás partidas, proveedores,
            montos y posibles duplicados antes de confirmar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-4">
            <FileSpreadsheet className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Todas las importaciones usan la misma vista previa e idempotencia por archivo.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="transaction-import-project">Proyecto *</Label>
            <Select
              value={selectedProyecto}
              onValueChange={(value) => setSelectedProyecto(value as Id<"desarrollos">)}
            >
              <SelectTrigger id="transaction-import-project">
                <SelectValue placeholder="Selecciona un proyecto" />
              </SelectTrigger>
              <SelectContent>
                {proyectos?.map((proyecto) => (
                  <SelectItem key={proyecto._id} value={proyecto._id}>
                    {proyecto.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleContinue} disabled={!selectedProyecto}>
            Continuar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
