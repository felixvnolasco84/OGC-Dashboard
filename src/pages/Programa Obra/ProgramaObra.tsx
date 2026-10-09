import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { flushSync } from "react-dom";
import { useParams } from "react-router";
import { api } from "../../../convex/_generated/api";
import { useQuery, useMutation } from "convex/react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Bell,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Crosshair,
  FileDown,
  Focus,
  History,
  Loader2,
  MessageSquare,
  Minimize2,
  MoreHorizontal,
  Percent,
  Search,
  Upload,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import ProgramaObraGanttItem from "./ProgramaObraGanttItem";
import { Id } from "../../../convex/_generated/dataModel";
import {
  type AvanceHistorialData,
  type ScheduleData,
  type ProgramaItem,
  type ProgramaMilestoneSummary,
  parseDate,
} from "./programa-obra-types";
import ProgramaObraMobileList from "./ProgramaObraMobileList";
import { countDelayedProgramaItems, isProgramaItemDelayed } from "./programa-obra-status";
import ProgramaObraPartidaEditor from "./ProgramaObraPartidaEditor";
import ProgramaObraFamiliaEditor from "./ProgramaObraFamiliaEditor";
import ProgramaObraComentarios from "./ProgramaObraComentarios";
import ProgramaObraAvanceHistorial from "./ProgramaObraAvanceHistorial";
import ProgramaObraExcelPreview, { type ExcelPartida, type ExcelRow } from "./ProgramaObraExcelPreview";
import { exportProgramaObraPdf } from "./ProgramaObraPdfExport";
import ProgramaObraExportDialog, { type ProgramaObraExportSelection } from "./ProgramaObraExportDialog";
import { selectGanttExportRows } from "./programa-obra-pdf-layout";
import {
  ProgramaObraAlertsPanel,
  ProgramaObraMilestoneDetail,
} from "./ProgramaObraMilestones";
import { useSidebar } from "@/components/ui/Sidebar";
import { toast } from "sonner";
import ProgramaObraExecution from "./ProgramaObraExecution";
import ProgramaObraProgressEditor from "./ProgramaObraProgressEditor";
import { getRecordedProgressTiming } from "@/lib/programa-obra-progress";
import ProgramaObraImportReview from "./ProgramaObraImportReview";
import { aggregateProgramProgress, programToday } from "@/lib/programa-obra-rules";

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

/** Get month columns spanning multiple years, trimmed to actual data range */
function getMultiYearTimelineMonths(startYear: number, endYear: number, startMonth = 0, endMonth = 11): TimelineMonth[] {
  const result: TimelineMonth[] = [];
  for (let y = startYear; y <= endYear; y++) {
    const mStart = y === startYear ? startMonth : 0;
    const mEnd = y === endYear ? endMonth : 11;
    for (let m = mStart; m <= mEnd; m++) {
      const daysInMonth = new Date(y, m + 1, 0).getDate();
      const weeks = Math.ceil(daysInMonth / 7);
      result.push({ label: MONTHS_ES[m], month: m, year: y, weeks });
    }
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
  const { open: sidebarOpen, setOpen: setSidebarOpen, isMobile } = useSidebar();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const leftColumnsRef = useRef<HTMLDivElement>(null);
  const ganttContainerRef = useRef<HTMLDivElement>(null);
  const leftScrollRef = useRef<HTMLDivElement>(null);
  const isSyncingScroll = useRef(false);
  const hasAutoCenteredRef = useRef(false);
  const sidebarBeforeFocusRef = useRef<boolean | null>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [selectedMilestone, setSelectedMilestone] = useState<ProgramaMilestoneSummary | null>(null);
  const [focusMode, setFocusMode] = useState(false);
  const [editingPartida, setEditingPartida] = useState<ProgramaItem | null>(null);
  const [editingFamilia, setEditingFamilia] = useState<ProgramaItem | null>(null);
  const [comentariosItem, setComentariosItem] = useState<ProgramaItem | null>(null);
  const [historialItem, setHistorialItem] = useState<ProgramaItem | null>(null);
  const [ponderacionItem, setPonderacionItem] = useState<ProgramaItem | null>(null);
  const [savingPonderacion, setSavingPonderacion] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [activeExport, setActiveExport] = useState<ProgramaObraExportSelection | null>(null);
  const exportInProgressRef = useRef(false);
  const exporting = activeExport !== null;
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [executionView, setExecutionView] = useState(false);
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(null);
  const [importRows, setImportRows] = useState<ExcelRow[] | null>(null);
  const execution = useQuery(api.programa_obra.getExecutionProgram, proyectoId ? { proyecto: proyectoId as Id<"desarrollos">, refresh_day: programToday(currentTime) } : "skip");
  const openExecution = useCallback((item?: ProgramaItem) => {
    const leaves = execution?.activities.filter((a) => a.detalle_id === item?.detalleSchedule?._id) ?? [];
    setSelectedExecutionId(leaves.length === 1 ? leaves[0]._id : null);
    setExecutionView(true);
  }, [execution]);

  // Refresh time-based delay bars while the page remains open.
  useEffect(() => {
    const intervalId = window.setInterval(() => setCurrentTime(Date.now()), 60 * 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  const currentUser = useQuery(api.users.getCurrentUser);
  const canEditPesos = currentUser?.role === "admin" || !!execution?.capabilities.plan;
  const canEditActivities = Boolean(execution?.capabilities.write);

  const toggleFocusMode = useCallback(() => {
    setFocusMode((enabled) => {
      if (!enabled) {
        sidebarBeforeFocusRef.current = sidebarOpen;
        if (!isMobile) setSidebarOpen(false);
        return true;
      }
      if (!isMobile && sidebarBeforeFocusRef.current != null) {
        setSidebarOpen(sidebarBeforeFocusRef.current);
      }
      sidebarBeforeFocusRef.current = null;
      return false;
    });
  }, [isMobile, setSidebarOpen, sidebarOpen]);

  useEffect(() => () => {
    if (!isMobile && sidebarBeforeFocusRef.current != null) {
      setSidebarOpen(sidebarBeforeFocusRef.current);
    }
  }, [isMobile, setSidebarOpen]);

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

  const avanceHistorial = useQuery(
    api.programa_obra.getAvanceHistorialByProyecto,
    proyectoId ? { proyecto_id: proyectoId as Id<"desarrollos"> } : "skip"
  );

  const milestoneDashboard = useQuery(
    api.programa_obra.getMilestoneDashboard,
    proyectoId ? { proyecto_id: proyectoId as Id<"desarrollos"> } : "skip"
  );

  // Mutations
  const bulkUpsertFromExcel = useMutation(api.programa_obra.bulkUpsertFromExcel);
  const updateSchedulePeso = useMutation(api.programa_obra.updateSchedulePeso);
  const updateDetallePeso = useMutation(api.programa_obra.updateDetallePeso);

  const [progressItem, setProgressItem] = useState<ProgramaItem | null>(null);

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

  const avanceHistorialMap = useMemo(() => {
    const map = new Map<string, AvanceHistorialData[]>();
    avanceHistorial?.forEach((entry) => {
      const entries = map.get(entry.detalle_id) ?? [];
      entries.push(entry);
      map.set(entry.detalle_id, entries);
    });
    return map;
  }, [avanceHistorial]);

  const detallesByPartida = useMemo(() => {
    const map = new Map<string, NonNullable<typeof detalles>>();
    detalles?.forEach((detalle) => {
      const group = map.get(detalle.programa_obra_id) ?? [];
      group.push(detalle);
      map.set(detalle.programa_obra_id, group);
    });
    return map;
  }, [detalles]);

  const comentariosByParent = useMemo(() => {
    const map = new Map<string, NonNullable<typeof comentarios>>();
    comentarios?.forEach((comentario) => {
      const key = `${comentario.parent_type}:${comentario.parent_id}`;
      const group = map.get(key) ?? [];
      group.push(comentario);
      map.set(key, group);
    });
    return map;
  }, [comentarios]);

  const milestonesBySchedule = useMemo(() => {
    const map = new Map<string, ProgramaMilestoneSummary[]>();
    milestoneDashboard?.forEach((milestone) => {
      const group = map.get(milestone.scheduleId) ?? [];
      group.push(milestone as ProgramaMilestoneSummary);
      map.set(milestone.scheduleId, group);
    });
    return map;
  }, [milestoneDashboard]);

  // ============================================================
  // Build hierarchical tree: nivel 1 partidas + detalle children
  // ============================================================
  const programaData = useMemo(() => {
    if (!nivel1Partidas) return [];

    // Only include partidas that have uploaded Excel data (orden is set), sorted by Excel order
    const matched = nivel1Partidas
      .filter((p) => {
        const s = scheduleMap.get(p._id);
        return s != null && !s.archived && (s.orden != null || execution?.summaries.schedules.some((row) => row.id === s._id));
      })
      .sort((a, b) => {
        const oa = scheduleMap.get(a._id)!.orden!;
        const ob = scheduleMap.get(b._id)!.orden!;
        return oa - ob;
      });

    return matched.map((p1) => {
      const schedule = scheduleMap.get(p1._id) || null;

      // Get nivel 2 detalles for this partida (familia items only, with orden set from Excel), sorted by Excel order
      const familiaDetalles = (detallesByPartida.get(schedule?._id ?? "")?.filter((d) => d.nivel === 2 && !d.archived && (d.orden != null || execution?.activities.some((a) => a.detalle_id === d._id))) || [])
        .sort((a, b) => (a.orden ?? Infinity) - (b.orden ?? Infinity));

      // Build familia (level 1) items from nivel 2 detalles
      const familiaItems: ProgramaItem[] = familiaDetalles.map((fam) => {
        const summary = execution?.summaries.details.find((d) => d.id === fam._id);
        const leaves = execution?.activities.filter((a) => a.detalle_id === fam._id) ?? [];
        const avanceReal = summary?.progress ?? fam.avance_porcentaje ?? 0;
        const started = leaves.filter((a) => a.progress > 0 || a.actual_start);
        const timing = leaves.length ? {
          hasReportedProgress: started.length > 0,
          progressStartKnown: started.every((a) => !!a.actual_start),
          progressStartedAt: started.length && started.every((a) => !!a.actual_start) ? Math.min(...started.map((a) => parseDate(a.actual_start)!.getTime())) : undefined,
          completionKnown: leaves.every((a) => a.progress === 100 && !!a.actual_finish),
          completedAt: leaves.every((a) => a.progress === 100 && !!a.actual_finish) ? Math.max(...leaves.map((a) => parseDate(a.actual_finish)!.getTime())) : undefined,
        } : getRecordedProgressTiming(avanceReal, fam, avanceHistorialMap.get(fam._id) ?? []);
        return {
          id: `fam-${fam._id}`,
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
          avanceReal,
          isComplete: summary?.released ?? avanceReal >= 100,
          executionManaged: leaves.length > 0,
          ...timing,
          children: [],
        } as ProgramaItem;
      });

      // Financiero = pagado/presupuesto for nivel 1
      const financiero =
        p1.presupuesto_aprobado > 0
          ? Math.round((p1.pagado / p1.presupuesto_aprobado) * 100)
          : 0;

      // Compute partida-level avance as weighted average of familias
      const partidaSummary = execution?.summaries.schedules.find((row) => row.id === schedule?._id) ?? aggregateProgramProgress(familiaItems.map((c) => ({ progress: c.avanceReal ?? 0, weight: c.ponderacion, released: c.isComplete })));
      const partidaAvance = partidaSummary.progress;

      // A parent activity starts with the first positive child progress entry.
      // Its completion is the last relevant child to reach 100%.
      const startedFamilias = familiaItems.filter((item) => item.hasReportedProgress);
      const hasReportedProgress = startedFamilias.length > 0;
      const progressStartKnown =
        !hasReportedProgress ||
        startedFamilias.every((item) => item.progressStartKnown && item.progressStartedAt != null);
      const progressStartedAt = progressStartKnown && hasReportedProgress
        ? Math.min(...startedFamilias.map((item) => item.progressStartedAt!))
        : undefined;

      const relevantFamilias = familiaItems;
      const isPartidaComplete = partidaSummary.released;
      const completionKnown =
        !isPartidaComplete ||
        relevantFamilias.every(
          (item) =>
            (item.avanceReal ?? 0) >= 100 &&
            item.completionKnown &&
            item.completedAt != null
        );
      const completedAt = relevantFamilias.length > 0 && relevantFamilias.every((item) => (item.avanceReal ?? 0) >= 100 && item.completionKnown && item.completedAt != null)
        ? Math.max(...relevantFamilias.map((item) => item.completedAt!))
        : undefined;

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
        isComplete: isPartidaComplete,
        financiero,
        hasReportedProgress,
        progressStartedAt,
        progressStartKnown,
        completedAt,
        completionKnown,
        maxChildEndDate,
        milestones: schedule ? milestonesBySchedule.get(schedule._id) ?? [] : [],
        children: familiaItems,
      } as ProgramaItem;
    });
  }, [nivel1Partidas, scheduleMap, detallesByPartida, avanceHistorialMap, milestonesBySchedule, execution]);

  // Attach comentarios to items
  const programaDataWithComentarios = useMemo(() => {
    if (!comentarios || comentarios.length === 0) return programaData;
    return programaData.map((item) => {
      const itemComentarios = comentariosByParent.get(`partida:${item.schedule?._id ?? ""}`) ?? [];
      const childrenWithComentarios = item.children.map((child) => {
        const childComentarios = comentariosByParent.get(`familia:${child.detalleSchedule?._id ?? ""}`) ?? [];
        return { ...child, comentarios: childComentarios };
      });
      return { ...item, comentarios: itemComentarios, children: childrenWithComentarios };
    });
  }, [programaData, comentarios, comentariosByParent]);

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

  const openPonderacionEditor = useCallback((item: ProgramaItem) => {
    if (!canEditPesos) return;
    const value = String(item.ponderacion ?? "");
    editingPesoItemRef.current = item;
    editingPesoValueRef.current = value;
    setEditingPesoValue(value);
    setPonderacionItem(item);
  }, [canEditPesos]);

  const closePonderacionEditor = useCallback(() => {
    editingPesoItemRef.current = null;
    editingPesoValueRef.current = "";
    setEditingPesoValue("");
    setEditingPesoId(null);
    setPonderacionItem(null);
    setSavingPonderacion(false);
  }, []);

  const overallProgress = useMemo(() => execution?.summaries.overall.progress ?? aggregateProgramProgress(programaDataWithComentarios.map((item) => ({ progress: item.avanceReal ?? 0, weight: item.ponderacion }))).progress, [execution, programaDataWithComentarios]);

  const delayedCount = useMemo(
    () => countDelayedProgramaItems(programaDataWithComentarios, currentTime),
    [currentTime, programaDataWithComentarios],
  );

  const actionableMilestones = useMemo(
    () => (milestoneDashboard ?? []).filter((milestone) => milestone.actionable) as ProgramaMilestoneSummary[],
    [milestoneDashboard],
  );
  const upcomingMilestones = actionableMilestones.filter((milestone) => milestone.status === "upcoming").length;

  // Save peso for a level 0 or level 1 item
  const handleSavePeso = useCallback(
    async () => {
      const item = editingPesoItemRef.current;
      const rawValue = editingPesoValueRef.current;
      const value = parseFloat(rawValue);
      if (isNaN(value) || value < 0 || value > 100) {
        toast.error("La ponderación debe estar entre 0 y 100.");
        return;
      }
      setSavingPonderacion(true);
      try {
        if (item?.level === 0 && item.schedule?._id) {
          await updateSchedulePeso({ schedule_id: item.schedule._id, peso: value });
        } else if (item?.level === 1 && item.detalleSchedule?._id) {
          await updateDetallePeso({ detalle_id: item.detalleSchedule._id, peso: value });
        }
        toast.success("Ponderación actualizada");
        closePonderacionEditor();
      } catch (err) {
        toast.error("No se pudo guardar la ponderación", {
          description: err instanceof Error ? err.message : undefined,
        });
        setSavingPonderacion(false);
      }
    },
    [closePonderacionEditor, updateSchedulePeso, updateDetallePeso]
  );

  const filteredData = useMemo(() => {
    const result: ProgramaItem[] = [];
    const normalizedSearch = searchTerm.trim().toLocaleLowerCase("es-MX");
    const filtersActive = normalizedSearch.length > 0 || statusFilter !== "all";
    const matchesSearch = (item: ProgramaItem) =>
      !normalizedSearch || item.partida.toLocaleLowerCase("es-MX").includes(normalizedSearch);
    const matchesStatus = (item: ProgramaItem) => {
      if (statusFilter === "all") return true;
      if (statusFilter === "delayed") return isProgramaItemDelayed(item, currentTime);
      if (statusFilter === "milestones") return item.level === 0 && Boolean(item.milestones?.some((milestone) => milestone.actionable));
      if (statusFilter === "in_progress") return (item.avanceReal ?? 0) > 0 && (item.avanceReal ?? 0) < 100;
      if (statusFilter === "completed") return item.isComplete ?? (item.avanceReal ?? 0) >= 100;
      return true;
    };

    for (const parent of programaDataWithComentarios) {
      const parentSearchMatch = matchesSearch(parent);
      const parentStatusMatch = matchesStatus(parent);
      const matchingChildren = parent.children.filter((child) => matchesSearch(child) && matchesStatus(child));
      const parentMatches = parentSearchMatch && parentStatusMatch;
      if (!parentMatches && matchingChildren.length === 0) continue;

      result.push(parent);
      const shouldShowChildren = expandedIds.has(parent.id) || filtersActive;
      if (!shouldShowChildren) continue;

      if (filtersActive) {
        const childrenToShow = parentMatches && parentSearchMatch
          ? parent.children.filter(matchesStatus)
          : matchingChildren;
        result.push(...childrenToShow);
      } else {
        result.push(...parent.children);
      }
    }
    return result;
  }, [currentTime, expandedIds, programaDataWithComentarios, searchTerm, statusFilter]);

  // Export selection is independent of screen expansion and filters.
  const ganttData = useMemo(
    () => activeExport ? selectGanttExportRows(programaDataWithComentarios, activeExport.breakdownIds) : filteredData,
    [activeExport, filteredData, programaDataWithComentarios],
  );

  // Compute date range (year + month) from all data dates
  const yearRange = useMemo(() => {
    const dates: Date[] = [];
    const extractDate = (dateStr: string | undefined | null) => {
      const d = parseDate(dateStr);
      if (d) dates.push(d);
    };
    schedules?.forEach((s) => {
      extractDate(s.fecha_inicio);
      extractDate(s.fecha_fin);
      extractDate(s.anticipo_fecha);
      extractDate(s.suministro_fecha);
      extractDate(s.finiquito_fecha);
    });
    detalles?.forEach((d) => { extractDate(d.fecha_inicio); extractDate(d.fecha_fin); });
    comentarios?.forEach((c) => { extractDate(c.fecha_inicio); extractDate(c.fecha_fin); });
    const now = new Date(currentTime);
    const collectDelayDates = (items: ProgramaItem[]) => {
      items.forEach((item) => {
        if (item.progressStartedAt != null) dates.push(new Date(item.progressStartedAt));
        if (item.completedAt != null) dates.push(new Date(item.completedAt));
        extractDate(item.maxChildEndDate);

        const effectiveSchedule = item.level === 1 && item.detalleSchedule
          ? item.detalleSchedule
          : item.schedule;
        const plannedEnd = parseDate(effectiveSchedule?.fecha_fin);
        const isComplete = item.isComplete ?? (item.avanceReal ?? 0) >= 100;
        if (plannedEnd && !isComplete && now > plannedEnd) {
          dates.push(now);
        }
        collectDelayDates(item.children);
      });
    };
    collectDelayDates(programaDataWithComentarios);
    if (dates.length === 0) {
      const cy = now.getFullYear();
      return { startYear: cy, endYear: cy, startMonth: 0, endMonth: 11 };
    }
    let minDate = dates[0];
    let maxDate = dates[0];
    for (const d of dates) {
      if (d < minDate) minDate = d;
      if (d > maxDate) maxDate = d;
    }
    return {
      startYear: minDate.getFullYear(),
      endYear: maxDate.getFullYear(),
      startMonth: minDate.getMonth(),
      endMonth: maxDate.getMonth(),
    };
  }, [schedules, detalles, comentarios, programaDataWithComentarios, currentTime]);

  // Timeline months spanning the full data range
  const timelineMonths = useMemo(
    () => getMultiYearTimelineMonths(yearRange.startYear, yearRange.endYear, yearRange.startMonth, yearRange.endMonth),
    [yearRange]
  );

  // Total timeline width (sum of all month columns)
  const totalTimelineWidth = useMemo(
    () => timelineMonths.reduce((sum, m) => sum + getMonthWidth(m.weeks), 0),
    [timelineMonths]
  );

  // Today line position
  const todayPosition = useMemo(() => {
    const now = new Date(currentTime);
    const cy = now.getFullYear();
    const cm = now.getMonth();
    if (cy < yearRange.startYear || cy > yearRange.endYear) return null;
    if (cy === yearRange.startYear && cm < yearRange.startMonth) return null;
    if (cy === yearRange.endYear && cm > yearRange.endMonth) return null;
    return dateToPx(now, timelineMonths);
  }, [yearRange, timelineMonths, currentTime]);

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
        toast.error("No se pudo aplicar el Excel", { description: msg });
        setUploadResult({ created: 0, updated: 0, errors: [msg], partidas: { created: 0, updated: 0, skipped: 0, total: 0 }, familias: { created: 0, updated: 0, skipped: 0, total: 0 } });
      } finally {
        setParsing(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [proyectoId]
  );

  // Step 2: User confirmed preview — upload rows to Convex
  const handlePreviewConfirm = useCallback(async (rows: ExcelRow[]) => { setImportRows(rows); setPreviewOpen(false); }, []);
  const handleImportApply = useCallback(
    async (rows: ExcelRow[], fingerprint: string) => {
      if (!proyectoId) return;
      setUploading(true);

      try {
        const result = await bulkUpsertFromExcel({
          proyecto: proyectoId as Id<"desarrollos">,
          rows,
          expected_fingerprint: fingerprint,
        });

        setUploadResult(result);
        setPreviewOpen(false);
        setPreviewData([]);
        setImportRows(null);
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
  const handleExportPdf = useCallback(async (selection: ProgramaObraExportSelection) => {
    if (exportInProgressRef.current || !proyecto || programaDataWithComentarios.length === 0) return;
    exportInProgressRef.current = true;
    const scrollPositions = [leftScrollRef.current, ganttContainerRef.current].flatMap((el) =>
      el ? [{ el, top: el.scrollTop, left: el.scrollLeft }] : [],
    );
    try {
      flushSync(() => {
        setExportDialogOpen(false);
        setActiveExport(selection);
      });
      if (!leftColumnsRef.current || !scrollContainerRef.current) throw new Error("No se pudo preparar el programa para exportar.");
      await exportProgramaObraPdf({
        leftColumnsEl: leftColumnsRef.current,
        timelineEl: scrollContainerRef.current,
        projectName: proyecto.nombre,
        programaData: programaDataWithComentarios,
        includeNotices: selection.includeNotices,
      });
    } catch (err) {
      console.error("PDF export failed:", err);
      toast.error("No se pudo exportar el programa", { description: err instanceof Error ? err.message : undefined });
    } finally {
      flushSync(() => setActiveExport(null));
      scrollPositions.forEach(({ el, top, left }) => {
        el.scrollTop = top;
        el.scrollLeft = left;
      });
      exportInProgressRef.current = false;
    }
  }, [proyecto, programaDataWithComentarios]);

  // Synchronized vertical scroll between left columns and timeline
  const handleLeftScroll = useCallback(() => {
    if (isSyncingScroll.current) return;
    isSyncingScroll.current = true;
    if (leftScrollRef.current && ganttContainerRef.current) {
      ganttContainerRef.current.scrollTop = leftScrollRef.current.scrollTop;
    }
    isSyncingScroll.current = false;
  }, []);

  const handleRightScroll = useCallback(() => {
    if (isSyncingScroll.current) return;
    isSyncingScroll.current = true;
    if (leftScrollRef.current && ganttContainerRef.current) {
      leftScrollRef.current.scrollTop = ganttContainerRef.current.scrollTop;
    }
    isSyncingScroll.current = false;
  }, []);

  const scrollToToday = useCallback(() => {
    if (todayPosition == null || !ganttContainerRef.current) return;
    const offset = todayPosition - ganttContainerRef.current.clientWidth / 2;
    ganttContainerRef.current.scrollTo({ left: Math.max(0, offset), behavior: "smooth" });
  }, [todayPosition]);

  // Center once after the timeline first becomes available. Hourly updates do
  // not steal the user's horizontal scroll position.
  useEffect(() => {
    if (!hasAutoCenteredRef.current && todayPosition != null && ganttContainerRef.current) {
      const offset = todayPosition - ganttContainerRef.current.clientWidth / 2;
      ganttContainerRef.current.scrollLeft = Math.max(0, offset);
      hasAutoCenteredRef.current = true;
    }
  }, [todayPosition]);

  const renderItemActions = (item: ProgramaItem) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="flex h-11 w-11 shrink-0 items-center justify-center hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-[850px]:h-8 min-[850px]:w-8" aria-label={`Opciones de ${item.partida}`}>
          <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem className="min-h-11 min-[850px]:min-h-8" onSelect={() => execution?.activities.some((a) => a.detalle_id === item.detalleSchedule?._id) ? openExecution(item) : item.level === 0 ? setEditingPartida(item) : setEditingFamilia(item)}>
          <CalendarDays className="h-4 w-4" /> Editar programa
        </DropdownMenuItem>
        {canEditPesos && <DropdownMenuItem className="min-h-11 min-[850px]:min-h-8" onSelect={() => openPonderacionEditor(item)}>
          <Percent className="h-4 w-4" /> Ponderación
          <span className="ml-auto text-xs text-muted-foreground">{item.ponderacion != null ? `${item.ponderacion.toFixed(2)}%` : "Sin definir"}</span>
        </DropdownMenuItem>}
        {item.level === 1 && canEditActivities && <DropdownMenuItem disabled={!execution} onSelect={() => setProgressItem(item)}><Percent className="h-4 w-4" /> Registrar avance</DropdownMenuItem>}
        {item.level === 1 && <DropdownMenuItem className="min-h-11 min-[850px]:min-h-8" onSelect={() => setHistorialItem(item)}>
          <History className="h-4 w-4" /> Historial avance
        </DropdownMenuItem>}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="min-h-11 min-[850px]:min-h-8" onSelect={() => setComentariosItem(item)}>
          <MessageSquare className="h-4 w-4" /> Comentarios
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  // Loading state
  if (
    proyecto === undefined ||
    nivel1Partidas === undefined ||
    schedules === undefined ||
    detalles === undefined ||
    comentarios === undefined ||
    avanceHistorial === undefined ||
    milestoneDashboard === undefined
  ) {
    return (
      <div className="min-h-[calc(100dvh-2.5rem)] bg-card px-4 py-8 sm:px-8 lg:px-12" aria-busy="true">
        <div className="space-y-5">
          <Skeleton className="h-16 w-full max-w-md rounded-none" />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-20 rounded-none" />)}
          </div>
          <Skeleton className="h-[480px] w-full rounded-none" />
        </div>
      </div>
    );
  }

  if (!proyecto) {
    return <div className="p-12 text-sm text-muted-foreground">No se encontró el proyecto.</div>;
  }

  if (executionView && execution && proyectoId) return <div className="bg-card"><h1 className="px-4 pt-5 text-lg sm:px-6">Programa de obra · {proyecto.nombre}</h1><ProgramaObraExecution model={execution} proyecto={proyectoId as Id<"desarrollos">} selectedId={selectedExecutionId} onSelect={setSelectedExecutionId} onClose={() => { setExecutionView(false); setSelectedExecutionId(null); }} /></div>;

  return (
    <div className={cn(
      "flex flex-col bg-card min-[850px]:h-[calc(100dvh-2.5rem)] min-[850px]:min-h-[calc(100svh-2.5rem)]",
      focusMode && "fixed inset-0 z-40 min-h-0 overflow-auto min-[850px]:h-dvh min-[850px]:min-h-0",
    )}>
      {/* Header */}
      <div className="shrink-0 border-b border-border px-4 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 py-2.5">
          <div className="flex min-w-0 flex-1 basis-[220px] flex-wrap items-baseline gap-x-2 text-left">
            <p className="shrink-0 text-xs text-muted-foreground">Programa de Obra</p>
            <h1 className="min-w-0 truncate text-lg font-medium text-foreground" title={proyecto.nombre}>{proyecto.nombre}</h1>
          </div>
          {programaDataWithComentarios.length > 0 && (
            <div className="order-3 flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-xs lg:order-none lg:w-auto" aria-label="Resumen del programa">
              <div className="flex min-h-8 items-center gap-1.5 whitespace-nowrap">
                <span className="text-muted-foreground">Avance físico</span>
                <strong className="text-sm font-semibold text-foreground">{overallProgress.toFixed(1)}%</strong>{execution?.summaries.overall.provisional && <span>· Provisional</span>}
              </div>
              <button
                type="button"
                data-viewer-readonly-allow="true"
                aria-pressed={statusFilter === "delayed"}
                aria-label={`Filtrar ${delayedCount} partidas y familias con retraso`}
                onClick={() => setStatusFilter(statusFilter === "delayed" ? "all" : "delayed")}
                className={cn("flex min-h-8 items-center gap-1.5 whitespace-nowrap px-1.5 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", statusFilter === "delayed" && "bg-muted ring-1 ring-inset ring-border")}
              >
                <span className="text-muted-foreground">Retrasadas</span>
                <strong className={cn("text-sm font-semibold", delayedCount > 0 ? "text-red-700" : "text-foreground")}>{delayedCount}</strong>
              </button>
              <button
                type="button"
                data-viewer-readonly-allow="true"
                onClick={() => setAlertsOpen(true)}
                aria-label={`Ver alertas: ${actionableMilestones.length} pendientes, ${upcomingMilestones} hitos próximos`}
                className="flex min-h-8 items-center gap-1.5 whitespace-nowrap px-1.5 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Bell className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                <span className="text-muted-foreground">Alertas</span>
                <strong className={cn("text-sm font-semibold", actionableMilestones.length > 0 ? "text-amber-800" : "text-foreground")}>{actionableMilestones.length}</strong>
                {upcomingMilestones > 0 && <span className="text-muted-foreground">· {upcomingMilestones} próximas</span>}
              </button>
            </div>
          )}
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <Button size="sm" variant="outline" data-viewer-readonly-allow="true" disabled={!execution} onClick={() => openExecution()}>Actividades por frente</Button>
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
            {focusMode && (
              <Button variant="outline" size="sm" className="rounded-none gap-2" onClick={toggleFocusMode} data-viewer-readonly-allow="true">
                <Minimize2 className="h-4 w-4" /> Salir de enfoque
              </Button>
            )}
            {programaDataWithComentarios.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="rounded-none gap-2" data-viewer-readonly-allow="true" disabled={exporting || parsing || uploading}>
                    {(exporting || parsing || uploading) && <Loader2 className="h-4 w-4 animate-spin" />}
                    {exporting ? "Exportando..." : parsing ? "Leyendo archivo..." : uploading ? "Cargando..." : "Archivo"}
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem onSelect={() => setExportDialogOpen(true)} disabled={exporting || parsing || uploading} data-viewer-readonly-allow="true">
                    <FileDown className="h-4 w-4" /> Exportar PDF
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => fileInputRef.current?.click()} disabled={exporting || parsing || uploading || !currentUser || currentUser.role === "viewer"}>
                    <Upload className="h-4 w-4" /> Cargar Excel
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
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
                    <span className="text-muted-foreground">
                      {uploadResult.created + uploadResult.updated} registro{uploadResult.created + uploadResult.updated !== 1 ? "s" : ""} procesado{uploadResult.created + uploadResult.updated !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                <button
                  className="text-xs text-disabled-foreground hover:text-muted-foreground underline"
                  onClick={() => setUploadResult(null)}
                >
                  Cerrar
                </button>
              </div>

              {/* Detail breakdown */}
              {(p || f) && (
                <div className="border-t border-inherit px-4 py-2 flex gap-6 text-xs text-muted-foreground">
                  {p && (
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-foreground">Partidas</span>
                      <span className="text-disabled-foreground">({p.total} en archivo)</span>
                      {p.created > 0 && <span className="bg-green-100 text-green-700 px-1.5 py-0.5">{p.created} nueva{p.created !== 1 ? "s" : ""}</span>}
                      {p.updated > 0 && <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5">{p.updated} actualizada{p.updated !== 1 ? "s" : ""}</span>}
                      {p.skipped > 0 && <span className="bg-red-100 text-red-700 px-1.5 py-0.5">{p.skipped} omitida{p.skipped !== 1 ? "s" : ""}</span>}
                    </div>
                  )}
                  {f && (
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-foreground">Familias</span>
                      <span className="text-disabled-foreground">({f.total} en archivo)</span>
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

      {programaDataWithComentarios.length > 0 && (
      <>
      {/* Search and timeline controls */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-4 py-2 sm:px-6 lg:px-8" data-viewer-readonly-allow="true">
        <div className="flex h-8 min-w-[190px] flex-1 items-center gap-2 border-b border-border text-left lg:max-w-xs">
          <Search className="h-4 w-4 shrink-0 text-disabled-foreground" />
          <Input
            aria-label="Buscar partida o familia"
            placeholder="Buscar partida o familia..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-auto border-none p-0 font-normal text-foreground shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-[170px] rounded-none" aria-label="Filtrar programa por estado">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              <SelectItem value="delayed">Con retraso</SelectItem>
              <SelectItem value="milestones">Con alertas de hitos</SelectItem>
              <SelectItem value="in_progress">En progreso</SelectItem>
              <SelectItem value="completed">Completadas</SelectItem>
            </SelectContent>
          </Select>
          {(searchTerm || statusFilter !== "all") && (
            <Button variant="ghost" size="sm" className="rounded-none" onClick={() => { setSearchTerm(""); setStatusFilter("all"); }}>
              Limpiar filtros
            </Button>
          )}
          <Button variant="outline" size="sm" className="hidden rounded-none min-[850px]:inline-flex" onClick={scrollToToday} disabled={todayPosition == null}>
            <Crosshair className="mr-1.5 h-3.5 w-3.5" /> Hoy
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="hidden rounded-none gap-2 min-[850px]:inline-flex">
                Vista <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56" data-viewer-readonly-allow="true">
              <DropdownMenuItem disabled={Boolean(searchTerm.trim()) || statusFilter !== "all"} onSelect={() => setExpandedIds(new Set(programaDataWithComentarios.map((item) => item.id)))}>
                <ChevronsUpDown className="h-4 w-4" /> Expandir familias
              </DropdownMenuItem>
              <DropdownMenuItem disabled={Boolean(searchTerm.trim()) || statusFilter !== "all"} onSelect={() => setExpandedIds(new Set())}>
                <ChevronsDownUp className="h-4 w-4" /> Contraer familias
              </DropdownMenuItem>
              {(searchTerm.trim() || statusFilter !== "all") && <p className="px-2 py-1.5 text-xs text-muted-foreground">Limpia los filtros para cambiar el nivel de detalle.</p>}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={toggleFocusMode}>
                {focusMode ? <Minimize2 className="h-4 w-4" /> : <Focus className="h-4 w-4" />}
                {focusMode ? "Salir de enfoque" : "Ampliar programa"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="hidden rounded-none min-[850px]:inline-flex" aria-label="Guía de colores del programa">
                Leyenda
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 rounded-none p-3 text-xs" aria-label="Guía de colores del programa">
              <p className="mb-2 font-medium text-foreground">Guía de colores del programa</p>
              <div className="space-y-2 text-muted-foreground">
                <span className="flex items-center gap-2"><span className="h-2 w-6 bg-green-700" /> Avance físico</span>
                <span className="flex items-center gap-2"><span className="h-2 w-6 bg-green-300" /> Avance financiero</span>
                <span className="flex items-center gap-2"><span className="h-2 w-6 bg-[#B17C7C]" /> Retraso o extensión</span>
                <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full border border-blue-700 bg-blue-50" /> Hito programado</span>
                <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full border border-red-700 bg-red-50" /> Hito requiere atención</span>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
      </>
      )}

      <div className="flex min-h-0 flex-1 flex-col">
        {programaDataWithComentarios.length === 0 && (
          <div className="mx-4 mt-6 border border-dashed border-border px-6 py-14 text-center sm:mx-6 lg:mx-8">
            <CalendarDays className="mx-auto h-9 w-9 text-disabled-foreground" />
            <h2 className="mt-4 text-base font-semibold text-foreground">Aún no hay un programa cargado</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Carga el archivo de programa para generar actividades, fechas, hitos y alertas del proyecto.
            </p>
            <Button className="mt-5 rounded-none" onClick={() => fileInputRef.current?.click()} disabled={uploading || parsing}>
              <Upload className="mr-2 h-4 w-4" /> Cargar Excel
            </Button>
          </div>
        )}

        {programaDataWithComentarios.length > 0 && filteredData.length === 0 && (
          <div className="mx-4 mt-6 border border-dashed border-border px-6 py-12 text-center sm:mx-6 lg:mx-8">
            <Search className="mx-auto h-8 w-8 text-disabled-foreground" />
            <h2 className="mt-3 text-sm font-semibold text-foreground">No hay resultados</h2>
            <p className="mt-1 text-xs text-muted-foreground">Prueba otra búsqueda o restablece los filtros.</p>
            <Button variant="outline" size="sm" className="mt-4 rounded-none" data-viewer-readonly-allow="true" onClick={() => { setSearchTerm(""); setStatusFilter("all"); }}>
              Restablecer filtros
            </Button>
          </div>
        )}

        {programaDataWithComentarios.length > 0 && (filteredData.length > 0 || exporting) && (
        <>
        <ProgramaObraMobileList
          items={filteredData}
          expandedIds={expandedIds}
          filtersActive={Boolean(searchTerm.trim()) || statusFilter !== "all"}
          currentTime={currentTime}
          canEdit={canEditActivities}
          renderActions={renderItemActions}
          onToggle={toggleExpanded}
          onMilestoneSelect={setSelectedMilestone}
          onRegisterProgress={setProgressItem}
            onOpenActivity={openExecution}
        />
        {/* Gantt Chart */}
        <div className={cn("hidden min-h-[440px] flex-1 bg-card min-[850px]:flex", exporting && "fixed left-[-10000px] top-0 flex w-[1280px] min-[850px]:static min-[850px]:w-auto")}>
          {/* Fixed left columns — separate scroll container, only vertical */}
          <div
            className="z-30 w-[320px] shrink-0 overflow-x-hidden overflow-y-auto bg-card shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden xl:w-[400px]"
            ref={leftScrollRef}
            onScroll={handleLeftScroll}
          >
            <div ref={leftColumnsRef}>
              {/* Header — pt-[8px] accounts for year label that overflows above the border */}
              <div className="sticky top-0 z-40 bg-card pt-[8px]">
                <div className="flex border-b border-t border-border bg-card">
                  <div className="flex h-[40px] w-[216px] shrink-0 items-center border-r border-border px-3 text-left xl:w-72 xl:px-4">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Partida · Familia
                    </span>
                  </div>
                  <div className="flex h-[40px] w-[104px] shrink-0 items-center justify-end border-r border-border px-2 text-right xl:w-28 xl:px-3">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Presupuesto
                    </span>
                  </div>
                </div>
              </div>

              {/* Rows */}
              {ganttData.map((item) => {
                const isExpanded = activeExport
                  ? activeExport.breakdownIds.has(item.id)
                  : Boolean(searchTerm.trim()) || statusFilter !== "all" || expandedIds.has(item.id);
                return (
                  <div
                    key={item.id}
                    className={cn(
                      "flex border-b border-border min-h-[56px] max-h-[56px] bg-card",
                      // item.level === 0 && "bg-card",
                      // item.level === 1 && "bg-background/50",
                      // item.level === 2 && "bg-background/30"
                    )}
                  >
                    {/* Name */}
                    <div className="flex w-[216px] shrink-0 items-center border-r border-border px-2 py-1 text-left xl:w-72">
                      <div
                        className="flex items-center gap-1.5 flex-1 min-w-0"
                        style={{ paddingLeft: `${item.level * 16}px` }}
                      >
                        {item.children.length > 0 ? (
                          <button
                            type="button"
                            data-viewer-readonly-allow="true"
                            onClick={() => toggleExpanded(item.id)}
                            className="flex h-8 w-8 shrink-0 items-center justify-center hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            aria-label={`${isExpanded ? "Contraer" : "Expandir"} ${item.partida}`}
                            aria-expanded={isExpanded}
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-3.5 w-3.5 text-disabled-foreground" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5 text-disabled-foreground" />
                            )}
                          </button>
                        ) : (
                          <div className="w-8 shrink-0" />
                        )}
                        <span
                          className={cn(
                            "min-w-0 flex-1 break-words line-clamp-2 text-sm leading-4",
                            item.level === 0 && "font-medium text-foreground",
                            item.level === 1 && "text-muted-foreground"
                          )}
                          title={item.partida}
                        >
                          {item.partida}
                        </span>

                        <div className="ml-auto shrink-0">{renderItemActions(item)}</div>

                      </div>
                    </div>

                    {/* Presupuesto / Peso / Avance */}
                    <div className="flex w-[104px] shrink-0 items-center justify-end border-r border-border px-2 py-1 xl:w-28 xl:px-3">
                      {item.level === 0 ? (
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="text-sm text-foreground font-medium">
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
                                className="w-16 h-4 text-[9px] text-right border border-border-strong rounded-sm px-1 focus:outline-none focus:border-blue-500 bg-card"
                              />
                              <span className="text-[9px] text-disabled-foreground">%</span>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                editingPesoItemRef.current = item;
                                editingPesoValueRef.current = String(item.ponderacion ?? "");
                                setEditingPesoId(item.id);
                                setEditingPesoValue(String(item.ponderacion ?? ""));
                              }}
                              className="hidden"
                              title="Editar peso"
                            >
                              {item.ponderacion != null ? `${(item.ponderacion).toFixed(2)}%` : "—"}
                            </button>
                          )}
                        </div>
                      ) : item.level === 1 ? (
                        <div className="flex flex-col items-end gap-0.5">


                          <div className="flex items-center gap-0.5">
                            <span className="text-xs text-foreground">Avance: </span>
                            <button type="button" disabled={!canEditActivities || !execution} onClick={() => setProgressItem(item)}
                              className="min-h-8 min-w-10 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
                              aria-label={`Editar avance real de ${item.partida}, ${Math.round(item.avanceReal ?? 0)} por ciento`}>
                              {Math.round(item.avanceReal ?? 0)}%
                            </button>
                          </div>

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
                                className="w-16 h-4 text-[9px] text-right border border-green-300 rounded-sm px-1 focus:outline-none focus:border-green-500 bg-card"
                              />
                              <span className="text-[9px] text-disabled-foreground">%</span>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                editingPesoItemRef.current = item;
                                editingPesoValueRef.current = String(item.ponderacion ?? "");
                                setEditingPesoId(item.id);
                                setEditingPesoValue(String(item.ponderacion ?? ""));
                              }}
                              className="hidden"
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
          </div>

          {/* Scrollable timeline — scrolls both horizontally and vertically */}
          <div
            className="flex-1 overflow-auto bg-card"
            ref={ganttContainerRef}
            onScroll={handleRightScroll}
          >
            <div className="shrink-0" ref={scrollContainerRef} style={{ width: totalTimelineWidth }}>
              {/* Year + Month headers */}
              <div className="sticky top-0 z-20 min-w-max bg-card">
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
                          <span className="text-xs font-medium text-muted-foreground leading-none bg-card px-1">{y}</span>
                        </div>
                      );
                    })}
                  </div>
                  {/* Month labels + week sub-headers row */}
                  <div className="flex border-t border-b border-border">
                  {timelineMonths.map((m, i) => {
                    const mw = getMonthWidth(m.weeks);
                    return (
                      <div key={i} className="border-r border-border shrink-0 h-[40px]" style={{ width: mw }}>
                        <div className="text-center py-1 text-[11px] font-medium text-muted-foreground tracking-wider">
                          {m.label}
                        </div>
                        <div className="flex">
                          {Array.from({ length: m.weeks }).map((_, wi) => (
                            <div
                              key={wi}
                              className={cn(
                                "text-center text-[10px] text-muted-foreground py-0.5",
                                wi < m.weeks - 1 && "border-r border-dashed border-border"
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
              {ganttData.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    "relative border-b border-border min-h-[56px] max-h-[56px] bg-card",
                    // item.level === 0 && "bg-card",
                    // item.level === 1 && "bg-background/80",
                    // item.level === 2 && "bg-background/80"
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
                        className="absolute top-0 bottom-0 bg-muted pointer-events-none z-[1]"
                        style={{ left: pStart, width: Math.max(pEnd - pStart, 0) }}
                      >
                        <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-disabled" />
                      </div>
                    );
                  })()}

                  {/* Grid lines */}
                  <div className="absolute inset-0 flex pointer-events-none z-[2]">
                    {timelineMonths.map((m, i) => (
                      <div key={i} className="border-r border-border shrink-0 flex" style={{ width: getMonthWidth(m.weeks) }}>
                        {Array.from({ length: m.weeks - 1 }).map((_, wi) => (
                          <div key={wi} className="border-r border-dashed border-border shrink-0" style={{ width: WEEK_WIDTH }} />
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
                    currentTime={currentTime}
                    forceShowMilestones={exporting}
                    showMilestones={!activeExport || activeExport.includeNotices}
                    showComments={!activeExport || activeExport.includeNotices}
                    onMilestoneSelect={setSelectedMilestone}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
        </>
        )}
      </div>



      {exportDialogOpen && (
        <ProgramaObraExportDialog
          items={programaDataWithComentarios}
          onCancel={() => setExportDialogOpen(false)}
          onExport={handleExportPdf}
        />
      )}

      <ProgramaObraAlertsPanel
        open={alertsOpen}
        onOpenChange={setAlertsOpen}
        milestones={(milestoneDashboard ?? []) as ProgramaMilestoneSummary[]}
        onSelect={(milestone) => {
          setAlertsOpen(false);
          setSelectedMilestone(milestone);
        }}
      />

      {selectedMilestone && proyectoId && (
        <ProgramaObraMilestoneDetail
          milestone={selectedMilestone}
          proyectoId={proyectoId as Id<"desarrollos">}
          onClose={() => setSelectedMilestone(null)}
        />
      )}

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

      {/* Avance History Sheet */}
      {progressItem && <ProgramaObraProgressEditor key={progressItem.id} item={progressItem} model={execution} onClose={() => setProgressItem(null)} />}
      {historialItem && (
        <ProgramaObraAvanceHistorial
          item={historialItem}
          historial={avanceHistorial ?? []}
          onClose={() => setHistorialItem(null)}
        />
      )}

      {/* Ponderacion Sheet */}
      {canEditPesos && ponderacionItem && (
        <Sheet open onOpenChange={(open) => !open && closePonderacionEditor()}>
          <SheetContent className="w-full overflow-y-auto sm:max-w-[360px]">
            <SheetHeader>
              <SheetTitle className="text-left flex items-center gap-2">
                <Percent className="h-4 w-4" />
                Ponderación
              </SheetTitle>
              <SheetDescription className="text-left">
                {ponderacionItem.partida}
              </SheetDescription>
            </SheetHeader>

            <div className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="programa-ponderacion" className="text-xs text-muted-foreground">Peso del elemento</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="programa-ponderacion"
                    type="number"
                    min={0}
                    max={100}
                    autoFocus
                    value={editingPesoValue}
                    onChange={(e) => {
                      setEditingPesoValue(e.target.value);
                      editingPesoValueRef.current = e.target.value;
                    }}
                    onKeyDown={(e: React.KeyboardEvent) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleSavePeso();
                      }
                      if (e.key === "Escape") {
                        closePonderacionEditor();
                      }
                    }}
                    className="h-9 rounded-none text-sm"
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={closePonderacionEditor}
                  className="rounded-none text-xs"
                >
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  onClick={handleSavePeso}
                  disabled={savingPonderacion || editingPesoValue.trim() === ""}
                  className="rounded-none text-xs"
                >
                  {savingPonderacion ? "Guardando..." : "Guardar"}
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      )}

      {/* Excel Preview Dialog */}
      {importRows && proyectoId && execution && <ProgramaObraImportReview proyecto={proyectoId as Id<"desarrollos">} rows={importRows} schedules={schedules ?? []} details={detalles ?? []} onCancel={() => setImportRows(null)} onApply={handleImportApply} busy={uploading} />}
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
