import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { deriveFeeConcepts, FEE_CONCEPT_LABELS, type FeeConceptInput, type FeeConceptConfig, type FeeConceptKind } from "../../../convex/feeConceptRules";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const matches = (name: string, kind: FeeConceptKind) => {
  const value = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return ({ honorarios: /^honorarios(?:\s|$)/, indirectos: /indirecto/, general_conditions: /general condition|condicion(?:es)? general/, viaticos: /viatico/ })[kind].test(value.trim());
};
const money = (value: number, currency: string) => new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(value);
export default function FeeConceptEditor({ value, approved, partidas, currency, onChange }: {
  value: FeeConceptInput[]; approved: readonly FeeConceptConfig[]; partidas: Doc<"partidas">[]; currency: string;
  onChange: (value: FeeConceptInput[]) => void;
}) {
  const roots = partidas.filter(p => p.nivel === 1);
  const update = (kind: FeeConceptKind, patch: Partial<FeeConceptInput>) => onChange(value.map(c => c.concepto === kind ? { ...c, ...patch } : c));
  return <div className="space-y-4 border-t pt-4">
    <div className="space-y-1">
      <h3 className="text-base font-medium">Porcentajes sobre presupuesto aprobado</h3>
      <p className="text-xs text-muted-foreground">Porcentaje = monto original del concepto ÷ presupuesto aprobado total del proyecto × 100. Se consideran todas las partidas.</p>
      <p className="text-xs text-muted-foreground">Al cambiar el presupuesto aprobado, los porcentajes y cargos se actualizan automáticamente. Los cargos se aplican a todos los pagos Pagado desde el 1 de octubre de 2026.</p>
      <p className="text-xs text-muted-foreground">El cargo se distribuye entre familias y subpartidas según sus montos originales; el total es la suma del desglose.</p>
    </div>
    {(Object.keys(FEE_CONCEPT_LABELS) as FeeConceptKind[]).map(kind => {
      const current = value.find(c => c.concepto === kind);
      const old = approved.find(c => c.concepto === kind);
      let calculation: FeeConceptConfig | undefined, error = "";
      if (current) {
        try { calculation = deriveFeeConcepts([current], roots, approved)[0]; }
        catch (failure) { error = failure instanceof Error ? failure.message : "Revisa la base del concepto."; }
      }
      return <div key={kind} className="space-y-3 border p-3">
        <div className="flex min-h-11 items-center gap-2">
          <Checkbox id={`configure-${kind}`} checked={Boolean(current)} onCheckedChange={checked => {
            if (!checked) { onChange(value.filter(c => c.concepto !== kind)); return; }
            const source = roots.find(p => matches(p.nombre, kind));
            onChange([...value, { concepto: kind, partida_id: source?._id || "" as Id<"partidas">, excluded_partidas: [] }]);
          }} />
          <Label htmlFor={`configure-${kind}`}>Calcular {FEE_CONCEPT_LABELS[kind]} desde presupuesto</Label>
        </div>
        {current && <>
          <Label htmlFor={`source-${kind}`}>Partida de {FEE_CONCEPT_LABELS[kind]}</Label>
          <Select value={current.partida_id || undefined} onValueChange={id => update(kind, { partida_id: id as Id<"partidas"> })}>
            <SelectTrigger id={`source-${kind}`}><SelectValue placeholder="Selecciona una partida" /></SelectTrigger>
            <SelectContent>{roots.map(root => <SelectItem key={root._id} value={root._id}>{root.nombre}</SelectItem>)}</SelectContent>
          </Select>
          {calculation && <dl className="space-y-1 text-sm" aria-live="polite">
            <div><dt className="inline text-muted-foreground">Monto original: </dt><dd className="inline">{money(calculation.monto_original, currency)}</dd></div>
            <div><dt className="inline text-muted-foreground">Presupuesto aprobado total: </dt><dd className="inline">{money(calculation.base_aprobada!, currency)}</dd></div>
            <div><dt className="inline text-muted-foreground">Porcentaje calculado: </dt><dd className="inline font-medium" data-testid={`rate-${kind}`}>{calculation.porcentaje.toLocaleString("es-MX", { maximumFractionDigits: 6 })}%</dd></div>
            {old && <div><dt className="inline text-muted-foreground">Tasa actual: </dt><dd className="inline">{old.porcentaje.toLocaleString("es-MX", { maximumFractionDigits: 6 })}%</dd></div>}
          </dl>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </>}
      </div>;
    })}
  </div>;
}
