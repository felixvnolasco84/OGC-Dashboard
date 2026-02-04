import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useRequisicionHistoryModal } from "../../hooks/requisicion-history-modal";
import { X, Clock, FileText, CheckCircle, AlertCircle, Trash2, Edit, Plus, Package } from "lucide-react";
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

// Action type to icon and color mapping
const actionConfig: Record<string, { icon: React.ElementType; color: string; label: string; getDescription: (entry: HistoryEntry) => string }> = {
  created: { 
    icon: Plus, 
    color: "text-green-600 bg-green-100", 
    label: "Nueva Requisición",
    getDescription: (entry) => entry.requisicion 
      ? `Requisición de ${entry.requisicion.tipo} creada por ${entry.requisicion.solicitante_nombre}`
      : "Requisición creada"
  },
  updated: { 
    icon: Edit, 
    color: "text-blue-600 bg-blue-100", 
    label: "Requisición Actualizada",
    getDescription: (entry) => entry.field_changed 
      ? `Se actualizó: ${formatFieldName(entry.field_changed)}`
      : "Se actualizaron los datos de la requisición"
  },
  status_changed: { 
    icon: CheckCircle, 
    color: "text-purple-600 bg-purple-100", 
    label: "Estado de Pago",
    getDescription: (entry) => entry.old_value && entry.new_value
      ? `Cambió de "${entry.old_value}" a "${entry.new_value}"`
      : "Se actualizó el estado de pago"
  },
  status_entrega_changed: { 
    icon: Package, 
    color: "text-indigo-600 bg-indigo-100", 
    label: "Estado de Entrega",
    getDescription: (entry) => entry.old_value && entry.new_value
      ? `Cambió de "${entry.old_value}" a "${entry.new_value}"`
      : "Se actualizó el estado de entrega"
  },
  cancelled: { 
    icon: AlertCircle, 
    color: "text-red-600 bg-red-100", 
    label: "Requisición Cancelada",
    getDescription: () => "La requisición fue cancelada"
  },
  deleted: { 
    icon: Trash2, 
    color: "text-red-600 bg-red-100", 
    label: "Requisición Eliminada",
    getDescription: () => "La requisición fue eliminada permanentemente"
  },
  document_added: { 
    icon: FileText, 
    color: "text-cyan-600 bg-cyan-100", 
    label: "Documento Adjuntado",
    getDescription: (entry) => entry.new_value 
      ? `Se adjuntó: ${entry.new_value}`
      : "Se adjuntó un documento"
  },
  document_removed: { 
    icon: FileText, 
    color: "text-orange-600 bg-orange-100", 
    label: "Documento Eliminado",
    getDescription: (entry) => entry.old_value
      ? `Se eliminó: ${entry.old_value}`
      : "Se eliminó un documento"
  },
};

// Format field names for display
function formatFieldName(field: string): string {
  const fieldMap: Record<string, string> = {
    tipo: "Tipo",
    descripcion: "Descripción",
    proveedor_id: "Proveedor",
    fecha_entrega: "Fecha de entrega",
    items: "Materiales/Items",
    status: "Estado de pago",
    status_entrega: "Estado de entrega",
  };
  return fieldMap[field] || field;
}

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

export default function RequisicionHistoryModal() {
  const { isOpen, proyectoId, requisicionId, mode, close } = useRequisicionHistoryModal();

  // Fetch history based on mode
  const allHistory = useQuery(
    api.requisicion_history.getRecentWithDetails,
    isOpen && mode === "all" && proyectoId
      ? { proyecto: proyectoId, limit: 50 }
      : "skip"
  );

  const singleHistory = useQuery(
    api.requisicion_history.getByRequisicion,
    isOpen && mode === "single" && requisicionId
      ? { requisicion_id: requisicionId }
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
              <div className="animate-spin rounded-none h-8 w-8 border-b-2 border-gray-900" />
            </div>
          ) : history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500">
              <Clock className="w-12 h-12 mb-4 text-gray-300" />
              <p className="text-sm">No hay cambios registrados</p>
            </div>
          ) : (
            <div className="space-y-3">
              {history.map((entry: HistoryEntry) => {
                const defaultConfig = {
                  icon: Clock,
                  color: "text-gray-600 bg-gray-100",
                  label: entry.action,
                  getDescription: () => "Cambio registrado",
                };
                const config = actionConfig[entry.action] || defaultConfig;
                const Icon = config.icon;
                const description = config.getDescription(entry);

                return (
                  <div
                    key={entry._id}
                    className="flex gap-3 p-4 bg-gray-50 rounded-none hover:bg-gray-100 transition-colors border border-gray-100"
                  >
                    {/* Icon */}
                    <div className={cn("p-2 rounded-none h-fit flex-shrink-0", config.color)}>
                      <Icon className="w-4 h-4" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      {/* Header row */}
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-gray-900">
                          {config.label}
                        </p>
                        <span className="text-xs text-gray-400 whitespace-nowrap">
                          {formatRelativeTime(entry.created_at)}
                        </span>
                      </div>

                      {/* Description */}
                      <p className="text-sm text-gray-600 mt-1">
                        {description}
                      </p>

                      {/* Change details for updates with old/new values */}
                      {entry.action === "updated" && (entry.old_value || entry.new_value) && (
                        <div className="mt-2 p-2 bg-white rounded border border-gray-200 text-xs">
                          {entry.old_value && (
                            <div className="flex items-center gap-2">
                              <span className="text-gray-400">Antes:</span>
                              <span className="text-red-500 line-through">{entry.old_value}</span>
                            </div>
                          )}
                          {entry.new_value && (
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-gray-400">Ahora:</span>
                              <span className="text-green-600 font-medium">{entry.new_value}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Requisicion info card (for all history mode) */}
                      {"requisicion" in entry && entry.requisicion && (
                        <div className="mt-3 p-2 bg-white rounded border border-gray-200">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className={cn(
                                "px-2 py-0.5 text-xs rounded-none font-medium capitalize",
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
                                "px-2 py-0.5 text-xs rounded-none",
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

                      {/* User and time footer */}
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
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-none hover:bg-gray-200 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
