import { useState, useMemo } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type ProgramaItem, type ScheduleData } from "./programa-obra-types";

type Props = {
  item: ProgramaItem;
  parentSchedule: ScheduleData | null;
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

/** Add extension to a date string (YYYY-MM-DD) and return DD/MM/YYYY */
function addExtension(baseDateStr: string, cantidad: number, unidad: string): string {
  if (!baseDateStr || cantidad <= 0) return toStorageDate(baseDateStr);
  const [y, m, d] = baseDateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  if (unidad === "dias") {
    date.setDate(date.getDate() + cantidad);
  } else if (unidad === "semanas") {
    date.setDate(date.getDate() + cantidad * 7);
  } else if (unidad === "meses") {
    date.setMonth(date.getMonth() + cantidad);
  }
  return `${date.getDate().toString().padStart(2, "0")}/${(date.getMonth() + 1).toString().padStart(2, "0")}/${date.getFullYear()}`;
}

export default function ProgramaObraFamiliaEditor({ item, parentSchedule, onClose }: Props) {
  const detalle = item.detalleSchedule;

  const [fechaInicio, setFechaInicio] = useState(toInputDate(detalle?.fecha_inicio));
  const [fechaFin, setFechaFin] = useState(toInputDate(detalle?.fecha_fin));
  const [hasExtraTime, setHasExtraTime] = useState(
    (detalle?.tiempo_extra_cantidad ?? 0) > 0
  );
  const [extraCantidad, setExtraCantidad] = useState(
    String(detalle?.tiempo_extra_cantidad ?? "")
  );
  const [extraUnidad, setExtraUnidad] = useState(
    detalle?.tiempo_extra_unidad ?? "dias"
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateDetalleSchedule = useMutation(api.programa_obra.updateDetalleSchedule);

  // Parent date bounds for validation
  const minDate = toInputDate(parentSchedule?.fecha_inicio);
  const maxDate = toInputDate(parentSchedule?.fecha_fin);

  // Preview the extended end date
  const extendedEndDate = useMemo(() => {
    if (!hasExtraTime || !fechaFin) return null;
    const cant = parseInt(extraCantidad);
    if (isNaN(cant) || cant <= 0) return null;
    return addExtension(fechaFin, cant, extraUnidad);
  }, [hasExtraTime, fechaFin, extraCantidad, extraUnidad]);

  const handleSave = async () => {
    const detalleId = detalle?._id;
    if (!detalleId) {
      setError("No se encontró el registro de detalle para esta familia");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const cant = hasExtraTime ? parseInt(extraCantidad) : 0;
      const hasTiempoExtra = hasExtraTime && !isNaN(cant) && cant > 0;

      // Compute effective fecha_fin: base end + extension
      let effectiveFechaFin: string | undefined;
      if (fechaFin) {
        effectiveFechaFin = hasTiempoExtra
          ? addExtension(fechaFin, cant, extraUnidad)
          : toStorageDate(fechaFin);
      }

      await updateDetalleSchedule({
        detalle_id: detalleId,
        fecha_inicio: fechaInicio ? toStorageDate(fechaInicio) : undefined,
        fecha_fin: effectiveFechaFin,
        tiempo_extra_cantidad: hasTiempoExtra ? cant : undefined,
        tiempo_extra_unidad: hasTiempoExtra ? extraUnidad : undefined,
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
                Rango partida: {parentSchedule.fecha_inicio} — {parentSchedule.fecha_fin}
              </span>
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Dates section */}
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

          {/* Extra time section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-900">Tiempo extra</h3>
              <button
                type="button"
                onClick={() => setHasExtraTime(!hasExtraTime)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  hasExtraTime ? "bg-[#f0e4e4]" : "bg-gray-200"
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                    hasExtraTime ? "translate-x-4.5" : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>

            {hasExtraTime && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-gray-500">Cantidad</Label>
                    <Input
                      type="number"
                      min={1}
                      value={extraCantidad}
                      onChange={(e) => setExtraCantidad(e.target.value)}
                      placeholder="0"
                      className="h-9 rounded-none text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-gray-500">Unidad</Label>
                    <Select value={extraUnidad} onValueChange={setExtraUnidad}>
                      <SelectTrigger className="h-9 rounded-none text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="dias">Días</SelectItem>
                        <SelectItem value="semanas">Semanas</SelectItem>
                        <SelectItem value="meses">Meses</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {extendedEndDate && (
                  <div className="bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                    Nueva fecha fin: <span className="font-medium">{extendedEndDate}</span>
                  </div>
                )}
              </div>
            )}
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
