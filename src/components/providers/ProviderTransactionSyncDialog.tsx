import { useCallback, useEffect, useRef, useState } from "react";
import { useConvex, useMutation } from "convex/react";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type SyncStatus =
  | "matched"
  | "unmatched"
  | "archived"
  | "conflict"
  | "missing_name"
  | "already_assigned";

type SyncCounts = {
  scanned: number;
  matched: number;
  unmatched: number;
  archived: number;
  conflict: number;
  missing_name: number;
  already_assigned: number;
  updated: number;
};

type SyncGroup = {
  status: SyncStatus;
  provider_name: string;
  normalized_name: string;
  provider_id?: Id<"proveedores">;
  matched_provider_name?: string;
  candidate_names: string[];
  transaction_count: number;
};

type SyncReport = {
  counts: SyncCounts;
  groups: SyncGroup[];
};

type SyncPageResponse = SyncReport & {
  isDone: boolean;
  continueCursor: string;
};

type ProjectOption = {
  _id: Id<"desarrollos">;
  nombre: string;
};

const STATUS_ORDER: Record<SyncStatus, number> = {
  matched: 0,
  unmatched: 1,
  archived: 2,
  conflict: 3,
  missing_name: 4,
  already_assigned: 5,
};

function emptyCounts(): SyncCounts {
  return {
    scanned: 0,
    matched: 0,
    unmatched: 0,
    archived: 0,
    conflict: 0,
    missing_name: 0,
    already_assigned: 0,
    updated: 0,
  };
}

function addCounts(target: SyncCounts, source: SyncCounts) {
  for (const key of Object.keys(target) as Array<keyof SyncCounts>) {
    target[key] += source[key];
  }
}

function addGroups(target: Map<string, SyncGroup>, groups: SyncGroup[]) {
  for (const group of groups) {
    const key = [group.status, group.normalized_name, group.provider_id || ""].join("|");
    const current = target.get(key);
    if (current) {
      current.transaction_count += group.transaction_count;
      current.candidate_names = [...new Set([
        ...current.candidate_names,
        ...group.candidate_names,
      ])];
    } else {
      target.set(key, { ...group, candidate_names: [...group.candidate_names] });
    }
  }
}

function makeReport(counts: SyncCounts, groups: Map<string, SyncGroup>): SyncReport {
  return {
    counts: { ...counts },
    groups: [...groups.values()].sort((left, right) => {
      const statusDifference = STATUS_ORDER[left.status] - STATUS_ORDER[right.status];
      if (statusDifference !== 0) return statusDifference;
      return left.provider_name.localeCompare(right.provider_name, "es");
    }),
  };
}

function unresolvedCount(counts: SyncCounts) {
  return counts.unmatched + counts.archived + counts.conflict + counts.missing_name;
}

function statusLabel(status: SyncStatus) {
  switch (status) {
    case "matched": return "Se vinculará";
    case "unmatched": return "No encontrado";
    case "archived": return "Archivado";
    case "conflict": return "Conflicto";
    case "missing_name": return "Sin nombre";
    case "already_assigned": return "Ya asignado";
  }
}

function statusClassName(status: SyncStatus) {
  switch (status) {
    case "matched": return "border-green-200 bg-green-50 text-green-700";
    case "conflict": return "border-red-200 bg-red-50 text-red-700";
    case "unmatched":
    case "archived":
    case "missing_name": return "border-amber-200 bg-amber-50 text-amber-800";
    case "already_assigned": return "border-gray-200 bg-gray-50 text-gray-600";
  }
}

export default function ProviderTransactionSyncDialog({
  open,
  onOpenChange,
  projects,
  initialProjectId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: ProjectOption[];
  initialProjectId?: Id<"desarrollos">;
}) {
  const convex = useConvex();
  const syncPage = useMutation(api.transacciones.syncProvidersPage);
  const previewRun = useRef(0);
  const [scope, setScope] = useState<Id<"desarrollos"> | "all">("all");
  const [preview, setPreview] = useState<SyncReport | null>(null);
  const [result, setResult] = useState<SyncReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [processed, setProcessed] = useState(0);

  const analyze = useCallback(async (selectedScope: Id<"desarrollos"> | "all") => {
    const runId = ++previewRun.current;
    setIsAnalyzing(true);
    setError(null);
    setPreview(null);
    setResult(null);
    try {
      const counts = emptyCounts();
      const groups = new Map<string, SyncGroup>();
      let cursor: string | null = null;
      let isDone = false;
      while (!isDone) {
        const page: SyncPageResponse = await convex.query(api.transacciones.previewProviderSyncPage, {
          proyecto_id: selectedScope === "all" ? undefined : selectedScope,
          cursor,
        });
        if (previewRun.current !== runId) return;
        addCounts(counts, page.counts);
        addGroups(groups, page.groups);
        cursor = page.continueCursor;
        isDone = page.isDone;
      }
      if (previewRun.current === runId) setPreview(makeReport(counts, groups));
    } catch (caught) {
      if (previewRun.current !== runId) return;
      const message = caught instanceof Error ? caught.message : "No fue posible analizar las transacciones.";
      setError(message);
      toast.error("No se pudo preparar la sincronización", { description: message });
    } finally {
      if (previewRun.current === runId) setIsAnalyzing(false);
    }
  }, [convex]);

  useEffect(() => {
    if (!open) {
      previewRun.current += 1;
      return;
    }
    const nextScope = initialProjectId || "all";
    setScope(nextScope);
    setProcessed(0);
    void analyze(nextScope);
  }, [analyze, initialProjectId, open]);

  const handleScopeChange = (value: string) => {
    const nextScope = value === "all" ? "all" : value as Id<"desarrollos">;
    setScope(nextScope);
    setProcessed(0);
    void analyze(nextScope);
  };

  const handleSync = async () => {
    if (!preview || preview.counts.matched === 0) return;
    previewRun.current += 1;
    setIsSyncing(true);
    setError(null);
    setProcessed(0);
    try {
      const counts = emptyCounts();
      const groups = new Map<string, SyncGroup>();
      let cursor: string | null = null;
      let isDone = false;
      while (!isDone) {
        const page: SyncPageResponse = await syncPage({
          proyecto_id: scope === "all" ? undefined : scope,
          cursor,
        });
        addCounts(counts, page.counts);
        addGroups(groups, page.groups);
        setProcessed(counts.scanned);
        cursor = page.continueCursor;
        isDone = page.isDone;
      }
      const completed = makeReport(counts, groups);
      setResult(completed);
      toast.success("Sincronización completada", {
        description: `${completed.counts.updated} transacciones vinculadas con proveedor.`,
      });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "No fue posible completar la sincronización.";
      setError(message);
      toast.error("La sincronización se interrumpió", {
        description: `${message} Puedes volver a ejecutarla de forma segura.`,
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const busy = isAnalyzing || isSyncing;
  const progress = preview?.counts.scanned
    ? Math.min(100, (processed / preview.counts.scanned) * 100)
    : 0;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !busy && onOpenChange(nextOpen)}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-normal">Sincronizar proveedores</DialogTitle>
          <DialogDescription>
            Vincula transacciones existentes por nombre normalizado. No crea proveedores ni transacciones y no reemplaza asignaciones existentes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <p className="text-sm font-medium">Alcance</p>
            <Select value={scope} onValueChange={handleScopeChange} disabled={busy}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los proyectos</SelectItem>
                {projects.map((project) => (
                  <SelectItem key={project._id} value={project._id}>{project.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isAnalyzing && (
            <div className="flex items-center justify-center gap-2 border py-10 text-sm text-gray-600">
              <Loader2 className="h-5 w-5 animate-spin" /> Analizando transacciones y proveedores…
            </div>
          )}

          {error && !busy && (
            <div className="flex items-start gap-2 border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {preview && !result && (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <div className="bg-gray-50 p-3 text-center"><strong className="text-2xl">{preview.counts.scanned}</strong><p className="text-xs text-gray-500">Revisadas</p></div>
                <div className="bg-gray-50 p-3 text-center"><strong className="text-2xl">{preview.counts.scanned - preview.counts.already_assigned}</strong><p className="text-xs text-gray-500">Sin proveedor</p></div>
                <div className="bg-green-50 p-3 text-center"><strong className="text-2xl text-green-700">{preview.counts.matched}</strong><p className="text-xs text-green-700">Se vincularán</p></div>
                <div className="bg-amber-50 p-3 text-center"><strong className="text-2xl text-amber-800">{unresolvedCount(preview.counts)}</strong><p className="text-xs text-amber-800">Pendientes</p></div>
              </div>

              {preview.counts.matched === 0 && (
                <div className="flex items-start gap-2 border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>No hay coincidencias nuevas para sincronizar con el alcance seleccionado.</span>
                </div>
              )}

              <div className="overflow-hidden border">
                <div className="border-b bg-gray-50 px-4 py-3">
                  <h4 className="font-medium">Detalle por nombre de proveedor</h4>
                </div>
                <ScrollArea className="h-80">
                  {preview.groups.length === 0 ? (
                    <p className="p-8 text-center text-sm text-gray-500">No hay transacciones en este alcance.</p>
                  ) : preview.groups.map((group) => (
                    <div key={[group.status, group.normalized_name, group.provider_id || ""].join("|")} className="flex items-start justify-between gap-4 border-b px-4 py-3 last:border-0">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{group.provider_name || "Sin nombre de proveedor"}</p>
                        {group.matched_provider_name && group.matched_provider_name !== group.provider_name && (
                          <p className="text-xs text-gray-500">Coincide con {group.matched_provider_name}</p>
                        )}
                        {group.candidate_names.length > 0 && group.status !== "matched" && (
                          <p className="text-xs text-gray-500">Candidatos: {group.candidate_names.join(", ")}</p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge variant="outline" className={statusClassName(group.status)}>{statusLabel(group.status)}</Badge>
                        <span className="w-10 text-right text-sm tabular-nums">{group.transaction_count}</span>
                      </div>
                    </div>
                  ))}
                </ScrollArea>
              </div>
            </>
          )}

          {isSyncing && (
            <div className="space-y-3 border p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Sincronizando por lotes…</span>
                <span>{processed} de {preview?.counts.scanned || 0}</span>
              </div>
              <Progress value={progress} />
              <p className="text-xs text-gray-500">La operación puede reanudarse de forma segura si se interrumpe.</p>
            </div>
          )}

          {result && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 border border-green-200 bg-green-50 p-4 text-green-800">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <p className="font-medium">Sincronización completada</p>
                  <p className="text-sm">Solo se actualizaron vínculos de proveedor; no se creó ni eliminó ninguna transacción.</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-green-50 p-3 text-center"><strong className="text-2xl text-green-700">{result.counts.updated}</strong><p className="text-xs text-green-700">Vinculadas</p></div>
                <div className="bg-amber-50 p-3 text-center"><strong className="text-2xl text-amber-800">{unresolvedCount(result.counts)}</strong><p className="text-xs text-amber-800">Pendientes</p></div>
                <div className="bg-gray-50 p-3 text-center"><strong className="text-2xl">{result.counts.already_assigned}</strong><p className="text-xs text-gray-500">Ya asignadas</p></div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          {result ? (
            <Button onClick={() => onOpenChange(false)}>Cerrar</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
              <Button variant="outline" onClick={() => void analyze(scope)} disabled={busy}>
                <RefreshCw className="mr-2 h-4 w-4" /> Reanalizar
              </Button>
              <Button onClick={handleSync} disabled={busy || !preview || preview.counts.matched === 0}>
                {isSyncing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Sincronizar {preview?.counts.matched || 0} transacciones
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
