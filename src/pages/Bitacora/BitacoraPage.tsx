import { useState, useMemo } from "react";
import { useParams } from "react-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useUser } from "@clerk/clerk-react";
import { Id } from "../../../convex/_generated/dataModel";
import { ChevronRight, Plus, MoreHorizontal, ChevronDown, Edit2, Trash2, Eye, Calendar as CalendarIcon, Loader2, ChevronsUpDown, FileText } from "lucide-react";
import { useBitacoraModal } from "../../hooks/use-bitacora-modal";
import { Button } from "@/components/ui/button";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import BitacoraCalendarView from "@/components/Bitacora/BitacoraCalendarView";
import BitacoraGalleryModal from "@/components/Bitacora/BitacoraGalleryModal";

interface LogEntry {
    _id: Id<"bitacora">;
    fecha: string;
    categoria: string;
    departamento?: string; // Enriched by backend
    responsable: string;
    comentarios?: string;
    avance_dia: string;
    fotos?: { _id: string; storage_id?: string; url?: string | null; comment?: string }[];
    documentos?: { _id: string; nombre: string; url?: string | null }[];
    partida_id: Id<"partidas">;
    familias_tags: string[];
    status: string;
    uploaded_at?: number;
}

interface GalleryState {
    isOpen: boolean;
    photos: { _id: string; url?: string | null; comment?: string }[];
    initialIndex: number;
    logDate?: string;
    logResponsable?: string;
}

type ViewMode = "grouped" | "list" | "calendar";

// Format date from DD/MM/YYYY to "21 Noviembre, 2025"
const formatDateDisplay = (dateStr: string): string => {
    const monthNames = [
        "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
        "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
    ];
    
    // Parse DD/MM/YYYY format
    const parts = dateStr.split("/");
    if (parts.length !== 3) return dateStr;
    
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // 0-indexed
    const year = parts[2];
    
    if (isNaN(day) || isNaN(month) || month < 0 || month > 11) return dateStr;
    
    return `${day} ${monthNames[month]}, ${year}`;
};

export default function BitacoraPage() {
    const { proyectoId } = useParams<{ proyectoId: string }>();
    const bitacoraModal = useBitacoraModal();
    const [expandedLogIds, setExpandedLogIds] = useState<Set<string>>(new Set());
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<ViewMode>("grouped");
    const [galleryState, setGalleryState] = useState<GalleryState>({
        isOpen: false,
        photos: [],
        initialIndex: 0,
    });
    const [deleteDialogState, setDeleteDialogState] = useState<{
        isOpen: boolean;
        logId: Id<"bitacora"> | null;
        logDate: string;
    }>({ isOpen: false, logId: null, logDate: "" });
    const [isDeleting, setIsDeleting] = useState(false);
    const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
    const deleteLog = useMutation(api.bitacora.deleteLogEntry);
    
    // Get current user for role-based features
    const { user: clerkUser } = useUser();
    const currentUser = useQuery(
        api.users.getCurrentUser,
        clerkUser ? undefined : "skip"
    );
    const isAdmin = currentUser?.role === "admin";

    const handleDeleteConfirm = async () => {
        if (!deleteDialogState.logId) return;
        setIsDeleting(true);
        try {
            await deleteLog({ logId: deleteDialogState.logId });
            setDeleteDialogState({ isOpen: false, logId: null, logDate: "" });
        } catch (error) {
            console.error("Error deleting log:", error);
            alert("Error al eliminar la entrada");
        } finally {
            setIsDeleting(false);
        }
    };

    const openGallery = (log: LogEntry, photoIndex: number = 0) => {
        if (!log.fotos || log.fotos.length === 0) return;
        setGalleryState({
            isOpen: true,
            photos: log.fotos,
            initialIndex: photoIndex,
            logDate: log.fecha,
            logResponsable: log.responsable,
        });
    };

    const closeGallery = () => {
        setGalleryState(prev => ({ ...prev, isOpen: false }));
    };

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

    // Parse date from DD/MM/YYYY format to comparable value
    const parseDateForSort = (dateStr: string): number => {
        const parts = dateStr.split("/");
        if (parts.length !== 3) return 0;
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const year = parseInt(parts[2], 10);
        return new Date(year, month, day).getTime();
    };

    // Group logs by Departamento/Partida (all logs grouped, pagination per category)
    // Sort by date descending (most recent first) within each category
    const groupedLogs = useMemo(() => {
        if (!logEntries) return {};
        // Cast to LogEntry[] to avoid type issues with Convex generic return types
        const logs = logEntries as unknown as LogEntry[];
        
        // Sort all logs by date descending (most recent first)
        const sortedLogs = [...logs].sort((a, b) => parseDateForSort(b.fecha) - parseDateForSort(a.fecha));

        // Group by categoria (Estructura, Instalaciones, Acabados, etc.)
        return sortedLogs.reduce((acc, log) => {
            const group = log.categoria || "General";
            if (!acc[group]) acc[group] = [];
            acc[group].push(log);
            return acc;
        }, {} as Record<string, LogEntry[]>);
    }, [logEntries]);
    
    // Toggle showing all logs for a specific category
    const toggleCategoryExpansion = (categoryName: string) => {
        setExpandedCategories(prev => {
            const newSet = new Set(prev);
            if (newSet.has(categoryName)) {
                newSet.delete(categoryName);
            } else {
                newSet.add(categoryName);
            }
            return newSet;
        });
    };
    
    // Get visible logs for a category (6 by default, all if expanded, or compact mode)
    const getVisibleLogs = (categoryName: string, logs: LogEntry[]) => {
        const isExpanded = expandedCategories.has(categoryName);
        return isExpanded ? logs : logs.slice(0, 6);
    };
    
    // Check if category has more logs to show
    // const categoryHasMore = (categoryName: string, logs: LogEntry[]) => {
    //     return !expandedCategories.has(categoryName) && logs.length > 6;
    // };    

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
                <div className="px-16 py-12">
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
                            <div className="flex items-center border border-gray-300">
                                <Button
                                    onClick={() => setViewMode("grouped")}
                                    variant={viewMode === "grouped" ? "default" : "outline"}                                    
                                >
                                    <ChevronDown className="h-4 w-4" />
                                    Agrupado
                                </Button>
                                {/* <button
                                    onClick={() => setViewMode("list")}
                                    className={`px-3 py-2 text-sm flex items-center gap-2 border-x border-gray-300 transition-colors ${viewMode === "list"
                                        ? "bg-gray-900 text-white"
                                        : "bg-white text-gray-700 hover:bg-gray-50"
                                        }`}
                                >
                                    <List className="h-4 w-4" />
                                    Lista
                                </button> */}
                                <Button
                                    onClick={() => setViewMode("calendar")}
                                    variant={viewMode === "calendar" ? "default" : "outline"}
                                >
                                    <CalendarIcon className="h-4 w-4" />
                                    Calendario
                                </Button>
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
            <div className="px-16 py-12 space-y-6">
                {/* Calendar View */}
                {viewMode === "calendar" && proyectoId && (
                    <BitacoraCalendarView
                        proyectoId={proyectoId as Id<"desarrollos">}
                        onOpenModal={(data) => bitacoraModal.onOpen(data)}
                    />
                )}

                {/* List View */}
                {/* {viewMode === "list" && logEntries && (
                    <BitacoraListView
                        logEntries={logEntries as unknown as LogEntry[]}
                        proyectoId={proyectoId as Id<"desarrollos">}
                        onOpenModal={(data) => bitacoraModal.onOpen(data)}
                    />
                )} */}

                {/* Grouped View (Default) */}
                {viewMode === "grouped" && Object.entries(groupedLogs).map(([groupName, logs]) => (
                    <div key={groupName} className="bg-[#fcfcfc] rounded-lg border border-gray-200 overflow-hidden">
                        {/* Group Header */}
                        <div className="flex items-center justify-between p-6 border-b border-gray-200">
                            <div className="flex items-center gap-3">
                                <h2 className="text-xl font-medium text-gray-900">{groupName}</h2>
                            </div>
                            <Button
                                variant="outline"
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
                            {getVisibleLogs(groupName, logs).map((log) => {
                                const isExpanded = expandedLogIds.has(log._id);
                                return (
                                    <div key={log._id} className="">
                                        {/* Row Header (Always Visible) */}
                                        <div
                                            className="flex items-center justify-between pl-12 p-6 cursor-pointer hover:bg-gray-50"
                                            onClick={() => toggleLog(log._id)}
                                        >

                                            <div className="flex gap-4 items-start">
                                                <div className="text-gray-400">
                                                    {isExpanded ? <ChevronDown className="h-6 w-6" /> : <ChevronRight className="h-6 w-6" />}
                                                </div>
                                                               <div className="flex flex-col items-start gap-1">
                                                
                                                <span className="font-normal text-gray-900 text-base">
                                                    {formatDateDisplay(log.fecha)}
                                                </span>
                                                <div className="flex items-center gap-8">
                                                    <span className="text-muted-foreground text-sm">{log.departamento}</span>
                                                    <div className="flex items-center gap-2">
                                                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${log.status === "Sin problemas"
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
                                                        {log.documentos && log.documentos.length > 0 && log.documentos.map((doc) => (
                                                            <a
                                                                key={doc._id}
                                                                href={doc.url || "#"}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                onClick={(e) => e.stopPropagation()}
                                                                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100 transition-colors"
                                                            >
                                                                <FileText className="h-3 w-3" />
                                                                {doc.nombre.length > 15 ? doc.nombre.substring(0, 15) + "..." : doc.nombre}
                                                            </a>
                                                        ))}
                                                    </div>
                                                </div>

                                            </div>
                                            </div>
                             

                                            <div className="flex items-center gap-4">
                                                <div className="flex items-center gap-2">
                                                    <div className="h-7 w-7 rounded-full bg-[#dddcd8] flex items-center justify-center text-xs text-gray-700">
                                                        {log.responsable.substring(0, 1).toUpperCase()}
                                                    </div>
                                                    <span className="text-sm text-muted-foreground">{log.responsable}</span>
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
                                                            {isAdmin && (
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
                                                            )}
                                                            {isAdmin && (
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setDeleteDialogState({
                                                                        isOpen: true,
                                                                        logId: log._id as Id<"bitacora">,
                                                                        logDate: log.fecha,
                                                                    });
                                                                    setOpenMenuId(null);
                                                                }}
                                                                className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                                Eliminar
                                                            </button>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Expanded Content */}
                                        {isExpanded && (
                                            <div className="px-6 pb-6 pl-24 flex gap-8 text-left items-start">
                                                <div className="flex-1 space-y-6 pb-4 pt-6">
                                                    <div>
                                                        <h4 className="text-sm   mb-2">Retos / Incidencias:</h4>
                                                        <p className="text-muted-foreground leading-relaxed text-sm">
                                                            {log.comentarios || "Sin incidencias reportadas."}
                                                        </p>
                                                    </div>
                                                    <div>
                                                        <h4 className="text-sm   mb-2">Avance General:</h4>
                                                        <p className="text-muted-foreground leading-relaxed whitespace-pre-line text-sm">
                                                            {log.avance_dia}
                                                        </p>
                                                    </div>
                                                </div>

                                                {/* Photos */}
                                                {log.fotos && log.fotos.length > 0 && (
                                                    <div className="flex gap-3 items-start pb-4">
                                                        {log.fotos.slice(0, 3).map((foto, index) => (
                                                            <div
                                                                key={foto._id}
                                                                className="h-20 w-20 bg-gray-200 rounded-md overflow-hidden border border-gray-300 cursor-pointer hover:opacity-80 transition-opacity"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    openGallery(log, index);
                                                                }}
                                                            >
                                                                {foto.url && (
                                                                    <img
                                                                        src={foto.url}
                                                                        alt="Evidencia"
                                                                        className="h-full w-full object-cover"
                                                                    />
                                                                )}
                                                            </div>
                                                        ))}
                                                        {log.fotos.length > 3 && (
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    openGallery(log, 0);
                                                                }}
                                                                className="h-20 w-20 bg-gray-800 rounded-md flex items-center justify-center text-white text-sm font-medium hover:bg-gray-700 transition-colors"
                                                            >
                                                                +{log.fotos.length - 3} más
                                                            </button>
                                                        )}
                                                        {/* <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                openGallery(log, 0);
                                                            }}
                                                            className="h-20 px-4 bg-gray-100 rounded-md flex items-center justify-center gap-2 text-gray-600 text-sm font-medium hover:bg-gray-200 transition-colors border border-gray-300"
                                                        >
                                                            <Images className="h-4 w-4" />
                                                            Ver galería
                                                        </button> */}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        
                        {/* Per-category Expand/Compact Button */}
                        {logs.length > 6 && (
                            <div className="flex justify-center py-4 border-t border-gray-100">
                                <Button
                                    variant="ghost"
                                    onClick={() => toggleCategoryExpansion(groupName)}
                                    className="text-gray-600 hover:text-gray-900 flex items-center gap-2"
                                >
                                    <ChevronsUpDown className="h-4 w-4" />
                                    {expandedCategories.has(groupName) 
                                        ? "Compactar" 
                                        : `Expandir (${logs.length - 6} más)`}
                                </Button>
                            </div>
                        )}
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

            {/* Gallery Modal */}
            <BitacoraGalleryModal
                isOpen={galleryState.isOpen}
                onClose={closeGallery}
                photos={galleryState.photos}
                initialIndex={galleryState.initialIndex}
                logDate={galleryState.logDate}
                logResponsable={galleryState.logResponsable}
            />

            {/* Delete Confirmation Dialog */}
            <AlertDialog
                open={deleteDialogState.isOpen}
                onOpenChange={(open) => !open && setDeleteDialogState({ isOpen: false, logId: null, logDate: "" })}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>¿Eliminar entrada?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta acción eliminará permanentemente la entrada del {formatDateDisplay(deleteDialogState.logDate)}.
                            Esta acción no se puede deshacer.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDeleteConfirm}
                            disabled={isDeleting}
                            className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
                        >
                            {isDeleting ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Eliminando...
                                </>
                            ) : (
                                "Eliminar"
                            )}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
