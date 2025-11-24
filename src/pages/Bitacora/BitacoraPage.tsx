import { useState, useMemo } from "react";
import { useParams } from "react-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { ChevronRight, Plus, MoreHorizontal, ChevronDown, Edit2, Trash2, Eye, List, Calendar as CalendarIcon } from "lucide-react";
import { useBitacoraModal } from "../../hooks/use-bitacora-modal";
import { Button } from "@/components/ui/button";
import BitacoraListView from "@/components/Bitacora/BitacoraListView";
import BitacoraCalendarView from "@/components/Bitacora/BitacoraCalendarView";

interface LogEntry {
    _id: Id<"bitacora">;
    fecha: string;
    categoria: string;
    departamento?: string; // Enriched by backend
    responsable: string;
    comentarios?: string;
    avance_dia: string;
    fotos?: { _id: string; storage_id?: string; url?: string | null }[];
    partida_id: Id<"partidas">;
    familias_tags: string[];
    status: string;
    uploaded_at?: number;
}

type ViewMode = "grouped" | "list" | "calendar";

export default function BitacoraPage() {
    const { proyectoId } = useParams<{ proyectoId: string }>();
    const bitacoraModal = useBitacoraModal();
    const [expandedLogIds, setExpandedLogIds] = useState<Set<string>>(new Set());
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<ViewMode>("grouped");
    const deleteLog = useMutation(api.bitacora.deleteLogEntry);

    // Get project details
    const proyecto = useQuery(
        api.desarrollos.getById,
        proyectoId ? { id: proyectoId as Id<"desarrollos"> } : "skip"
    );

    // Get log entries (now includes photos and partida info)
    const logEntries = useQuery(
        api.bitacora.getLogEntriesByProject,
        proyectoId
            ? {
                proyecto: proyectoId as Id<"desarrollos">,
            }
            : "skip"
    );

    // Group logs by Departamento/Partida
    const groupedLogs = useMemo(() => {
        if (!logEntries) return {};
        // Cast to LogEntry[] to avoid type issues with Convex generic return types
        const logs = logEntries as unknown as LogEntry[];
        
        // Group by categoria (Estructura, Instalaciones, Acabados, etc.)
        return logs.reduce((acc, log) => {
            const group = log.categoria || "General";
            if (!acc[group]) acc[group] = [];
            acc[group].push(log);
            return acc;
        }, {} as Record<string, LogEntry[]>);
    }, [logEntries]);

    console.log(groupedLogs)

    const handleCreateLog = () => {
        if (!proyectoId) return;
        bitacoraModal.onOpen({
            proyectoId: proyectoId as Id<"desarrollos">,
            mode: "create",
        });
    };

    const toggleLog = (id: string) => {
        const newSet = new Set(expandedLogIds);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setExpandedLogIds(newSet);
    };

    if (!proyectoId || !proyecto) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen ">
            {/* Header */}
            <div className="bg-white border-b border-gray-200">
                <div className="max-w-7xl mx-auto px-12 py-12">
                    {/* Breadcrumb */}
                    <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                        <span className="hover:text-gray-700 cursor-pointer">Proyecto</span>                        
                    </div>

                    {/* Title and Actions */}
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-3xl font-medium text-gray-900">Bitácora {proyecto?.nombre || ""}</h1>
                        </div>
                        <div className="flex items-center gap-3">
                            {/* View Mode Toggle */}
                            <div className="flex items-center border border-gray-300 rounded-lg">
                                <button
                                    onClick={() => setViewMode("grouped")}
                                    className={`px-3 py-2 text-sm flex items-center gap-2 rounded-l-lg transition-colors ${
                                        viewMode === "grouped"
                                            ? "bg-gray-900 text-white"
                                            : "bg-white text-gray-700 hover:bg-gray-50"
                                    }`}
                                >
                                    <ChevronDown className="h-4 w-4" />
                                    Agrupado
                                </button>
                                <button
                                    onClick={() => setViewMode("list")}
                                    className={`px-3 py-2 text-sm flex items-center gap-2 border-x border-gray-300 transition-colors ${
                                        viewMode === "list"
                                            ? "bg-gray-900 text-white"
                                            : "bg-white text-gray-700 hover:bg-gray-50"
                                    }`}
                                >
                                    <List className="h-4 w-4" />
                                    Lista
                                </button>
                                <button
                                    onClick={() => setViewMode("calendar")}
                                    className={`px-3 py-2 text-sm flex items-center gap-2 rounded-r-lg transition-colors ${
                                        viewMode === "calendar"
                                            ? "bg-gray-900 text-white"
                                            : "bg-white text-gray-700 hover:bg-gray-50"
                                    }`}
                                >
                                    <CalendarIcon className="h-4 w-4" />
                                    Calendario
                                </button>
                            </div>
                            <Button
                                onClick={handleCreateLog}
                                variant={"outline"}
                                className="flex items-center gap-2"
                            >
                                Agregar Reporte
                                <Plus className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Content Area */}
            <div className="max-w-7xl mx-auto px-12 py-8 space-y-6">
                {/* Calendar View */}
                {viewMode === "calendar" && proyectoId && (
                    <BitacoraCalendarView
                        proyectoId={proyectoId as Id<"desarrollos">}
                        onOpenModal={(data) => bitacoraModal.onOpen(data)}
                    />
                )}

                {/* List View */}
                {viewMode === "list" && logEntries && (
                    <BitacoraListView
                        logEntries={logEntries as unknown as LogEntry[]}
                        proyectoId={proyectoId as Id<"desarrollos">}
                        onOpenModal={(data) => bitacoraModal.onOpen(data)}
                    />
                )}

                {/* Grouped View (Default) */}
                {viewMode === "grouped" && Object.entries(groupedLogs).map(([groupName, logs]) => (
                    <div key={groupName} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                        {/* Group Header */}
                        <div className="flex items-center justify-between p-6 border-b border-gray-200">
                            <div className="flex items-center gap-3">
                                <h2 className="text-xl font-medium text-gray-900">{groupName}</h2>
                            </div>
                            <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8 p-0"
                                onClick={() => {
                                    if (!proyectoId) return;
                                    bitacoraModal.onOpen({
                                        proyectoId: proyectoId as Id<"desarrollos">,
                                        mode: "create",
                                        categoria: groupName, // Auto-populate with group name
                                    });
                                }}
                            >
                                <Plus className="h-4 w-4 text-gray-500" />
                            </Button>
                        </div>

                        {/* Logs List */}
                        <div className="divide-y divide-gray-100">
                            {logs.map((log) => {
                                const isExpanded = expandedLogIds.has(log._id);
                                return (
                                    <div key={log._id} className="transition-colors hover:bg-gray-50">
                                        {/* Row Header (Always Visible) */}
                                        <div 
                                            className="flex items-center justify-between p-6 cursor-pointer hover:bg-gray-50"
                                            onClick={() => toggleLog(log._id)}
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className="text-gray-400">
                                                    {isExpanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                                                </div>
                                                <span className="font-normal text-gray-900 text-base">
                                                    {log.fecha}
                                                </span>
                                                <div className="flex items-center gap-2">
                                                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                                                        log.status === "Sin problemas" 
                                                            ? "bg-green-50 text-green-700 border border-green-200" 
                                                            : "bg-yellow-50 text-yellow-700 border border-yellow-200"
                                                    }`}>
                                                        {log.status || "Sin problemas"}
                                                    </span>
                                                    {log.familias_tags && log.familias_tags.length > 0 && log.familias_tags.map((tag) => (
                                                        <span key={tag} className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gray-50 text-gray-700 border border-gray-200">
                                                            {tag}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="h-9 w-9 rounded-full bg-gray-200 flex items-center justify-center text-sm font-medium text-gray-700">
                                                        {log.responsable.substring(0, 1).toUpperCase()}
                                                    </div>
                                                    <span className="text-sm text-gray-700">{log.responsable}</span>
                                                </div>
                                                <div className="relative">
                                                    <button 
                                                        className="p-1 hover:bg-gray-100 rounded"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setOpenMenuId(openMenuId === log._id ? null : log._id);
                                                        }}
                                                    >
                                                        <MoreHorizontal className="h-5 w-5 text-gray-400" />
                                                    </button>
                                                
                                                {openMenuId === log._id && (
                                                    <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10">
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                bitacoraModal.onOpen({
                                                                    proyectoId: proyectoId as Id<"desarrollos">,
                                                                    mode: "view",
                                                                    logEntry: {
                                                                        _id: log._id as Id<"bitacora">,
                                                                        departamento: log.departamento,
                                                                        categoria: log.categoria,
                                                                        partida_id: log.partida_id as Id<"partidas">,
                                                                        familias_tags: log.familias_tags,
                                                                        responsable: log.responsable,
                                                                        fecha: log.fecha,
                                                                        avance_dia: log.avance_dia,
                                                                        comentarios: log.comentarios,
                                                                        status: log.status,
                                                                    },
                                                                });
                                                                setOpenMenuId(null);
                                                            }}
                                                            className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                                        >
                                                            <Eye className="h-4 w-4" />
                                                            Ver detalles
                                                        </button>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                bitacoraModal.onOpen({
                                                                    proyectoId: proyectoId as Id<"desarrollos">,
                                                                    mode: "edit",
                                                                    logEntry: {
                                                                        _id: log._id as Id<"bitacora">,
                                                                        departamento: log.departamento,
                                                                        categoria: log.categoria,
                                                                        partida_id: log.partida_id as Id<"partidas">,
                                                                        familias_tags: log.familias_tags,
                                                                        responsable: log.responsable,
                                                                        fecha: log.fecha,
                                                                        avance_dia: log.avance_dia,
                                                                        comentarios: log.comentarios,
                                                                        status: log.status,
                                                                    },
                                                                });
                                                                setOpenMenuId(null);
                                                            }}
                                                            className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                                        >
                                                            <Edit2 className="h-4 w-4" />
                                                            Editar
                                                        </button>
                                                        <button
                                                            onClick={async (e) => {
                                                                e.stopPropagation();
                                                                if (confirm("¿Estás seguro de que quieres eliminar esta entrada?")) {
                                                                    try {
                                                                        await deleteLog({ logId: log._id as Id<"bitacora"> });
                                                                        setOpenMenuId(null);
                                                                    } catch (error) {
                                                                        console.error("Error deleting log:", error);
                                                                        alert("Error al eliminar la entrada");
                                                                    }
                                                                }
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
                                        </div>

                                        {/* Expanded Content */}
                                        {isExpanded && (
                                            <div className="px-6 pb-6 pl-16 flex gap-8 bg-gray-50">
                                                <div className="flex-1 space-y-6 py-4">
                                                    <div>
                                                        <h4 className="text-sm font-medium text-gray-500 mb-2">Retos / Incidencias:</h4>
                                                        <p className="text-gray-700 leading-relaxed text-sm">
                                                            {log.comentarios || "Sin incidencias reportadas."}
                                                        </p>
                                                    </div>
                                                    <div>
                                                        <h4 className="text-sm font-medium text-gray-500 mb-2">Avance General:</h4>
                                                        <p className="text-gray-700 leading-relaxed whitespace-pre-line text-sm">
                                                            {log.avance_dia}
                                                        </p>
                                                    </div>
                                                </div>

                                                {/* Photos */}
                                                {log.fotos && log.fotos.length > 0 && (
                                                    <div className="flex gap-3 items-start py-4">
                                                        {log.fotos.slice(0, 3).map((foto) => (
                                                            <div key={foto._id} className="h-20 w-20 bg-gray-200 rounded-md overflow-hidden border border-gray-300">
                                                                {foto.url && (
                                                                    <img 
                                                                        src={foto.url} 
                                                                        alt="Evidencia" 
                                                                        className="h-full w-full object-cover"
                                                                    />
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}

                {/* Empty State (for grouped view) */}
                {viewMode === "grouped" && (!logEntries || logEntries.length === 0) && (
                    <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
                        <p className="text-gray-500">No hay registros de bitácora aún.</p>
                        <Button
                            onClick={handleCreateLog}
                            variant="link"
                            className="mt-2"
                        >
                            Crear primera entrada
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}
