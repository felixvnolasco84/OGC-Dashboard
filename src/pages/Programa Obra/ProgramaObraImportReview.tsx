import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ExcelRow } from "./ProgramaObraExcelPreview";

export default function ProgramaObraImportReview({ proyecto, rows, schedules, details, onCancel, onApply, busy }: {
  proyecto: Id<"desarrollos">; rows: ExcelRow[]; schedules: Doc<"programa_obra">[]; details: Doc<"programa_obra_detalle">[];
  onCancel: () => void; onApply: (rows: ExcelRow[], fingerprint: string) => Promise<void>; busy: boolean;
}) {
  const [mapped, setMapped] = useState(rows);
  const preview = useQuery(api.programa_obra.previewExcelImport, { proyecto, rows: mapped });
  const mapExisting = (index: number, value: string) => {
    const id = value === "__auto__" ? undefined : value;
    setMapped((current) => current.map((item, i) => i !== index ? item : item.nivel === 1
      ? { ...item, programa_obra_id: id as Id<"programa_obra"> | undefined }
      : { ...item, detalle_id: id as Id<"programa_obra_detalle"> | undefined }));
  };
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onCancel(); }}><DialogContent className="max-h-[90dvh] max-w-4xl overflow-y-auto"><DialogHeader><DialogTitle>Revisar cambios del Excel</DialogTitle><DialogDescription>Confirma las coincidencias. Para un cambio de nombre, selecciona el registro existente y conserva su avance e historial.</DialogDescription></DialogHeader>
    {!preview ? <p role="status">Comprobando actividades y fechas…</p> : <>
      <div className="space-y-3">{preview.rows.map((row, index) => <div key={index} className="space-y-2 border border-border p-3">
        <p className="text-sm"><strong>{row.name}</strong> · {row.status === "create" ? "Alta" : row.status === "update" ? "Cambio" : "Revisar"}</p>
        <label className="block min-w-0 space-y-1 text-xs">
          <span>Coincidencia existente</span>
          <Select disabled={busy} value={(mapped[index].nivel === 1 ? mapped[index].programa_obra_id : mapped[index].detalle_id) || "__auto__"} onValueChange={(value) => mapExisting(index, value)}>
            <SelectTrigger aria-label={`Coincidencia existente de ${row.name}`} className="min-h-11 min-w-0 bg-background"><SelectValue /></SelectTrigger>
            <SelectContent className="max-w-[calc(100vw-2rem)]">
              <SelectItem value="__auto__">Detectar por nombre</SelectItem>
              {mapped[index].nivel === 1
                ? schedules.filter((s) => !s.archived).map((s) => <SelectItem key={s._id} value={s._id}>{details.find((d) => d.programa_obra_id === s._id)?.partida ?? s._id}</SelectItem>)
                : details.filter((d) => !d.archived && d.nivel === mapped[index].nivel).map((d) => <SelectItem key={d._id} value={d._id}>{d.partida} · {d.familia}{d.subpartida ? ` · ${d.subpartida}` : ""}</SelectItem>)}
            </SelectContent>
          </Select>
        </label>
        {row.issues.map((issue) => <p className="text-sm text-red-700" key={issue}>{issue}</p>)}
      </div>)}</div>
      {preview.warnings.map((warning) => <p className="text-sm text-amber-800" key={warning}>{warning}</p>)}
      {!!preview.absent.length && <details className="border border-border p-3"><summary className="cursor-pointer text-sm">{preview.absent.length} registros ausentes: seguirán activos</summary><ul className="mt-2 list-disc pl-5 text-sm">{preview.absent.map((row) => <li key={row.id}>{row.name}</li>)}</ul><p className="mt-2 text-xs">Archívalos desde el detalle después de resolver sus relaciones.</p></details>}
      {preview.proposal && <div className="space-y-2"><h3 className="text-sm font-medium">Impacto en fechas</h3>{preview.proposal.changes.map((c) => <p className="text-sm" key={c.activity_id}>{c.name}: {c.old_start ?? "Sin inicio"} / {c.old_finish ?? "Sin fin"} → {c.start} / {c.finish}</p>)}{preview.proposal.problems.map((p, i) => <p className="text-sm text-red-700" key={i}>{p.message}</p>)}</div>}
    </>}
    <DialogFooter><Button variant="outline" disabled={busy} onClick={onCancel}>Cancelar</Button><Button disabled={busy || !preview?.canApply} onClick={() => preview && void onApply(mapped, preview.fingerprint)}>{busy ? "Aplicando…" : "Aplicar cambios revisados"}</Button></DialogFooter>
  </DialogContent></Dialog>;
}
