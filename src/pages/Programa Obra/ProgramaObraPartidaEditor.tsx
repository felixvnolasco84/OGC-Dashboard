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
import { Separator } from "@/components/ui/separator";
import { type ProgramaItem } from "./programa-obra-types";

type Props = {
  item: ProgramaItem;
  proyectoId: Id<"desarrollos">;
  onClose: () => void;
};

/** Convert DD/MM/YYYY to YYYY-MM-DD for HTML date inputs */
function toInputDate(dateStr: string | undefined | null): string {
  if (!dateStr) return "";
  if (dateStr.includes("-")) return dateStr; // already YYYY-MM-DD
  const [d, m, y] = dateStr.split("/");
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

/** Convert YYYY-MM-DD to DD/MM/YYYY for storage */
function toStorageDate(dateStr: string): string {
  if (!dateStr) return "";
  if (dateStr.includes("/")) return dateStr; // already DD/MM/YYYY
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

export default function ProgramaObraPartidaEditor({ item, proyectoId, onClose }: Props) {
  const schedule = item.schedule;

  const [fechaInicio, setFechaInicio] = useState(toInputDate(schedule?.fecha_inicio));
  const [fechaFin, setFechaFin] = useState(toInputDate(schedule?.fecha_fin));
  const [anticipoFecha, setAnticipoFecha] = useState(toInputDate(schedule?.anticipo_fecha));
  const [anticipoPorcentaje, setAnticipoPorcentaje] = useState(String(schedule?.anticipo_porcentaje ?? ""));
  const [suministroFecha, setSuministroFecha] = useState(toInputDate(schedule?.suministro_fecha));
  const [finiquitoFecha, setFiniquitoFecha] = useState(toInputDate(schedule?.finiquito_fecha));
  const [finiquitoPorcentaje, setFiniquitoPorcentaje] = useState(String(schedule?.finiquito_porcentaje ?? ""));
  const [isSaving, setIsSaving] = useState(false);

  const upsertSchedule = useMutation(api.programa_obra.upsertSchedule);

  const handleSave = async () => {
    if (!item.partidaDbId) return;
    setIsSaving(true);
    try {
      await upsertSchedule({
        proyecto: proyectoId,
        partida_id: item.partidaDbId,
        fecha_inicio: fechaInicio ? toStorageDate(fechaInicio) : undefined,
        fecha_fin: fechaFin ? toStorageDate(fechaFin) : undefined,
        anticipo_fecha: anticipoFecha ? toStorageDate(anticipoFecha) : undefined,
        anticipo_porcentaje: anticipoPorcentaje ? parseFloat(anticipoPorcentaje) : undefined,
        suministro_fecha: suministroFecha ? toStorageDate(suministroFecha) : undefined,
        finiquito_fecha: finiquitoFecha ? toStorageDate(finiquitoFecha) : undefined,
        finiquito_porcentaje: finiquitoPorcentaje ? parseFloat(finiquitoPorcentaje) : undefined,
      });
      onClose();
    } catch (error) {
      console.error("Error saving schedule:", error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Sheet open onOpenChange={onClose}>
      <SheetContent className="w-[480px] sm:max-w-[480px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-left">{item.partida}</SheetTitle>
          <SheetDescription className="text-left">
            Configurar fechas y datos del programa de obra
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Duración de actividad */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-900">Duración de actividad</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-500">Fecha inicio</Label>
                <Input
                  type="date"
                  value={fechaInicio}
                  onChange={(e) => setFechaInicio(e.target.value)}
                  className="h-9 rounded-none text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-500">Fecha fin</Label>
                <Input
                  type="date"
                  value={fechaFin}
                  onChange={(e) => setFechaFin(e.target.value)}
                  className="h-9 rounded-none text-sm"
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Anticipo */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-900">
              Anticipo
              <span className="text-xs text-gray-400 ml-2">(solo si aplica)</span>
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-500">Fecha anticipo</Label>
                <Input
                  type="date"
                  value={anticipoFecha}
                  onChange={(e) => setAnticipoFecha(e.target.value)}
                  className="h-9 rounded-none text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-500">Porcentaje %</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  placeholder="0"
                  value={anticipoPorcentaje}
                  onChange={(e) => setAnticipoPorcentaje(e.target.value)}
                  className="h-9 rounded-none text-sm"
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Suministro */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-900">
              Suministro / Entrega de material
              <span className="text-xs text-gray-400 ml-2">(solo si aplica)</span>
            </h3>
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-500">Fecha suministro</Label>
              <Input
                type="date"
                value={suministroFecha}
                onChange={(e) => setSuministroFecha(e.target.value)}
                className="h-9 rounded-none text-sm"
              />
            </div>
          </div>

          <Separator />

          {/* Finiquito */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-900">
              Finiquito
              <span className="text-xs text-gray-400 ml-2">(solo si aplica)</span>
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-500">Fecha finiquito</Label>
                <Input
                  type="date"
                  value={finiquitoFecha}
                  onChange={(e) => setFiniquitoFecha(e.target.value)}
                  className="h-9 rounded-none text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-500">Porcentaje %</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  placeholder="0"
                  value={finiquitoPorcentaje}
                  onChange={(e) => setFiniquitoPorcentaje(e.target.value)}
                  className="h-9 rounded-none text-sm"
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Actions */}
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
