import { useState } from "react";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { deriveFeeConcepts, FEE_CONCEPT_LABELS, type FeeConceptInput, type FeeConceptConfig, type FeeConceptKind } from "../../../convex/feeConceptRules";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatPercentage } from "@/lib/utils";

const matches = (name: string, kind: FeeConceptKind) => {
  const value = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return ({ honorarios: /^honorarios(?:\s|$)/, indirectos: /indirecto/, general_conditions: /general condition|condicion(?:es)? general/, viaticos: /viatico/ })[kind].test(value.trim());
};
const money = (value: number, currency: string) => new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(value);
function ConceptExclusions({ concept, roots, currency, onChange }: {
  concept: FeeConceptInput; roots: Doc<"partidas">[]; currency: string; onChange: (ids: Id<"partidas">[]) => void;
}) {
  const [search, setSearch] = useState("");
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const filtered = roots.filter(root => normalize(root.nombre).includes(normalize(search.trim())));
  const label = FEE_CONCEPT_LABELS[concept.concepto];
  return <details className="space-y-2 text-sm">
    <summary className="min-h-11 cursor-pointer py-2">Partidas excluidas de la base de {label} ({concept.excluded_partidas.length})</summary>
    <Label htmlFor={`exclusion-search-${concept.concepto}`}>Buscar partidas para excluir en {label}</Label>
    <Input id={`exclusion-search-${concept.concepto}`} value={search} onChange={event => setSearch(event.target.value)} placeholder="Nombre de la partida" />
    <div className="max-h-48 space-y-1 overflow-y-auto border p-2">
      {filtered.map(root => <div key={root._id} className="flex min-h-11 items-center gap-2">
        <Checkbox id={`exclude-${concept.concepto}-${root._id}`} checked={concept.excluded_partidas.includes(root._id)} onCheckedChange={checked => onChange(checked
          ? [...new Set([...concept.excluded_partidas, root._id])]
          : concept.excluded_partidas.filter(id => id !== root._id))} />
        <Label htmlFor={`exclude-${concept.concepto}-${root._id}`} className="min-w-0 flex-1 cursor-pointer break-words">
          <span className="sr-only">Excluir de la base de {label}: </span>{root.nombre}
          <span className="block text-xs text-muted-foreground">Aprobado: {money(root.presupuesto_aprobado, currency)}</span>
        </Label>
      </div>)}
      {!filtered.length && <p className="text-xs text-muted-foreground">No hay partidas que coincidan con la búsqueda.</p>}
    </div>
    <p className="text-xs text-muted-foreground">Se resta el aprobado de cada partida seleccionada una sola vez, con sus familias y subpartidas incluidas.</p>
  </details>;
}
export default function FeeConceptEditor({ value, approved, partidas, currency, onChange }: {
  value: FeeConceptInput[]; approved: readonly FeeConceptConfig[]; partidas: Doc<"partidas">[]; currency: string;
  onChange: (value: FeeConceptInput[]) => void;
}) {
  const roots = partidas.filter(p => p.nivel === 1);
  const update = (kind: FeeConceptKind, patch: Partial<FeeConceptInput>) => onChange(value.map(c => c.concepto === kind ? { ...c, ...patch } : c));
  return <div className="space-y-4 border-t pt-4">
    <div className="space-y-1">
      <h3 className="text-base font-medium">Porcentajes sobre presupuesto aprobado</h3>
      <p className="text-xs text-muted-foreground">Porcentaje = monto original del concepto ÷ (presupuesto aprobado total del proyecto − aprobado de las partidas excluidas) × 100.</p>
      <p className="text-xs text-muted-foreground">Al cambiar el presupuesto aprobado, los porcentajes y cargos se actualizan automáticamente. Honorarios, Indirectos, Viáticos y General Conditions usan todos los pagos Pagado del historial del proyecto, sin fecha de inicio.</p>
      <p className="text-xs text-muted-foreground">El cargo se distribuye entre familias y subpartidas según sus montos originales; el total es la suma del desglose.</p>
    </div>
    {(Object.keys(FEE_CONCEPT_LABELS) as FeeConceptKind[]).map(kind => {
      const current = value.find(c => c.concepto === kind);
      const old = approved.find(c => c.concepto === kind);
      let calculation: FeeConceptConfig | undefined, error = "";
      if (current) {
        try { calculation = deriveFeeConcepts([current], roots)[0]; }
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
          <ConceptExclusions concept={current} roots={roots} currency={currency} onChange={ids => update(kind, { excluded_partidas: ids })} />
          {calculation && <dl className="space-y-1 text-sm" aria-live="polite">
            <div><dt className="inline text-muted-foreground">Monto original: </dt><dd className="inline">{money(calculation.monto_original, currency)}</dd></div>
            <div><dt className="inline text-muted-foreground">Presupuesto aprobado total: </dt><dd className="inline">{money(calculation.aprobado_total!, currency)}</dd></div>
            <div><dt className="inline text-muted-foreground">Aprobado excluido: </dt><dd className="inline">{money(calculation.aprobado_excluido!, currency)}</dd></div>
            <div><dt className="inline text-muted-foreground">Base aprobada después de exclusiones: </dt><dd className="inline">{money(calculation.base_aprobada!, currency)}</dd></div>
            <div><dt className="inline text-muted-foreground">Porcentaje calculado: </dt><dd className="inline font-medium" data-testid={`rate-${kind}`}>{formatPercentage(calculation.porcentaje)}</dd></div>
            {old && <div><dt className="inline text-muted-foreground">Tasa actual: </dt><dd className="inline">{formatPercentage(old.porcentaje)}</dd></div>}
          </dl>}
          {calculation?.monto_original === 0 && <p role="status" className="border-l-2 border-foreground pl-3 text-xs" data-testid={`zero-original-${kind}`}>
            El monto original de esta partida es $0; su porcentaje y cargo automático serán $0. Revisa el monto original de la partida en Presupuesto si debe generar un cargo.
          </p>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </>}
      </div>;
    })}
  </div>;
}
