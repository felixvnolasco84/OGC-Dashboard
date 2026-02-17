import { useState } from "react";
import { cn } from "@/lib/utils";
import { type ProgramaItem, parseDate } from "./programa-obra-types";
import { Check } from "lucide-react";

// ============================================================
// Helpers
// ============================================================

/** Convert a Date to pixel position within a year timeline */
function dateToPixel(date: Date, year: number, columnWidth: number): number {
  if (date.getFullYear() !== year) {
    // Clamp to year boundaries
    if (date.getFullYear() < year) return 0;
    return 12 * columnWidth;
  }
  const month = date.getMonth();
  const day = date.getDate();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const fraction = (day - 1) / daysInMonth;
  return month * columnWidth + fraction * columnWidth;
}

// ============================================================
// Component
// ============================================================

type Props = {
  item: ProgramaItem;
  year: number;
  columnWidth: number;
};

export default function ProgramaObraGanttItem({ item, year, columnWidth }: Props) {
  const [isHovered, setIsHovered] = useState(false);

  // Only nivel 0 items have schedule data with dates
  const schedule = item.schedule;

  // Parse dates
  const startDate = parseDate(schedule?.fecha_inicio);
  const endDate = parseDate(schedule?.fecha_fin);
  const anticipoDate = parseDate(schedule?.anticipo_fecha);
  const suministroDate = parseDate(schedule?.suministro_fecha);

  // If no schedule dates, don't render a bar
  if (!startDate || !endDate) return null;

  const startPx = dateToPixel(startDate, year, columnWidth);
  const endPx = dateToPixel(endDate, year, columnWidth);
  const barWidth = Math.max(endPx - startPx, 20);

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
  const anticipoPx = anticipoDate ? dateToPixel(anticipoDate, year, columnWidth) : null;
  const suministroPx = suministroDate ? dateToPixel(suministroDate, year, columnWidth) : null;

  // For nivel 1 (familia) and nivel 2 (sub-partida), inherit parent schedule
  // They render under the parent's bar range. For now, they span the same range
  // but could be offset in the future.

  return (
    <div
      className="absolute top-0 bottom-0 flex items-center z-10"
      style={{
        left: `${startPx}px`,
        width: `${barWidth}px`,
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="w-full relative">
        {/* === Dual bar for nivel 0 (partida) === */}
        {item.level === 0 && (
          <div className="flex flex-col gap-0">
            {/* Dark green - Avance Real */}
            <div className="h-2.5 w-full bg-[#bacabb] rounded-t-none overflow-hidden relative">
              <div
                className={cn(
                  "h-full rounded-t-none transition-all",
                  isLateStart ? "bg-red-500" : "bg-green-700"
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
            <span className="text-[11px] text-[#282822] bg-gray-100 px-2.5 py-1.5 truncate block mt-0 text-left">
              {item.partida}
            </span>
          </div>
        )}

        {/* === Single bar for nivel 1 (familia) === */}
        {item.level === 1 && (
          <div className="flex flex-col gap-0">
            <div className="h-[3px] w-full bg-[#9eb9a1] rounded-none overflow-hidden relative">
              <div
                className="h-full bg-[#417847] rounded-none transition-all"
                style={{ width: `${Math.min(avanceReal, 100)}%` }}
              />
            </div>
            <span className="text-[10px] text-gray-400 px-1 truncate block text-left">
              {item.partida}
            </span>
          </div>
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
            <span className="text-[9px] text-gray-300 px-1 truncate block">
              {item.partida}
            </span>
          </div>
        )}

        {/* === Milestone markers (only for nivel 0) === */}
        {item.level === 0 && anticipoPx != null && (
          <div
            className="absolute -top-1 z-20"
            style={{ left: `${anticipoPx - startPx}px` }}
          >
            <div
              className={cn(
                "px-1.5 py-0.5 text-[11px] font-medium rounded-sm shadow-sm cursor-default whitespace-nowrap",
                "bg-[#AFAEA2] text-white flex flex-row gap-0.5 items-center"
              )}
            >
              Anticipo {schedule?.anticipo_porcentaje ? `${schedule.anticipo_porcentaje}%` : ""}
              <Check className="inline text-[#C3C2B9]" size={12} />
            </div>
          </div>
        )}

        {item.level === 0 && suministroPx != null && (
          <div
            className="absolute -top-1 z-20"
            style={{ left: `${suministroPx - startPx}px` }}
          >
            <div
              className={cn(
                "flex flex-col space-y-0.5",
              )}
            >
              <div className="bg-[#C46B34B3] px-1.5 py-0.5 text-[11px] font-medium cursor-default whitespace-nowrap text-white flex flex-row gap-0.5 items-center rounded-sm">
                Suministro
                <Check className="inline" size={12} />
              </div>
              <span className="block text-[11px] bg-[#F2F2F2] px-1 py-0.5 text-[#5A5A50] rounded-sm">
                {schedule?.suministro_fecha}
              </span>
            </div>
          </div>
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