import type { OfflineProfile, PreparationFailure, PreparationPhase } from "./types";

export class BitacoraAccessError extends Error {
  constructor(public readonly kind: PreparationFailure, message: string) {
    super(message);
    this.name = "BitacoraAccessError";
  }
}

export class BitacoraScopeChanged extends Error {
  constructor() { super("El usuario o proyecto activo cambió."); }
}

export function isProfileUsable(profile: OfflineProfile | undefined, userId: string | undefined, projectId: string, now = Date.now()) {
  return Boolean(profile && userId && profile.clerkId === userId && profile.projectIds.includes(projectId) && profile.expiresAt > now);
}

export function classifyPreparationFailure(error: unknown, phase: PreparationPhase): PreparationFailure {
  if (error instanceof BitacoraAccessError) return error.kind;
  const name = error instanceof Error ? error.name : "";
  if (["QuotaExceededError", "SecurityError", "InvalidStateError", "DatabaseClosedError", "OpenFailedError", "AbortError"].includes(name) || phase === "storage") return "storage";
  // These are the explicit authentication/access errors returned by the existing backend.
  const message = error instanceof Error ? error.message : "";
  if (message.includes("Not authenticated")) return "session";
  if (message.includes("Unauthorized: Project access required")) return "forbidden";
  return "unknown";
}

export const preparationLabels: Record<PreparationPhase, string> = {
  idle: "", reading: "Abriendo la información guardada en este dispositivo", session: "Validando tu sesión",
  bootstrap: "Cargando información del proyecto", storage: "Guardando información en este dispositivo",
  pull: "Recuperando reportes", downloads: "Descargando archivos solicitados", push: "Enviando cambios guardados",
  refresh: "Actualizando reportes", waiting: "Hay una sincronización en curso",
};

export function preparationMessage(input: {
  projectName?: string; isReady: boolean; isReading: boolean; isBusy: boolean;
  networkOnline: boolean; backendConnected: boolean; hasClient: boolean;
  expired: boolean; failure?: PreparationFailure; hasError: boolean;
}) {
  const title = input.projectName ? `Cargando Bitácora de ${input.projectName}` : "Cargando Bitácora";
  if (input.failure === "forbidden") return { title: "Acceso a Bitácora restringido", message: "Tu cuenta no tiene acceso a esta Bitácora." };
  if (input.failure === "session") return { title: "Valida tu sesión", message: "No pudimos validar tu sesión. Inicia sesión para actualizar Bitácora." };
  if (input.failure === "storage") return { title: "No pudimos guardar la preparación", message: "No pudimos acceder al almacenamiento de este dispositivo. Comprueba que el navegador permita guardar datos y que haya espacio disponible. Los cambios locales no se borraron." };
  if (input.expired) return { title: "La preparación de este dispositivo venció", message: "Conéctate para validar tu sesión y volver a abrir Bitácora. Los cambios guardados localmente se conservan." };
  if (input.isReading) return { title, message: "Abriendo la Bitácora guardada en este dispositivo." };
  if (!input.networkOnline || !input.hasClient) return { title: input.isReady ? "Sin conexión" : "Se requiere conexión para preparar Bitácora", message: input.isReady ? "Puedes consultar los reportes guardados en este dispositivo. Los cambios pendientes se enviarán cuando la conexión y la sesión estén disponibles." : "Esta Bitácora aún no está preparada en este dispositivo. Conéctate para cargarla por primera vez." };
  if (!input.backendConnected) return { title: "Conectando con el servidor", message: input.isReady ? "No se ha establecido conexión con el servidor. Puedes consultar la información local disponible." : "No se ha establecido conexión con el servidor. La primera carga necesita esa conexión." };
  if (input.hasError && !input.isBusy) return { title: input.isReady ? "No pudimos actualizar Bitácora" : "No pudimos cargar Bitácora", message: input.isReady ? "Estás viendo la información disponible en este dispositivo. Puedes reintentar la actualización." : "La preparación no se completó. Puedes reintentar cuando la conexión y la sesión estén disponibles." };
  return { title: input.isReady ? "Actualizando Bitácora" : title, message: input.isReady ? "Puedes consultar los reportes disponibles en este dispositivo mientras se actualizan." : "Estamos preparando los reportes en este dispositivo para que puedas consultarlos sin conexión." };
}

export function createSingleAttempt() {
  let active: Promise<void> | undefined;
  return (work: () => Promise<void>) => {
    if (active) return active;
    // Assign before invoking work so simultaneous automatic/manual triggers share it.
    const promise = Promise.resolve().then(work).finally(() => { if (active === promise) active = undefined; });
    active = promise;
    return promise;
  };
}

/** Local, inspectable Performance entries. No telemetry or project/user identifiers. */
export function measurePreparation() {
  let phase: PreparationPhase = "idle";
  let started = performance.now();
  return (next: PreparationPhase) => {
    const end = performance.now();
    if (phase !== "idle") performance.measure(`bitacora:${phase}`, { start: started, end });
    started = end;
    phase = next;
  };
}
