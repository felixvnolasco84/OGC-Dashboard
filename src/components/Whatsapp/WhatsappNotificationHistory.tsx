import type { Doc } from "../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";

const labels: Record<string, string> = {
  pending: "Pendiente", queued: "En cola", sending: "Procesando", accepted: "Aceptado por WhatsApp",
  sent: "Enviado", delivered: "Entregado", read: "Leído", failed: "Fallido", skipped: "Omitido",
  unknown: "Requiere revisión", needs_review: "Requiere revisión", partial: "Parcial", no_recipients: "Sin destinatarios habilitados",
};
export default function WhatsappNotificationHistory({ event }: { event: Doc<"notification_events"> & { deliveries: Doc<"notification_deliveries">[] } }) {
  return <div className="space-y-3 border border-border bg-card p-3">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="break-words text-sm font-medium">{event.subject}</p>
        <p className="mt-1 text-xs text-muted-foreground">WhatsApp · {event.actor_name} · {new Date(event.created_at).toLocaleString("es-MX")}</p>
      </div>
      <Badge variant="secondary" className="rounded-none text-[10px]">{labels[event.status] || event.status}</Badge>
    </div>
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <span>Entregados: {event.deliveries.filter(d => d.delivered_at).length}</span>
      <span>Leídos: {event.deliveries.filter(d => d.provider_read_at).length}</span>
      <span>Fallidos: {event.failed_count}</span>
      <span>Omitidos: {event.deliveries.filter(d => d.status === "skipped").length}</span>
    </div>
    {event.deliveries.length === 0 && <p className="text-xs text-muted-foreground">Sin destinatarios para este evento.</p>}
    {event.deliveries.map(delivery => <div key={delivery._id} className="space-y-1 border-t border-border pt-2 text-xs">
      <div className="flex flex-wrap justify-between gap-2"><span>{delivery.recipient_name}{delivery.recipient_phone ? ` · •••• ${delivery.recipient_phone.slice(-4)}` : ""}</span><span>{labels[delivery.status] || delivery.status}</span></div>
      {(delivery.error || delivery.provider_error) && <p className="break-words text-muted-foreground">{delivery.error || delivery.provider_error}</p>}
    </div>)}
    <p className="text-xs text-muted-foreground">Aceptado no confirma entrega. Las confirmaciones de WhatsApp pueden llegar después o no estar disponibles.</p>
  </div>;
}
