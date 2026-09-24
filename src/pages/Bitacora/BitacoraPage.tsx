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
} from "lucide-react";
import { toast } from "sonner";
import BitacoraCalendarView from "@/components/Bitacora/BitacoraCalendarView";
import BitacoraGalleryModal from "@/components/Bitacora/BitacoraGalleryModal";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
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

function syncLabel(entry: BitacoraEntryView) {
  if (entry.sync_state === "conflict") return { text: "Conflicto", className: "border-red-200 bg-red-50 text-red-700" };
  if (entry.sync_state === "error") return { text: "Error", className: "border-red-200 bg-red-50 text-red-700" };
  if (entry.sync_state === "syncing") return { text: "Sincronizando", className: "border-blue-200 bg-blue-50 text-blue-700" };
  if (entry.sync_state === "pending") return { text: "Guardado localmente", className: "border-amber-200 bg-amber-50 text-amber-800" };
  return { text: "Sincronizado", className: "border-green-200 bg-green-50 text-green-700" };
}

function DocumentPill({ file, online, onDownload }: {
  file: BitacoraAttachmentView;
  online: boolean;
  onDownload: () => Promise<void>;
}) {
  const href = file.available_offline ? file.local_url : file.url;
  const canOpen = file.available_offline || online;
  return (
    <div className="inline-flex max-w-full items-center rounded-full border border-border bg-background text-xs">
      {canOpen && href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-w-0 items-center gap-1.5 px-3 py-1.5 hover:underline"
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
        <button
          type="button"
          title={online ? "Descargar para uso sin conexión" : "Descargar automáticamente al reconectar"}
          className="border-l border-border px-2 py-1.5 text-muted-foreground hover:text-foreground"
          onClick={(event) => {
            event.stopPropagation();
            void onDownload();
          }}
        >
          {file.download_requested ? <CloudDownload className="h-3.5 w-3.5 text-amber-700" /> : online ? <Download className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
        </button>
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
      <button
        type="button"
        onClick={onOpen}
        className="relative h-24 w-24 shrink-0 overflow-hidden rounded-md border-none bg-muted transition-opacity hover:opacity-85"
        title="Abrir en la galería"
      >
        <img src={source} alt={file.descripcion || file.nombre} className="h-full w-full object-cover rounded-md" />
        {!online && <span className="absolute bottom-1 right-1 rounded bg-black/65 px-1.5 py-0.5 text-[10px] text-white">Offline</span>}
      </button>
    );
  }

  return (
    <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-md border border-border-strong bg-neutral-200">
      {file.thumbnail_url ? (
        <img src={file.thumbnail_url} alt="Vista previa borrosa" className="h-full w-full scale-125 object-cover blur-md" />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-neutral-100 to-neutral-300">
          <ImageOff className="h-6 w-6 text-neutral-500" />
        </div>
      )}
      <div className="absolute inset-0 bg-black/25" />
      <button
        type="button"
        disabled={downloading}
        onClick={onDownload}
        title={online ? "Descargar original para uso sin conexión" : "Descargar automáticamente al reconectar"}
        className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/10 px-2 text-center text-[11px] font-medium text-white transition-colors hover:bg-black/30 disabled:cursor-not-allowed"
      >
        {downloading ? <Loader2 className="h-5 w-5 animate-spin" /> : file.download_requested ? <CloudDownload className="h-5 w-5" /> : online ? <Download className="h-5 w-5" /> : <WifiOff className="h-5 w-5" />}
        <span>{downloading ? "Descargando" : file.download_requested ? "En espera" : online ? "Descargar" : "Al reconectar"}</span>
      </button>
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
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 p-8 text-center">
        {repository.syncStatus === "error" ? <AlertCircle className="h-10 w-10 text-red-600" /> : <Loader2 className="h-10 w-10 animate-spin" />}
        <div>
          <h1 className="text-xl font-medium">Preparando Bitácora offline</h1>
          <p className="mt-1 text-sm text-muted-foreground">La primera preparación necesita una conexión y una sesión válida.</p>
        </div>
        {repository.syncError && <p className="max-w-xl text-sm text-red-700">{repository.syncError}</p>}
        <Button onClick={() => void repository.retrySync()} disabled={!repository.isOnline}>
          <RefreshCw className="mr-2 h-4 w-4" />Reintentar
        </Button>
      </div>
    );
  }

  const globalStatus = !repository.isOnline
    ? { icon: WifiOff, label: "Sin conexión", className: "bg-slate-100 text-slate-800" }
    : repository.syncStatus === "syncing"
      ? { icon: Loader2, label: "Sincronizando", className: "bg-blue-50 text-blue-700" }
      : repository.syncStatus === "error"
        ? { icon: AlertCircle, label: "Error", className: "bg-red-50 text-red-700" }
        : repository.conflictCount
          ? { icon: AlertCircle, label: `${repository.conflictCount} conflicto${repository.conflictCount === 1 ? "" : "s"}`, className: "bg-red-50 text-red-700" }
          : repository.pendingCount
            ? { icon: CloudOff, label: `${repository.pendingCount} pendiente${repository.pendingCount === 1 ? "" : "s"}`, className: "bg-amber-50 text-amber-800" }
            : { icon: CheckCircle2, label: "Sincronizado", className: "bg-green-50 text-green-700" };
  const StatusIcon = globalStatus.icon;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="px-5 py-12 md:px-10 lg:px-16">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="text-left">
              <p className="mb-1 text-sm text-muted-foreground">Proyecto</p>
              <h1 className="text-2xl font-medium text-foreground md:text-3xl">Bitácora {repository.project?.name}</h1>
            </div>
            <div className="inline-flex h-9 max-w-full items-center overflow-hidden rounded-md border border-border bg-card shadow-sm">
              <span className={`inline-flex h-full items-center gap-1.5 px-2.5 text-xs font-medium ${globalStatus.className}`}>
                <StatusIcon className={`h-3.5 w-3.5 ${repository.syncStatus === "syncing" ? "animate-spin" : ""}`} />
                {globalStatus.label}
              </span>
              {repository.lastSyncAt && (
                <span className="hidden whitespace-nowrap px-2.5 text-xs text-muted-foreground sm:inline">
                  {new Date(repository.lastSyncAt).toLocaleString("es-MX", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
              <button
                type="button"
                title="Reintentar sincronización"
                aria-label="Reintentar sincronización"
                disabled={!repository.isOnline || repository.syncStatus === "syncing"}
                onClick={() => void repository.retrySync()}
                className="flex h-full w-9 items-center justify-center border-l border-border hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex overflow-hidden border border-border-strong">
              <Button className="rounded-none" variant={view === "grouped" ? "default" : "ghost"} onClick={() => setView("grouped")}>
                <ChevronDown className="mr-2 h-4 w-4" />Agrupado
              </Button>
              <Button className="rounded-none border-l border-border" variant={view === "calendar" ? "default" : "ghost"} onClick={() => setView("calendar")}>
                <CalendarIcon className="mr-2 h-4 w-4" />Calendario
              </Button>
            </div>
            {repository.canCreate && (
              <Button variant={"outline"} onClick={() => open("create")}><Plus className="mr-2 h-4 w-4" />Agregar reporte</Button>
            )}
          </div>
        </div>
      </header>

      <main className="space-y-6 bg-white px-5 py-6 md:px-10 lg:px-16 lg:py-8">
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
            <section key={category} className="overflow-hidden rounded-lg border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border px-5 py-6 md:px-6">
                <h2 className="text-xl font-medium text-foreground">{category}</h2>
                {repository.canCreate && (
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => open("create", undefined, undefined, category)}>
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
                      <div
                        role="button"
                        tabIndex={0}
                        aria-expanded={isExpanded}
                        className="flex cursor-pointer flex-col gap-4 px-5 py-4 transition-colors hover:bg-muted/30 md:flex-row md:items-start md:justify-between md:pl-10 md:pr-6"
                        onClick={() => toggleEntry(entry.client_id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            toggleEntry(entry.client_id);
                          }
                        }}
                      >
                        <div className="flex min-w-0 items-start gap-3 md:gap-4">
                          {isExpanded ? <ChevronDown className="mt-0.5 h-5 w-5 shrink-0 text-disabled-foreground" /> : <ChevronRight className="mt-0.5 h-5 w-5 shrink-0 text-disabled-foreground" />}
                          <div className="min-w-0 textl-left">
                            <p className="text-base text-foreground text-left">{displayDate(entry.fecha)}</p>
                            <div className="mt-1.5 flex flex-wrap items-center gap-2">
                              <span className="mr-3 text-sm text-muted-foreground">{entry.departamento || "Partida sin nombre"}</span>
                              <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${entry.status === "Sin problemas" ? "border-green-200 bg-green-50 text-green-700" : "border-yellow-200 bg-yellow-50 text-yellow-800"}`}>
                                {entry.status || "Sin problemas"}
                              </span>
                              {entry.familias_tags.map((tag) => <span key={tag} className="rounded-full border border-border px-3 py-1 text-xs font-medium">{tag}</span>)}
                              <span className={`rounded-full border px-2.5 py-1 text-[11px] ${badge.className}`}>{badge.text}</span>
                              {entry.documentos.slice(0, 2).map((file) => (
                                <DocumentPill key={file.client_id} file={file} online={repository.isOnline} onDownload={() => downloadAttachment(file)} />
                              ))}
                              {entry.documentos.length > 2 && <span className="text-xs text-muted-foreground">+{entry.documentos.length - 2} documentos</span>}
                            </div>
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-3 pl-8 md:pl-0" onClick={(event) => event.stopPropagation()}>
                          <div className="flex min-w-0 items-center gap-2">
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-disabled text-xs text-foreground">{entry.responsable.slice(0, 1).toUpperCase()}</div>
                            <span className="max-w-44 truncate text-sm text-muted-foreground">{entry.responsable}</span>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Acciones del reporte"><MoreHorizontal className="h-5 w-5 text-disabled-foreground" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuItem onClick={() => open("view", entry)}><Eye className="mr-2 h-4 w-4" />Ver detalles</DropdownMenuItem>
                              {repository.canEdit && <DropdownMenuItem onClick={() => open("edit", entry)}><Pencil className="mr-2 h-4 w-4" />Editar</DropdownMenuItem>}
                              {repository.canEdit && <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={() => setDeleteEntry(entry)}><Trash2 className="mr-2 h-4 w-4" />Eliminar</DropdownMenuItem>}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="px-5 pb-6 md:pl-[6rem] md:pr-6">
                          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-8">
                            <div className="space-y-6 pt-2 text-left">
                              <div>
                                <h3 className="mb-2 text-sm">Retos / Incidencias:</h3>
                                <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{entry.comentarios || "Sin incidencias reportadas."}</p>
                              </div>
                              <div>
                                <h3 className="mb-2 text-sm">Avance General:</h3>
                                <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{entry.avance_dia}</p>
                              </div>
                            </div>

                            {entry.fotos.length > 0 && (
                              <div className="flex max-w-full gap-3 overflow-x-auto pb-2 lg:pt-2">
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
                                  <button type="button" onClick={() => openGallery(entry)} className="flex h-24 w-24 shrink-0 items-center justify-center rounded-md bg-inverse px-2 text-center text-sm font-medium text-on-color transition-opacity hover:opacity-85">
                                    +{entry.fotos.length - 3} más
                                  </button>
                                )}
                              </div>
                            )}
                          </div>

                          {entry.sync_state === "conflict" && (
                            <div className="mt-6 border border-red-200 bg-red-50 p-4">
                              <p className="font-medium text-red-800">Conflicto de sincronización</p>
                              <p className="mt-1 text-sm text-red-700">{entry.sync_error} Tu versión local nunca se sobrescribirá automáticamente.</p>
                              {entry.server_version && (
                                <div className="mt-3 grid gap-3 text-sm md:grid-cols-2">
                                  <div className="border border-red-200 bg-white/70 p-3">
                                    <p className="mb-1 font-medium text-red-900">Tu versión local</p><p>{entry.fecha} · {entry.responsable}</p>
                                    <p className="mt-1 whitespace-pre-wrap">{entry.locally_deleted ? "Eliminación pendiente" : entry.avance_dia}</p>
                                  </div>
                                  <div className="border border-red-200 bg-white/70 p-3">
                                    <p className="mb-1 font-medium text-red-900">Versión del servidor</p><p>{entry.server_version.fecha} · {entry.server_version.responsable}</p>
                                    <p className="mt-1 whitespace-pre-wrap">{entry.server_deleted ? "Eliminado en el servidor" : entry.server_version.avance_dia}</p>
                                  </div>
                                </div>
                              )}
                              <div className="mt-3 flex flex-wrap gap-2">
                                <Button size="sm" variant="outline" onClick={() => void repository.acceptServer(entry.client_id)}>Aceptar servidor</Button>
                                <Button size="sm" onClick={() => void repository.reapplyLocal(entry.client_id)}>{entry.locally_deleted ? "Confirmar eliminación" : "Reaplicar versión local"}</Button>
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
                  <Button variant="ghost" className="text-muted-foreground" onClick={() => toggleCategory(category)}>
                    <ChevronsUpDown className="mr-2 h-4 w-4" />{expandedCategories.has(category) ? "Compactar" : `Expandir (${entries.length - 6} más)`}
                  </Button>
                </div>
              )}
            </section>
          );
        })}

        {view === "grouped" && repository.entries.length === 0 && (
          <div className="rounded-lg border border-dashed border-border p-12 text-center">
            <FileText className="mx-auto h-10 w-10 text-muted-foreground" />
            <h2 className="mt-4 font-medium">No hay reportes</h2>
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
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(event) => { event.preventDefault(); void confirmDelete(); }} disabled={deleting}>
              {deleting ? "Eliminando…" : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
