import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";

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
    }) => void;
}

export default function BitacoraCalendarView({ proyectoId, onOpenModal }: BitacoraCalendarViewProps) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const [currentDate, setCurrentDate] = useState(new Date());
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
                            className={`bg-white p-3 min-h-[120px] ${isToday ? "bg-blue-50" : ""
                                } hover:bg-gray-50 transition-colors`}
                        >
                            <div className={`text-sm font-semibold mb-2 ${isToday ? "text-blue-600" : "text-gray-900"
                                }`}>
                                {day}
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
                                        const enrichedLog = logs[0] as typeof logs[0] & { departamento?: string };
                                        return (
                                            <button
                                                key={`${categoria}-${day}`}
                                                onClick={() => {
                                                    onOpenModal({
                                                        proyectoId,
                                                        mode: "view",
                                                        logEntry: enrichedLog,
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
        </div>
    );
}
