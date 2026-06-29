import { useMemo, useState, type ChangeEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Id } from "../../../convex/_generated/dataModel";

type PnlTab = "pnl" | "wip" | "profitability";
type PnlRowType = "section" | "line" | "subtotal" | "metric";

type PnlMonth = {
  key: string;
  label: string;
};

type PnlRow = {
  label: string;
  type: PnlRowType;
  values?: number[];
  percentages?: number[];
};

type ProfitabilityProject = {
  id: string;
  nombre: string;
  status?: string;
  honorarios: number;
  indirectos: number;
  ingresosOgc: number;
  costosOgc: number;
  costosEstructuraOgc: number;
  costosEstructuraMasIndirectos: number;
  margen: number;
  margenPercent: number;
  ebitda: number;
  ebitdaMargin: number;
  wip: {
    presupuesto: number;
    costoReal: number;
    avance: number;
    valorGanado: number;
    restante: number;
    eac: number;
    varianza: number;
    cpi: number;
    pagado: number;
    saldo: number;
    runway: number;
    averageWeeklyExpense: number;
  };
};

type ProfitabilityStructureRow = {
  key: string;
  label: string;
  amount: number;
};

type PnlMonthlyMovement = {
  honorarios: number;
  indirectos: number;
  structureBreakdown: Record<string, number>;
};

type ProfitabilitySummary = {
  projects: ProfitabilityProject[];
  totals: {
    honorarios: number;
    indirectos: number;
    ingresosOgc: number;
    costosOgc: number;
    costosEstructuraOgc: number;
    costosEstructuraMasIndirectos: number;
    margen: number;
    margenPercent: number;
    ebitda: number;
    ebitdaMargin: number;
    currentMonthMargen: number;
    currentMonthMargenPercent: number;
    activeProjects: number;
    structureBreakdown: ProfitabilityStructureRow[];
    wip: {
      presupuesto: number;
      costoReal: number;
      pagado: number;
      saldo: number;
      ejecutadoPercent: number;
      backlogPendiente: number;
    };
  };
};

type PnlSummary = {
  totals: {
    honorarios: number;
    indirectos: number;
    ingresosOgc: number;
    costosEstructuraOgc: number;
    ebitda: number;
    estructuraPercent: number;
    ebitdaMargin: number;
    activeProjects: number;
    structureBreakdown: ProfitabilityStructureRow[];
    hasOgcIncomeMovements?: boolean;
    hasOgcStructureMovements?: boolean;
  };
  monthlyOgcMovements?: Record<string, PnlMonthlyMovement>;
  structureGroups?: Array<{ key: string; label: string }>;
};

type OgcUploadMovement = {
  rowIndex: number;
  tipo: "ingreso" | "costo_estructura";
  categoria: string;
  monto: number;
  fecha: string;
  proyecto_nombre?: string;
  descripcion?: string;
  moneda: string;
};

type OgcUploadResult = {
  success: boolean;
  message?: string;
  fileName?: string;
  summary?: {
    totalRows: number;
    validRows: number;
    errors: number;
    totalAmount: number;
    ingresos: number;
    costosEstructura: number;
  };
  movimientos?: OgcUploadMovement[];
  errors?: Array<{ row: number; error: string }>;
};

type DesarrolloOption = {
  _id: Id<"desarrollos">;
  nombre: string;
};

const PNL_TABS: Array<{ id: PnlTab; label: string }> = [
  { id: "pnl", label: "P&L Mensual" },
  { id: "wip", label: "Work in progress" },
  { id: "profitability", label: "Project profitability" },
];

const MONTH_LABELS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun"];
const DETAIL_TEXT_CLASS = "text-[#ACACAA]";
const SOFT_HIGHLIGHT_CLASS = "bg-[#FBFAF2]";
const STRONG_HIGHLIGHT_CLASS = "bg-[#F7F5E6]";
const DEFAULT_STRUCTURE_GROUPS = [
  { key: "nomina", label: "NOMINA" },
  { key: "cargas_sociales", label: "CARGAS SOCIALES ADMN (IMSS, ISN, INFONAVIT)" },
  { key: "transporte", label: "TRANSPORTE" },
  { key: "renta", label: "RENTA" },
  { key: "otros", label: "OTROS" },
  { key: "disp_honorarios", label: "DISP HONORARIOS" },
];
const OGC_UPLOAD_ENDPOINTS = [
  "https://ogc-excel-reader.vercel.app/upload/ogc-transactions",
  "http://localhost:3000/upload/ogc-transactions",
];

const safeNumber = (value: unknown) => {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
};

const safeDivide = (value: number, total: number) => {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total === 0) return 0;
  return value / total;
};

const normalizeLookupText = (value?: string) => {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
};

const formatNumber = (amount: number) => {
  const rounded = Math.round(Math.abs(safeNumber(amount)));
  return new Intl.NumberFormat("es-MX").format(rounded);
};

const formatPnlValue = (amount?: number) => {
  if (amount === undefined || !Number.isFinite(amount)) return "-";
  if (amount < 0) return `(${formatNumber(amount)})`;
  return formatNumber(amount);
};

const formatPercent = (value?: number) => {
  if (value === undefined || !Number.isFinite(value)) return "0%";
  return `${(value * 100).toFixed(1)}%`;
};

const formatMetricCurrency = (amount: number) => {
  const absolute = Math.abs(safeNumber(amount));
  const sign = amount < 0 ? "-" : "";

  if (absolute >= 1_000_000) {
    return `${sign}$${(absolute / 1_000_000).toFixed(1)}M`;
  }

  if (absolute >= 1_000) {
    return `${sign}$${(absolute / 1_000).toFixed(1)}k`;
  }

  return `${sign}$${formatNumber(absolute)}`;
};

const formatTableCurrency = (amount?: number) => {
  if (amount === undefined || !Number.isFinite(amount)) return "-";
  return formatMetricCurrency(amount);
};

const formatAccountingCurrency = (amount?: number) => {
  if (amount === undefined || !Number.isFinite(amount)) return "-";
  if (amount < 0) return `(${formatMetricCurrency(Math.abs(amount))})`;
  return formatMetricCurrency(amount);
};

const formatWholePercent = (value?: number) => {
  if (value === undefined || !Number.isFinite(value)) return "0%";
  return `${Math.round(value * 100)}%`;
};

const formatMultiplier = (value?: number) => {
  if (value === undefined || !Number.isFinite(value) || value === 0) return "-";
  return `${value.toFixed(2)}x`;
};

const formatRunway = (value?: number) => {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return "-";
  return `${value.toFixed(1)} sem`;
};

const formatFileSize = (bytes: number) => {
  if (bytes === 0) return "0 Bytes";
  const units = ["Bytes", "KB", "MB"];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** unitIndex).toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
};

const buildMonths = (): PnlMonth[] => {
  const year = new Date().getFullYear();
  return MONTH_LABELS.map((month, index) => ({
    key: `${year}-${index + 1}`,
    label: `${month} ${year}`,
  }));
};

const buildMonthlyRows = (
  months: PnlMonth[],
  honorariosYtd: number,
  indirectosYtd: number,
  estructuraYtd: number,
  pnlSummary?: PnlSummary
): PnlRow[] => {
  const monthCount = months.length;
  const monthlyMovements = pnlSummary?.monthlyOgcMovements || {};
  const structureGroups = pnlSummary?.structureGroups?.length ? pnlSummary.structureGroups : DEFAULT_STRUCTURE_GROUPS;
  const hasIncomeMovements = Boolean(pnlSummary?.totals.hasOgcIncomeMovements);
  const hasStructureMovements = Boolean(pnlSummary?.totals.hasOgcStructureMovements);
  const movementHonorarios = months.reduce((sum, month) => sum + safeNumber(monthlyMovements[month.key]?.honorarios), 0);
  const movementIndirectos = months.reduce((sum, month) => sum + safeNumber(monthlyMovements[month.key]?.indirectos), 0);
  const legacyHonorarios = Math.max(honorariosYtd - movementHonorarios, 0);
  const legacyIndirectos = Math.max(indirectosYtd - movementIndirectos, 0);

  const monthlyHonorarios = months.map((month) => {
    return safeNumber(monthlyMovements[month.key]?.honorarios) + (hasIncomeMovements ? legacyHonorarios / monthCount : honorariosYtd / monthCount);
  });
  const monthlyIndirectos = months.map((month) => {
    return safeNumber(monthlyMovements[month.key]?.indirectos) + (hasIncomeMovements ? legacyIndirectos / monthCount : indirectosYtd / monthCount);
  });
  const monthlyIngresos = monthlyHonorarios.map((value, index) => value + monthlyIndirectos[index]);

  const fallbackBreakdown = pnlSummary?.totals.structureBreakdown?.length
    ? pnlSummary.totals.structureBreakdown
    : structureGroups.map((group, index) => {
        const ratios = [0.4, 0.1, 0.21, 0.1, 0.15, 0.04];
        return { ...group, amount: estructuraYtd * (ratios[index] || 0) };
      });
  const costRows = structureGroups.map((group) => {
    const fallbackAmount = fallbackBreakdown.find((row) => row.key === group.key)?.amount || 0;
    return months.map((month) => {
      const movementAmount = safeNumber(monthlyMovements[month.key]?.structureBreakdown?.[group.key]);
      const fallbackMonthly = hasStructureMovements ? 0 : fallbackAmount / monthCount;
      return -Math.abs(movementAmount + fallbackMonthly);
    });
  });
  const monthlyEstructura = months.map((_, index) => costRows.reduce((sum, row) => sum + safeNumber(row[index]), 0));
  const ebitdaValues = monthlyIngresos.map((value, index) => value + monthlyEstructura[index]);
  const taxRows = [
    ebitdaValues.map((value) => -Math.max(value, 0) * 0.04),
    ebitdaValues.map((value) => -Math.max(value, 0) * 0.01),
  ];
  const netValues = ebitdaValues.map((value, index) => value + taxRows[0][index] + taxRows[1][index]);
  const ebitdaPercentages = ebitdaValues.map((value, index) => safeDivide(value, monthlyIngresos[index]));
  const netPercentages = netValues.map((value, index) => safeDivide(value, monthlyIngresos[index]));

  return [
    { label: "INGRESOS OGC", type: "section" },
    { label: "HONORARIOS", type: "line", values: monthlyHonorarios },
    { label: "INDIRECTOS", type: "line", values: monthlyIndirectos },
    { label: "TOTAL INGRESOS", type: "subtotal", values: monthlyIngresos },
    { label: "COSTO ESTRUCTURA", type: "section" },
    ...structureGroups.map((group, index) => ({ label: group.label, type: "line" as const, values: costRows[index] })),
    { label: "TOTAL ESTRUCTURA", type: "subtotal", values: monthlyEstructura },
    { label: "EBITDA", type: "metric", values: ebitdaValues, percentages: ebitdaPercentages },
    { label: "IMPUESTOS SOBRE RESULTADO", type: "section" },
    { label: "ISR CORPORATIVO", type: "line", values: taxRows[0] },
    { label: "PTU", type: "line", values: taxRows[1] },
    { label: "UTILIDAD NETA", type: "metric", values: netValues, percentages: netPercentages },
    { label: "INFORMATIVO", type: "section" },
    { label: "CARGA SOCIAL OBRA (SIROC - RECUPERABLE)", type: "line", values: taxRows[0] },
    { label: "FLUJO FISCAL (IVA + RETENCIONES)", type: "line", values: taxRows[1] },
  ];
};

function MonthlyPnlTable({
  months,
  rows,
  highlightedMonthIndex,
}: {
  months: PnlMonth[];
  rows: PnlRow[];
  highlightedMonthIndex: number;
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <h2 className="text-lg text-gray-900">ESTADO DE RESULTADOS</h2>
        <p className="text-sm text-gray-400">Ingresos reales hasta junio - julio proyectado</p>
      </div>

      <div className="overflow-x-auto border border-gray-200 bg-white">
        <table className="w-full min-w-[980px] border-collapse text-left">
          <thead>
            <tr className="border-b border-gray-200 text-sm text-gray-500">
              <th className="w-[340px] px-8 py-4 font-normal">Concepto</th>
              {months.map((month) => (
                <th key={month.key} className="px-8 py-4 text-center font-normal">
                  {month.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => {
              const isSection = row.type === "section";
              const isSubtotal = row.type === "subtotal";
              const isMetric = row.type === "metric";
              const isDetail = row.type === "line";

              return (
                <tr
                  key={`${row.label}-${rowIndex}`}
                  className={cn(
                    "border-b border-gray-200",
                    isSubtotal || isMetric ? "bg-[#FBFAF2]" : "bg-white"
                  )}
                >
                  <td
                    className={cn(
                      "px-8 py-6 align-middle text-base whitespace-nowrap",
                      isSection ? "text-gray-900" : "text-[#ACACAA]",
                      isSubtotal || isMetric ? "text-gray-900" : ""
                    )}
                  >
                    <div className="flex flex-col gap-1">
                      <span>{row.label}</span>
                      {isMetric && <span className="text-sm text-gray-500">%</span>}
                    </div>
                  </td>

                  {months.map((month, monthIndex) => {
                    const value = row.values?.[monthIndex];
                    const percentage = row.percentages?.[monthIndex];
                    const isHighlighted = monthIndex === highlightedMonthIndex;
                    const isIntersection = isHighlighted && (isSubtotal || isMetric);

                    return (
                      <td
                        key={`${row.label}-${month.key}`}
                        className={cn(
                          "px-8 py-6 text-center align-middle text-base",
                          isIntersection ? "bg-[#F7F5E6]" : isHighlighted ? "bg-[#FBFAF2]" : "",
                          isSection ? "text-gray-400" : isDetail ? "text-[#ACACAA]" : "text-gray-900"
                        )}
                      >
                        {!isSection && (
                          <div className="flex flex-col gap-1">
                            <span className={isMetric && safeNumber(value) >= 0 ? "text-[#1A5D21]" : ""}>
                              {formatPnlValue(value)}
                            </span>
                            {isMetric && (
                              <span className="text-sm text-gray-500">{formatPercent(percentage)}</span>
                            )}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function WipMetricCard({
  label,
  value,
  badge,
  valueClassName,
}: {
  label: string;
  value: string;
  badge: string;
  valueClassName?: string;
}) {
  return (
    <div className="space-y-2 text-left">
      <p className="text-sm text-[#777770]">{label}</p>
      <p className={cn("text-4xl text-gray-900", valueClassName)}>{value}</p>
      <Badge variant="secondary" className="text-[10px] font-normal py-1.5 leading-none text-gray-500 rounded-xl border-gray-400">
        {badge}
      </Badge>
    </div>
  );
}

function OgcMovementsUploadDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<OgcUploadResult | null>(null);
  const proyectos = useQuery(api.desarrollos.getAll) as DesarrolloOption[] | undefined;
  const bulkCreateMovements = useMutation(api.ogc_movimientos.bulkCreate);

  const projectLookup = useMemo(() => {
    const lookup = new Map<string, Id<"desarrollos">>();
    proyectos?.forEach((proyecto) => {
      lookup.set(normalizeLookupText(proyecto.nombre), proyecto._id);
    });
    return lookup;
  }, [proyectos]);

  const resetState = () => {
    setFile(null);
    setResult(null);
  };

  const handleClose = (nextOpen: boolean) => {
    if (isProcessing) return;
    if (!nextOpen) resetState();
    onOpenChange(nextOpen);
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    const extension = selectedFile.name.toLowerCase().slice(selectedFile.name.lastIndexOf("."));
    if (![".xlsx", ".xls", ".xlsm"].includes(extension)) {
      toast.error("Archivo invalido", { description: "Sube un Excel .xlsx, .xls o .xlsm." });
      event.target.value = "";
      return;
    }

    setFile(selectedFile);
    setResult(null);
    event.target.value = "";
  };

  const parseFile = async (selectedFile: File) => {
    const formData = new FormData();
    formData.append("file", selectedFile);

    let lastError = "No se pudo procesar el archivo.";
    for (const endpoint of OGC_UPLOAD_ENDPOINTS) {
      try {
        const response = await fetch(endpoint, { method: "POST", body: formData });
        const data = await response.json().catch(() => null);
        if (response.ok && data) return data as OgcUploadResult;
        lastError = data?.message || data?.error || lastError;
      } catch (error) {
        lastError = error instanceof Error ? error.message : lastError;
      }
    }

    throw new Error(lastError);
  };

  const handleUpload = async () => {
    if (!file) {
      toast.error("Selecciona un archivo");
      return;
    }

    if (!proyectos) {
      toast.error("Espera a que carguen las obras");
      return;
    }

    setIsProcessing(true);

    try {
      const parsed = await parseFile(file);
      setResult(parsed);

      if (!parsed.success || !parsed.movimientos?.length) {
        throw new Error(parsed.message || "No se encontraron movimientos validos.");
      }

      const missingProjects = new Set<string>();
      const movimientos = parsed.movimientos.flatMap((movement) => {
        const projectName = normalizeLookupText(movement.proyecto_nombre);
        const proyecto = projectName ? projectLookup.get(projectName) : undefined;

        if (projectName && !proyecto) {
          missingProjects.add(movement.proyecto_nombre || "Sin nombre");
          return [];
        }

        return [{
          tipo: movement.tipo,
          categoria: movement.categoria,
          monto: movement.monto,
          fecha: movement.fecha,
          descripcion: movement.descripcion || undefined,
          moneda: movement.moneda || "MXN",
          proyecto,
          archivo_origen: file.name,
          fila_origen: movement.rowIndex,
        }];
      });

      if (movimientos.length === 0) {
        throw new Error("Ninguna fila coincide con las obras disponibles.");
      }

      const created = await bulkCreateMovements({ movimientos });
      const skipped = missingProjects.size;

      toast.success("Carga OGC completada", {
        description: `${created.created} movimientos guardados${skipped ? `, ${skipped} obras no encontradas` : ""}.`,
      });
      handleClose(false);
    } catch (error) {
      toast.error("Error al cargar movimientos OGC", {
        description: error instanceof Error ? error.message : "Ocurrio un error inesperado.",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-normal">Cargar movimientos OGC</DialogTitle>
          <DialogDescription>
            Sube ingresos y costos de estructura. Las filas con obra se reflejan en rentabilidad; las filas sin obra quedan solo a nivel empresa.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Archivo Excel</Label>
            <div className="border border-dashed border-gray-300 p-6">
              {file ? (
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <FileSpreadsheet className="h-8 w-8 text-[#1A5D21]" />
                    <div className="min-w-0">
                      <p className="truncate text-sm text-gray-900">{file.name}</p>
                      <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
                    </div>
                  </div>
                  <Button type="button" variant="outline" onClick={() => setFile(null)} disabled={isProcessing}>
                    Cambiar
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4 text-center">
                  <Upload className="h-10 w-10 text-gray-400" />
                  <div>
                    <p className="text-sm text-gray-900">Excel con columnas: tipo, categoria, monto, fecha, obra, descripcion</p>
                    <p className="mt-1 text-xs text-gray-500">La obra puede quedar vacia para costos solo de empresa.</p>
                  </div>
                  <Button type="button" variant="outline" onClick={() => document.getElementById("ogc-movements-file")?.click()}>
                    Seleccionar archivo
                  </Button>
                </div>
              )}
              <input
                id="ogc-movements-file"
                type="file"
                accept=".xlsx,.xls,.xlsm"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
          </div>

          {result?.summary && (
            <div className="border border-gray-200 bg-[#FBFAF2] p-4 text-sm text-gray-700">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div>
                  <p className="text-xs text-gray-500">Filas validas</p>
                  <p className="text-lg text-gray-900">{result.summary.validRows}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Ingresos</p>
                  <p className="text-lg text-gray-900">{result.summary.ingresos}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Costos</p>
                  <p className="text-lg text-gray-900">{result.summary.costosEstructura}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Errores</p>
                  <p className="text-lg text-gray-900">{result.summary.errors}</p>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 border-t pt-4">
            <Button type="button" variant="outline" onClick={() => handleClose(false)} disabled={isProcessing}>
              Cancelar
            </Button>
            <Button type="button" onClick={handleUpload} disabled={!file || isProcessing}>
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Procesando...
                </>
              ) : (
                "Cargar movimientos"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function WorkInProgressView({
  summary,
}: {
  summary: ProfitabilitySummary;
}) {
  const totals = summary.totals;
  const activeProjects = summary.projects.filter((project) => project.status !== "Cancelado");

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-10 w-full xl:w-3/4 py-8">
        <WipMetricCard
          label="Backlog total contratado"
          value={formatMetricCurrency(totals.wip.presupuesto)}
          badge={`${totals.activeProjects} obras activas`}
        />
        <WipMetricCard
          label="Costo real acumulado"
          value={formatMetricCurrency(totals.wip.costoReal)}
          badge={`${(totals.wip.ejecutadoPercent * 100).toFixed(0)}% ejecutado`}
        />
        <WipMetricCard
          label="Ingreso facturado total"
          value={formatMetricCurrency(totals.wip.pagado)}
          badge="Cobrado a la fecha"
          valueClassName="text-[#1A5D21]"
        />
        <WipMetricCard
          label="Backlog pendiente"
          value={formatMetricCurrency(totals.wip.backlogPendiente)}
          badge="Por facturar"
        />
      </div>

      <div className="border-t border-[#AFAEA2] pt-6 space-y-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <h2 className="text-lg text-gray-900">OBRAS ACTIVAS - ESTADO AL CORTE</h2>
          <div className="text-left md:text-right">
            <p className="text-sm text-gray-400">Costo real - Saldo y runway de Tesoreria</p>
          </div>
        </div>

        <div className="overflow-x-auto border border-gray-200 bg-white">
          <table className="w-full min-w-[1180px] border-collapse text-left">
            <thead>
              <tr className="border-b border-gray-200 text-sm text-gray-500">
                <th className="w-[240px] px-8 py-4 font-normal">Obra</th>
                <th className="px-8 py-4 text-center font-normal">Presupuesto</th>
                <th className="px-8 py-4 text-center font-normal">Costo real</th>
                <th className="px-8 py-4 text-center font-normal">EAC</th>
                <th className="px-8 py-4 text-center font-normal">Varianza</th>
                <th className="px-8 py-4 text-center font-normal">CPI</th>
                <th className="px-8 py-4 text-center font-normal">Pagado</th>
                <th className="px-8 py-4 text-center font-normal">Saldo</th>
                <th className="px-8 py-4 text-center font-normal">Runway</th>
              </tr>
            </thead>
            <tbody>
              {activeProjects.map((project) => (
                <tr key={project.id} className="border-b border-gray-200 bg-white">
                  <td className="px-8 py-6 align-middle text-base text-gray-900">
                    <span className="block max-w-[240px] truncate">{project.nombre}</span>
                  </td>
                  <td className={cn("px-8 py-6 text-center align-middle text-base", DETAIL_TEXT_CLASS)}>
                    {formatTableCurrency(project.wip.presupuesto)}
                  </td>
                  <td className={cn("px-8 py-6 text-center align-middle text-base", DETAIL_TEXT_CLASS)}>
                    {formatTableCurrency(project.wip.costoReal)}
                  </td>
                  <td className={cn("px-8 py-6 text-center align-middle text-base", DETAIL_TEXT_CLASS)}>
                    {formatTableCurrency(project.wip.eac)}
                  </td>
                  <td className={cn("px-8 py-6 text-center align-middle text-base", project.wip.varianza < 0 ? "text-[#802424]" : "text-gray-900")}>
                    {formatTableCurrency(project.wip.varianza)}
                  </td>
                  <td className="px-8 py-6 text-center align-middle text-base text-gray-900">
                    {formatMultiplier(project.wip.cpi)}
                  </td>
                  <td className={cn("px-8 py-6 text-center align-middle text-base", DETAIL_TEXT_CLASS)}>
                    {formatTableCurrency(project.wip.pagado)}
                  </td>
                  <td className={cn("px-8 py-6 text-center align-middle text-base", project.wip.saldo >= 0 ? "text-[#1A5D21]" : "text-[#802424]")}>
                    {formatTableCurrency(project.wip.saldo)}
                  </td>
                  <td className={cn(SOFT_HIGHLIGHT_CLASS, "px-8 py-6 text-center align-middle text-base text-gray-900")}>
                    {formatRunway(project.wip.runway)}
                  </td>
                </tr>
              ))}

              {activeProjects.length === 0 && (
                <tr className="border-b border-gray-200 bg-white">
                  <td className="px-8 py-6 align-middle text-base text-gray-400" colSpan={9}>
                    No hay obras activas disponibles.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function ProjectProfitabilityView({
  summary,
}: {
  summary: ProfitabilitySummary;
}) {
  const projects = summary.projects;
  const totals = summary.totals;
  const estructuraRows = totals.structureBreakdown.map((row) => ({
    ...row,
    percent: safeDivide(row.amount, totals.costosEstructuraOgc),
  }));
  const honorariosCobrados = totals.honorarios;
  const indirectosCobrados = totals.indirectos;
  const ebitda = totals.ebitda;

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-10 w-full xl:w-3/4 py-8">
        <WipMetricCard
          label="Margen bruto total OGC"
          value={formatMetricCurrency(totals.margen)}
          badge="Desde inicio de anio"
          valueClassName={totals.margen >= 0 ? "text-gray-900" : "text-[#802424]"}
        />
        <WipMetricCard
          label="Margen bruto %"
          value={formatPercent(totals.margenPercent)}
          badge={`${summary.totals.activeProjects} obras activas`}
          valueClassName={totals.margenPercent >= 0 ? "text-gray-900" : "text-[#802424]"}
        />
        <WipMetricCard
          label="Margen mensual actual"
          value={formatMetricCurrency(totals.currentMonthMargen)}
          badge="Mes actual"
          valueClassName={totals.currentMonthMargen >= 0 ? "text-gray-900" : "text-[#802424]"}
        />
        <WipMetricCard
          label="Margen mensual %"
          value={formatPercent(totals.currentMonthMargenPercent)}
          badge="Mes actual"
          valueClassName={totals.currentMonthMargenPercent >= 0 ? "text-gray-900" : "text-[#802424]"}
        />
      </div>

      <div className="border-t border-[#AFAEA2] pt-12 space-y-12">
        <div className="space-y-6">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <h2 className="text-lg text-gray-900">RENTABILIDAD POR OBRA - ACUMULADO AL CORTE</h2>
            <p className="text-sm text-gray-400">Ingresos vs. costos directos</p>
          </div>

          <div className="overflow-x-auto border border-gray-200 bg-white">
            <table className="w-full min-w-[980px] border-collapse text-left">
              <thead>
                <tr className="border-b border-gray-200 text-sm text-gray-500">
                  <th className="w-[420px] px-8 py-4 font-normal">Obra</th>
                  <th className="px-8 py-4 text-center font-normal">Ingresos OGC</th>
                  <th className="px-8 py-4 text-center font-normal">Costos OGC</th>
                  <th className="px-8 py-4 text-center font-normal">Margen</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((project) => (
                  <tr key={project.id} className="border-b border-gray-200 bg-white">
                    <td className="px-8 py-6 align-middle text-base text-gray-900">
                      <span className="block max-w-[360px] truncate">{project.nombre}</span>
                    </td>
                    <td className={cn("px-8 py-6 text-center align-middle text-base", DETAIL_TEXT_CLASS)}>
                      {formatTableCurrency(project.ingresosOgc)}
                    </td>
                    <td className={cn("px-8 py-6 text-center align-middle text-base", DETAIL_TEXT_CLASS)}>
                      {formatAccountingCurrency(-Math.abs(project.costosOgc))}
                  </td>
                  <td className={cn(SOFT_HIGHLIGHT_CLASS, "px-8 py-6 text-center align-middle text-base")}>
                    <div className="flex items-center justify-center gap-8">
                        <span className={project.margen >= 0 ? "text-[#1A5D21]" : "text-[#802424]"}>
                          {formatTableCurrency(project.margen)}
                        </span>
                        <span className={DETAIL_TEXT_CLASS}>{formatWholePercent(project.margenPercent)}</span>
                      </div>
                    </td>
                  </tr>
                ))}

                {projects.length === 0 && (
                  <tr className="border-b border-gray-200 bg-white">
                    <td className="px-8 py-6 align-middle text-base text-gray-400" colSpan={4}>
                      No hay obras disponibles.
                    </td>
                  </tr>
                )}

                <tr className={cn("border-b border-gray-200", SOFT_HIGHLIGHT_CLASS)}>
                  <td className="px-8 py-6 align-middle text-base text-gray-900">TOTAL OGC</td>
                  <td className={cn("px-8 py-6 text-center align-middle text-base", DETAIL_TEXT_CLASS)}>
                    {formatTableCurrency(totals.ingresosOgc)}
                  </td>
                  <td className={cn("px-8 py-6 text-center align-middle text-base", DETAIL_TEXT_CLASS)}>
                    {formatAccountingCurrency(-Math.abs(totals.costosOgc))}
                  </td>
                  <td className={cn(STRONG_HIGHLIGHT_CLASS, "px-8 py-6 text-center align-middle text-base")}>
                    <div className="flex items-center justify-center gap-8">
                      <span className={totals.margen >= 0 ? "text-[#1A5D21]" : "text-[#802424]"}>
                        {formatTableCurrency(totals.margen)}
                      </span>
                      <span className={DETAIL_TEXT_CLASS}>{formatWholePercent(totals.margenPercent)}</span>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-10">
          <div className="space-y-6">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <h2 className="text-lg text-gray-900">COSTO ESTRUCTURA OGC</h2>
              <p className="text-sm text-gray-400">Mes actual</p>
            </div>

            <div className="overflow-x-auto border border-gray-200 bg-white">
              <table className="w-full min-w-[620px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-gray-200 text-sm text-gray-500">
                    <th className="px-8 py-4 font-normal">Categoria</th>
                    <th className="px-8 py-4 text-center font-normal">Monto</th>
                    <th className="px-8 py-4 text-center font-normal">% estructura</th>
                  </tr>
                </thead>
                <tbody>
                  {estructuraRows.map((row) => (
                    <tr key={row.label} className="border-b border-gray-200 bg-white">
                      <td className="px-8 py-6 align-middle text-base text-gray-900">{row.label}</td>
                      <td className={cn("px-8 py-6 text-center align-middle text-base", DETAIL_TEXT_CLASS)}>
                        {formatTableCurrency(row.amount)}
                      </td>
                      <td className={cn("px-8 py-6 text-center align-middle text-base", DETAIL_TEXT_CLASS)}>
                        {formatWholePercent(row.percent)}
                      </td>
                    </tr>
                  ))}
                  <tr className={cn("border-b border-gray-200", SOFT_HIGHLIGHT_CLASS)}>
                    <td className="px-8 py-6 align-middle text-base text-gray-900">TOTAL ESTRUCTURA</td>
                    <td className={cn(STRONG_HIGHLIGHT_CLASS, "px-8 py-6 text-center align-middle text-base", DETAIL_TEXT_CLASS)}>
                      {formatTableCurrency(totals.costosEstructuraOgc)}
                    </td>
                    <td className={cn(STRONG_HIGHLIGHT_CLASS, "px-8 py-6 text-center align-middle text-base", DETAIL_TEXT_CLASS)}>
                      {formatWholePercent(safeDivide(totals.costosEstructuraOgc, totals.ingresosOgc))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-6">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <h2 className="text-lg text-gray-900">EBITDA OGC</h2>
              <p className="text-sm text-gray-400">Mes actual</p>
            </div>

            <div className="overflow-x-auto border border-gray-200 bg-white">
              <table className="w-full min-w-[620px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-gray-200 text-sm text-gray-500">
                    <th className="px-8 py-4 font-normal">Concepto</th>
                    <th className="px-8 py-4 text-center font-normal">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-gray-200 bg-white">
                    <td className="px-8 py-6 align-middle text-base text-gray-900">HONORARIOS COBRADOS</td>
                    <td className={cn("px-8 py-6 text-center align-middle text-base", DETAIL_TEXT_CLASS)}>
                      {formatTableCurrency(honorariosCobrados)}
                    </td>
                  </tr>
                  <tr className="border-b border-gray-200 bg-white">
                    <td className="px-8 py-6 align-middle text-base text-gray-900">INDIRECTOS COBRADOS</td>
                    <td className={cn("px-8 py-6 text-center align-middle text-base", DETAIL_TEXT_CLASS)}>
                      {formatTableCurrency(indirectosCobrados)}
                    </td>
                  </tr>
                  <tr className={cn("border-b border-gray-200", SOFT_HIGHLIGHT_CLASS)}>
                    <td className="px-8 py-6 align-middle text-base text-gray-900">INGRESOS OGC</td>
                    <td className={cn(STRONG_HIGHLIGHT_CLASS, "px-8 py-6 text-center align-middle text-base", DETAIL_TEXT_CLASS)}>
                      {formatTableCurrency(totals.ingresosOgc)}
                    </td>
                  </tr>
                  <tr className="border-b border-gray-200 bg-white">
                    <td className="px-8 py-6 align-middle text-base text-gray-900">COSTO ESTRUCTURA + INDIRECTOS</td>
                    <td className={cn("px-8 py-6 text-center align-middle text-base", DETAIL_TEXT_CLASS)}>
                      {formatAccountingCurrency(-Math.abs(totals.costosEstructuraMasIndirectos))}
                    </td>
                  </tr>
                  <tr className={cn("border-b border-gray-200", SOFT_HIGHLIGHT_CLASS)}>
                    <td className="px-8 py-6 align-middle text-base text-gray-900">
                      <div className="flex flex-col gap-1">
                        <span>EBITDA</span>
                        <span className="text-sm text-gray-500">%</span>
                      </div>
                    </td>
                    <td className={cn(STRONG_HIGHLIGHT_CLASS, "px-8 py-6 text-center align-middle text-base")}>
                      <div className="flex flex-col gap-1">
                        <span className={ebitda >= 0 ? "text-[#1A5D21]" : "text-[#802424]"}>
                          {formatTableCurrency(ebitda)}
                        </span>
                        <span className="text-sm text-gray-500">{formatPercent(totals.ebitdaMargin)}</span>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default function ProfitAndLossPage() {
  const [activeTab, setActiveTab] = useState<PnlTab>("pnl");
  const [isOgcUploadOpen, setIsOgcUploadOpen] = useState(false);

  const pnlSummary = useQuery(api.desarrollos.getPnlSummary) as PnlSummary | undefined;
  const profitabilitySummary = useQuery(api.desarrollos.getProfitabilitySummary);

  const months = useMemo(() => buildMonths(), []);
  const honorariosYtd = safeNumber(pnlSummary?.totals.honorarios);
  const indirectosYtd = safeNumber(pnlSummary?.totals.indirectos);
  const ingresosYtd = safeNumber(pnlSummary?.totals.ingresosOgc);
  const estructuraYtd = safeNumber(pnlSummary?.totals.costosEstructuraOgc);
  const ebitdaYtd = safeNumber(pnlSummary?.totals.ebitda);
  const rows = useMemo(
    () => buildMonthlyRows(months, honorariosYtd, indirectosYtd, estructuraYtd, pnlSummary),
    [months, honorariosYtd, indirectosYtd, estructuraYtd, pnlSummary]
  );

  if (
    pnlSummary === undefined ||
    profitabilitySummary === undefined
  ) {
    return (
      <div className="bg-white px-12 py-6 min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Cargando datos...</p>
      </div>
    );
  }

  return (
    <div className="bg-white px-12 py-6">
      <OgcMovementsUploadDialog open={isOgcUploadOpen} onOpenChange={setIsOgcUploadOpen} />
      <div className="max-w-full mx-auto space-y-6">
        <div className="border-b border-[#AFAEA2]">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="flex flex-wrap items-end gap-8 md:gap-20">
              {PNL_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "pb-4 text-base text-gray-500 border-b-2 transition-colors",
                    activeTab === tab.id
                      ? "border-gray-900 text-gray-900"
                      : "border-transparent hover:text-gray-900"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsOgcUploadOpen(true)}
              className="mb-3 h-10 self-start border-[#D98222] text-gray-900 hover:bg-[#FBFAF2] md:self-auto"
            >
              <Upload className="h-4 w-4" />
              Cargar movimientos
            </Button>
          </div>
        </div>

        {activeTab === "pnl" ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-10 w-full xl:w-3/4 py-8">
              <div className="space-y-2 text-left">
                <p className="text-sm text-[#777770]">Ingresos OGC YTD</p>
                <p className="text-4xl text-gray-900">{formatMetricCurrency(ingresosYtd)}</p>
                <Badge variant="secondary" className="text-[10px] font-normal py-1.5 leading-none text-gray-500 rounded-xl border-gray-400">
                  Ene-Jun {new Date().getFullYear()}
                </Badge>
              </div>

              <div className="space-y-2 text-left">
                <p className="text-sm text-[#777770]">Estructura YTD</p>
                <p className="text-4xl text-gray-900">{formatMetricCurrency(estructuraYtd)}</p>
                <Badge variant="secondary" className="text-[10px] font-normal py-1.5 leading-none text-gray-500 rounded-xl border-gray-400">
                  {(pnlSummary.totals.estructuraPercent * 100).toFixed(1)}% de ingresos
                </Badge>
              </div>

              <div className="space-y-2 text-left">
                <p className="text-sm text-[#777770]">EBITDA YTD</p>
                <p className={cn("text-4xl", ebitdaYtd >= 0 ? "text-[#1A5D21]" : "text-[#802424]")}>
                  {formatMetricCurrency(ebitdaYtd)}
                </p>
                <Badge variant="secondary" className="text-[10px] font-normal py-1.5 leading-none text-gray-500 rounded-xl border-gray-400">
                  {(pnlSummary.totals.ebitdaMargin * 100).toFixed(1)}% de margen
                </Badge>
              </div>
            </div>

            <div className="border-t border-[#AFAEA2] pt-12">
              <MonthlyPnlTable
                months={months}
                rows={rows}
                highlightedMonthIndex={months.length - 1}
              />
            </div>
          </>
        ) : activeTab === "wip" ? (
          <WorkInProgressView summary={profitabilitySummary} />
        ) : (
          <ProjectProfitabilityView summary={profitabilitySummary} />
        )}
      </div>
    </div>
  );
}
