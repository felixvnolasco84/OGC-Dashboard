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
import { toast } from "sonner";

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
  const [anticipoRecordatorio, setAnticipoRecordatorio] = useState(String(schedule?.anticipo_recordatorio_dias ?? 7));
  const [suministroRecordatorio, setSuministroRecordatorio] = useState(String(schedule?.suministro_recordatorio_dias ?? 14));
  const [finiquitoRecordatorio, setFiniquitoRecordatorio] = useState(String(schedule?.finiquito_recordatorio_dias ?? 7));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upsertSchedule = useMutation(api.programa_obra.upsertSchedule);

  const handleSave = async () => {
    if (!item.partidaDbId) return;
    if (fechaInicio && fechaFin && fechaInicio > fechaFin) {
      setError("La fecha de inicio no puede ser posterior a la fecha de fin.");
      return;
    }
    const percentages = [anticipoPorcentaje, finiquitoPorcentaje]
      .filter((value) => value !== "")
      .map(Number);
    if (percentages.some((value) => !Number.isFinite(value) || value < 0 || value > 100)) {
      setError("Los porcentajes deben estar entre 0 y 100.");
      return;
    }
    const reminders = [anticipoRecordatorio, suministroRecordatorio, finiquitoRecordatorio].map(Number);
    if (reminders.some((value) => !Number.isFinite(value) || value < 0 || value > 90)) {
      setError("Los recordatorios deben estar entre 0 y 90 días.");
      return;
    }
    setIsSaving(true);
    setError(null);
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
        anticipo_recordatorio_dias: Number(anticipoRecordatorio),
        suministro_recordatorio_dias: Number(suministroRecordatorio),
        finiquito_recordatorio_dias: Number(finiquitoRecordatorio),
      });
      toast.success("Programa actualizado");
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo guardar el programa.";
      setError(message);
      toast.error("No se pudo guardar el programa", { description: message });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Sheet open onOpenChange={onClose}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-[520px]">
        <SheetHeader>
          <SheetTitle className="text-left">{item.partida}</SheetTitle>
          <SheetDescription className="text-left">
            Configurar fechas y datos del programa de obra
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Duración de actividad */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-foreground">Duración de actividad</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="programa-fecha-inicio" className="text-xs text-subtle-foreground">Fecha inicio</Label>
                <Input
                  id="programa-fecha-inicio"
                  type="date"
                  value={fechaInicio}
                  onChange={(e) => setFechaInicio(e.target.value)}
                  className="h-9 rounded-none text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="programa-fecha-fin" className="text-xs text-subtle-foreground">Fecha fin</Label>
                <Input
                  id="programa-fecha-fin"
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
            <h3 className="text-sm font-medium text-foreground">
              Anticipo
              <span className="text-xs text-disabled-foreground ml-2">(solo si aplica)</span>
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="programa-anticipo-fecha" className="text-xs text-subtle-foreground">Fecha anticipo</Label>
                <Input
                  id="programa-anticipo-fecha"
                  type="date"
                  value={anticipoFecha}
                  onChange={(e) => setAnticipoFecha(e.target.value)}
                  className="h-9 rounded-none text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="programa-anticipo-porcentaje" className="text-xs text-subtle-foreground">Porcentaje %</Label>
                <Input
                  id="programa-anticipo-porcentaje"
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
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="programa-anticipo-recordatorio" className="text-xs text-subtle-foreground">Recordar con anticipación</Label>
                <div className="flex items-center gap-2">
                  <Input id="programa-anticipo-recordatorio" type="number" min="0" max="90" value={anticipoRecordatorio} onChange={(e) => setAnticipoRecordatorio(e.target.value)} className="h-9 rounded-none text-sm" />
                  <span className="text-xs text-muted-foreground">días</span>
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {/* Suministro */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-foreground">
              Suministro / Entrega de material
              <span className="text-xs text-disabled-foreground ml-2">(solo si aplica)</span>
            </h3>
            <div className="space-y-1.5">
              <Label htmlFor="programa-suministro-fecha" className="text-xs text-subtle-foreground">Fecha suministro</Label>
              <Input
                id="programa-suministro-fecha"
                type="date"
                value={suministroFecha}
                onChange={(e) => setSuministroFecha(e.target.value)}
                className="h-9 rounded-none text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="programa-suministro-recordatorio" className="text-xs text-subtle-foreground">Recordar con anticipación</Label>
              <div className="flex items-center gap-2">
                <Input id="programa-suministro-recordatorio" type="number" min="0" max="90" value={suministroRecordatorio} onChange={(e) => setSuministroRecordatorio(e.target.value)} className="h-9 rounded-none text-sm" />
                <span className="text-xs text-muted-foreground">días</span>
              </div>
            </div>
          </div>

          <Separator />

          {/* Finiquito */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-foreground">
              Finiquito
              <span className="text-xs text-disabled-foreground ml-2">(solo si aplica)</span>
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="programa-finiquito-fecha" className="text-xs text-subtle-foreground">Fecha finiquito</Label>
                <Input
                  id="programa-finiquito-fecha"
                  type="date"
                  value={finiquitoFecha}
                  onChange={(e) => setFiniquitoFecha(e.target.value)}
                  className="h-9 rounded-none text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="programa-finiquito-porcentaje" className="text-xs text-subtle-foreground">Porcentaje %</Label>
                <Input
                  id="programa-finiquito-porcentaje"
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
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="programa-finiquito-recordatorio" className="text-xs text-subtle-foreground">Recordar con anticipación</Label>
                <div className="flex items-center gap-2">
                  <Input id="programa-finiquito-recordatorio" type="number" min="0" max="90" value={finiquitoRecordatorio} onChange={(e) => setFiniquitoRecordatorio(e.target.value)} className="h-9 rounded-none text-sm" />
                  <span className="text-xs text-muted-foreground">días</span>
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {error && <p role="alert" className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

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
