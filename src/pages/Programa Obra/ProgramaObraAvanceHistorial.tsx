import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { History } from "lucide-react";
import { type ProgramaItem } from "./programa-obra-types";

type HistorialEntry = {
  _id: string;
  detalle_id: string;
  old_value?: number;
  new_value: number;
  changed_by_name?: string;
  created_at: number;
  execution_date?: string;
  actual_start?: string; old_actual_start?: string;
  actual_finish?: string; old_actual_finish?: string;
  old_progress_as_of?: string;
  reason?: string;
};

type Props = {
  item: ProgramaItem;
  historial: HistorialEntry[];
  onClose: () => void;
};

const formatPercent = (value: number | undefined) => {
  if (value == null) return "Sin avance";
  return `${Math.round(value * 100) / 100}%`;
};

const formatDateTime = (timestamp: number) => {
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "America/Mexico_City",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
};

export default function ProgramaObraAvanceHistorial({ item, historial, onClose }: Props) {
  const detalleId = item.detalleSchedule?._id;
  const itemHistorial = historial
    .filter((entry) => entry.detalle_id === detalleId)
    .sort((a, b) => b.created_at - a.created_at);

  return (
    <Sheet open onOpenChange={onClose}>
      <SheetContent className="w-[480px] sm:max-w-[480px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-left flex items-center gap-2">
            <History className="h-4 w-4" />
            Historial de avance
          </SheetTitle>
          <SheetDescription className="text-left">
            {item.parentPartidaNombre ? `${item.parentPartidaNombre} / ` : ""}
            {item.partida}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6">
          {itemHistorial.length === 0 ? (
            <p className="text-sm text-disabled-foreground text-center py-8">
              No hay modificaciones registradas para este avance.
            </p>
          ) : (
            <div className="relative space-y-4">
              <div className="absolute left-[7px] top-2 bottom-2 w-px bg-disabled" />
              {itemHistorial.map((entry) => (
                <div key={entry._id} className="relative pl-7">
                  <div className="absolute left-0 top-1.5 h-3.5 w-3.5 rounded-full border-2 border-on-color bg-[#802424] shadow-sm" />
                  <div className="border border-border bg-card p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-sm text-foreground">
                        <span className="font-medium">{formatPercent(entry.old_value)}</span>
                        <span className="mx-2 text-disabled-foreground">a</span>
                        <span className="font-medium">{formatPercent(entry.new_value)}</span>
                      </div>
                      <span className="shrink-0 text-xs text-disabled-foreground">
                        {formatDateTime(entry.created_at)}
                      </span>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      Capturado por {entry.changed_by_name ?? "Usuario no identificado"}
                    </div>
                    <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                      <p>Inicio real: {entry.old_actual_start ?? "Sin fecha"} → {entry.actual_start ?? "Sin fecha registrada"}</p>
                      <p>Avance al día: {entry.old_progress_as_of ?? "Sin fecha"} → {entry.execution_date ?? "Desconocida"}</p>
                      {(entry.actual_finish || entry.old_actual_finish) && <p>Terminación real: {entry.old_actual_finish ?? "Sin fecha"} → {entry.actual_finish ?? "Sin fecha"}</p>}
                      {entry.reason && <p>{entry.reason}</p>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
