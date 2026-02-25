import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useParams } from "react-router";
import { api } from "../../../convex/_generated/api";
import { useQuery, useMutation } from "convex/react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronDown, ChevronRight, Search, MoreHorizontal, Upload, Loader2, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import ProgramaObraGanttItem from "./ProgramaObraGanttItem";
import { Id } from "../../../convex/_generated/dataModel";
import { type ScheduleData, type ProgramaItem, parseDate } from "./programa-obra-types";
import ProgramaObraPartidaEditor from "./ProgramaObraPartidaEditor";
import ProgramaObraFamiliaEditor from "./ProgramaObraFamiliaEditor";
import ProgramaObraComentarios from "./ProgramaObraComentarios";

// ============================================================
// Helpers
// ============================================================

const MONTHS_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

/** Get month columns with week counts */
function getTimelineMonths(year: number): { label: string; month: number; year: number; weeks: number }[] {
  return MONTHS_ES.map((label, i) => {
    const daysInMonth = new Date(year, i + 1, 0).getDate();
    const weeks = Math.ceil(daysInMonth / 7);
    return { label, month: i, year, weeks };
  });
}

const WEEK_WIDTH = 32; // px per week column
const getMonthWidth = (weeks: number) => weeks * WEEK_WIDTH;

const API_BASE_URL = "https://ogc-excel-reader.vercel.app";

type TMonth = { weeks: number };
/** Convert a DD/MM/YYYY or YYYY-MM-DD string to a pixel offset for the given year */
function dateStrToPixel(
  dateStr: string | undefined | null,
  year: number,
  months: TMonth[]
): number | null {
  if (!dateStr) return null;
  let d: Date;
  if (dateStr.includes("/")) {
    const [day, m, y] = dateStr.split("/").map(Number);
    d = new Date(y, m - 1, day);
  } else if (dateStr.includes("-")) {
    const [y, m, day] = dateStr.split("-").map(Number);
    d = new Date(y, m - 1, day);
  } else return null;
  if (d.getFullYear() !== year) {
    if (d.getFullYear() < year) return 0;
    return months.reduce((s, m) => s + m.weeks * WEEK_WIDTH, 0);
  }
  const month = d.getMonth();
  const dayN = d.getDate();
  const dim = new Date(year, month + 1, 0).getDate();
  const frac = (dayN - 1) / dim;
  let off = 0;
  for (let i = 0; i < month; i++) off += months[i].weeks * WEEK_WIDTH;
  return off + frac * months[month].weeks * WEEK_WIDTH;
}

// ============================================================
// Component
// ============================================================

export default function ProgramaObra() {
  const { proyectoId } = useParams<{ proyectoId: string }>();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [editingPartida, setEditingPartida] = useState<ProgramaItem | null>(null);
  const [editingFamilia, setEditingFamilia] = useState<ProgramaItem | null>(null);
  const [comentariosItem, setComentariosItem] = useState<ProgramaItem | null>(null);

  // Fetch current project
  const proyecto = useQuery(api.desarrollos.getById, proyectoId ? { id: proyectoId as Id<"desarrollos"> } : "skip");

  // Fetch only nivel 1 partidas for the project
  const nivel1Partidas = useQuery(
    api.partida.getByNivel,
    proyectoId ? { proyecto: proyectoId as Id<"desarrollos">, nivel: 1 } : "skip"
  );

  // Fetch programa_obra schedules
  const schedules = useQuery(
    api.programa_obra.getSchedulesByProyecto,
    proyectoId ? { proyecto_id: proyectoId as Id<"desarrollos"> } : "skip"
  );

  // Fetch programa_obra_detalle (children: familia / subpartida)
  const detalles = useQuery(
    api.programa_obra.getDetallesByProyecto,
    proyectoId ? { proyecto_id: proyectoId as Id<"desarrollos"> } : "skip"
  );

  // Fetch comentarios
  const comentarios = useQuery(
    api.programa_obra.getComentariosByProyecto,
    proyectoId ? { proyecto_id: proyectoId as Id<"desarrollos"> } : "skip"
  );

  // Mutations
  const bulkUpsertFromExcel = useMutation(api.programa_obra.bulkUpsertFromExcel);
  const updateDetalleAvance = useMutation(api.programa_obra.updateDetalleAvance);
  const updateSchedulePeso = useMutation(api.programa_obra.updateSchedulePeso);
  const updateDetallePeso = useMutation(api.programa_obra.updateDetallePeso);

  // Avance editing state
  const [editingAvanceId, setEditingAvanceId] = useState<string | null>(null);
  const [editingAvanceValue, setEditingAvanceValue] = useState("");
  const editingAvanceValueRef = useRef("");
  const editingItemRef = useRef<ProgramaItem | null>(null);

  // Peso editing state
  const [editingPesoId, setEditingPesoId] = useState<string | null>(null);
  const [editingPesoValue, setEditingPesoValue] = useState("");
  const editingPesoValueRef = useRef("");
  const editingPesoItemRef = useRef<ProgramaItem | null>(null);

  // Build lookup maps
  const scheduleMap = useMemo(() => {
    const map = new Map<string, ScheduleData>();
    schedules?.forEach((s) => map.set(s.partida_id, s));
    return map;
  }, [schedules]);

  // ============================================================
  // Build hierarchical tree: nivel 1 partidas + detalle children
  // ============================================================
  const programaData = useMemo(() => {
    if (!nivel1Partidas) return [];

    // Only include partidas that have uploaded Excel data (orden is set), sorted by Excel order
    const matched = nivel1Partidas
      .filter((p) => {
        const s = scheduleMap.get(p._id);
        return s != null && s.orden != null;
      })
      .sort((a, b) => {
        const oa = scheduleMap.get(a._id)!.orden!;
        const ob = scheduleMap.get(b._id)!.orden!;
        return oa - ob;
      });

    return matched.map((p1) => {
      const schedule = scheduleMap.get(p1._id) || null;

      // Get nivel 2 detalles for this partida (familia items only, with orden set from Excel), sorted by Excel order
      const familiaDetalles = (detalles?.filter((d) => d.partida === p1.nombre && d.nivel === 2 && d.orden != null) || [])
        .sort((a, b) => (a.orden ?? Infinity) - (b.orden ?? Infinity));

      // Build familia (level 1) items from nivel 2 detalles
      const familiaItems: ProgramaItem[] = familiaDetalles.map((fam) => ({
        id: `fam-${p1.nombre}-${fam.familia}`,
        partida: fam.familia,
        presupuesto: 0,
        pagado: 0,
        expanded: false,
        level: 1,
        parentPartidaNombre: p1.nombre,
        parentPartidaDbId: p1._id,
        familiaName: fam.familia,
        schedule, // inherit parent schedule for gray background
        detalleSchedule: fam,
        ponderacion: fam.peso,
        avanceReal: fam.avance_porcentaje ?? 0,
        children: [],
      } as ProgramaItem));

      // Financiero = pagado/presupuesto for nivel 1
      const financiero =
        p1.presupuesto_aprobado > 0
          ? Math.round((p1.pagado / p1.presupuesto_aprobado) * 100)
          : 0;

      // Compute partida-level avance as weighted average of familias
      let partidaAvance = 0;
      if (familiaItems.length > 0) {
        const totalWeight = familiaItems.reduce((s, c) => s + (c.ponderacion || 0), 0);
        if (totalWeight > 0) {
          partidaAvance = familiaItems.reduce(
            (s, c) => s + (c.avanceReal ?? 0) * (c.ponderacion || 0),
            0
          ) / totalWeight;
        } else {
          partidaAvance = familiaItems.reduce((s, c) => s + (c.avanceReal ?? 0), 0) / familiaItems.length;
        }
      }

      // Find the farthest familia end date that extends beyond the partida's end
      const parentEnd = parseDate(schedule?.fecha_fin);
      let maxChildEnd: Date | null = null;
      for (const fam of familiaDetalles) {
        const famEnd = parseDate(fam.fecha_fin);
        if (famEnd && parentEnd && famEnd > parentEnd) {
          if (!maxChildEnd || famEnd > maxChildEnd) maxChildEnd = famEnd;
        }
      }
      const maxChildEndDate = maxChildEnd
        ? `${maxChildEnd.getDate().toString().padStart(2, "0")}/${(maxChildEnd.getMonth() + 1).toString().padStart(2, "0")}/${maxChildEnd.getFullYear()}`
        : undefined;

      return {
        id: `partida-${p1._id}`,
        partidaDbId: p1._id,
        partida: p1.nombre,
        presupuesto: p1.presupuesto_aprobado || 0,
        pagado: p1.pagado || 0,
        expanded: false,
        level: 0,
        schedule,
        ponderacion: schedule?.peso,
        avanceReal: Math.round(partidaAvance * 100) / 100,
        financiero,
        maxChildEndDate,
        children: familiaItems,
      } as ProgramaItem;
    });
  }, [nivel1Partidas, scheduleMap, detalles]);

  // Attach comentarios to items
  const programaDataWithComentarios = useMemo(() => {
    if (!comentarios || comentarios.length === 0) return programaData;
    return programaData.map((item) => {
      const itemComentarios = comentarios.filter(
        (c) => c.parent_type === "partida" && c.parent_id === (item.schedule?._id ?? "")
      );
      const childrenWithComentarios = item.children.map((child) => {
        const childComentarios = comentarios.filter(
          (c) => c.parent_type === "familia" && c.parent_id === (child.detalleSchedule?._id ?? "")
        );
        return { ...child, comentarios: childComentarios };
      });
      return { ...item, comentarios: itemComentarios, children: childrenWithComentarios };
    });
  }, [programaData, comentarios]);

  // ============================================================
  // Expansion state management (separate from data to avoid resets)
  // ============================================================
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Compute overall weighted progress from level 0 items
  const overallProgress = useMemo(() => {
    if (programaDataWithComentarios.length === 0) return 0;
    const totalWeight = programaDataWithComentarios.reduce((s, p) => s + (p.ponderacion || 0), 0);
    if (totalWeight > 0) {
      const weighted = programaDataWithComentarios.reduce(
        (s, p) => s + (p.avanceReal ?? 0) * (p.ponderacion || 0), 0
      ) / totalWeight;
      return Math.round(weighted * 100) / 100;
    }
    // Simple average if no weights
    return Math.round(
      (programaDataWithComentarios.reduce((s, p) => s + (p.avanceReal ?? 0), 0) / programaDataWithComentarios.length) * 100
    ) / 100;
  }, [programaDataWithComentarios]);

  // Save peso for a level 0 or level 1 item
  const handleSavePeso = useCallback(
    async () => {
      const item = editingPesoItemRef.current;
      const rawValue = editingPesoValueRef.current;
      const value = parseFloat(rawValue);
      if (isNaN(value) || value < 0 || value > 100) {
        editingPesoItemRef.current = null;
        setEditingPesoId(null);
        setEditingPesoValue("");
        return;
      }
      try {
        if (item?.level === 0 && item.schedule?._id) {
          await updateSchedulePeso({ schedule_id: item.schedule._id, peso: value });
        } else if (item?.level === 1 && item.detalleSchedule?._id) {
          await updateDetallePeso({ detalle_id: item.detalleSchedule._id, peso: value });
        }
      } catch (err) {
        console.error("Error saving peso:", err);
      }
      editingPesoItemRef.current = null;
      setEditingPesoId(null);
      setEditingPesoValue("");
    },
    [updateSchedulePeso, updateDetallePeso]
  );

  // Save avance real for a familia item (uses refs to avoid stale closures)
  const handleSaveAvance = useCallback(
    async () => {
      const item = editingItemRef.current;
      const rawValue = editingAvanceValueRef.current;
      const detalleId = item?.detalleSchedule?._id;
      if (!detalleId) {
        editingItemRef.current = null;
        setEditingAvanceId(null);
        setEditingAvanceValue("");
        return;
      }
      const value = parseFloat(rawValue);
      if (isNaN(value) || value < 0 || value > 100) {
        editingItemRef.current = null;
        setEditingAvanceId(null);
        setEditingAvanceValue("");
        return;
      }
      try {
        await updateDetalleAvance({
          detalle_id: detalleId,
          avance_porcentaje: value,
        });
      } catch (err) {
        console.error("Error saving avance:", err);
      }
      editingItemRef.current = null;
      setEditingAvanceId(null);
      setEditingAvanceValue("");
    },
    [updateDetalleAvance]
  );

  // Flatten tree respecting expanded state
  const flattenedData = useMemo(() => {
    const result: ProgramaItem[] = [];
    const walk = (items: ProgramaItem[]) => {
      items.forEach((item) => {
        result.push(item);
        if (expandedIds.has(item.id) && item.children.length > 0) {
          walk(item.children);
        }
      });
    };
    walk(programaDataWithComentarios);
    return result;
  }, [programaDataWithComentarios, expandedIds]);

  // Filter
  const filteredData = useMemo(() => {
    return flattenedData.filter((item) => {
      if (searchTerm && !item.partida.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      return true;
    });
  }, [flattenedData, searchTerm]);

  // Timeline months for the selected year
  const timelineMonths = useMemo(() => getTimelineMonths(selectedYear), [selectedYear]);

  // Today line position
  const todayPosition = useMemo(() => {
    const now = new Date();
    if (now.getFullYear() !== selectedYear) return null;
    const month = now.getMonth();
    const day = now.getDate();
    const daysInMonth = new Date(selectedYear, month + 1, 0).getDate();
    const fraction = (day - 1) / daysInMonth;
    // Sum widths of all preceding months
    let offset = 0;
    for (let i = 0; i < month; i++) {
      offset += getMonthWidth(timelineMonths[i].weeks);
    }
    return offset + fraction * getMonthWidth(timelineMonths[month].weeks);
  }, [selectedYear, timelineMonths]);

  // Excel upload state
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ created: number; updated: number; errors: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExcelUpload = useCallback(
    async (file: File) => {
      if (!proyectoId) return;
      setUploading(true);
      setUploadResult(null);

      try {
        // 1. Send file to backend API for parsing
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch(`${API_BASE_URL}/upload/programa-obra`, {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Error parsing Excel file");
        }

        const data = await res.json();

        // 2. Transform API response into rows for bulkUpsert
        // The API returns { partidas: [...] } with nested children
        const rows: {
          nivel: number;
          partida: string;
          familia?: string;
          subpartida?: string;
          fecha_inicio?: string;
          fecha_fin?: string;
          anticipo_fecha?: string;
          anticipo_porcentaje?: number;
          suministro_fecha?: string;
          finiquito_fecha?: string;
          finiquito_porcentaje?: number;
          peso?: number;
        }[] = [];

        if (data.partidas) {
          for (const p of data.partidas) {
            // NIVEL 1 row
            rows.push({
              nivel: 1,
              partida: p.partida,
              fecha_inicio: p.fecha_inicio || undefined,
              fecha_fin: p.fecha_fin || undefined,
              anticipo_fecha: p.anticipo_fecha || undefined,
              anticipo_porcentaje: p.anticipo_porcentaje || undefined,
              suministro_fecha: p.suministro_fecha || undefined,
              finiquito_fecha: p.finiquito_fecha || undefined,
              finiquito_porcentaje: p.finiquito_porcentaje || undefined,
              peso: p.peso || undefined,
            });
            // Children (nivel 2 & 3)
            if (p.children) {
              for (const child of p.children) {
                rows.push({
                  nivel: child.nivel,
                  partida: p.partida,
                  familia: child.familia || undefined,
                  subpartida: child.subpartida || undefined,
                  fecha_inicio: child.fecha_inicio || undefined,
                  fecha_fin: child.fecha_fin || undefined,
                  anticipo_fecha: child.anticipo_fecha || undefined,
                  anticipo_porcentaje: child.anticipo_porcentaje || undefined,
                  suministro_fecha: child.suministro_fecha || undefined,
                  finiquito_fecha: child.finiquito_fecha || undefined,
                  finiquito_porcentaje: child.finiquito_porcentaje || undefined,
                  peso: child.peso || undefined,
                });
              }
            }
          }
        }

        // 3. Call Convex mutation to upsert
        const result = await bulkUpsertFromExcel({
          proyecto: proyectoId as Id<"desarrollos">,
          rows,
        });

        setUploadResult(result);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        setUploadResult({ created: 0, updated: 0, errors: [msg] });
      } finally {
        setUploading(false);
        // Reset file input
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [proyectoId, bulkUpsertFromExcel]
  );

  // Scroll to today on mount
  useEffect(() => {
    if (todayPosition && scrollContainerRef.current) {
      const offset = todayPosition - scrollContainerRef.current.clientWidth / 2;
      scrollContainerRef.current.scrollLeft = Math.max(0, offset);
    }
  }, [todayPosition]);

  // Loading state
  if (!proyecto || !nivel1Partidas) {
    return (
      <div className="bg-white px-12 py-6 min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4" />
          <p className="text-gray-500">Cargando datos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white py-6 space-y-6">
      {/* Header */}
      <div className="px-12">
        <div className="flex items-end justify-between py-6 border-b border-[#d2d1ce] pb-8">
          <div className="flex flex-col text-left">
            <p className="text-base text-gray-500 mb-1">Programa de Obra</p>
            <h1 className="text-2xl text-gray-900">{proyecto.nombre}</h1>
          </div>
          <div className="flex items-center gap-3">
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleExcelUpload(f);
              }}
            />
            <Button
              variant="outline"
              className="rounded-none gap-2"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {uploading ? "Procesando..." : "Cargar Excel"}
            </Button>
            <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
              <SelectTrigger className="w-28 rounded-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[2024, 2025, 2026, 2027].map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Upload result feedback */}
        {uploadResult && (
          <div className={cn(
            "mt-3 px-4 py-2.5 text-sm rounded-none border",
            uploadResult.errors.length > 0
              ? "bg-red-50 border-red-200 text-red-700"
              : "bg-green-50 border-green-200 text-green-700"
          )}>
            <span className="font-medium">
              {uploadResult.created + uploadResult.updated > 0
                ? `✓ ${uploadResult.created} creados, ${uploadResult.updated} actualizados`
                : "Sin cambios"}
            </span>
            {uploadResult.errors.length > 0 && (
              <span className="ml-2">
                · {uploadResult.errors.length} error{uploadResult.errors.length > 1 ? "es" : ""}:
                {" "}{uploadResult.errors.slice(0, 3).join("; ")}
                {uploadResult.errors.length > 3 && ` (+${uploadResult.errors.length - 3} más)`}
              </span>
            )}
            <button
              className="ml-3 text-xs underline opacity-60 hover:opacity-100"
              onClick={() => setUploadResult(null)}
            >
              Cerrar
            </button>
          </div>
        )}
      </div>


      {/* Search */}
      <div className="px-12">
        <div className="flex items-center space-x-3 text-left max-w-sm">
          <Search className="w-4 h-4 text-gray-400 shrink-0" />
          <Input
            placeholder="Buscar partida..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="border-none shadow-none p-0 h-auto font-normal text-gray-900 focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </div>
      </div>

      <div>
        {/* General progress bar — aligned to timeline columns, only visible width */}
        <div className="flex">
          {/* Spacer matching fixed left columns (w-72 + w-28 = 400px) */}
          <div className="shrink-0 w-[400px]" />
          {/* Progress bar fills only the remaining visible viewport width */}
          <div className="flex-1 min-w-0 overflow-hidden">
            <div className="h-2 bg-gray-100">
              <div
                className="h-full bg-green-500 rounded-none transition-all duration-500"
                style={{ width: `${Math.min(overallProgress, 100)}%` }}
              />
            </div>
          </div>
        </div>


        {/* Gantt Chart */}
        <div className="overflow-hidden bg-white">
          <div className="flex">
            {/* Fixed left columns */}
            <div className="shrink-0">
              {/* Header */}
              <div className="flex border-b border-t border-[#d2d1ce] bg-white sticky top-0 z-20">
                <div className="w-72 border-r border-[#d2d1ce] px-4 py-3 text-left">
                  <span className="text-xs font-medium text-[#777770] uppercase tracking-wider">
                    Partida · Familia
                  </span>
                </div>
                <div className="w-28 border-r border-[#d2d1ce] px-3 py-3 text-right">
                  <span className="text-xs font-medium text-[#777770] uppercase tracking-wider">
                    Presupuesto
                  </span>
                </div>
              </div>

              {/* Rows */}
              {filteredData.map((item) => {
                const isExpanded = expandedIds.has(item.id);
                return (
                  <div
                    key={item.id}
                    className={cn(
                      "flex border-b border-[#d2d1ce] min-h-[44px] max-h-[44px] bg-white",
                      // item.level === 0 && "bg-white",
                      // item.level === 1 && "bg-gray-50/50",
                      // item.level === 2 && "bg-gray-50/30"
                    )}
                  >
                    {/* Name */}
                    <div className="w-72 border-r border-[#d2d1ce] px-2 py-3 flex items-center text-left">
                      <div
                        className="flex items-center gap-1.5 flex-1 min-w-0"
                        style={{ paddingLeft: `${item.level * 16}px` }}
                      >
                        {item.children.length > 0 ? (
                          <button
                            onClick={() => toggleExpanded(item.id)}
                            className="p-0.5 hover:bg-gray-100 rounded shrink-0"
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
                            )}
                          </button>
                        ) : (
                          <div className="w-4.5 shrink-0" />
                        )}
                        <span
                          className={cn(
                            "text-sm truncate",
                            item.level === 0 && "font-medium text-gray-900",
                            item.level === 1 && "text-gray-600"
                          )}
                          title={item.partida}
                        >
                          {item.partida}
                        </span>

                        {/* Menu for nivel 0 */}
                        {item.level === 0 && (
                          <div className="ml-auto flex items-center gap-0.5 shrink-0">
                            <button
                              onClick={() => setComentariosItem(item)}
                              className="p-1 hover:bg-gray-100 rounded opacity-60 hover:opacity-100"
                              title="Comentarios"
                            >
                              <MessageSquare className="h-3.5 w-3.5 text-gray-400" />
                            </button>
                            <button
                              onClick={() => setEditingPartida(item)}
                              className="p-1 hover:bg-gray-100 rounded opacity-60 hover:opacity-100"
                            >
                              <MoreHorizontal className="h-3.5 w-3.5 text-gray-400" />
                            </button>
                          </div>
                        )}

                        {/* Menu for nivel 1 (familia) */}
                        {item.level === 1 && (
                          <div className="ml-auto flex items-center gap-0.5 shrink-0">
                            <button
                              onClick={() => setComentariosItem(item)}
                              className="p-1 hover:bg-gray-100 rounded opacity-60 hover:opacity-100"
                              title="Comentarios"
                            >
                              <MessageSquare className="h-3.5 w-3.5 text-gray-400" />
                            </button>
                            <button
                              onClick={() => setEditingFamilia(item)}
                              className="p-1 hover:bg-gray-100 rounded opacity-60 hover:opacity-100"
                            >
                              <MoreHorizontal className="h-3.5 w-3.5 text-gray-400" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Presupuesto / Peso / Avance */}
                    <div className="w-28 border-r border-[#d2d1ce] px-3 py-3 flex items-center justify-end">
                      {item.level === 0 ? (
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="text-sm text-gray-700 font-medium">
                            {formatCurrency(item.presupuesto)}
                          </span>
                          {/* Editable peso for level 0 */}
                          {editingPesoId === item.id ? (
                            <div className="flex items-center gap-0.5">
                              <input
                                type="number"
                                min={0}
                                max={100}
                                autoFocus
                                value={editingPesoValue}
                                onChange={(e) => {
                                  setEditingPesoValue(e.target.value);
                                  editingPesoValueRef.current = e.target.value;
                                }}
                                onBlur={() => handleSavePeso()}
                                onKeyDown={(e: React.KeyboardEvent) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    (e.target as HTMLInputElement).blur();
                                  }
                                  if (e.key === "Escape") {
                                    editingPesoItemRef.current = null;
                                    setEditingPesoId(null);
                                    setEditingPesoValue("");
                                  }
                                }}
                                className="w-16 h-4 text-[9px] text-right border border-gray-300 rounded-sm px-1 focus:outline-none focus:border-blue-500 bg-white"
                              />
                              <span className="text-[9px] text-gray-400">%</span>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                editingPesoItemRef.current = item;
                                editingPesoValueRef.current = String(item.ponderacion ?? "");
                                setEditingPesoId(item.id);
                                setEditingPesoValue(String(item.ponderacion ?? ""));
                              }}
                              className="text-[9px] text-gray-400 hover:text-gray-600 transition-colors"
                              title="Editar peso"
                            >
                              {item.ponderacion != null ? `peso: ${(item.ponderacion).toFixed(2)}%` : "peso: —"}
                            </button>
                          )}
                        </div>
                      ) : item.level === 1 ? (
                        <div className="flex flex-col items-end gap-0.5">


                {/* Editable avance for level 1 */}
                          {editingAvanceId === item.id ? (
                            <div className="flex items-center gap-0.5">
                              <input
                                type="number"
                                min={0}
                                max={100}
                                autoFocus
                                value={editingAvanceValue}
                                onChange={(e) => {
                                  setEditingAvanceValue(e.target.value);
                                  editingAvanceValueRef.current = e.target.value;
                                }}
                                onBlur={() => handleSaveAvance()}
                                onKeyDown={(e: React.KeyboardEvent) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    (e.target as HTMLInputElement).blur();
                                  }
                                  if (e.key === "Escape") {
                                    editingItemRef.current = null;
                                    setEditingAvanceId(null);
                                    setEditingAvanceValue("");
                                  }
                                }}
                                className="w-16 h-5 text-[10px] text-right border border-green-300 rounded-sm px-1 focus:outline-none focus:border-green-500 bg-white"
                              />
                              <span className="text-[10px] text-gray-400">%</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-0.5">
                              <span className="text-[10px] text-black">Avance: </span>
                              <button
                                onClick={() => {
                                  editingItemRef.current = item;
                                  editingAvanceValueRef.current = String(item.avanceReal ?? 0);
                                  setEditingAvanceId(item.id);
                                  setEditingAvanceValue(String(item.avanceReal ?? 0));
                                }}
                                className={cn(
                                  "text-[10px] rounded-sm border-none transition-colors",
                                  (item.avanceReal ?? 0) > 0
                                    ? ""
                                    : "text-gray-400 bg-gray-50 border-gray-200 hover:bg-gray-100"
                                )}
                                title="Editar avance real"
                              >
                                {Math.round(item.avanceReal ?? 0)}%
                              </button>
                            </div>
                          )}

                          {/* Editable peso for level 1 */}
                          {editingPesoId === item.id ? (
                            <div className="flex items-center gap-0.5">
                              <input
                                type="number"
                                min={0}
                                max={100}
                                autoFocus
                                value={editingPesoValue}
                                onChange={(e) => {
                                  setEditingPesoValue(e.target.value);
                                  editingPesoValueRef.current = e.target.value;
                                }}
                                onBlur={() => handleSavePeso()}
                                onKeyDown={(e: React.KeyboardEvent) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    (e.target as HTMLInputElement).blur();
                                  }
                                  if (e.key === "Escape") {
                                    editingPesoItemRef.current = null;
                                    setEditingPesoId(null);
                                    setEditingPesoValue("");
                                  }
                                }}
                                className="w-16 h-4 text-[9px] text-right border border-green-300 rounded-sm px-1 focus:outline-none focus:border-green-500 bg-white"
                              />
                              <span className="text-[9px] text-gray-400">%</span>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                editingPesoItemRef.current = item;
                                editingPesoValueRef.current = String(item.ponderacion ?? "");
                                setEditingPesoId(item.id);
                                setEditingPesoValue(String(item.ponderacion ?? ""));
                              }}
                              className="text-[9px] text-gray-400 hover:text-gray-600 transition-colors"
                              title="Editar peso"
                            >
                              {item.ponderacion != null ? `${(item.ponderacion).toFixed(2)}%` : "—"}
                            </button>

                          )}
          
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Scrollable timeline */}
            <div className="flex-1 overflow-x-auto" ref={scrollContainerRef}>
              {/* Month headers */}
              <div className="flex border-b border-t border-[#d2d1ce] bg-white sticky top-0 z-10 min-w-max">
                {timelineMonths.map((m, i) => {
                  const mw = getMonthWidth(m.weeks);
                  return (
                    <div key={i} className="border-r border-[#d2d1ce] shrink-0 h-[48px]" style={{ width: mw }}>
                      <div className="text-center py-1.5 text-xs font-medium text-[#777770] uppercase tracking-wider">
                        {m.label}
                      </div>
                      <div className="flex">
                        {Array.from({ length: m.weeks }).map((_, wi) => (
                          <div
                            key={wi}
                            className={cn(
                              "text-center text-[9px] text-gray-300 py-1",
                              wi < m.weeks - 1 && "border-r border-dashed border-gray-200"
                            )}
                            style={{ width: WEEK_WIDTH }}
                          >
                            S{wi + 1}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
                <div className="px-4 py-3 text-xs font-medium text-gray-300 ml-2">
                  {selectedYear}
                </div>
              </div>

              {/* Timeline rows */}
              {filteredData.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    "relative border-b border-[#d2d1ce] min-h-[44px] max-h-[44px] bg-white",
                    // item.level === 0 && "bg-white",
                    // item.level === 1 && "bg-gray-50/80",
                    // item.level === 2 && "bg-gray-50/80"
                  )}
                >
                  {/* Parent-range gray background for child items */}
                  {item.level === 1 && item.schedule && (() => {
                    const pStart = dateStrToPixel(item.schedule.fecha_inicio, selectedYear, timelineMonths);
                    const pEnd = dateStrToPixel(item.schedule.fecha_fin, selectedYear, timelineMonths);
                    if (pStart == null || pEnd == null) return null;
                    return (
                      <div
                        className="absolute top-0 bottom-0 bg-[#f3f3f3f4] pointer-events-none z-[1]"
                        style={{ left: pStart, width: Math.max(pEnd - pStart, 0) }}
                      >
                        <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#D4D4CF]" />
                      </div>
                    );
                  })()}

                  {/* Grid lines */}
                  <div className="absolute inset-0 flex pointer-events-none z-[2]">
                    {timelineMonths.map((m, i) => (
                      <div key={i} className="border-r border-[#d2d1ce] shrink-0 flex" style={{ width: getMonthWidth(m.weeks) }}>
                        {Array.from({ length: m.weeks - 1 }).map((_, wi) => (
                          <div key={wi} className="border-r border-dashed border-gray-200 shrink-0" style={{ width: WEEK_WIDTH }} />
                        ))}
                      </div>
                    ))}
                  </div>

                  {/* Today line */}
                  {todayPosition != null && (
                    <div
                      className="absolute top-0 bottom-0 w-px border-l-2 border-dashed border-[#802424] z-10 pointer-events-none"
                      style={{ left: todayPosition }}
                    />
                  )}

                  {/* Gantt bar */}
                  <ProgramaObraGanttItem
                    item={item}
                    year={selectedYear}
                    columnWidth={WEEK_WIDTH}
                    timelineMonths={timelineMonths}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>



      {/* Partida Editor Sheet */}
      {editingPartida && proyectoId && (
        <ProgramaObraPartidaEditor
          item={editingPartida}
          proyectoId={proyectoId as Id<"desarrollos">}
          onClose={() => setEditingPartida(null)}
        />
      )}

      {/* Familia Editor Sheet */}
      {editingFamilia && proyectoId && (
        <ProgramaObraFamiliaEditor
          item={editingFamilia}
          parentSchedule={
            programaDataWithComentarios.find((p) => p.partida === editingFamilia.parentPartidaNombre)?.schedule ?? null
          }
          onClose={() => setEditingFamilia(null)}
        />
      )}

      {/* Comentarios Sheet */}
      {comentariosItem && proyectoId && (
        <ProgramaObraComentarios
          item={comentariosItem}
          proyectoId={proyectoId as Id<"desarrollos">}
          onClose={() => setComentariosItem(null)}
        />
      )}

    </div>
  );
}
