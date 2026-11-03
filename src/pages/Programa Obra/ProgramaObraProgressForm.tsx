import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { recordedProgressBlockers } from "@/lib/programa-obra-rules";
import { resolveProgressRecord, type ProgressInput, type ProgressRecord } from "@/lib/programa-obra-progress";
import type { ExecutionProgram } from "./ProgramaObraExecution";

export type { ProgressInput } from "@/lib/programa-obra-progress";
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
  const [date, setDate] = useState(record.progress_as_of ?? "");
  const [finish, setFinish] = useState(record.actual_finish ?? "");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const requested = Number(progress);
  const values: ProgressInput = { progress: requested, execution_date: date || undefined, actual_start: start || undefined, actual_finish: requested === 100 ? finish || undefined : undefined, reason: reason.trim() || undefined };
  let validation = "";
  let blockers: ReturnType<typeof recordedProgressBlockers> = [];
  try {
    if (!progress.trim()) throw new Error("Escribe el avance acumulado.");
    const resolved = resolveProgressRecord(record, values, today);
    if (model && resolved.correctsKnownDates && !model.capabilities.plan) throw new Error("Necesitas autorización de planificación para corregir fechas registradas.");
    if (model?.config?.enabled && activity) blockers = recordedProgressBlockers(activity, requested, resolved, model.activities, model.dependencies, model.requirements, model.calendar, today);
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
        <label className="min-w-0 space-y-1.5 text-xs text-muted-foreground"><span>Inicio real · opcional</span><Input type="date" max={today} value={start} disabled={!!model && !!record.actual_start && !model.capabilities.plan} onChange={(e) => { setStart(e.target.value); setError(""); }} /></label>
        <label className="min-w-0 space-y-1.5 text-xs text-muted-foreground"><span>Avance acumulado (%)</span><Input type="number" min={0} max={100} step="any" value={progress} onChange={(e) => { setProgress(e.target.value); setError(""); }} /></label>
        <label className="min-w-0 space-y-1.5 text-xs text-muted-foreground"><span>Avance al día · opcional</span><Input type="date" max={today} value={date} onChange={(e) => { setDate(e.target.value); setError(""); }} /></label>
        {requested === 100 && <label className="min-w-0 space-y-1.5 text-xs text-muted-foreground"><span>Terminación real · opcional</span><Input type="date" min={start || record.actual_start || undefined} max={date || record.progress_as_of || today} value={finish} disabled={!!model && !!record.actual_finish && !model.capabilities.plan} onChange={(e) => { setFinish(e.target.value); setError(""); }} /></label>}
        <label className="min-w-0 space-y-1.5 text-xs text-muted-foreground sm:col-span-2"><span>Motivo · obligatorio para corregir o solicitar excepción</span><Input value={reason} maxLength={2000} onChange={(e) => { setReason(e.target.value); setError(""); }} /></label>
      </fieldset>
      <p className="text-xs text-muted-foreground">Puedes guardar solo el porcentaje. Las fechas son opcionales: si las dejas vacías, se conservan las ya registradas y las desconocidas quedan sin fecha.</p>
      {blocked && <p className="text-sm" role="status">{blockers.map((b) => b.message).join(" ")}</p>}
      {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
      <Button type="submit" disabled={disabled}>{saving && <Loader2 className="h-4 w-4 animate-spin" />}{requestException ? "Solicitar excepción para este avance" : "Guardar avance"}</Button>
    </form>
  );
}
