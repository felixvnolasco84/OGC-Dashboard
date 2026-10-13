"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { useConvex, useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import * as z from "zod";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import type { PartidaEditImpact } from "../../../convex/partidaEdit";
import { partidaEditSource } from "../../../convex/partidaRules";
import { partidaEditDraft, partidaEditValues, rebasePartidaEdit, type PartidaEditValues } from "@/lib/partida-edit-draft";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { DialogFooter } from "../ui/dialog";
import { PartidaEditReview } from "../Presupuesto/PartidaEditReview";

type CloseRef = MutableRefObject<(() => void) | null>;
type RequestFormProps = { partida: Doc<"partidas">; level?: number; onClose?: () => void; closeRequestRef?: CloseRef };
function errorMessage(error: unknown) {
  return error instanceof ConvexError && typeof error.data === "string" ? error.data
    : error instanceof Error ? error.message.match(/Uncaught Error: ([^\n]+)/)?.[1] || error.message : "No se pudo completar la revisión.";
}

export default function EditPartidaForm({ partida, level = 2, onClose, closeRequestRef }: RequestFormProps) {
  const client = useConvex();
  const [context, setContext] = useState<{ target: Doc<"partidas">; source: string; currency: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useLayoutEffect(() => {
    if (!context && closeRequestRef) closeRequestRef.current = () => onClose?.();
  }, [context, closeRequestRef, onClose]);
  useEffect(() => {
    let active = true;
    setContext(null); setError(null);
    if (!partida.proyecto) { setError("El concepto no está vinculado a un proyecto."); return; }
    void client.query(api.partida.getEditContext, { id: partida._id, proyecto: partida.proyecto, nivel: level + 1 })
      .then(result => { if (active) setContext(result); })
      .catch(failure => { if (active) setError(errorMessage(failure)); });
    return () => { active = false; };
  }, [client, partida._id, partida.proyecto, level, attempt]);
  if (!context) return <div className="space-y-4">
    {error ? <div role="alert" className="space-y-3"><p className="text-sm text-destructive">{error}</p><Button type="button" variant="outline" onClick={() => setAttempt(n => n + 1)}>Reintentar</Button></div>
      : <p role="status" className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" />Cargando datos actuales…</p>}
    <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancelar</Button></DialogFooter>
  </div>;
  return <PartidaEditor key={context.target._id} initial={context} partida={partida} onClose={onClose} closeRequestRef={closeRequestRef} />;
}

function PartidaEditor({ initial, partida, onClose, closeRequestRef }: {
  initial: { target: Doc<"partidas">; source: string; currency: string }; partida: Doc<"partidas">; onClose?: () => void; closeRequestRef?: CloseRef;
}) {
  const client = useConvex();
  const update = useMutation(api.partida.update);
  const [base, setBase] = useState(initial.target);
  const [currency, setCurrency] = useState(initial.currency);
  const isLeaf = base.nivel === 3;
  const schema = useMemo(() => z.object({
    sub_partida: isLeaf ? z.string().trim().min(1, "El nombre de la subpartida es requerido") : z.string(),
    unidad: z.string(),
    cantidad: isLeaf ? z.number({ invalid_type_error: "Ingresa una cantidad válida" }).finite("Debe ser un número finito").min(0, "Debe ser mayor o igual a cero") : z.number(),
    precio_unitario: isLeaf ? z.number().finite("Debe ser un número finito").min(0, "Debe ser mayor o igual a cero") : z.number(),
    presupuesto_aprobado: z.number().finite("Debe ser un número finito").min(0, "Debe ser mayor o igual a cero"),
  }), [isLeaf]);
  const form = useForm<PartidaEditValues>({ resolver: zodResolver(schema), mode: "onChange", defaultValues: partidaEditValues(base) });
  const { isDirty } = form.formState;
  const values = useWatch({ control: form.control }) as PartidaEditValues;
  const valid = schema.safeParse(values).success;
  const changes = partidaEditDraft(base, values);
  const draftKey = JSON.stringify(changes);
  const hasChanges = Object.keys(changes).length > 0;
  const [review, setReview] = useState<{ key: string; impact: PartidaEditImpact } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const submitting = useRef(false);
  const mounted = useRef(true);
  const requestVersion = useRef(0);
  const invalidateRequests = useCallback(() => { requestVersion.current++; }, []);
  const previousProp = useRef(partidaEditSource(partida));
  const discardHeading = useRef<HTMLHeadingElement>(null);
  const identity = useMemo(() => ({ id: base._id, proyecto: base.proyecto!, nivel: base.nivel }), [base._id, base.proyecto, base.nivel]);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; invalidateRequests(); }; }, [invalidateRequests]);
  useEffect(() => { if (discard) discardHeading.current?.focus(); }, [discard]);
  const requestClose = useCallback(() => {
    if (submitting.current) return;
    if (isDirty) setDiscard(true); else onClose?.();
  }, [isDirty, onClose]);
  useLayoutEffect(() => {
    if (closeRequestRef) closeRequestRef.current = requestClose;
    return () => { if (closeRequestRef?.current === requestClose) closeRequestRef.current = null; };
  }, [closeRequestRef, requestClose]);

  useEffect(() => {
    const source = partidaEditSource(partida);
    if (source !== previousProp.current && source !== partidaEditSource(base) && !submitting.current) {
      requestVersion.current++;
      setReview(null); setConflict(true); setError("El concepto cambió mientras editabas. Actualiza la revisión; tus cambios se conservan.");
    }
    previousProp.current = source;
  }, [partida, base]);

  useEffect(() => {
    const version = ++requestVersion.current;
    if (saving) return;
    setReview(null); setLoading(false);
    if (conflict || refreshing) return;
    setError(null);
    if (!valid || !hasChanges) return;
    setLoading(true);
    const timer = window.setTimeout(() => {
      void client.query(api.partida.getEditImpact, { ...identity, changes: JSON.parse(draftKey) })
        .then(impact => {
          if (!mounted.current || version !== requestVersion.current) return;
          if (impact.source !== partidaEditSource(base)) {
            setConflict(true); setError("El concepto cambió mientras editabas. Actualiza la revisión; tus cambios se conservan."); return;
          }
          setCurrency(impact.currency); setReview({ key: draftKey, impact });
        })
        .catch(failure => { if (mounted.current && version === requestVersion.current) setError(errorMessage(failure)); })
        .finally(() => { if (mounted.current && version === requestVersion.current) setLoading(false); });
    }, 300);
    return () => { window.clearTimeout(timer); invalidateRequests(); };
  }, [client, identity, draftKey, base, valid, hasChanges, attempt, conflict, refreshing, saving, invalidateRequests]);

  const refresh = async () => {
    if (submitting.current || refreshing) return;
    requestVersion.current++; setReview(null); setRefreshing(true); setError(null);
    try {
      const current = await client.query(api.partida.getEditContext, identity);
      if (!mounted.current) return;
      const rebased = rebasePartidaEdit(base, current.target, form.getValues());
      form.reset(partidaEditValues(current.target));
      for (const field of Object.keys(rebased) as (keyof PartidaEditValues)[]) form.setValue(field, rebased[field], { shouldDirty: true, shouldValidate: true });
      setBase(current.target); setCurrency(current.currency); setConflict(false); setAttempt(n => n + 1);
    } catch (failure) { if (mounted.current) setError(errorMessage(failure)); }
    finally { if (mounted.current) setRefreshing(false); }
  };
  const currentReview = review?.key === draftKey ? review.impact : null;
  const canSave = valid && hasChanges && currentReview?.hasChanges && currentReview.source === partidaEditSource(base) && !loading && !error && !conflict && !refreshing && !saving;
  const submit = async () => {
    if (submitting.current || !canSave || !currentReview) return;
    submitting.current = true; setSaving(true); setError(null);
    try {
      await update({ ...identity, changes, expectedReview: currentReview.expectedReview });
      toast.success(base.nivel === 3 ? "Subpartida actualizada." : base.nivel === 2 ? "Familia actualizada." : "Partida actualizada.");
      onClose?.();
    } catch (failure) {
      if (mounted.current) { setReview(null); setConflict(true); setError(errorMessage(failure)); }
    } finally { submitting.current = false; if (mounted.current) setSaving(false); }
  };
  const disabled = saving || refreshing;
  return <Form {...form}>
    <form onSubmit={form.handleSubmit(submit)} className="min-h-0 flex flex-1 flex-col gap-4" noValidate>
      <div className="max-h-[65dvh] min-h-0 flex-1 overflow-y-auto pr-2 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2"><label htmlFor="partida-edit-root" className="text-sm font-medium">Partida</label><Input id="partida-edit-root" variant="muted" disabled value={base.nivel === 1 ? base.nombre : base.partida_nombre || base.nombre} /></div>
          {base.nivel > 1 && <div className="space-y-2"><label htmlFor="partida-edit-family" className="text-sm font-medium">Familia</label><Input id="partida-edit-family" variant="muted" disabled value={base.familia} /></div>}
        </div>
        {isLeaf && <FormField control={form.control} name="sub_partida" render={({ field }) => <FormItem><FormLabel>Subpartida</FormLabel><FormControl><Input {...field} disabled={disabled} /></FormControl><FormMessage /></FormItem>} />}
        <div className="border-t pt-4">
          <h3 className="text-sm font-medium mb-3">Información de costos</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField control={form.control} name="unidad" render={({ field }) => <FormItem><FormLabel>Unidad</FormLabel><FormControl><Input {...field} disabled={!isLeaf || disabled} variant={isLeaf ? "card" : "muted"} /></FormControl><FormMessage /></FormItem>} />
            <FormField control={form.control} name="cantidad" render={({ field }) => <FormItem><FormLabel>Cantidad</FormLabel><FormControl><Input {...field} type="number" step="any" value={Number.isNaN(field.value) ? "" : field.value} onChange={e => field.onChange(e.currentTarget.valueAsNumber)} disabled={!isLeaf || disabled} variant={isLeaf ? "card" : "muted"} /></FormControl><FormMessage /></FormItem>} />
            <FormField control={form.control} name="precio_unitario" render={({ field }) => <FormItem><FormLabel>Precio unitario</FormLabel><FormControl><MoneyInput {...field} currency={currency} disabled={!isLeaf || disabled} variant={isLeaf ? "card" : "muted"} /></FormControl><FormMessage /></FormItem>} />
          </div>
          {isLeaf && <p className="mt-3 text-xs text-muted-foreground">Cantidad y precio unitario no modifican automáticamente el presupuesto aprobado.</p>}
        </div>
        <div className="border-t pt-4">
          <h3 className="text-sm font-medium mb-3">Estado presupuestal</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2"><label htmlFor="partida-edit-original" className="text-sm font-medium">Presupuesto original</label><MoneyInput id="partida-edit-original" currency={currency} disabled variant="muted" value={base.presupuesto_original} /></div>
            <FormField control={form.control} name="presupuesto_aprobado" render={({ field }) => <FormItem><FormLabel>Presupuesto aprobado</FormLabel><FormControl><MoneyInput {...field} currency={currency} disabled={disabled} variant="card" /></FormControl><FormMessage /></FormItem>} />
            <div className="space-y-2"><label htmlFor="partida-edit-paid" className="text-sm font-medium">Pagado registrado</label><MoneyInput id="partida-edit-paid" currency={currency} disabled variant="muted" value={base.pagado} /><p className="text-xs text-muted-foreground">Se conserva al guardar.</p></div>
          </div>
        </div>
        {loading && <p role="status" className="flex gap-2 items-center text-sm"><Loader2 className="h-4 w-4 animate-spin" />Revisando impacto…</p>}
        {error && <div role="alert" className="border border-border p-3 space-y-3"><p className="text-sm text-destructive">{error}</p><Button type="button" variant="outline" disabled={disabled} onClick={() => conflict ? void refresh() : setAttempt(n => n + 1)}>{refreshing ? "Actualizando revisión…" : conflict ? "Actualizar revisión" : "Reintentar revisión"}</Button></div>}
        {!hasChanges && <p role="status" className="text-sm text-muted-foreground">No hay cambios para guardar.</p>}
        {currentReview && <PartidaEditReview impact={currentReview} />}
      </div>
      {discard ? <div className="shrink-0 border border-border p-3 space-y-3" role="region" aria-label="Cambios pendientes">
        <h3 ref={discardHeading} tabIndex={-1} className="text-sm font-medium">Hay cambios sin guardar</h3>
        <p className="text-sm text-muted-foreground">Al descartarlos, el presupuesto se conserva como está.</p>
        <DialogFooter><Button type="button" variant="outline" onClick={() => { setDiscard(false); form.setFocus("presupuesto_aprobado"); }}>Seguir editando</Button><Button type="button" onClick={onClose}>Descartar cambios</Button></DialogFooter>
      </div> : <DialogFooter className="shrink-0"><Button type="button" variant="outline" disabled={saving} onClick={requestClose}>Cancelar</Button><Button type="submit" disabled={!canSave} aria-busy={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />}{saving ? "Guardando…" : "Actualizar"}</Button></DialogFooter>}
    </form>
  </Form>;
}
