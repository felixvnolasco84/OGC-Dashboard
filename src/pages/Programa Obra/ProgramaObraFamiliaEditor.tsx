import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type ProgramaItem, type ScheduleData } from "./programa-obra-types";

type Props = {
  item: ProgramaItem;
  parentSchedule: ScheduleData | null;
  proyectoId: Id<"desarrollos">;
  onClose: () => void;
};

/** Convert DD/MM/YYYY to YYYY-MM-DD for HTML date inputs */
function toInputDate(dateStr: string | undefined | null): string {
  if (!dateStr) return "";
  if (dateStr.includes("-")) return dateStr;
  const [d, m, y] = dateStr.split("/");
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

/** Convert YYYY-MM-DD to DD/MM/YYYY for storage */
function toStorageDate(dateStr: string): string {
  if (!dateStr) return "";
  if (dateStr.includes("/")) return dateStr;
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

export default function ProgramaObraFamiliaEditor({ item, parentSchedule, proyectoId, onClose }: Props) {
  const familiaSchedule = item.familiaSchedule;

  const [fechaInicio, setFechaInicio] = useState(toInputDate(familiaSchedule?.fecha_inicio));
  const [fechaFin, setFechaFin] = useState(toInputDate(familiaSchedule?.fecha_fin));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upsertFamiliaSchedule = useMutation(api.programa_obra.upsertFamiliaSchedule);

  // Parent date bounds for validation
  const minDate = toInputDate(parentSchedule?.fecha_inicio);
  const maxDate = toInputDate(parentSchedule?.fecha_fin);

  const handleSave = async () => {
    if (!item.partidaDbId || !item.parentPartidaDbId) return;
    setIsSaving(true);
    setError(null);
    try {
      await upsertFamiliaSchedule({
        proyecto: proyectoId,
        partida_id: item.partidaDbId,
        parent_partida_id: item.parentPartidaDbId,
        fecha_inicio: fechaInicio ? toStorageDate(fechaInicio) : undefined,
        fecha_fin: fechaFin ? toStorageDate(fechaFin) : undefined,
      });
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Sheet open onOpenChange={onClose}>
      <SheetContent className="w-[400px] sm:max-w-[400px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-left">{item.partida}</SheetTitle>
          <SheetDescription className="text-left">
            Configurar fechas de la familia
            {parentSchedule?.fecha_inicio && parentSchedule?.fecha_fin && (
              <span className="block mt-1 text-xs text-gray-400">
                Rango válido: {parentSchedule.fecha_inicio} — {parentSchedule.fecha_fin}
              </span>
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-900">Duración de actividad</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-500">Fecha inicio</Label>
                <Input
                  type="date"
                  value={fechaInicio}
                  onChange={(e) => setFechaInicio(e.target.value)}
                  min={minDate || undefined}
                  max={maxDate || undefined}
                  className="h-9 rounded-none text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-500">Fecha fin</Label>
                <Input
                  type="date"
                  value={fechaFin}
                  onChange={(e) => setFechaFin(e.target.value)}
                  min={minDate || undefined}
                  max={maxDate || undefined}
                  className="h-9 rounded-none text-sm"
                />
              </div>
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}

          <div className="flex justify-end gap-3 pt-2 pb-4">
            <Button variant="outline" onClick={onClose} className="rounded-none">
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={isSaving} className="rounded-none">
              {isSaving ? "Guardando..." : "Guardar"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
