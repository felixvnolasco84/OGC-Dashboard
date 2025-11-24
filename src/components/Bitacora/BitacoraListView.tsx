import { User, Calendar as CalendarIcon, MessageSquare, MoreVertical, Eye, Edit2, Trash2 } from "lucide-react";
import { Id } from "../../../convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useState } from "react";

interface LogEntry {
  _id: Id<"bitacora">;
  departamento?: string; // Enriched by backend
  categoria: string;
  partida_id: Id<"partidas">;
  familias_tags: string[];
  responsable: string;
  fecha: string;
  avance_dia: string;
  comentarios?: string;
  status: string;
  uploaded_at?: number;
  fotos?: { _id: string; storage_id?: string; url?: string | null }[];
}

interface BitacoraListViewProps {
  logEntries: LogEntry[];
  proyectoId: Id<"desarrollos">;
  onOpenModal: (data: {
    proyectoId: Id<"desarrollos">;
    mode: "create" | "edit" | "view";
    logEntry?: LogEntry;
  }) => void;
}

export default function BitacoraListView({ logEntries, proyectoId, onOpenModal }: BitacoraListViewProps) {
  const deleteLog = useMutation(api.bitacora.deleteLogEntry);
  const [openMenuId, setOpenMenuId] = useState<Id<"bitacora"> | null>(null);

  const handleView = (entry: LogEntry) => {
    onOpenModal({
      proyectoId,
      mode: "view",
      logEntry: entry,
    });
  };

  const handleEdit = (entry: LogEntry) => {
    onOpenModal({
      proyectoId,
      mode: "edit",
      logEntry: entry,
    });
  };

  const handleDelete = async (logId: Id<"bitacora">) => {
    if (confirm("¿Estás seguro de que quieres eliminar esta entrada?")) {
      try {
        await deleteLog({ logId });
      } catch (error) {
        console.error("Error deleting log:", error);
        alert("Error al eliminar la entrada");
      }
    }
  };

  const getDepartmentColor = (departamento: string) => {
    const colors: Record<string, string> = {
      Estructura: "bg-blue-100 text-blue-700",
      Seguridad: "bg-green-100 text-green-700",
      Instalaciones: "bg-purple-100 text-purple-700",
      Acabados: "bg-yellow-100 text-yellow-700",
      Albañilería: "bg-orange-100 text-orange-700",
    };
    return colors[departamento] || "bg-gray-100 text-gray-700";
  };

  if (logEntries.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
        <div className="max-w-sm mx-auto">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <MessageSquare className="h-8 w-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No hay entradas</h3>
          <p className="text-gray-500 text-sm">
            No se han registrado entradas en la bitácora. Crea la primera entrada para comenzar.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {logEntries.map((entry) => (
        <div
          key={entry._id}
          className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow"
        >
          <div className="flex items-start justify-between mb-4">
            {/* Header */}
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h3 className="text-xl font-bold text-gray-900">{entry.departamento || entry.categoria}</h3>
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${getDepartmentColor(entry.departamento || entry.categoria)}`}>
                  {entry.departamento || entry.categoria}
                </span>
              </div>

              <div className="flex items-center gap-6 text-sm text-gray-600">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  <span>Responsable:</span>
                  <span className="font-medium text-gray-900">{entry.responsable}</span>
                </div>
                <div className="flex items-center gap-2">
                  <CalendarIcon className="h-4 w-4" />
                  <span>Fecha:</span>
                  <span className="font-medium text-gray-900">{entry.fecha}</span>
                </div>
              </div>
            </div>

            {/* Actions Menu */}
            <div className="relative">
              <button
                onClick={() => setOpenMenuId(openMenuId === entry._id ? null : entry._id)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <MoreVertical className="h-5 w-5 text-gray-500" />
              </button>

              {openMenuId === entry._id && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10">
                  <button
                    onClick={() => {
                      handleView(entry);
                      setOpenMenuId(null);
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                  >
                    <Eye className="h-4 w-4" />
                    Ver detalles
                  </button>
                  <button
                    onClick={() => {
                      handleEdit(entry);
                      setOpenMenuId(null);
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                  >
                    <Edit2 className="h-4 w-4" />
                    Editar
                  </button>
                  <button
                    onClick={() => {
                      handleDelete(entry._id);
                      setOpenMenuId(null);
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                  >
                    <Trash2 className="h-4 w-4" />
                    Eliminar
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Comments Section */}
          {entry.comentarios && (
            <div className="mb-4">
              <h4 className="text-sm font-medium text-gray-700 mb-1">Comentarios</h4>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-sm text-gray-600">{entry.comentarios}</p>
              </div>
            </div>
          )}

          {/* Daily Progress */}
          <div>
            <h4 className="text-sm font-medium text-gray-900 mb-2">Avance del día:</h4>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="whitespace-pre-wrap text-sm text-gray-700">{entry.avance_dia}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
