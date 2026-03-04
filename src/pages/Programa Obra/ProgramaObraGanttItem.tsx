import { useState } from "react";
import { cn } from "@/lib/utils";
import { type ProgramaItem, parseDate } from "./programa-obra-types";
import { Check, MessageSquare } from "lucide-react";

// ============================================================
// Helpers
// ============================================================

type TimelineMonth = { label: string; month: number; year: number; weeks: number };

/** Convert a Date to pixel position within a multi-year timeline */
function dateToPixel(date: Date, weekWidth: number, months: TimelineMonth[]): number {
  const mw = (m: TimelineMonth) => m.weeks * weekWidth;
  const dy = date.getFullYear();
  const dm = date.getMonth();
  let offset = 0;
  for (let i = 0; i < months.length; i++) {
    if (months[i].year === dy && months[i].month === dm) {
      const day = date.getDate();
      const daysInMonth = new Date(dy, dm + 1, 0).getDate();
      const fraction = (day - 1) / daysInMonth;
      return offset + fraction * mw(months[i]);
    }
    offset += mw(months[i]);
  }
  if (months.length > 0 && (dy < months[0].year || (dy === months[0].year && dm < months[0].month))) return 0;
  return offset;
}

// ============================================================
// Component
// ============================================================

type Props = {
  item: ProgramaItem;
  columnWidth: number;
  timelineMonths: TimelineMonth[];
};

export default function ProgramaObraGanttItem({ item, columnWidth, timelineMonths }: Props) {
  const [isHovered, setIsHovered] = useState(false);
  const [showAnticipo, setShowAnticipo] = useState(false);
  const [showSuministro, setShowSuministro] = useState(false);
  const [expandedComentarios, setExpandedComentarios] = useState<Set<string>>(new Set());

  // Use detalle schedule if available (from Excel upload), then familia schedule, then parent
  const schedule = item.schedule;
  const effectiveSchedule =
    (item.level === 1 || item.level === 2) && item.detalleSchedule
      ? item.detalleSchedule
      : item.level === 1 && item.familiaSchedule
        ? item.familiaSchedule
        : schedule;

  // Parse dates from the effective schedule
  const rawStartDate = parseDate(effectiveSchedule?.fecha_inicio);
  const rawEndDate = parseDate(effectiveSchedule?.fecha_fin);
  const anticipoDate = parseDate(schedule?.anticipo_fecha);
  const suministroDate = parseDate(schedule?.suministro_fecha);

  // Clamp child items' start to parent start
  let startDate = rawStartDate;
  let endDate = rawEndDate;
  if ((item.level === 1 || item.level === 2) && item.schedule) {
    const parentStart = parseDate(item.schedule.fecha_inicio);
    if (parentStart && startDate && startDate < parentStart) startDate = parentStart;
  }

  // Compute extension end date from tiempo_extra fields on detalleSchedule.
  // The base fecha_fin is the green bar end; red extension goes from base to base + tiempo_extra.
  //
  // Backward-compat: old records stored fecha_fin = base + extension (baked in).
  // Detection: if tiempo_extra exists AND fecha_fin > parent end, the stored fecha_fin
  // likely already includes the extension. In that case, subtract to get the base.
  let extensionEndDate: Date | null = null;
  if (
    (item.level === 1 || item.level === 2) &&
    item.detalleSchedule &&
    item.detalleSchedule.tiempo_extra_cantidad &&
    item.detalleSchedule.tiempo_extra_cantidad > 0 &&
    endDate
  ) {
    const cant = item.detalleSchedule.tiempo_extra_cantidad;
    const unidad = item.detalleSchedule.tiempo_extra_unidad ?? "dias";
    const parentEnd = item.schedule ? parseDate(item.schedule.fecha_fin) : null;

    // Check if this is an old record (fecha_fin already includes extension)
    const isOldRecord = parentEnd && endDate.getTime() > parentEnd.getTime();

    if (isOldRecord) {
      // Old logic: fecha_fin = base + extension. Use stored fecha_fin as the extension end.
      extensionEndDate = new Date(endDate);
      // Subtract extension to recover the base date for the green bar.
      const base = new Date(endDate);
      if (unidad === "dias") {
        base.setDate(base.getDate() - cant);
      } else if (unidad === "semanas") {
        base.setDate(base.getDate() - cant * 7);
      } else if (unidad === "meses") {
        base.setMonth(base.getMonth() - cant);
      }
      endDate = base;
    } else {
      // New logic: fecha_fin is the base. Add extension for the red bar.
      const ext = new Date(endDate);
      if (unidad === "dias") {
        ext.setDate(ext.getDate() + cant);
      } else if (unidad === "semanas") {
        ext.setDate(ext.getDate() + cant * 7);
      } else if (unidad === "meses") {
        ext.setMonth(ext.getMonth() + cant);
      }
      extensionEndDate = ext;
    }
  }

  // For level 0, check if any child extends beyond (maxChildEndDate)
  const maxChildEnd = item.level === 0 ? parseDate(item.maxChildEndDate) : null;
  const parentEndForExtension = item.level === 0 ? parseDate(item.schedule?.fecha_fin) : null;

  // If no schedule dates, don't render a bar
  if (!startDate || !endDate) return null;

  const startPx = dateToPixel(startDate, columnWidth, timelineMonths);
  const endPx = dateToPixel(endDate, columnWidth, timelineMonths);
  const isSameDay = startDate.getTime() === endDate.getTime();
  const barWidth = isSameDay ? 4 : Math.max(endPx - startPx, 8);

  // Red extension pixels
  const extensionEndPx = extensionEndDate ? dateToPixel(extensionEndDate, columnWidth, timelineMonths) : null;
  const extensionWidth = extensionEndPx ? Math.max(extensionEndPx - endPx, 0) : 0;
  const parentEndPx0 = parentEndForExtension ? dateToPixel(parentEndForExtension, columnWidth, timelineMonths) : null;
  const maxChildEndPx = maxChildEnd ? dateToPixel(maxChildEnd, columnWidth, timelineMonths) : null;
  const level0ExtensionWidth = parentEndPx0 != null && maxChildEndPx != null ? Math.max(maxChildEndPx - parentEndPx0, 0) : 0;

  // Avance real and financiero percentages
  const avanceReal = item.avanceReal ?? 0;
  const financiero = item.financiero ?? 0;

  // Check for late start (red indicator): first avance real > 1 week after fecha_inicio
  // For simplicity, show red if avanceReal is 0 and today is > 7 days past start
  const now = new Date();
  const isLateStart =
    item.level === 0 &&
    avanceReal === 0 &&
    startDate < new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Milestone positions (relative to bar start)
  const anticipoPx = anticipoDate ? dateToPixel(anticipoDate, columnWidth, timelineMonths) : null;
  const suministroPx = suministroDate ? dateToPixel(suministroDate, columnWidth, timelineMonths) : null;

  // For nivel 1 (familia) and nivel 2 (sub-partida), inherit parent schedule
  // They render under the parent's bar range. For now, they span the same range
  // but could be offset in the future.

  return (
    <div
      className="absolute top-0 bottom-0 flex items-start z-10"
      style={{
        left: `${startPx}px`,
        width: `${barWidth}px`,
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="w-full relative h-full">
        {/* === Dual bar for nivel 0 (partida) === */}
        {item.level === 0 && (
          <div className="flex flex-col gap-0 h-full">
            {/* Dark green - Avance Real */}
            <div className="h-2.5 w-full bg-[#bacabb] rounded-t-none overflow-hidden relative">
              <div
                className={cn(
                  "h-full rounded-t-none transition-all",
                  isLateStart ? "bg-[#f0e4e4]" : "bg-green-700"
                )}
                style={{ width: `${Math.min(avanceReal, 100)}%` }}
              />
              {/* % label on the right */}
              {avanceReal > 0 && (
                <span className="absolute -right-10 top-0 text-[10px] text-gray-500 leading-[10px]">
                  {Math.round(avanceReal)}%
                </span>
              )}
            </div>
            {/* Light green - Financiero */}
            <div className="h-2 w-full bg-[#bee3cf] rounded-b-none overflow-hidden relative">
              <div
                className="h-full bg-green-400/70 rounded-b-none transition-all"
                style={{ width: `${Math.min(financiero, 100)}%` }}
              />
              {financiero > 0 && (
                <span className="absolute -right-10 top-0 text-[10px] text-gray-400 leading-[8px]">
                  {financiero}%
                </span>
              )}
            </div>
            {/* Label */}
            <span className="text-[11px] text-[#282822] bg-gray-100 px-2.5 py-1.5 block mt-0 text-left h-full whitespace-nowrap">
              {item.partida}
            </span>
          </div>
        )}

        {/* === Red extension bar for nivel 0 (partida) === */}
        {item.level === 0 && level0ExtensionWidth > 0 && (
          <div
            className="absolute top-0 h-2.5 bg-[#802424] z-[5]"
            style={{ left: `${barWidth}px`, width: `${level0ExtensionWidth}px` }}
          />
        )}

        {/* === Single bar for nivel 1 (familia) === */}
        {item.level === 1 && (
          <div className="flex flex-col gap-2">
            <div className="h-[3px] w-full bg-[#9eb9a1] rounded-none overflow-hidden relative">
              <div
                className="h-full bg-[#417847] rounded-none transition-all"
                style={{ width: `${Math.min(avanceReal, 100)}%` }}
              />
              {avanceReal > 0 && (
                <span className="absolute -right-8 top-[-3px] text-[9px] text-green-700  leading-[10px]">
                  {Math.round(avanceReal)}%
                </span>
              )}
            </div>


            <span className="text-[10px] text-[#5A5A50] px-1 block text-left font-light whitespace-nowrap">
              {item.partida}
            </span>


          </div>
        )}

        {/* === Red extension bar for nivel 1 (familia) === */}
        {item.level === 1 && extensionWidth > 0 && (
          <div
            className="absolute top-0 h-[3px] bg-[#802424] z-[5]"
            style={{ left: `${barWidth}px`, width: `${extensionWidth}px` }}
          />
        )}

        {/* === Single bar for nivel 2 (sub-partida) — lighter === */}
        {item.level === 2 && (
          <div className="flex flex-col gap-0">
            <div className="h-[3px] w-full bg-gray-100 rounded-none overflow-hidden">
              <div
                className="h-full bg-gray-300 rounded-none transition-all"
                style={{ width: `${Math.min(avanceReal, 100)}%` }}
              />
            </div>

            <span className="text-[9px] text-gray-300 px-1 block whitespace-nowrap">
              {item.partida}
            </span>


          </div>
        )}

        {/* === Milestone markers (only for nivel 0) === */}
        {item.level === 0 && anticipoPx != null && (
          <div
            className="absolute top-0 z-20 h-full cursor-pointer"
            style={{ left: `${anticipoPx - startPx}px` }}
            onClick={(e) => { e.stopPropagation(); setShowAnticipo(!showAnticipo); }}
          >
            <div className="flex space-x-0.5 h-full">
              <div
                className={cn(
                  "px-0.5 py-0.5 text-[11px] shadow-sm cursor-pointer whitespace-nowrap h-full",
                  "bg-[#AFAEA2] text-white flex flex-row gap-0.5 items-center"
                )}
              >
              </div>
              {showAnticipo && (
                <div className="flex flex-col">
                  <div className="flex bg-[#AFAEA2] px-1.5 py-0.5 text-[11px] cursor-default whitespace-nowrap text-white flex-row gap-0.5 items-center h-1/2">
                    <span>Anticipo</span>
                    <Check className="inline text-white" size={12} />
                  </div>
                  <div className="block text-[11px] bg-[#F2F2F2] px-1 py-0.5 text-[#5A5A50] h-1/2">
                    {schedule?.anticipo_porcentaje}% - { }
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {item.level === 0 && suministroPx != null && (
          <div
            className="absolute top-0 z-20 h-full cursor-pointer"
            style={{ left: `${suministroPx - startPx}px` }}
            onClick={(e) => { e.stopPropagation(); setShowSuministro(!showSuministro); }}
          >
            <div className="flex space-x-0.5 h-full">
              <div
                className={cn(
                  "px-0.5 py-0.5 text-[11px] shadow-sm cursor-pointer whitespace-nowrap h-full",
                  "bg-[#C46B34B3] text-white flex flex-row gap-0.5 items-center"
                )}
              >
              </div>
              {showSuministro && (
                <div
                  className={cn(
                    "flex flex-col space-y-0.5 h-full",
                  )}
                >
                  <div className="bg-[#C46B34B3] px-1.5 py-0.5 text-[11px] cursor-default whitespace-nowrap text-white flex flex-row gap-0.5 items-center">
                    Suministro
                    <Check className="inline" size={12} />
                  </div>
                  <div className="block text-[11px] bg-[#F2F2F2] px-1 py-0.5 text-[#5A5A50]">
                    {schedule?.suministro_fecha}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* === Comentario bars (blue) for nivel 0 and nivel 1 === */}
        {(item.level === 0 || item.level === 1) && item.comentarios && item.comentarios.length > 0 && (
          <>
            {item.comentarios.map((c) => {
              const cStart = parseDate(c.fecha_inicio);
              const cEnd = parseDate(c.fecha_fin);
              if (!cStart || !cEnd) return null;
              const cStartPx = dateToPixel(cStart, columnWidth, timelineMonths) - startPx;
              const cEndPx = dateToPixel(cEnd, columnWidth, timelineMonths) - startPx;
              const cWidth = Math.max(cEndPx - cStartPx, 6);
              return (
                <div
                  key={c._id}
                  className="absolute z-20 h-full top-0 bottom-0 cursor-pointer"
                  style={{
                    left: `${cStartPx}px`,
                    top: item.level === 0 ? '0px' : '0px',
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpandedComentarios((prev) => {
                      const next = new Set(prev);
                      if (next.has(c._id)) next.delete(c._id);
                      else next.add(c._id);
                      return next;
                    });
                  }}
                >
                  {/* BAR */}
                  <div className="flex space-x-0.5 h-full">
                    {/* BAR COLOR */}
                    <div className="px-0.5 py-0.5 bg-[#3B82F6] h-full" />
                    {/* BAR TEXT (SHOW ONLY ON CLICK) */}
                    {expandedComentarios.has(c._id) && (
                      <div className="flex flex-col">
                        <div
                          className="bg-[#3B82F6] px-1.5 py-0.5 text-[10px] cursor-default whitespace-nowrap text-white flex items-center gap-0.5"
                          style={{ minWidth: `${cWidth}px` }}
                        >
                          <MessageSquare className="inline" size={10} />
                          <span className="truncate max-w-[120px]">{c.comentario}</span>
                        </div>
                        <div className="text-[9px] bg-[#EFF6FF] px-1 py-0.5 text-[#3B82F6] whitespace-nowrap h-full flex items-center">
                          {c.fecha_inicio} → {c.fecha_fin}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </>
        )}

        {/* Hover tooltip */}
        {isHovered && item.level === 0 && (
          <div className="absolute -bottom-8 left-0 flex gap-1.5 text-[10px] z-30 pointer-events-none">
            <div className="bg-[#1A5D21] text-white px-1.5 py-0.5 rounded shadow whitespace-nowrap">
              Avance: {Math.round(avanceReal)}%
            </div>
            <div className="bg-[#4CC684] text-white px-1.5 py-0.5 rounded shadow whitespace-nowrap">
              Financiero: {financiero}%
            </div>
          </div>
        )}
      </div>
    </div>
  );
}