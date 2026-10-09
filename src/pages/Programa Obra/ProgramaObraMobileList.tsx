import { type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProgramaItem, ProgramaMilestoneSummary } from "./programa-obra-types";
import { getProgramaItemSchedule, isProgramaItemDelayed } from "./programa-obra-status";
import { getMilestoneLabel, getMilestoneStatusClasses, getMilestoneStatusLabel } from "./programa-obra-milestone-ui";

type Props = {
  items: ProgramaItem[];
  expandedIds: Set<string>;
  filtersActive: boolean;
  currentTime: number;
  canEdit: boolean;
  renderActions: (item: ProgramaItem) => ReactNode;
  onToggle: (id: string) => void;
  onMilestoneSelect: (milestone: ProgramaMilestoneSummary) => void;
  onRegisterProgress: (item: ProgramaItem) => void;
  onOpenActivity?: (item: ProgramaItem) => void;
};

const currency = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });

function ActivityCard({ item, ...props }: Omit<Props, "items"> & { item: ProgramaItem }) {
  const schedule = getProgramaItemSchedule(item);
  const progress = item.avanceReal ?? 0;
  const complete = item.isComplete ?? progress >= 100;
  const delayed = isProgramaItemDelayed(item, props.currentTime);
  const status = complete ? "Terminada" : progress >= 100 ? "Pendientes de liberación" : delayed ? "Con retraso" : !schedule?.fecha_inicio || !schedule?.fecha_fin ? "Sin fechas completas" : progress > 0 ? "En ejecución" : "Pendiente";
  const expanded = props.filtersActive || props.expandedIds.has(item.id);
  return (
    <article className={cn("border-b border-border px-4 py-3", item.level === 1 && "ml-4 border-l bg-muted/20")} aria-label={`${item.level === 0 ? "Partida" : "Familia"}: ${item.partida}`}>
      <div className="flex items-start gap-2">
        {item.children.length > 0 ? (
          <button type="button" data-viewer-readonly-allow="true" className="flex min-h-11 min-w-0 flex-1 items-start gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-expanded={expanded} aria-label={`${expanded ? "Contraer" : "Expandir"} ${item.partida}`} disabled={props.filtersActive} onClick={() => props.onToggle(item.id)}>
            {expanded ? <ChevronDown className="mt-0.5 h-5 w-5 shrink-0" /> : <ChevronRight className="mt-0.5 h-5 w-5 shrink-0" />}
            <span className="break-words text-sm font-medium leading-5">{item.partida}</span>
          </button>
        ) : <h2 className="min-w-0 flex-1 break-words text-sm font-medium leading-5">{item.partida}</h2>}
        {props.renderActions(item)}
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        <span className={cn("px-2 py-1", complete ? "bg-green-50 text-green-800" : delayed ? "bg-red-50 text-red-800" : "bg-muted text-muted-foreground")}>{status}</span>
        {item.level === 0 && <span className="text-muted-foreground">Presupuesto {currency.format(item.presupuesto)}</span>}
      </div>
      <dl className="grid grid-cols-2 gap-2 text-xs">
        <div><dt className="text-muted-foreground">Inicio</dt><dd className="mt-0.5 text-foreground">{schedule?.fecha_inicio || "Sin fecha"}</dd></div>
        <div><dt className="text-muted-foreground">Fin programado</dt><dd className="mt-0.5 text-foreground">{schedule?.fecha_fin || "Sin fecha"}</dd></div>
        {item.level === 1 && <>
          <div><dt className="text-muted-foreground">Inicio real</dt><dd>{item.detalleSchedule?.actual_start ?? "Desconocido"}</dd></div>
          <div><dt className="text-muted-foreground">Avance al día</dt><dd>{item.detalleSchedule?.progress_as_of ?? "Sin fecha"}</dd></div>
          {item.detalleSchedule?.actual_finish && <div><dt className="text-muted-foreground">Terminación real</dt><dd>{item.detalleSchedule.actual_finish}</dd></div>}
        </>}
      </dl>
      <div className="mt-2">
        {item.level === 1 && props.canEdit && item.detalleSchedule ? (
          <button type="button" className="flex min-h-11 w-full items-center justify-between text-left text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Editar avance real de ${item.partida}, ${progress} por ciento`} onClick={() => props.onRegisterProgress(item)}><span>Avance físico · Editar</span><strong>{progress.toFixed(1)}%</strong></button>
        ) : <p className="flex min-h-9 items-center justify-between text-xs"><span className="text-muted-foreground">Avance físico</span><strong>{progress.toFixed(1)}%</strong></p>}
        <div role="progressbar" aria-label={`Avance físico de ${item.partida}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.max(0, progress))} className="h-1.5 bg-muted"><div className="h-full bg-green-700" style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} /></div>
      </div>
      {item.milestones && item.milestones.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {item.milestones.map((milestone) => <button key={milestone.kind} type="button" data-viewer-readonly-allow="true" className={cn("min-h-11 border px-2 py-1 text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", getMilestoneStatusClasses(milestone.status))} onClick={() => props.onMilestoneSelect(milestone)}><span className="block font-medium">{getMilestoneLabel(milestone.kind)} · {getMilestoneStatusLabel(milestone.status)}</span><span>{milestone.plannedDate}</span></button>)}
        </div>
      )}
    </article>
  );
}

export default function ProgramaObraMobileList({ items, ...props }: Props) {
  return <section className="min-[850px]:hidden" aria-label="Actividades del programa">{items.map((item) => <ActivityCard key={item.id} item={item} {...props} />)}</section>;
}
