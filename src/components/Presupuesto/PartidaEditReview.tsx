import type { PartidaEditImpact } from "../../../convex/partidaEdit";
import { formatCurrency } from "@/lib/utils";

const labels = { presupuesto_aprobado: "Presupuesto aprobado", sub_partida: "Subpartida", unidad: "Unidad", cantidad: "Cantidad", precio_unitario: "Precio unitario" };

export function PartidaEditReview({ impact }: { impact: PartidaEditImpact }) {
  const money = (n: number) => formatCurrency(n, impact.currency);
  const comparison = (label: string, before: number, after: number, conserved = false) => <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1" key={label}>
    <dt className="text-muted-foreground">{label}</dt>
    <dd className="min-w-0 max-w-full text-right tabular-nums break-words">
      {before === after ? <>{money(after)} <span className="text-xs text-muted-foreground">· {conserved ? "Se conserva" : "Sin cambio"}</span></>
        : <><span className="text-muted-foreground">{money(before)}</span> → <strong className="font-medium">{money(after)}</strong>
          <span className="block text-xs text-muted-foreground">Diferencia: {after - before > 0 ? "+" : ""}{money(after - before)}</span></>}
    </dd>
  </div>;
  return <section aria-label="Comparación de impacto" className="space-y-4 border-t pt-4" data-partida-edit-review>
    <div>
      <h3 className="text-sm font-medium">Cambios al guardar</h3>
      <p className="mt-1 text-xs text-muted-foreground">{impact.projectName} · {impact.currency}</p>
      <p className="mt-1 text-sm break-words">{impact.path.join(" › ")}</p>
      <p className="mt-2 text-xs text-muted-foreground">Impacto sobre el presupuesto completo del proyecto. Los filtros de la tabla no limitan esta edición.</p>
    </div>
    <dl className="space-y-3 text-sm">
      {impact.changedFields.map(change => <div key={change.field} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <dt className="text-muted-foreground">{labels[change.field]}</dt>
        <dd className="text-right break-words min-w-0 max-w-full">
          <span className="text-muted-foreground">{change.field === "presupuesto_aprobado" || change.field === "precio_unitario" ? money(Number(change.before)) : String(change.before === "" ? "—" : change.before)}</span>
          {" → "}<strong className="font-medium">{change.field === "presupuesto_aprobado" || change.field === "precio_unitario" ? money(Number(change.after)) : String(change.after === "" ? "—" : change.after)}</strong>
        </dd>
      </div>)}
    </dl>
    {impact.hasChildren && <p className="border border-border p-3 text-xs text-muted-foreground">Este importe no se distribuye entre los hijos. Una edición posterior de sus presupuestos puede recalcularlo.</p>}
    <div className="space-y-4">
      {impact.rows.map((row, index) => <div className="border border-border p-3" key={row.id}>
        <h4 className="text-sm font-medium break-words">{row.nivel === 1 ? "Partida" : row.nivel === 2 ? "Familia" : "Subpartida"}: {row.name}
          {impact.rows.filter(r => r.nivel === row.nivel && r.name === row.name).length > 1 && <span className="text-xs text-muted-foreground"> · Registro {index + 1}</span>}</h4>
        <dl className="mt-3 space-y-2 text-sm">
          {comparison("Aprobado", row.before.presupuesto_aprobado, row.after.presupuesto_aprobado)}
          {comparison("Por gastar", row.before.por_gastar, row.after.por_gastar)}
          {comparison("Pagado registrado", row.before.pagado, row.after.pagado, true)}
          {row.before.presupuesto_original !== row.after.presupuesto_original && comparison("Original recalculado", row.before.presupuesto_original, row.after.presupuesto_original)}
        </dl>
        {row.after.por_gastar < 0 && <p className="mt-2 text-xs text-destructive">El pagado supera el aprobado; el por gastar queda negativo.</p>}
      </div>)}
      <div className="border border-border p-3">
        <h4 className="text-sm font-medium">Total del proyecto</h4>
        <dl className="mt-3 space-y-2 text-sm">
          {comparison("Aprobado", impact.project.before.presupuesto_aprobado, impact.project.after.presupuesto_aprobado)}
          {comparison("Gasto total", impact.project.before.gasto_total, impact.project.after.gasto_total)}
          {comparison("Por gastar", impact.project.before.por_gastar, impact.project.after.por_gastar)}
          {impact.project.before.presupuesto_original !== impact.project.after.presupuesto_original && comparison("Original recalculado", impact.project.before.presupuesto_original, impact.project.after.presupuesto_original)}
          {impact.project.indirectosBefore.automaticos !== impact.project.indirectosAfter.automaticos && comparison("Indirectos automáticos", impact.project.indirectosBefore.automaticos, impact.project.indirectosAfter.automaticos)}
          {impact.project.indirectosBefore.manualesSustituidos !== impact.project.indirectosAfter.manualesSustituidos && comparison("Indirectos manuales sustituidos", impact.project.indirectosBefore.manualesSustituidos, impact.project.indirectosAfter.manualesSustituidos)}
        </dl>
        <p className="mt-3 text-xs text-muted-foreground">El gasto total incorpora honorarios e indirectos según la configuración vigente, una sola vez.</p>
      </div>
    </div>
    {impact.programming.renamed && <div className="border border-border p-3 text-sm">
      <p>{impact.programming.oldNameStillExists ? "Las referencias de Programa conservan el nombre anterior porque todavía existe otra subpartida equivalente."
        : `${impact.programming.count} ${impact.programming.count === 1 ? "detalle de Programa cambiará" : "detalles de Programa cambiarán"} de nombre.`}</p>
      <p className="mt-2 text-xs text-muted-foreground">Se conservan los IDs y los registros históricos. Las vistas vinculadas pueden mostrar el nombre actual.</p>
    </div>}
  </section>;
}
