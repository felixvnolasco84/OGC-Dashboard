import { useMemo, useState } from "react";
import { useParams } from "react-router";
import {
  AlertCircle,
  Calendar as CalendarIcon,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  CloudDownload,
  CloudOff,
  Download,
  Eye,
  FileText,
  ImageOff,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  WifiOff,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import BitacoraCalendarView from "@/components/Bitacora/BitacoraCalendarView";
import BitacoraGalleryModal from "@/components/Bitacora/BitacoraGalleryModal";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useBitacoraModal } from "@/hooks/use-bitacora-modal";
import { useBitacoraRepository } from "@/lib/bitacora-offline/context";
import type {
  BitacoraAttachmentView,
  BitacoraEntryView,
} from "@/lib/bitacora-offline/types";

const months = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

interface GalleryState {
  isOpen: boolean;
  photos: BitacoraAttachmentView[];
  initialIndex: number;
  logDate?: string;
  logResponsable?: string;
  logTitle?: string;
}

function displayDate(value: string) {
  const [day, month, year] = value.split("/").map(Number);
  return day && month && year ? `${day} ${months[month - 1]}, ${year}` : value;
}

function dateValue(value: string) {
  const [day, month, year] = value.split("/").map(Number);
  return year && month && day ? new Date(year, month - 1, day).getTime() : 0;
}

function truncateName(value: string, length = 17) {
  return value.length > length ? `${value.slice(0, length)}…` : value;
}

function syncLabel(entry: BitacoraEntryView): { text: string; variant: BadgeProps["variant"] } {
  if (entry.sync_state === "conflict") return { text: "Conflicto", variant: "danger" };
  if (entry.sync_state === "error") return { text: "Error", variant: "danger" };
  if (entry.sync_state === "syncing") return { text: "Sincronizando", variant: "neutral" };
  if (entry.sync_state === "pending") return { text: "Guardado localmente", variant: "warning" };
  return { text: "Sincronizado", variant: "success" };
}

function DocumentPill({ file, online, onDownload }: {
  file: BitacoraAttachmentView;
  online: boolean;
  onDownload: () => Promise<void>;
}) {
  const href = file.available_offline ? file.local_url : file.url;
  const canOpen = file.available_offline || online;
  return (
    <div className="inline-flex max-w-full items-center border border-border bg-card text-xs text-foreground">
      {canOpen && href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-w-0 items-center gap-1.5 px-3 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring hover:bg-muted hover:underline"
          onClick={(event) => event.stopPropagation()}
        >
          <FileText className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{truncateName(file.nombre)}</span>
        </a>
      ) : (
        <span className="inline-flex min-w-0 items-center gap-1.5 px-3 py-1.5 text-muted-foreground">
          <FileText className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{truncateName(file.nombre)}</span>
        </span>
      )}
      {!file.available_offline && (
        <span className="border-l border-border">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            title={online ? "Descargar para uso sin conexión" : "Descargar automáticamente al reconectar"}
            aria-label={`Guardar ${file.nombre} sin conexión`}
            onClick={(event) => {
              event.stopPropagation();
              void onDownload();
            }}
          >
            {file.download_requested ? <CloudDownload /> : online ? <Download /> : <WifiOff />}
          </Button>
        </span>
      )}
    </div>
  );
}

function PhotoPreview({ file, online, downloading, onDownload, onOpen }: {
  file: BitacoraAttachmentView;
  online: boolean;
  downloading: boolean;
  onDownload: () => void;
  onOpen: () => void;
}) {
  const source = online ? file.url || file.local_url : file.local_url;
  if (source && (online || file.available_offline)) {
    return (
      <Button
        type="button"
        onClick={onOpen}
        variant="mediaThumbnail"
        size="thumbnail"
        title="Abrir en la galería"
      >
        <img src={source} alt={file.descripcion || file.nombre} className="h-full w-full object-cover" />
        {!online && <span className="absolute bottom-1 right-1 bg-overlay/80 px-1.5 py-0.5 text-xs text-on-color">Offline</span>}
      </Button>
    );
  }

  return (
    <div className="relative h-24 w-24 shrink-0 overflow-hidden border border-border-strong bg-muted">
      {file.thumbnail_url ? (
        <img src={file.thumbnail_url} alt="Vista previa borrosa" className="h-full w-full scale-125 object-cover blur-md" />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted to-disabled">
          <ImageOff className="h-6 w-6 text-disabled-foreground" />
        </div>
      )}
      <div className="absolute inset-0 bg-overlay/25" />
      <div className="absolute inset-0">
      <Button
        type="button"
        disabled={downloading}
        onClick={onDownload}
        title={online ? "Descargar original para uso sin conexión" : "Descargar automáticamente al reconectar"}
        variant="mediaDownload"
        size="overlayFill"
      >
        {downloading ? <Loader2 className="h-5 w-5 animate-spin" /> : file.download_requested ? <CloudDownload className="h-5 w-5" /> : online ? <Download className="h-5 w-5" /> : <WifiOff className="h-5 w-5" />}
        <span>{downloading ? "Descargando" : file.download_requested ? "En espera" : online ? "Descargar" : "Al reconectar"}</span>
      </Button>
      </div>
    </div>
  );
}

export default function BitacoraPage() {
  const { proyectoId = "" } = useParams<{ proyectoId: string }>();
  const repository = useBitacoraRepository();
  const modal = useBitacoraModal();
  const [view, setView] = useState<"grouped" | "calendar">("grouped");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState<Set<string>>(new Set());
  const [deleteEntry, setDeleteEntry] = useState<BitacoraEntryView | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [gallery, setGallery] = useState<GalleryState>({ isOpen: false, photos: [], initialIndex: 0 });

  const grouped = useMemo(() => {
    const result: Record<string, BitacoraEntryView[]> = {};
    [...repository.entries].sort((a, b) => dateValue(b.fecha) - dateValue(a.fecha)).forEach((entry) => {
      (result[entry.categoria || "General"] ??= []).push(entry);
    });
    return result;
  }, [repository.entries]);

  const open = (mode: "create" | "edit" | "view", logEntry?: BitacoraEntryView, fecha?: string, categoria?: string) => {
    modal.onOpen({ proyectoId, mode, logEntry, fecha, categoria });
  };

  const toggleEntry = (entryClientId: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(entryClientId)) next.delete(entryClientId);
      else next.add(entryClientId);
      return next;
    });
  };

  const toggleCategory = (category: string) => {
    setExpandedCategories((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  const downloadAttachment = async (file: BitacoraAttachmentView) => {
    if (downloading.has(file.client_id) || file.download_requested) return;
    setDownloading((current) => new Set(current).add(file.client_id));
    try {
      const result = await repository.makeAttachmentAvailableOffline(file.client_id);
      toast.success(result === "queued"
        ? `${file.nombre} se descargará al recuperar la conexión.`
        : `${file.nombre} ya está disponible sin conexión.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo descargar el archivo.");
    } finally {
      setDownloading((current) => {
        const next = new Set(current);
        next.delete(file.client_id);
        return next;
      });
    }
  };

  const openGallery = (entry: BitacoraEntryView, selectedClientId?: string) => {
    const photos = repository.isOnline
      ? entry.fotos.filter((photo) => Boolean(photo.local_url || photo.url))
      : entry.fotos.filter((photo) => photo.available_offline && Boolean(photo.local_url));
    if (photos.length === 0) {
      toast.info(repository.isOnline
        ? "No hay imágenes disponibles para abrir en la galería."
        : "No hay imágenes de este reporte descargadas en el dispositivo.");
      return;
    }
    const selectedIndex = selectedClientId ? photos.findIndex((photo) => photo.client_id === selectedClientId) : 0;
    setGallery({
      isOpen: true,
      photos,
      initialIndex: Math.max(selectedIndex, 0),
      logDate: displayDate(entry.fecha),
      logResponsable: entry.responsable,
      logTitle: entry.departamento || entry.categoria,
    });
  };

  const confirmDelete = async () => {
    if (!deleteEntry) return;
    setDeleting(true);
    try {
      await repository.deleteEntry(deleteEntry.client_id);
      toast.success(repository.isOnline ? "Eliminación guardada; se sincronizará." : "Eliminación guardada localmente.");
      setDeleteEntry(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo eliminar.");
    } finally {
      setDeleting(false);
    }
  };

  if (!repository.isReady) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-card p-8 text-center text-foreground">
        {repository.syncStatus === "error" ? <AlertCircle className="h-10 w-10 text-destructive dark:text-foreground" /> : <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />}
        <div>
          <h1 className="text-xl ">Preparando Bitácora offline</h1>
          <p className="mt-1 text-sm text-muted-foreground">La primera preparación necesita una conexión y una sesión válida.</p>
        </div>
        {repository.syncError && <p className="max-w-xl text-sm text-destructive dark:text-foreground">{repository.syncError}</p>}
        <Button size="sm" variant="default" onClick={() => void repository.retrySync()} disabled={!repository.isOnline}>
          <RefreshCw className="mr-2 h-4 w-4" />Reintentar
        </Button>
      </div>
    );
  }

  const globalStatus: { icon: LucideIcon; label: string; variant: BadgeProps["variant"] } = !repository.isOnline
    ? { icon: WifiOff, label: "Sin conexión", variant: "neutral" }
    : repository.syncStatus === "syncing"
      ? { icon: Loader2, label: "Sincronizando", variant: "neutral" }
      : repository.syncStatus === "error"
        ? { icon: AlertCircle, label: "Error", variant: "danger" }
        : repository.conflictCount
          ? { icon: AlertCircle, label: `${repository.conflictCount} conflicto${repository.conflictCount === 1 ? "" : "s"}`, variant: "danger" }
          : repository.pendingCount
            ? { icon: CloudOff, label: `${repository.pendingCount} pendiente${repository.pendingCount === 1 ? "" : "s"}`, variant: "warning" }
            : { icon: CheckCircle2, label: "Sincronizado", variant: "success" };
  const StatusIcon = globalStatus.icon;

  return (
    <div className="min-h-screen bg-card text-foreground">
      <header className="border-b border-border bg-card px-5 pb-8 pt-12 md:px-12">
        <div className="space-y-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="text-left">
              <p className="mb-1 text-base text-muted-foreground">Bitácora</p>
              <h1 className="text-2xl text-foreground">{repository.project?.name || "Proyecto"}</h1>
            </div>
            <div className="inline-flex min-h-9 max-w-full items-center border border-border bg-card">
              <div role="status" aria-live="polite" className="flex min-h-9 items-center px-2">
                <Badge variant={globalStatus.variant}>
                  <StatusIcon className={`mr-1.5 h-3.5 w-3.5 ${repository.syncStatus === "syncing" ? "animate-spin" : ""}`} />
                  {globalStatus.label}
                </Badge>
              </div>
              {repository.lastSyncAt && (
                <span className="hidden whitespace-nowrap px-2.5 text-xs text-muted-foreground sm:inline">
                  {new Date(repository.lastSyncAt).toLocaleString("es-MX", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
              <span className="border-l border-border">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  title="Reintentar sincronización"
                  aria-label="Reintentar sincronización"
                  disabled={!repository.isOnline || repository.syncStatus === "syncing"}
                  onClick={() => void repository.retrySync()}
                >
                  <RefreshCw />
                </Button>
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex border border-border" role="group" aria-label="Vista de bitácora">
              <Button  variant={view === "grouped" ? "default" : "ghost"} aria-pressed={view === "grouped"} onClick={() => setView("grouped")}>
                <ChevronDown className="h-4 w-4" />Agrupado
              </Button>
              <span className="border-l border-border">
                <Button  variant={view === "calendar" ? "default" : "ghost"} aria-pressed={view === "calendar"} onClick={() => setView("calendar")}>
                  <CalendarIcon className="h-4 w-4" />Calendario
                </Button>
              </span>
            </div>
            {repository.canCreate && (
              <Button  variant="default" onClick={() => open("create")}><Plus className="h-4 w-4" />Agregar reporte</Button>
            )}
          </div>
        </div>
      </header>

      <main className="space-y-6 bg-card px-5 py-8 md:px-12">
        {view === "calendar" && (
          <BitacoraCalendarView
            proyectoId={proyectoId}
            logEntries={repository.entries}
            canCreate={repository.canCreate}
            onOpenModal={({ mode, logEntry, fecha }) => open(mode, logEntry, fecha)}
          />
        )}

        {view === "grouped" && Object.entries(grouped).map(([category, entries]) => {
          const visibleEntries = expandedCategories.has(category) ? entries : entries.slice(0, 6);
          return (
            <section key={category} className="overflow-hidden border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border px-5 py-5 md:px-6">
                <h2 className="text-xl text-foreground">{category}</h2>
                {repository.canCreate && (
                  <Button variant="outline" size="sm" onClick={() => open("create", undefined, undefined, category)}>
                    <Plus className="h-4 w-4" /><span className="sr-only">Agregar reporte a {category}</span>
                  </Button>
                )}
              </div>

              <div className="divide-y divide-border">
                {visibleEntries.map((entry) => {
                  const isExpanded = expanded.has(entry.client_id);
                  const badge = syncLabel(entry);
                  return (
                    <article key={entry.client_id}>
                      <div className="flex flex-col gap-4 px-5 py-4 transition-colors hover:bg-muted/30 md:flex-row md:items-start md:justify-between md:px-6">
                        <div className="min-w-0 flex-1 ">
                          <Button
                            type="button"
                            aria-expanded={isExpanded}
                            aria-label={`${isExpanded ? "Contraer" : "Expandir"} reporte del ${displayDate(entry.fecha)}`}
                            variant="entry"
                            size="entry"
                            onClick={() => toggleEntry(entry.client_id)}
                            className="items-start"
                          >
                            {isExpanded ? <ChevronDown className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" /> : <ChevronRight className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />}
                            <span className="min-w-0 font-normal">
                              <span className="block text-base text-foreground">{displayDate(entry.fecha)}</span>
                              <div className="flex items-center">

                                <span className="mt-1 block text-sm text-muted-foreground">{entry.departamento || "Partida sin nombre"}</span>
                                <div className="mt-2 flex flex-wrap items-center gap-2 pl-8">
                                  <Badge variant={entry.status && entry.status !== "Sin problemas" ? "warning" : "success"}>
                                    {entry.status || "Sin problemas"}
                                  </Badge>
                                  {entry.familias_tags.map((tag) => <Badge key={tag} variant="neutral">{tag}</Badge>)}
                                  <Badge variant={badge.variant}>{badge.text}</Badge>
                                </div>
                              </div>
                            </span>
                          </Button>

                          {entry.documentos.length > 0 && (
                            <div className="mt-3 flex flex-wrap items-center gap-2 pl-8">
                              {entry.documentos.slice(0, 2).map((file) => (
                                <DocumentPill key={file.client_id} file={file} online={repository.isOnline} onDownload={() => downloadAttachment(file)} />
                              ))}
                              {entry.documentos.length > 2 && <span className="text-xs text-muted-foreground">+{entry.documentos.length - 2} documentos</span>}
                            </div>
                          )}
                        </div>

                        <div className="flex shrink-0 items-center gap-3 pl-8 md:pl-0">
                          <div className="flex min-w-0 items-center gap-2">
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center bg-gray-200 text-xs text-foreground rounded-full">{entry.responsable.slice(0, 1).toUpperCase()}</div>
                            <span className="max-w-44 truncate text-sm text-muted-foreground">{entry.responsable}</span>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" aria-label={`Acciones del reporte del ${displayDate(entry.fecha)}`}><MoreHorizontal className="h-5 w-5 text-muted-foreground" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => open("view", entry)}><Eye className="mr-2 h-4 w-4" />Ver detalles</DropdownMenuItem>
                              {repository.canEdit && <DropdownMenuItem onClick={() => open("edit", entry)}><Pencil className="mr-2 h-4 w-4" />Editar</DropdownMenuItem>}
                              {repository.canEdit && <DropdownMenuItem variant="destructive" onClick={() => setDeleteEntry(entry)}><Trash2 className="mr-2 h-4 w-4" />Eliminar</DropdownMenuItem>}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="border-t border-border bg-background px-5 py-6 md:pl-16 md:pr-6">
                          <div className="flex flex-col items-start gap-6 lg:flex-row lg:justify-between lg:gap-8">
                            <div className="space-y-6 pt-2 text-left">
                              <div>
                                <h3 className="mb-2 text-sm  text-foreground">Retos / Incidencias</h3>
                                <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{entry.comentarios || "Sin incidencias reportadas."}</p>
                              </div>
                              <div>
                                <h3 className="mb-2 text-sm  text-foreground">Avance general</h3>
                                <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{entry.avance_dia}</p>
                              </div>
                            </div>

                            {entry.fotos.length > 0 && (
                              <div className="flex max-w-full shrink-0 gap-3 overflow-x-auto pb-2 lg:pt-2">
                                {entry.fotos.slice(0, 3).map((file) => (
                                  <PhotoPreview
                                    key={file.client_id}
                                    file={file}
                                    online={repository.isOnline}
                                    downloading={downloading.has(file.client_id)}
                                    onDownload={() => void downloadAttachment(file)}
                                    onOpen={() => openGallery(entry, file.client_id)}
                                  />
                                ))}
                                {entry.fotos.length > 3 && (
                                  <Button type="button" onClick={() => openGallery(entry)} variant="mediaMore" size="thumbnail">
                                    +{entry.fotos.length - 3} más
                                  </Button>
                                )}
                              </div>
                            )}
                          </div>

                          {entry.sync_state === "conflict" && (
                            <div className="mt-6 border border-destructive/30 bg-destructive/10 p-4">
                              <p className=" text-destructive dark:text-foreground">Conflicto de sincronización</p>
                              <p className="mt-1 text-sm text-destructive dark:text-foreground">{entry.sync_error} Tu versión local nunca se sobrescribirá automáticamente.</p>
                              {entry.server_version && (
                                <div className="mt-3 grid gap-3 text-sm md:grid-cols-2">
                                  <div className="border border-destructive/30 bg-card p-3">
                                    <p className="mb-1  text-foreground">Tu versión local</p><p>{entry.fecha} · {entry.responsable}</p>
                                    <p className="mt-1 whitespace-pre-wrap">{entry.locally_deleted ? "Eliminación pendiente" : entry.avance_dia}</p>
                                  </div>
                                  <div className="border border-destructive/30 bg-card p-3">
                                    <p className="mb-1  text-foreground">Versión del servidor</p><p>{entry.server_version.fecha} · {entry.server_version.responsable}</p>
                                    <p className="mt-1 whitespace-pre-wrap">{entry.server_deleted ? "Eliminado en el servidor" : entry.server_version.avance_dia}</p>
                                  </div>
                                </div>
                              )}
                              <div className="mt-3 flex flex-wrap gap-2">
                                <Button size="sm" variant="outline" onClick={() => void repository.acceptServer(entry.client_id)}>Aceptar servidor</Button>
                                <Button size="sm" variant="default" onClick={() => void repository.reapplyLocal(entry.client_id)}>{entry.locally_deleted ? "Confirmar eliminación" : "Reaplicar versión local"}</Button>
                                {entry.server_deleted && !entry.locally_deleted && <Button size="sm" variant="outline" onClick={() => void repository.restoreAsNew(entry.client_id)}>Restaurar como nuevo reporte</Button>}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>

              {entries.length > 6 && (
                <div className="flex justify-center border-t border-border py-3">
                  <Button variant="ghost" size="sm" onClick={() => toggleCategory(category)}>
                    <ChevronsUpDown className="h-4 w-4" />{expandedCategories.has(category) ? "Compactar" : `Expandir (${entries.length - 6} más)`}
                  </Button>
                </div>
              )}
            </section>
          );
        })}

        {view === "grouped" && repository.entries.length === 0 && (
          <div className="border border-dashed border-border bg-background p-12 text-center">
            <FileText className="mx-auto h-10 w-10 text-muted-foreground" />
            <h2 className="mt-4 ">No hay reportes</h2>
            <p className="mt-1 text-sm text-muted-foreground">Puedes crear el primero incluso sin conexión.</p>
          </div>
        )}
      </main>

      <BitacoraGalleryModal
        isOpen={gallery.isOpen}
        onClose={() => setGallery((current) => ({ ...current, isOpen: false }))}
        photos={gallery.photos}
        initialIndex={gallery.initialIndex}
        logDate={gallery.logDate}
        logResponsable={gallery.logResponsable}
        logTitle={gallery.logTitle}
        online={repository.isOnline}
        canWriteComments={repository.canCreate}
        onPhotoViewed={(photo) => repository.makeAttachmentAvailableOffline(photo.client_id)}
      />

      <AlertDialog open={Boolean(deleteEntry)} onOpenChange={(isOpen) => !isOpen && setDeleteEntry(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este reporte?</AlertDialogTitle>
            <AlertDialogDescription>Se ocultará de inmediato. Si ya existe en el servidor, la eliminación quedará pendiente y respetará su revisión actual.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button type="button" size="sm" variant="outline" onClick={() => setDeleteEntry(null)} disabled={deleting}>Cancelar</Button>
            <Button type="button" size="sm" variant="destructive" onClick={() => void confirmDelete()} disabled={deleting}>
              {deleting ? "Eliminando…" : "Eliminar"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
