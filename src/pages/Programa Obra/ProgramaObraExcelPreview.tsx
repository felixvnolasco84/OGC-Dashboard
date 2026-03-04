import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight, AlertTriangle, Loader2 } from "lucide-react";
import { parseDate } from "./programa-obra-types";

// ============================================================
// Types
// ============================================================

export type ExcelRow = {
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
};

export type ExcelPartida = {
  partida: string;
  fecha_inicio?: string;
  fecha_fin?: string;
  anticipo_fecha?: string;
  anticipo_porcentaje?: number;
  suministro_fecha?: string;
  finiquito_fecha?: string;
  finiquito_porcentaje?: number;
  peso?: number;
  children?: {
    nivel: number;
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
  }[];
};

type DateConflict = {
  partidaName: string;
  childName: string;
  partidaEndDate: string;
  childEndDate: string;
  /** Index of the partida in the parsed data */
  partidaIndex: number;
  /** Index of the child within the partida's children array */
  childIndex: number;
};

/** "child" = use child date (extend parent), "parent" = use parent date (truncate child) */
type ConflictResolution = "child" | "parent";

type Props = {
  open: boolean;
  parsedData: ExcelPartida[];
  onConfirm: (rows: ExcelRow[]) => void;
  onCancel: () => void;
  uploading: boolean;
};

// ============================================================
// Helpers
// ============================================================

function formatDateStr(dateStr: string | undefined): string {
  if (!dateStr) return "—";
  return dateStr;
}

function dateAfter(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const da = parseDate(a);
  const db = parseDate(b);
  if (!da || !db) return false;
  return da.getTime() > db.getTime();
}

// ============================================================
// Component
// ============================================================

export default function ProgramaObraExcelPreview({
  open,
  parsedData,
  onConfirm,
  onCancel,
  uploading,
}: Props) {
  const [expandedPartidas, setExpandedPartidas] = useState<Set<number>>(
    () => new Set(parsedData.map((_, i) => i))
  );

  // Detect date conflicts
  const conflicts = useMemo<DateConflict[]>(() => {
    const result: DateConflict[] = [];
    parsedData.forEach((p, pi) => {
      if (!p.fecha_fin) return;
      p.children?.forEach((child, ci) => {
        if (child.fecha_fin && dateAfter(child.fecha_fin, p.fecha_fin)) {
          result.push({
            partidaName: p.partida,
            childName: child.familia || child.subpartida || `Hijo ${ci + 1}`,
            partidaEndDate: p.fecha_fin!,
            childEndDate: child.fecha_fin,
            partidaIndex: pi,
            childIndex: ci,
          });
        }
      });
    });
    return result;
  }, [parsedData]);

  // Resolution choices — key: "partidaIdx-childIdx"
  const [resolutions, setResolutions] = useState<Record<string, ConflictResolution>>({});

  const allConflictsResolved = conflicts.length === 0 || conflicts.every(
    (c) => resolutions[`${c.partidaIndex}-${c.childIndex}`] != null
  );

  const togglePartida = (idx: number) => {
    setExpandedPartidas((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const setResolution = (partidaIdx: number, childIdx: number, value: ConflictResolution) => {
    setResolutions((prev) => ({
      ...prev,
      [`${partidaIdx}-${childIdx}`]: value,
    }));
  };

  // Build the final rows applying date resolutions
  const handleConfirm = () => {
    const adjustedData = parsedData.map((p, pi) => ({
      ...p,
      fecha_fin: p.fecha_fin,
      children: p.children?.map((child, ci) => {
        const key = `${pi}-${ci}`;
        const resolution = resolutions[key];
        if (!resolution) return { ...child };
        if (resolution === "child") {
          // Child date wins — parent will be extended (handled below)
          return { ...child };
        }
        // Parent date wins — truncate child
        return { ...child, fecha_fin: p.fecha_fin };
      }),
    }));

    // For "child" resolutions, extend the parent's fecha_fin to the max child date
    for (const conflict of conflicts) {
      const key = `${conflict.partidaIndex}-${conflict.childIndex}`;
      if (resolutions[key] === "child") {
        const parentData = adjustedData[conflict.partidaIndex];
        const parentEnd = parseDate(parentData.fecha_fin);
        const childEnd = parseDate(conflict.childEndDate);
        if (childEnd && (!parentEnd || childEnd > parentEnd)) {
          // Format as DD/MM/YYYY
          const dd = String(childEnd.getDate()).padStart(2, "0");
          const mm = String(childEnd.getMonth() + 1).padStart(2, "0");
          const yyyy = childEnd.getFullYear();
          adjustedData[conflict.partidaIndex].fecha_fin = `${dd}/${mm}/${yyyy}`;
        }
      }
    }

    // Build rows for bulk upsert
    const rows: ExcelRow[] = [];
    for (const p of adjustedData) {
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

    onConfirm(rows);
  };

  // Check if a specific child has a conflict
  const getConflictForChild = (partidaIdx: number, childIdx: number): DateConflict | undefined =>
    conflicts.find((c) => c.partidaIndex === partidaIdx && c.childIndex === childIdx);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Vista previa de datos del Excel</DialogTitle>
          <DialogDescription>
            Revisa los datos antes de cargarlos. {conflicts.length > 0 && (
              <span className="text-amber-600 font-medium">
                Se encontraron {conflicts.length} conflicto{conflicts.length > 1 ? "s" : ""} de fechas que requieren tu atención.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Conflicts summary */}
        {conflicts.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-sm px-4 py-3 space-y-3">
            <div className="flex items-center gap-2 text-amber-700 text-sm font-medium">
              <AlertTriangle className="h-4 w-4" />
              Conflictos de fecha fin
            </div>
            <p className="text-xs text-amber-600">
              Los siguientes elementos hijo terminan después de su partida padre.
              Selecciona qué fecha mantener para cada conflicto.
            </p>
            <div className="space-y-3">
              {conflicts.map((conflict) => {
                const key = `${conflict.partidaIndex}-${conflict.childIndex}`;
                const currentResolution = resolutions[key];
                return (
                  <div
                    key={key}
                    className={cn(
                      "bg-white border rounded-sm p-3 space-y-2",
                      currentResolution ? "border-green-300" : "border-amber-300"
                    )}
                  >
                    <div className="text-xs text-gray-700">
                      <span className="font-medium">{conflict.childName}</span>
                      <span className="text-gray-400"> (en </span>
                      <span className="font-medium">{conflict.partidaName}</span>
                      <span className="text-gray-400">)</span>
                    </div>
                    <RadioGroup
                      value={currentResolution || ""}
                      onValueChange={(v) =>
                        setResolution(conflict.partidaIndex, conflict.childIndex, v as ConflictResolution)
                      }
                      className="flex flex-col gap-2"
                    >
                      <label className="flex items-center gap-2 cursor-pointer">
                        <RadioGroupItem value="child" />
                        <span className="text-xs">
                          Usar fecha del hijo:{" "}
                          <span className="font-medium text-amber-700">{formatDateStr(conflict.childEndDate)}</span>
                          <span className="text-gray-400"> — la partida padre se extenderá a esta fecha</span>
                        </span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <RadioGroupItem value="parent" />
                        <span className="text-xs">
                          Usar fecha de la partida:{" "}
                          <span className="font-medium text-blue-700">{formatDateStr(conflict.partidaEndDate)}</span>
                          <span className="text-gray-400"> — el hijo se ajustará a esta fecha</span>
                        </span>
                      </label>
                    </RadioGroup>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Data table preview */}
        <div className="flex-1 overflow-auto border rounded-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr className="border-b">
                <th className="text-left px-3 py-2 font-medium text-gray-600 text-xs w-[280px]">Nombre</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600 text-xs w-[100px]">Inicio</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600 text-xs w-[100px]">Fin</th>
                <th className="text-right px-3 py-2 font-medium text-gray-600 text-xs w-[70px]">Peso</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600 text-xs w-[100px]">Anticipo</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600 text-xs w-[100px]">Suministro</th>
              </tr>
            </thead>
            <tbody>
              {parsedData.map((partida, pi) => {
                const isExpanded = expandedPartidas.has(pi);
                const hasChildren = (partida.children?.length ?? 0) > 0;
                return (
                  <>
                    {/* Partida row */}
                    <tr
                      key={`p-${pi}`}
                      className="border-b bg-white hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          {hasChildren ? (
                            <button
                              onClick={() => togglePartida(pi)}
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
                          <span className="font-medium text-gray-900 truncate" title={partida.partida}>
                            {partida.partida}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-gray-600 text-xs">{formatDateStr(partida.fecha_inicio)}</td>
                      <td className="px-3 py-2 text-gray-600 text-xs">{formatDateStr(partida.fecha_fin)}</td>
                      <td className="px-3 py-2 text-gray-600 text-xs text-right">
                        {partida.peso != null ? `${partida.peso}%` : "—"}
                      </td>
                      <td className="px-3 py-2 text-gray-600 text-xs">{formatDateStr(partida.anticipo_fecha)}</td>
                      <td className="px-3 py-2 text-gray-600 text-xs">{formatDateStr(partida.suministro_fecha)}</td>
                    </tr>

                    {/* Child rows */}
                    {isExpanded &&
                      partida.children?.map((child, ci) => {
                        const conflict = getConflictForChild(pi, ci);
                        const resolution = conflict
                          ? resolutions[`${pi}-${ci}`]
                          : undefined;
                        const hasConflict = !!conflict;
                        return (
                          <tr
                            key={`c-${pi}-${ci}`}
                            className={cn(
                              "border-b transition-colors",
                              hasConflict && !resolution && "bg-amber-50/60",
                              hasConflict && resolution && "bg-green-50/40",
                              !hasConflict && "bg-gray-50/50 hover:bg-gray-50"
                            )}
                          >
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-1.5 pl-6">
                                <span className="text-gray-600 truncate" title={child.familia || child.subpartida}>
                                  {child.familia || child.subpartida || "—"}
                                </span>
                                {hasConflict && !resolution && (
                                  <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2 text-gray-500 text-xs">
                              {formatDateStr(child.fecha_inicio)}
                            </td>
                            <td className={cn(
                              "px-3 py-2 text-xs",
                              hasConflict && !resolution && "text-amber-700 font-medium",
                              hasConflict && resolution === "parent" && "text-blue-600 line-through",
                              hasConflict && resolution === "child" && "text-amber-700 font-medium",
                              !hasConflict && "text-gray-500"
                            )}>
                              {formatDateStr(child.fecha_fin)}
                              {hasConflict && resolution === "parent" && (
                                <span className="ml-1 text-blue-600 no-underline font-medium" style={{ textDecoration: 'none' }}>
                                  → {formatDateStr(partida.fecha_fin)}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-gray-500 text-xs text-right">
                              {child.peso != null ? `${child.peso}%` : "—"}
                            </td>
                            <td className="px-3 py-2 text-gray-500 text-xs">
                              {formatDateStr(child.anticipo_fecha)}
                            </td>
                            <td className="px-3 py-2 text-gray-500 text-xs">
                              {formatDateStr(child.suministro_fecha)}
                            </td>
                          </tr>
                        );
                      })}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Summary */}
        <div className="text-xs text-gray-500">
          {parsedData.length} partida{parsedData.length !== 1 ? "s" : ""} ·{" "}
          {parsedData.reduce((s, p) => s + (p.children?.length ?? 0), 0)} elementos hijo
        </div>

        <DialogFooter>
          <Button variant="outline" className="rounded-none" onClick={onCancel} disabled={uploading}>
            Cancelar
          </Button>
          <Button
            className="rounded-none"
            onClick={handleConfirm}
            disabled={!allConflictsResolved || uploading}
          >
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Cargando...
              </>
            ) : (
              "Confirmar y cargar"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
