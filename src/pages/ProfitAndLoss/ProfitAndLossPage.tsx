import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
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
  };
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

const formatMultiplier = (value?: number) => {
  if (value === undefined || !Number.isFinite(value) || value === 0) return "-";
  return `${value.toFixed(2)}x`;
};

const formatRunway = (value?: number) => {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return "-";
  return `${value.toFixed(1)} sem`;
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
  honorariosYtd: number,
  indirectosYtd: number,
  estructuraYtd: number
): PnlRow[] => {
  const monthCount = months.length;
  const ingresosYtd = honorariosYtd + indirectosYtd;
  const monthlyIngresos = spreadEvenly(ingresosYtd, monthCount);
  const monthlyHonorarios = spreadEvenly(honorariosYtd, monthCount);
  const monthlyIndirectos = spreadEvenly(indirectosYtd, monthCount);
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

  const pnlSummary = useQuery(api.desarrollos.getPnlSummary) as PnlSummary | undefined;
  const profitabilitySummary = useQuery(api.desarrollos.getProfitabilitySummary);

  const months = useMemo(() => buildMonths(), []);
  const honorariosYtd = safeNumber(pnlSummary?.totals.honorarios);
  const indirectosYtd = safeNumber(pnlSummary?.totals.indirectos);
  const ingresosYtd = safeNumber(pnlSummary?.totals.ingresosOgc);
  const estructuraYtd = safeNumber(pnlSummary?.totals.costosEstructuraOgc);
  const ebitdaYtd = safeNumber(pnlSummary?.totals.ebitda);
  const rows = useMemo(
    () => buildMonthlyRows(months, honorariosYtd, indirectosYtd, estructuraYtd),
    [months, honorariosYtd, indirectosYtd, estructuraYtd]
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
