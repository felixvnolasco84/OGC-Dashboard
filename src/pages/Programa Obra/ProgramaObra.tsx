import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useParams } from "react-router";
import { api } from "../../../convex/_generated/api";
import { useQuery, useMutation } from "convex/react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Search, MoreHorizontal, Upload, Loader2, MessageSquare, FileDown } from "lucide-react";
import { cn } from "@/lib/utils";
import ProgramaObraGanttItem from "./ProgramaObraGanttItem";
import { Id } from "../../../convex/_generated/dataModel";
import { type ScheduleData, type ProgramaItem, parseDate } from "./programa-obra-types";
import ProgramaObraPartidaEditor from "./ProgramaObraPartidaEditor";
import ProgramaObraFamiliaEditor from "./ProgramaObraFamiliaEditor";
import ProgramaObraComentarios from "./ProgramaObraComentarios";
import ProgramaObraExcelPreview, { type ExcelPartida, type ExcelRow } from "./ProgramaObraExcelPreview";
import { exportProgramaObraPdf } from "./ProgramaObraPdfExport";

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

type TimelineMonth = { label: string; month: number; year: number; weeks: number };

/** Get month columns with week counts for a single year */
function getTimelineMonths(year: number): TimelineMonth[] {
  return MONTHS_ES.map((label, i) => {
    const daysInMonth = new Date(year, i + 1, 0).getDate();
    const weeks = Math.ceil(daysInMonth / 7);
    return { label, month: i, year, weeks };
  });
}

/** Get month columns spanning multiple years */
function getMultiYearTimelineMonths(startYear: number, endYear: number): TimelineMonth[] {
  const result: TimelineMonth[] = [];
  for (let y = startYear; y <= endYear; y++) {
    result.push(...getTimelineMonths(y));
  }
  return result;
}

const WEEK_WIDTH = 32; // px per week column
const getMonthWidth = (weeks: number) => weeks * WEEK_WIDTH;

const API_BASE_URL = "https://ogc-excel-reader.vercel.app";

/** Convert a Date object to a pixel offset within a multi-year timeline */
function dateToPx(date: Date, months: TimelineMonth[]): number {
  const dy = date.getFullYear();
  const dm = date.getMonth();
  let offset = 0;
  for (let i = 0; i < months.length; i++) {
    if (months[i].year === dy && months[i].month === dm) {
      const day = date.getDate();
      const dim = new Date(dy, dm + 1, 0).getDate();
      const frac = (day - 1) / dim;
      return offset + frac * getMonthWidth(months[i].weeks);
    }
    offset += getMonthWidth(months[i].weeks);
  }
  // Before timeline start
  if (months.length > 0 && (dy < months[0].year || (dy === months[0].year && dm < months[0].month))) return 0;
  return offset; // After timeline end
}

/** Convert a DD/MM/YYYY or YYYY-MM-DD string to a pixel offset within a multi-year timeline */
function dateStrToPixel(
  dateStr: string | undefined | null,
  months: TimelineMonth[]
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
  return dateToPx(d, months);
}

// ============================================================
// Component
// ============================================================

export default function ProgramaObra() {
  const { proyectoId } = useParams<{ proyectoId: string }>();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const leftColumnsRef = useRef<HTMLDivElement>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [editingPartida, setEditingPartida] = useState<ProgramaItem | null>(null);
  const [editingFamilia, setEditingFamilia] = useState<ProgramaItem | null>(null);
  const [comentariosItem, setComentariosItem] = useState<ProgramaItem | null>(null);
  const [exporting, setExporting] = useState(false);

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

      // Find the farthest familia effective end date that extends beyond the partida's end.
      // Must account for tiempo_extra: for new records fecha_fin is the base (add extension),
      // for old records fecha_fin already includes the extension.
      const parentEnd = parseDate(schedule?.fecha_fin);
      let maxChildEnd: Date | null = null;
      for (const fam of familiaDetalles) {
        const famEnd = parseDate(fam.fecha_fin);
        if (!famEnd || !parentEnd) continue;

        let effectiveEnd = famEnd;
        const cant = fam.tiempo_extra_cantidad ?? 0;
        const unidad = fam.tiempo_extra_unidad ?? "dias";
        if (cant > 0) {
          if (famEnd.getTime() > parentEnd.getTime()) {
            // Old record: fecha_fin already includes extension — use as-is
            effectiveEnd = famEnd;
          } else {
            // New record: fecha_fin is the base — add extension
            const ext = new Date(famEnd);
            if (unidad === "dias") ext.setDate(ext.getDate() + cant);
            else if (unidad === "semanas") ext.setDate(ext.getDate() + cant * 7);
            else if (unidad === "meses") ext.setMonth(ext.getMonth() + cant);
            effectiveEnd = ext;
          }
        }

        if (effectiveEnd > parentEnd) {
          if (!maxChildEnd || effectiveEnd > maxChildEnd) maxChildEnd = effectiveEnd;
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
  // const overallProgress = useMemo(() => {
  //   if (programaDataWithComentarios.length === 0) return 0;
  //   const totalWeight = programaDataWithComentarios.reduce((s, p) => s + (p.ponderacion || 0), 0);
  //   if (totalWeight > 0) {
  //     const weighted = programaDataWithComentarios.reduce(
  //       (s, p) => s + (p.avanceReal ?? 0) * (p.ponderacion || 0), 0
  //     ) / totalWeight;
  //     return Math.round(weighted * 100) / 100;
  //   }
  //   // Simple average if no weights
  //   return Math.round(
  //     (programaDataWithComentarios.reduce((s, p) => s + (p.avanceReal ?? 0), 0) / programaDataWithComentarios.length) * 100
  //   ) / 100;
  // }, [programaDataWithComentarios]);

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

  // Compute year range from all data dates
  const yearRange = useMemo(() => {
    const years: number[] = [];
    const extractYear = (dateStr: string | undefined | null) => {
      const d = parseDate(dateStr);
      if (d) years.push(d.getFullYear());
    };
    schedules?.forEach((s) => { extractYear(s.fecha_inicio); extractYear(s.fecha_fin); extractYear(s.anticipo_fecha); extractYear(s.suministro_fecha); });
    detalles?.forEach((d) => { extractYear(d.fecha_inicio); extractYear(d.fecha_fin); });
    comentarios?.forEach((c) => { extractYear(c.fecha_inicio); extractYear(c.fecha_fin); });
    if (years.length === 0) {
      const cy = new Date().getFullYear();
      return { startYear: cy, endYear: cy };
    }
    return { startYear: Math.min(...years), endYear: Math.max(...years) };
  }, [schedules, detalles, comentarios]);

  // Timeline months spanning the full data range
  const timelineMonths = useMemo(
    () => getMultiYearTimelineMonths(yearRange.startYear, yearRange.endYear),
    [yearRange]
  );

  // Total timeline width (sum of all month columns)
  const totalTimelineWidth = useMemo(
    () => timelineMonths.reduce((sum, m) => sum + getMonthWidth(m.weeks), 0),
    [timelineMonths]
  );

  // Today line position
  const todayPosition = useMemo(() => {
    const now = new Date();
    const cy = now.getFullYear();
    if (cy < yearRange.startYear || cy > yearRange.endYear) return null;
    return dateToPx(now, timelineMonths);
  }, [yearRange, timelineMonths]);

  // Excel upload state
  const [uploading, setUploading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [uploadResult, setUploadResult] = useState<{
    created: number;
    updated: number;
    errors: string[];
    partidas?: { created: number; updated: number; skipped: number; total: number };
    familias?: { created: number; updated: number; skipped: number; total: number };
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Preview state
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState<ExcelPartida[]>([]);

  // Step 1: Parse the Excel and open the preview dialog
  const handleExcelParse = useCallback(
    async (file: File) => {
      if (!proyectoId) return;
      setParsing(true);
      setUploadResult(null);

      try {
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

        if (data.partidas && data.partidas.length > 0) {
          setPreviewData(data.partidas as ExcelPartida[]);
          setPreviewOpen(true);
        } else {
          setUploadResult({ created: 0, updated: 0, errors: ["No se encontraron partidas en el archivo."], partidas: { created: 0, updated: 0, skipped: 0, total: 0 }, familias: { created: 0, updated: 0, skipped: 0, total: 0 } });
        }
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        setUploadResult({ created: 0, updated: 0, errors: [msg], partidas: { created: 0, updated: 0, skipped: 0, total: 0 }, familias: { created: 0, updated: 0, skipped: 0, total: 0 } });
      } finally {
        setParsing(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [proyectoId]
  );

  // Step 2: User confirmed preview — upload rows to Convex
  const handlePreviewConfirm = useCallback(
    async (rows: ExcelRow[]) => {
      if (!proyectoId) return;
      setUploading(true);

      try {
        const result = await bulkUpsertFromExcel({
          proyecto: proyectoId as Id<"desarrollos">,
          rows,
        });

        setUploadResult(result);
        setPreviewOpen(false);
        setPreviewData([]);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        setUploadResult({ created: 0, updated: 0, errors: [msg], partidas: { created: 0, updated: 0, skipped: 0, total: 0 }, familias: { created: 0, updated: 0, skipped: 0, total: 0 } });
      } finally {
        setUploading(false);
      }
    },
    [proyectoId, bulkUpsertFromExcel]
  );

  const handlePreviewCancel = useCallback(() => {
    setPreviewOpen(false);
    setPreviewData([]);
  }, []);

  // PDF Export handler
  const handleExportPdf = useCallback(async () => {
    if (!leftColumnsRef.current || !scrollContainerRef.current || !proyecto) return;
    setExporting(true);
    try {
      await exportProgramaObraPdf({
        leftColumnsEl: leftColumnsRef.current,
        timelineEl: scrollContainerRef.current,
        projectName: proyecto.nombre,
        collapseAll: () => {
          const prev = new Set(expandedIds);
          setExpandedIds(new Set());
          return prev;
        },
        restoreExpanded: (ids: Set<string>) => {
          setExpandedIds(ids);
        },
        programaData: programaDataWithComentarios,
      });
    } catch (err) {
      console.error("PDF export failed:", err);
    } finally {
      setExporting(false);
    }
  }, [proyecto, expandedIds, programaDataWithComentarios]);

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
                if (f) handleExcelParse(f);
              }}
            />
            <Button
              variant="outline"
              className="rounded-none gap-2"
              disabled={exporting}
              onClick={handleExportPdf}
            >
              {exporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileDown className="h-4 w-4" />
              )}
              {exporting ? "Exportando..." : "Exportar PDF"}
            </Button>
            <Button
              variant="outline"
              className="rounded-none gap-2"
              disabled={uploading || parsing}
              onClick={() => fileInputRef.current?.click()}
            >
              {parsing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {parsing ? "Leyendo archivo..." : "Cargar Excel"}
            </Button>
          </div>
        </div>

        {/* Upload result feedback */}
        {uploadResult && (() => {
          const hasErrors = uploadResult.errors.length > 0;
          const hasSuccess = uploadResult.created + uploadResult.updated > 0;
          const p = uploadResult.partidas;
          const f = uploadResult.familias;
          return (
            <div className={cn(
              "mt-3 rounded-none border text-sm",
              hasErrors && !hasSuccess
                ? "bg-red-50 border-red-200"
                : hasErrors
                  ? "bg-amber-50 border-amber-200"
                  : "bg-green-50 border-green-200"
            )}>
              {/* Header row */}
              <div className="flex items-center justify-between px-4 py-2.5">
                <div className="flex items-center gap-3">
                  <span className={cn("font-semibold", hasErrors && !hasSuccess ? "text-red-700" : hasErrors ? "text-amber-700" : "text-green-700")}>
                    {hasErrors && !hasSuccess ? "Error en la carga" : hasSuccess ? "Carga completada" : "Sin cambios"}
                  </span>
                  {hasSuccess && (
                    <span className="text-gray-600">
                      {uploadResult.created + uploadResult.updated} registro{uploadResult.created + uploadResult.updated !== 1 ? "s" : ""} procesado{uploadResult.created + uploadResult.updated !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                <button
                  className="text-xs text-gray-400 hover:text-gray-600 underline"
                  onClick={() => setUploadResult(null)}
                >
                  Cerrar
                </button>
              </div>

              {/* Detail breakdown */}
              {(p || f) && (
                <div className="border-t border-inherit px-4 py-2 flex gap-6 text-xs text-gray-600">
                  {p && (
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-gray-700">Partidas</span>
                      <span className="text-gray-400">({p.total} en archivo)</span>
                      {p.created > 0 && <span className="bg-green-100 text-green-700 px-1.5 py-0.5">{p.created} nueva{p.created !== 1 ? "s" : ""}</span>}
                      {p.updated > 0 && <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5">{p.updated} actualizada{p.updated !== 1 ? "s" : ""}</span>}
                      {p.skipped > 0 && <span className="bg-red-100 text-red-700 px-1.5 py-0.5">{p.skipped} omitida{p.skipped !== 1 ? "s" : ""}</span>}
                    </div>
                  )}
                  {f && (
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-gray-700">Familias</span>
                      <span className="text-gray-400">({f.total} en archivo)</span>
                      {f.created > 0 && <span className="bg-green-100 text-green-700 px-1.5 py-0.5">{f.created} nueva{f.created !== 1 ? "s" : ""}</span>}
                      {f.updated > 0 && <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5">{f.updated} actualizada{f.updated !== 1 ? "s" : ""}</span>}
                      {f.skipped > 0 && <span className="bg-red-100 text-red-700 px-1.5 py-0.5">{f.skipped} omitida{f.skipped !== 1 ? "s" : ""}</span>}
                    </div>
                  )}
                </div>
              )}

              {/* Errors section */}
              {hasErrors && (
                <div className="border-t border-inherit px-4 py-2">
                  <details className="text-xs">
                    <summary className="cursor-pointer font-medium text-red-700 select-none">
                      {uploadResult.errors.length} error{uploadResult.errors.length !== 1 ? "es" : ""}
                    </summary>
                    <ul className="mt-1.5 space-y-0.5 text-red-600 max-h-[120px] overflow-y-auto">
                      {uploadResult.errors.map((err, i) => (
                        <li key={i} className="flex gap-1">
                          <span className="text-red-400 shrink-0">•</span>
                          <span>{err}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                </div>
              )}
            </div>
          );
        })()}
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
        {/* <div className="flex"> */}
          {/* Spacer matching fixed left columns (w-72 + w-28 = 400px) */}
          {/* <div className="shrink-0 w-[400px]" />/ */}
          {/* Progress bar fills only the remaining visible viewport width */}
          {/* <div className="flex-1 min-w-0 overflow-hidden"> */}
            {/* <div className="h-2 bg-gray-100"> */}
              {/* <div */}
                {/* className="h-full bg-green-500 rounded-none transition-all duration-500" */}
                {/* style={{ width: `${Math.min(overallProgress, 100)}%` }} */}
              {/* /> */}
            {/* </div> */}
          {/* </div> */}
        {/* </div> */}


        {/* Gantt Chart */}
        <div className="overflow-hidden bg-white">
          <div className="flex">
            {/* Fixed left columns */}
            <div className="shrink-0" ref={leftColumnsRef}>
              {/* Header — mt-[8px] accounts for year label that overflows above the border */}
              <div className="flex border-b border-t border-[#d2d1ce] bg-white sticky top-0 z-20 mt-[8px]">
                <div className="w-72 border-r border-[#d2d1ce] px-4 h-[36px] flex items-center text-left">
                  <span className="text-xs font-medium text-[#777770] uppercase tracking-wider">
                    Partida · Familia
                  </span>
                </div>
                <div className="w-28 border-r border-[#d2d1ce] px-3 h-[36px] flex items-center justify-end text-right">
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
                              {item.ponderacion != null ? `${(item.ponderacion).toFixed(2)}%` : "—"}
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
              {/* Year + Month headers */}
              <div className="sticky top-0 z-10 min-w-max bg-white">
                {/* Year labels + Month headers — relative wrapper for absolute year labels */}
                <div className="relative pt-[8px]">
                  {/* Year labels — absolutely positioned to straddle the border-t */}
                  <div className="absolute top-[8px] left-0 right-0 flex -translate-y-1/2 z-20 pointer-events-none">
                    {Array.from({ length: yearRange.endYear - yearRange.startYear + 1 }).map((_, yi) => {
                      const y = yearRange.startYear + yi;
                      const yearMonths = timelineMonths.filter((m) => m.year === y);
                      const yearWidth = yearMonths.reduce((s, m) => s + getMonthWidth(m.weeks), 0);
                      return (
                        <div
                          key={y}
                          className="text-left pl-2 shrink-0"
                          style={{ width: yearWidth }}
                        >
                          <span className="text-xs font-medium text-[#777770] leading-none bg-white px-1">{y}</span>
                        </div>
                      );
                    })}
                  </div>
                  {/* Month labels + week sub-headers row */}
                  <div className="flex border-t border-b border-[#d2d1ce]">
                  {timelineMonths.map((m, i) => {
                    const mw = getMonthWidth(m.weeks);
                    return (
                      <div key={i} className="border-r border-[#d2d1ce] shrink-0 h-[36px]" style={{ width: mw }}>
                        <div className="text-center py-1 text-[11px] font-medium text-[#777770] tracking-wider">
                          {m.label}
                        </div>
                        <div className="flex">
                          {Array.from({ length: m.weeks }).map((_, wi) => (
                            <div
                              key={wi}
                              className={cn(
                                "text-center text-[8px] text-gray-300 py-0.5",
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
                </div>
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
                  style={{ minWidth: totalTimelineWidth }}
                >
                  {/* Parent-range gray background for child items */}
                  {item.level === 1 && item.schedule && (() => {
                    const pStart = dateStrToPixel(item.schedule.fecha_inicio, timelineMonths);
                    const pEnd = dateStrToPixel(item.schedule.fecha_fin, timelineMonths);
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
                    columnWidth={WEEK_WIDTH}
                    timelineMonths={timelineMonths}
                    forceShowMilestones={exporting}
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

      {/* Excel Preview Dialog */}
      {previewOpen && (
        <ProgramaObraExcelPreview
          open={previewOpen}
          parsedData={previewData}
          onConfirm={handlePreviewConfirm}
          onCancel={handlePreviewCancel}
          uploading={uploading}
        />
      )}

    </div>
  );
}
