import { AlertCircle, CheckCircle2, CloudOff, Loader2, RefreshCw, WifiOff } from "lucide-react";
import { Link } from "react-router";
import { useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useBitacoraRepository } from "@/lib/bitacora-offline/context";
import { preparationLabels, preparationMessage } from "@/lib/bitacora-offline/preparation";

function usePreparationMessage() {
  const repository = useBitacoraRepository();
  return preparationMessage({ projectName: repository.project?.name, isReady: repository.isReady,
    isReading: repository.isReading, isBusy: repository.isBusy, networkOnline: repository.networkOnline,
    backendConnected: repository.backendConnected, hasClient: repository.hasClient,
    expired: repository.profileExpired && !repository.isBusy, failure: repository.failure,
    hasError: Boolean(repository.syncError),
  });
}

export function BitacoraStatusHeader() {
  const r = useBitacoraRepository();
  const refreshButton = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);
  useEffect(() => {
    if (r.isBusy || r.syncStatus === "syncing" || !returnFocus.current) return;
    returnFocus.current = false;
    if (r.canRetry && document.activeElement === document.body) refreshButton.current?.focus();
  }, [r.isBusy, r.canRetry, r.syncStatus]);
  const hasProblem = Boolean(r.failure || (!r.isBusy && (r.syncError || r.profileExpired)) || r.errorCount || r.conflictCount || r.pausedCount);
  if (r.mode === "online" && !hasProblem && !r.pendingCount) return <div className="flex flex-wrap items-start justify-between gap-4">
    <div className="min-w-0 text-left">
      <p className="mb-1 text-base text-muted-foreground">Bitácora</p>
      <h1 className="break-words text-2xl text-foreground">{r.project?.name || "Bitácora del proyecto"}</h1>
    </div>
    <Badge variant="success"><CheckCircle2 aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" />En línea</Badge>
  </div>;
  const label = !r.isReady
    ? hasProblem ? "Atención requerida" : r.isBusy ? "Preparando" : r.isReading ? "Abriendo" : "Preparación pendiente"
    : hasProblem ? "Revisión necesaria" : r.isBusy ? "Actualizando" : r.mode === "offline" ? "Información local"
      : r.pendingCount ? "Cambios por enviar" : r.lastSyncAt ? "Cambios sincronizados" : "Datos disponibles";
  const Icon = hasProblem ? AlertCircle : r.isBusy || r.isReading ? Loader2 : !r.isOnline ? CloudOff : CheckCircle2;
  const retryLabel = r.isBusy ? r.isReady ? "Actualización en curso" : "Preparación en curso"
    : r.syncError && !r.pausedCount ? r.isReady ? "Reintentar actualización" : "Reintentar preparación" : "Actualizar ahora";
  return <div className="flex flex-wrap items-start justify-between gap-4">
    <div className="min-w-0 text-left">
      <p className="mb-1 text-base text-muted-foreground">Bitácora</p>
      <h1 className="break-words text-2xl text-foreground">{r.project?.name || "Bitácora del proyecto"}</h1>
    </div>
    <div className="flex min-w-0 max-w-full flex-col gap-2 sm:items-end">
      <div className="flex max-w-full flex-wrap items-center gap-2">
        <div role="status" aria-live="polite" aria-atomic="true">
          <Badge variant={hasProblem ? "danger" : r.isBusy ? "neutral" : r.pendingCount ? "warning" : r.isOnline && r.isReady ? "success" : "neutral"}>
            <Icon aria-hidden="true" className={`mr-1.5 h-3.5 w-3.5 ${r.isBusy || r.isReading ? "motion-safe:animate-spin" : ""}`} />{label}
          </Badge>
        </div>
        <Button ref={refreshButton} type="button" size="sm" variant="ghost" title={retryLabel} aria-label={retryLabel}
          aria-busy={r.isBusy} disabled={!r.canRetry || r.syncStatus === "syncing"} onClick={() => {
            returnFocus.current = document.activeElement === refreshButton.current;
            void r.retrySync();
          }}>
          <RefreshCw aria-hidden="true" className={r.isBusy ? "motion-safe:animate-spin" : ""} />
          <span>{retryLabel}</span>
        </Button>
      </div>
      {r.isReady && <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {!r.isOnline && <WifiOff aria-hidden="true" className="h-3.5 w-3.5" />}
        {!r.networkOnline || !r.hasClient ? "Sin conexión" : !r.backendConnected ? "Servidor sin conexión" : "Conectado al servidor"}
      </p>}
      {r.lastSyncAt && <p className="text-xs text-muted-foreground">Datos actualizados: <time dateTime={new Date(r.lastSyncAt).toISOString()}>
        {new Date(r.lastSyncAt).toLocaleString("es-MX", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
      </time></p>}
      {r.isReady && (r.pendingCount > 0 || r.errorCount > 0 || r.conflictCount > 0 || r.pausedCount > r.errorCount + r.conflictCount) &&
        <div className="flex max-w-full flex-wrap gap-2 text-xs">
          {r.pendingCount > 0 && <Badge variant="warning">{r.pendingCount} cambio{r.pendingCount === 1 ? "" : "s"} por enviar</Badge>}
          {r.errorCount > 0 && <Badge variant="danger">{r.errorCount} reporte{r.errorCount === 1 ? "" : "s"} con error</Badge>}
          {r.conflictCount > 0 && <Badge variant="danger">{r.conflictCount} reporte{r.conflictCount === 1 ? "" : "s"} en conflicto</Badge>}
          {r.pausedCount > r.errorCount + r.conflictCount && <Badge variant="danger">Cambios por revisar</Badge>}
        </div>}
    </div>
  </div>;
}

export function BitacoraPreparationPanel() {
  const r = useBitacoraRepository();
  const message = usePreparationMessage();
  if (r.mode === "online") return <section aria-busy="true" className="flex min-h-[55vh] flex-col items-center justify-center gap-4 px-5 py-10 text-center">
    <Loader2 aria-hidden="true" className="h-9 w-9 motion-safe:animate-spin text-muted-foreground" />
    <h2 className="text-xl">Cargando Bitácora</h2>
    <p className="text-sm text-muted-foreground">Consultando los reportes del proyecto.</p>
  </section>;
  const problem = Boolean(r.failure || r.profileExpired || (!r.isBusy && r.syncError));
  const Icon = problem ? AlertCircle : r.isBusy || r.isReading ? Loader2 : WifiOff;
  return <section aria-labelledby="bitacora-preparation-title" aria-busy={r.isBusy || r.isReading}
    className="flex min-h-[55vh] flex-col items-center justify-center gap-4 px-5 py-10 text-center md:px-12">
    <Icon aria-hidden="true" className={`h-9 w-9 ${problem ? "text-destructive" : "text-muted-foreground"} ${r.isBusy || r.isReading ? "motion-safe:animate-spin" : ""}`} />
    <div className="max-w-lg space-y-2">
      <h2 id="bitacora-preparation-title" className="text-xl">{message.title}</h2>
      <p className="text-sm leading-relaxed text-muted-foreground">{message.message}</p>
      {r.isBusy && <p className="text-sm">{preparationLabels[r.phase]}…</p>}
      {r.prolonged && <p className="text-sm text-muted-foreground">La preparación sigue en curso. Puedes volver al proyecto y regresar a Bitácora.</p>}
      {r.failure === "session" && <Button asChild variant="outline" size="sm"><Link to="/sign-in">Iniciar sesión</Link></Button>}
      {!r.canRetry && !r.isBusy && !r.isReading && !r.failure && <p className="text-xs text-muted-foreground">La preparación comenzará al recuperar la conexión con el servidor.</p>}
      {r.syncError && <details className="pt-2 text-left text-xs text-muted-foreground"><summary className="cursor-pointer">Detalles del problema</summary><p className="mt-2 break-words">{r.syncError}</p></details>}
    </div>
  </section>;
}

export function BitacoraAvailabilityNotice() {
  const r = useBitacoraRepository();
  const message = usePreparationMessage();
  if (r.mode === "online" && !r.errorCount && !r.conflictCount && !r.syncError) return null;
  return <div className="space-y-2 border-t border-border pt-4 text-sm">
    {r.mode === "offline" && (r.isBusy || !r.isOnline || r.syncError) && <p className="text-muted-foreground">{message.message}</p>}
    {r.mode === "offline" && r.isOnline && <p className="text-muted-foreground">La conexión es limitada. Puedes trabajar con la información guardada en este dispositivo.</p>}
    {r.failure === "session" && <Button asChild variant="outline" size="sm"><Link to="/sign-in">Iniciar sesión</Link></Button>}
    {r.errorCount > 0 && <p>Hay reportes con error. Revisa su detalle; los cambios rechazados pueden requerir corrección.</p>}
    {r.conflictCount > 0 && <p>Hay versiones diferentes de algunos reportes. Expándelos para revisar y resolver los conflictos.</p>}
    {r.mode === "offline" && <p className="text-xs text-muted-foreground">{r.attachmentCount
      ? `${r.offlineAttachmentCount} de ${r.attachmentCount} archivos disponibles sin conexión. Puedes guardar los demás desde cada archivo.`
      : "Esta Bitácora no tiene archivos adjuntos."}</p>}
    {r.mode === "offline" && r.downloadErrorCount > 0 && <p className="text-xs text-destructive">{r.downloadErrorCount === 1 ? "No se pudo descargar 1 archivo" : `No se pudieron descargar ${r.downloadErrorCount} archivos`}. Revisa el aviso junto a cada archivo.</p>}
  </div>;
}
