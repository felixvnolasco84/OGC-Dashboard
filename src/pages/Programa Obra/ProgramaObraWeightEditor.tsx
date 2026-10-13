import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { Percent } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { programToday } from "@/lib/programa-obra-rules";
import {
  parseProgramWeight,
  type ProgramWeightImpact,
} from "@/lib/programa-obra-weight";
import type { ProgramaItem } from "./programa-obra-types";

type Props = {
  proyecto: Id<"desarrollos">;
  projectName: string;
  item: ProgramaItem;
  returnFocus: HTMLElement | null;
  onClose: () => void;
};
const percent = (n: number) => `${n.toFixed(2)}%`;
const delta = (a: number, b: number) =>
  `${b > a ? "+" : ""}${(b - a).toFixed(2)} pp`;

function Comparison({
  label,
  before,
  after,
  difference = true,
}: {
  label: string;
  before: number;
  after: number;
  difference?: boolean;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 py-2">
      <dt className="text-sm">{label}</dt>
      <dd className="text-right text-sm tabular-nums">
        <span className="text-muted-foreground">{percent(before)}</span>
        <span aria-hidden="true"> → </span>
        <span className="sr-only"> pasa a </span>
        <strong className="font-medium">{percent(after)}</strong>
      </dd>
      {difference && (
        <dd className="col-span-2 text-right text-xs text-muted-foreground">
          {delta(before, after)}
        </dd>
      )}
    </div>
  );
}

type CalculationMode = Pick<
  ProgramWeightImpact["overall"]["before"],
  "simple" | "inherited" | "provisional"
>;
function Mode({
  before,
  after,
}: {
  before: CalculationMode;
  after: CalculationMode;
}) {
  const explain = (s: typeof before) =>
    s.simple
      ? "Promedio simple: faltan pesos válidos o la suma es cero."
      : s.inherited
        ? "Ponderado, con avance provisional en niveles inferiores."
        : "Promedio ponderado con pesos completos.";
  return (
    <div className="mt-2 space-y-1 text-xs text-muted-foreground">
      <p>
        Actual: {before.provisional ? "Provisional" : "Ponderado"} ·{" "}
        {explain(before)}
      </p>
      <p>
        Propuesto: {after.provisional ? "Provisional" : "Ponderado"} ·{" "}
        {explain(after)}
      </p>
    </div>
  );
}

export default function ProgramaObraWeightEditor({
  proyecto,
  projectName,
  item,
  returnFocus,
  onClose,
}: Props) {
  const [raw, setRaw] = useState(String(item.ponderacion ?? ""));
  const [day, setDay] = useState(programToday);
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [acceptedSource, setAcceptedSource] = useState<string | null>(null);
  const sending = useRef(false);
  const noticeRef = useRef<HTMLDivElement>(null);
  const saveSchedule = useMutation(api.programa_obra.updateSchedulePeso);
  const saveDetail = useMutation(api.programa_obra.updateDetallePeso);
  const target =
    item.level === 0 && item.schedule?._id
      ? { kind: "schedule" as const, id: item.schedule._id }
      : item.level === 1 && item.detalleSchedule?._id
        ? { kind: "detail" as const, id: item.detalleSchedule._id }
        : null;
  const value = parseProgramWeight(raw);
  // Even an empty input loads the current source. It can never be submitted.
  const review = useQuery(
    api.programa_obra.previewWeightChange,
    target
      ? {
          proyecto,
          target,
          peso: value ?? item.ponderacion ?? 0,
          refresh_day: day,
          refresh,
        }
      : "skip",
  );
  useEffect(() => {
    const timer = window.setInterval(() => setDay(programToday()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (review?.ok && acceptedSource === null)
      setAcceptedSource(review.sourceToken);
  }, [review, acceptedSource]);
  const sourceChanged = !!(
    review?.ok &&
    acceptedSource !== null &&
    review.sourceToken !== acceptedSource
  );
  const stale = conflict || sourceChanged;
  useEffect(() => {
    if (!busy && (stale || error))
      noticeRef.current?.scrollIntoView({ block: "nearest" });
  }, [stale, error, busy]);
  const validReview =
    review?.ok && value !== undefined && review.impact.newWeight === value;
  const ready =
    validReview &&
    acceptedSource !== null &&
    !stale &&
    review.impact.oldWeight !== value;
  const close = () => {
    if (!sending.current) onClose();
  };
  const acknowledge = () => {
    if (!review?.ok) return;
    setAcceptedSource(review.sourceToken);
    setConflict(false);
    setError(null);
  };
  const save = async () => {
    if (
      sending.current ||
      !ready ||
      !review?.ok ||
      !target ||
      value === undefined
    )
      return;
    // Check the cutoff at submission, including the interval's midnight gap.
    if (programToday() !== day) {
      setDay(programToday());
      setConflict(true);
      return;
    }
    sending.current = true;
    setBusy(true);
    setError(null);
    try {
      const result =
        target.kind === "schedule"
          ? await saveSchedule({
              schedule_id: target.id,
              peso: value,
              review_token: review.reviewToken,
            })
          : await saveDetail({
              detalle_id: target.id,
              peso: value,
              review_token: review.reviewToken,
            });
      toast.success(
        result.changed
          ? "Ponderación actualizada"
          : "La ponderación ya está vigente",
      );
      onClose();
    } catch (cause) {
      const data = cause instanceof ConvexError ? cause.data : undefined;
      const message =
        typeof data === "object" && data && "message" in data
          ? String(data.message)
          : cause instanceof Error
            ? cause.message
            : "No se pudo guardar la ponderación.";
      setError(message);
      setConflict(true);
      setRefresh((n) => n + 1);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };
  const impact = validReview ? review.impact : null;
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <SheetContent
        className={`w-full sm:max-w-[480px] ${busy ? "[&>button]:hidden" : ""}`}
        onEscapeKeyDown={(e) => {
          if (sending.current) e.preventDefault();
        }}
        onInteractOutside={(e) => {
          if (sending.current) e.preventDefault();
        }}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          if (returnFocus?.isConnected) returnFocus.focus();
        }}
      >
        <SheetHeader className="shrink-0">
          <SheetTitle className="flex items-center gap-2">
            <Percent className="h-4 w-4" />
            Ponderación
          </SheetTitle>
          <SheetDescription className="break-words">
            {projectName}
            <br />
            {review?.ok
              ? review.scheduleName
              : (item.parentPartidaNombre ?? item.partida)}
            {target?.kind === "detail" && (
              <> / {review?.ok ? review.familyName : item.partida}</>
            )}
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6 min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
          <div className="space-y-2">
            <Label htmlFor="programa-ponderacion">Nuevo peso (%)</Label>
            <Input
              id="programa-ponderacion"
              type="text"
              inputMode="decimal"
              autoFocus
              disabled={busy}
              value={raw}
              aria-invalid={value === undefined && raw !== ""}
              aria-describedby="weight-help weight-validation"
              onChange={(e) => {
                setRaw(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.preventDefault();
              }}
              className="rounded-none"
            />
            <p id="weight-help" className="text-xs text-muted-foreground">
              Peso actual:{" "}
              {review?.ok
                ? review.impact.oldWeight === null
                  ? "Sin definir"
                  : percent(review.impact.oldWeight)
                : item.ponderacion == null
                  ? "Sin definir"
                  : percent(item.ponderacion)}
              . Se admiten pesos de 0 a 100; el grupo no necesita sumar 100.
            </p>
            <p id="weight-validation" className="text-xs text-destructive">
              {value === undefined && raw !== ""
                ? "Escribe un número válido entre 0 y 100, con punto decimal."
                : ""}
            </p>
          </div>
          {!target && (
            <p role="alert" className="text-sm text-destructive">
              El elemento no tiene un destino válido para editar su peso.
            </p>
          )}
          {target && !review && (
            <p role="status" className="text-sm text-muted-foreground">
              Calculando el impacto del programa completo…
            </p>
          )}
          {review && !review.ok && (
            <div role="alert" className="space-y-2 text-sm text-destructive">
              <p>{review.message}</p>
              <Button
                variant="outline"
                onClick={() => setRefresh((n) => n + 1)}
              >
                Reintentar revisión
              </Button>
            </div>
          )}
          {(error || stale) && !busy && (
            <div
              ref={noticeRef}
              className="space-y-3 border border-border bg-muted p-3 text-sm"
            >
              {error && (
                <p role="alert" className="text-destructive">
                  {error}
                </p>
              )}
              {stale && (
                <>
                  <p role="status">
                    {sourceChanged
                      ? "El programa cambió. Tu peso propuesto se conserva; revisa la comparación actualizada antes de guardar."
                      : "Tu peso propuesto se conserva. Revisa la comparación actualizada antes de reintentar el guardado."}
                  </p>
                  <Button
                    variant="outline"
                    className="h-auto min-h-11 w-full whitespace-normal rounded-none"
                    disabled={!validReview}
                    onClick={acknowledge}
                  >
                    Revisar cambios actualizados
                  </Button>
                </>
              )}
            </div>
          )}
          {impact && (
            <>
              <section
                aria-label="Participación relativa"
                className="border-t border-border pt-4"
              >
                <h3 className="text-sm font-semibold">
                  Participación{" "}
                  {target?.kind === "detail"
                    ? "en la partida"
                    : "en el proyecto"}
                </h3>
                <dl>
                  <Comparison
                    label="Participación efectiva"
                    before={impact.participation.before.percent}
                    after={impact.participation.after.percent}
                    difference={false}
                  />
                </dl>
                <p className="text-xs text-muted-foreground">
                  {impact.participation.after.count} elementos · Suma de pesos:{" "}
                  {impact.participation.before.sum.toFixed(2)} →{" "}
                  {impact.participation.after.sum.toFixed(2)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Actual:{" "}
                  {impact.participation.before.simple
                    ? "promedio simple"
                    : "ponderado"}
                  . Propuesto:{" "}
                  {impact.participation.after.simple
                    ? `promedio simple (1/${impact.participation.after.count} por elemento)`
                    : "ponderado según el peso relativo"}
                  .
                </p>
              </section>
              {target?.kind === "detail" && (
                <section
                  aria-label="Impacto en la partida"
                  className="border-t border-border pt-4"
                >
                  <h3 className="text-sm font-semibold">
                    Avance de la partida
                  </h3>
                  <dl>
                    <Comparison
                      label="Real"
                      before={impact.schedule.before.progress}
                      after={impact.schedule.after.progress}
                    />
                    <Comparison
                      label="Planeado"
                      before={impact.schedule.before.planned}
                      after={impact.schedule.after.planned}
                    />
                  </dl>
                  <Mode
                    before={impact.schedule.before}
                    after={impact.schedule.after}
                  />
                </section>
              )}
              <section
                aria-label="Impacto general"
                className="border-t border-border pt-4"
              >
                <h3 className="text-sm font-semibold">
                  Avance general del proyecto
                </h3>
                <dl>
                  <Comparison
                    label="Real"
                    before={impact.overall.before.progress}
                    after={impact.overall.after.progress}
                  />
                  <Comparison
                    label="Planeado"
                    before={impact.overall.before.planned}
                    after={impact.overall.after.planned}
                  />
                </dl>
                <Mode
                  before={impact.overall.before}
                  after={impact.overall.after}
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  Fecha de corte: {impact.cutoff} · Diferencias en puntos
                  porcentuales (pp).
                </p>
              </section>
            </>
          )}
          <p className="text-xs text-muted-foreground">
            Este cambio recalcula el avance agregado. El avance físico capturado
            y la liberación de los elementos se conservan.
            {review?.ok &&
              review.baseline &&
              " Los pesos del programa aprobado también se conservan."}
          </p>
          {validReview && !stale && review.impact.oldWeight === value && (
            <p role="status" className="text-xs text-muted-foreground">
              Sin cambios por guardar.
            </p>
          )}
        </div>
        <SheetFooter className="mt-4 shrink-0 flex-row border-t border-border">
          <Button
            variant="outline"
            className="min-h-11 rounded-none"
            disabled={busy}
            onClick={close}
          >
            Cancelar
          </Button>
          <Button
            className="min-h-11 flex-1 rounded-none sm:flex-none"
            disabled={!ready || busy}
            onClick={save}
          >
            {busy ? "Guardando…" : "Guardar ponderación"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
