import { useState } from "react";
import { ChevronLeft, ChevronRight, Eye, Edit2, Plus } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
} from "@/components/ui/sheet";

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

interface LogEntryForModal {
    _id: Id<"bitacora">;
    departamento?: string;
    categoria: string;
    partida_id: Id<"partidas">;
    familias_tags: string[];
    responsable: string;
    fecha: string;
    avance_dia: string;
    comentarios?: string;
    status?: string;
    uploaded_at?: number;
}

interface BitacoraCalendarViewProps {
    proyectoId: Id<"desarrollos">;
    onOpenModal: (data: {
        proyectoId: Id<"desarrollos">;
        mode: "create" | "edit" | "view";
        logEntry?: {
            _id: Id<"bitacora">;
            departamento?: string; // Enriched by backend
            categoria: string;
            partida_id: Id<"partidas">;
            familias_tags: string[];
            responsable: string;
            fecha: string;
            avance_dia: string;
            comentarios?: string;
            status?: string;
            uploaded_at?: number;
        };
        fecha?: string; // For auto-populating date when creating
    }) => void;
}

interface GroupedEntriesModalState {
    isOpen: boolean;
    categoria: string;
    date: string;
    logs: LogEntryForModal[];
}

export default function BitacoraCalendarView({ proyectoId, onOpenModal }: BitacoraCalendarViewProps) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const [currentDate, setCurrentDate] = useState(new Date());
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const [groupedModal, setGroupedModal] = useState<GroupedEntriesModalState>({
        isOpen: false,
        categoria: "",
        date: "",
        logs: [],
    });
    const today = new Date();

    // Get logs for current month
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const logsByDate = useQuery(
        api.bitacora.getLogsByDateRange,
        {
            proyecto: proyectoId,
            month: currentDate.getMonth() + 1,
            year: currentDate.getFullYear(),
        }
    );

    const monthNames = [
        "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
        "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
    ];

    const daysOfWeek = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

    const getDaysInMonth = (date: Date) => {
        const year = date.getFullYear();
        const month = date.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startingDayOfWeek = firstDay.getDay();

        return { daysInMonth, startingDayOfWeek, year, month };
    };

    const handlePreviousMonth = () => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1));
    };

    const handleNextMonth = () => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1));
    };

    const handleToday = () => {
        setCurrentDate(new Date());
    };

    const formatDateKey = (day: number, month: number, year: number) => {
        return `${String(day).padStart(2, '0')}/${String(month + 1).padStart(2, '0')}/${year}`;
    };

    const getCategoryColor = (categoria: string) => {
        const colors: Record<string, string> = {
            Estructura: "bg-blue-500",
            Instalaciones: "bg-purple-500",
            Acabados: "bg-yellow-500",
            Seguridad: "bg-green-500",
            Generales: "bg-gray-500",
        };
        return colors[categoria] || "bg-gray-500";
    };

    const { daysInMonth, startingDayOfWeek, year, month } = getDaysInMonth(currentDate);

    // Create array of days including empty slots for alignment
    const calendarDays = [];
    for (let i = 0; i < startingDayOfWeek; i++) {
        calendarDays.push(null);
    }
    for (let day = 1; day <= daysInMonth; day++) {
        calendarDays.push(day);
    }

    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            {/* Calendar Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                    <h2 className="text-2xl font-bold text-gray-900">
                        {monthNames[month]} {year}
                    </h2>
                    <button
                        onClick={handleToday}
                        className="px-3 py-1 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                        Hoy
                    </button>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handlePreviousMonth}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        <ChevronLeft className="h-5 w-5" />
                    </button>
                    <button
                        onClick={handleNextMonth}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        <ChevronRight className="h-5 w-5" />
                    </button>
                </div>
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-px bg-gray-200 border border-gray-200 rounded-lg overflow-hidden">
                {/* Day headers */}
                {daysOfWeek.map((day) => (
                    <div
                        key={day}
                        className="bg-gray-50 p-3 text-center text-sm font-semibold text-gray-700"
                    >
                        {day}
                    </div>
                ))}

                {/* Calendar days */}
                {calendarDays.map((day, index) => {
                    if (day === null) {
                        return <div key={`empty-${index}`} className="bg-white min-h-[120px]" />;
                    }

                    const dateKey = formatDateKey(day, month, year);
                    const logsForDay = logsByDate?.[dateKey] || [];
                    const isToday =
                        day === today.getDate() &&
                        month === today.getMonth() &&
                        year === today.getFullYear();

                    return (
                        <div
                            key={`day-${day}`}
                            onClick={() => {
                                // Click on empty area to create new report for this day
                                onOpenModal({
                                    proyectoId,
                                    mode: "create",
                                    fecha: dateKey,
                                });
                            }}
                            className={`bg-white p-3 min-h-[120px] ${isToday ? "bg-blue-50" : ""
                                } hover:bg-gray-50 transition-colors cursor-pointer group`}
                        >
                            <div className={`flex items-center justify-between mb-2`}>
                                <span className={`text-sm font-semibold ${isToday ? "text-blue-600" : "text-gray-900"}`}>
                                    {day}
                                </span>
                                <Plus className="h-4 w-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>

                            {/* Log entries for this day grouped by category */}
                            <div className="space-y-1">
                                {(() => {
                                    // Group logs by categoria
                                    const groupedByCategory = logsForDay.reduce((acc, log) => {
                                        const categoria = log.categoria || "Generales";
                                        if (!acc[categoria]) acc[categoria] = [];
                                        acc[categoria].push(log);
                                        return acc;
                                    }, {} as Record<string, typeof logsForDay>);

                                    // Render category badges
                                    return Object.entries(groupedByCategory).map(([categoria, logs]) => {
                                        const enrichedLogs = logs as (typeof logs[0] & { departamento?: string })[];
                                        return (
                                            <button
                                                key={`${categoria}-${day}`}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    // Always open grouped modal (even for single entry)
                                                    setGroupedModal({
                                                        isOpen: true,
                                                        categoria,
                                                        date: dateKey,
                                                        logs: enrichedLogs,
                                                    });
                                                }}
                                                className={`w-full text-left px-2 py-1 rounded text-xs font-medium text-white hover:opacity-90 transition-opacity ${getCategoryColor(categoria)}`}
                                            >
                                                <div className="flex items-center justify-between gap-1">
                                                    <span className="truncate">{categoria}</span>
                                                    {logs.length > 1 && (
                                                        <span className="bg-white/30 px-1.5 py-0.5 rounded text-[10px]">
                                                            {logs.length}
                                                        </span>
                                                    )}
                                                </div>
                                            </button>
                                        );
                                    });
                                })()}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Legend */}
            <div className="mt-6 flex items-center gap-6 text-sm">
                <span className="font-medium text-gray-700">Categorías:</span>
                {["Estructura", "Instalaciones", "Acabados", "Seguridad", "Generales"].map((cat) => (
                    <div key={cat} className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded ${getCategoryColor(cat)}`} />
                        <span className="text-gray-600">{cat}</span>
                    </div>
                ))}
            </div>

            {/* Grouped Entries Modal */}
            <Sheet
                open={groupedModal.isOpen}
                onOpenChange={(open) => !open && setGroupedModal(prev => ({ ...prev, isOpen: false }))}
            >
                <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
                    <SheetHeader className="p-6 pb-4 border-b">
                        <div className="flex items-center gap-3">
                            <div className={`w-3 h-3 rounded ${getCategoryColor(groupedModal.categoria)}`} />
                            <SheetTitle>{groupedModal.categoria}</SheetTitle>
                        </div>
                        <SheetDescription>
                            {formatDateDisplay(groupedModal.date)} • {groupedModal.logs.length} {groupedModal.logs.length === 1 ? "reporte" : "reportes"}
                        </SheetDescription>
                    </SheetHeader>

                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                        {groupedModal.logs.map((log) => (
                            <div
                                key={log._id}
                                className="bg-gray-50 rounded-lg p-4 border border-gray-100"
                            >
                                {/* Header */}
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <div className="h-7 w-7 rounded-full bg-[#dddcd8] flex items-center justify-center text-xs text-gray-700">
                                            {log.responsable.substring(0, 1).toUpperCase()}
                                        </div>
                                        <span className="text-sm font-medium text-gray-900">{log.responsable}</span>
                                    </div>
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${log.status === "Sin problemas"
                                        ? "bg-green-50 text-green-700 border border-green-200"
                                        : "bg-yellow-50 text-yellow-700 border border-yellow-200"
                                        }`}>
                                        {log.status || "Sin problemas"}
                                    </span>
                                </div>

                                {/* Partida */}
                                {log.departamento && (
                                    <p className="text-xs text-muted-foreground mb-2">{log.departamento}</p>
                                )}

                                {/* Avance preview */}
                                <p className="text-sm text-gray-600 line-clamp-2 mb-3">
                                    {log.avance_dia}
                                </p>

                                {/* Tags */}
                                {log.familias_tags && log.familias_tags.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mb-3">
                                        {log.familias_tags.map((tag) => (
                                            <span key={tag} className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600">
                                                {tag}
                                            </span>
                                        ))}
                                    </div>
                                )}

                                {/* Actions */}
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => {
                                            setGroupedModal(prev => ({ ...prev, isOpen: false }));
                                            onOpenModal({
                                                proyectoId,
                                                mode: "view",
                                                logEntry: log,
                                            });
                                        }}
                                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
                                    >
                                        <Eye className="h-3 w-3" />
                                        Ver detalles
                                    </button>
                                    <button
                                        onClick={() => {
                                            setGroupedModal(prev => ({ ...prev, isOpen: false }));
                                            onOpenModal({
                                                proyectoId,
                                                mode: "edit",
                                                logEntry: log,
                                            });
                                        }}
                                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
                                    >
                                        <Edit2 className="h-3 w-3" />
                                        Editar
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </SheetContent>
            </Sheet>
        </div>
    );
}
