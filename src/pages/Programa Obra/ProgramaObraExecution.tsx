import { useState, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  PROGRAM_STATUS_LABELS,
  activityBlockers,
  progressBlockers,
  dateDay,
  programDate,
  type ProgramDateEdit,
} from "@/lib/programa-obra-rules";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Settings2,
} from "lucide-react";
import { toast } from "sonner";

export type ExecutionProgram = FunctionReturnType<
  typeof api.programa_obra.getExecutionProgram
>;
type Activity = ExecutionProgram["activities"][number];
type Perform = (
  action: () => Promise<unknown>,
  message?: string,
) => Promise<boolean>;
const selectClass =
  "flex min-h-11 min-w-0 w-full border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block min-w-0 space-y-1.5 text-xs text-muted-foreground">
      <span>{label}</span>
      {children}
    </label>
  );
}
function Choice({
  label,
  value,
  onChange,
  children,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <Field label={label}>
      <Select
        value={value || "__empty__"}
        onValueChange={(selected) => onChange(selected === "__empty__" ? "" : selected)}
        disabled={disabled}
      >
        <SelectTrigger
          aria-label={label}
          data-viewer-readonly-allow="true"
          className="min-h-11 min-w-0 bg-background"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent data-viewer-readonly-allow="true" className="max-w-[calc(100vw-2rem)]">
          {children}
        </SelectContent>
      </Select>
    </Field>
  );
}
function Check({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex min-h-11 items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4"
      />
      {label}
    </label>
  );
}
function People({
  model,
  value,
  onChange,
  label = "Responsable",
  disabled,
}: {
  model: ExecutionProgram;
  value: string;
  onChange: (v: string) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <Choice label={label} value={value} onChange={onChange} disabled={disabled}>
      <SelectItem value="__empty__">Seleccionar responsable</SelectItem>
      {model.users.map((u) => (
        <SelectItem key={u._id} value={u._id}>
          {u.name}
        </SelectItem>
      ))}
    </Choice>
  );
}
function useAction() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const perform: Perform = async (action, message) => {
    setBusy(true);
    setError("");
    try {
      await action();
      if (message) toast.success(message);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
      return false;
    } finally {
      setBusy(false);
    }
  };
  return {
    busy,
    perform,
    feedback: (
      <>
        {busy && (
          <p className="flex items-center gap-2 text-xs" role="status">
            <Loader2 className="h-4 w-4 animate-spin" />
            Guardando…
          </p>
        )}
        {error && (
          <p
            role="alert"
            className="border border-red-200 bg-red-50 p-3 text-sm text-red-800"
          >
            {error}
          </p>
        )}
      </>
    ),
  };
}

export default function ProgramaObraExecution({
  model,
  proyecto,
  selectedId,
  onSelect,
  onClose,
}: {
  model: ExecutionProgram;
  proyecto: Id<"desarrollos">;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onClose: () => void;
}) {
  const [front, setFront] = useState("all"),
    [person, setPerson] = useState("all"),
    [state, setState] = useState("all"),
    [search, setSearch] = useState(""),
    [settings, setSettings] = useState(false),
    [gantt, setGantt] = useState(false);
  const [ganttSelectedId, setGanttSelectedId] = useState<string | null>(null);
  const initialize = useMutation(api.programa_obra.initializeExecutionProgram);
  const { perform, busy, feedback } = useAction();
  const selected = model.activities.find((a) => a._id === selectedId);
  const closeActivity = () => {
    const id = selectedId;
    onSelect(null);
    if (id)
      requestAnimationFrame(() =>
        document
          .querySelector<HTMLButtonElement>(`[data-activity-id="${id}"]`)
          ?.focus(),
      );
  };
  const frontName = (id: string) =>
    model.fronts.find((f) => f._id === id)?.name ?? "General";
  const userName = (id?: string) =>
    model.users.find((u) => u._id === id)?.name ?? "Sin responsable";
  const rows = model.activities.filter(
    (a) =>
      (front === "all" || a.front_id === front) &&
      (person === "all" || a.responsible_id === person) &&
      (state === "all" ||
        (state === "blocked"
          ? a.blockers.length > 0
          : state === "delayed"
            ? a.delayed
            : a.status === state)) &&
      `${a.name} ${a.partida_name} ${frontName(a.front_id)}`
        .toLocaleLowerCase("es")
        .includes(search.toLocaleLowerCase("es")),
  );
  const showRelated = (id: string) => {
    setFront("all");
    setPerson("all");
    setState("all");
    setSearch("");
    onSelect(id);
  };
  return (
    <section
      className="space-y-4 px-4 py-4 sm:px-6 lg:px-8"
      aria-label="Actividades por frente"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-base font-medium">
          Actividades por frente
        </h2>
        {gantt && ganttSelectedId && (
          <Button
            size="sm"
            variant="outline"
            data-viewer-readonly-allow="true"
            onClick={() => onSelect(ganttSelectedId)}
          >
            Abrir detalle seleccionado
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          data-viewer-readonly-allow="true"
          onClick={() => setGantt(!gantt)}
        >
          {gantt ? "Ver lista" : "Ver Gantt"}
        </Button>
        {model.capabilities.plan && (
          <Button size="sm" variant="outline" onClick={() => setSettings(true)}>
            <Settings2 className="h-4 w-4" />
            Configurar
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          data-viewer-readonly-allow="true"
          onClick={onClose}
        >
          Volver al programa
        </Button>
      </div>
      {feedback}
      {!model.config ? (
        <div className="max-w-xl space-y-3 border border-border p-4">
          <p className="text-sm">
            Prepara actividades a partir de tus familias. El avance y su
            historial se conservan; podrás asignar responsables, frentes y
            requisitos antes de activar las reglas.
          </p>
          {model.capabilities.plan && (
            <Button
              disabled={busy}
              onClick={() =>
                void perform(
                  () => initialize({ proyecto }),
                  "Actividades preparadas",
                )
              }
            >
              Preparar actividades
            </Button>
          )}
        </div>
      ) : (
        <>
          {!model.config.enabled && (
            <p className="border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              En preparación. Revisa responsables y relaciones; activa las
              reglas en Configurar cuando el programa esté listo.
            </p>
          )}
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <span>
              Avance{" "}
              <strong>{model.summaries.overall.progress.toFixed(1)} %</strong>
              {model.summaries.overall.provisional && " · Provisional"}
            </span>
            <button
              type="button"
              data-viewer-readonly-allow="true"
              className="underline underline-offset-4"
              onClick={() => setState("ready")}
            >
              {model.activities.filter((a) => a.status === "ready").length}{" "}
              listas para iniciar
            </button>
            <button
              type="button"
              data-viewer-readonly-allow="true"
              className="underline underline-offset-4"
              onClick={() => setState("blocked")}
            >
              {model.activities.filter((a) => a.blockers.length).length} con
              pendientes
            </button>
            <span>
              Previsto estimado {model.summaries.overall.planned.toFixed(1)} %
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Buscar actividad">
              <Input
                data-viewer-readonly-allow="true"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Partida, actividad o frente"
              />
            </Field>
            <Choice label="Frente" value={front} onChange={setFront}>
              <SelectItem value="all">Todos los frentes</SelectItem>
              {model.fronts
                .filter((f) => !f.archived)
                .map((f) => (
                  <SelectItem value={f._id} key={f._id}>
                    {f.name}
                  </SelectItem>
                ))}
            </Choice>
            <People
              model={model}
              value={person === "all" ? "" : person}
              onChange={(v) => setPerson(v || "all")}
              label="Filtrar por responsable"
            />
            <Choice label="Estado" value={state} onChange={setState}>
              <SelectItem value="all">Todos los estados</SelectItem>
              <SelectItem value="blocked">Con pendientes</SelectItem>
              <SelectItem value="delayed">Con retraso</SelectItem>
              {Object.entries(PROGRAM_STATUS_LABELS).map(([id, label]) => (
                <SelectItem value={id} key={id}>
                  {label}
                </SelectItem>
              ))}
            </Choice>
          </div>
          {(search ||
            front !== "all" ||
            person !== "all" ||
            state !== "all") && (
            <Button
              size="sm"
              variant="ghost"
              data-viewer-readonly-allow="true"
              onClick={() => {
                setFront("all");
                setPerson("all");
                setState("all");
                setSearch("");
              }}
            >
              Limpiar filtros
            </Button>
          )}
          {!rows.length && (
            <p className="py-8 text-sm text-muted-foreground">
              No hay actividades con estos filtros.
            </p>
          )}
          {gantt ? (
            <ExecutionGantt
              rows={rows}
              model={model}
              selectedId={ganttSelectedId}
              onSelect={setGanttSelectedId}
            />
          ) : (
            <div className="divide-y border border-border">
              {rows.map((a) => (
                <button
                  key={a._id}
                  data-activity-id={a._id}
                  type="button"
                  data-viewer-readonly-allow="true"
                  className="flex w-full flex-wrap items-start gap-3 p-4 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  onClick={() => onSelect(a._id)}
                >
                  <div className="min-w-0 flex-1 basis-56">
                    <p className="mb-1 text-xs text-muted-foreground">
                      {a.partida_name}
                    </p>
                    <p className="break-words text-sm font-medium">
                      {a.name} · {frontName(a.front_id)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {userName(a.responsible_id)} ·{" "}
                      {a.current_start ?? "Sin inicio"} →{" "}
                      {a.current_finish ?? "Sin fin"}
                    </p>
                    {a.blockers[0] && (
                      <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-900">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        {a.blockers[0].message}
                      </p>
                    )}
                    {a.dates_need_review && (
                      <p className="mt-1 text-xs text-amber-900">
                        Revisar fechas históricas
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <strong>{a.progress.toFixed(1)} %</strong>
                    <span className="bg-muted px-2 py-1">
                      {PROGRAM_STATUS_LABELS[a.status]}
                    </span>
                    {a.delayed && (
                      <span className="text-red-800">Con retraso</span>
                    )}
                    <ArrowRight className="h-4 w-4" />
                  </div>
                </button>
              ))}
            </div>
          )}
          <ExecutionApprovals
            model={model}
            perform={perform}
            busy={busy}
            onSelect={showRelated}
          />
          <details className="border-t border-border pt-3">
            <summary className="cursor-pointer text-sm">
              Historial del programa
            </summary>
            <div className="mt-3 space-y-2">
              {model.events.map((e) => (
                <div
                  key={e._id}
                  className="border-b border-border py-2 text-xs"
                >
                  <p>{e.reason}</p>
                  <p className="text-muted-foreground">
                    {e.actor_name} ·{" "}
                    {new Intl.DateTimeFormat("es-MX", {
                      dateStyle: "short",
                      timeStyle: "short",
                      timeZone: "America/Mexico_City",
                    }).format(e.created_at)}
                    {e.execution_date && ` · Ejecución ${e.execution_date}`}
                  </p>
                </div>
              ))}
            </div>
          </details>
        </>
      )}
      {settings && (
        <ExecutionSettings
          model={model}
          proyecto={proyecto}
          onClose={() => setSettings(false)}
        />
      )}
      {selected && (
        <ExecutionActivity
          key={selected._id}
          model={model}
          activity={selected}
          onClose={closeActivity}
          onRelated={showRelated}
        />
      )}
    </section>
  );
}

function ExecutionGantt({
  rows,
  model,
  selectedId,
  onSelect,
}: {
  rows: Activity[];
  model: ExecutionProgram;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const dates = rows
    .flatMap((a) => [a.current_start, a.current_finish])
    .filter((d): d is string => !!programDate(d))
    .sort();
  if (!dates.length)
    return (
      <p className="text-sm text-muted-foreground">
        Define fechas vigentes para ver el calendario.
      </p>
    );
  const first = dateDay(dates[0]),
    range = Math.max(1, dateDay(dates[dates.length - 1]) - first + 1),
    width = 800,
    rowHeight = 56;
  const x = (d?: string) => (d ? ((dateDay(d) - first) / range) * width : 0);
  const lines = model.dependencies.filter(
    (d) => d.predecessor_id === selectedId || d.successor_id === selectedId,
  );
  return (
    <div className="overflow-x-auto border border-border">
      <div className="flex min-w-[1080px]">
        <div className="w-[280px] shrink-0">
          {rows.map((a) => (
            <button
              key={a._id}
              type="button"
              data-viewer-readonly-allow="true"
              className="block h-14 w-full truncate border-b border-border px-3 text-left text-xs hover:bg-muted"
              onClick={() => onSelect(a._id)}
            >
              {a.name} · {model.fronts.find((f) => f._id === a.front_id)?.name}
            </button>
          ))}
        </div>
        <div
          className="relative"
          style={{ width, height: rows.length * rowHeight }}
        >
          <svg
            className="pointer-events-none absolute inset-0 z-10"
            width={width}
            height={rows.length * rowHeight}
            aria-hidden="true"
          >
            <defs>
              <marker
                id="execution-arrow"
                markerWidth="8"
                markerHeight="8"
                refX="7"
                refY="4"
                orient="auto"
              >
                <path d="M0,0 L8,4 L0,8" fill="currentColor" />
              </marker>
            </defs>
            {lines.map((d) => {
              const ai = rows.findIndex((a) => a._id === d.predecessor_id),
                bi = rows.findIndex((a) => a._id === d.successor_id);
              if (ai < 0 || bi < 0) return null;
              const sx =
                  x(
                    d.kind === "SS"
                      ? rows[ai].current_start
                      : rows[ai].current_finish,
                  ) + (d.kind === "SS" ? 0 : width / range),
                ex = x(
                  d.kind === "FF"
                    ? rows[bi].current_finish
                    : rows[bi].current_start,
                ),
                sy = ai * rowHeight + 28,
                ey = bi * rowHeight + 28;
              return (
                <path
                  key={d._id}
                  d={`M${sx},${sy} H${sx + 12} V${ey} H${ex}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  markerEnd="url(#execution-arrow)"
                />
              );
            })}
          </svg>
          {rows.map((a) => (
            <div
              key={a._id}
              className="relative h-14 border-b border-border bg-muted/10"
            >
              {a.current_start && a.current_finish && (
                <button
                  type="button"
                  data-viewer-readonly-allow="true"
                  data-activity-id={a._id}
                  aria-label={`${a.name}: ${a.current_start} a ${a.current_finish}. ${PROGRAM_STATUS_LABELS[a.status]}`}
                  onClick={() => onSelect(a._id)}
                  className={`absolute top-3 h-8 overflow-hidden border px-2 text-left text-[10px] ${a._id === selectedId ? "border-foreground bg-muted ring-1 ring-foreground" : "border-border bg-muted"}`}
                  style={{
                    left: x(a.current_start),
                    width: Math.max(
                      28,
                      x(a.current_finish) - x(a.current_start) + width / range,
                    ),
                  }}
                >
                  <span
                    className="absolute bottom-0 left-0 h-1 bg-green-700"
                    style={{ width: `${a.progress}%` }}
                  />
                  {a.progress.toFixed(0)} %
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
      <p className="p-2 text-xs text-muted-foreground">
        {dates[0]} → {dates[dates.length - 1]} · Selecciona una actividad para
        ver sus relaciones. Sus motivos y pendientes están en el detalle.
      </p>
    </div>
  );
}

function ExecutionSettings({
  model,
  proyecto,
  onClose,
}: {
  model: ExecutionProgram;
  proyecto: Id<"desarrollos">;
  onClose: () => void;
}) {
  const configure = useMutation(api.programa_obra.configureExecutionProgram),
    createFront = useMutation(api.programa_obra.createExecutionFront),
    initialize = useMutation(api.programa_obra.initializeExecutionProgram);
  const [weekdays, setWeekdays] = useState(model.calendar.weekdays),
    [holidays, setHolidays] = useState(model.calendar.holidays.join("\n")),
    [enabled, setEnabled] = useState(model.config?.enabled ?? false),
    [reason, setReason] = useState(""),
    [frontName, setFrontName] = useState("");
  const { perform, busy, feedback } = useAction();
  return (
    <Sheet open onOpenChange={onClose}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Configurar el programa</SheetTitle>
          <SheetDescription>
            Prepara responsables y relaciones antes de activar los bloqueos.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-5 space-y-5">
          {feedback}
          {!model.config ? (
            <Button
              disabled={busy}
              onClick={() => void perform(() => initialize({ proyecto }))}
            >
              Preparar actividades
            </Button>
          ) : (
            <>
              <section className="space-y-3">
                <h3 className="text-sm font-medium">Calendario laboral</h3>
                <div className="grid grid-cols-2">
                  {[
                    "Domingo",
                    "Lunes",
                    "Martes",
                    "Miércoles",
                    "Jueves",
                    "Viernes",
                    "Sábado",
                  ].map((label, index) => (
                    <Check
                      key={label}
                      label={label}
                      checked={weekdays.includes(index)}
                      onChange={(v) =>
                        setWeekdays(
                          v
                            ? [...weekdays, index]
                            : weekdays.filter((d) => d !== index),
                        )
                      }
                    />
                  ))}
                </div>
                <Field label="Días inhábiles · una fecha YYYY-MM-DD por línea">
                  <textarea
                    className={selectClass}
                    value={holidays}
                    onChange={(e) => setHolidays(e.target.value)}
                    rows={3}
                  />
                </Field>
                <Check
                  label="Activar dependencias y requisitos"
                  checked={enabled}
                  onChange={setEnabled}
                  disabled={model.config.enabled && !model.capabilities.admin}
                />
                <Field label="Motivo del cambio">
                  <Input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </Field>
                <Button
                  disabled={busy || !reason.trim()}
                  onClick={() =>
                    void perform(
                      () =>
                        configure({
                          proyecto,
                          weekdays: [...weekdays].sort(),
                          holidays: holidays.split(/\s+/).filter(Boolean),
                          enabled,
                          reason,
                          version: model.config!.version,
                        }),
                      "Configuración guardada",
                    )
                  }
                >
                  Guardar configuración
                </Button>
              </section>
              <section className="space-y-3 border-t border-border pt-4">
                <h3 className="text-sm font-medium">Frentes</h3>
                <p className="text-xs text-muted-foreground">
                  {model.fronts
                    .filter((f) => !f.archived)
                    .map((f) => f.name)
                    .join(" · ")}
                </p>
                <Field label="Nuevo frente">
                  <Input
                    placeholder="Piso 2, Zona norte…"
                    value={frontName}
                    onChange={(e) => setFrontName(e.target.value)}
                  />
                </Field>
                <Button
                  variant="outline"
                  disabled={busy || !frontName.trim()}
                  onClick={() =>
                    void perform(
                      () => createFront({ proyecto, name: frontName }),
                      "Frente creado",
                    ).then((ok) => {
                      if (ok) setFrontName("");
                    })
                  }
                >
                  Agregar frente
                </Button>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() =>
                    void perform(
                      () => initialize({ proyecto }),
                      "Familias nuevas incorporadas",
                    )
                  }
                >
                  Incorporar familias pendientes
                </Button>
              </section>
              {model.capabilities.admin && (
                <section className="space-y-3 border-t border-border pt-4">
                  <h3 className="text-sm font-medium">
                    Autorizaciones por proyecto
                  </h3>
                  {model.users.map((u) => (
                    <PermissionRow
                      key={`${u._id}-${model.config?.version}`}
                      model={model}
                      proyecto={proyecto}
                      user={u}
                    />
                  ))}
                </section>
              )}
            </>
          )}
          <details className="border-t border-border pt-4">
            <summary className="cursor-pointer text-sm">
              Programa aprobado y revisiones
            </summary>
            {model.revisions.map((r) => (
              <div
                className="mt-3 border-b border-border pb-3 text-xs"
                key={r._id}
              >
                <p>
                  {r.kind === "baseline"
                    ? "Programa aprobado"
                    : r.kind === "import"
                      ? "Importación"
                      : "Reprogramación"}{" "}
                  · {r.reason}
                </p>
                <details>
                  <summary className="mt-1 cursor-pointer text-muted-foreground">
                    Ver datos de la revisión
                  </summary>
                  <RevisionDetails snapshot={r.snapshot_json} />
                </details>
              </div>
            ))}
          </details>
        </div>
      </SheetContent>
    </Sheet>
  );
}
function RevisionDetails({ snapshot }: { snapshot: string }) {
  const data = JSON.parse(snapshot) as {
    activities?: {
      name: string;
      current_start?: string;
      current_finish?: string;
      progress: number;
      share: number;
    }[];
    rows?: {
      partida: string;
      familia?: string;
      fecha_inicio?: string;
      fecha_fin?: string;
      peso?: number;
    }[];
    changes?: {
      name: string;
      old_start?: string;
      old_finish?: string;
      start: string;
      finish: string;
    }[];
    proposal?: { changes: { name: string; start: string; finish: string }[] };
  };
  return (
    <div className="mt-2 space-y-2">
      {data.activities?.map((a, i) => (
        <p key={i}>
          {a.name}: {a.current_start ?? "Sin inicio"} →{" "}
          {a.current_finish ?? "Sin fin"} · {a.progress} % · Participación{" "}
          {a.share} %
        </p>
      ))}
      {data.rows?.map((r, i) => (
        <p key={i}>
          {r.partida}
          {r.familia && ` / ${r.familia}`}: {r.fecha_inicio ?? "Sin inicio"} →{" "}
          {r.fecha_fin ?? "Sin fin"} · Peso {r.peso ?? "Sin definir"}
        </p>
      ))}
      {data.changes?.map((c, i) => (
        <p key={i}>
          {c.name}: {c.old_start ?? "Sin inicio"} / {c.old_finish ?? "Sin fin"}{" "}
          → {c.start} / {c.finish}
        </p>
      ))}
      {data.proposal?.changes.map((c, i) => (
        <p key={i}>
          {c.name}: {c.start} → {c.finish}
        </p>
      ))}
    </div>
  );
}

function PermissionRow({
  model,
  proyecto,
  user,
}: {
  model: ExecutionProgram;
  proyecto: Id<"desarrollos">;
  user: ExecutionProgram["users"][number];
}) {
  const permission = model.permissions.find((p) => p.user_id === user._id);
  const [plan, setPlan] = useState(permission?.plan ?? false),
    [accept, setAccept] = useState(permission?.accept ?? false),
    [exceptions, setExceptions] = useState(permission?.exceptions ?? false);
  const save = useMutation(api.programa_obra.setExecutionPermission),
    { perform, busy, feedback } = useAction();
  return (
    <div className="border border-border p-3">
      <p className="text-sm font-medium">{user.name}</p>
      <div className="flex flex-wrap gap-3">
        <Check label="Planificar" checked={plan} onChange={setPlan} />
        <Check label="Aceptar cierres" checked={accept} onChange={setAccept} />
        <Check
          label="Autorizar excepciones"
          checked={exceptions}
          onChange={setExceptions}
        />
      </div>
      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() =>
          void perform(
            () =>
              save({ proyecto, user_id: user._id, plan, accept, exceptions }),
            "Autorizaciones guardadas",
          )
        }
      >
        Guardar autorizaciones
      </Button>
      {feedback}
    </div>
  );
}

function ExecutionActivity({
  model,
  activity,
  onClose,
  onRelated,
}: {
  model: ExecutionProgram;
  activity: Activity;
  onClose: () => void;
  onRelated: (id: string) => void;
}) {
  const { perform, busy, feedback } = useAction();
  const review = useMutation(api.programa_obra.acceptExecutionActivity),
    archive = useMutation(api.programa_obra.archiveExecutionActivity);
  const [reviewReason, setReviewReason] = useState(""),
    [reviewEvidence, setReviewEvidence] = useState("");
  const history = useQuery(api.programa_obra.getExecutionHistory, {
    activity_id: activity._id,
  });
  const frontName = model.fronts.find((f) => f._id === activity.front_id)?.name;
  return (
    <Sheet open onOpenChange={onClose}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>
            {activity.name} · {frontName}
          </SheetTitle>
          <SheetDescription>
            {activity.progress.toFixed(1)} % ·{" "}
            {PROGRAM_STATUS_LABELS[activity.status]}
            {activity.delayed && " · Con retraso"}
          </SheetDescription>
        </SheetHeader>
        <div className="mt-5 space-y-5">
          {feedback}
          {activity.blockers.length > 0 && (
            <section
              aria-label="Motivos de bloqueo"
              className="space-y-3 border border-amber-200 bg-amber-50 p-3"
            >
              {activity.blockers.map((b) => (
                <div className="text-sm text-amber-950" key={b.key}>
                  <p>
                    {b.stage === "start"
                      ? "Para iniciar o avanzar: "
                      : "Para cerrar: "}
                    {b.message}
                  </p>
                  <p className="text-xs">
                    Responsable:{" "}
                    {model.users.find((u) => u._id === b.responsible_id)
                      ?.name ?? "Pendiente de asignar"}
                  </p>
                  {b.activity_id && (
                    <button
                      className="mt-1 min-h-9 text-xs underline"
                      type="button"
                      data-viewer-readonly-allow="true"
                      onClick={() => onRelated(b.activity_id!)}
                    >
                      Ver pendiente
                    </button>
                  )}
                </div>
              ))}
            </section>
          )}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <p>
              Inicio vigente
              <br />
              <strong>{activity.current_start ?? "Sin fecha"}</strong>
            </p>
            <p>
              Fin vigente
              <br />
              <strong>{activity.current_finish ?? "Sin fecha"}</strong>
            </p>
            <p>
              Inicio real
              <br />
              <strong>{activity.actual_start ?? "Desconocido"}</strong>
            </p>
            <p>
              Terminación real
              <br />
              <strong>{activity.actual_finish ?? "Desconocida"}</strong>
            </p>
          </div>
          {model.capabilities.write && (
            <ProgressForm
              model={model}
              activity={activity}
              perform={perform}
              busy={busy}
            />
          )}
          {model.capabilities.accept &&
            activity.progress === 100 &&
            (!activity.released || activity.requires_review) && (
              <section className="space-y-3 border-t border-border pt-4">
                <h3 className="text-sm font-medium">Revisión técnica</h3>
                <Field label="Comentario de revisión">
                  <Input
                    value={reviewReason}
                    onChange={(e) => setReviewReason(e.target.value)}
                  />
                </Field>
                <Field label="Evidencia o referencia (opcional)">
                  <Input
                    value={reviewEvidence}
                    onChange={(e) => setReviewEvidence(e.target.value)}
                  />
                </Field>
                <div className="flex gap-2">
                  <Button
                    disabled={busy || !reviewReason.trim()}
                    onClick={() =>
                      void perform(
                        () =>
                          review({
                            activity_id: activity._id,
                            accept: true,
                            reason: reviewReason,
                            evidence: reviewEvidence,
                          }),
                        "Actividad liberada",
                      )
                    }
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Aceptar y liberar
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy || !reviewReason.trim()}
                    onClick={() =>
                      void perform(
                        () =>
                          review({
                            activity_id: activity._id,
                            accept: false,
                            reason: reviewReason,
                            evidence: reviewEvidence,
                          }),
                        "Revisión registrada",
                      )
                    }
                  >
                    Rechazar
                  </Button>
                </div>
              </section>
            )}
          <DependencyForm
            model={model}
            activity={activity}
            perform={perform}
            busy={busy}
            onRelated={onRelated}
          />
          <RequirementForm
            model={model}
            activity={activity}
            perform={perform}
            busy={busy}
          />
          {model.capabilities.plan && (
            <>
              <details className="border-t border-border pt-4">
                <summary className="flex cursor-pointer items-center gap-2 text-sm">
                  Configurar actividad
                  <ChevronDown className="h-4 w-4" />
                </summary>
                <ActivityConfiguration
                  model={model}
                  activity={activity}
                  perform={perform}
                  busy={busy}
                />
              </details>
              <details className="border-t border-border pt-4">
                <summary className="cursor-pointer text-sm">
                  Dividir por frentes
                </summary>
                <SplitForm
                  model={model}
                  activity={activity}
                  perform={perform}
                  busy={busy}
                  onClose={onClose}
                />
              </details>
              {activity.progress < 100 && (
                <details className="border-t border-border pt-4">
                  <summary className="cursor-pointer text-sm">
                    Proponer nuevas fechas
                  </summary>
                  <RescheduleForm
                    model={model}
                    activity={activity}
                    perform={perform}
                    busy={busy}
                  />
                </details>
              )}
              <details className="border-t border-border pt-4">
                <summary className="cursor-pointer text-sm">
                  Archivar actividad
                </summary>
                <p className="my-3 text-xs text-muted-foreground">
                  Se conserva el historial. Primero resuelve las relaciones y
                  requisitos pendientes.
                </p>
                <Field label="Motivo del archivo">
                  <Input
                    value={reviewReason}
                    onChange={(e) => setReviewReason(e.target.value)}
                  />
                </Field>
                <Button
                  variant="outline"
                  className="mt-3"
                  disabled={busy || !reviewReason.trim()}
                  onClick={() =>
                    void perform(
                      () =>
                        archive({
                          activity_id: activity._id,
                          reason: reviewReason,
                        }),
                      "Actividad archivada",
                    ).then((ok) => {
                      if (ok) onClose();
                    })
                  }
                >
                  Archivar
                </Button>
              </details>
            </>
          )}
          <details className="border-t border-border pt-4">
            <summary className="cursor-pointer text-sm">
              Historial de esta actividad
            </summary>
            {(
              history?.events ??
              model.events.filter((e) => e.activity_id === activity._id)
            ).map((e) => (
              <div
                key={e._id}
                className="mt-2 border-b border-border pb-2 text-xs"
              >
                <p>{e.reason}</p>
                <p className="text-muted-foreground">
                  {e.actor_name} ·{" "}
                  {e.execution_date ??
                    new Intl.DateTimeFormat("es-MX", {
                      timeZone: "America/Mexico_City",
                    }).format(e.created_at)}
                </p>
                {e.type === "progress" && (
                  <p>
                    {JSON.parse(e.payload_json).old_progress} % →{" "}
                    {JSON.parse(e.payload_json).progress} %
                  </p>
                )}
              </div>
            ))}
            {!!history?.legacy.length && (
              <>
                <p className="mt-3 text-xs font-medium">
                  Historial agregado de la familia
                </p>
                {history.legacy.map((e) => (
                  <p className="mt-2 text-xs" key={e._id}>
                    {e.old_value ?? 0} % → {e.new_value} % · Ejecución{" "}
                    {e.execution_date ?? "desconocida"} · Capturado por{" "}
                    {e.changed_by_name} el{" "}
                    {new Intl.DateTimeFormat("es-MX", {
                      timeZone: "America/Mexico_City",
                    }).format(e.created_at)}
                  </p>
                ))}
              </>
            )}
          </details>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ProgressForm({
  model,
  activity,
  perform,
  busy,
}: {
  model: ExecutionProgram;
  activity: Activity;
  perform: Perform;
  busy: boolean;
}) {
  const update = useMutation(api.programa_obra.updateExecutionProgress),
    request = useMutation(api.programa_obra.requestExecutionException);
  const [progress, setProgress] = useState(String(activity.progress)),
    [date, setDate] = useState(model.today),
    [reason, setReason] = useState("");
  const requested = Number(progress),
    blockers = programDate(date)
      ? progressBlockers(
          activity,
          requested,
          activityBlockers(
            activity,
            model.activities,
            model.dependencies,
            model.requirements,
            date,
            model.calendar,
          ),
        )
      : [],
    blocked = model.config?.enabled && blockers.length > 0;
  return (
    <section className="space-y-3 border-t border-border pt-4">
      <h3 className="text-sm font-medium">Registrar avance</h3>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Avance físico (%)">
          <Input
            type="number"
            min={0}
            max={100}
            step="any"
            value={progress}
            onChange={(e) => setProgress(e.target.value)}
          />
        </Field>
        <Field label="Fecha de ejecución">
          <Input
            type="date"
            max={model.today}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
      </div>
      <Field label="Motivo · obligatorio para corregir o solicitar excepción">
        <Input value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <p className="text-xs text-muted-foreground">
        Usa la fecha del trabajo realizado, aunque lo estés capturando hoy.
      </p>
      {!!blocked && (
        <p className="text-sm" role="status">
          {blockers.map((b) => b.message).join(" ")}
        </p>
      )}
      <Button
        disabled={
          busy ||
          !progress.trim() ||
          !Number.isFinite(requested) ||
          requested < 0 ||
          requested > 100 ||
          !date ||
          (!!blocked && !reason.trim()) ||
          (requested < activity.progress && !reason.trim())
        }
        onClick={() =>
          void perform(
            () =>
              blocked
                ? request({
                    activity_id: activity._id,
                    progress: requested,
                    execution_date: date,
                    reason,
                  })
                : update({
                    activity_id: activity._id,
                    progress: requested,
                    execution_date: date,
                    reason: reason || undefined,
                  }),
            blocked
              ? "Excepción solicitada; el avance espera autorización"
              : "Avance registrado",
          )
        }
      >
        {blocked ? "Solicitar excepción para este avance" : "Guardar avance"}
      </Button>
    </section>
  );
}

function DependencyForm({
  model,
  activity,
  perform,
  busy,
  onRelated,
}: {
  model: ExecutionProgram;
  activity: Activity;
  perform: Perform;
  busy: boolean;
  onRelated: (id: string) => void;
}) {
  const save = useMutation(api.programa_obra.upsertExecutionDependency),
    remove = useMutation(api.programa_obra.removeExecutionDependency);
  const [predecessor, setPredecessor] = useState(""),
    [kind, setKind] = useState<"FS" | "SS" | "FF">("FS"),
    [days, setDays] = useState("0"),
    [unit, setUnit] = useState<"working" | "natural">("working"),
    [reason, setReason] = useState("");
  const incoming = model.dependencies.filter(
      (d) => d.successor_id === activity._id,
    ),
    outgoing = model.dependencies.filter(
      (d) => d.predecessor_id === activity._id,
    );
  const name = (id: string) => {
    const a = model.activities.find((row) => row._id === id);
    return a
      ? `${a.partida_name} / ${a.name} · ${model.fronts.find((f) => f._id === a.front_id)?.name}`
      : "Actividad no disponible";
  };
  const relation = {
    FS: "Esperar a que termine",
    SS: "Empezar después de su inicio",
    FF: "Terminar después de su cierre",
  };
  return (
    <section className="space-y-3 border-t border-border pt-4">
      <h3 className="text-sm font-medium">Dependencias</h3>
      {incoming.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No depende de otras actividades.
        </p>
      )}
      {incoming.map((d) => (
        <div key={d._id} className="border border-border p-3 text-xs">
          <button
            type="button"
            data-viewer-readonly-allow="true"
            className="min-h-9 text-left underline"
            onClick={() => onRelated(d.predecessor_id)}
          >
            {name(d.predecessor_id)}
          </button>
          <p>
            {relation[d.kind]} · Espera {d.lag_days} días{" "}
            {d.lag_unit === "natural" ? "naturales" : "laborables"}
          </p>
          {model.capabilities.plan && (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy || !reason.trim()}
              onClick={() =>
                void perform(
                  () => remove({ dependency_id: d._id, reason }),
                  "Dependencia retirada",
                )
              }
            >
              Retirar con el motivo indicado
            </Button>
          )}
        </div>
      ))}
      {outgoing.length > 0 && (
        <div className="text-xs">
          <p className="font-medium">Libera o condiciona:</p>
          {outgoing.map((d) => (
            <button
              className="block min-h-9 text-left underline"
              key={d._id}
              type="button"
              data-viewer-readonly-allow="true"
              onClick={() => onRelated(d.successor_id)}
            >
              {name(d.successor_id)}
            </button>
          ))}
        </div>
      )}
      {model.capabilities.plan && (
        <Field label="Motivo para agregar o retirar dependencia">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      )}
      {model.capabilities.plan && (
        <details>
          <summary className="cursor-pointer text-xs">
            Agregar dependencia
          </summary>
          <div className="mt-3 space-y-3">
            <Choice
              label="Actividad previa"
              value={predecessor}
              onChange={setPredecessor}
            >
              <SelectItem value="__empty__">Seleccionar actividad</SelectItem>
              {model.activities
                .filter((a) => a._id !== activity._id)
                .map((a) => (
                  <SelectItem key={a._id} value={a._id}>
                    {name(a._id)}
                  </SelectItem>
                ))}
            </Choice>
            <p className="text-xs">{relation[kind]}</p>
            <details>
              <summary className="cursor-pointer text-xs text-muted-foreground">
                Opciones avanzadas
              </summary>
              <div className="mt-2 space-y-2">
                <Choice
                  label="Relación"
                  value={kind}
                  onChange={(v) => setKind(v as typeof kind)}
                >
                  {Object.entries(relation).map(([id, label]) => (
                    <SelectItem key={id} value={id}>
                      {label}
                    </SelectItem>
                  ))}
                </Choice>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Días de espera">
                    <Input
                      type="number"
                      min={0}
                      max={3660}
                      value={days}
                      onChange={(e) => setDays(e.target.value)}
                    />
                  </Field>
                  <Choice
                    label="Tipo de espera"
                    value={unit}
                    onChange={(v) => setUnit(v as typeof unit)}
                  >
                    <SelectItem value="working">Días laborables</SelectItem>
                    <SelectItem value="natural">Días naturales</SelectItem>
                  </Choice>
                </div>
              </div>
            </details>
            <Field label="Motivo del cambio">
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
            <Button
              variant="outline"
              disabled={busy || !predecessor || !reason.trim()}
              onClick={() =>
                void perform(
                  () =>
                    save({
                      predecessor_id:
                        predecessor as Id<"programa_obra_activities">,
                      successor_id: activity._id,
                      kind,
                      lag_days: Number(days),
                      lag_unit: unit,
                      reason,
                    }),
                  "Dependencia guardada",
                )
              }
            >
              Agregar dependencia
            </Button>
          </div>
        </details>
      )}
    </section>
  );
}

function RequirementForm({
  model,
  activity,
  perform,
  busy,
}: {
  model: ExecutionProgram;
  activity: Activity;
  perform: Perform;
  busy: boolean;
}) {
  const save = useMutation(api.programa_obra.upsertExecutionRequirement),
    resolve = useMutation(api.programa_obra.resolveExecutionRequirement),
    remove = useMutation(api.programa_obra.removeExecutionRequirement);
  const sources = useQuery(api.programa_obra.getExecutionSources, {
    proyecto: activity.proyecto,
  });
  const [description, setDescription] = useState(""),
    [category, setCategory] = useState<
      "materials" | "plans" | "permits" | "equipment" | "crew" | "technical"
    >("materials"),
    [stage, setStage] = useState<"start" | "finish">("start"),
    [blocking, setBlocking] = useState(true),
    [responsible, setResponsible] = useState(activity.responsible_id ?? ""),
    [due, setDue] = useState(model.today),
    [reason, setReason] = useState(""),
    [evidence, setEvidence] = useState(""),
    [source, setSource] = useState<
      "" | "requisicion" | "rfi" | "plano" | "documento"
    >(""),
    [sourceId, setSourceId] = useState("");
  const currentUser = useQuery(api.users.getCurrentUser);
  const requirements = model.requirements.filter(
    (r) => r.activity_id === activity._id,
  );
  return (
    <section className="space-y-3 border-t border-border pt-4">
      <h3 className="text-sm font-medium">Requisitos</h3>
      {!requirements.length && (
        <p className="text-xs text-muted-foreground">
          No tiene requisitos adicionales.
        </p>
      )}
      {requirements.map((r) => (
        <div key={r._id} className="space-y-1 border border-border p-3 text-xs">
          <p className="font-medium">
            {r.resolved ? "Resuelto · " : "Pendiente · "}
            {r.description}
          </p>
          <p>
            {model.users.find((u) => u._id === r.responsible_id)?.name} ·{" "}
            {r.due_date} ·{" "}
            {r.blocking
              ? `Bloquea ${r.stage === "start" ? "inicio" : "cierre"}`
              : "Informativo"}
          </p>
          {r.evidence && <p className="break-words">Evidencia: {r.evidence}</p>}
          {r.source_id && (
            <p className="break-all text-muted-foreground">
              {r.source_type}: {r.source_id}
            </p>
          )}
          {model.capabilities.write &&
            (model.capabilities.accept ||
              r.responsible_id === currentUser?._id) && (
              <Button
                size="sm"
                variant="outline"
                disabled={busy || !reason.trim()}
                onClick={() =>
                  void perform(
                    () =>
                      resolve({
                        requirement_id: r._id,
                        resolved: !r.resolved,
                        reason,
                        evidence,
                      }),
                    r.resolved ? "Requisito reabierto" : "Requisito resuelto",
                  )
                }
              >
                {r.resolved ? "Reabrir requisito" : "Confirmar resolución"}
              </Button>
            )}
          {model.capabilities.plan && (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy || !reason.trim()}
              onClick={() =>
                void perform(
                  () => remove({ requirement_id: r._id, reason }),
                  "Requisito retirado con historial",
                )
              }
            >
              Retirar requisito
            </Button>
          )}
        </div>
      ))}
      {model.capabilities.write && (
        <>
          <Field label="Comentario para resolver o reabrir">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <Field label="Evidencia o referencia (opcional)">
            <Input
              value={evidence}
              onChange={(e) => setEvidence(e.target.value)}
            />
          </Field>
        </>
      )}
      {model.capabilities.plan && (
        <details>
          <summary className="cursor-pointer text-xs">
            Agregar requisito
          </summary>
          <div className="mt-3 space-y-3">
            <Field label="Qué falta">
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Field>
            <Choice
              label="Tipo de requisito"
              value={category}
              onChange={(v) => setCategory(v as typeof category)}
            >
              {Object.entries({
                materials: "Materiales",
                plans: "Planos",
                permits: "Permisos",
                equipment: "Equipo",
                crew: "Cuadrilla",
                technical: "Liberación técnica",
              }).map(([id, label]) => (
                <SelectItem value={id} key={id}>
                  {label}
                </SelectItem>
              ))}
            </Choice>
            <People
              model={model}
              value={responsible}
              onChange={setResponsible}
            />
            <Field label="Fecha compromiso">
              <Input
                type="date"
                value={due}
                onChange={(e) => setDue(e.target.value)}
              />
            </Field>
            <Choice
              label="Etapa"
              value={stage}
              onChange={(v) => setStage(v as typeof stage)}
            >
              <SelectItem value="start">Antes de iniciar o avanzar</SelectItem>
              <SelectItem value="finish">Antes de terminar</SelectItem>
            </Choice>
            <Check
              label="Bloquea esta etapa"
              checked={blocking}
              onChange={setBlocking}
            />
            <details>
              <summary className="cursor-pointer text-xs">
                Vincular un registro existente
              </summary>
              <div className="mt-2 space-y-2">
                <Choice
                  label="Tipo de registro"
                  value={source}
                  onChange={(v) => {
                    setSource(v as typeof source);
                    setSourceId("");
                  }}
                >
                  <SelectItem value="__empty__">Sin vínculo</SelectItem>
                  <SelectItem value="requisicion">Requisición</SelectItem>
                  <SelectItem value="rfi">RFI</SelectItem>
                  <SelectItem value="plano">Plano</SelectItem>
                  <SelectItem value="documento">Documento</SelectItem>
                </Choice>
                <Choice
                  label="Registro existente"
                  value={sourceId}
                  onChange={setSourceId}
                >
                  <SelectItem value="__empty__">Seleccionar registro</SelectItem>
                  {sources
                    ?.filter((r) => r.type === source)
                    .map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                      </SelectItem>
                    ))}
                </Choice>
                <p className="text-xs text-muted-foreground">
                  El registro debe pertenecer a este proyecto. Su estado no
                  resuelve el requisito automáticamente.
                </p>
              </div>
            </details>
            <Button
              variant="outline"
              disabled={
                busy ||
                !description.trim() ||
                !responsible ||
                !due ||
                !reason.trim()
              }
              onClick={() =>
                void perform(
                  () =>
                    save({
                      activity_id: activity._id,
                      description,
                      category,
                      stage,
                      blocking,
                      responsible_id: responsible as Id<"users">,
                      due_date: due,
                      source_type: source || undefined,
                      source_id: source ? sourceId : undefined,
                      reason,
                    }),
                  "Requisito agregado",
                ).then((ok) => {
                  if (ok) setDescription("");
                })
              }
            >
              Agregar requisito
            </Button>
          </div>
        </details>
      )}
    </section>
  );
}

function ActivityConfiguration({
  model,
  activity,
  perform,
  busy,
}: {
  model: ExecutionProgram;
  activity: Activity;
  perform: Perform;
  busy: boolean;
}) {
  const [front, setFront] = useState(String(activity.front_id));
  const save = useMutation(api.programa_obra.configureExecutionActivity);
  const [name, setName] = useState(activity.name),
    [responsible, setResponsible] = useState(activity.responsible_id ?? ""),
    [review, setReview] = useState(activity.requires_review),
    [mandatory, setMandatory] = useState(activity.mandatory),
    [reason, setReason] = useState(""),
    [actualStart, setActualStart] = useState(activity.actual_start ?? ""),
    [actualFinish, setActualFinish] = useState(activity.actual_finish ?? ""),
    [start, setStart] = useState(activity.current_start ?? ""),
    [finish, setFinish] = useState(activity.current_finish ?? "");
  return (
    <div className="mt-3 space-y-3">
      <Field label="Nombre">
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Choice label="Frente de ejecución" value={front} onChange={setFront}>
        {model.fronts
          .filter((f) => !f.archived)
          .map((f) => (
            <SelectItem key={f._id} value={f._id}>
              {f.name}
            </SelectItem>
          ))}
      </Choice>
      <People model={model} value={responsible} onChange={setResponsible} />
      <Check
        label="Requiere revisión técnica al terminar"
        checked={review}
        onChange={setReview}
      />
      <Check
        label="Obligatoria para terminar la familia"
        checked={mandatory}
        onChange={setMandatory}
      />
      <details>
        <summary className="cursor-pointer text-xs">
          Fechas reales e históricas
        </summary>
        <div className="mt-3 space-y-3">
          <p className="text-xs text-muted-foreground">
            Completa fechas desconocidas con información comprobada. No se
            deducen de cuándo capturaste el avance.
          </p>
          <Field label="Inicio real">
            <Input
              type="date"
              max={model.today}
              value={actualStart}
              onChange={(e) => setActualStart(e.target.value)}
            />
          </Field>
          <Field label="Terminación real · solo al 100 %">
            <Input
              type="date"
              max={model.today}
              value={actualFinish}
              onChange={(e) => setActualFinish(e.target.value)}
            />
          </Field>
          {(!model.config?.enabled || activity.dates_need_review) && (
            <>
              <p className="text-xs text-amber-900">
                Revisa el tiempo extra histórico e indica el rango vigente
                completo.
              </p>
              <Field label="Inicio vigente">
                <Input
                  type="date"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </Field>
              <Field label="Fin vigente">
                <Input
                  type="date"
                  value={finish}
                  onChange={(e) => setFinish(e.target.value)}
                />
              </Field>
            </>
          )}
        </div>
      </details>
      <Field label="Motivo del cambio">
        <Input value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <Button
        variant="outline"
        disabled={busy || !name.trim() || !responsible || !reason.trim()}
        onClick={() =>
          void perform(
            () =>
              save({
                activity_id: activity._id,
                name,
                front_id: front as Id<"programa_obra_fronts">,
                responsible_id: responsible as Id<"users">,
                requires_review: review,
                mandatory,
                reason,
                actual_start: actualStart || undefined,
                actual_finish: actualFinish || undefined,
                ...(!model.config?.enabled || activity.dates_need_review
                  ? {
                      current_start: start || undefined,
                      current_finish: finish || undefined,
                    }
                  : {}),
              }),
            "Actividad configurada",
          )
        }
      >
        Guardar actividad
      </Button>
    </div>
  );
}
function SplitForm({
  model,
  activity,
  perform,
  busy,
  onClose,
}: {
  model: ExecutionProgram;
  activity: Activity;
  perform: Perform;
  busy: boolean;
  onClose: () => void;
}) {
  const split = useMutation(api.programa_obra.splitExecutionActivity);
  const [rows, setRows] = useState([
      {
        front_id: "",
        share: "50",
        progress: String(activity.progress),
        responsible_id: activity.responsible_id ?? "",
      },
      {
        front_id: "",
        share: "50",
        progress: String(activity.progress),
        responsible_id: activity.responsible_id ?? "",
      },
    ]),
    [reason, setReason] = useState("");
  const edit = (
    index: number,
    key: keyof (typeof rows)[number],
    value: string,
  ) => setRows(rows.map((r, i) => (i === index ? { ...r, [key]: value } : r)));
  return (
    <div className="mt-3 space-y-3">
      <p className="text-xs text-muted-foreground">
        La distribución debe sumar 100 % y conservar el avance total de{" "}
        {activity.progress.toFixed(1)} %. Cada frente tendrá su propio avance e
        historial.
      </p>
      {rows.map((r, index) => (
        <div key={index} className="space-y-2 border border-border p-3">
          <Choice
            label={`Frente ${index + 1}`}
            value={r.front_id}
            onChange={(v) => edit(index, "front_id", v)}
          >
            <SelectItem value="__empty__">Seleccionar frente</SelectItem>
            {model.fronts
              .filter((f) => !f.archived)
              .map((f) => (
                <SelectItem value={f._id} key={f._id}>
                  {f.name}
                </SelectItem>
              ))}
          </Choice>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Participación (%)">
              <Input
                type="number"
                min={0}
                max={100}
                step="any"
                value={r.share}
                onChange={(e) => edit(index, "share", e.target.value)}
              />
            </Field>
            <Field label="Avance de este frente (%)">
              <Input
                type="number"
                min={0}
                max={100}
                step="any"
                value={r.progress}
                onChange={(e) => edit(index, "progress", e.target.value)}
              />
            </Field>
          </div>
          <People
            model={model}
            value={r.responsible_id}
            onChange={(v) => edit(index, "responsible_id", v)}
          />
        </div>
      ))}
      <Button
        size="sm"
        variant="ghost"
        onClick={() =>
          setRows([
            ...rows,
            {
              front_id: "",
              share: "0",
              progress: String(activity.progress),
              responsible_id: activity.responsible_id ?? "",
            },
          ])
        }
      >
        Agregar otro frente
      </Button>
      <Field label="Motivo de la división">
        <Input value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <Button
        variant="outline"
        disabled={
          busy ||
          !reason.trim() ||
          rows.some((r) => !r.front_id || !r.responsible_id)
        }
        onClick={() =>
          void perform(
            () =>
              split({
                activity_id: activity._id,
                reason,
                fronts: rows.map((r) => ({
                  front_id: r.front_id as Id<"programa_obra_fronts">,
                  share: Number(r.share),
                  progress: Number(r.progress),
                  responsible_id: r.responsible_id as Id<"users">,
                })),
              }),
            "Actividad dividida por frentes",
          ).then((ok) => {
            if (ok) onClose();
          })
        }
      >
        Dividir actividad
      </Button>
    </div>
  );
}

function RescheduleForm({
  model,
  activity,
  perform,
  busy,
}: {
  model: ExecutionProgram;
  activity: Activity;
  perform: Perform;
  busy: boolean;
}) {
  const [start, setStart] = useState(activity.current_start ?? ""),
    [finish, setFinish] = useState(
      activity.forecast_finish ?? activity.current_finish ?? "",
    ),
    [forecasts, setForecasts] = useState<Record<string, string>>({}),
    [reason, setReason] = useState(""),
    [edits, setEdits] = useState<ProgramDateEdit[] | null>(null);
  const proposal = useQuery(
    api.programa_obra.previewExecutionReschedule,
    edits
      ? {
          proyecto: activity.proyecto,
          edits: edits.map((e) => ({
            ...e,
            activity_id: e.activity_id as Id<"programa_obra_activities">,
          })),
        }
      : "skip",
  );
  const apply = useMutation(api.programa_obra.applyExecutionReschedule);
  const calculate = () => {
    const root: ProgramDateEdit =
      activity.progress > 0 || activity.actual_start
        ? { activity_id: activity._id, forecast_finish: finish }
        : { activity_id: activity._id, start, finish };
    setEdits([
      root,
      ...Object.entries(forecasts)
        .filter(([id, date]) => id !== activity._id && date)
        .map(([id, date]) => ({ activity_id: id, forecast_finish: date })),
    ]);
  };
  return (
    <div className="mt-3 space-y-3">
      <p className="text-xs text-muted-foreground">
        Se conserva el programa aprobado. Las sucesoras se moverán únicamente
        tras revisar y aplicar esta propuesta.
      </p>
      {activity.progress === 0 && !activity.actual_start && (
        <Field label="Nuevo inicio">
          <Input
            type="date"
            value={start}
            onChange={(e) => {
              setStart(e.target.value);
              setEdits(null);
            }}
          />
        </Field>
      )}
      <Field
        label={
          activity.progress > 0 || activity.actual_start
            ? "Terminación prevista del trabajo en ejecución"
            : "Nueva terminación"
        }
      >
        <Input
          type="date"
          value={finish}
          onChange={(e) => {
            setFinish(e.target.value);
            setEdits(null);
          }}
        />
      </Field>
      <Button
        variant="outline"
        disabled={
          busy ||
          !finish ||
          (!activity.actual_start && activity.progress === 0 && !start)
        }
        onClick={calculate}
      >
        Calcular impacto
      </Button>
      {edits && !proposal && (
        <p role="status" className="text-xs">
          Calculando…
        </p>
      )}
      {proposal && (
        <>
          <p className="text-xs">
            Fin del proyecto: {proposal.oldFinish} → {proposal.newFinish}
          </p>
          {proposal.problems.map((p, index) => (
            <div
              key={`${p.activity_id}-${index}`}
              className="border border-amber-200 bg-amber-50 p-3 text-xs"
            >
              <p>
                {model.activities.find((a) => a._id === p.activity_id)?.name}:{" "}
                {p.message}
              </p>
              {model.activities.find((a) => a._id === p.activity_id)
                ?.progress && p.activity_id !== activity._id ? (
                <Field label="Indica su terminación prevista">
                  <Input
                    type="date"
                    value={forecasts[p.activity_id] ?? ""}
                    onChange={(e) =>
                      setForecasts({
                        ...forecasts,
                        [p.activity_id]: e.target.value,
                      })
                    }
                  />
                </Field>
              ) : null}
            </div>
          ))}
          <div className="space-y-2">
            {proposal.changes.map((c) => (
              <div
                key={c.activity_id}
                className="border border-border p-3 text-xs"
              >
                <p className="font-medium">{c.name}</p>
                <p>
                  {c.old_start} → {c.start}
                </p>
                <p>
                  {c.old_finish} → {c.finish}
                </p>
              </div>
            ))}
          </div>
          <Field label="Motivo de la reprogramación">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <Button
            disabled={
              busy ||
              !!proposal.problems.length ||
              !proposal.changes.length ||
              !reason.trim()
            }
            onClick={() =>
              void perform(
                () =>
                  apply({
                    proyecto: activity.proyecto,
                    edits: edits!.map((e) => ({
                      ...e,
                      activity_id:
                        e.activity_id as Id<"programa_obra_activities">,
                    })),
                    version: proposal.version,
                    reason,
                  }),
                "Reprogramación aplicada",
              ).then((ok) => {
                if (ok) setEdits(null);
              })
            }
          >
            Aprobar y aplicar nuevas fechas
          </Button>
        </>
      )}
    </div>
  );
}
function ExecutionApprovals({
  model,
  perform,
  busy,
  onSelect,
}: {
  model: ExecutionProgram;
  perform: Perform;
  busy: boolean;
  onSelect: (id: string) => void;
}) {
  const decide = useMutation(api.programa_obra.decideExecutionException),
    [reason, setReason] = useState("");
  const pending = model.exceptions.filter((e) => e.status === "pending");
  if (!pending.length) return null;
  return (
    <section className="space-y-3 border-t border-border pt-4">
      <h3 className="text-sm font-medium">
        Excepciones pendientes · {pending.length}
      </h3>
      {model.capabilities.exceptions && (
        <Field label="Justificación de la decisión">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      )}
      {pending.map((e) => (
        <div key={e._id} className="space-y-2 border border-border p-3 text-xs">
          <button
            className="min-h-9 text-left font-medium underline"
            type="button"
            data-viewer-readonly-allow="true"
            onClick={() => onSelect(e.activity_id)}
          >
            {model.activities.find((a) => a._id === e.activity_id)?.name ??
              "Actividad archivada"}
          </button>
          <p>
            {e.old_progress} % → {e.progress} % · Ejecución {e.execution_date}
          </p>
          <p>{e.reason}</p>
          <ul className="list-disc pl-4">
            {(
              JSON.parse(e.blockers_json) as { key: string; message: string }[]
            ).map((b) => (
              <li key={b.key}>{b.message}</li>
            ))}
          </ul>
          {e.version !== model.config?.version && (
            <p className="text-amber-900">
              El programa cambió; esta solicitud necesita renovarse.
            </p>
          )}
          {model.capabilities.exceptions && (
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={
                  busy || !reason.trim() || e.version !== model.config?.version
                }
                onClick={() =>
                  void perform(
                    () =>
                      decide({ exception_id: e._id, approve: true, reason }),
                    "Excepción aprobada y avance registrado",
                  )
                }
              >
                Autorizar este avance
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy || !reason.trim()}
                onClick={() =>
                  void perform(
                    () =>
                      decide({ exception_id: e._id, approve: false, reason }),
                    "Solicitud rechazada",
                  )
                }
              >
                Rechazar
              </Button>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
