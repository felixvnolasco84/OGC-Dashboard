import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useParams } from "react-router";
import { api } from "../../../convex/_generated/api";
import { useQuery, usePaginatedQuery, useMutation } from "convex/react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronDown, ChevronRight, Search, Plus, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import ProgramaObraGanttItem from "./ProgramaObraGanttItem";
import { Id } from "../../../convex/_generated/dataModel";
import { type ScheduleData, type ProgramaItem } from "./programa-obra-types";
import ProgramaObraPartidaEditor from "./ProgramaObraPartidaEditor";

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

/** Get month columns to render based on the year range of the data */
function getTimelineMonths(year: number): { label: string; month: number; year: number }[] {
  return MONTHS_ES.map((label, i) => ({ label, month: i, year }));
}

const COLUMN_WIDTH = 128; // px per month column

// ============================================================
// Component
// ============================================================

export default function ProgramaObra() {
  const { proyectoId } = useParams<{ proyectoId: string }>();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [editingPartida, setEditingPartida] = useState<ProgramaItem | null>(null);

  // Fetch current project
  const proyecto = useQuery(api.desarrollos.getById, proyectoId ? { id: proyectoId as Id<"desarrollos"> } : "skip");

  // Fetch all partidas for selected project with pagination
  const { results: allPartidas, loadMore, status: partidasStatus } = usePaginatedQuery(
    api.partida.getByProjectPaginated,
    proyectoId ? { projectId: proyectoId as Id<"desarrollos"> } : "skip",
    { initialNumItems: 1000 }
  );

  // Fetch programa_obra schedules
  const schedules = useQuery(
    api.programa_obra.getSchedulesByProyecto,
    proyectoId ? { proyecto_id: proyectoId as Id<"desarrollos"> } : "skip"
  );

  // Fetch ponderaciones
  const ponderaciones = useQuery(
    api.programa_obra.getPonderacionesByProyecto,
    proyectoId ? { proyecto_id: proyectoId as Id<"desarrollos"> } : "skip"
  );

  // Fetch avance real
  const avanceRealEntries = useQuery(
    api.programa_obra.getAvanceRealByProyecto,
    proyectoId ? { proyecto_id: proyectoId as Id<"desarrollos"> } : "skip"
  );

  // Mutations
  const upsertAvanceReal = useMutation(api.programa_obra.upsertAvanceReal);
  const upsertPonderacion = useMutation(api.programa_obra.upsertPonderacion);
  const addFamilia = useMutation(api.programa_obra.addFamilia);
  const addSubPartida = useMutation(api.programa_obra.addSubPartida);

  // Build lookup maps
  const scheduleMap = useMemo(() => {
    const map = new Map<string, ScheduleData>();
    schedules?.forEach((s) => map.set(s.partida_id, s));
    return map;
  }, [schedules]);

  const ponderacionMap = useMemo(() => {
    const map = new Map<string, number>();
    ponderaciones?.forEach((p) => map.set(p.partida_id, p.peso));
    return map;
  }, [ponderaciones]);

  const avanceRealMap = useMemo(() => {
    const map = new Map<string, number>();
    avanceRealEntries?.forEach((a) => map.set(a.partida_id, a.porcentaje));
    return map;
  }, [avanceRealEntries]);

  // ============================================================
  // Build hierarchical tree from flat partidas
  // ============================================================
  const programaData = useMemo(() => {
    if (!allPartidas) return [];

    // Separate by nivel
    const nivel1 = allPartidas.filter((p) => p.nivel === 1);
    const nivel2 = allPartidas.filter((p) => p.nivel === 2);
    const nivel3 = allPartidas.filter((p) => p.nivel === 3);

    return nivel1.map((p1) => {
      const schedule = scheduleMap.get(p1._id) || null;

      // Find children (nivel 2) by partida_nombre or nombre match
      const children2 = nivel2.filter(
        (p2) => (p2.partida_nombre || p2.nombre) === p1.nombre
      );

      // Group nivel 2 by familia
      const familiaMap = new Map<string, typeof nivel2>();
      children2.forEach((p2) => {
        const key = p2.familia || p2.nombre;
        if (!familiaMap.has(key)) familiaMap.set(key, []);
        familiaMap.get(key)!.push(p2);
      });

      const familiaItems: ProgramaItem[] = Array.from(familiaMap.entries()).map(
        ([familiaName, familiaPartidas]) => {
          // Sum presupuesto and pagado for the familia
          const famPresupuesto = familiaPartidas.reduce((s, fp) => s + (fp.presupuesto_aprobado || 0), 0);
          const famPagado = familiaPartidas.reduce((s, fp) => s + (fp.pagado || 0), 0);

          // Find nivel 3 children for this familia
          const children3 = nivel3.filter(
            (p3) =>
              (p3.partida_nombre || p3.nombre) === p1.nombre &&
              p3.familia === familiaName
          );

          const subItems: ProgramaItem[] = children3.map((p3) => {
            const avReal = avanceRealMap.get(p3._id) ?? 0;
            return {
              id: `sub-${p3._id}`,
              partidaDbId: p3._id,
              partida: p3.sub_partida || p3.familia,
              presupuesto: p3.presupuesto_aprobado || 0,
              pagado: p3.pagado || 0,
              expanded: false,
              level: 2,
              parentPartidaNombre: p1.nombre,
              familiaName,
              schedule, // inherit parent schedule for bar positioning
              ponderacion: ponderacionMap.get(p3._id),
              avanceReal: avReal,
              children: [],
            };
          });

          // Calculate weighted avance for familia from children
          let familiaAvance = 0;
          if (subItems.length > 0) {
            const totalWeight = subItems.reduce((s, c) => s + (c.ponderacion ?? 1), 0);
            familiaAvance =
              totalWeight > 0
                ? subItems.reduce(
                    (s, c) => s + (c.avanceReal || 0) * (c.ponderacion ?? 1),
                    0
                  ) / totalWeight
                : 0;
          }

          // Use first familia partida's DB ID for ponderacion lookups
          const firstFamPartida = familiaPartidas[0];

          return {
            id: `fam-${p1.nombre}-${familiaName}`,
            partidaDbId: firstFamPartida?._id,
            partida: familiaName,
            presupuesto: famPresupuesto,
            pagado: famPagado,
            expanded: false,
            level: 1,
            parentPartidaNombre: p1.nombre,
            familiaName,
            schedule, // inherit parent schedule for bar positioning
            ponderacion: firstFamPartida ? ponderacionMap.get(firstFamPartida._id) : undefined,
            avanceReal: Math.round(familiaAvance * 100) / 100,
            children: subItems,
          } as ProgramaItem;
        }
      );

      // Calculate weighted avance for partida from familia children
      let partidaAvance = 0;
      if (familiaItems.length > 0) {
        const totalWeight = familiaItems.reduce((s, c) => s + (c.ponderacion ?? 1), 0);
        partidaAvance =
          totalWeight > 0
            ? familiaItems.reduce(
                (s, c) => s + (c.avanceReal || 0) * (c.ponderacion ?? 1),
                0
              ) / totalWeight
            : 0;
      }

      // Financiero = pagado/presupuesto for nivel 1
      const financiero =
        p1.presupuesto_aprobado > 0
          ? Math.round((p1.pagado / p1.presupuesto_aprobado) * 100)
          : 0;

      return {
        id: `partida-${p1._id}`,
        partidaDbId: p1._id,
        partida: p1.nombre,
        presupuesto: p1.presupuesto_aprobado || 0,
        pagado: p1.pagado || 0,
        expanded: false,
        level: 0,
        schedule,
        avanceReal: Math.round(partidaAvance * 100) / 100,
        financiero,
        children: familiaItems,
      } as ProgramaItem;
    });
  }, [allPartidas, scheduleMap, ponderacionMap, avanceRealMap]);

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
    walk(programaData);
    return result;
  }, [programaData, expandedIds]);

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
    return month * COLUMN_WIDTH + fraction * COLUMN_WIDTH;
  }, [selectedYear]);

  // Inline avance real save
  const handleAvanceRealChange = useCallback(
    async (partidaDbId: Id<"partidas">, value: number) => {
      if (!proyectoId) return;
      await upsertAvanceReal({
        proyecto: proyectoId as Id<"desarrollos">,
        partida_id: partidaDbId,
        porcentaje: value,
      });
    },
    [proyectoId, upsertAvanceReal]
  );

  // Inline ponderacion save (used in familia/sub-partida rows)
  const handlePonderacionChange = useCallback(
    async (partidaDbId: Id<"partidas">, parentNombre: string, value: number) => {
      if (!proyectoId) return;
      await upsertPonderacion({
        proyecto: proyectoId as Id<"desarrollos">,
        partida_id: partidaDbId,
        parent_partida_nombre: parentNombre,
        peso: value,
      });
    },
    [proyectoId, upsertPonderacion]
  );

  // Add familia
  const handleAddFamilia = useCallback(
    async (partidaNombre: string) => {
      if (!proyectoId) return;
      const name = prompt("Nombre de la nueva familia:");
      if (!name || !name.trim()) return;
      await addFamilia({
        proyecto: proyectoId as Id<"desarrollos">,
        partida_nombre: partidaNombre,
        familia: name.trim(),
      });
    },
    [proyectoId, addFamilia]
  );

  // Add sub-partida
  const handleAddSubPartida = useCallback(
    async (partidaNombre: string, familiaName: string) => {
      if (!proyectoId) return;
      const name = prompt("Nombre de la nueva sub-partida:");
      if (!name || !name.trim()) return;
      await addSubPartida({
        proyecto: proyectoId as Id<"desarrollos">,
        partida_nombre: partidaNombre,
        familia: familiaName,
        sub_partida: name.trim(),
      });
    },
    [proyectoId, addSubPartida]
  );

  // Scroll to today on mount
  useEffect(() => {
    if (todayPosition && scrollContainerRef.current) {
      const offset = todayPosition - scrollContainerRef.current.clientWidth / 2;
      scrollContainerRef.current.scrollLeft = Math.max(0, offset);
    }
  }, [todayPosition]);

  // Loading state
  if (!proyecto || partidasStatus === "LoadingFirstPage") {
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

      {/* Gantt Chart */}
      <div className="overflow-hidden bg-white">
        <div className="flex">
          {/* Fixed left columns */}
          <div className="shrink-0">
            {/* Header */}
            <div className="flex border-b border-t border-[#d2d1ce] bg-white sticky top-0 z-20">
              <div className="w-72 border-r border-[#d2d1ce] px-4 py-3 text-left">
                <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Partida · Familia
                </span>
              </div>
              <div className="w-28 border-r border-[#d2d1ce] px-3 py-3 text-right">
                <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
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
                    "flex border-b border-t border-[#d2d1ce] min-h-[64px]",
                    item.level === 0 && "bg-white",
                    item.level === 1 && "bg-gray-50/50",
                    item.level === 2 && "bg-gray-50/30"
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
                          item.level === 1 && "text-gray-600",
                          item.level === 2 && "text-gray-400"
                        )}
                        title={item.partida}
                      >
                        {item.partida}
                      </span>

                      {/* Menu for nivel 0 */}
                      {item.level === 0 && (
                        <button
                          onClick={() => setEditingPartida(item)}
                          className="ml-auto p-1 hover:bg-gray-100 rounded shrink-0 opacity-60 hover:opacity-100"
                        >
                          <MoreHorizontal className="h-3.5 w-3.5 text-gray-400" />
                        </button>
                      )}

                      {/* Add child button for nivel 0 and 1 */}
                      {item.level === 0 && isExpanded && (
                        <button
                          onClick={() => handleAddFamilia(item.partida)}
                          className="p-1 hover:bg-gray-100 rounded shrink-0 opacity-40 hover:opacity-100"
                          title="Agregar familia"
                        >
                          <Plus className="h-3 w-3 text-gray-400" />
                        </button>
                      )}
                      {item.level === 1 && isExpanded && (
                        <button
                          onClick={() => handleAddSubPartida(item.parentPartidaNombre!, item.familiaName!)}
                          className="p-1 hover:bg-gray-100 rounded shrink-0 opacity-40 hover:opacity-100"
                          title="Agregar sub-partida"
                        >
                          <Plus className="h-3 w-3 text-gray-400" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Presupuesto / Avance / Ponderación */}
                  <div className="w-28 border-r border-[#d2d1ce] px-3 py-3 flex items-center justify-end">
                    {item.level === 0 ? (
                      <span className="text-sm text-gray-700 font-medium">
                        {formatCurrency(item.presupuesto)}
                      </span>
                    ) : item.level === 1 ? (
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="text-[15px] text-[#A0A09A]">
                          {item.avanceReal != null ? `${Math.round(item.avanceReal)}%` : ""}
                        </span>
                        {item.partidaDbId && item.parentPartidaNombre && (
                          <PonderacionInput
                            value={item.ponderacion}
                            onChange={(v) =>
                              handlePonderacionChange(item.partidaDbId!, item.parentPartidaNombre!, v)
                            }
                          />
                        )}
                      </div>
                    ) : (
                      <AvanceInput
                        value={item.avanceReal ?? 0}
                        onChange={(v) =>
                          item.partidaDbId && handleAvanceRealChange(item.partidaDbId, v)
                        }
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Scrollable timeline */}
          <div className="flex-1 overflow-x-auto" ref={scrollContainerRef}>
            {/* Month headers */}
            <div className="flex border-b border-t border-[#d2d1ce] bg-white sticky top-0 z-10 min-w-max">
              {timelineMonths.map((m, i) => (
                <div
                  key={i}
                  className="text-left px-3 py-4 text-xs font-medium text-gray-400 uppercase tracking-wider border-r border-[#d2d1ce]"
                  style={{ width: COLUMN_WIDTH }}
                >
                  {m.label}
                </div>
              ))}
              <div className="px-4 py-3 text-xs font-medium text-gray-300 ml-2">
                {selectedYear}
              </div>
            </div>

            {/* Timeline rows */}
            {filteredData.map((item) => (
              <div
                key={item.id}
                className={cn(
                  "relative border-b border-[#d2d1ce] min-h-[64px]",
                  item.level === 0 && "bg-white",
                  item.level === 1 && "bg-gray-50/50",
                  item.level === 2 && "bg-gray-50/30"
                )}
              >
                {/* Grid lines */}
                <div className="absolute inset-0 flex pointer-events-none">
                  {timelineMonths.map((_, i) => (
                    <div key={i} className="border-r border-[#d2d1ce] shrink-0" style={{ width: COLUMN_WIDTH }} />
                  ))}
                </div>

                {/* Today line */}
                {todayPosition != null && (
                  <div
                    className="absolute top-0 bottom-0 w-px border-l border-dashed border-gray-300 z-10 pointer-events-none"
                    style={{ left: todayPosition }}
                  />
                )}

                {/* Gantt bar */}
                <ProgramaObraGanttItem
                  item={item}
                  year={selectedYear}
                  columnWidth={COLUMN_WIDTH}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Load more */}
      {partidasStatus === "CanLoadMore" && (
        <div className="flex justify-start px-12">
          <Button className="rounded-none" variant="outline" onClick={() => loadMore(500)}>
            Cargar más
          </Button>
        </div>
      )}

      {/* Partida Editor Sheet */}
      {editingPartida && proyectoId && (
        <ProgramaObraPartidaEditor
          item={editingPartida}
          proyectoId={proyectoId as Id<"desarrollos">}
          onClose={() => setEditingPartida(null)}
        />
      )}
    </div>
  );
}

// ============================================================
// Inline avance real input component (nivel 3 sub-partidas)
// ============================================================
function AvanceInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [localValue, setLocalValue] = useState(String(value));

  useEffect(() => {
    setLocalValue(String(value));
  }, [value]);

  const handleBlur = () => {
    const num = parseFloat(localValue);
    if (!isNaN(num) && num >= 0 && num <= 100 && num !== value) {
      onChange(num);
    } else {
      setLocalValue(String(value));
    }
  };

  return (
    <div className="flex items-center gap-0.5">
      <input
        type="text"
        className="w-10 text-xs text-right bg-transparent border-b border-transparent hover:border-gray-300 focus:border-gray-400 focus:outline-none py-0.5 text-gray-500"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      />
      <span className="text-xs text-gray-400">%</span>
    </div>
  );
}

// ============================================================
// Inline ponderación (weight) input component (nivel 1 familias)
// ============================================================
function PonderacionInput({ value, onChange }: { value: number | undefined; onChange: (v: number) => void }) {
  const [localValue, setLocalValue] = useState(value != null ? String(value) : "");

  useEffect(() => {
    setLocalValue(value != null ? String(value) : "");
  }, [value]);

  const handleBlur = () => {
    const num = parseFloat(localValue);
    if (!isNaN(num) && num >= 0 && num <= 100 && num !== value) {
      onChange(num);
    } else {
      setLocalValue(value != null ? String(value) : "");
    }
  };

  return (
    <div className="flex items-center gap-0.5">
      <span className="text-[9px] text-gray-300">peso:</span>
      <input
        type="text"
        placeholder="—"
        className="w-8 text-[10px] text-right bg-transparent border-b border-transparent hover:border-gray-300 focus:border-gray-400 focus:outline-none py-0 text-gray-400"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      />
      <span className="text-[9px] text-gray-300">%</span>
    </div>
  );
}
