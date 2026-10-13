import { useEffect, useRef, useState } from "react";
import { useConvex, useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { PaymentEditContext, PaymentEditDraft, PaymentEditReview as Review } from "../../../convex/paymentEdit";
import { buildEditDraft, editForm, rebaseEditForm, type EditField } from "@/lib/payment-edit-draft";
import { formatMoney } from "@/lib/money";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import ProviderPaymentAccountPicker from "./ProviderPaymentAccountPicker";
import PaymentEditReview from "./PaymentEditReview";

type Props = { id: Id<"transacciones">; paymentId?: Id<"pagos">; contextIds: string[]; onClose: () => void };
function Message({ children }: { children: React.ReactNode }) {
  return <div role="alert" className="border border-danger-border bg-danger-muted p-3 text-sm text-danger">{children}</div>;
}
export default function PaymentEditSheet(props: Props) {
  const data = useQuery(api.transacciones.getEditContext, { id: props.id });
  const [initial, setInitial] = useState<PaymentEditContext | null>(null);
  useEffect(() => { if (!initial && data?.status === "ready") setInitial(data.context); }, [data, initial]);
  if (initial) return <EditSession {...props} initial={initial} current={data?.status === "ready" ? data.context : initial} accessError={data?.status === "error" ? data.message : ""} />;
  return <Sheet open onOpenChange={open => !open && props.onClose()}><SheetContent className="overflow-hidden sm:max-w-[640px]">
    <SheetHeader><SheetTitle>Editar {props.paymentId ? "concepto de pago" : "transacción"}</SheetTitle><SheetDescription>Consulta de la transacción completa.</SheetDescription></SheetHeader>
    <div className="mt-6">{data?.status === "error" ? <Message>{data.message}</Message> : <p role="status" className="flex gap-2"><Loader2 className="h-4 w-4 animate-spin" />Cargando todos los conceptos…</p>}</div>
    <Button className="mt-4" variant="outline" onClick={props.onClose}>Cerrar</Button>
  </SheetContent></Sheet>;
}

function EditSession({ initial, current, paymentId, contextIds, onClose, accessError }: Props & { initial: PaymentEditContext; current: PaymentEditContext; accessError: string }) {
  const [base, setBase] = useState(initial);
  const [form, setForm] = useState(() => editForm(initial.transaction));
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [reviewing, setReviewing] = useState(false);
  const [accepted, setAccepted] = useState<Review | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [error, setError] = useState("");
  const [discardOpen, setDiscardOpen] = useState(false);
  const save = useMutation(api.transacciones.saveEdit);
  const convex = useConvex();
  const providers = useQuery(api.proveedores.getAll, paymentId ? "skip" : {});
  let invalid = "";
  let draft: PaymentEditDraft | undefined;
  try { draft = buildEditDraft(base, form, amounts, paymentId); } catch (e) { invalid = (e as Error).message; }
  const changed = Boolean(draft && (draft.amounts.length || Object.keys(draft.fields).length));
  const dirty = changed || Boolean(invalid);
  const orphanAmounts = Object.keys(amounts).filter(id => !base.lineItems.some(p => p._id === id));
  const preview = useQuery(api.transacciones.previewEdit, reviewing && draft && !invalid ? { ...draft, expectedSource: base.source } : "skip");
  useEffect(() => { if (preview?.status === "ready" && !accepted) setAccepted(preview); }, [preview, accepted]);
  useEffect(() => { if (reviewing) titleRef.current?.focus(); }, [reviewing]);
  const stale = current.source !== base.source || preview?.status === "conflict" || (preview?.status === "ready" && accepted !== null && accepted.expectedScope !== preview.expectedScope);
  const safeToSave = !busy && !accessError && accepted && preview?.status === "ready" && accepted.expectedScope === preview.expectedScope && !stale && accepted.hasChanges;
  const setField = (field: EditField, value: string) => {
    setError(""); setAccepted(null);
    setForm(old => ({ ...old, [field]: value,
      ...(["banco", "numero_cuenta", "clabe"].includes(field) || field === "tipo_pago" && !["TRANSFERENCIA", "CHEQUE"].includes(value.toUpperCase()) ? { payment_account_id: "" } : {}),
      ...(field === "proveedor_id" ? { payment_account_id: "", banco: "", numero_cuenta: "", clabe: "" } : {}) }));
  };
  const requestClose = () => { if (pending.current) return; if (dirty) setDiscardOpen(true); else onClose(); };
  const refresh = () => {
    setForm(rebaseEditForm(base, current, form)); setBase(current); setAccepted(null); setError("");
    if (preview?.status === "ready" && current.source === base.source) setAccepted(preview);
  };
  const submit = async () => {
    if (!safeToSave || !draft || !accepted || pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try {
      await save({ ...draft, expectedSource: base.source, expectedScope: accepted.expectedScope });
      toast.success(paymentId ? "Concepto actualizado" : "Transacción actualizada", { description: "Todos los cambios se guardaron juntos." });
      onClose();
    } catch (e) {
      // A lost response may follow a committed save. Verify before allowing a retry.
      try {
        const latest = await convex.query(api.transacciones.getEditContext, { id: base.transaction._id });
        if (latest.status === "ready") {
          const after = accepted.after;
          const matchesFields = Object.keys(draft.fields).every(key => latest.context.transaction[key as keyof typeof after] === after[key as keyof typeof after]);
          const matchesAmounts = draft.amounts.every(a => latest.context.lineItems.some(p => p._id === a.id && p.monto === a.monto));
          if (matchesFields && matchesAmounts && latest.context.transaction.monto_total === after.monto_total) {
            toast.success("Los cambios ya están guardados"); onClose(); return;
          }
        }
      } catch { /* Keep the draft and require another review after connectivity returns. */ }
      setError(e instanceof Error ? e.message : "No se pudo guardar. Tu borrador se conserva.");
      setAccepted(null);
      setReviewing(false);
    } finally { pending.current = false; setBusy(false); }
  };
  const select = (field: EditField, label: string, choices: string[]) => <div className="space-y-2">
    <label id={`label-${field}`} className="text-sm font-medium">{label}</label>
    <Select value={form[field] || "__empty"} onValueChange={v => setField(field, v === "__empty" ? "" : v)}>
      <SelectTrigger aria-labelledby={`label-${field}`}><SelectValue /></SelectTrigger><SelectContent>
        {!choices.includes(form[field]) && form[field] && <SelectItem value={form[field]}>{form[field]} (actual)</SelectItem>}
        {choices.map(v => <SelectItem key={v || "__empty"} value={v || "__empty"}>{v || "Sin categoría"}</SelectItem>)}
      </SelectContent></Select>
  </div>;
  const input = (field: EditField, label: string, type = "text") => <div className="space-y-2"><label htmlFor={`edit-${field}`} className="text-sm font-medium">{label}</label>
    <Input id={`edit-${field}`} type={type} value={form[field]} onChange={e => setField(field, e.target.value)} /></div>;
  const visible = paymentId ? base.lineItems.filter(p => p._id === paymentId) : [...base.lineItems].sort((a, b) => Number(contextIds.includes(b._id)) - Number(contextIds.includes(a._id)));
  const total = base.lineItems.reduce((sum, p) => sum + (amounts[p._id] !== undefined && amounts[p._id].trim() && Number.isFinite(Number(amounts[p._id])) ? Number(amounts[p._id]) : p.monto), 0);
  return <Sheet open onOpenChange={open => !open && requestClose()}>
    <SheetContent data-square-modal="" className="w-full overflow-hidden sm:w-[680px] sm:max-w-[680px]" onEscapeKeyDown={e => { if (busy) e.preventDefault(); }} onInteractOutside={e => { if (busy) e.preventDefault(); }}>
      <SheetHeader><SheetTitle ref={titleRef} tabIndex={-1} className="focus:outline-none">{reviewing ? "Revisar cambios" : paymentId ? "Editar concepto de pago" : "Editar transacción"}</SheetTitle>
        <SheetDescription>{paymentId ? "Modifica sólo el monto seleccionado; revisa su efecto sobre la transacción completa." : "Edita la transacción completa. Los conceptos del contexto de origen están destacados."}</SheetDescription></SheetHeader>
      <div className="mt-5 space-y-5 pb-4">
        {error && <Message>{error}</Message>}
        {accessError && <Message>{accessError} Tu borrador se conserva.</Message>}
        {orphanAmounts.length > 0 && <Message>Hay conceptos eliminados por otra edición. <Button variant="outline" className="mt-2" onClick={() => setAmounts(old => Object.fromEntries(Object.entries(old).filter(([id]) => !orphanAmounts.includes(id))))}>Descartar cambios de conceptos eliminados</Button></Message>}
        {stale && <Message>Los datos cambiaron mientras editabas. Tu borrador se conserva. <Button className="mt-2" variant="outline" disabled={busy} onClick={refresh}>Actualizar base y revisión</Button></Message>}
        {reviewing ? <>
          {preview?.status === "error" && <Message>{preview.message}</Message>}
          {!preview && <p role="status" className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Calculando impacto sin guardar…</p>}
          {accepted && <PaymentEditReview review={accepted} contextIds={contextIds} />}
        </> : <fieldset disabled={busy || Boolean(accessError)} className="min-w-0 w-full space-y-6">
          <div className="border p-4"><p className="text-sm text-muted-foreground">Total completo de la transacción</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{formatMoney(total, form.moneda)} <span className="text-base">{form.moneda}</span></p>
            <p className="mt-2 text-xs text-muted-foreground">Antes: {formatMoney(base.transaction.monto_total, base.transaction.moneda)} {base.transaction.moneda} · {base.lineItems.length} conceptos</p>
            {contextIds.length < base.lineItems.length && <p className="mt-2 text-sm">{contextIds.length} concepto{contextIds.length === 1 ? "" : "s"} del contexto de origen; se incluyen todos en el total.</p>}
          </div>
          {paymentId ? <dl className="grid grid-cols-2 gap-3 border p-4 text-sm">{([ ["Estado", form.status], ["Fecha", form.fecha], ["Moneda", form.moneda], ["Método", form.tipo_pago] ] as const).map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd>{value}</dd></div>)}</dl> : <>
            <div className="grid gap-4 sm:grid-cols-2">{select("status", "Estado", ["Pagado", "Por pagar"])}{input("fecha", "Fecha", "date")}</div>
            <p className="text-xs text-muted-foreground">Estado, fecha y moneda afectan a toda la transacción.</p>
            <div className="space-y-2"><label id="provider-label" className="text-sm font-medium">Proveedor</label>
              <Select value={form.proveedor_id || "none"} onValueChange={v => setField("proveedor_id", v === "none" ? "" : v)}><SelectTrigger aria-labelledby="provider-label"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="none">Sin proveedor</SelectItem>{providers?.map(p => <SelectItem key={p._id} value={p._id}>{p.razon_social}{p.rfc ? ` · ${p.rfc}` : ""}</SelectItem>)}</SelectContent></Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">{select("tipo_pago", "Método de pago", ["EFECTIVO", "TRANSFERENCIA", "TARJETA", "CHEQUE"])}{select("moneda", "Moneda", ["MXN", "USD", "EUR"])}</div>
            {form.moneda !== "MXN" && input("tipo_cambio", "Tipo de cambio · MXN por unidad")}
            {form.moneda !== base.transaction.moneda && <p className="text-sm text-warning">Cambiar moneda conserva las cifras nominales; revisa el equivalente en MXN antes de confirmar.</p>}
            {select("categoria", "Categoría", ["", "ANTICIPO", "MATERIAL", "ESTIMACION", "OTRO"])}
            {form.tipo_pago.toUpperCase() !== "EFECTIVO" && <section className="space-y-4"><h3 className="font-semibold">Información bancaria</h3>
              {form.proveedor_id && ["TRANSFERENCIA", "CHEQUE"].includes(form.tipo_pago.toUpperCase()) && <ProviderPaymentAccountPicker projectId={base.transaction.proyecto}
                providerId={form.proveedor_id as Id<"proveedores">} method={form.tipo_pago.toLowerCase()} selectedId={form.payment_account_id as Id<"payment_accounts"> | ""}
                banco={form.banco} numeroCuenta={form.numero_cuenta} clabe={form.clabe} onSelect={id => setField("payment_account_id", id)} />}
              {!form.payment_account_id && <div className="grid gap-4 sm:grid-cols-2">{input("banco", "Banco")}{input("numero_cuenta", "Número de cuenta")}{input("clabe", "CLABE")}{form.tipo_pago.toUpperCase() === "TARJETA" && input("tarjeta", "Últimos cuatro dígitos de tarjeta")}</div>}
              {form.tipo_pago.toUpperCase() === "TRANSFERENCIA" && input("numero_transferencia", "Número de transferencia")}
            </section>}
            {input("codigo_referencia", "Referencia o notas")}
            <div className="grid gap-4 sm:grid-cols-2">{input("factura", "Factura")}{input("comprobante", "Comprobante")}</div>
          </>}
          <section className="space-y-3"><h3 className="font-semibold">{paymentId ? "Concepto seleccionado" : "Conceptos de la transacción"}</h3>
            {visible.length === 0 && <Message>El concepto seleccionado ya no existe.</Message>}
            {visible.map(p => <div key={p._id} className="space-y-2 border p-3">
              <label htmlFor={`amount-${p._id}`} className="block text-sm font-medium">{p.label}</label>
              {!paymentId && contextIds.includes(p._id) && <span className="text-xs text-muted-foreground">Contexto de origen</span>}
              <div className="flex items-center gap-3"><Input id={`amount-${p._id}`} inputMode="decimal" type="text" value={amounts[p._id] ?? String(p.monto)}
                onChange={e => { setAmounts(old => ({ ...old, [p._id]: e.target.value })); setError(""); }} className="min-w-0 flex-1 text-right" /><span className="text-sm">{form.moneda}</span></div>
              <p className="text-xs text-muted-foreground">Antes: {formatMoney(p.monto, base.transaction.moneda)} {base.transaction.moneda}</p>
            </div>)}
            <p className="text-xs text-muted-foreground">Se conservan las partidas asignadas. Los montos pueden ser positivos, cero o negativos.</p>
          </section>
          {invalid && <Message>{invalid}</Message>}
        </fieldset>}
      </div>
      <div className="sticky bottom-0 mt-auto flex flex-wrap justify-end gap-2 border-t bg-background py-4">
        <Button variant="outline" disabled={busy} onClick={requestClose}>Cancelar</Button>
        {reviewing ? <><Button variant="outline" disabled={busy} onClick={() => { setReviewing(false); setAccepted(null); setError(""); }}>Volver a editar</Button>
          <Button variant="inverse" disabled={!safeToSave} onClick={submit}>{busy ? "Guardando…" : "Confirmar actualización"}</Button></> :
          <Button variant="inverse" disabled={!changed || Boolean(invalid) || Boolean(accessError) || visible.length === 0} onClick={() => { setReviewing(true); setAccepted(null); setError(""); }}>Revisar cambios</Button>}
      </div>
    </SheetContent>
    <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}><AlertDialogContent data-square-modal=""><AlertDialogHeader><AlertDialogTitle>¿Descartar la edición?</AlertDialogTitle>
      <AlertDialogDescription>Los cambios del borrador no se han guardado. Las operaciones ya realizadas en la biblioteca de cuentas son independientes y se conservan.</AlertDialogDescription></AlertDialogHeader>
      <AlertDialogFooter><AlertDialogCancel>Continuar editando</AlertDialogCancel><AlertDialogAction onClick={onClose}>Descartar cambios</AlertDialogAction></AlertDialogFooter>
    </AlertDialogContent></AlertDialog>
  </Sheet>;
}
