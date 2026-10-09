import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import ProgramaObraExecution, { type ExecutionProgram } from "../../src/pages/Programa Obra/ProgramaObraExecution";
import ProgramaObraImportReview from "../../src/pages/Programa Obra/ProgramaObraImportReview";
import ProgramaObraProgressEditor from "../../src/pages/Programa Obra/ProgramaObraProgressEditor";
import ProgramaObraMobileList from "../../src/pages/Programa Obra/ProgramaObraMobileList";
import ProgramaObraGanttItem from "../../src/pages/Programa Obra/ProgramaObraGanttItem";
import { TooltipProvider } from "../../src/components/ui/tooltip";
import { getRecordedProgressTiming } from "../../src/lib/programa-obra-progress";
import type { ProgramaItem } from "../../src/pages/Programa Obra/programa-obra-types";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { activityBlockers, activityReleased, activityStatus, activityDelayed, programToday, DEFAULT_PROGRAM_CALENDAR } from "../../src/lib/programa-obra-rules";
import "../../src/index.css";

const today = programToday();
const activities = [
  { _id: "pruebas2", name: "Pruebas hidrosanitarias", front_id: "floor2", progress: 100, requires_review: true, actual_finish: today },
  { _id: "muebles2", name: "Instalación de muebles", front_id: "floor2", progress: 0, requires_review: false },
  { _id: "pruebas3", name: "Pruebas hidrosanitarias", front_id: "floor3", progress: 10, requires_review: false },
  { _id: "trazo", name: "Trazo de ejes", front_id: "general", progress: 0, requires_review: false },
].map((a) => ({ ...a, proyecto: "project", detalle_id: a._id, partida_name: "Instalaciones", share: 100, mandatory: true, archived: false, responsible_id: "supervisor", current_start: "2026-09-01", current_finish: "2026-09-30" }));
const dependencies = [{ _id: "edge", proyecto: "project", predecessor_id: "pruebas2", successor_id: "muebles2", kind: "FS" as const, lag_days: 0, lag_unit: "working" as const }];
const isViewer = new URLSearchParams(location.search).has("viewer");
const model = {
  config: { enabled: true, version: 1 }, calendar: DEFAULT_PROGRAM_CALENDAR, today,
  activities: activities.map((a) => { const blockers = activityBlockers(a, activities, dependencies, [], today); return { ...a, blockers, status: activityStatus(a, blockers), released: activityReleased(a), delayed: activityDelayed(a, today) }; }),
  fronts: [{ _id: "floor2", name: "Piso 2" }, { _id: "floor3", name: "Piso 3" }, { _id: "general", name: "General" }],
  dependencies, requirements: [], exceptions: [], events: [], revisions: [], permissions: [], users: [{ _id: "supervisor", name: "Supervisor de instalaciones" }],
  capabilities: { admin: false, write: !isViewer, plan: false, accept: false, exceptions: false },
  summaries: { overall: { progress: 27.5, planned: 80, provisional: true } },
} as unknown as ExecutionProgram;
function Preview() {
  const [selected, setSelected] = useState<string | null>(null);
  const progressMode = new URLSearchParams(location.search).get("progress");
  if (progressMode) return <ProgressPreview mode={progressMode} />;
  if (new URLSearchParams(location.search).has("import")) return <ProgramaObraImportReview
    proyecto={"project" as Id<"desarrollos">}
    rows={[{ nivel: 2, partida: "Instalaciones", familia: "Pruebas nuevas" }]}
    schedules={[]}
    details={[{ _id: "familyA", nivel: 2, partida: "Instalaciones", familia: "Pruebas", archived: false } as unknown as Doc<"programa_obra_detalle">]}
    busy={false}
    onCancel={() => {}}
    onApply={async (rows) => { (window as unknown as { importedRows: unknown }).importedRows = rows; }}
  />;
  return <main data-viewer-readonly={isViewer ? "true" : undefined}><ProgramaObraExecution model={model} proyecto={"project" as ExecutionProgram["activities"][number]["proyecto"]} selectedId={selected} onSelect={setSelected} onClose={() => setSelected(null)} /></main>;
}
function ProgressPreview({ mode }: { mode: string }) {
  const [open, setOpen] = useState(false);
  const [record, setRecord] = useState({ progress: 0, actual_start: undefined as string | undefined, actual_finish: undefined as string | undefined, progress_as_of: undefined as string | undefined });
  useEffect(() => {
    const update = (event: Event) => {
      const { name, args } = (event as CustomEvent).detail;
      if (/updateDetalleAvance$|updateExecutionProgress$/.test(name)) setRecord({ progress: args.progress ?? args.avance_porcentaje, actual_start: args.actual_start, actual_finish: args.actual_finish, progress_as_of: args.execution_date });
    };
    window.addEventListener("programa-progress-test", update);
    return () => window.removeEventListener("programa-progress-test", update);
  }, []);
  const detail = { _id: "familyA", familia: "Colocación caliza", fecha_inicio: "01/09/2026", fecha_fin: "30/09/2026", avance_porcentaje: record.progress, ...record } as unknown as Doc<"programa_obra_detalle">;
  const item: ProgramaItem = { id: "fam-familyA", partida: "Colocación caliza", parentPartidaNombre: "Mármol", presupuesto: 0, pagado: 0, expanded: false, level: 1, children: [], detalleSchedule: detail, avanceReal: record.progress, isComplete: record.progress === 100, ...getRecordedProgressTiming(record.progress, record, []) };
  const progressModel = { ...model, config: { ...model.config, enabled: false }, capabilities: { ...model.capabilities, plan: true }, activities: mode === "legacy" ? [] : [ { ...model.activities[1], _id: "piso2", detalle_id: detail._id, share: mode === "multiple" ? 50 : 100, ...record }, ...(mode === "multiple" ? [{ ...model.activities[2], _id: "piso3", detalle_id: detail._id, progress: 35, actual_start: "2026-09-01", progress_as_of: "2026-09-15", share: 50 }] : []) ] } as ExecutionProgram;
  return <TooltipProvider><main className="mx-auto max-w-5xl p-4">
    <h1>Programa de obra · prueba de captura</h1>
    <button className="min-h-11 border px-3" style={{ display: innerWidth >= 850 ? "block" : "none" }} onClick={() => setOpen(true)}>Registrar avance de Colocación caliza</button>
    <ProgramaObraMobileList items={[item]} expandedIds={new Set()} filtersActive={false} currentTime={Date.parse(`${today}T12:00:00-06:00`)} canEdit renderActions={() => null} onToggle={() => {}} onMilestoneSelect={() => {}} onRegisterProgress={() => setOpen(true)} />
    <div data-testid="progress-gantt" className="relative mt-4 h-14 overflow-hidden"><ProgramaObraGanttItem item={item} columnWidth={24} timelineMonths={[{ label: "Septiembre", year: 2026, month: 8, weeks: 5 }, { label: "Octubre", year: 2026, month: 9, weeks: 5 }]} currentTime={Date.parse(`${today}T12:00:00-06:00`)} /></div>
    {open && <ProgramaObraProgressEditor item={item} model={progressModel} onClose={() => setOpen(false)} />}
  </main></TooltipProvider>;
}
createRoot(document.getElementById("root")!).render(<React.StrictMode><Preview /></React.StrictMode>);
