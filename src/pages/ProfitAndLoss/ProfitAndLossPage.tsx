import { useMemo, useState } from "react";
import { useParams } from "react-router";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

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

type WorkInProgressProject = {
  nombre: string;
  fecha_creacion?: string;
};

type WorkInProgressMetrics = {
  presupuesto_aprobado?: number;
  gasto_total?: number;
};

type WorkInProgressIngresos = {
  total_ingresos?: number;
};

type ProfitabilityProject = {
  id: string;
  nombre: string;
  ingresosOgc: number;
  costosOgc: number;
  margen: number;
  margenPercent: number;
};

type ProfitabilitySummary = {
  projects: ProfitabilityProject[];
  totals: {
    ingresosOgc: number;
    costosOgc: number;
    margen: number;
    margenPercent: number;
    currentMonthMargen: number;
    currentMonthMargenPercent: number;
    activeProjects: number;
  };
};

const PNL_TABS: Array<{ id: PnlTab; label: string }> = [
  { id: "pnl", label: "P&L Mensual" },
  { id: "wip", label: "Work in progress" },
  { id: "profitability", label: "Project profitability" },
];

const MONTH_LABELS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun"];

const safeNumber = (value: unknown) => {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
};

const safeDivide = (value: number, total: number) => {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total === 0) return 0;
  return value / total;
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

const formatMultiplier = (value: number) => {
  return `${safeNumber(value).toFixed(2)}x`;
};

const formatRunway = (weeks?: number) => {
  if (weeks === undefined || !Number.isFinite(weeks)) return "-";
  return `${weeks.toFixed(1)} sem`;
};

const parseProjectDate = (date?: string) => {
  if (!date) return null;

  if (date.includes("/")) {
    const [day, month, year] = date.split("/").map(Number);
    const parsed = new Date(year, month - 1, day);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }

  if (date.includes("-")) {
    const parsed = new Date(date);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }

  const parsed = new Date(date);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
};

const calculateRunwayWeeks = (saldo: number, gastoTotal: number, fechaCreacion?: string) => {
  if (saldo <= 0 || gastoTotal <= 0) return undefined;

  const startDate = parseProjectDate(fechaCreacion);
  if (!startDate) return undefined;

  const elapsedWeeks = (Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 7);
  if (!Number.isFinite(elapsedWeeks) || elapsedWeeks <= 0) return undefined;

  const weeklySpend = gastoTotal / elapsedWeeks;
  if (!Number.isFinite(weeklySpend) || weeklySpend <= 0) return undefined;

  return saldo / weeklySpend;
};

const buildMonths = (): PnlMonth[] => {
  const year = new Date().getFullYear();
  return MONTH_LABELS.map((month, index) => ({
    key: `${year}-${index + 1}`,
    label: `${month} ${year}`,
  }));
};

const spreadEvenly = (total: number, monthCount: number) => {
  if (monthCount <= 0) return [];
  return Array.from({ length: monthCount }, () => total / monthCount);
};

const buildMonthlyRows = (
  months: PnlMonth[],
  ingresosYtd: number,
  estructuraYtd: number
): PnlRow[] => {
  const monthCount = months.length;
  const monthlyIngresos = spreadEvenly(ingresosYtd, monthCount);
  const monthlyHonorarios = monthlyIngresos.map((value) => value * 0.79);
  const monthlyIndirectos = monthlyIngresos.map((value) => value * 0.21);
  const monthlyEstructura = spreadEvenly(estructuraYtd, monthCount).map((value) => -Math.abs(value));

  const costRatios = [0.4, 0.1, 0.21, 0.1, 0.15, 0.04];
  const costRows = costRatios.map((ratio) => monthlyEstructura.map((value) => value * ratio));
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
    { label: "NOMINA", type: "line", values: costRows[0] },
    { label: "CARGAS SOCIALES ADMN (IMSS, ISN, INFONAVIT)", type: "line", values: costRows[1] },
    { label: "TRANSPORTE", type: "line", values: costRows[2] },
    { label: "RENTA", type: "line", values: costRows[3] },
    { label: "OTROS", type: "line", values: costRows[4] },
    { label: "DISP HONORARIOS", type: "line", values: costRows[5] },
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

              return (
                <tr
                  key={`${row.label}-${rowIndex}`}
                  className={cn(
                    "border-b border-gray-200",
                    isSubtotal || isMetric ? "bg-[#fcfcfc]" : "bg-white"
                  )}
                >
                  <td
                    className={cn(
                      "px-8 py-6 align-middle text-base whitespace-nowrap",
                      isSection ? "text-gray-900" : "text-gray-400",
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

                    return (
                      <td
                        key={`${row.label}-${month.key}`}
                        className={cn(
                          "px-8 py-6 text-center align-middle text-base",
                          isHighlighted ? "bg-[#fcfcfc]" : "",
                          isSection ? "text-gray-400" : "text-gray-900"
                        )}
                      >
                        {!isSection && (
                          <div className="flex flex-col gap-1">
                            <span className={isMetric && safeNumber(value) >= 0 ? "text-[#4CC684]" : ""}>
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
  proyecto,
  budgetMetrics,
  ingresosTotals,
}: {
  proyecto: WorkInProgressProject;
  budgetMetrics: WorkInProgressMetrics | null;
  ingresosTotals: WorkInProgressIngresos;
}) {
  const presupuesto = safeNumber(budgetMetrics?.presupuesto_aprobado);
  const costoReal = safeNumber(budgetMetrics?.gasto_total);
  const ingresoFacturado = safeNumber(ingresosTotals.total_ingresos);
  const backlogPendiente = Math.max(presupuesto - ingresoFacturado, 0);
  const eac = Math.max(presupuesto, costoReal);
  const varianza = presupuesto - eac;
  const cpi = safeDivide(presupuesto, eac);
  const saldo = ingresoFacturado - costoReal;
  const runwayWeeks = calculateRunwayWeeks(saldo, costoReal, proyecto.fecha_creacion);

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-10 w-full xl:w-3/4 py-8">
        <WipMetricCard
          label="Backlog total contratado"
          value={formatMetricCurrency(presupuesto)}
          badge="1 obra activa"
        />
        <WipMetricCard
          label="Costo real acumulado"
          value={formatMetricCurrency(costoReal)}
          badge={`${(safeDivide(costoReal, presupuesto) * 100).toFixed(1)}% ejecutado`}
        />
        <WipMetricCard
          label="Ingreso facturado total"
          value={formatMetricCurrency(ingresoFacturado)}
          badge="Cobrado a la fecha"
          valueClassName="text-[#4CC684]"
        />
        <WipMetricCard
          label="Backlog pendiente"
          value={formatMetricCurrency(backlogPendiente)}
          badge="Por facturar"
        />
      </div>

      <div className="border-t border-[#AFAEA2] pt-12 space-y-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <h2 className="text-lg text-gray-900">OBRAS ACTIVAS - ESTADO AL CORTE</h2>
          <p className="text-sm text-gray-400">Costo real - Saldo y runway de Tesoreria</p>
        </div>

        <div className="overflow-x-auto border border-gray-200 bg-white">
          <table className="w-full min-w-[1180px] border-collapse text-left">
            <thead>
              <tr className="border-b border-gray-200 text-sm text-gray-500">
                <th className="w-[260px] px-8 py-4 font-normal">Obra</th>
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
              <tr className="border-b border-gray-200 bg-white">
                <td className="px-8 py-6 align-middle text-base text-gray-900">
                  <span className="block max-w-[260px] truncate">{proyecto.nombre}</span>
                </td>
                <td className="px-8 py-6 text-center align-middle text-base text-gray-400">
                  {formatTableCurrency(presupuesto)}
                </td>
                <td className="px-8 py-6 text-center align-middle text-base text-gray-400">
                  {formatTableCurrency(costoReal)}
                </td>
                <td className="px-8 py-6 text-center align-middle text-base text-gray-400">
                  {formatTableCurrency(eac)}
                </td>
                <td className={cn("px-8 py-6 text-center align-middle text-base", varianza < 0 ? "text-[#802424]" : "text-gray-900")}>
                  {formatTableCurrency(varianza)}
                </td>
                <td className="px-8 py-6 text-center align-middle text-base text-gray-900">
                  {formatMultiplier(cpi)}
                </td>
                <td className="px-8 py-6 text-center align-middle text-base text-gray-400">
                  {formatTableCurrency(costoReal)}
                </td>
                <td className={cn("px-8 py-6 text-center align-middle text-base", saldo >= 0 ? "text-[#4CC684]" : "text-[#802424]")}>
                  {formatTableCurrency(saldo)}
                </td>
                <td className="bg-[#fcfcfc] px-8 py-6 text-center align-middle text-base text-gray-900">
                  {formatRunway(runwayWeeks)}
                </td>
              </tr>
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
  const estructuraRows = [
    { label: "NOMINA", amount: totals.costosOgc * 0.4, percent: 0.4 },
    { label: "TRANSPORTE", amount: totals.costosOgc * 0.21, percent: 0.21 },
    { label: "IMPUESTOS", amount: totals.costosOgc * 0.15, percent: 0.15 },
    { label: "RENTA", amount: totals.costosOgc * 0.1, percent: 0.1 },
  ];
  const estructuraVisibleTotal = estructuraRows.reduce((sum, row) => sum + row.amount, 0);
  const honorariosCobrados = totals.ingresosOgc * 0.79;
  const indirectosCobrados = totals.ingresosOgc * 0.21;
  const ebitda = totals.margen;

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-10 w-full xl:w-3/4 py-8">
        <WipMetricCard
          label="Margen bruto total OGC"
          value={formatMetricCurrency(totals.margen)}
          badge="Desde inicio de año"
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
                    <td className="px-8 py-6 text-center align-middle text-base text-gray-400">
                      {formatTableCurrency(project.ingresosOgc)}
                    </td>
                    <td className="px-8 py-6 text-center align-middle text-base text-gray-400">
                      {formatAccountingCurrency(-Math.abs(project.costosOgc))}
                    </td>
                    <td className="bg-[#fcfcfc] px-8 py-6 text-center align-middle text-base">
                      <div className="flex items-center justify-center gap-8">
                        <span className={project.margen >= 0 ? "text-[#4CC684]" : "text-[#802424]"}>
                          {formatTableCurrency(project.margen)}
                        </span>
                        <span className="text-gray-400">{formatWholePercent(project.margenPercent)}</span>
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

                <tr className="border-b border-gray-200 bg-[#fcfcfc]">
                  <td className="px-8 py-6 align-middle text-base text-gray-900">TOTAL OGC</td>
                  <td className="px-8 py-6 text-center align-middle text-base text-gray-400">
                    {formatTableCurrency(totals.ingresosOgc)}
                  </td>
                  <td className="px-8 py-6 text-center align-middle text-base text-gray-400">
                    {formatAccountingCurrency(-Math.abs(totals.costosOgc))}
                  </td>
                  <td className="bg-[#fcfcfc] px-8 py-6 text-center align-middle text-base">
                    <div className="flex items-center justify-center gap-8">
                      <span className={totals.margen >= 0 ? "text-[#4CC684]" : "text-[#802424]"}>
                        {formatTableCurrency(totals.margen)}
                      </span>
                      <span className="text-gray-400">{formatWholePercent(totals.margenPercent)}</span>
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
                      <td className="px-8 py-6 text-center align-middle text-base text-gray-400">
                        {formatTableCurrency(row.amount)}
                      </td>
                      <td className="px-8 py-6 text-center align-middle text-base text-gray-400">
                        {formatWholePercent(row.percent)}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-b border-gray-200 bg-[#fcfcfc]">
                    <td className="px-8 py-6 align-middle text-base text-gray-900">TOTAL ESTRUCTURA</td>
                    <td className="px-8 py-6 text-center align-middle text-base text-gray-400">
                      {formatTableCurrency(estructuraVisibleTotal)}
                    </td>
                    <td className="px-8 py-6 text-center align-middle text-base text-gray-400">
                      {formatWholePercent(safeDivide(estructuraVisibleTotal, totals.costosOgc))}
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
                    <td className="px-8 py-6 text-center align-middle text-base text-gray-400">
                      {formatTableCurrency(honorariosCobrados)}
                    </td>
                  </tr>
                  <tr className="border-b border-gray-200 bg-white">
                    <td className="px-8 py-6 align-middle text-base text-gray-900">INDIRECTOS COBRADOS</td>
                    <td className="px-8 py-6 text-center align-middle text-base text-gray-400">
                      {formatTableCurrency(indirectosCobrados)}
                    </td>
                  </tr>
                  <tr className="border-b border-gray-200 bg-[#fcfcfc]">
                    <td className="px-8 py-6 align-middle text-base text-gray-900">INGRESOS OGC</td>
                    <td className="px-8 py-6 text-center align-middle text-base text-gray-400">
                      {formatTableCurrency(totals.ingresosOgc)}
                    </td>
                  </tr>
                  <tr className="border-b border-gray-200 bg-white">
                    <td className="px-8 py-6 align-middle text-base text-gray-900">COSTO ESTRUCTURA + INDIRECTOS</td>
                    <td className="px-8 py-6 text-center align-middle text-base text-gray-400">
                      {formatAccountingCurrency(-Math.abs(totals.costosOgc))}
                    </td>
                  </tr>
                  <tr className="border-b border-gray-200 bg-[#fcfcfc]">
                    <td className="px-8 py-6 align-middle text-base text-gray-900">
                      <div className="flex flex-col gap-1">
                        <span>EBITDA</span>
                        <span className="text-sm text-gray-500">%</span>
                      </div>
                    </td>
                    <td className="px-8 py-6 text-center align-middle text-base">
                      <div className="flex flex-col gap-1">
                        <span className={ebitda >= 0 ? "text-[#4CC684]" : "text-[#802424]"}>
                          {formatTableCurrency(ebitda)}
                        </span>
                        <span className="text-sm text-gray-500">{formatPercent(totals.margenPercent)}</span>
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
  const { proyectoId } = useParams<{ proyectoId: string }>();
  const [activeTab, setActiveTab] = useState<PnlTab>("pnl");

  const proyecto = useQuery(
    api.desarrollos.getById,
    proyectoId ? { id: proyectoId as Id<"desarrollos"> } : "skip"
  );
  const ingresosTotals = useQuery(
    api.ingresos.getTotalsByProyecto,
    proyectoId ? { proyecto_id: proyectoId as Id<"desarrollos"> } : "skip"
  );
  const budgetMetrics = useQuery(
    api.meticas_presupuesto.getByProyecto,
    proyectoId ? { proyecto_id: proyectoId as Id<"desarrollos"> } : "skip"
  );
  const profitabilitySummary = useQuery(api.desarrollos.getProfitabilitySummary);

  const months = useMemo(() => buildMonths(), []);
  const ingresosYtd = safeNumber(ingresosTotals?.total_ingresos);
  const estructuraYtd = safeNumber(budgetMetrics?.gasto_total);
  const ebitdaYtd = ingresosYtd - estructuraYtd;
  const rows = useMemo(
    () => buildMonthlyRows(months, ingresosYtd, estructuraYtd),
    [months, ingresosYtd, estructuraYtd]
  );

  if (!proyecto || ingresosTotals === undefined || budgetMetrics === undefined || profitabilitySummary === undefined) {
    return (
      <div className="bg-white px-12 py-6 min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Cargando datos...</p>
      </div>
    );
  }

  return (
    <div className="bg-white px-12 py-6">
      <div className="max-w-full mx-auto space-y-6">
        <div className="border-b border-[#AFAEA2]">
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
                  {(safeDivide(estructuraYtd, ingresosYtd) * 100).toFixed(1)}% de ingresos
                </Badge>
              </div>

              <div className="space-y-2 text-left">
                <p className="text-sm text-[#777770]">EBITDA YTD</p>
                <p className={cn("text-4xl", ebitdaYtd >= 0 ? "text-[#4CC684]" : "text-[#802424]")}>
                  {formatMetricCurrency(ebitdaYtd)}
                </p>
                <Badge variant="secondary" className="text-[10px] font-normal py-1.5 leading-none text-gray-500 rounded-xl border-gray-400">
                  {(safeDivide(ebitdaYtd, ingresosYtd) * 100).toFixed(1)}% de margen
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
          <WorkInProgressView
            proyecto={proyecto}
            budgetMetrics={budgetMetrics}
            ingresosTotals={ingresosTotals}
          />
        ) : (
          <ProjectProfitabilityView summary={profitabilitySummary} />
        )}
      </div>
    </div>
  );
}
