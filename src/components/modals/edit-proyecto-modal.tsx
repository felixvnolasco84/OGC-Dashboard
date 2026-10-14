import { useState, useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useEditProyectoModal } from "@/hooks/edit-proyecto-modal";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Info, Search } from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import ProjectFeeImpactReview from "./project-fee-impact-review";
import FeeConceptEditor from "./fee-concept-editor";
import type { FeeConceptInput } from "../../../convex/feeConceptRules";
import { editableProjectFields, projectDraftPatch } from "@/lib/project-fee-draft";
import type { FeeProposal } from "../../../convex/projectFeeImpact";
import {
  NO_PROJECT_LOCATION,
  NO_PROJECT_LOCATION_LABEL,
  normalizeProjectLocationName,
} from "@/lib/project-locations";

export default function EditProyectoModal() {
  const { isOpen, onClose, proyectoId } = useEditProyectoModal();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [status, setStatus] = useState("Activo");
  const [indirectosPorcentaje, setIndirectosPorcentaje] = useState<string>("");
  const [honorariosPorcentaje, setHonorariosPorcentaje] = useState<string>("0");
  const [honorariosModo, setHonorariosModo] = useState<"automatico" | "transacciones">("automatico");
  const [ubicacion, setUbicacion] = useState<string | undefined>();
  const [excludedPartidas, setExcludedPartidas] = useState<Id<"partidas">[]>([]);
  const [partidaSearch, setPartidaSearch] = useState("");
  const [feeConcepts, setFeeConcepts] = useState<FeeConceptInput[]>([]);

  const [baseline, setBaseline] = useState<Doc<"desarrollos"> | null>(null);
  const [reviewed, setReviewed] = useState<{ key: string; scope: string } | null>(null);
  const [previewArgs, setPreviewArgs] = useState<(FeeProposal & { id: Id<"desarrollos"> }) | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const submitting = useRef(false);
  const impactPanel = useRef<HTMLDivElement>(null);
  const formScroll = useRef<HTMLDivElement>(null);
  const proyecto = useQuery(api.desarrollos.getById, isOpen && proyectoId ? { id: proyectoId } : "skip");
  const partidas = useQuery(api.partida.getByProject, isOpen && proyectoId ? { projectId: proyectoId } : "skip");
  const projectLocations = useQuery(api.project_locations.list, isOpen ? {} : "skip");
  const updateProyecto = useMutation(api.desarrollos.update);
  const impact = useQuery(api.desarrollos.previewFeeImpact, previewArgs && isOpen ? { ...previewArgs, refresh } : "skip");

  useEffect(() => {
    if (!isOpen) { setBaseline(null); setPreviewArgs(null); setReviewed(null); return; }
    if (proyecto && proyecto._id === proyectoId && baseline?._id !== proyectoId) {
      setBaseline(proyecto);
      setNombre(proyecto.nombre || "");
      setDescripcion(proyecto.descripcion || "");
      setStatus(proyecto.status || "Activo");
      setHonorariosPorcentaje(String(proyecto.honorarios_porcentaje ?? 0));
      setIndirectosPorcentaje(proyecto.indirectos_porcentaje === undefined ? "" : String(proyecto.indirectos_porcentaje));
      setHonorariosModo(proyecto.honorarios_modo || "automatico");
      setUbicacion(proyecto.ubicacion);
      setExcludedPartidas(proyecto.excluded_partidas_honorarios || []);
      setFeeConcepts((proyecto.fee_concepts || []).map(c => ({ concepto: c.concepto, partida_id: c.partida_id, excluded_partidas: c.excluded_partidas })));
      setPartidaSearch("");
      setSaveError(null);
      setReviewed(null);
    }
  }, [isOpen, proyecto, proyectoId, baseline?._id]);

  const patch = useMemo(() => baseline ? projectDraftPatch(baseline, {
    nombre, descripcion, status, ubicacion, honorariosPorcentaje, indirectosPorcentaje,
    honorariosModo, excludedPartidas, feeConcepts,
  }) : null, [baseline, nombre, descripcion, status, ubicacion, honorariosPorcentaje, indirectosPorcentaje, honorariosModo, excludedPartidas, feeConcepts]);
  const proposalKey = patch && proyectoId ? JSON.stringify({ id: proyectoId, ...patch.financial }) : "";
  const canPreview = Boolean(isOpen && patch?.financialChanged && !patch.invalid);
  useEffect(() => {
    setSaveError(null);
    if (!canPreview) { setPreviewArgs(null); setReviewed(null); return; }
    const timer = window.setTimeout(() => setPreviewArgs(JSON.parse(proposalKey)), 350);
    return () => window.clearTimeout(timer);
  }, [canPreview, proposalKey]);
  const previewMatches = Boolean(canPreview && previewArgs && JSON.stringify(previewArgs) === proposalKey);
  useEffect(() => {
    if (previewMatches && impact?.status === "ready") {
      setReviewed(previous => previous?.key === proposalKey ? previous : { key: proposalKey, scope: impact.expectedImpact });
    }
  }, [previewMatches, impact, proposalKey]);
  const stale = Boolean(previewMatches && impact?.status === "ready" && reviewed?.key === proposalKey && reviewed.scope !== impact.expectedImpact);
  const reviewReady = Boolean(previewMatches && impact?.status === "ready" && reviewed?.key === proposalKey && reviewed.scope === impact.expectedImpact);
  const conflicts = proyecto && patch ? editableProjectFields.filter(key =>
    key in patch.expectedFields && (proyecto[key] ?? null) !== patch.expectedFields[key]) : [];
  const useCurrentFields = () => {
    if (!proyecto) return;
    for (const key of conflicts) {
      if (key === "nombre") setNombre(proyecto.nombre);
      if (key === "descripcion") setDescripcion(proyecto.descripcion);
      if (key === "status") setStatus(proyecto.status || "Activo");
      if (key === "ubicacion") setUbicacion(proyecto.ubicacion);
    }
    setBaseline(previous => previous ? { ...previous, ...Object.fromEntries(conflicts.map(key => [key, proyecto[key]])) } : null);
    setSaveError(null);
  };

  const closeModal = () => {
    setBaseline(null); setPreviewArgs(null); setReviewed(null); setSaveError(null);
    submitting.current = false; setIsSubmitting(false); onClose();
  };
  const handleClose = () => { if (!submitting.current) closeModal(); };
  const isFormValid = Boolean(baseline && proyecto && nombre.trim() && descripcion.trim() && patch?.changed && !patch.invalid && !conflicts.length && (!patch.financialChanged || reviewReady));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!proyectoId || !patch || !isFormValid || submitting.current) return;
    submitting.current = true; setIsSubmitting(true); setSaveError(null);
    try {
      await updateProyecto({
        id: proyectoId,
        ...patch.fields,
        ...patch.financial,
        expected_fields: patch.expectedFields,
        ...(patch.financialChanged && reviewed ? { expected_impact: reviewed.scope } : {}),
      });
      toast.success("Proyecto actualizado", { description: `El proyecto "${nombre}" ha sido actualizado correctamente.` });
      closeModal();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Ocurrió un error inesperado.";
      setSaveError(message);
      toast.error("Error al actualizar el proyecto", { description: message });
      submitting.current = false; setIsSubmitting(false);
      if (patch.financialChanged && message.includes("impacto cambió")) {
        setReviewed(previous => previous ? { ...previous, scope: "" } : null);
        setRefresh(previous => previous + 1);
      }
    }
  };

  const retryPreview = () => { setSaveError(null); setRefresh(previous => previous + 1); };

  // Handle partida exclusion toggle
  const handlePartidaToggle = (partidaId: Id<"partidas">) => {
    setExcludedPartidas((prev) => {
      if (prev.includes(partidaId)) {
        return prev.filter((id) => id !== partidaId);
      } else {
        return [...prev, partidaId];
      }
    });
  };

  // Filter to only show nivel 1 partidas
  const nivel1Partidas = partidas?.filter((partida) => partida.nivel === 1);
  const normalizedPartidaSearch = normalizeProjectLocationName(partidaSearch);
  const filteredNivel1Partidas = nivel1Partidas?.filter((partida) =>
    normalizeProjectLocationName(partida.nombre).includes(normalizedPartidaSearch)
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DialogContent data-square-modal=""
        onEscapeKeyDown={(event) => { if (submitting.current) event.preventDefault(); }}
        onPointerDownOutside={(event) => { if (submitting.current) event.preventDefault(); }}
        className="flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0"
      >
        <DialogHeader className="shrink-0 border-b px-6 py-5 pr-12">
          <DialogTitle className="text-2xl font-normal">
            Editar Proyecto
          </DialogTitle>
          <DialogDescription>
            Actualiza la información del proyecto
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div ref={formScroll} data-project-form-scroll className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {!baseline && <p role="status" className="text-sm text-muted-foreground">{proyecto === null ? "El proyecto no está disponible o no tienes acceso." : "Cargando proyecto…"}</p>}
          <fieldset disabled={!baseline || isSubmitting} className="min-w-0 space-y-6">
          {/* Nombre */}
          <div className="space-y-2">
            <Label htmlFor="nombre" className="text-sm font-medium">
              Nombre del Proyecto *
            </Label>
            <Input
              id="nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. SUNRISE - FOUR SEASONS ESTATES"
              className="rounded-none"
              required
            />
          </div>

          {/* Descripción */}
          <div className="space-y-2">
            <Label htmlFor="descripcion" className="text-sm font-medium">
              Descripción *
            </Label>
            <Textarea
              id="descripcion"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Descripción del proyecto..."
              className="rounded-none min-h-[100px]"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ubicacion" className="text-sm font-medium">
              Ubicación
            </Label>
            <Select
              value={ubicacion || NO_PROJECT_LOCATION}
              onValueChange={(value) => setUbicacion(
                value === NO_PROJECT_LOCATION ? undefined : value
              )}
            >
              <SelectTrigger id="ubicacion" className="rounded-none">
                <SelectValue placeholder="Selecciona una ubicación" />
              </SelectTrigger>
              <SelectContent data-square-modal="">
                <SelectItem value={NO_PROJECT_LOCATION}>
                  {NO_PROJECT_LOCATION_LABEL}
                </SelectItem>
                {(projectLocations || []).map((location) => (
                  <SelectItem key={location.key} value={location.key}>
                    {location.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Opcional. Los proyectos sin asignación aparecen en Sin ubicación.
            </p>
          </div>

          {partidas && <FeeConceptEditor value={feeConcepts} approved={baseline?.fee_concepts || []} partidas={partidas}
            currency={baseline?.moneda_principal || "MXN"} onChange={setFeeConcepts} />}
          <details open={feeConcepts.length === 0} className="space-y-3 border-t pt-4">
          <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">Configuración anterior y periodos históricos</summary>
          <p className="border-t pt-4 text-xs text-muted-foreground">La configuración anterior se conserva para periodos históricos y conceptos sin configurar. Cada concepto automático usa su propia tasa y exclusiones desde su fecha de inicio.</p>
          <div className="space-y-2">
            <Label htmlFor="indirectos_porcentaje">Indirectos (%)</Label>
            <Input id="indirectos_porcentaje" type="number" min="0" max="100" step="0.01"
              placeholder="Sin activar" value={indirectosPorcentaje}
              onChange={e => setIndirectosPorcentaje(e.target.value)}
              required={baseline?.indirectos_porcentaje !== undefined} />
            <p className="text-xs text-muted-foreground">Cargo automático sobre pagos elegibles con las mismas exclusiones que honorarios. Inicio: {baseline?.indirectos_fecha_inicio || "2026-10-01"}. Cambiar el porcentaje recalcula desde esa fecha. Captura los gastos reales en P&amp;L como costo de estructura, categoría INDIRECTOS. 0% mantiene el esquema sin cargo.</p>
            <Label htmlFor="honorarios_modo" className="text-sm font-medium">Cálculo de honorarios</Label>
            <Select value={honorariosModo} onValueChange={(value) => setHonorariosModo(value as "automatico" | "transacciones")}>
              <SelectTrigger id="honorarios_modo" className="rounded-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent data-square-modal="">
                <SelectItem value="automatico">Automático por porcentaje</SelectItem>
                <SelectItem value="transacciones">Por transacciones de HONORARIOS</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {honorariosModo === "transacciones"
                ? "Suma los conceptos vinculados a la partida HONORARIOS, incluidas transacciones por pagar."
                : "Calcula honorarios con el porcentaje y las partidas excluidas configuradas abajo."}
            </p>
          </div>

          {/* Honorarios Percentage */}
          <div className="space-y-2">
            <Label htmlFor="honorarios_porcentaje" className="text-sm font-medium">
              Porcentaje de Honorarios (%)
            </Label>
            <Input
              id="honorarios_porcentaje"
              type="number"
              value={honorariosPorcentaje}
              onChange={(e) => setHonorariosPorcentaje(e.target.value)}
              placeholder="Ej: 15"
              min="0"
              max="100"
              step="0.01"
              className="rounded-none"
            />
            <p className="text-xs text-muted-foreground">
              {honorariosModo === "automatico"
                ? "Porcentaje aplicado a la base de transacciones para calcular honorarios."
                : "En Presupuesto se conserva para volver al modo automático. P&L sigue utilizando este porcentaje sobre pagos elegibles."}
            </p>
          </div>

          {/* Partidas Exclusion Section */}
          {partidas === undefined ? (
            <div className="flex items-center gap-2 border-t pt-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando partidas...
            </div>
          ) : nivel1Partidas && nivel1Partidas.length > 0 ? (
            <div className="space-y-3 border-t pt-4">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 text-blue-500 mt-0.5" />
                <div>
                  <Label className="text-sm font-medium">
                    Excluir partidas de honorarios e indirectos (Nivel 1)
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    {honorariosModo === "automatico"
                      ? "Excluye partidas y sus descendientes de honorarios automáticos e indirectos. En P&L también se excluyen de la base porcentual."
                      : "Siguen aplicando a indirectos y a honorarios porcentuales de P&L. En Presupuesto se conservan para volver al modo automático."}
                  </p>
                </div>
              </div>

              <div className="border">
                <div className="relative border-b">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-disabled-foreground" />
                  <Input
                    value={partidaSearch}
                    onChange={(event) => setPartidaSearch(event.target.value)}
                    placeholder="Buscar partida..."
                    aria-label="Buscar partida de nivel 1"
                    className="h-10 rounded-none border-0 pl-9 shadow-none focus-visible:ring-0"
                  />
                </div>
                <div className="max-h-56 overflow-y-auto">
                  {filteredNivel1Partidas && filteredNivel1Partidas.length > 0 ? (
                    filteredNivel1Partidas.map((partida) => (
                      <label
                        key={partida._id}
                        htmlFor={`partida-${partida._id}`}
                        className="flex cursor-pointer items-center gap-3 border-b px-3 py-2 last:border-b-0 hover:bg-muted/50"
                      >
                        <Checkbox
                          id={`partida-${partida._id}`}
                          checked={excludedPartidas.includes(partida._id)}
                          onCheckedChange={() => handlePartidaToggle(partida._id)}
                        />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">
                          {partida.nombre}
                        </span>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {new Intl.NumberFormat("es-MX", {
                            style: "currency",
                            currency: baseline?.moneda_principal || "MXN",
                            maximumFractionDigits: 0,
                          }).format(partida.presupuesto_aprobado)}
                        </span>
                      </label>
                    ))
                  ) : (
                    <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                      No se encontraron partidas
                    </p>
                  )}
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                {excludedPartidas.length > 0
                  ? `${excludedPartidas.length} partida${excludedPartidas.length > 1 ? 's' : ''} excluida${excludedPartidas.length > 1 ? 's' : ''} del cálculo`
                  : 'Ninguna partida excluida'}
              </p>
            </div>
          ) : null}
          </details>

          {/* Status */}
          <div className="space-y-2">
            <Label htmlFor="status" className="text-sm font-medium">
              Status
            </Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="rounded-none">
                <SelectValue placeholder="Selecciona status" />
              </SelectTrigger>
              <SelectContent data-square-modal="">
                <SelectItem value="Activo">Activo</SelectItem>
                <SelectItem value="Cancelado">Cancelado</SelectItem>
                <SelectItem value="Entregado">Entregado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {patch?.invalid && <p role="alert" className="text-sm text-destructive">Selecciona una partida válida para cada concepto. En la configuración anterior, captura porcentajes entre 0 y 100; para indirectos ya activados, 0% mantiene el esquema sin cargo y vacío no lo desactiva.</p>}
          {conflicts.length > 0 && <div role="alert" className="space-y-2 border p-3 text-sm">
            <p>Otra persona cambió campos que estás editando: {conflicts.join(", ")}. Tu borrador se conserva.</p>
            {conflicts.map(key => <p key={key} className="break-words text-xs">{key}: actual «{proyecto?.[key] || "Sin valor"}» · borrador «{({ nombre, descripcion, status, ubicacion })[key] || "Sin valor"}»</p>)}
            <Button type="button" variant="outline" onClick={useCurrentFields}>Usar valores actuales en esos campos</Button>
          </div>}
          {patch?.financialChanged && !patch.invalid && <div ref={impactPanel} tabIndex={-1} aria-live="polite" aria-busy={!previewMatches || impact === undefined} className="space-y-3">
            {(!previewMatches || impact === undefined) && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Calculando impacto…</p>}
            {previewMatches && impact?.status === "error" && <div role="alert" className="space-y-2 border p-3 text-sm"><p>{impact.message}</p><Button type="button" variant="outline" onClick={() => void retryPreview()}>Reintentar cálculo</Button></div>}
            {stale && <div role="status" className="space-y-2 border p-3 text-sm"><p>Los datos cambiaron mientras revisabas. Este es el impacto actualizado; revísalo antes de guardar.</p><Button type="button" variant="outline" onClick={() => { if (impact?.status === "ready") { setReviewed({ key: proposalKey, scope: impact.expectedImpact }); setSaveError(null); } }}>Revisar actualización</Button></div>}
            {previewMatches && impact?.status === "ready" && <ProjectFeeImpactReview impact={impact} partidas={partidas || []} />}
          </div>}
          {saveError && <p role="alert" className="break-words text-sm text-destructive">{saveError}</p>}
          </fieldset>
          </div>

          {/* Actions */}
          <div className="shrink-0 space-y-3 border-t bg-background px-6 py-4">
            {patch?.financialChanged && <div className="text-xs" role="status">
              {reviewReady && impact?.status === "ready" ? <>
                <p>Cambio en gasto: {new Intl.NumberFormat("es-MX", { style: "currency", currency: impact.budgetCurrency }).format(impact.afterBudget.gasto_total - impact.beforeBudget.gasto_total)} {impact.budgetCurrency} · Cambio en EBITDA P&amp;L: {new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(impact.afterPnl.ebitda - impact.beforePnl.ebitda)} MXN</p>
                <button type="button" className="mt-1 min-h-9 underline underline-offset-4" onClick={() => {
                  const panel = impactPanel.current, scroll = formScroll.current;
                  if (panel && scroll) scroll.scrollTop += panel.getBoundingClientRect().top - scroll.getBoundingClientRect().top;
                  panel?.focus({ preventScroll: true });
                }}>Ver impacto antes de guardar</button>
              </> : <p>{stale ? "Revisa el impacto actualizado antes de guardar." : impact?.status === "error" ? "No se pudo calcular el impacto. Reintenta la revisión." : "El guardado estará disponible al completar la revisión del impacto."}</p>}
            </div>}
            <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isSubmitting}
              className="rounded-none"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={!isFormValid || isSubmitting}
              className="rounded-none"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Guardando...
                </>
              ) : (
                "Guardar Cambios"
              )}
            </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
