import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useNavigate } from "react-router";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  FileText,
  Loader2,
  SearchX,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useTransactionDetailsModal } from "@/hooks/transaction-details-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { ProgramaMilestoneSummary } from "./programa-obra-types";
import {
  getMilestoneLabel,
  getMilestoneStatusClasses,
  getMilestoneStatusLabel,
} from "./programa-obra-milestone-ui";

function formatCurrency(value?: number) {
  if (value == null) return "—";
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(value);
}

function relativeDate(daysUntil: number | null) {
  if (daysUntil == null) return "Fecha no válida";
  if (daysUntil === 0) return "Hoy";
  if (daysUntil === 1) return "Mañana";
  if (daysUntil > 1) return `En ${daysUntil} días`;
  if (daysUntil === -1) return "Hace 1 día";
  return `Hace ${Math.abs(daysUntil)} días`;
}

function AlertGroup({
  title,
  items,
  onSelect,
}: {
  title: string;
  items: ProgramaMilestoneSummary[];
  onSelect: (milestone: ProgramaMilestoneSummary) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section aria-label={title} className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
        <span className="text-xs text-disabled-foreground">{items.length}</span>
      </div>
      <div className="space-y-2">
        {items.map((milestone) => (
          <button
            key={`${milestone.scheduleId}-${milestone.kind}`}
            type="button"
            className="w-full border border-border bg-card p-3 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => onSelect(milestone)}
            aria-label={`Abrir ${getMilestoneLabel(milestone.kind)} de ${milestone.partidaName}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{milestone.partidaName}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {getMilestoneLabel(milestone.kind)} · {milestone.plannedDate}
                </p>
              </div>
              <Badge variant="outline" className={cn("shrink-0 rounded-none", getMilestoneStatusClasses(milestone.status))}>
                {getMilestoneStatusLabel(milestone.status)}
              </Badge>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>{relativeDate(milestone.daysUntil)}</span>
              <span>{milestone.evidenceCount} evidencia{milestone.evidenceCount === 1 ? "" : "s"}</span>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

export function ProgramaObraAlertsPanel({
  open,
  onOpenChange,
  milestones,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  milestones: ProgramaMilestoneSummary[];
  onSelect: (milestone: ProgramaMilestoneSummary) => void;
}) {
  const actionable = milestones
    .filter((milestone) => milestone.actionable)
    .sort((a, b) => (a.daysUntil ?? Number.MAX_SAFE_INTEGER) - (b.daysUntil ?? Number.MAX_SAFE_INTEGER));
  const overdue = actionable.filter((milestone) =>
    ["overdue", "due_today", "partial", "missing_evidence"].includes(milestone.status),
  );
  const review = actionable.filter((milestone) => milestone.status === "review_required");
  const upcoming = actionable.filter((milestone) => milestone.status === "upcoming");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-[460px]" data-viewer-readonly-allow="true">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-left">
            <CalendarClock className="h-5 w-5" /> Alertas del programa
          </SheetTitle>
          <SheetDescription className="text-left">
            Hitos que requieren atención en este proyecto. El contador muestra pendientes, no mensajes sin leer.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {actionable.length === 0 ? (
            <div className="border border-dashed border-border px-6 py-10 text-center">
              <CheckCircle2 className="mx-auto h-8 w-8 text-green-700" />
              <p className="mt-3 text-sm font-medium text-foreground">No hay alertas pendientes</p>
              <p className="mt-1 text-xs text-muted-foreground">Los hitos configurados están fuera de su ventana o completados con evidencia.</p>
            </div>
          ) : (
            <>
              <AlertGroup title="Vencidas" items={overdue} onSelect={onSelect} />
              <AlertGroup title="Requieren revisión" items={review} onSelect={onSelect} />
              <AlertGroup title="Próximas" items={upcoming} onSelect={onSelect} />
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function ProgramaObraMilestoneDetail({
  milestone,
  proyectoId,
  onClose,
}: {
  milestone: ProgramaMilestoneSummary;
  proyectoId: Id<"desarrollos">;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const openTransaction = useTransactionDetailsModal((state) => state.onOpen);
  const setDecision = useMutation(api.programa_obra.setMilestoneLinkDecision);
  const detail = useQuery(api.programa_obra.getMilestoneDetail, {
    schedule_id: milestone.scheduleId,
    hito: milestone.kind,
  });
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const handleDecision = async (
    sourceType: "transaccion" | "requisicion",
    sourceId: Id<"transacciones"> | Id<"requisiciones">,
    decision: "confirmed" | "rejected",
  ) => {
    setSavingKey(`${sourceType}-${sourceId}-${decision}`);
    try {
      await setDecision({
        schedule_id: milestone.scheduleId,
        hito: milestone.kind,
        source_type: sourceType,
        transaccion_id: sourceType === "transaccion" ? sourceId as Id<"transacciones"> : undefined,
        requisicion_id: sourceType === "requisicion" ? sourceId as Id<"requisiciones"> : undefined,
        decision,
      });
      toast.success(decision === "confirmed" ? "Fuente confirmada" : "Fuente descartada");
    } catch (error) {
      toast.error("No se pudo actualizar la vinculación", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-[620px]" data-viewer-readonly-allow="true">
        <SheetHeader>
          <SheetTitle className="text-left">{getMilestoneLabel(milestone.kind)} · {milestone.partidaName}</SheetTitle>
          <SheetDescription className="text-left">
            Programado para {milestone.plannedDate} · recordatorio {milestone.reminderDays} días antes
          </SheetDescription>
        </SheetHeader>

        {detail === undefined ? (
          <div className="mt-6 space-y-3">
            <Skeleton className="h-20 w-full rounded-none" />
            <Skeleton className="h-32 w-full rounded-none" />
          </div>
        ) : detail === null ? (
          <div className="mt-8 border border-dashed border-border p-8 text-center">
            <SearchX className="mx-auto h-8 w-8 text-disabled-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">Este hito ya no está disponible.</p>
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={cn("rounded-none", getMilestoneStatusClasses(detail.status))}>
                {getMilestoneStatusLabel(detail.status)}
              </Badge>
              <span className="text-xs text-muted-foreground">{relativeDate(detail.daysUntil)}</span>
              <span className="text-xs text-muted-foreground">· {detail.evidenceCount} evidencia{detail.evidenceCount === 1 ? "" : "s"}</span>
            </div>

            <div className="grid grid-cols-2 gap-px border border-border bg-border">
              <div className="bg-card p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Fecha programada</p>
                <p className="mt-1 text-sm font-medium text-foreground">{detail.plannedDate}</p>
              </div>
              <div className="bg-card p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Fecha real</p>
                <p className="mt-1 text-sm font-medium text-foreground">{detail.actualDate || "Sin registrar"}</p>
              </div>
            </div>

            {detail.canViewFinancial && (
              <div className="grid grid-cols-1 gap-px border border-border bg-border sm:grid-cols-3">
                <div className="bg-card p-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Esperado</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">{formatCurrency(detail.expectedAmount)}</p>
                </div>
                <div className="bg-card p-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Real vinculado</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">{formatCurrency(detail.actualAmount)}</p>
                </div>
                <div className="bg-card p-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Variación</p>
                  <p className={cn("mt-1 text-sm font-semibold", (detail.variance ?? 0) > 0 ? "text-red-700" : "text-foreground")}>
                    {formatCurrency(detail.variance)}
                  </p>
                </div>
              </div>
            )}

            {milestone.kind !== "suministro" && !detail.canViewFinancial && (
              <div className="border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
                Los montos y comprobantes de pago solo están disponibles para administración y finanzas.
              </div>
            )}

            {detail.transactions.length > 0 && (
              <section className="space-y-3" aria-labelledby="milestone-transactions">
                <h3 id="milestone-transactions" className="text-sm font-semibold text-foreground">Pagos relacionados</h3>
                {detail.transactions.map((transaction) => (
                  <div key={transaction.id} className="border border-border p-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium text-foreground">{transaction.proveedor || "Transacción"}</p>
                          {transaction.selected && <Badge variant="success" className="rounded-none">Vinculada</Badge>}
                          {transaction.decision === "rejected" && <Badge variant="danger" className="rounded-none">Descartada</Badge>}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {transaction.fecha} · {transaction.status} · {formatCurrency(transaction.amount)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {transaction.evidence.length + (transaction.hasLegacyReceipt ? 1 : 0)} comprobante{transaction.evidence.length + (transaction.hasLegacyReceipt ? 1 : 0) === 1 ? "" : "s"}
                        </p>
                      </div>
                      <Button variant="outline" size="sm" className="rounded-none" onClick={() => openTransaction(transaction.id)}>
                        Ver pago <ExternalLink className="ml-2 h-3.5 w-3.5" />
                      </Button>
                    </div>
                    {transaction.evidence.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {transaction.evidence.map((document) => (
                          <Button
                            key={document.id}
                            variant="outline"
                            size="sm"
                            className="h-8 max-w-full rounded-none text-xs"
                            disabled={!document.url}
                            onClick={() => document.url && window.open(document.url, "_blank", "noopener,noreferrer")}
                          >
                            <FileText className="mr-1.5 h-3.5 w-3.5" /><span className="truncate">{document.name}</span>
                          </Button>
                        ))}
                      </div>
                    )}
                    {detail.canManageLinks && (
                      <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
                        <Button
                          size="sm"
                          className="rounded-none"
                          disabled={savingKey !== null || transaction.decision === "confirmed"}
                          onClick={() => handleDecision("transaccion", transaction.id, "confirmed")}
                        >
                          {savingKey === `transaccion-${transaction.id}-confirmed` && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                          Confirmar
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-none"
                          disabled={savingKey !== null || transaction.decision === "rejected"}
                          onClick={() => handleDecision("transaccion", transaction.id, "rejected")}
                        >
                          <XCircle className="mr-1.5 h-3.5 w-3.5" /> Descartar
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </section>
            )}

            {detail.requisitions.length > 0 && (
              <section className="space-y-3" aria-labelledby="milestone-requisitions">
                <h3 id="milestone-requisitions" className="text-sm font-semibold text-foreground">Requisiciones relacionadas</h3>
                {detail.requisitions.map((requisition) => (
                  <div key={requisition.id} className="border border-border p-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium text-foreground">Requisición · {requisition.solicitante}</p>
                          {requisition.selected && <Badge variant="success" className="rounded-none">Vinculada</Badge>}
                          {requisition.decision === "rejected" && <Badge variant="danger" className="rounded-none">Descartada</Badge>}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Entrega {requisition.fechaEntrega || "sin fecha"} · {requisition.statusEntrega || "Pendiente"} · {requisition.itemCount} conceptos
                        </p>
                        {detail.canViewFinancial && <p className="mt-1 text-xs text-muted-foreground">Monto estimado: {formatCurrency(requisition.amount)}</p>}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-none"
                        onClick={() => navigate(`/proyecto/${proyectoId}/requisiciones?requisicion=${requisition.id}`)}
                      >
                        Abrir requisición <ExternalLink className="ml-2 h-3.5 w-3.5" />
                      </Button>
                    </div>
                    {requisition.evidence.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {requisition.evidence.map((document) => (
                          <Button
                            key={document.id}
                            variant="outline"
                            size="sm"
                            className="h-8 max-w-full rounded-none text-xs"
                            disabled={!document.url}
                            onClick={() => document.url && window.open(document.url, "_blank", "noopener,noreferrer")}
                          >
                            <FileText className="mr-1.5 h-3.5 w-3.5" /><span className="truncate">{document.name}</span>
                          </Button>
                        ))}
                      </div>
                    )}
                    {detail.canManageLinks && (
                      <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
                        <Button
                          size="sm"
                          className="rounded-none"
                          disabled={savingKey !== null || requisition.decision === "confirmed"}
                          onClick={() => handleDecision("requisicion", requisition.id, "confirmed")}
                        >
                          Confirmar
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-none"
                          disabled={savingKey !== null || requisition.decision === "rejected"}
                          onClick={() => handleDecision("requisicion", requisition.id, "rejected")}
                        >
                          <XCircle className="mr-1.5 h-3.5 w-3.5" /> Descartar
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </section>
            )}

            {detail.transactions.length === 0 &&
              detail.requisitions.length === 0 &&
              (milestone.kind === "suministro" || detail.canViewFinancial) && (
              <div className="border border-dashed border-border p-8 text-center">
                <AlertTriangle className="mx-auto h-8 w-8 text-amber-700" />
                <p className="mt-3 text-sm font-medium text-foreground">Sin fuentes relacionadas</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Registra el pago o requisición usando esta partida para que pueda vincularse automáticamente.
                </p>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
