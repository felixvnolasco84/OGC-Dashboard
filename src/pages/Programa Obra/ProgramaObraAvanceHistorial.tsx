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
            <p className="text-sm text-gray-400 text-center py-8">
              No hay modificaciones registradas para este avance.
            </p>
          ) : (
            <div className="relative space-y-4">
              <div className="absolute left-[7px] top-2 bottom-2 w-px bg-gray-200" />
              {itemHistorial.map((entry) => (
                <div key={entry._id} className="relative pl-7">
                  <div className="absolute left-0 top-1.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-[#802424] shadow-sm" />
                  <div className="border border-gray-200 bg-white p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-sm text-gray-900">
                        <span className="font-medium">{formatPercent(entry.old_value)}</span>
                        <span className="mx-2 text-gray-400">a</span>
                        <span className="font-medium">{formatPercent(entry.new_value)}</span>
                      </div>
                      <span className="shrink-0 text-xs text-gray-400">
                        {formatDateTime(entry.created_at)}
                      </span>
                    </div>
                    <div className="mt-2 text-xs text-gray-500">
                      {entry.changed_by_name ?? "Usuario no identificado"}
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
