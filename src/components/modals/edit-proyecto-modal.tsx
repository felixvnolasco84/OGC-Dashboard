import { useState, useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useEditProyectoModal } from "@/hooks/edit-proyecto-modal";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function EditProyectoModal() {
  const { isOpen, onClose, proyectoId } = useEditProyectoModal();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [image, setImage] = useState("");
  const [status, setStatus] = useState("Activo");
  const [fechaCreacion, setFechaCreacion] = useState("");
  const [honorariosPorcentaje, setHonorariosPorcentaje] = useState<number>(0);

  // Queries and mutations
  const proyecto = useQuery(
    api.desarrollos.getById,
    proyectoId ? { id: proyectoId } : "skip"
  );
  const updateProyecto = useMutation(api.desarrollos.update);

  // Load proyecto data when modal opens
  useEffect(() => {
    if (proyecto) {
      setNombre(proyecto.nombre || "");
      setDescripcion(proyecto.descripcion || "");
      setImage(proyecto.image || "");
      setStatus(proyecto.status || "Activo");
      setFechaCreacion(proyecto.fecha_creacion || "");
      setHonorariosPorcentaje(proyecto.honorarios_porcentaje || 0);
    }
  }, [proyecto]);

  const handleClose = () => {
    setNombre("");
    setDescripcion("");
    setImage("");
    setStatus("Activo");
    setFechaCreacion("");
    setHonorariosPorcentaje(0);
    setIsSubmitting(false);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!proyectoId) return;

    setIsSubmitting(true);

    try {
      await updateProyecto({
        id: proyectoId,
        nombre,
        descripcion,
        image: image || undefined,
        status,
        fecha_creacion: fechaCreacion || undefined,
        honorarios_porcentaje: honorariosPorcentaje,
      });

      toast.success("Proyecto actualizado", {
        description: `El proyecto "${nombre}" ha sido actualizado correctamente.`,
      });

      handleClose();
    } catch (error) {
      console.error("Error updating proyecto:", error);
      toast.error("Error al actualizar el proyecto", {
        description: error instanceof Error ? error.message : "Ocurrió un error inesperado.",
      });
      setIsSubmitting(false);
    }
  };

  const isFormValid = nombre.trim() !== "" && descripcion.trim() !== "";

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-normal">
            Editar Proyecto
          </DialogTitle>
          <DialogDescription>
            Actualiza la información del proyecto
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 mt-4">
          {/* Nombre */}
          <div className="space-y-2">
            <Label htmlFor="nombre" className="text-sm font-medium">
              Nombre del Proyecto *
            </Label>
            <Input
              id="nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. SUNRISE - FOUR SEASONS ESTATES"
              className="rounded-none"
              required
            />
          </div>

          {/* Descripción */}
          <div className="space-y-2">
            <Label htmlFor="descripcion" className="text-sm font-medium">
              Descripción *
            </Label>
            <Textarea
              id="descripcion"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Descripción del proyecto..."
              className="rounded-none min-h-[100px]"
              required
            />
          </div>

          {/* Honorarios Percentage */}
          <div className="space-y-2">
            <Label htmlFor="honorarios_porcentaje" className="text-sm font-medium">
              Porcentaje de Honorarios (%)
            </Label>
            <Input
              id="honorarios_porcentaje"
              type="number"
              value={honorariosPorcentaje || ''}
              onChange={(e) => setHonorariosPorcentaje(parseFloat(e.target.value) || 0)}
              placeholder="Ej: 15"
              min="0"
              max="100"
              step="0.01"
              className="rounded-none"
            />
            <p className="text-xs text-gray-500">
              Porcentaje que se aplicará sobre el total de transacciones para calcular honorarios
            </p>
          </div>

          {/* Status */}
          <div className="space-y-2">
            <Label htmlFor="status" className="text-sm font-medium">
              Status
            </Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="rounded-none">
                <SelectValue placeholder="Selecciona status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Activo">Activo</SelectItem>
                <SelectItem value="Cancelado">Cancelado</SelectItem>
                <SelectItem value="Entregado">Entregado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Fecha Creación */}
          <div className="space-y-2">
            <Label htmlFor="fecha" className="text-sm font-medium">
              Fecha de Creación
            </Label>
            <Input
              id="fecha"
              type="date"
              value={fechaCreacion}
              onChange={(e) => setFechaCreacion(e.target.value)}
              className="rounded-none"
            />
            <p className="text-xs text-gray-500">
              Si se deja vacío, se usará la fecha actual
            </p>
          </div>

          {/* Image URL */}
          <div className="space-y-2">
            <Label htmlFor="image" className="text-sm font-medium">
              URL de Imagen
            </Label>
            <Input
              id="image"
              value={image}
              onChange={(e) => setImage(e.target.value)}
              placeholder="https://ejemplo.com/imagen.jpg"
              className="rounded-none"
            />
            <p className="text-xs text-gray-500">
              Si se deja vacío, se usará una imagen placeholder
            </p>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isSubmitting}
              className="rounded-none"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={!isFormValid || isSubmitting}
              className="rounded-none"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Guardando...
                </>
              ) : (
                "Guardar Cambios"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
