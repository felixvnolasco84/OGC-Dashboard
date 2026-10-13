import { useSyncExternalStore } from "react";
import { getFunctionName } from "convex/server";
import { ConvexError } from "convex/values";
import {
  programToday,
  summarizeProgram,
  DEFAULT_PROGRAM_CALENDAR,
} from "../../src/lib/programa-obra-rules";
import {
  previewProgramWeight,
  programWeightDigest,
  programWeightSource,
} from "../../src/lib/programa-obra-weight";

const params = new URLSearchParams(location.search);
export const useConvexConnectionState = () => ({ isWebSocketConnected: true });
const viewer = params.has("viewer"),
  planner = params.has("planner"),
  noConfig = params.has("legacy");
const project = {
  _id: "project",
  nombre: "Residencial · revisión de ponderaciones",
};
const partidas = [
  {
    _id: "budgetA",
    proyecto: "project",
    nombre: "Estructura",
    nivel: 1,
    presupuesto_aprobado: 100000,
    pagado: 25000,
  },
  {
    _id: "budgetB",
    proyecto: "project",
    nombre: "Instalaciones",
    nivel: 1,
    presupuesto_aprobado: 100000,
    pagado: 0,
  },
];
const schedules = [
  {
    _id: "scheduleA",
    partida_id: "budgetA",
    proyecto: "project",
    peso: 20,
    orden: 0,
    fecha_inicio: "01/01/2026",
    fecha_fin: "31/12/2026",
  },
  {
    _id: "scheduleB",
    partida_id: "budgetB",
    proyecto: "project",
    peso: 80,
    orden: 1,
    fecha_inicio: "01/01/2026",
    fecha_fin: "31/12/2026",
  },
];
const details = [
  {
    _id: "familyA",
    programa_obra_id: "scheduleA",
    proyecto: "project",
    partida: "Estructura",
    familia: "Excavación",
    nivel: 2,
    peso: 20 as number | undefined,
    orden: 0,
    avance_porcentaje: 100,
    fecha_inicio: "01/01/2026",
    fecha_fin: "31/01/2026",
  },
  {
    _id: "familyB",
    programa_obra_id: "scheduleA",
    proyecto: "project",
    partida: "Estructura",
    familia: "Cimentación",
    nivel: 2,
    peso: 80 as number | undefined,
    orden: 1,
    avance_porcentaje: 0,
    fecha_inicio: "01/12/2026",
    fecha_fin: "31/12/2026",
  },
  {
    _id: "familyC",
    programa_obra_id: "scheduleB",
    proyecto: "project",
    partida: "Instalaciones",
    familia: "Red hidráulica",
    nivel: 2,
    peso: 100 as number | undefined,
    orden: 0,
    avance_porcentaje: 0,
    fecha_inicio: "01/12/2026",
    fecha_fin: "31/12/2026",
  },
];
if (params.has("missing")) details[1].peso = undefined;
if (params.has("zero")) {
  details[0].peso = 0;
  details[1].peso = 0;
}
let tick = 0,
  sourceVersion = 0,
  version = 1;
let mode = "success",
  pendingResolve: (() => void) | null = null;
const listeners = new Set<() => void>();
const cache = new Map<string, unknown>();
const notify = () => {
  tick++;
  listeners.forEach((callback) => callback());
};
const changed = () => {
  sourceVersion++;
  notify();
};
const subscribe = (callback: () => void) => {
  listeners.add(callback);
  return () => listeners.delete(callback);
};
const snapshot = () => tick;
const attempts: unknown[] = [],
  events: unknown[] = [];
Object.assign(window, {
  weightTest: {
    attempts,
    events,
    schedules,
    details,
    setMode: (value: string) => {
      mode = value;
    },
    resolvePending: () => pendingResolve?.(),
    changeProgress: () => {
      details[1].avance_porcentaje = 50;
      changed();
    },
    changeSiblingWeight: () => {
      details[1].peso = 10;
      changed();
    },
    getVersion: () => version,
  },
});

async function review(args: {
  target: { kind: "schedule" | "detail"; id: string };
  peso: number;
}) {
  if (viewer || (planner && noConfig))
    return {
      ok: false,
      message: "No tienes autorización para editar ponderaciones.",
    };
  const today = programToday();
  const impact = previewProgramWeight(
    schedules,
    details,
    [],
    args.target,
    args.peso,
    today,
    DEFAULT_PROGRAM_CALENDAR,
  );
  const sourceToken = await programWeightDigest(
    JSON.stringify([
      project._id,
      programWeightSource(
        schedules,
        details,
        [],
        today,
        DEFAULT_PROGRAM_CALENDAR,
      ),
    ]),
  );
  return {
    ok: true,
    impact,
    sourceToken,
    reviewToken: await programWeightDigest(
      JSON.stringify([sourceToken, args.target, args.peso]),
    ),
    baseline: !noConfig,
    scheduleName:
      args.target.kind === "schedule"
        ? partidas.find(
            (p) =>
              schedules.find((s) => s._id === args.target.id)?.partida_id ===
              p._id,
          )!.nombre
        : details.find((d) => d._id === args.target.id)!.partida,
    familyName:
      args.target.kind === "detail"
        ? details.find((d) => d._id === args.target.id)!.familia
        : null,
  };
}

export function useQuery(
  reference: Parameters<typeof getFunctionName>[0],
  args?: unknown,
) {
  useSyncExternalStore(subscribe, snapshot, snapshot);
  if (args === "skip") return undefined;
  const name = getFunctionName(reference);
  if (name === "programa_obra:previewWeightChange") {
    const key = JSON.stringify([sourceVersion, args]);
    if (!cache.has(key)) {
      cache.set(key, undefined);
      review(args as Parameters<typeof review>[0]).then((result) => {
        cache.set(key, result);
        notify();
      });
    }
    return cache.get(key);
  }
  switch (name) {
    case "users:getCurrentUser":
      return {
        _id: "actor",
        name: "Revisor",
        role: viewer ? "viewer" : planner ? "user" : "admin",
      };
    case "desarrollos:getById":
      return project;
    case "partida:getByNivel":
      return partidas;
    case "programa_obra:getSchedulesByProyecto":
      return [...schedules];
    case "programa_obra:getDetallesByProyecto":
      return [...details];
    case "programa_obra:getExecutionProgram":
      return {
        config: noConfig
          ? null
          : { enabled: false, version, ...DEFAULT_PROGRAM_CALENDAR },
        calendar: DEFAULT_PROGRAM_CALENDAR,
        today: programToday(),
        activities: [],
        fronts: [],
        dependencies: [],
        requirements: [],
        exceptions: [],
        events: [],
        revisions: [],
        permissions: [],
        users: [],
        summaries: summarizeProgram(schedules, details, []),
        capabilities: {
          admin: !viewer && !planner,
          write: !viewer,
          plan: !viewer,
          accept: false,
          exceptions: false,
        },
      };
    default:
      return [];
  }
}

export function useMutation(reference: Parameters<typeof getFunctionName>[0]) {
  const name = getFunctionName(reference);
  return async (args: {
    peso: number;
    schedule_id?: string;
    detalle_id?: string;
    review_token: string;
  }) => {
    attempts.push({ name, args });
    if (mode === "pending")
      await new Promise<void>((resolve) => {
        pendingResolve = resolve;
      });
    if (mode === "error") {
      mode = "success";
      throw new Error("Error de conexión de prueba. Intenta nuevamente.");
    }
    if (mode === "conflict") {
      mode = "success";
      details[1].avance_porcentaje = 50;
      changed();
    }
    const target = args.schedule_id
      ? { kind: "schedule" as const, id: args.schedule_id }
      : { kind: "detail" as const, id: args.detalle_id! };
    const fresh = await review({ target, peso: args.peso });
    if (fresh.reviewToken !== args.review_token)
      throw new ConvexError({
        code: "WEIGHT_REVIEW_CONFLICT",
        message: "El programa cambió después de la revisión.",
      });
    const row =
      target.kind === "schedule"
        ? schedules.find((s) => s._id === target.id)!
        : details.find((d) => d._id === target.id)!;
    if (row.peso === args.peso) return { success: true, changed: false };
    events.push({ id: target.id, old_weight: row.peso, weight: args.peso });
    row.peso = args.peso;
    version++;
    changed();
    if (mode === "lost-response") {
      mode = "success";
      throw new Error(
        "No se recibió la respuesta del servidor. Revisa el peso vigente.",
      );
    }
    return { success: true, changed: true };
  };
}
