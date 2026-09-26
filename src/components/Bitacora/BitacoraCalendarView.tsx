import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Eye, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BitacoraEntryView } from "@/lib/bitacora-offline/types";

interface Props {
  proyectoId: string;
  logEntries: BitacoraEntryView[];
  canCreate: boolean;
  onOpenModal: (data: {
    proyectoId: string;
    mode: "create" | "edit" | "view";
    logEntry?: BitacoraEntryView;
    fecha?: string;
  }) => void;
}

const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const weekDays = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export default function BitacoraCalendarView({ proyectoId, logEntries, canCreate, onOpenModal }: Props) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const cells = [...Array(firstWeekday).fill(null), ...Array.from({ length: days }, (_, index) => index + 1)];
  const byDate = useMemo(() => logEntries.reduce<Record<string, BitacoraEntryView[]>>((result, entry) => {
    (result[entry.fecha] ??= []).push(entry);
    return result;
  }, {}), [logEntries]);

  const dateKey = (day: number) => `${String(day).padStart(2, "0")}/${String(month + 1).padStart(2, "0")}/${year}`;

  return (
    <section className="border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-5 md:px-6">
        <div className="flex items-center gap-3">
          <h2 className="text-xl text-foreground">{monthNames[month]} {year}</h2>
          <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>Hoy</Button>
        </div>
        <div className="flex items-center">
          <Button variant="ghost" size="sm" aria-label="Mes anterior" onClick={() => setCurrentDate(new Date(year, month - 1, 1))}><ChevronLeft /></Button>
          <Button variant="ghost" size="sm" aria-label="Mes siguiente" onClick={() => setCurrentDate(new Date(year, month + 1, 1))}><ChevronRight /></Button>
        </div>
      </div>
      <div className="grid grid-cols-7">
        {weekDays.map((day) => <div key={day} className="border-b border-r border-border bg-muted p-2 text-center text-xs font-medium text-muted-foreground last:border-r-0 md:text-sm">{day}</div>)}
        {cells.map((day, index) => day === null
          ? <div key={`empty-${index}`} className="min-h-20 border-b border-r border-border bg-background md:min-h-32" />
          : <div key={day} className="min-h-20 min-w-0 border-b border-r border-border p-1.5 md:min-h-32 md:p-2">
            {canCreate ? (
              <div className="mb-1">
              <Button
                type="button"
                aria-label={`Agregar reporte para el ${day} de ${monthNames[month]} de ${year}`}
                variant="calendarDay"
                size="calendarDay"
                onClick={() => onOpenModal({ proyectoId, mode: "create", fecha: dateKey(day) })}
              >
                <span>{day}</span><Plus className="h-3 w-3 text-muted-foreground" />
              </Button>
              </div>
            ) : <div className="mb-1 text-xs font-medium text-foreground md:text-sm">{day}</div>}
            <div className="space-y-1">
              {(byDate[dateKey(day)] ?? []).slice(0, 3).map((entry) => (
                <Button
                  key={entry.client_id}
                  type="button"
                  variant="calendarEntry"
                  size="calendarEntry"
                  onClick={() => onOpenModal({ proyectoId, mode: "view", logEntry: entry })}
                >
                  <Eye className="h-3 w-3 shrink-0" /><span className="truncate">{entry.categoria}</span>
                </Button>
              ))}
            </div>
          </div>)}
      </div>
    </section>
  );
}
