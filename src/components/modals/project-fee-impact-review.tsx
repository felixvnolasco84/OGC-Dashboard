import { useState } from "react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FEE_CONCEPT_LABELS } from "../../../convex/feeConceptRules";

export type FeeImpact = Extract<FunctionReturnType<typeof api.desarrollos.previewFeeImpact>, { status: "ready" }>;

function money(amount: number, currency: string) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency, minimumFractionDigits: 2 }).format(amount);
}

function AmountRow({ label, before, after, currency }: { label: string; before: number; after: number; currency: string }) {
  const difference = after - before;
  const unchanged = Math.abs(difference) < 0.005;
  return <div className="grid gap-2 border-b py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
    <dt className="text-muted-foreground">{label}</dt>
    <dd className="min-w-0 space-y-1 sm:text-right">
      <div className="flex flex-wrap items-baseline gap-x-2 sm:justify-end">
        <span className="text-muted-foreground"><span className="sr-only">Actual: </span>{money(before, currency)}</span>
        <span aria-hidden="true">→</span>
        <strong className="font-medium"><span className="sr-only">Propuesto: </span>{money(after, currency)}</strong>
      </div>
      <p className="text-xs">{unchanged ? "Sin cambio" : `Diferencia: ${difference > 0 ? "+" : ""}${money(difference, currency)}`}</p>
    </dd>
  </div>;
}

export default function ProjectFeeImpactReview({ impact, partidas }: { impact: FeeImpact; partidas: Doc<"partidas">[] }) {
  const [month, setMonth] = useState("all");
  const months = Object.keys(impact.afterPnl.monthly).concat(Object.keys(impact.beforePnl.monthly))
    .filter((key, index, keys) => keys.indexOf(key) === index).sort((a, b) => {
      const [ay, am] = a.split("-").map(Number), [by, bm] = b.split("-").map(Number);
      return ay - by || am - bm;
    });
  const empty = { baseHonorarios: 0, baseIndirectos: 0, honorarios: 0, indirectosAutomaticos: 0,
    indirectosHistoricos: 0, indirectos: 0, costoHistorico: 0, costosReales: 0, saldoIndirectos: 0, ebitda: 0 };
  const selectedMonth = months.includes(month) ? month : "all";
  const beforePnl = selectedMonth === "all" ? impact.beforePnl : impact.beforePnl.monthly[selectedMonth] || empty;
  const afterPnl = selectedMonth === "all" ? impact.afterPnl : impact.afterPnl.monthly[selectedMonth] || empty;
  const name = (id: string) => partidas.find(p => p._id === id)?.nombre || "Partida no disponible";
  const added = impact.afterConfig.excluded_partidas_honorarios.filter(id => !impact.beforeConfig.excluded_partidas_honorarios.includes(id));
  const removed = impact.beforeConfig.excluded_partidas_honorarios.filter(id => !impact.afterConfig.excluded_partidas_honorarios.includes(id));
  const percent = (value: number | null) => value === null ? "Sin activar" : `${value}%`;
  const mode = (value: string) => value === "automatico" ? "Automático por porcentaje" : "Por transacciones de HONORARIOS";
  const budgetRows = [
    ["Honorarios", "honorarios"], ["Cargo automático de indirectos", "indirectos"],
    ["Manuales sustituidos en los totales", "manualesSustituidos"], ["Gasto total", "gasto_total"], ["Por gastar", "por_gastar"],
  ] as const;
  const pnlRows = [["Honorarios porcentuales", "honorarios"], ["Indirectos automáticos", "indirectosAutomaticos"],
    ["Indirectos históricos reconocidos", "indirectosHistoricos"], ["Costo histórico de indirectos", "costoHistorico"],
    ["Costos reales de indirectos", "costosReales"], ["Saldo de indirectos", "saldoIndirectos"], ["EBITDA", "ebitda"]] as const;
  return <section aria-label="Impacto financiero" className="space-y-4 border p-4 text-sm" data-fee-impact>
    <div>
      <h2 className="font-medium">Impacto al guardar</h2>
      <p className="mt-1 text-xs text-muted-foreground">Actual → Propuesto · El guardado aplica a todo el proyecto.</p>
    </div>
    <details open={!impact.afterConfig.fee_concepts?.length} className="space-y-2 text-xs">
      <summary className="min-h-11 cursor-pointer py-2 font-medium">Configuración anterior y periodos históricos</summary>
      <dl className="space-y-2">
      <div><dt className="text-muted-foreground">Modo de honorarios en Presupuesto</dt><dd>{mode(impact.beforeConfig.honorarios_modo)} → {mode(impact.afterConfig.honorarios_modo)}</dd></div>
      <div><dt className="text-muted-foreground">Porcentaje de honorarios</dt><dd>{impact.beforeConfig.honorarios_porcentaje ?? 0}% → {impact.afterConfig.honorarios_porcentaje ?? 0}%</dd></div>
      <div><dt className="text-muted-foreground">Indirectos</dt><dd>{percent(impact.beforeConfig.indirectos_porcentaje)} → {percent(impact.afterConfig.indirectos_porcentaje)} · Inicio: {impact.afterConfig.indirectos_fecha_inicio || "Sin activar"}</dd></div>
      <div><dt className="text-muted-foreground">Exclusiones compartidas de nivel 1 y descendientes</dt><dd>{added.length ? `Se excluyen: ${added.map(name).join(", ")}. ` : ""}{removed.length ? `Se incluyen: ${removed.map(name).join(", ")}.` : ""}{!added.length && !removed.length ? "Se conservan las exclusiones actuales." : ""}</dd></div>
      </dl>
    </details>
    {[...(impact.afterConfig.fee_concepts || [])].sort((a,b) => Object.keys(FEE_CONCEPT_LABELS).indexOf(a.concepto) - Object.keys(FEE_CONCEPT_LABELS).indexOf(b.concepto)).map(concept => <div key={concept.concepto} className="space-y-1 border p-3 text-xs" data-testid={`concept-review-${concept.concepto}`}>
      <h3 className="text-sm font-medium">{FEE_CONCEPT_LABELS[concept.concepto]} · {name(concept.partida_id)}</h3>
      <p>Monto original: {money(concept.monto_original, impact.budgetCurrency)} · Aprobado total: {money(concept.base_aprobada ?? concept.base_original, impact.budgetCurrency)}</p>
      <p>Porcentaje propuesto: {concept.porcentaje.toLocaleString("es-MX", { maximumFractionDigits: 6 })}% · Inicio: {concept.fecha_inicio}</p>
      <p>Todas las partidas integran la base. La tasa se actualiza automáticamente al cambiar el presupuesto aprobado.</p>
      <p>Tasa aprobada anterior: {(impact.beforeConfig.fee_concepts || []).some(c => c.concepto === concept.concepto) ? `${(impact.beforeConfig.fee_concepts || []).find(c => c.concepto === concept.concepto)!.porcentaje.toLocaleString("es-MX", { maximumFractionDigits: 6 })}%` : "Sin configurar"}</p>
    </div>)}
    {impact.beforeConfig.indirectos_porcentaje === null && impact.afterConfig.indirectos_porcentaje !== null && <p className="border-l-2 border-foreground pl-3 text-xs" role="status">La activación sustituye componentes manuales desde la fecha de inicio, incluso al 0%. Los registros no se eliminan.</p>}
    <div>
      <h3 className="font-medium">Presupuesto · {impact.budgetCurrency}</h3>
      <p className="mt-1 text-xs text-muted-foreground">Acumulado completo. Los conceptos desde presupuesto se aplican a pagos Pagado; la configuración anterior de honorarios conserva su tratamiento histórico. El gasto afecta también las métricas de Control.</p>
      <dl className="mt-2">{budgetRows.map(([label, key]) => <AmountRow key={key} label={label} before={impact.beforeBudget[key]} after={impact.afterBudget[key]} currency={impact.budgetCurrency} />)}</dl>
    </div>
    <div className="border-t pt-4">
      <h3 className="font-medium">P&amp;L · MXN</h3>
      <p className="mt-1 text-xs text-muted-foreground">Pagos de transacciones Pagado. {impact.period.start ? `${impact.period.start} a ${impact.period.end}.` : "Sin registros fechados."} Honorarios siempre usa el porcentaje, independientemente del modo de Presupuesto.</p>
      <div className="mt-3 space-y-1">
        <Label htmlFor="fee-impact-month">Periodo de revisión de P&amp;L</Label>
        <Select value={selectedMonth} onValueChange={setMonth}>
          <SelectTrigger id="fee-impact-month"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">Acumulado completo</SelectItem>{months.map(key => <SelectItem key={key} value={key}>{key.split("-")[0]}-{key.split("-")[1].padStart(2, "0")}</SelectItem>)}</SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">El filtro mensual no limita el alcance del guardado.</p>
      </div>
      <dl className="mt-2">{pnlRows.map(([label, key]) => <AmountRow key={key} label={label} before={beforePnl[key]} after={afterPnl[key]} currency="MXN" />)}</dl>
    </div>
    <details className="border-t pt-3">
      <summary className="min-h-11 cursor-pointer py-2 font-medium">Ver bases y alcance del cálculo</summary>
      <dl>
        <AmountRow label="Base de honorarios en Presupuesto / conceptos HONORARIOS" before={impact.beforeBudget.honorariosBase} after={impact.afterBudget.honorariosBase} currency={impact.budgetCurrency} />
        <AmountRow label="Importes excluidos de honorarios en Presupuesto" before={impact.beforeBudget.honorariosExcluidos} after={impact.afterBudget.honorariosExcluidos} currency={impact.budgetCurrency} />
        <AmountRow label="Base de indirectos en Presupuesto" before={impact.beforeBudget.indirectosBase} after={impact.afterBudget.indirectosBase} currency={impact.budgetCurrency} />
        <AmountRow label="Base de honorarios en P&L" before={beforePnl.baseHonorarios} after={afterPnl.baseHonorarios} currency="MXN" />
        <AmountRow label="Base de indirectos en P&L" before={beforePnl.baseIndirectos} after={afterPnl.baseIndirectos} currency="MXN" />
      </dl>
      <div className="mt-3 space-y-2 text-xs text-muted-foreground">
        <p>{impact.counts.transactions} transacciones · {impact.counts.paid} Pagado · {impact.counts.payments} conceptos. Sin datos, los cargos calculados son cero.</p>
        <p>Presupuesto: efecto neto de indirectos = cargo automático − manuales sustituidos. P&amp;L conserva el tratamiento histórico anterior al inicio y omite ingresos manuales de indirectos del periodo automático. Los costos reales provienen de movimientos OGC.</p>
        <p>La configuración anterior de honorarios suma importes registrados sin conversión. Los conceptos desde presupuesto usan la moneda del proyecto. {impact.currencies.length > 1 ? `Hay monedas mixtas: ${impact.currencies.join(", ")}. ` : ""}P&amp;L convierte a MXN con el tipo de cambio del registro o respaldo USD {impact.rates.USD}, EUR {impact.rates.EUR}; otras tasas de consulta pueden dar importes diferentes.</p>
        {Math.abs(impact.beforeBudget.honorarios - impact.beforeBudget.honorariosSegunReglas) >= .005 && <p>El honorario actual difiere del cálculo con los registros actuales. El guardado financiero también lo recalculará; ese ajuste está incluido en el importe propuesto.</p>}
        {impact.counts.invalidDates > 0 && <p>{impact.counts.invalidDates} transacciones tienen fechas no válidas para P&amp;L y no se incluyen en ese contexto.</p>}
      </div>
    </details>
  </section>;
}
