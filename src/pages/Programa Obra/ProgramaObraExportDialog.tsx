import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ProgramaItem } from "./programa-obra-types";

export type ProgramaObraExportSelection = {
  breakdownIds: ReadonlySet<string>;
  includeNotices: boolean;
};

type Props = {
  items: ProgramaItem[];
  onCancel: () => void;
  onExport: (selection: ProgramaObraExportSelection) => void;
};

export default function ProgramaObraExportDialog({ items, onCancel, onExport }: Props) {
  const expandableItems = items.filter((item) => item.children.length > 0);
  const [breakdownIds, setBreakdownIds] = useState<Set<string>>(
    () => new Set(expandableItems.map((item) => item.id)),
  );
  const [includeNotices, setIncludeNotices] = useState(true);

  const togglePartida = (id: string, checked: boolean) => {
    setBreakdownIds((previous) => {
      const next = new Set(previous);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent data-viewer-readonly-allow="true" className="rounded-none">
        <DialogHeader>
          <DialogTitle>Exportar programa a PDF</DialogTitle>
          <DialogDescription>
            Se incluirá el programa completo. Selecciona las partidas que quieres desglosar
            en familias; las demás aparecerán resumidas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">Partidas a desglosar</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" className="rounded-none"
                disabled={expandableItems.length === 0}
                onClick={() => setBreakdownIds(new Set(expandableItems.map((item) => item.id)))}>
                Seleccionar todas
              </Button>
              <Button type="button" variant="outline" size="sm" className="rounded-none"
                disabled={breakdownIds.size === 0}
                onClick={() => setBreakdownIds(new Set())}>
                Quitar selección
              </Button>
            </div>
          </div>

          <div className="max-h-[35dvh] overflow-y-auto border border-border">
            {expandableItems.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">No hay partidas con familias para desglosar.</p>
            ) : expandableItems.map((item) => (
              <label key={item.id} className="flex min-h-11 cursor-pointer items-center gap-3 border-b border-border p-3 last:border-b-0">
                <Checkbox checked={breakdownIds.has(item.id)}
                  onCheckedChange={(checked) => togglePartida(item.id, checked === true)}
                  aria-label={`Desglosar ${item.partida}`} />
                <span className="min-w-0 flex-1 break-words text-sm">{item.partida}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{item.children.length} familias</span>
              </label>
            ))}
          </div>
        </div>

        <label className="flex min-h-11 cursor-pointer items-start gap-3 border-t border-border pt-4">
          <Checkbox checked={includeNotices} onCheckedChange={(checked) => setIncludeNotices(checked === true)}
            aria-label="Incluir avisos y comentarios" className="mt-0.5" />
          <span className="space-y-1">
            <span className="block text-sm font-medium">Incluir avisos y comentarios</span>
            <span className="block text-xs text-muted-foreground">
              Anticipo, suministro, finiquito y comentarios del programa, incluido el anexo.
            </span>
          </span>
        </label>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" className="rounded-none" onClick={onCancel}>Cancelar</Button>
          <Button type="button" className="rounded-none"
            onClick={() => onExport({ breakdownIds: new Set(breakdownIds), includeNotices })}>
            Exportar PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
