import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OgcMovementsUploadModal } from "@/components/modals/ogc-movements-upload-modal";
import { cn } from "@/lib/utils";
import { Ban, CalendarDays, Check, Copy, Pencil, Percent, RefreshCcw, Save, ScrollText, Settings2, Upload, X } from "lucide-react";
import { toast } from "sonner";

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
  hasLegacyStructureSuppressed?: boolean;
  legacyStructureSuppressedGroups?: Array<{ key: string; label: string }>;
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
  costosDirectosObra?: number;
  structureBreakdown: Record<string, number>;
};

type DesarrolloOption = {
  _id: Id<"desarrollos">;
  nombre: string;
};

type OgcLedgerMovement = {
  _id: Id<"ogc_movimientos">;
  tipo: string;
  categoria: string;
  monto: number;
  fecha: string;
  descripcion?: string;
  moneda: string;
  tipo_cambio?: number;
  proyecto?: Id<"desarrollos">;
  status?: string;
  duplicate_key?: string;
  reconciled?: boolean;
  reconciliation_reference?: string;
  reconciliation_note?: string;
  void_reason?: string;
  created_by_name: string;
  created_at: number;
  updated_by_name?: string;
  updated_at?: number;
};

type LedgerDraft = {
  tipo: string;
  categoria: string;
  monto: string;
  fecha: string;
  proyecto: string;
  descripcion: string;
  moneda: string;
  tipo_cambio: string;
};

type LedgerAction = "void" | "duplicate" | "reconcile";

type TaxSettings = {
  isr: number;
  ptu: number;
  siroc: number;
  ivaRetenciones: number;
};

type PnlQueryParams = {
  periodYear: number;
  cutoffMonth: number;
  usdToMxn: number;
  eurToMxn: number;
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
    currentMonthIngresos?: number;
    currentMonthCostos?: number;
    activeProjects: number;
    structureBreakdown: ProfitabilityStructureRow[];
    hasOgcIncomeMovements?: boolean;
    hasOgcStructureMovements?: boolean;
    wip: {
      presupuesto: number;
      costoReal: number;
      pagado: number;
      saldo: number;
      ejecutadoPercent: number;
      backlogPendiente: number;
    };
  };
  period?: {
    year: number;
    cutoffMonth: number;
    currentMonthKey: string;
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
  period?: {
    year: number;
    cutoffMonth: number;
    currentMonthKey: string;
  };
  currency?: {
    display: string;
    rates: {
      USD: number;
      EUR: number;
    };
  };
};

const PNL_TABS: Array<{ id: PnlTab; label: string }> = [
  { id: "pnl", label: "P&L Mensual" },
  { id: "wip", label: "Work in progress" },
  { id: "profitability", label: "Project profitability" },
];

const MONTH_LABELS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const DEFAULT_TAX_SETTINGS: TaxSettings = {
  isr: 4,
  ptu: 1,
  siroc: 0,
  ivaRetenciones: 0,
};
const DEFAULT_USD_TO_MXN = 17;
const DEFAULT_EUR_TO_MXN = 18.5;
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
const LEDGER_CATEGORIES = [
  "HONORARIOS",
  "INDIRECTOS",
  "NOMINA",
  "CARGAS SOCIALES ADMN (IMSS, ISN, INFONAVIT)",
  "TRANSPORTE",
  "RENTA",
  "OTROS",
  "DISP HONORARIOS",
];

const safeNumber = (value: unknown) => {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
};

const safeDivide = (value: number, total: number) => {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total === 0) return 0;
  return value / total;
};

const parseLedgerNumber = (value: string, fallback = 0) => {
  const parsed = Number(String(value || "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toDateInputValue = (value?: string) => {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return "";
  return `${match[3]}-${match[2]}-${match[1]}`;
};

const formatLedgerTimestamp = (value?: number) => {
  if (!value) return "-";
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
};

const getLedgerStatusLabel = (movement: Pick<OgcLedgerMovement, "status" | "reconciled">) => {
  if (movement.status === "anulado") return "Anulado";
  if (movement.status === "duplicado") return "Duplicado";
  return movement.reconciled ? "Conciliado" : "Activo";
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

const buildMonths = (year: number, cutoffMonth: number): PnlMonth[] => {
  const safeCutoffMonth = Math.min(Math.max(Math.trunc(cutoffMonth), 1), 12);
  return MONTH_LABELS.slice(0, safeCutoffMonth).map((month, index) => ({
    key: `${year}-${index + 1}`,
    label: `${month} ${year}`,
  }));
};

const buildPeriodLabel = (year: number, cutoffMonth: number) => {
  const monthLabel = MONTH_LABELS[Math.min(Math.max(cutoffMonth, 1), 12) - 1];
  return `Ene-${monthLabel} ${year}`;
};

const parsePositiveNumber = (value: string, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const buildMonthlyRows = (
  months: PnlMonth[],
  pnlSummary?: PnlSummary,
  taxSettings: TaxSettings = DEFAULT_TAX_SETTINGS
): PnlRow[] => {
  const monthlyMovements = pnlSummary?.monthlyOgcMovements || {};
  const structureGroups = pnlSummary?.structureGroups?.length ? pnlSummary.structureGroups : DEFAULT_STRUCTURE_GROUPS;

  const monthlyHonorarios = months.map((month) => {
    return safeNumber(monthlyMovements[month.key]?.honorarios);
  });
  const monthlyIndirectos = months.map((month) => {
    return safeNumber(monthlyMovements[month.key]?.indirectos);
  });
  const monthlyIngresos = monthlyHonorarios.map((value, index) => value + monthlyIndirectos[index]);

  const costRows = structureGroups.map((group) => {
    return months.map((month) => {
      const movementAmount = safeNumber(monthlyMovements[month.key]?.structureBreakdown?.[group.key]);
      return -Math.abs(movementAmount);
    });
  });
  const monthlyEstructura = months.map((_, index) => costRows.reduce((sum, row) => sum + safeNumber(row[index]), 0));
  const ebitdaValues = monthlyIngresos.map((value, index) => value + monthlyEstructura[index]);
  const isrValues = ebitdaValues.map((value) => -Math.max(value, 0) * (taxSettings.isr / 100));
  const ptuValues = ebitdaValues.map((value) => -Math.max(value, 0) * (taxSettings.ptu / 100));
  const sirocValues = monthlyIngresos.map((value) => -Math.max(value, 0) * (taxSettings.siroc / 100));
  const ivaRetencionesValues = monthlyIngresos.map((value) => -Math.max(value, 0) * (taxSettings.ivaRetenciones / 100));
  const netValues = ebitdaValues.map((value, index) => value + isrValues[index] + ptuValues[index]);
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
    { label: "ISR CORPORATIVO", type: "line", values: isrValues },
    { label: "PTU", type: "line", values: ptuValues },
    { label: "UTILIDAD NETA", type: "metric", values: netValues, percentages: netPercentages },
    { label: "INFORMATIVO", type: "section" },
    { label: "CARGA SOCIAL OBRA (SIROC - RECUPERABLE)", type: "line", values: sirocValues },
    { label: "FLUJO FISCAL (IVA + RETENCIONES)", type: "line", values: ivaRetencionesValues },
  ];
};

const hasMonthlyMovement = (movement?: PnlMonthlyMovement) => {
  if (!movement) return false;
  const structureTotal = Object.values(movement.structureBreakdown || {}).reduce((sum, amount) => sum + safeNumber(amount), 0);
  return safeNumber(movement.honorarios) > 0 || safeNumber(movement.indirectos) > 0 || structureTotal > 0;
};

const buildMonthlyDataNote = (months: PnlMonth[], pnlSummary?: PnlSummary) => {
  if (!pnlSummary) return undefined;

  const monthlyMovements = pnlSummary.monthlyOgcMovements || {};
  const monthsWithMovements = months.filter((month) => hasMonthlyMovement(monthlyMovements[month.key])).length;
  const hasPeriodActivity =
    safeNumber(pnlSummary.totals.ingresosOgc) > 0 || safeNumber(pnlSummary.totals.costosEstructuraOgc) > 0;

  if (hasPeriodActivity && monthsWithMovements < months.length) {
    return `Datos mensuales parciales: ${monthsWithMovements}/${months.length} meses tienen movimientos fechados. No se prorratea linealmente.`;
  }

  return "Solo movimientos fechados; sin prorrateo lineal entre meses.";
};

function MonthlyPnlTable({
  months,
  rows,
  highlightedMonthIndex,
  periodLabel,
  dataQualityNote,
}: {
  months: PnlMonth[];
  rows: PnlRow[];
  highlightedMonthIndex: number;
  periodLabel: string;
  dataQualityNote?: string;
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <h2 className="text-lg text-gray-900">ESTADO DE RESULTADOS</h2>
        <div className="text-left md:text-right">
          <p className="text-sm text-gray-400">Movimientos reales acumulados {periodLabel}</p>
          {dataQualityNote && <p className="mt-1 text-xs text-[#777770]">{dataQualityNote}</p>}
        </div>
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
          label="Ingresos cobrados registrados"
          value={formatMetricCurrency(totals.wip.pagado)}
          badge="Tabla ingresos a la fecha"
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
            {/* <p className="mt-1 text-xs text-[#777770]">Cobrado sale de la tabla ingresos; no de ingresos OGC.</p> */}
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
                <th className="px-8 py-4 text-center font-normal">Cobrado registrado</th>
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
  currentMonthLabel,
  periodLabel,
}: {
  summary: ProfitabilitySummary;
  currentMonthLabel: string;
  periodLabel: string;
}) {
  const projects = summary.projects;
  const totals = summary.totals;
  const estructuraRows = totals.structureBreakdown.map((row) => ({
    ...row,
    percent: safeDivide(row.amount, totals.costosEstructuraOgc),
  }));
  const honorariosOgc = totals.honorarios;
  const indirectosOgc = totals.indirectos;
  const ebitda = totals.ebitda;
  const projectsWithSuppressedLegacy = projects.filter((project) => project.hasLegacyStructureSuppressed);
  const suppressedLegacyNote = projectsWithSuppressedLegacy.length
    ? `Estructura legacy sustituida solo en categorias con movimientos OGC cargados: ${projectsWithSuppressedLegacy
        .map((project) => {
          const groups = project.legacyStructureSuppressedGroups?.map((group) => group.label).join(", ");
          return groups ? `${project.nombre} (${groups})` : project.nombre;
        })
        .join("; ")}.`
    : undefined;

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
          badge={currentMonthLabel}
          valueClassName={totals.currentMonthMargen >= 0 ? "text-gray-900" : "text-[#802424]"}
        />
        <WipMetricCard
          label="Margen mensual %"
          value={formatPercent(totals.currentMonthMargenPercent)}
          badge={currentMonthLabel}
          valueClassName={totals.currentMonthMargenPercent >= 0 ? "text-gray-900" : "text-[#802424]"}
        />
      </div>

      <div className="border-t border-[#AFAEA2] pt-12 space-y-12">
        <div className="space-y-6">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <h2 className="text-lg text-gray-900">RENTABILIDAD POR OBRA - ACUMULADO AL CORTE</h2>
            <div className="text-left md:text-right">
              <p className="text-sm text-gray-400">Ingresos OGC vs. costos directos</p>
              {suppressedLegacyNote && <p className="mt-1 text-xs text-[#777770]">{suppressedLegacyNote}</p>}
            </div>
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
              <p className="text-sm text-gray-400">Acumulado {periodLabel}</p>
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
              <p className="text-sm text-gray-400">Acumulado {periodLabel}</p>
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
                    <td className="px-8 py-6 align-middle text-base text-gray-900">HONORARIOS OGC</td>
                    <td className={cn("px-8 py-6 text-center align-middle text-base", DETAIL_TEXT_CLASS)}>
                      {formatTableCurrency(honorariosOgc)}
                    </td>
                  </tr>
                  <tr className="border-b border-gray-200 bg-white">
                    <td className="px-8 py-6 align-middle text-base text-gray-900">INDIRECTOS OGC</td>
                    <td className={cn("px-8 py-6 text-center align-middle text-base", DETAIL_TEXT_CLASS)}>
                      {formatTableCurrency(indirectosOgc)}
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

const createLedgerDraft = (movement: OgcLedgerMovement): LedgerDraft => ({
  tipo: movement.tipo,
  categoria: movement.categoria,
  monto: String(movement.monto || ""),
  fecha: toDateInputValue(movement.fecha),
  proyecto: movement.proyecto || "empresa",
  descripcion: movement.descripcion || "",
  moneda: movement.moneda || "MXN",
  tipo_cambio: movement.tipo_cambio ? String(movement.tipo_cambio) : "",
});

function OgcLedgerDialog({
  movements,
  proyectos,
}: {
  movements: OgcLedgerMovement[];
  proyectos: DesarrolloOption[];
}) {
  const updateMovement = useMutation(api.ogc_movimientos.update);
  const voidMovement = useMutation(api.ogc_movimientos.voidMovement);
  const reconcileMovement = useMutation(api.ogc_movimientos.reconcile);
  const markDuplicate = useMutation(api.ogc_movimientos.markDuplicate);

  const [editingId, setEditingId] = useState<Id<"ogc_movimientos"> | null>(null);
  const [draft, setDraft] = useState<LedgerDraft | null>(null);
  const [action, setAction] = useState<{ type: LedgerAction; movement: OgcLedgerMovement } | null>(null);
  const [actionReason, setActionReason] = useState("");
  const [actionReference, setActionReference] = useState("");
  const [actionNote, setActionNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const projectNameById = useMemo(() => {
    const lookup = new Map<string, string>();
    proyectos.forEach((proyecto) => lookup.set(proyecto._id, proyecto.nombre));
    return lookup;
  }, [proyectos]);

  const duplicateCounts = useMemo(() => {
    const counts = new Map<string, number>();
    movements
      .filter((movement) => !movement.status || movement.status === "activo")
      .forEach((movement) => {
        if (!movement.duplicate_key) return;
        counts.set(movement.duplicate_key, (counts.get(movement.duplicate_key) || 0) + 1);
      });
    return counts;
  }, [movements]);

  const activeCount = movements.filter((movement) => !movement.status || movement.status === "activo").length;
  const reconciledCount = movements.filter((movement) => movement.reconciled && (!movement.status || movement.status === "activo")).length;
  const inactiveCount = movements.length - activeCount;

  const startEdit = (movement: OgcLedgerMovement) => {
    setEditingId(movement._id);
    setDraft(createLedgerDraft(movement));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(null);
  };

  const updateDraft = <K extends keyof LedgerDraft>(key: K, value: LedgerDraft[K]) => {
    setDraft((currentDraft) => currentDraft ? { ...currentDraft, [key]: value } : currentDraft);
  };

  const saveEdit = async () => {
    if (!editingId || !draft) return;
    const monto = parseLedgerNumber(draft.monto);
    const tipoCambio = parseLedgerNumber(draft.tipo_cambio);

    setIsSaving(true);
    try {
      await updateMovement({
        id: editingId,
        patch: {
          tipo: draft.tipo,
          categoria: draft.categoria,
          monto,
          fecha: draft.fecha,
          descripcion: draft.descripcion.trim(),
          moneda: draft.moneda,
          tipo_cambio: draft.moneda === "MXN" ? undefined : tipoCambio,
          proyecto: draft.proyecto === "empresa" ? null : draft.proyecto as Id<"desarrollos">,
        },
        reason: "Edicion desde ledger P&L",
      });
      toast.success("Movimiento actualizado");
      cancelEdit();
    } catch (error) {
      toast.error("No se pudo actualizar", {
        description: error instanceof Error ? error.message : "Ocurrio un error inesperado.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const openAction = (type: LedgerAction, movement: OgcLedgerMovement) => {
    setAction({ type, movement });
    setActionReason("");
    setActionReference(movement.reconciliation_reference || "");
    setActionNote(movement.reconciliation_note || "");
  };

  const closeAction = () => {
    setAction(null);
    setActionReason("");
    setActionReference("");
    setActionNote("");
  };

  const confirmAction = async () => {
    if (!action) return;

    setIsSaving(true);
    try {
      if (action.type === "void") {
        await voidMovement({ id: action.movement._id, reason: actionReason });
        toast.success("Movimiento anulado");
      } else if (action.type === "duplicate") {
        await markDuplicate({ id: action.movement._id, reason: actionReason || "Marcado como duplicado desde ledger P&L" });
        toast.success("Movimiento marcado como duplicado");
      } else {
        await reconcileMovement({
          id: action.movement._id,
          reconciled: true,
          reference: actionReference,
          note: actionNote,
        });
        toast.success("Movimiento conciliado");
      }
      closeAction();
    } catch (error) {
      toast.error("No se pudo completar la accion", {
        description: error instanceof Error ? error.message : "Ocurrio un error inesperado.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const unreconcile = async (movement: OgcLedgerMovement) => {
    setIsSaving(true);
    try {
      await reconcileMovement({ id: movement._id, reconciled: false });
      toast.success("Conciliacion removida");
    } catch (error) {
      toast.error("No se pudo remover conciliacion", {
        description: error instanceof Error ? error.message : "Ocurrio un error inesperado.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const actionTitle = action?.type === "void"
    ? "Anular movimiento"
    : action?.type === "duplicate"
      ? "Marcar duplicado"
      : "Conciliar movimiento";

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          title="Ledger movimientos OGC"
          aria-label="Ledger movimientos OGC"
          className="mb-3 h-10 w-10 shrink-0 self-start bg-white text-gray-900 md:self-auto"
        >
          <ScrollText className="h-4 w-4" />
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="text-2xl font-normal">LEDGER MOVIMIENTOS OGC</DialogTitle>
          <DialogDescription>
            Edicion, anulacion, deduplicacion y conciliacion con auditoria.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
            <div className="border border-gray-200 bg-[#FBFAF2] px-4 py-3">
              <p className="text-xs text-gray-500">Activos</p>
              <p className="text-lg text-gray-900">{activeCount}</p>
            </div>
            <div className="border border-gray-200 bg-white px-4 py-3">
              <p className="text-xs text-gray-500">Conciliados</p>
              <p className="text-lg text-gray-900">{reconciledCount}</p>
            </div>
            <div className="border border-gray-200 bg-white px-4 py-3">
              <p className="text-xs text-gray-500">Historicos</p>
              <p className="text-lg text-gray-900">{inactiveCount}</p>
            </div>
          </div>

          <div className="overflow-hidden border border-gray-200 bg-white">
            <table className="w-full table-fixed border-collapse text-left text-xs xl:text-sm">
              <colgroup>
                <col className="w-[8%]" />
                <col className="w-[8%]" />
                <col className="w-[9%]" />
                <col className="w-[12%]" />
                <col className="w-[8%]" />
                <col className="w-[6%]" />
                <col className="w-[6%]" />
                <col className="w-[10%]" />
                <col className="w-[12%]" />
                <col className="w-[15%]" />
                <col className="w-[6%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-gray-200 text-gray-500">
                  <th className="px-4 py-3 font-normal">Estado</th>
                  <th className="px-4 py-3 font-normal">Fecha</th>
                  <th className="px-4 py-3 font-normal">Tipo</th>
                  <th className="px-4 py-3 font-normal">Categoria</th>
                  <th className="px-4 py-3 text-right font-normal">Monto</th>
                  <th className="px-4 py-3 font-normal">Moneda</th>
                  <th className="px-4 py-3 font-normal">TC</th>
                  <th className="px-4 py-3 font-normal">Obra</th>
                  <th className="px-4 py-3 font-normal">Descripcion</th>
                  <th className="px-4 py-3 font-normal">Auditoria</th>
                  <th className="px-4 py-3 text-right font-normal">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((movement) => {
                  const isEditing = editingId === movement._id && draft;
                  const isActive = !movement.status || movement.status === "activo";
                  const duplicateCount = movement.duplicate_key ? duplicateCounts.get(movement.duplicate_key) || 0 : 0;

                  return (
                    <tr key={movement._id} className={cn("border-b border-gray-200", isActive ? "bg-white" : "bg-gray-50")}>
                      <td className="px-4 py-4 align-top">
                        <div className="flex flex-col gap-1">
                          <Badge variant="secondary" className={cn(
                            "w-fit rounded-xl text-[10px] font-normal",
                            movement.status === "anulado" ? "border-red-200 text-[#802424]" : "",
                            movement.status === "duplicado" ? "border-amber-200 text-amber-700" : "",
                            movement.reconciled && isActive ? "border-green-200 text-[#1A5D21]" : ""
                          )}>
                            {getLedgerStatusLabel(movement)}
                          </Badge>
                          {duplicateCount > 1 && (
                            <span className="text-xs text-amber-700">{duplicateCount} posibles duplicados</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 align-top">
                        {isEditing ? (
                          <Input
                            type="date"
                            value={draft.fecha}
                            onChange={(event) => updateDraft("fecha", event.target.value)}
                            className="h-9"
                          />
                        ) : (
                          <span className={DETAIL_TEXT_CLASS}>{movement.fecha}</span>
                        )}
                      </td>
                      <td className="px-4 py-4 align-top">
                        {isEditing ? (
                          <Select value={draft.tipo} onValueChange={(value) => updateDraft("tipo", value)}>
                            <SelectTrigger className="h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="ingreso">Ingreso</SelectItem>
                              <SelectItem value="costo_estructura">Costo estructura</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : movement.tipo === "ingreso" ? "Ingreso" : "Costo estructura"}
                      </td>
                      <td className="px-4 py-4 align-top">
                        {isEditing ? (
                          <Select value={draft.categoria} onValueChange={(value) => updateDraft("categoria", value)}>
                            <SelectTrigger className="h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {LEDGER_CATEGORIES.map((category) => (
                                <SelectItem key={category} value={category}>{category}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : movement.categoria}
                      </td>
                      <td className="px-4 py-4 text-right align-top">
                        {isEditing ? (
                          <Input
                            inputMode="decimal"
                            value={draft.monto}
                            onChange={(event) => updateDraft("monto", event.target.value)}
                            className="h-9 text-right"
                          />
                        ) : (
                          formatTableCurrency(movement.monto)
                        )}
                      </td>
                      <td className="px-4 py-4 align-top">
                        {isEditing ? (
                          <Select value={draft.moneda} onValueChange={(value) => updateDraft("moneda", value)}>
                            <SelectTrigger className="h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="MXN">MXN</SelectItem>
                              <SelectItem value="USD">USD</SelectItem>
                              <SelectItem value="EUR">EUR</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : movement.moneda}
                      </td>
                      <td className="px-4 py-4 align-top">
                        {isEditing ? (
                          <Input
                            inputMode="decimal"
                            value={draft.tipo_cambio}
                            onChange={(event) => updateDraft("tipo_cambio", event.target.value)}
                            placeholder={draft.moneda === "MXN" ? "-" : "0.00"}
                            disabled={draft.moneda === "MXN"}
                            className="h-9"
                          />
                        ) : movement.tipo_cambio ? movement.tipo_cambio.toFixed(4) : "-"}
                      </td>
                      <td className="px-4 py-4 align-top">
                        {isEditing ? (
                          <Select value={draft.proyecto} onValueChange={(value) => updateDraft("proyecto", value)}>
                            <SelectTrigger className="h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="empresa">Empresa</SelectItem>
                              {proyectos.map((proyecto) => (
                                <SelectItem key={proyecto._id} value={proyecto._id}>{proyecto.nombre}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : movement.proyecto ? projectNameById.get(movement.proyecto) || "Obra" : "Empresa"}
                      </td>
                      <td className="px-4 py-4 align-top">
                        {isEditing ? (
                          <Input
                            value={draft.descripcion}
                            onChange={(event) => updateDraft("descripcion", event.target.value)}
                            className="h-9"
                          />
                        ) : (
                          <span className="block max-w-[220px] truncate" title={movement.descripcion || ""}>
                            {movement.descripcion || "-"}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4 align-top text-xs text-gray-500">
                        <div className="space-y-1">
                          <p>Creado: {formatLedgerTimestamp(movement.created_at)}</p>
                          <p>Por: {movement.created_by_name}</p>
                          {movement.updated_at && <p>Ultimo cambio: {formatLedgerTimestamp(movement.updated_at)}</p>}
                          {movement.updated_by_name && <p>Por: {movement.updated_by_name}</p>}
                          {movement.void_reason && <p className="text-[#802424]">Motivo: {movement.void_reason}</p>}
                        </div>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <div className="flex justify-end gap-1">
                          {isEditing ? (
                            <>
                              <Button type="button" variant="ghost" size="icon" onClick={saveEdit} disabled={isSaving} title="Guardar">
                                <Save className="h-4 w-4" />
                              </Button>
                              <Button type="button" variant="ghost" size="icon" onClick={cancelEdit} disabled={isSaving} title="Cancelar">
                                <X className="h-4 w-4" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button type="button" variant="ghost" size="icon" onClick={() => startEdit(movement)} disabled={!isActive || isSaving} title="Editar">
                                <Pencil className="h-4 w-4" />
                              </Button>
                              {movement.reconciled ? (
                                <Button type="button" variant="ghost" size="icon" onClick={() => unreconcile(movement)} disabled={!isActive || isSaving} title="Desconciliar">
                                  <X className="h-4 w-4" />
                                </Button>
                              ) : (
                                <Button type="button" variant="ghost" size="icon" onClick={() => openAction("reconcile", movement)} disabled={!isActive || isSaving} title="Conciliar">
                                  <Check className="h-4 w-4" />
                                </Button>
                              )}
                              <Button type="button" variant="ghost" size="icon" onClick={() => openAction("duplicate", movement)} disabled={!isActive || isSaving} title="Marcar duplicado">
                                <Copy className="h-4 w-4" />
                              </Button>
                              <Button type="button" variant="ghost" size="icon" onClick={() => openAction("void", movement)} disabled={!isActive || isSaving} title="Anular">
                                <Ban className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {movements.length === 0 && (
                  <tr className="border-b border-gray-200 bg-white">
                    <td className="px-8 py-6 align-middle text-base text-gray-400" colSpan={11}>
                      No hay movimientos OGC cargados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </DialogContent>

      <Dialog open={!!action} onOpenChange={(open) => !open && closeAction()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-2xl font-normal">{actionTitle}</DialogTitle>
            <DialogDescription>
              {action?.movement.descripcion || action?.movement.categoria || "Movimiento OGC"}
            </DialogDescription>
          </DialogHeader>

          {action?.type === "reconcile" ? (
            <div className="space-y-4">
              <SettingField label="Referencia">
                <Input
                  value={actionReference}
                  onChange={(event) => setActionReference(event.target.value)}
                  placeholder="Estado de cuenta, poliza o folio"
                />
              </SettingField>
              <SettingField label="Nota">
                <Input
                  value={actionNote}
                  onChange={(event) => setActionNote(event.target.value)}
                  placeholder="Detalle opcional"
                />
              </SettingField>
            </div>
          ) : (
            <SettingField label={action?.type === "void" ? "Motivo" : "Nota"}>
              <Input
                value={actionReason}
                onChange={(event) => setActionReason(event.target.value)}
                placeholder={action?.type === "void" ? "Motivo de anulacion" : "Motivo de deduplicacion"}
              />
            </SettingField>
          )}

          <DialogFooter className="gap-3">
            <Button type="button" variant="outline" onClick={closeAction} disabled={isSaving}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={confirmAction}
              disabled={isSaving || (action?.type === "void" && !actionReason.trim())}
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

function SettingsGroup({
  icon,
  title,
  description,
  children,
  className,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 space-y-4 border border-gray-200 bg-white p-4", className)}>
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center border border-gray-200 bg-[#FBFAF2] text-gray-700">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-sm text-gray-900">{title}</p>
          <p className="mt-1 text-xs leading-5 text-gray-500">{description}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function SettingField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label className="text-xs font-normal text-gray-500">{label}</Label>
      {children}
    </div>
  );
}

function PnlSettingsDialog({
  periodLabel,
  periodYear,
  cutoffMonth,
  usdToMxn,
  eurToMxn,
  taxSettings,
  onPeriodYearChange,
  onCutoffMonthChange,
  onUsdToMxnChange,
  onEurToMxnChange,
  onTaxSettingChange,
  onReset,
}: {
  periodLabel: string;
  periodYear: number;
  cutoffMonth: number;
  usdToMxn: number;
  eurToMxn: number;
  taxSettings: TaxSettings;
  onPeriodYearChange: (value: number) => void;
  onCutoffMonthChange: (value: number) => void;
  onUsdToMxnChange: (value: number) => void;
  onEurToMxnChange: (value: number) => void;
  onTaxSettingChange: (key: keyof TaxSettings, value: string) => void;
  onReset: () => void;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          title="Configuracion P&L"
          aria-label="Configuracion P&L"
          className="mb-3 h-10 w-10 shrink-0 self-start bg-white text-gray-900 md:self-auto"
        >
          <Settings2 className="h-4 w-4" />
        </Button>
      </DialogTrigger>
          <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-5xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-2xl font-normal">Configuracion P&L</DialogTitle>
              <DialogDescription>
                Ajusta periodo, conversion de moneda e impuestos aplicados al estado de resultados.
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
              <div className="flex flex-col justify-between border border-gray-200 bg-[#FBFAF2] p-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-gray-900">
                    <Settings2 className="h-4 w-4" />
                    Supuestos activos
                  </div>
                  <p className="text-xs leading-5 text-gray-500">
                    Los cambios se reflejan inmediatamente en las metricas y tablas.
                  </p>
                </div>
                <div className="mt-5 space-y-3">
                  <div>
                    <p className="text-xs text-gray-500">Periodo activo</p>
                    <p className="text-base text-gray-900">{periodLabel}</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onReset}
                    className="h-9 w-full justify-center bg-white text-gray-900"
                  >
                    <RefreshCcw className="h-4 w-4" />
                    Restablecer
                  </Button>
                </div>
              </div>

              <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-3">
                <SettingsGroup
                  icon={<CalendarDays className="h-4 w-4" />}
                  title="Periodo"
                  description="Define el acumulado YTD y el mes resaltado."
                >
                  <div className="grid grid-cols-2 gap-3">
                    <SettingField label="Anio">
                      <Input
                        type="number"
                        value={periodYear}
                        min={2020}
                        max={2100}
                        onChange={(event) => onPeriodYearChange(Math.trunc(parsePositiveNumber(event.target.value, periodYear)))}
                      />
                    </SettingField>
                    <SettingField label="Corte">
                      <Select value={String(cutoffMonth)} onValueChange={(value) => onCutoffMonthChange(Number(value))}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {MONTH_LABELS.map((month, index) => (
                            <SelectItem key={month} value={String(index + 1)}>
                              {month}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </SettingField>
                  </div>
                </SettingsGroup>

                <SettingsGroup
                  icon={<span className="text-sm leading-none">$</span>}
                  title="Conversion"
                  description="Tipo de cambio para movimientos no MXN."
                >
                  <div className="grid grid-cols-2 gap-3">
                    <SettingField label="USD/MXN">
                      <Input
                        type="number"
                        inputMode="decimal"
                        value={usdToMxn}
                        min={0}
                        step="0.01"
                        onChange={(event) => onUsdToMxnChange(parsePositiveNumber(event.target.value, usdToMxn))}
                      />
                    </SettingField>
                    <SettingField label="EUR/MXN">
                      <Input
                        type="number"
                        inputMode="decimal"
                        value={eurToMxn}
                        min={0}
                        step="0.01"
                        onChange={(event) => onEurToMxnChange(parsePositiveNumber(event.target.value, eurToMxn))}
                      />
                    </SettingField>
                  </div>
                </SettingsGroup>

                <SettingsGroup
                  icon={<Percent className="h-4 w-4" />}
                  title="Impuestos"
                  description="Porcentajes editables para resultado e informativos."
                >
                  <div className="grid grid-cols-2 gap-3">
                    <SettingField label="ISR">
                      <Input
                        type="number"
                        inputMode="decimal"
                        value={taxSettings.isr}
                        min={0}
                        step="0.1"
                        onChange={(event) => onTaxSettingChange("isr", event.target.value)}
                      />
                    </SettingField>
                    <SettingField label="PTU">
                      <Input
                        type="number"
                        inputMode="decimal"
                        value={taxSettings.ptu}
                        min={0}
                        step="0.1"
                        onChange={(event) => onTaxSettingChange("ptu", event.target.value)}
                      />
                    </SettingField>
                    <SettingField label="SIROC">
                      <Input
                        type="number"
                        inputMode="decimal"
                        value={taxSettings.siroc}
                        min={0}
                        step="0.1"
                        onChange={(event) => onTaxSettingChange("siroc", event.target.value)}
                      />
                    </SettingField>
                    <SettingField label="IVA/Ret">
                      <Input
                        type="number"
                        inputMode="decimal"
                        value={taxSettings.ivaRetenciones}
                        min={0}
                        step="0.1"
                        onChange={(event) => onTaxSettingChange("ivaRetenciones", event.target.value)}
                      />
                    </SettingField>
                  </div>
                </SettingsGroup>
              </div>
            </div>

            <DialogFooter className="gap-3 border-t pt-4">
              <DialogClose asChild>
                <Button type="button" className="h-10">
                  Listo
                </Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
    </Dialog>
  );
}

export default function ProfitAndLossPage() {
  const [activeTab, setActiveTab] = useState<PnlTab>("pnl");
  const [isOgcUploadOpen, setIsOgcUploadOpen] = useState(false);
  const [periodYear, setPeriodYear] = useState(() => new Date().getFullYear());
  const [cutoffMonth, setCutoffMonth] = useState(() => new Date().getMonth() + 1);
  const [usdToMxn, setUsdToMxn] = useState(DEFAULT_USD_TO_MXN);
  const [eurToMxn, setEurToMxn] = useState(DEFAULT_EUR_TO_MXN);
  const [taxSettings, setTaxSettings] = useState<TaxSettings>(DEFAULT_TAX_SETTINGS);

  const pnlQueryParams = useMemo<PnlQueryParams>(
    () => ({
      periodYear,
      cutoffMonth,
      usdToMxn,
      eurToMxn,
    }),
    [periodYear, cutoffMonth, usdToMxn, eurToMxn]
  );
  const ogcExchangeRates = useMemo(() => ({ USD: usdToMxn, EUR: eurToMxn }), [usdToMxn, eurToMxn]);

  const pnlSummary = useQuery(api.desarrollos.getPnlSummary, pnlQueryParams) as PnlSummary | undefined;
  const profitabilitySummary = useQuery(api.desarrollos.getProfitabilitySummary, pnlQueryParams) as ProfitabilitySummary | undefined;
  const ogcMovements = useQuery(api.ogc_movimientos.getAll, { includeInactive: true }) as OgcLedgerMovement[] | undefined;
  const proyectos = useQuery(api.desarrollos.getAll) as DesarrolloOption[] | undefined;

  const months = useMemo(() => buildMonths(periodYear, cutoffMonth), [periodYear, cutoffMonth]);
  const periodLabel = buildPeriodLabel(periodYear, cutoffMonth);
  const currentMonthLabel = `${MONTH_LABELS[cutoffMonth - 1]} ${periodYear}`;
  const ingresosYtd = safeNumber(pnlSummary?.totals.ingresosOgc);
  const estructuraYtd = safeNumber(pnlSummary?.totals.costosEstructuraOgc);
  const ebitdaYtd = safeNumber(pnlSummary?.totals.ebitda);
  const rows = useMemo(
    () => buildMonthlyRows(months, pnlSummary, taxSettings),
    [months, pnlSummary, taxSettings]
  );
  const monthlyDataNote = useMemo(
    () => buildMonthlyDataNote(months, pnlSummary),
    [months, pnlSummary]
  );

  const updateTaxSetting = (key: keyof TaxSettings, value: string) => {
    setTaxSettings((currentSettings) => ({
      ...currentSettings,
      [key]: parsePositiveNumber(value, currentSettings[key]),
    }));
  };

  const resetSettings = () => {
    const now = new Date();
    setPeriodYear(now.getFullYear());
    setCutoffMonth(now.getMonth() + 1);
    setUsdToMxn(DEFAULT_USD_TO_MXN);
    setEurToMxn(DEFAULT_EUR_TO_MXN);
    setTaxSettings(DEFAULT_TAX_SETTINGS);
  };

  if (
    pnlSummary === undefined ||
    profitabilitySummary === undefined ||
    ogcMovements === undefined ||
    proyectos === undefined
  ) {
    return (
      <div className="bg-white px-12 py-6 min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Cargando datos...</p>
      </div>
    );
  }

  return (
    <div className="bg-white px-12 py-6">
      <OgcMovementsUploadModal
        open={isOgcUploadOpen}
        onOpenChange={setIsOgcUploadOpen}
        exchangeRates={ogcExchangeRates}
      />
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
            <div className="flex items-center gap-2">
              <PnlSettingsDialog
                periodLabel={periodLabel}
                periodYear={periodYear}
                cutoffMonth={cutoffMonth}
                usdToMxn={usdToMxn}
                eurToMxn={eurToMxn}
                taxSettings={taxSettings}
                onPeriodYearChange={setPeriodYear}
                onCutoffMonthChange={setCutoffMonth}
                onUsdToMxnChange={setUsdToMxn}
                onEurToMxnChange={setEurToMxn}
                onTaxSettingChange={updateTaxSetting}
                onReset={resetSettings}
              />
              <OgcLedgerDialog movements={ogcMovements} proyectos={proyectos} />
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsOgcUploadOpen(true)}
                className="mb-3 h-10 self-start text-gray-900 md:self-auto"
              >
                <Upload className="h-4 w-4" />
                Cargar movimientos
              </Button>
            </div>
          </div>
        </div>

        {activeTab === "pnl" ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-10 w-full xl:w-3/4 py-8">
              <div className="space-y-2 text-left">
                <p className="text-sm text-[#777770]">Ingresos OGC YTD</p>
                <p className="text-4xl text-gray-900">{formatMetricCurrency(ingresosYtd)}</p>
                <Badge variant="secondary" className="text-[10px] font-normal py-1.5 leading-none text-gray-500 rounded-xl border-gray-400">
                  {periodLabel}
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
                periodLabel={periodLabel}
                dataQualityNote={monthlyDataNote}
              />
            </div>
          </>
        ) : activeTab === "wip" ? (
          <WorkInProgressView summary={profitabilitySummary} />
        ) : (
          <ProjectProfitabilityView
            summary={profitabilitySummary}
            currentMonthLabel={currentMonthLabel}
            periodLabel={periodLabel}
          />
        )}
      </div>
    </div>
  );
}
