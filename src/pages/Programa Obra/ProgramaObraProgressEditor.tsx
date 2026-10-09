import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { programToday } from "@/lib/programa-obra-rules";
import type { ProgramaItem } from "./programa-obra-types";
import type { ExecutionProgram } from "./ProgramaObraExecution";
import ProgramaObraProgressForm from "./ProgramaObraProgressForm";

export default function ProgramaObraProgressEditor({ item, model, onClose }: { item: ProgramaItem; model?: ExecutionProgram; onClose: () => void }) {
  const detail = item.detalleSchedule!;
  const activities = model?.activities.filter((a) => a.detalle_id === detail._id) ?? [];
  const [selected, setSelected] = useState(activities.length === 1 ? activities[0]._id : "");
  const [busy, setBusy] = useState(false);
  const activity = activities.find((a) => a._id === selected);
  const updateDetail = useMutation(api.programa_obra.updateDetalleAvance);
  const updateActivity = useMutation(api.programa_obra.updateExecutionProgress);
  const request = useMutation(api.programa_obra.requestExecutionException);
  return <Sheet open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <SheetContent className="w-full overflow-y-auto sm:max-w-[480px]">
      <SheetHeader><SheetTitle className="text-left">Registrar avance</SheetTitle><SheetDescription className="text-left">{item.parentPartidaNombre ? `${item.parentPartidaNombre} / ` : ""}{item.partida}</SheetDescription></SheetHeader>
      <div className="mt-6 space-y-4">
        {activities.length > 1 && <div className="space-y-2"><p className="text-sm">Selecciona el frente cuyo avance vas a registrar.</p><Select value={selected} onValueChange={setSelected} disabled={busy}><SelectTrigger aria-label="Frente de ejecución"><SelectValue placeholder="Seleccionar frente" /></SelectTrigger><SelectContent>{activities.map((a) => <SelectItem key={a._id} value={a._id}>{model?.fronts.find((f) => f._id === a.front_id)?.name} · {a.name} · {a.progress}%</SelectItem>)}</SelectContent></Select></div>}
        {(activities.length === 0 || activity) && <ProgramaObraProgressForm showHeading={false} key={activity?._id ?? detail._id} record={activity ?? { ...detail, progress: detail.avance_porcentaje ?? 0 }} today={model?.today ?? programToday()} model={activity ? model : undefined} activity={activity} busy={busy} onSave={async (values, exception) => {
          setBusy(true);
          try {
            if (activity) {
              if (exception) await request({ activity_id: activity._id, ...values, reason: values.reason! });
              else await updateActivity({ activity_id: activity._id, ...values });
            } else {
              const { progress, ...dates } = values;
              await updateDetail({ detalle_id: detail._id, avance_porcentaje: progress, ...dates });
            }
            toast.success(exception ? "Excepción solicitada; el avance espera autorización" : "Avance registrado");
            onClose(); return true;
          } finally { setBusy(false); }
        }} />}
      </div>
    </SheetContent>
  </Sheet>;
}
