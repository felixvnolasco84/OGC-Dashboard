import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useReviewRequisicionModal } from "../../hooks/review-requisicion-modal";
import { X, Check, XCircle, Loader2, CheckCircle, AlertTriangle, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Id } from "../../../convex/_generated/dataModel";

interface ItemDecision {
  item_id: Id<"requisicion_items">;
  status_revision: "aprobado" | "rechazado";
  cantidad_aprobada: number;
  nota_item: string;
  // Display info
  familia: string;
  sub_partida?: string;
  cantidad_original: number;
  unidad: string;
  monto?: number;
}

export default function ReviewRequisicionModal() {
  const { isOpen, requisicionId, close } = useReviewRequisicionModal();
  const currentUser = useQuery(api.users.getCurrentUser);
  const requisicion = useQuery(
    api.requisiciones.getById,
    isOpen && requisicionId ? { id: requisicionId } : "skip"
  );

  const reviewMutation = useMutation(api.requisiciones.reviewRequisicion);

  const [itemDecisions, setItemDecisions] = useState<ItemDecision[]>([]);
  const [notaRevision, setNotaRevision] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize item decisions when requisicion loads
  useEffect(() => {
    if (requisicion?.items) {
      setItemDecisions(
        requisicion.items.map((item) => ({
          item_id: item._id,
          status_revision: "aprobado",
          cantidad_aprobada: item.cantidad,
          nota_item: "",
          familia: item.familia,
          sub_partida: item.sub_partida,
          cantidad_original: item.cantidad,
          unidad: item.unidad,
          monto: item.monto,
        }))
      );
      setNotaRevision("");
    }
  }, [requisicion?.items]);

  if (!isOpen || !requisicionId) return null;

  const approvedCount = itemDecisions.filter((d) => d.status_revision === "aprobado").length;
  const rejectedCount = itemDecisions.filter((d) => d.status_revision === "rechazado").length;
  const totalCount = itemDecisions.length;
  const hasModifiedQty = itemDecisions.some(
    (d) => d.status_revision === "aprobado" && d.cantidad_aprobada !== d.cantidad_original
  );
  const isPartial = rejectedCount > 0 || hasModifiedQty;
  const isAllRejected = rejectedCount === totalCount;
  const noteRequired = isPartial || isAllRejected;

  const toggleItem = (index: number) => {
    setItemDecisions((prev) =>
      prev.map((d, i) =>
        i === index
          ? {
              ...d,
              status_revision: d.status_revision === "aprobado" ? "rechazado" : "aprobado",
              cantidad_aprobada: d.status_revision === "aprobado" ? d.cantidad_original : d.cantidad_original,
            }
          : d
      )
    );
  };

  const updateQty = (index: number, qty: number) => {
    setItemDecisions((prev) =>
      prev.map((d, i) => (i === index ? { ...d, cantidad_aprobada: qty } : d))
    );
  };

  const updateItemNote = (index: number, note: string) => {
    setItemDecisions((prev) =>
      prev.map((d, i) => (i === index ? { ...d, nota_item: note } : d))
    );
  };

  const approveAll = () => {
    setItemDecisions((prev) =>
      prev.map((d) => ({
        ...d,
        status_revision: "aprobado" as const,
        cantidad_aprobada: d.cantidad_original,
      }))
    );
  };

  const rejectAll = () => {
    setItemDecisions((prev) =>
      prev.map((d) => ({
        ...d,
        status_revision: "rechazado" as const,
      }))
    );
  };

  const canSubmit =
    totalCount > 0 &&
    (!noteRequired || notaRevision.trim().length > 0) &&
    itemDecisions.every(
      (d) => d.status_revision === "rechazado" || d.cantidad_aprobada > 0
    );

  const handleSubmit = async () => {
    if (!currentUser || !canSubmit) return;

    setIsSubmitting(true);
    try {
      const result = await reviewMutation({
        id: requisicionId,
        reviewer_id: currentUser._id,
        reviewer_name: currentUser.name,
        nota_revision: notaRevision.trim() || undefined,
        items: itemDecisions.map((d) => ({
          item_id: d.item_id,
          status_revision: d.status_revision,
          cantidad_aprobada: d.status_revision === "aprobado" ? d.cantidad_aprobada : undefined,
          nota_item: d.nota_item.trim() || undefined,
        })),
      });

      const statusMsg =
        result.status_revision === "Aprobada"
          ? "Requisición aprobada"
          : result.status_revision === "Rechazada"
            ? "Requisición rechazada"
            : "Requisición parcialmente aprobada";

      toast.success(statusMsg, {
        description: `${approvedCount} de ${totalCount} items aprobados.`,
      });
      close();
    } catch (error) {
      console.error("Error reviewing requisicion:", error);
      toast.error("Error al revisar", {
        description: error instanceof Error ? error.message : "No se pudo enviar la revisión.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div data-square-modal="" className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-overlay/50" onClick={close} />

      {/* Modal */}
      <div className="relative bg-card shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div className="text-left">
            <h2 className="text-lg font-semibold text-foreground">Revisar Requisición</h2>
            {requisicion && (
              <div className="flex items-center gap-3 mt-1">
                <span
                  className={cn(
                    "px-2 py-0.5 text-xs font-medium capitalize",
                    requisicion.tipo === "material"
                      ? "bg-blue-50 text-blue-700"
                      : "bg-purple-50 text-purple-700"
                  )}
                >
                  {requisicion.tipo}
                </span>
                <span className="text-sm text-subtle-foreground">
                  Solicitado por <span className="font-medium">{requisicion.solicitante_nombre}</span>
                </span>
                <span className="text-sm text-disabled-foreground">{requisicion.fecha_solicitud}</span>
              </div>
            )}
          </div>
          <button onClick={close} className="p-2 hover:bg-muted transition-colors">
            <X className="w-5 h-5 text-subtle-foreground" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {!requisicion ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-disabled-foreground" />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Summary bar */}
              <div className="flex items-center justify-between p-3 bg-background border border-border">
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-subtle-foreground">
                    {totalCount} item{totalCount !== 1 ? "s" : ""}
                  </span>
                  <span className="text-green-600 font-medium">
                    <CheckCircle className="w-3.5 h-3.5 inline mr-1" />
                    {approvedCount} aprobado{approvedCount !== 1 ? "s" : ""}
                  </span>
                  {rejectedCount > 0 && (
                    <span className="text-red-600 font-medium">
                      <XCircle className="w-3.5 h-3.5 inline mr-1" />
                      {rejectedCount} rechazado{rejectedCount !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={approveAll}
                    className="px-3 py-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 hover:bg-green-100 transition-colors"
                  >
                    Aprobar todos
                  </button>
                  <button
                    onClick={rejectAll}
                    className="px-3 py-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 hover:bg-red-100 transition-colors"
                  >
                    Rechazar todos
                  </button>
                </div>
              </div>

              {/* Description if present */}
              {requisicion.descripcion && (
                <div className="p-3 bg-background border border-border text-sm text-left">
                  <span className="text-disabled-foreground text-xs uppercase tracking-wide">Descripción</span>
                  <p className="text-foreground mt-1">{requisicion.descripcion}</p>
                </div>
              )}

              {/* Items list */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-foreground">Items de la requisición</h3>
                {itemDecisions.map((decision, index) => (
                  <div
                    key={decision.item_id}
                    className={cn(
                      "border p-4 transition-colors",
                      decision.status_revision === "aprobado"
                        ? "border-green-200 bg-green-50/30"
                        : "border-red-200 bg-red-50/30"
                    )}
                  >
                    <div className="flex items-start gap-4">
                      {/* Toggle button */}
                      <button
                        onClick={() => toggleItem(index)}
                        className={cn(
                          "mt-0.5 p-1.5 rounded-none transition-colors flex-shrink-0",
                          decision.status_revision === "aprobado"
                            ? "bg-green-600 text-on-color hover:bg-green-700"
                            : "bg-red-500 text-on-color hover:bg-red-600"
                        )}
                      >
                        {decision.status_revision === "aprobado" ? (
                          <Check className="w-4 h-4" />
                        ) : (
                          <X className="w-4 h-4" />
                        )}
                      </button>

                      {/* Item info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <div className="text-left">
                            <p className="text-sm font-medium text-foreground">{decision.familia}</p>
                            {decision.sub_partida && (
                              <p className="text-xs text-subtle-foreground">{decision.sub_partida}</p>
                            )}
                          </div>
                          <span
                            className={cn(
                              "px-2 py-0.5 text-xs font-medium",
                              decision.status_revision === "aprobado"
                                ? "bg-green-100 text-green-700"
                                : "bg-red-100 text-red-700"
                            )}
                          >
                            {decision.status_revision === "aprobado" ? "Aprobado" : "Rechazado"}
                          </span>
                        </div>

                        {/* Quantities */}
                        <div className="mt-2 flex items-center gap-4 text-sm">
                          <div className="text-subtle-foreground">
                            Solicitado:{" "}
                            <span className="font-medium text-foreground">
                              {decision.cantidad_original} {decision.unidad}
                            </span>
                          </div>
                          {decision.status_revision === "aprobado" && (
                            <div className="flex items-center gap-2">
                              <span className="text-subtle-foreground">Aprobado:</span>
                              <input
                                type="number"
                                min={1}
                                value={decision.cantidad_aprobada}
                                onChange={(e) => updateQty(index, Number(e.target.value))}
                                className={cn(
                                  "w-20 px-2 py-1.5 text-sm border text-center bg-card",
                                  decision.cantidad_aprobada !== decision.cantidad_original
                                    ? "border-yellow-400 bg-yellow-50 text-yellow-800 font-medium"
                                    : "border-border-strong text-foreground"
                                )}
                              />
                              <span className="text-subtle-foreground text-xs">{decision.unidad}</span>
                              {decision.cantidad_aprobada !== decision.cantidad_original && (
                                <span className="text-yellow-600 text-xs font-medium">
                                  (modificado)
                                </span>
                              )}
                            </div>
                          )}
                          {decision.monto !== undefined && decision.monto > 0 && (
                            <div className="text-disabled-foreground text-xs ml-auto">
                              ${decision.monto.toLocaleString("es-MX")}
                            </div>
                          )}
                        </div>

                        {/* Per-item note */}
                        <div className="mt-2">
                          <button
                            onClick={() => {
                              const el = document.getElementById(`item-note-${index}`);
                              if (el) el.classList.toggle("hidden");
                            }}
                            className="text-xs text-disabled-foreground hover:text-muted-foreground flex items-center gap-1"
                          >
                            <MessageSquare className="w-3 h-3" />
                            {decision.nota_item ? "Editar nota" : "Agregar nota"}
                          </button>
                          <div id={`item-note-${index}`} className={decision.nota_item ? "" : "hidden"}>
                            <input
                              type="text"
                              placeholder="Nota para este item..."
                              value={decision.nota_item}
                              onChange={(e) => updateItemNote(index, e.target.value)}
                              className="mt-1 w-full px-2 py-1.5 text-xs border border-border text-foreground placeholder:text-disabled-foreground bg-card"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Revision note */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground flex items-center gap-2">
                  Nota de revisión
                  {noteRequired && (
                    <span className="text-xs text-red-500 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      Requerida
                    </span>
                  )}
                </label>
                <textarea
                  placeholder={
                    noteRequired
                      ? "Explica las razones de los cambios realizados..."
                      : "Nota opcional..."
                  }
                  value={notaRevision}
                  onChange={(e) => setNotaRevision(e.target.value)}
                  rows={3}
                  className={cn(
                    "w-full px-3 py-2 text-sm border resize-none bg-card",
                    noteRequired && !notaRevision.trim()
                      ? "border-red-300 bg-red-50/50"
                      : "border-border"
                  )}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border p-4 flex items-center justify-between">
          <button
            onClick={close}
            className="px-4 py-2 text-sm font-medium text-foreground bg-muted hover:bg-disabled transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || isSubmitting}
            className={cn(
              "px-6 py-2 text-sm font-medium text-on-color transition-colors flex items-center gap-2",
              isAllRejected
                ? "bg-red-600 hover:bg-red-700 disabled:bg-red-300"
                : isPartial
                  ? "bg-yellow-600 hover:bg-yellow-700 disabled:bg-yellow-300"
                  : "bg-green-600 hover:bg-green-700 disabled:bg-green-300"
            )}
          >
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {isAllRejected
              ? "Rechazar Requisición"
              : isPartial
                ? "Aprobar Parcialmente"
                : "Aprobar Requisición"}
          </button>
        </div>
      </div>
    </div>
  );
}
