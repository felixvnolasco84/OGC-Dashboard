import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  ImageOff,
  Loader2,
  Maximize2,
  Minimize2,
  Trash2,
  Upload,
  WifiOff,
  X,
} from "lucide-react";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { useBitacoraModal } from "../../hooks/use-bitacora-modal";
import { useBitacoraRepository } from "@/lib/bitacora-offline/context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface ManagedPhoto {
  id: string;
  type: "existing" | "new";
  name: string;
  url?: string;
  thumbnailUrl?: string;
  file?: File;
  description: string;
  availableOffline: boolean;
  downloadRequested?: boolean;
}

interface ManagedDocument {
  id: string;
  type: "existing" | "new";
  name: string;
  url?: string;
  file?: File;
  availableOffline: boolean;
  downloadRequested?: boolean;
}

const categoryDefaults = ["Estructura", "Instalaciones", "Acabados", "Seguridad", "Generales"];

function parseDate(value: string): Date | undefined {
  const [day, month, year] = value.split("/").map(Number);
  if (!day || !month || !year) return undefined;
  const result = new Date(year, month - 1, day);
  return Number.isNaN(result.getTime()) ? undefined : result;
}

function formatDate(value: Date) {
  return `${String(value.getDate()).padStart(2, "0")}/${String(value.getMonth() + 1).padStart(2, "0")}/${value.getFullYear()}`;
}

function today() {
  return formatDate(new Date());
}

function ExistingPhotoPreview({ photo, online, onDownload }: { photo: ManagedPhoto; online: boolean; onDownload: () => void }) {
  if (photo.url && (online || photo.availableOffline)) {
    return <img src={photo.url} alt={photo.description || photo.name} className="h-24 w-24 border border-border object-cover md:h-36 md:w-36" />;
  }
  return (
    <div className="relative h-24 w-24 overflow-hidden border border-border bg-muted md:h-36 md:w-36">
      {photo.thumbnailUrl ? <img src={photo.thumbnailUrl} alt="Vista previa borrosa" className="h-full w-full scale-110 object-cover blur-sm" /> : <div className="flex h-full items-center justify-center"><ImageOff className="h-5 w-5 text-muted-foreground" /></div>}
      <div className="absolute inset-0"><Button type="button" onClick={onDownload} variant="mediaDownload" size="overlayFill">
        {photo.downloadRequested || online ? <Download className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
        {photo.downloadRequested ? "En espera" : online ? "Descargar" : "Al reconectar"}
      </Button></div>
    </div>
  );
}

export default function BitacoraModal() {
  const modal = useBitacoraModal();
  const repository = useBitacoraRepository();
  const existing = useMemo(
    () => repository.entries.find((entry) => entry.client_id === modal.logEntry?.client_id || entry._id === modal.logEntry?._id),
    [modal.logEntry?._id, modal.logEntry?.client_id, repository.entries],
  );
  const levelOne = repository.partidas.filter((item) => item.nivel === 1);
  const levelTwo = repository.partidas.filter((item) => item.nivel === 2);
  const [categoria, setCategoria] = useState("");
  const [partidaId, setPartidaId] = useState("");
  const [familias, setFamilias] = useState<string[]>([]);
  const [responsable, setResponsable] = useState("");
  const [fecha, setFecha] = useState("");
  const [avance, setAvance] = useState("");
  const [comentarios, setComentarios] = useState("");
  const [status, setStatus] = useState("Sin problemas");
  const [photos, setPhotos] = useState<ManagedPhoto[]>([]);
  const [documents, setDocuments] = useState<ManagedDocument[]>([]);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const initializedFor = useRef<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const requestedPhotos = useRef(new Set<string>());

  useEffect(() => {
    const fullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", fullscreenChange);
    return () => document.removeEventListener("fullscreenchange", fullscreenChange);
  }, []);

  useEffect(() => {
    if (!modal.isOpen) {
      initializedFor.current = null;
      requestedPhotos.current.clear();
      setPhotos((current) => {
        current.filter((photo) => photo.type === "new" && photo.url).forEach((photo) => URL.revokeObjectURL(photo.url!));
        return current.length ? [] : current;
      });
      setDocuments([]);
      return;
    }
    const openingKey = `${modal.mode}:${existing?.client_id ?? modal.logEntry?._id ?? "new"}:${modal.fecha ?? ""}`;
    if (initializedFor.current === openingKey) return;
    initializedFor.current = openingKey;
    setCategoria(existing?.categoria ?? modal.logEntry?.categoria ?? modal.categoria ?? "");
    setPartidaId(existing?.partida_id ?? modal.logEntry?.partida_id ?? "");
    setFamilias(existing?.familias_tags ?? modal.logEntry?.familias_tags ?? []);
    setResponsable(existing?.responsable ?? modal.logEntry?.responsable ?? repository.profile?.name ?? "");
    setFecha(existing?.fecha ?? modal.logEntry?.fecha ?? modal.fecha ?? today());
    setAvance(existing?.avance_dia ?? modal.logEntry?.avance_dia ?? "");
    setComentarios(existing?.comentarios ?? modal.logEntry?.comentarios ?? "");
    setStatus(existing?.status ?? modal.logEntry?.status ?? "Sin problemas");
    setGalleryIndex(0);
    setCalendarOpen(false);
    setPhotos((existing?.fotos ?? []).map((photo) => ({
      id: photo.client_id,
      type: "existing",
      name: photo.nombre,
      url: photo.local_url || photo.url || undefined,
      thumbnailUrl: photo.thumbnail_url,
      description: photo.descripcion || photo.nombre || "",
      availableOffline: photo.available_offline,
      downloadRequested: photo.download_requested,
    })));
    setDocuments((existing?.documentos ?? []).map((item) => ({
      id: item.client_id,
      type: "existing",
      name: item.nombre,
      url: item.local_url || item.url || undefined,
      availableOffline: item.available_offline,
      downloadRequested: item.download_requested,
    })));
  }, [existing, modal.categoria, modal.fecha, modal.isOpen, modal.logEntry, modal.mode, repository.profile?.name]);

  useEffect(() => {
    if (!modal.isOpen || !existing) return;
    const latestPhotos = new Map(existing.fotos.map((photo) => [photo.client_id, photo]));
    const latestDocuments = new Map(existing.documentos.map((document) => [document.client_id, document]));
    setPhotos((current) => current.map((photo) => {
      if (photo.type === "new") return photo;
      const latest = latestPhotos.get(photo.id);
      return latest ? {
        ...photo,
        url: latest.local_url || latest.url || photo.url,
        thumbnailUrl: latest.thumbnail_url || photo.thumbnailUrl,
        availableOffline: latest.available_offline,
        downloadRequested: latest.download_requested,
      } : photo;
    }));
    setDocuments((current) => current.map((document) => {
      if (document.type === "new") return document;
      const latest = latestDocuments.get(document.id);
      return latest ? {
        ...document,
        url: latest.local_url || latest.url || document.url,
        availableOffline: latest.available_offline,
        downloadRequested: latest.download_requested,
      } : document;
    }));
  }, [existing, modal.isOpen]);

  const readOnly = modal.mode === "view" || (modal.mode === "edit" && !repository.canEdit);
  const categoryOptions = Array.from(new Set([...categoryDefaults, categoria].filter(Boolean)));
  const responsibleOptions = Array.from(new Set([
    ...repository.assignableUsers.map((user) => user.name),
    responsable,
  ].filter(Boolean)));
  const relatedFamilies = levelTwo.filter((item) => item.parentId === partidaId);
  const familyOptions = (relatedFamilies.length > 0 ? relatedFamilies : levelTwo)
    .map((item) => item.name)
    .filter((name, index, all) => all.indexOf(name) === index);
  const galleryPhotos = repository.isOnline ? photos : photos.filter((photo) => photo.type === "new" || photo.availableOffline);
  const currentPhoto = galleryPhotos[Math.min(galleryIndex, Math.max(galleryPhotos.length - 1, 0))];

  useEffect(() => {
    if (!modal.isOpen || modal.mode !== "view" || !repository.isOnline || !currentPhoto || currentPhoto.type !== "existing" || currentPhoto.availableOffline) return;
    if (requestedPhotos.current.has(currentPhoto.id)) return;
    requestedPhotos.current.add(currentPhoto.id);
    void repository.makeAttachmentAvailableOffline(currentPhoto.id).catch(() => undefined);
  }, [currentPhoto, modal.isOpen, modal.mode, repository]);

  const downloadAttachment = async (attachment: ManagedPhoto | ManagedDocument) => {
    if (attachment.type !== "existing" || attachment.downloadRequested) return;
    try {
      const result = await repository.makeAttachmentAvailableOffline(attachment.id);
      if (result === "queued") {
        if ("description" in attachment) setPhotos((items) => items.map((item) => item.id === attachment.id ? { ...item, downloadRequested: true } : item));
        else setDocuments((items) => items.map((item) => item.id === attachment.id ? { ...item, downloadRequested: true } : item));
        toast.success("La descarga se iniciará al recuperar la conexión.");
      } else {
        toast.success("Archivo disponible para uso sin conexión.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo descargar el archivo.");
    }
  };

  const addPhotos = (files: FileList | null) => {
    if (!files) return;
    const created = Array.from(files).map((file, index): ManagedPhoto => ({
      id: `new-photo-${Date.now()}-${index}`,
      type: "new",
      name: file.name,
      url: URL.createObjectURL(file),
      file,
      description: "",
      availableOffline: true,
    }));
    setPhotos((current) => [...current, ...created]);
    if (photoInputRef.current) photoInputRef.current.value = "";
  };

  const addDocuments = (files: FileList | null) => {
    if (!files) return;
    const created = Array.from(files).map((file, index): ManagedDocument => ({
      id: `new-document-${Date.now()}-${index}`,
      type: "new",
      name: file.name,
      file,
      availableOffline: true,
    }));
    setDocuments((current) => [...current, ...created]);
    if (documentInputRef.current) documentInputRef.current.value = "";
  };

  const removePhoto = (photo: ManagedPhoto) => {
    if (photo.type === "new" && photo.url) URL.revokeObjectURL(photo.url);
    setPhotos((current) => current.filter((item) => item.id !== photo.id));
    setGalleryIndex(0);
  };

  const removeDocument = (document: ManagedDocument) => {
    setDocuments((current) => current.filter((item) => item.id !== document.id));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (readOnly) return;
    if (!categoria || !partidaId || !responsable.trim() || !fecha || !avance.trim()) {
      toast.error("Completa categoría, partida, responsable, fecha y avance del día.");
      return;
    }
    if (photos.some((photo) => !photo.description.trim())) {
      toast.error("Agrega una descripción a todas las fotografías.");
      return;
    }
    setSubmitting(true);
    try {
      const newAttachments = [
        ...photos.filter((photo) => photo.type === "new" && photo.file).map((photo) => ({ file: photo.file!, kind: "photo" as const, description: photo.description })),
        ...documents.filter((document) => document.type === "new" && document.file).map((document) => ({ file: document.file!, kind: "document" as const })),
      ];
      const capacity = await repository.saveEntry({
        entryClientId: modal.mode === "edit" ? existing?.client_id : undefined,
        fields: {
          categoria,
          partidaId,
          familiasTags: familias,
          responsable: responsable.trim(),
          fecha,
          avanceDia: avance.trim(),
          comentarios: comentarios.trim() || undefined,
          status,
        },
        newAttachments,
        keptAttachmentClientIds: [
          ...photos.filter((photo) => photo.type === "existing").map((photo) => photo.id),
          ...documents.filter((document) => document.type === "existing").map((document) => document.id),
        ],
        attachmentUpdates: [
          ...photos.filter((photo) => photo.type === "existing").map((photo) => ({ clientId: photo.id, description: photo.description })),
          ...documents.filter((document) => document.type === "existing").map((document) => ({ clientId: document.id, name: document.name })),
        ],
      });
      modal.onClose();
      toast.success(repository.isOnline ? "Guardado localmente; se sincronizará enseguida." : "Guardado localmente sin conexión.");
      if (capacity.warning) toast.warning("El almacenamiento local superará el 70% de su cuota.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar el reporte.");
    } finally {
      setSubmitting(false);
    }
  };

  const close = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    modal.onClose();
  };

  const toggleFullscreen = async () => {
    if (!imageContainerRef.current) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await imageContainerRef.current.requestFullscreen();
    } catch {
      toast.error("El navegador no permitió abrir la imagen en pantalla completa.");
    }
  };

  const modalTitle = modal.mode === "create" ? "Nueva Entrada de Bitácora" : modal.mode === "edit" ? "Editar Entrada" : "Detalle de Entrada";

  return (
    <Dialog open={modal.isOpen} onOpenChange={(open) => !open && close()}>
      <DialogContent
        data-bitacora-surface="true"
        translate="no"
        variant="bitacora"
      >
        <header className="flex shrink-0 items-center justify-between border-b border-border px-5 py-5 md:px-9 md:py-8">
          <div>
            <DialogTitle variant="bitacora">{modalTitle}</DialogTitle>
            <DialogDescription variant="bitacora">{modal.mode === "view" ? "Visualización de registro" : "Registro diario de avance"}</DialogDescription>
          </div>
          <Button type="button" size="sm" variant="ghost" onClick={close} aria-label="Cerrar modal"><X /></Button>
        </header>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-5 text-left md:p-9">
            {!repository.isOnline && <div className="flex items-center gap-2 border border-border-strong bg-subtle px-3 py-2 text-xs text-muted-foreground"><WifiOff className="h-4 w-4" />Los cambios y archivos se guardarán en este dispositivo.</div>}

            <div className="space-y-2">
              <Label>Categoría <span className="text-destructive">*</span></Label>
              <Select value={categoria} onValueChange={setCategoria} disabled={readOnly}>
                <SelectTrigger><SelectValue placeholder="Selecciona una categoría" /></SelectTrigger>
                <SelectContent>{categoryOptions.map((category) => <SelectItem key={category} value={category}>{category}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Partida (Nivel 1) <span className="text-destructive">*</span></Label>
              {modal.mode === "view" ? <Input value={levelOne.find((item) => item.id === partidaId)?.name || existing?.departamento || "N/A"} disabled /> : (
                <Select value={partidaId} onValueChange={(value) => { setPartidaId(value); setFamilias([]); }} disabled={readOnly}>
                  <SelectTrigger id="bitacora-partida"><SelectValue placeholder="Selecciona una partida" /></SelectTrigger>
                  <SelectContent>{levelOne.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
                </Select>
              )}
            </div>

            {partidaId && (readOnly ? familias.length > 0 : familyOptions.length > 0) && (
              <div className="space-y-2">
                <Label>Familias (Tags)</Label>
                {readOnly ? <div className="flex flex-wrap gap-2">{familias.map((tag) => <Badge key={tag} variant="neutral">{tag}</Badge>)}</div> : (
                  <div className="max-h-40 space-y-2 overflow-y-auto border border-border-strong p-3">
                    {familyOptions.map((family) => <label key={family} className="flex cursor-pointer items-center gap-2 text-sm"><Checkbox checked={familias.includes(family)} onCheckedChange={() => setFamilias((current) => current.includes(family) ? current.filter((item) => item !== family) : [...current, family])} />{family}</label>)}
                  </div>
                )}
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Fecha <span className="text-destructive">*</span></Label>
                {modal.mode === "view" ? <Input value={fecha} disabled /> : (
                  <div className="grid">
                    <DropdownMenu modal={false} open={calendarOpen} onOpenChange={setCalendarOpen}>
                      <DropdownMenuTrigger asChild><Button type="button" size="sm" variant="outline"><CalendarIcon />{fecha || "Selecciona una fecha"}</Button></DropdownMenuTrigger>
                      <DropdownMenuContent variant="calendar" align="start"><Calendar mode="single" selected={parseDate(fecha)} onSelect={(value) => { if (value) { setFecha(formatDate(value)); setCalendarOpen(false); } }} locale={es} initialFocus /></DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label>Responsable <span className="text-destructive">*</span></Label>
                {repository.canEdit && modal.mode === "edit" && responsibleOptions.length > 0 ? (
                  <Select value={responsable} onValueChange={setResponsable}><SelectTrigger><SelectValue placeholder="Selecciona un responsable" /></SelectTrigger><SelectContent>{responsibleOptions.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}</SelectContent></Select>
                ) : <Input value={responsable} onChange={(event) => setResponsable(event.target.value)} disabled={modal.mode === "view" || modal.mode === "edit"} />}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Estado <span className="text-destructive">*</span></Label>
              <Select value={status} onValueChange={setStatus} disabled={readOnly}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Array.from(new Set(["Sin problemas", "Con retrasos", "Problemas críticos", status].filter(Boolean))).map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent></Select>
            </div>

            {(status !== "Sin problemas" || comentarios) && <div className="space-y-2"><Label>Retos / Incidencias</Label><Textarea value={comentarios} onChange={(event) => setComentarios(event.target.value)} disabled={readOnly} rows={3} variant="plain" placeholder="Describe los retos o incidencias del día…" /></div>}

            <div className="space-y-2">
              <Label>Avance del día <span className="text-destructive">*</span></Label>
              <Textarea id="bitacora-avance" value={avance} onChange={(event) => setAvance(event.target.value)} disabled={readOnly} rows={8} variant="code" placeholder={"TORRE I\nINSTALACIÓN DE ACCESORIOS 80%"} />
              <p className="text-xs text-muted-foreground">Describe el avance detallado del día. Puedes usar líneas separadas para cada actividad.</p>
            </div>

            <section className="space-y-3">
              <Label variant="section">Fotografías {photos.length > 0 && `(${photos.length})`}</Label>
              {modal.mode === "view" && galleryPhotos.length > 0 && currentPhoto && (
                <div className="space-y-3">
                  <div ref={imageContainerRef} className={`relative flex h-[min(42vh,24rem)] items-center justify-center overflow-hidden bg-muted ${isFullscreen ? "h-screen bg-overlay" : ""}`}>
                    {currentPhoto.url ? <img src={currentPhoto.url} alt={currentPhoto.description || currentPhoto.name} className="h-full w-full object-contain" /> : <ImageOff className="h-8 w-8 text-muted-foreground" />}
                    <span className="absolute right-3 top-3"><Button type="button" onClick={() => void toggleFullscreen()} variant="overlay" size="iconSm" aria-label={isFullscreen ? "Salir de pantalla completa" : "Ver en pantalla completa"}>{isFullscreen ? <Minimize2 /> : <Maximize2 />}</Button></span>
                    {galleryPhotos.length > 1 && <><span className="absolute left-3 top-1/2 -translate-y-1/2"><Button type="button" onClick={() => setGalleryIndex((value) => (value - 1 + galleryPhotos.length) % galleryPhotos.length)} variant="overlay" size="iconLg" aria-label="Foto anterior"><ChevronLeft /></Button></span><span className="absolute right-3 top-1/2 -translate-y-1/2"><Button type="button" onClick={() => setGalleryIndex((value) => (value + 1) % galleryPhotos.length)} variant="overlay" size="iconLg" aria-label="Foto siguiente"><ChevronRight /></Button></span></>}
                    <span className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-overlay/60 px-3 py-1 text-xs text-on-color">{galleryIndex + 1} / {galleryPhotos.length}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">{currentPhoto.description}</p>
                  {galleryPhotos.length > 1 && <div className="flex gap-2 overflow-x-auto overflow-y-hidden pb-2">{galleryPhotos.map((photo, index) => { const source = photo.url; return <Button key={photo.id} type="button" onClick={() => setGalleryIndex(index)} variant={index === galleryIndex ? "mediaSelectedLight" : "mediaUnselectedLight"} size="filmstripShort" aria-label={`Ver fotografía ${index + 1}`}>{source ? <img src={source} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center bg-muted"><ImageOff className="h-5 w-5" /></span>}</Button>; })}</div>}
                </div>
              )}
              {modal.mode === "view" && galleryPhotos.length === 0 && <p className="text-sm text-muted-foreground">{repository.isOnline ? "Sin fotografías disponibles." : "Sin fotografías disponibles en este dispositivo."}</p>}

              {!readOnly && (
                <div className="space-y-4">
                  <Button type="button" onClick={() => photoInputRef.current?.click()} variant="dropzone" size="dropzonePhoto"><Upload className="h-7 w-7 text-disabled-foreground" /><span className="block text-sm text-muted-foreground md:text-base">Haz clic para agregar fotos</span><span className="block text-xs text-muted-foreground md:text-sm">PNG, JPG, JPEG hasta 10MB</span></Button>
                  <input ref={photoInputRef} type="file" multiple accept="image/jpeg,image/png" className="hidden" onChange={(event) => addPhotos(event.target.files)} />
                  {photos.map((photo, index) => (
                    <div key={photo.id} className="border border-border p-4">
                      <div className="flex flex-col gap-4 sm:flex-row">
                        <div className="shrink-0">{photo.type === "new" && photo.url ? <img src={photo.url} alt="" className="h-24 w-24 border border-border object-cover md:h-36 md:w-36" /> : <ExistingPhotoPreview photo={photo} online={repository.isOnline} onDownload={() => void downloadAttachment(photo)} />}</div>
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex items-center justify-between gap-3"><Label>Descripción de foto {index + 1} <span className="text-destructive">*</span></Label><Button type="button" size="sm" variant="destructive" onClick={() => removePhoto(photo)} aria-label="Eliminar fotografía"><Trash2 /></Button></div>
                          <Textarea value={photo.description} onChange={(event) => setPhotos((current) => current.map((item) => item.id === photo.id ? { ...item, description: event.target.value } : item))} rows={4} variant={photo.description.trim() ? "description" : "descriptionError"} placeholder="Describe qué muestra esta fotografía…" />
                          {!photo.description.trim() && <p className="text-xs text-destructive">La descripción es requerida.</p>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="space-y-3">
              <Label variant="section">Documentos {documents.length > 0 && `(${documents.length})`}</Label>
              {modal.mode === "view" && documents.map((document) => {
                const canOpen = document.availableOffline || repository.isOnline;
                return <div key={document.id} className="flex items-center gap-2 border border-border p-3 text-sm"><FileText className="h-5 w-5 shrink-0 text-muted-foreground" />{canOpen && document.url ? <a href={document.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate hover:underline">{document.name}</a> : <span className="min-w-0 flex-1 truncate text-muted-foreground">{document.name}</span>}{!document.availableOffline && <Button type="button" size="sm" variant="ghost" onClick={() => void downloadAttachment(document)} aria-label="Guardar documento offline"><Download /></Button>}</div>;
              })}
              {modal.mode === "view" && documents.length === 0 && <p className="text-sm text-muted-foreground">Sin documentos.</p>}
              {!readOnly && (
                <div className="space-y-3">
                  <Button type="button" onClick={() => documentInputRef.current?.click()} variant="dropzone" size="dropzoneDocument"><FileText className="h-6 w-6 text-disabled-foreground" /><span className="block text-sm text-muted-foreground">Haz clic para agregar documentos</span><span className="block text-xs text-muted-foreground">PDF, DOC, DOCX, XLS, XLSX hasta 10MB</span></Button>
                  <input ref={documentInputRef} type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx" className="hidden" onChange={(event) => addDocuments(event.target.files)} />
                  {documents.map((document) => <div key={document.id} className="flex items-center gap-3 border border-border p-3"><FileText className="h-5 w-5 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1 truncate text-sm">{document.name}</span>{document.type === "new" && <Badge variant="success">Nuevo</Badge>}<Button type="button" size="sm" variant="destructive" onClick={() => removeDocument(document)} aria-label="Eliminar documento"><Trash2 /></Button></div>)}
                </div>
              )}
            </section>
          </div>

          <footer className="flex shrink-0 items-center justify-end gap-3 border-t border-border bg-background p-4 md:px-6">
            {modal.mode === "view" ? <Button type="button" size="sm" variant="default" onClick={close}>Cerrar</Button> : <><Button type="button" size="sm" variant="outline" onClick={close} disabled={submitting}>Cancelar</Button><Button type="submit" size="sm" variant="default" disabled={submitting}>{submitting && <Loader2 className="animate-spin" />}{modal.mode === "create" ? "Crear Entrada" : "Guardar Cambios"}</Button></>}
          </footer>
        </form>
      </DialogContent>
    </Dialog>
  );
}
