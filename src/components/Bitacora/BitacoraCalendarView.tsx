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

  return <section className="border border-border bg-card p-4 md:p-6">
    <div className="mb-5 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3"><h2 className="text-xl font-medium">{monthNames[month]} {year}</h2><Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>Hoy</Button></div>
      <div className="flex"><Button variant="ghost" size="icon" onClick={() => setCurrentDate(new Date(year, month - 1, 1))}><ChevronLeft className="h-5 w-5" /></Button><Button variant="ghost" size="icon" onClick={() => setCurrentDate(new Date(year, month + 1, 1))}><ChevronRight className="h-5 w-5" /></Button></div>
    </div>
    <div className="grid grid-cols-7 border-l border-t border-border">
      {weekDays.map((day) => <div key={day} className="border-b border-r border-border bg-muted/40 p-2 text-center text-xs font-medium md:text-sm">{day}</div>)}
      {cells.map((day, index) => day === null
        ? <div key={`empty-${index}`} className="min-h-20 border-b border-r border-border bg-muted/10 md:min-h-32" />
        : <div key={day} className="group min-h-20 border-b border-r border-border p-1.5 md:min-h-32 md:p-2" onClick={() => canCreate && onOpenModal({ proyectoId, mode: "create", fecha: dateKey(day) })}>
          <div className="mb-1 flex items-center justify-between text-xs font-medium md:text-sm"><span>{day}</span>{canCreate && <Plus className="h-3 w-3 opacity-0 group-hover:opacity-100" />}</div>
          <div className="space-y-1">{(byDate[dateKey(day)] ?? []).slice(0, 3).map((entry) => <button key={entry.client_id} type="button" className="flex w-full items-center gap-1 truncate bg-blue-50 px-1.5 py-1 text-left text-[10px] text-blue-800 md:text-xs" onClick={(event) => { event.stopPropagation(); onOpenModal({ proyectoId, mode: "view", logEntry: entry }); }}><Eye className="h-3 w-3 shrink-0" /><span className="truncate">{entry.categoria}</span></button>)}</div>
        </div>)}
    </div>
  </section>;
}
