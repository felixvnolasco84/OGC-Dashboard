import { useEffect, useRef } from "react";
import { NEXT_STATE, RFI_ACTION_LABELS, rfiActionBlocked, type RfiAction, type RfiConfirmation, type RfiDetail } from "./rfiActionReviewModel";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { formatRfiDate, formatRfiDateTime, formatRfiDueDistance } from "./rfiUi";

const STATES: Record<string, string> = { draft: "Borrador", pending_manager_review: "Pendiente de revisión", open: "Abierta", closed: "Cerrada (Resuelto)" };

export function RfiReviewSummary({ detail, action }: { detail: RfiDetail; action: RfiAction }) {
  const rfi = detail.rfi;
  const officialCount = detail.responses.filter((response) => response.is_official).length;
  return (
    <div className="space-y-3 rounded-[4px] border border-border bg-background p-4 text-sm [overflow-wrap:anywhere]">
      <p className="font-medium">{rfi.code} · {rfi.subject}</p>
      <p><span className="text-muted-foreground">Estado: </span>{STATES[rfi.status]} → <strong className="font-medium">{STATES[NEXT_STATE[action]]}</strong>{action === "official" && " · Se conserva"}</p>
      {action === "submit" && <p>Quedará pendiente de revisión de {rfi.manager?.name || "una persona responsable por seleccionar"}. Podrá seguir editándose con los permisos actuales; ya no podrá eliminarse como borrador.</p>}
      {action === "open" && <>
        <dl className="grid gap-3 sm:grid-cols-2">
          <ReviewTerm label="Responsable" value={rfi.manager?.name || "Sin responsable"} />
          <ReviewTerm label="Fecha límite" value={formatRfiDate(rfi.due_date)} />
          <ReviewTerm label="Asignados" value={rfi.assignees.map((user) => user.name).join(", ") || "Sin asignados"} />
          <ReviewTerm label="Visibilidad" value={rfi.is_private ? "Privada: creador, responsable, asignados, distribución y administradores con acceso" : "Personas con acceso al proyecto, según su rol"} />
        </dl>
        <p>Se habilitarán respuestas para las personas autorizadas. La pregunta, el plazo y la información general dejarán de ser editables.</p>
      </>}
      {action === "official" && <p>La respuesta seleccionada quedará como oficial y permitirá cerrar la RFI. Las otras respuestas oficiales conservarán su marca. La RFI seguirá abierta. Actualmente no existe una acción para quitar esta marca.</p>}
      {action === "close" && <p>{officialCount > 0 ? <>Se cerrará con {officialCount} respuesta{officialCount === 1 ? "" : "s"} oficial{officialCount === 1 ? "" : "es"}.</> : "Para cerrar necesita al menos una respuesta oficial."} Al cerrar ya no admitirá nuevas respuestas ni adjuntos. Las respuestas y el historial se conservarán.</p>}
      {action === "reopen" && <>
        <p>Volverá a admitir respuestas y adjuntos según los permisos. Se conservarán las respuestas oficiales, las personas asignadas y la fecha límite: {formatRfiDate(rfi.due_date)}.</p>
        <p className="font-medium">{formatRfiDueDistance(rfi.due_date)}</p>
      </>}
      <p className="text-xs text-muted-foreground">La acción quedará registrada en el historial.</p>
    </div>
  );
}

function ReviewTerm({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1">{value}</dd></div>;
}

function ReviewedResponse({ response }: { response: RfiDetail["responses"][number] }) {
  return (
    <article className="space-y-3 rounded-[4px] border border-border p-4 text-sm [overflow-wrap:anywhere]">
      <p className="font-medium">{response.author_name} <span className="font-normal text-muted-foreground">· {formatRfiDateTime(response.created_at)}</span></p>
      <p className="whitespace-pre-wrap leading-6">{response.body}</p>
      {response.attachments.length > 0 && <ul className="space-y-2">{response.attachments.map((attachment) => <li key={attachment._id}>{attachment.url ? <a className="underline underline-offset-4" href={attachment.url} target="_blank" rel="noreferrer">{attachment.nombre}</a> : attachment.nombre}</li>)}</ul>}
    </article>
  );
}

export function RfiActionReviewDialog({ detail, liveDetail, action, responseId, busy, error, rejected, distributionNames, onCancel, onRefresh, onConfirm, onRestoreFocus }: {
  detail: RfiDetail; liveDetail: RfiDetail; action: RfiConfirmation; responseId?: string;
  busy: boolean; error: string | null; rejected: boolean; distributionNames: string;
  onCancel: () => void; onRefresh: () => void; onConfirm: () => void; onRestoreFocus: () => void;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (error && !busy) errorRef.current?.focus(); }, [error, busy]);
  const stale = rejected || detail.review_snapshot !== liveDetail.review_snapshot;
  const blocked = rfiActionBlocked(liveDetail, action, responseId);
  const unofficialCount = detail.responses.filter((response) => !response.is_official).length;
  const responses = detail.responses.filter((response) => action === "official" ? response._id === responseId : response.is_official);
  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onCancel(); }}>
      <DialogContent className="max-w-2xl rounded-[4px] p-4 sm:p-6 [&_button]:min-h-11" onOpenAutoFocus={(event) => { event.preventDefault(); titleRef.current?.focus(); }} onCloseAutoFocus={(event) => { event.preventDefault(); onRestoreFocus(); }} onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }} onInteractOutside={(event) => { if (busy) event.preventDefault(); }}>
        <DialogHeader>
          <DialogTitle ref={titleRef} tabIndex={-1}>{RFI_ACTION_LABELS[action]}</DialogTitle>
          <DialogDescription>Revisa la información y sus consecuencias antes de aplicar.</DialogDescription>
        </DialogHeader>
        <RfiReviewSummary detail={detail} action={action} />
        {action === "open" && <>
          <p className="text-sm [overflow-wrap:anywhere]"><span className="text-muted-foreground">Distribución: </span>{distributionNames || "Sin lista de distribución"}</p>
          <div className="text-sm [overflow-wrap:anywhere]"><p className="font-medium">Pregunta</p><p className="mt-2 whitespace-pre-wrap">{detail.rfi.question}</p></div>
        </>}
        {action !== "open" && <div className="space-y-3"><p className="text-sm font-medium">{action === "official" ? "Respuesta seleccionada" : "Respuestas oficiales"}</p>{responses.map((response) => <ReviewedResponse key={response._id} response={response} />)}</div>}
        {action === "close" && detail.responses.some((response) => !response.is_official) && <p className="text-sm text-muted-foreground">Hay {unofficialCount} respuesta{unofficialCount === 1 ? "" : "s"} sin marca oficial. Se conservará{unofficialCount === 1 ? "" : "n"} al cerrar.</p>}
        {!busy && stale && <div role="status" className="space-y-2 border border-border p-3 text-sm"><p>La RFI cambió mientras la revisabas. Actualiza la revisión antes de continuar.</p><Button type="button" variant="outline" onClick={onRefresh}>Actualizar revisión</Button></div>}
        {!busy && blocked && <p role="status" className="text-sm">{blocked}</p>}
        {error && <p ref={errorRef} tabIndex={-1} role="alert" className="text-sm text-destructive">{error}</p>}
        <p role="status" className="sr-only">{busy ? "Aplicando la acción. Espera a que finalice." : ""}</p>
        <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>Cancelar</Button>
          <Button type="button" onClick={onConfirm} disabled={busy || stale || !!blocked}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}{busy ? "Aplicando…" : RFI_ACTION_LABELS[action]}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
