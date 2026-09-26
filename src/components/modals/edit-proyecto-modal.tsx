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
import { Loader2, Info, Search } from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Id } from "../../../convex/_generated/dataModel";
import {
  NO_PROJECT_LOCATION,
  NO_PROJECT_LOCATION_LABEL,
  normalizeProjectLocationName,
} from "@/lib/project-locations";

export default function EditProyectoModal() {
  const { isOpen, onClose, proyectoId } = useEditProyectoModal();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [status, setStatus] = useState("Activo");
  const [honorariosPorcentaje, setHonorariosPorcentaje] = useState<number>(0);
  const [honorariosModo, setHonorariosModo] = useState<"automatico" | "transacciones">("automatico");
  const [ubicacion, setUbicacion] = useState<string | undefined>();
  const [excludedPartidas, setExcludedPartidas] = useState<Id<"partidas">[]>([]);
  const [partidaSearch, setPartidaSearch] = useState("");

  // Queries and mutations
  const proyecto = useQuery(
    api.desarrollos.getById,
    proyectoId ? { id: proyectoId } : "skip"
  );
  const partidas = useQuery(
    api.partida.getByProject,
    proyectoId ? { projectId: proyectoId } : "skip"
  );
  const projectLocations = useQuery(api.project_locations.list);
  const updateProyecto = useMutation(api.desarrollos.update);

  // Load proyecto data when modal opens
  useEffect(() => {
    if (proyecto) {
      setNombre(proyecto.nombre || "");
      setDescripcion(proyecto.descripcion || "");
      setStatus(proyecto.status || "Activo");
      setHonorariosPorcentaje(proyecto.honorarios_porcentaje || 0);
      setHonorariosModo(proyecto.honorarios_modo === "transacciones" ? "transacciones" : "automatico");
      setUbicacion(proyecto.ubicacion);
      setExcludedPartidas(proyecto.excluded_partidas_honorarios || []);
      setPartidaSearch("");
    }
  }, [proyecto]);

  const handleClose = () => {
    setNombre("");
    setDescripcion("");
    setStatus("Activo");
    setHonorariosPorcentaje(0);
    setHonorariosModo("automatico");
    setUbicacion(undefined);
    setExcludedPartidas([]);
    setPartidaSearch("");
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
        status,
        honorarios_porcentaje: honorariosPorcentaje,
        honorarios_modo: honorariosModo,
        ubicacion: ubicacion ?? null,
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
  const normalizedPartidaSearch = normalizeProjectLocationName(partidaSearch);
  const filteredNivel1Partidas = nivel1Partidas?.filter((partida) =>
    normalizeProjectLocationName(partida.nombre).includes(normalizedPartidaSearch)
  );

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent data-square-modal=""
        className="flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0"
      >
        <DialogHeader className="shrink-0 border-b px-6 py-5 pr-12">
          <DialogTitle className="text-2xl font-normal">
            Editar Proyecto
          </DialogTitle>
          <DialogDescription>
            Actualiza la información del proyecto
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
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

          <div className="space-y-2">
            <Label htmlFor="ubicacion" className="text-sm font-medium">
              Ubicación
            </Label>
            <Select
              value={ubicacion || NO_PROJECT_LOCATION}
              onValueChange={(value) => setUbicacion(
                value === NO_PROJECT_LOCATION ? undefined : value
              )}
            >
              <SelectTrigger id="ubicacion" className="rounded-none">
                <SelectValue placeholder="Selecciona una ubicación" />
              </SelectTrigger>
              <SelectContent data-square-modal="">
                <SelectItem value={NO_PROJECT_LOCATION}>
                  {NO_PROJECT_LOCATION_LABEL}
                </SelectItem>
                {(projectLocations || []).map((location) => (
                  <SelectItem key={location.key} value={location.key}>
                    {location.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Opcional. Los proyectos sin asignación aparecen en Sin ubicación.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="honorarios_modo" className="text-sm font-medium">Cálculo de honorarios</Label>
            <Select value={honorariosModo} onValueChange={(value) => setHonorariosModo(value as "automatico" | "transacciones")}>
              <SelectTrigger id="honorarios_modo" className="rounded-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent data-square-modal="">
                <SelectItem value="automatico">Automático por porcentaje</SelectItem>
                <SelectItem value="transacciones">Por transacciones de HONORARIOS</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {honorariosModo === "transacciones"
                ? "Suma los conceptos vinculados a la partida HONORARIOS, incluidas transacciones por pagar."
                : "Calcula honorarios con el porcentaje y las partidas excluidas configuradas abajo."}
            </p>
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
            <p className="text-xs text-muted-foreground">
              {honorariosModo === "automatico"
                ? "Porcentaje aplicado a la base de transacciones para calcular honorarios."
                : "Se conserva para cuando vuelvas al modo automático."}
            </p>
          </div>

          {/* Partidas Exclusion Section */}
          {partidas === undefined ? (
            <div className="flex items-center gap-2 border-t pt-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando partidas...
            </div>
          ) : nivel1Partidas && nivel1Partidas.length > 0 ? (
            <div className="space-y-3 border-t pt-4">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 text-blue-500 mt-0.5" />
                <div>
                  <Label className="text-sm font-medium">
                    Excluir Partidas del Cálculo de Honorarios (Nivel 1)
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    {honorariosModo === "automatico"
                      ? "Selecciona las partidas de nivel 1 que no se incluirán en el cálculo automático."
                      : "Las exclusiones se conservan para cuando vuelvas al modo automático."}
                  </p>
                </div>
              </div>

              <div className="border">
                <div className="relative border-b">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-disabled-foreground" />
                  <Input
                    value={partidaSearch}
                    onChange={(event) => setPartidaSearch(event.target.value)}
                    placeholder="Buscar partida..."
                    aria-label="Buscar partida de nivel 1"
                    className="h-10 rounded-none border-0 pl-9 shadow-none focus-visible:ring-0"
                  />
                </div>
                <div className="max-h-56 overflow-y-auto">
                  {filteredNivel1Partidas && filteredNivel1Partidas.length > 0 ? (
                    filteredNivel1Partidas.map((partida) => (
                      <label
                        key={partida._id}
                        htmlFor={`partida-${partida._id}`}
                        className="flex cursor-pointer items-center gap-3 border-b px-3 py-2 last:border-b-0 hover:bg-muted/50"
                      >
                        <Checkbox
                          id={`partida-${partida._id}`}
                          checked={excludedPartidas.includes(partida._id)}
                          onCheckedChange={() => handlePartidaToggle(partida._id)}
                        />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">
                          {partida.nombre}
                        </span>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {new Intl.NumberFormat("es-MX", {
                            style: "currency",
                            currency: "MXN",
                            maximumFractionDigits: 0,
                          }).format(partida.presupuesto_aprobado)}
                        </span>
                      </label>
                    ))
                  ) : (
                    <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                      No se encontraron partidas
                    </p>
                  )}
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                {excludedPartidas.length > 0
                  ? `${excludedPartidas.length} partida${excludedPartidas.length > 1 ? 's' : ''} excluida${excludedPartidas.length > 1 ? 's' : ''} del cálculo`
                  : 'Ninguna partida excluida'}
              </p>
            </div>
          ) : null}

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

          </div>

          {/* Actions */}
          <div className="flex shrink-0 justify-end gap-3 border-t bg-background px-6 py-4">
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
