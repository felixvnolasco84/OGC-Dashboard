import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { recordedProgressBlockers } from "@/lib/programa-obra-rules";
import { resolveProgressRecord, type ProgressRecord } from "@/lib/programa-obra-progress";
import type { ExecutionProgram } from "./ProgramaObraExecution";

export type ProgressInput = {
  progress: number; execution_date: string; actual_start?: string; actual_finish?: string; reason?: string;
};
type Props = {
  record: ProgressRecord;
  today: string;
  model?: ExecutionProgram;
  activity?: ExecutionProgram["activities"][number];
  busy?: boolean;
  showHeading?: boolean;
  onSave: (values: ProgressInput, requestException: boolean) => Promise<boolean>;
};

export default function ProgramaObraProgressForm({ record, today, model, activity, busy = false, showHeading = true, onSave }: Props) {
  const [progress, setProgress] = useState(String(record.progress));
  const [start, setStart] = useState(record.actual_start ?? "");
  const [date, setDate] = useState(record.progress_as_of ?? today);
  const [finish, setFinish] = useState(record.actual_finish ?? (record.progress === 100 ? record.progress_as_of ?? today : ""));
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const requested = Number(progress);
  const values: ProgressInput = { progress: requested, execution_date: date, actual_start: start || undefined, actual_finish: requested === 100 ? finish || undefined : undefined, reason: reason.trim() || undefined };
  let validation = "";
  let blockers: ReturnType<typeof recordedProgressBlockers> = [];
  try {
    if (!progress.trim()) throw new Error("Escribe el avance acumulado.");
    if (requested > 0 && !start) throw new Error("Registra el inicio real de la actividad.");
    if (requested === 100 && !finish) throw new Error("Registra la terminación real.");
    const resolved = resolveProgressRecord(record, values, today);
    if (model && resolved.correctsKnownDates && !model.capabilities.plan) throw new Error("Necesitas autorización de planificación para corregir fechas registradas.");
    if (model?.config?.enabled && activity) blockers = recordedProgressBlockers(activity, requested, resolved, model.activities, model.dependencies, model.requirements, model.calendar);
  } catch (e) { validation = e instanceof Error ? e.message : "Revisa los datos."; }
  const blocked = blockers.length > 0;
  const requestException = blocked && requested > record.progress;
  const disabled = busy || saving;
  const save = async () => {
    if (validation || (blocked && !requestException) || (requestException && !reason.trim())) {
      setError(validation || (requestException ? "Explica el motivo para solicitar la excepción." : "Las fechas incumplen una relación del programa; revisa los bloqueos."));
      return;
    }
    setError(""); setSaving(true);
    try { await onSave(values, requestException); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar el avance."); }
    finally { setSaving(false); }
  };
  return (
    <form className="space-y-3" aria-label="Registrar avance" noValidate onSubmit={(event) => { event.preventDefault(); if (!disabled) void save(); }}>
      {showHeading && <h3 className="text-sm font-medium">Registrar avance</h3>}
      <fieldset disabled={disabled} className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="min-w-0 space-y-1.5 text-xs text-muted-foreground"><span>Inicio real</span><Input type="date" max={today} value={start} disabled={!!model && !!record.actual_start && !model.capabilities.plan} onChange={(e) => { setStart(e.target.value); setError(""); }} /></label>
        <label className="min-w-0 space-y-1.5 text-xs text-muted-foreground"><span>Avance acumulado (%)</span><Input type="number" min={0} max={100} step="any" value={progress} onChange={(e) => { setProgress(e.target.value); if (Number(e.target.value) === 100 && !finish) setFinish(record.actual_finish ?? date); setError(""); }} /></label>
        <label className="min-w-0 space-y-1.5 text-xs text-muted-foreground"><span>Avance al día</span><Input type="date" max={today} value={date} onChange={(e) => { if (!record.actual_finish && finish === date) setFinish(e.target.value); setDate(e.target.value); setError(""); }} /></label>
        {requested === 100 && <label className="min-w-0 space-y-1.5 text-xs text-muted-foreground"><span>Terminación real</span><Input type="date" min={start || undefined} max={date || today} value={finish} disabled={!!model && !!record.actual_finish && !model.capabilities.plan} onChange={(e) => { setFinish(e.target.value); setError(""); }} /></label>}
        <label className="min-w-0 space-y-1.5 text-xs text-muted-foreground sm:col-span-2"><span>Motivo · obligatorio para corregir o solicitar excepción</span><Input value={reason} maxLength={2000} onChange={(e) => { setReason(e.target.value); setError(""); }} /></label>
      </fieldset>
      <p className="text-xs text-muted-foreground">Registra cuándo se realizó el trabajo, aunque lo captures hoy. El porcentaje es el avance acumulado a la fecha indicada.</p>
      {blocked && <p className="text-sm" role="status">{blockers.map((b) => b.message).join(" ")}</p>}
      {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
      <Button type="submit" disabled={disabled}>{saving && <Loader2 className="h-4 w-4 animate-spin" />}{requestException ? "Solicitar excepción para este avance" : "Guardar avance"}</Button>
    </form>
  );
}
