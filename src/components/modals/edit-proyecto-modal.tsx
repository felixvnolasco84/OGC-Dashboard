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
import { Loader2, Info } from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Id } from "../../../convex/_generated/dataModel";

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
  const [excludedPartidas, setExcludedPartidas] = useState<Id<"partidas">[]>([]);

  // Queries and mutations
  const proyecto = useQuery(
    api.desarrollos.getById,
    proyectoId ? { id: proyectoId } : "skip"
  );
  const partidas = useQuery(
    api.partida.getByProject,
    proyectoId ? { projectId: proyectoId } : "skip"
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
      setExcludedPartidas(proyecto.excluded_partidas_honorarios || []);
    }
  }, [proyecto]);

  const handleClose = () => {
    setNombre("");
    setDescripcion("");
    setImage("");
    setStatus("Activo");
    setFechaCreacion("");
    setHonorariosPorcentaje(0);
    setExcludedPartidas([]);
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
        excluded_partidas_honorarios: excludedPartidas,
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

  // Handle partida exclusion toggle
  const handlePartidaToggle = (partidaId: Id<"partidas">) => {
    setExcludedPartidas((prev) => {
      if (prev.includes(partidaId)) {
        return prev.filter((id) => id !== partidaId);
      } else {
        return [...prev, partidaId];
      }
    });
  };

  // Filter to only show nivel 1 partidas
  const nivel1Partidas = partidas?.filter((partida) => partida.nivel === 1);

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent data-square-modal="" className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
            <p className="text-xs text-subtle-foreground">
              Porcentaje que se aplicará sobre el total de transacciones para calcular honorarios
            </p>
          </div>

          {/* Partidas Exclusion Section */}
          {nivel1Partidas && nivel1Partidas.length > 0 && (
            <div className="space-y-3 border-t pt-4">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 text-blue-500 mt-0.5" />
                <div>
                  <Label className="text-sm font-medium">
                    Excluir Partidas del Cálculo de Honorarios (Nivel 1)
                  </Label>
                  <p className="text-xs text-subtle-foreground mt-1">
                    Selecciona las partidas de nivel 1 que NO deben incluirse en el cálculo de honorarios
                  </p>
                </div>
              </div>

              <div className="max-h-[300px] overflow-y-auto border rounded-none p-4 space-y-2">
                {nivel1Partidas.map((partida) => (
                  <div
                    key={partida._id}
                    className="flex items-start gap-3 p-2 hover:bg-background rounded-none"
                  >
                    <Checkbox
                      id={`partida-${partida._id}`}
                      checked={excludedPartidas.includes(partida._id)}
                      onCheckedChange={() => handlePartidaToggle(partida._id)}
                      className="mt-1"
                    />
                    <label
                      htmlFor={`partida-${partida._id}`}
                      className="flex-1 cursor-pointer"
                    >
                      <div className="text-sm font-medium">{partida.nombre}</div>
                      <div className="text-xs text-subtle-foreground">
                        {partida.familia} - {partida.sub_partida}
                      </div>
                      <div className="text-xs text-disabled-foreground">
                        Presupuesto: ${partida.presupuesto_aprobado.toLocaleString()}
                      </div>
                    </label>
                  </div>
                ))}
              </div>

              <p className="text-xs text-subtle-foreground italic">
                {excludedPartidas.length > 0
                  ? `${excludedPartidas.length} partida${excludedPartidas.length > 1 ? 's' : ''} excluida${excludedPartidas.length > 1 ? 's' : ''} del cálculo`
                  : 'Ninguna partida excluida'}
              </p>
            </div>
          )}

          {/* Status */}
          <div className="space-y-2">
            <Label htmlFor="status" className="text-sm font-medium">
              Status
            </Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="rounded-none">
                <SelectValue placeholder="Selecciona status" />
              </SelectTrigger>
              <SelectContent data-square-modal="">
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
            <p className="text-xs text-subtle-foreground">
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
            <p className="text-xs text-subtle-foreground">
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
