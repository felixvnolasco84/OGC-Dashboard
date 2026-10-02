import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { formatCurrency } from "@/lib/utils";
import type { DeletionImpact } from "../../../convex/partidaDeletion";

export type PartidaDeletionDialogProps = {
  open: boolean;
  name: string;
  nivel: number;
  currency: string;
  impact: DeletionImpact | null;
  error: string | null;
  loading: boolean;
  deleting: boolean;
  onClose: () => void;
  onRetry: () => void;
  onConfirm: () => void;
};

export function PartidaDeletionDialog({ open, name, nivel, currency, impact, error, loading, deleting, onClose, onRetry, onConfirm }: PartidaDeletionDialogProps) {
  const label = nivel === 1 ? "partida" : nivel === 2 ? "familia" : "subpartida";
  const countLabel = (count: number, singular: string) => `${count} ${singular}${count === 1 ? "" : "s"}`;
  const canDelete = !loading && !error && impact?.canDelete && impact.verified;
  return (
    <AlertDialog open={open} onOpenChange={value => { if (!value && !deleting) onClose(); }}>
      <AlertDialogContent onEscapeKeyDown={event => { if (deleting) event.preventDefault(); }}>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {impact?.status === "missing" ? "El concepto ya no existe" : impact && !impact.canDelete
              ? `No se puede eliminar la ${label}` : `¿Eliminar ${label}?`}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3" aria-live="polite" aria-busy={loading || deleting}>
              <p className="break-words text-foreground">{impact?.name || name}</p>
              {loading ? <p>Verificando la rama completa y sus datos asociados...</p> : error ? (
                <p role="alert" className="break-words">{error}</p>
              ) : impact?.status === "missing" ? (
                <p>Otro usuario pudo haberlo eliminado. Actualiza tu selección.</p>
              ) : impact ? (
                <>
                  {impact.verified && <p>Se eliminarían {countLabel(impact.scope.partidas, "partida")}, {countLabel(impact.scope.familias, "familia")} y {countLabel(impact.scope.subpartidas, "subpartida")} ({countLabel(impact.scope.total, "registro")}).</p>}
                  {impact.verified && impact.scope.duplicates > 0 && <p>Incluye {countLabel(impact.scope.duplicates, "registro")} {impact.scope.duplicates === 1 ? "duplicado que representa" : "duplicados que representan"} esta misma fila.</p>}
                  {impact.verified && impact.budget && <>
                    <p>Presupuesto original del proyecto: {formatCurrency(impact.budget.before.presupuesto_original, currency)} → {formatCurrency(impact.budget.after.presupuesto_original, currency)}.</p>
                    <p>Presupuesto aprobado del proyecto: {formatCurrency(impact.budget.before.presupuesto_aprobado, currency)} → {formatCurrency(impact.budget.after.presupuesto_aprobado, currency)}.</p>
                  </>}
                  {impact.canDelete ? (
                    <p>Se eliminará toda la rama indicada y se recalcularán sus totales. Esta acción es definitiva y no se puede deshacer.</p>
                  ) : (
                    <>
                      <p>{impact.verified ? "Estos datos o condiciones impiden la eliminación:" : "No fue posible verificar todas las dependencias:"}</p>
                      <ul className="list-disc space-y-1 pl-5">
                        {impact.blockers.map(blocker => <li className="break-words" key={blocker}>{blocker}</li>)}
                      </ul>
                    </>
                  )}
                </>
              ) : null}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>{canDelete ? "Cancelar" : "Cerrar"}</AlertDialogCancel>
          {!loading && !deleting && (error || impact?.status === "blocked") && <Button variant="outline" onClick={onRetry}>Volver a verificar</Button>}
          {canDelete && <AlertDialogAction variant="destructive" disabled={deleting} onClick={event => { event.preventDefault(); onConfirm(); }}>
            {deleting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Eliminando...</> : "Eliminar definitivamente"}
          </AlertDialogAction>}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
