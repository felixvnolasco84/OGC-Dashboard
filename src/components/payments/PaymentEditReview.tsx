import type { PaymentEditReview as Review } from "../../../convex/paymentEdit";
import { formatMoney } from "@/lib/money";

const fieldLabels: Record<string, string> = { fecha: "Fecha", status: "Estado", moneda: "Moneda", tipo_cambio: "Tipo de cambio",
  tipo_pago: "Método de pago", categoria: "Categoría", banco: "Banco", numero_cuenta: "Cuenta", clabe: "CLABE", tarjeta: "Tarjeta",
  numero_transferencia: "Número de transferencia", codigo_referencia: "Referencia", factura: "Factura", comprobante: "Comprobante" };
const money = (value: number, currency: string) => `${formatMoney(value, currency)} ${currency}`;
function Comparison({ label, before, after }: { label: string; before: string; after: string }) {
  return <div className="grid grid-cols-1 gap-1 border-b py-3 text-sm sm:grid-cols-[1fr_1fr_1fr] sm:gap-3">
    <span className="font-medium">{label}</span>
    <span className="break-all text-muted-foreground"><span className="sm:sr-only">Antes: </span>{before || "—"}</span>
    <span className="break-all font-medium"><span className="sm:sr-only">Después: </span>{after || "—"}</span>
  </div>;
}
export default function PaymentEditReview({ review, contextIds }: { review: Review; contextIds: string[] }) {
  const changedAmounts = review.concepts.filter(p => p.before !== p.after);
  const changed = review.concepts.filter(p => p.before !== p.after || p.conceptoBefore !== p.conceptoAfter);
  const beforeCurrency = review.before.moneda, afterCurrency = review.after.moneda;
  const subtotal = (after: boolean) => review.concepts.filter(p => contextIds.includes(p.id)).reduce((sum, p) => sum + (after ? p.after : p.before), 0);
  return <section aria-label="Comparación de impacto" className="space-y-6">
    <div className="border bg-muted/30 p-4">
      <h3 className="text-base font-semibold">Revisa antes de confirmar</h3>
      <p className="mt-1 text-sm text-muted-foreground">Se guardarán juntos los conceptos y los datos de la transacción.</p>
      <div className="mt-3 hidden grid-cols-3 gap-3 text-xs text-muted-foreground sm:grid"><span>Cambio</span><span>Antes</span><span>Después</span></div>
      <Comparison label="Total completo" before={money(review.before.monto_total, beforeCurrency)} after={money(review.after.monto_total, afterCurrency)} />
      {beforeCurrency === afterCurrency && <p className="mt-2 text-sm">Diferencia: {money(review.after.monto_total - review.before.monto_total, afterCurrency)}</p>}
      {contextIds.length < review.concepts.length && <Comparison label="Parte del contexto de origen" before={money(subtotal(false), beforeCurrency)} after={money(subtotal(true), afterCurrency)} />}
    </div>
    <section>
      <h3 className="font-semibold">Conceptos modificados · {changed.length}</h3>
      {changed.map(p => <div key={p.id} className="mt-3"><p className="text-sm font-medium">{p.label}</p>
        {p.conceptoBefore !== p.conceptoAfter && <Comparison label="Concepto" before={p.conceptoBefore || ""} after={p.conceptoAfter || ""} />}
        {p.before !== p.after && <><Comparison label="Monto" before={money(p.before, beforeCurrency)} after={money(p.after, afterCurrency)} />
          {beforeCurrency === afterCurrency && <p className="mt-1 text-xs text-muted-foreground">Diferencia: {money(p.after - p.before, afterCurrency)}</p>}</>}
      </div>)}
      <p className="mt-3 text-sm text-muted-foreground">{review.concepts.length - changedAmounts.length} concepto{review.concepts.length - changedAmounts.length === 1 ? " conserva su monto" : "s conservan sus montos"}. Las partidas asignadas se conservan.</p>
    </section>
    <section><h3 className="font-semibold">Datos de la transacción</h3>
      {Object.entries(fieldLabels).filter(([key]) => review.before[key as keyof Review["before"]] !== review.after[key as keyof Review["after"]]).map(([key, label]) =>
        <Comparison key={key} label={label} before={String(review.before[key as keyof Review["before"]] ?? "")} after={String(review.after[key as keyof Review["after"]] ?? "")} />)}
      {review.before.proveedor_id !== review.after.proveedor_id && <Comparison label="Proveedor" before={review.providerBefore} after={review.providerAfter} />}
      {review.before.payment_account_id !== review.after.payment_account_id && <Comparison label="Asociación de cuenta" before={review.before.payment_account_id ? "Cuenta de biblioteca" : "Datos manuales"} after={review.after.payment_account_id ? "Cuenta de biblioteca" : "Datos manuales / sin asociación"} />}
      <p className="mt-3 text-sm text-muted-foreground">Estado, fecha y moneda se aplican a todos los conceptos. Los demás datos no modificados se conservan.</p>
      {beforeCurrency !== afterCurrency && <p className="mt-2 text-sm">Los montos nominales se conservan al cambiar moneda; no se convierten automáticamente.</p>}
    </section>
    {review.hierarchy.length > 0 && <section><h3 className="font-semibold">Partidas y Control</h3>
      <p className="mt-1 text-xs text-muted-foreground">Agregación nominal vigente; sólo los conceptos Pagado cuentan como pagado.</p>
      {review.hierarchy.map(p => <div key={p.id} className="mt-3"><p className="text-sm font-medium">{p.label}</p>
        <Comparison label="Pagado" before={money(p.pagadoBefore, review.beforeBudgetCurrency)} after={money(p.pagadoAfter, review.afterBudgetCurrency)} />
        <Comparison label="Por ejercer" before={money(p.remainingBefore, review.beforeBudgetCurrency)} after={money(p.remainingAfter, review.afterBudgetCurrency)} /></div>)}
    </section>}
    <section><h3 className="font-semibold">Presupuesto del proyecto</h3>
      {([ ["gasto_total", "Gasto total"], ["por_gastar", "Por ejercer"], ["honorarios", "Honorarios según configuración"], ["indirectos", "Indirectos automáticos"], ["manualesSustituidos", "Indirectos manuales sustituidos"] ] as const).map(([key, label]) =>
        <Comparison key={key} label={label} before={money(review.beforeBudget[key], review.beforeBudgetCurrency)} after={money(review.afterBudget[key], review.afterBudgetCurrency)} />)}
    </section>
    <section><h3 className="font-semibold">Contribución de esta transacción a P&amp;L</h3>
      <p className="mt-1 text-xs text-muted-foreground">En MXN, con las reglas de elegibilidad del reporte. No es el total consolidado. Tasa aplicada: {review.rateBefore} → {review.rateAfter} MXN por unidad.</p>
      {([ ["totalPagado", "Pagado"], ["honorarios", "Honorarios por porcentaje"], ["indirectos", "Indirectos"], ["costosDirectosObra", "Costos directos"] ] as const).map(([key, label]) =>
        <Comparison key={key} label={label} before={money(review.beforePnl[key], "MXN")} after={money(review.afterPnl[key], "MXN")} />)}
      {[...new Set([...Object.keys(review.beforePnl.monthly), ...Object.keys(review.afterPnl.monthly)])].sort().map(month => <div key={month} className="mt-3 text-sm">
        <p className="font-medium">Periodo {month}</p>
        <Comparison label="Honorarios" before={money(review.beforePnl.monthly[month]?.honorarios || 0, "MXN")} after={money(review.afterPnl.monthly[month]?.honorarios || 0, "MXN")} />
        <Comparison label="Indirectos" before={money(review.beforePnl.monthly[month]?.indirectos || 0, "MXN")} after={money(review.afterPnl.monthly[month]?.indirectos || 0, "MXN")} />
      </div>)}
    </section>
    <p className="border p-3 text-sm">{review.invoiceCount > 0 ? `${review.invoiceCount} análisis de factura ${review.invoiceCount === 1 ? "quedará obsoleto y requerirá" : "quedarán obsoletos y requerirán"} nueva revisión.` : "No hay análisis de factura vigentes que invalidar con estos cambios."}</p>
    {review.warnings.map(w => <p key={w} className="text-sm text-warning">{w}</p>)}
  </section>;
}
