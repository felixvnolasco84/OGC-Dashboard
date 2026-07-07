import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useRequisicionHistoryModal } from "../../hooks/requisicion-history-modal";
import { X, Clock, FileText, CheckCircle, AlertCircle, Trash2, Edit, Plus, Package, ArrowRight, ClipboardCheck, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Id } from "../../../convex/_generated/dataModel";

// Type for history entry
interface HistoryEntry {
  _id: Id<"requisicion_history">;
  proyecto: Id<"desarrollos">;
  requisicion_id: Id<"requisiciones">;
  action: string;
  field_changed?: string;
  old_value?: string;
  new_value?: string;
  comentario?: string;
  documento_ids?: Id<"requisicion_documentos">[];
  changed_by_id: Id<"users">;
  changed_by_name: string;
  created_at: number;
  requisicion?: {
    _id: Id<"requisiciones">;
    tipo: string;
    status: string;
    status_entrega?: string;
    solicitante_nombre: string;
    fecha_solicitud: string;
  } | null;
}

interface HistoryDocumentDetail {
  nombre: string;
  type?: string;
  size?: number;
}

function HistoryCommentAndDocuments({ entry, data }: { entry: HistoryEntry; data: Record<string, unknown> | null }) {
  const comentario = entry.comentario || (data?.comentario as string | undefined);
  const documentos = data?.documentos as HistoryDocumentDetail[] | undefined;

  if (!comentario && (!documentos || documentos.length === 0)) return null;

  return (
    <div className="space-y-2 border-t border-gray-100 pt-2">
      {comentario && (
        <div>
          <span className="text-gray-400">Comentario:</span>{" "}
          <span className="text-gray-700">{comentario}</span>
        </div>
      )}
      {documentos && documentos.length > 0 && (
        <div className="space-y-1">
          <span className="text-gray-400">Documentos:</span>
          {documentos.map((doc, index) => (
            <div key={`${doc.nombre}-${index}`} className="flex items-center gap-2 text-gray-700">
              <FileText className="h-3 w-3 text-cyan-600" />
              <span>{doc.nombre}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Safe JSON parse helper
function tryParseJSON(str: string | undefined): Record<string, unknown> | null {
  if (!str) return null;
  try {
    const parsed = JSON.parse(str);
    return typeof parsed === "object" && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

// Action type config
const actionIcons: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  created: { icon: Plus, color: "text-green-600 bg-green-100", label: "Nueva Requisición" },
  updated: { icon: Edit, color: "text-blue-600 bg-blue-100", label: "Requisición Actualizada" },
  status_changed: { icon: CheckCircle, color: "text-purple-600 bg-purple-100", label: "Estado de Pago" },
  status_entrega_changed: { icon: Package, color: "text-indigo-600 bg-indigo-100", label: "Estado de Entrega" },
  cancelled: { icon: AlertCircle, color: "text-red-600 bg-red-100", label: "Requisición Cancelada" },
  deleted: { icon: Trash2, color: "text-red-600 bg-red-100", label: "Requisición Eliminada" },
  document_added: { icon: FileText, color: "text-cyan-600 bg-cyan-100", label: "Documento Adjuntado" },
  document_removed: { icon: FileText, color: "text-orange-600 bg-orange-100", label: "Documento Eliminado" },
  reviewed: { icon: ClipboardCheck, color: "text-amber-600 bg-amber-100", label: "Revisión Realizada" },
  resubmitted: { icon: RotateCcw, color: "text-cyan-600 bg-cyan-100", label: "Re-enviada para Revisión" },
};

// Format field names for display
const FIELD_LABELS: Record<string, string> = {
  tipo: "Tipo",
  descripcion: "Descripción",
  proveedor: "Proveedor",
  proveedor_id: "Proveedor",
  fecha_entrega: "Fecha de entrega",
  items: "Materiales / Items",
  status: "Estado de pago",
  status_entrega: "Estado de entrega",
};

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "Hace un momento";
  if (minutes < 60) return `Hace ${minutes} minuto${minutes > 1 ? "s" : ""}`;
  if (hours < 24) return `Hace ${hours} hora${hours > 1 ? "s" : ""}`;
  if (days < 7) return `Hace ${days} día${days > 1 ? "s" : ""}`;
  return formatDate(timestamp);
}

function formatMonto(val: unknown): string {
  if (typeof val === "number") return `$${val.toLocaleString("es-MX")}`;
  return String(val ?? "");
}

// --- Render helpers for each action type ---

function CreatedDetails({ entry }: { entry: HistoryEntry }) {
  const data = tryParseJSON(entry.new_value);
  if (!data) return null;

  const tipo = data.tipo as string | undefined;
  const solicitante = data.solicitante as string | undefined;
  const itemsCount = data.items_count as number | undefined;
  const familias = data.familias as string[] | undefined;
  const totalMonto = data.total_monto as number | undefined;
  const descripcion = data.descripcion as string | undefined;
  const fechaSolicitud = data.fecha_solicitud as string | undefined;

  return (
    <div className="mt-2 p-3 bg-white border border-gray-200 text-xs space-y-2 text-left">
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        {tipo && (
          <div>
            <span className="text-gray-400">Tipo:</span>{" "}
            <span className={cn(
              "px-1.5 py-0.5 rounded-sm font-medium capitalize",
              tipo === "material" ? "bg-blue-50 text-blue-700" : "bg-purple-50 text-purple-700"
            )}>{tipo}</span>
          </div>
        )}
        {solicitante && (
          <div>
            <span className="text-gray-400">Solicitante:</span>{" "}
            <span className="text-gray-700 font-medium">{solicitante}</span>
          </div>
        )}
        {fechaSolicitud && (
          <div>
            <span className="text-gray-400">Fecha:</span>{" "}
            <span className="text-gray-700">{fechaSolicitud}</span>
          </div>
        )}
        {itemsCount !== undefined && (
          <div>
            <span className="text-gray-400">Items:</span>{" "}
            <span className="text-gray-700">{itemsCount}</span>
          </div>
        )}
      </div>
      {familias && familias.length > 0 && (
        <div>
          <span className="text-gray-400">Familias:</span>{" "}
          <span className="text-gray-700">{familias.join(", ")}</span>
        </div>
      )}
      {totalMonto !== undefined && totalMonto > 0 && (
        <div>
          <span className="text-gray-400">Monto total:</span>{" "}
          <span className="text-gray-700 font-medium">{formatMonto(totalMonto)}</span>
        </div>
      )}
      {descripcion && (
        <div>
          <span className="text-gray-400">Descripción:</span>{" "}
          <span className="text-gray-700">{descripcion}</span>
        </div>
      )}
    </div>
  );
}

function DeletedDetails({ entry }: { entry: HistoryEntry }) {
  const data = tryParseJSON(entry.old_value);
  if (!data) return null;

  const tipo = data.tipo as string | undefined;
  const solicitante = data.solicitante_nombre as string | undefined;
  const status = data.status as string | undefined;
  const statusRevision = data.status_revision as string | undefined;
  const statusEntrega = data.status_entrega as string | undefined;
  const fechaSolicitud = data.fecha_solicitud as string | undefined;
  const itemsCount = data.items_count as number | undefined;
  const documentosCount = data.documentos_count as number | undefined;
  const totalMonto = data.total_monto as number | undefined;

  return (
    <div className="mt-2 p-3 bg-white border border-red-100 text-xs space-y-2 text-left">
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        {tipo && (
          <div>
            <span className="text-gray-400">Tipo:</span>{" "}
            <span className="text-gray-700 font-medium capitalize">{tipo}</span>
          </div>
        )}
        {solicitante && (
          <div>
            <span className="text-gray-400">Solicitante:</span>{" "}
            <span className="text-gray-700 font-medium">{solicitante}</span>
          </div>
        )}
        {fechaSolicitud && (
          <div>
            <span className="text-gray-400">Fecha:</span>{" "}
            <span className="text-gray-700">{fechaSolicitud}</span>
          </div>
        )}
        {status && (
          <div>
            <span className="text-gray-400">Pago:</span>{" "}
            <span className="text-gray-700">{status}</span>
          </div>
        )}
        {statusRevision && (
          <div>
            <span className="text-gray-400">Revision:</span>{" "}
            <span className="text-gray-700">{statusRevision}</span>
          </div>
        )}
        {statusEntrega && (
          <div>
            <span className="text-gray-400">Entrega:</span>{" "}
            <span className="text-gray-700">{statusEntrega}</span>
          </div>
        )}
        {itemsCount !== undefined && (
          <div>
            <span className="text-gray-400">Items:</span>{" "}
            <span className="text-gray-700">{itemsCount}</span>
          </div>
        )}
        {documentosCount !== undefined && (
          <div>
            <span className="text-gray-400">Documentos:</span>{" "}
            <span className="text-gray-700">{documentosCount}</span>
          </div>
        )}
      </div>
      {totalMonto !== undefined && totalMonto > 0 && (
        <div>
          <span className="text-gray-400">Monto total:</span>{" "}
          <span className="text-gray-700 font-medium">{formatMonto(totalMonto)}</span>
        </div>
      )}
    </div>
  );
}

function StatusChangeDetails({ entry }: { entry: HistoryEntry }) {
  const oldData = tryParseJSON(entry.old_value);
  const newData = tryParseJSON(entry.new_value);

  // Extract status values
  const statusField = entry.action === "status_entrega_changed" ? "status_entrega" : "status";
  const oldStatus = oldData ? (oldData[statusField] as string) : entry.old_value;
  const newStatus = newData ? (newData[statusField] as string) : entry.new_value;
  const solicitante = (oldData?.solicitante || newData?.solicitante) as string | undefined;
  const tipo = (oldData?.tipo || newData?.tipo) as string | undefined;

  return (
    <div className="mt-2 p-3 bg-white border border-gray-200 text-xs space-y-2 text-left">
      {/* Which requisicion */}
      {(solicitante || tipo) && (
        <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
          {tipo && (
            <span className={cn(
              "px-1.5 py-0.5 rounded-sm font-medium capitalize",
              tipo === "material" ? "bg-blue-50 text-blue-700" : "bg-purple-50 text-purple-700"
            )}>{tipo}</span>
          )}
          {solicitante && (
            <span className="text-gray-600">de <span className="font-medium">{solicitante}</span></span>
          )}
        </div>
      )}
      {/* Status transition */}
      <div className="flex items-center gap-2">
        <span className="px-2 py-0.5 rounded-sm bg-red-50 text-red-600 line-through">{oldStatus}</span>
        <ArrowRight className="w-3 h-3 text-gray-400" />
        <span className="px-2 py-0.5 rounded-sm bg-green-50 text-green-700 font-medium">{newStatus}</span>
      </div>
      <HistoryCommentAndDocuments entry={entry} data={newData} />
    </div>
  );
}

function UpdatedFieldDetails({ entry }: { entry: HistoryEntry }) {
  const fieldLabel = FIELD_LABELS[entry.field_changed || ""] || entry.field_changed || "Campo";
  const isItems = entry.field_changed === "items";

  return (
    <div className="mt-2 p-3 bg-white border border-gray-200 text-xs space-y-2 text-left">
      <div className="text-gray-500 font-medium mb-1">{fieldLabel}</div>
      {isItems ? (
        // Items: show as lists
        <div className="space-y-2">
          {entry.old_value && (
            <div>
              <span className="text-gray-400 text-[10px] uppercase tracking-wide">Antes:</span>
              <div className="mt-1 space-y-0.5">
                {entry.old_value.split("; ").map((item, i) => (
                  <div key={i} className="text-red-500 line-through pl-2 border-l-2 border-red-200">{item}</div>
                ))}
              </div>
            </div>
          )}
          {entry.new_value && (
            <div>
              <span className="text-gray-400 text-[10px] uppercase tracking-wide">Ahora:</span>
              <div className="mt-1 space-y-0.5">
                {entry.new_value.split("; ").map((item, i) => (
                  <div key={i} className="text-green-600 font-medium pl-2 border-l-2 border-green-200">{item}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        // Simple field: inline before/after
        <div className="flex items-center gap-2 flex-wrap">
          {entry.old_value && (
            <span className="px-2 py-0.5 rounded-sm bg-red-50 text-red-500 line-through">{entry.old_value}</span>
          )}
          <ArrowRight className="w-3 h-3 text-gray-400 flex-shrink-0" />
          {entry.new_value && (
            <span className="px-2 py-0.5 rounded-sm bg-green-50 text-green-700 font-medium">{entry.new_value}</span>
          )}
        </div>
      )}
    </div>
  );
}

interface ReviewItemDetail {
  familia: string;
  sub_partida?: string;
  cantidad_solicitada: number;
  cantidad_aprobada?: number;
  unidad: string;
  monto?: number;
  status_revision?: string;
  nota_item?: string;
}

function ReviewedDetails({ entry }: { entry: HistoryEntry }) {
  const data = tryParseJSON(entry.new_value);
  if (!data) return null;

  const statusRevision = data.status_revision as string | undefined;
  const notaRevision = data.nota_revision as string | undefined;
  const solicitante = data.solicitante as string | undefined;
  const tipo = data.tipo as string | undefined;
  const itemsApproved = data.items_approved as number | undefined;
  const itemsRejected = data.items_rejected as number | undefined;
  const itemsTotal = data.items_total as number | undefined;
  const items = data.items as ReviewItemDetail[] | undefined;

  return (
    <div className="mt-2 p-3 bg-white border border-gray-200 text-xs space-y-3 text-left">
      {/* Header: who + decision */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {tipo && (
            <span className={cn(
              "px-1.5 py-0.5 rounded-sm font-medium capitalize",
              tipo === "material" ? "bg-blue-50 text-blue-700" : "bg-purple-50 text-purple-700"
            )}>{tipo}</span>
          )}
          {solicitante && (
            <span className="text-gray-600">de <span className="font-medium">{solicitante}</span></span>
          )}
        </div>
        {statusRevision && (
          <span className={cn(
            "px-2 py-0.5 rounded-sm font-medium",
            statusRevision === "Aprobada" ? "bg-green-100 text-green-700" :
            statusRevision === "Parcialmente Aprobada" ? "bg-yellow-100 text-yellow-700" :
            "bg-red-100 text-red-700"
          )}>
            {statusRevision}
          </span>
        )}
      </div>

      {/* Summary counts */}
      {itemsTotal !== undefined && (
        <div className="flex items-center gap-3 text-xs">
          <span className="text-gray-500">{itemsTotal} items</span>
          {itemsApproved !== undefined && itemsApproved > 0 && (
            <span className="text-green-600 font-medium">✓ {itemsApproved} aprobado{itemsApproved !== 1 ? "s" : ""}</span>
          )}
          {itemsRejected !== undefined && itemsRejected > 0 && (
            <span className="text-red-600 font-medium">✕ {itemsRejected} rechazado{itemsRejected !== 1 ? "s" : ""}</span>
          )}
        </div>
      )}

      {/* Per-item breakdown */}
      {items && items.length > 0 && (
        <div className="space-y-1 border-t border-gray-100 pt-2">
          {items.map((item, i) => (
            <div key={i} className={cn(
              "flex items-center gap-2 py-1 px-2 rounded-sm",
              item.status_revision === "aprobado" ? "bg-green-50/50" : 
              item.status_revision === "rechazado" ? "bg-red-50/50" : ""
            )}>
              <span className={cn(
                "text-[10px] font-medium w-16 flex-shrink-0",
                item.status_revision === "aprobado" ? "text-green-700" :
                item.status_revision === "rechazado" ? "text-red-700" : "text-gray-500"
              )}>
                {item.status_revision === "aprobado" ? "✓ Aprobado" : 
                 item.status_revision === "rechazado" ? "✕ Rechazado" : "Pendiente"}
              </span>
              <span className="text-gray-700 flex-1 truncate">
                {item.familia}{item.sub_partida ? ` > ${item.sub_partida}` : ""}
              </span>
              <span className="text-gray-500 whitespace-nowrap">
                {item.cantidad_solicitada} {item.unidad}
              </span>
              {item.status_revision === "aprobado" && item.cantidad_aprobada !== undefined && 
               item.cantidad_aprobada !== item.cantidad_solicitada && (
                <span className="text-yellow-700 font-medium whitespace-nowrap">
                  → {item.cantidad_aprobada} {item.unidad}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Revision note */}
      {notaRevision && (
        <div className="p-2 bg-gray-50 border border-gray-100 text-gray-700 italic">
          "{notaRevision}"
        </div>
      )}
      <HistoryCommentAndDocuments entry={entry} data={data} />
    </div>
  );
}

function ResubmittedDetails({ entry }: { entry: HistoryEntry }) {
  const oldData = tryParseJSON(entry.old_value);
  if (!oldData) return null;

  const previousStatus = oldData.previous_status_revision as string | undefined;
  const notaRevision = oldData.nota_revision as string | undefined;
  const solicitante = oldData.solicitante as string | undefined;
  const tipo = oldData.tipo as string | undefined;

  return (
    <div className="mt-2 p-3 bg-white border border-gray-200 text-xs space-y-2 text-left">
      {(solicitante || tipo) && (
        <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
          {tipo && (
            <span className={cn(
              "px-1.5 py-0.5 rounded-sm font-medium capitalize",
              tipo === "material" ? "bg-blue-50 text-blue-700" : "bg-purple-50 text-purple-700"
            )}>{tipo}</span>
          )}
          {solicitante && (
            <span className="text-gray-600">de <span className="font-medium">{solicitante}</span></span>
          )}
        </div>
      )}
      <div className="flex items-center gap-2">
        {previousStatus && (
          <span className="px-2 py-0.5 rounded-sm bg-red-50 text-red-600 line-through">{previousStatus}</span>
        )}
        <ArrowRight className="w-3 h-3 text-gray-400" />
        <span className="px-2 py-0.5 rounded-sm bg-amber-50 text-amber-700 font-medium">Pendiente de revisión</span>
      </div>
      {notaRevision && (
        <p className="text-gray-500 italic">Nota anterior: "{notaRevision}"</p>
      )}
    </div>
  );
}

export default function RequisicionHistoryModal() {
  const { isOpen, proyectoId, requisicionId, mode, close } = useRequisicionHistoryModal();
  const currentUser = useQuery(api.users.getCurrentUser);

  // Fetch history based on mode
  const allHistory = useQuery(
    api.requisicion_history.getRecentWithDetails,
    isOpen && mode === "all" && proyectoId && currentUser
      ? { proyecto: proyectoId, limit: 50, user_id: currentUser._id, user_role: currentUser.role }
      : "skip"
  );

  const singleHistory = useQuery(
    api.requisicion_history.getByRequisicion,
    isOpen && mode === "single" && requisicionId && currentUser
      ? { requisicion_id: requisicionId, user_id: currentUser._id, user_role: currentUser.role }
      : "skip"
  );

  const history = mode === "all" ? allHistory : singleHistory;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={close}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-none shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="text-left">
            <h2 className="text-lg font-semibold text-gray-900">
              {mode === "all" ? "Historial de Requisiciones" : "Historial de Cambios"}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {mode === "all" 
                ? "Todos los cambios realizados en requisiciones" 
                : "Cambios realizados en esta requisición"}
            </p>
          </div>
          <button
            onClick={close}
            className="p-2 hover:bg-gray-100 rounded-none transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {!history ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
            </div>
          ) : history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500">
              <Clock className="w-12 h-12 mb-4 text-gray-300" />
              <p className="text-sm">No hay cambios registrados</p>
            </div>
          ) : (
            <div className="space-y-3">
              {history.map((entry: HistoryEntry) => {
                const defaultCfg = { icon: Clock, color: "text-gray-600 bg-gray-100", label: entry.action };
                const cfg = actionIcons[entry.action] || defaultCfg;
                const Icon = cfg.icon;

                return (
                  <div
                    key={entry._id}
                    className="flex gap-3 p-4 bg-gray-50 hover:bg-gray-100 transition-colors border border-gray-100"
                  >
                    {/* Icon */}
                    <div className={cn("p-2 h-fit flex-shrink-0", cfg.color)}>
                      <Icon className="w-4 h-4" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      {/* Header row */}
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-gray-900">
                          {cfg.label}
                          {entry.action === "updated" && entry.field_changed && (
                            <span className="text-gray-400 font-normal"> — {FIELD_LABELS[entry.field_changed] || entry.field_changed}</span>
                          )}
                        </p>
                        <span className="text-xs text-gray-400 whitespace-nowrap">
                          {formatRelativeTime(entry.created_at)}
                        </span>
                      </div>

                      {/* Action-specific details */}
                      {entry.action === "created" && <CreatedDetails entry={entry} />}
                      {entry.action === "deleted" && <DeletedDetails entry={entry} />}
                      {(entry.action === "status_changed" || entry.action === "status_entrega_changed") && (
                        <StatusChangeDetails entry={entry} />
                      )}
                      {entry.action === "updated" && <UpdatedFieldDetails entry={entry} />}
                      {entry.action === "cancelled" && (
                        <StatusChangeDetails entry={entry} />
                      )}
                      {entry.action === "document_added" && entry.new_value && (
                        <div className="mt-2 p-2 bg-white border border-gray-200 text-xs flex items-center gap-2 text-left">
                          <FileText className="w-3 h-3 text-cyan-500" />
                          <span className="text-gray-700">{entry.new_value}</span>
                        </div>
                      )}
                      {entry.action === "reviewed" && <ReviewedDetails entry={entry} />}
                      {entry.action === "resubmitted" && <ResubmittedDetails entry={entry} />}

                      {/* Requisicion info card (for all history mode) */}
                      {"requisicion" in entry && entry.requisicion && (
                        <div className="mt-3 p-2 bg-white border border-gray-200">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className={cn(
                                "px-2 py-0.5 text-xs font-medium capitalize",
                                entry.requisicion.tipo === "material" 
                                  ? "bg-blue-100 text-blue-700" 
                                  : "bg-purple-100 text-purple-700"
                              )}>
                                {entry.requisicion.tipo}
                              </span>
                              <span className="text-xs text-gray-500">
                                {entry.requisicion.solicitante_nombre}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={cn(
                                "px-2 py-0.5 text-xs",
                                entry.requisicion.status === "Pagado" 
                                  ? "bg-green-100 text-green-700" 
                                  : entry.requisicion.status === "Cancelado"
                                    ? "bg-red-100 text-red-700"
                                    : "bg-gray-100 text-gray-600"
                              )}>
                                {entry.requisicion.status}
                              </span>
                              <span className="text-xs text-gray-400">
                                {entry.requisicion.fecha_solicitud}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* User footer */}
                      <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
                        <span>por</span>
                        <span className="font-medium text-gray-500">{entry.changed_by_name}</span>
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 p-4 flex justify-end">
          <button
            onClick={close}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
