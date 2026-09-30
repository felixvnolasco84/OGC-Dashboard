import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import ProgramaObraExecution, { type ExecutionProgram } from "../../src/pages/Programa Obra/ProgramaObraExecution";
import ProgramaObraImportReview from "../../src/pages/Programa Obra/ProgramaObraImportReview";
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
createRoot(document.getElementById("root")!).render(<React.StrictMode><Preview /></React.StrictMode>);
