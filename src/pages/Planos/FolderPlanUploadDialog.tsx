import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  Check,
  FileText,
  FolderOpen,
  Loader2,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { collectDroppedPlanFiles, type IncomingPlanFile } from "./folderPlanFiles";

const COLORS = {
  green: "#50AC66",
  itemBg: "hsl(var(--card))",
  itemBorder: "hsl(var(--border))",
  borderStrong: "hsl(var(--border))",
  textSoft: "hsl(var(--subtle-foreground))",
  muted: "hsl(var(--disabled-foreground))",
  danger: "#E75F79",
};
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_FOLDER_NAME_LENGTH = 160;
const MAX_FILE_NAME_LENGTH = 160;
const UPLOAD_CONCURRENCY = 3;

type UploadState = "ready" | "uploading" | "uploaded" | "error";
type PreparedPlanFile = IncomingPlanFile & {
  id: string;
  draftName: string;
  uploadError?: string;
  uploadState: UploadState;
};
type DiscardedPlanFile = IncomingPlanFile & { id: string; reason: string };

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function stripExtension(fileName: string) {
  return fileName.replace(/\.[^/.]+$/, "");
}

function normalizePath(path: string) {
  return path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

function inferSourceRoot(entries: IncomingPlanFile[]) {
  const firstSegments = entries.map((entry) => normalizePath(entry.relativePath).split("/"));
  const candidate = firstSegments[0]?.length > 1 ? firstSegments[0][0] : "";
  return candidate &&
    firstSegments.every((segments) => segments.length > 1 && segments[0] === candidate)
    ? candidate
    : "";
}

function buildRelativePath(sourcePath: string, sourceRoot: string, draftName: string) {
  const segments = normalizePath(sourcePath).split("/").filter(Boolean);
  if (sourceRoot && segments[0] === sourceRoot) segments.shift();
  segments.pop();
  segments.push(`${draftName.trim()}.pdf`);
  return segments.join("/");
}

function getDraftNameIssue(
  item: PreparedPlanFile,
  allItems: PreparedPlanFile[],
  sourceRoot: string,
) {
  const name = item.draftName.trim();
  if (!name) return "Escribe un nombre para el plano";
  if (name.length > MAX_FILE_NAME_LENGTH) {
    return `El nombre no puede exceder ${MAX_FILE_NAME_LENGTH} caracteres`;
  }
  if (/[\\/:*?"<>|]/.test(name)) return "El nombre contiene caracteres no permitidos";
  const targetPath = buildRelativePath(item.relativePath, sourceRoot, name).toLocaleLowerCase("es");
  if (targetPath.length > 500) return "La ruta y el nombre no pueden exceder 500 caracteres";
  const duplicateCount = allItems.filter(
    (candidate) =>
      buildRelativePath(candidate.relativePath, sourceRoot, candidate.draftName).toLocaleLowerCase("es") === targetPath,
  ).length;
  return duplicateCount > 1 ? "Hay otro PDF con la misma ruta y nombre" : undefined;
}

async function inspectPdfCompatibility(file: File) {
  if (!file.name.toLocaleLowerCase("es").endsWith(".pdf")) {
    return "Formato no compatible; solo se admiten archivos PDF";
  }
  if (file.size <= 0) return "El archivo está vacío";
  if (file.size > MAX_FILE_SIZE) return "El archivo supera el límite de 50 MB";
  try {
    const header = new TextDecoder("latin1").decode(await file.slice(0, 1024).arrayBuffer());
    if (!header.includes("%PDF-")) {
      return "La extensión es PDF, pero el contenido no es un PDF válido";
    }
  } catch {
    return "No fue posible leer el archivo";
  }
  return undefined;
}

async function prepareFiles(entries: IncomingPlanFile[]) {
  const normalizedEntries = entries.map((entry) => ({
    file: entry.file,
    relativePath: normalizePath(entry.relativePath) || entry.file.name,
  }));
  const inspected = await Promise.all(
    normalizedEntries.map(async (entry, index) => ({
      entry,
      id: `${index}:${entry.relativePath}:${entry.file.size}:${entry.file.lastModified}`,
      reason: await inspectPdfCompatibility(entry.file),
    })),
  );
  return inspected.reduce<{ accepted: PreparedPlanFile[]; discarded: DiscardedPlanFile[] }>(
    (result, inspectedFile) => {
      if (inspectedFile.reason) {
        result.discarded.push({
          ...inspectedFile.entry,
          id: inspectedFile.id,
          reason: inspectedFile.reason,
        });
      } else {
        result.accepted.push({
          ...inspectedFile.entry,
          id: inspectedFile.id,
          draftName: stripExtension(inspectedFile.entry.file.name),
          uploadState: "ready",
        });
      }
      return result;
    },
    { accepted: [], discarded: [] },
  );
}

function inputFilesToEntries(files: FileList | null) {
  return Array.from(files || []).map((file) => ({
    file,
    relativePath: file.webkitRelativePath || file.name,
  }));
}

export default function FolderPlanUploadDialog({
  initialEntries,
  onOpenChange,
  open,
  projectId,
}: {
  initialEntries: IncomingPlanFile[];
  onOpenChange: (open: boolean) => void;
  open: boolean;
  projectId: Id<"desarrollos">;
}) {
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<PreparedPlanFile[]>([]);
  const [discardedFiles, setDiscardedFiles] = useState<DiscardedPlanFile[]>([]);
  const [folderName, setFolderName] = useState("");
  const [sourceRoot, setSourceRoot] = useState("");
  const [discipline, setDiscipline] = useState("");
  const [status, setStatus] = useState("Vigente");
  const [selectedFileId, setSelectedFileId] = useState<string>();
  const [previewUrl, setPreviewUrl] = useState<string>();
  const [folderId, setFolderId] = useState<Id<"plano_carpetas">>();
  const [isPreparing, setIsPreparing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const generateUploadUrl = useMutation(api.planos.generateUploadUrl);
  const createPlan = useMutation(api.planos.create);
  const createFolder = useMutation(api.planos.createFolder);

  const reset = () => {
    setFiles([]);
    setDiscardedFiles([]);
    setFolderName("");
    setSourceRoot("");
    setDiscipline("");
    setStatus("Vigente");
    setSelectedFileId(undefined);
    setFolderId(undefined);
    setIsPreparing(false);
    setIsUploading(false);
    setIsDragging(false);
    if (folderInputRef.current) folderInputRef.current.value = "";
  };

  const loadEntries = async (entries: IncomingPlanFile[]) => {
    if (entries.length === 0) return;
    setIsPreparing(true);
    try {
      const nextSourceRoot = inferSourceRoot(entries);
      const { accepted, discarded } = await prepareFiles(entries);
      setFiles(accepted);
      setDiscardedFiles(discarded);
      setSourceRoot(nextSourceRoot);
      setFolderName(nextSourceRoot || "Planos");
      setSelectedFileId(accepted[0]?.id);
      setFolderId(undefined);
    } finally {
      setIsPreparing(false);
    }
  };

  useEffect(() => {
    if (open && initialEntries.length > 0) void loadEntries(initialEntries);
  }, [initialEntries, open]);

  const selectedFile = files.find((file) => file.id === selectedFileId);
  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(undefined);
      return;
    }
    const url = URL.createObjectURL(selectedFile.file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedFile]);

  const validationIssues = useMemo(
    () =>
      new Map(
        files.map((file) => [file.id, getDraftNameIssue(file, files, sourceRoot)]),
      ),
    [files, sourceRoot],
  );
  const validFiles = files.filter((file) => !validationIssues.get(file.id));
  const filesToCorrectCount = files.length - validFiles.length;
  const discardedCount = discardedFiles.length;
  const reviewedFileCount = files.length + discardedCount;
  const uploadedCount = files.filter((file) => file.uploadState === "uploaded").length;
  const pendingValidFiles = validFiles.filter((file) => file.uploadState !== "uploaded");
  const folderNameIssue = !folderName.trim()
    ? "Escribe el nombre de la carpeta"
    : folderName.trim().length > MAX_FOLDER_NAME_LENGTH
      ? `El nombre no puede exceder ${MAX_FOLDER_NAME_LENGTH} caracteres`
      : /[\\/:*?"<>|]/.test(folderName)
        ? "El nombre contiene caracteres no permitidos"
        : undefined;
  const settingsLocked = isUploading || Boolean(folderId) || uploadedCount > 0;
  const canUpload =
    !isUploading &&
    !isPreparing &&
    pendingValidFiles.length > 0 &&
    !folderNameIssue &&
    discipline.trim().length > 0;

  const handleClose = (nextOpen: boolean) => {
    if (isUploading) return;
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  };
  const handleFolderInput = async (event: ChangeEvent<HTMLInputElement>) => {
    try {
      await loadEntries(inputFilesToEntries(event.target.files));
    } catch {
      toast.error("No fue posible leer la carpeta seleccionada");
    }
  };
  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    try {
      await loadEntries(await collectDroppedPlanFiles(event.dataTransfer));
    } catch {
      toast.error("No fue posible leer la carpeta seleccionada");
    }
  };
  const updateFile = (id: string, patch: Partial<PreparedPlanFile>) => {
    setFiles((current) =>
      current.map((file) => (file.id === id ? { ...file, ...patch } : file)),
    );
  };
  const removeFile = (id: string) => {
    setFiles((current) => current.filter((file) => file.id !== id));
    if (selectedFileId === id) setSelectedFileId(files.find((file) => file.id !== id)?.id);
  };

  const uploadOne = async (
    file: PreparedPlanFile,
    targetFolderId: Id<"plano_carpetas">,
  ) => {
    updateFile(file.id, { uploadError: undefined, uploadState: "uploading" });
    try {
      const uploadUrl = await generateUploadUrl({ proyecto: projectId });
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": "application/pdf" },
        body: file.file,
      });
      if (!response.ok) throw new Error("No fue posible transferir el archivo");
      const { storageId } = (await response.json()) as { storageId: Id<"_storage"> };
      const cleanName = file.draftName.trim();
      await createPlan({
        proyecto: projectId,
        carpeta_id: targetFolderId,
        ruta_relativa: buildRelativePath(file.relativePath, sourceRoot, cleanName),
        storage_id: storageId,
        nombre_archivo: `${cleanName}.pdf`,
        titulo: cleanName,
        disciplina: discipline.trim(),
        status,
        type: "application/pdf",
        size: file.file.size,
      });
      updateFile(file.id, { uploadState: "uploaded" });
      return true;
    } catch (error) {
      updateFile(file.id, {
        uploadError: error instanceof Error ? error.message : "No fue posible cargar el plano",
        uploadState: "error",
      });
      return false;
    }
  };

  const handleUpload = async () => {
    if (!canUpload) return;
    setIsUploading(true);
    try {
      const targetFolderId =
        folderId || (await createFolder({ proyecto: projectId, nombre: folderName }));
      setFolderId(targetFolderId);
      const queue = [...pendingValidFiles];
      let cursor = 0;
      let succeeded = 0;
      const workers = Array.from(
        { length: Math.min(UPLOAD_CONCURRENCY, queue.length) },
        async () => {
          while (cursor < queue.length) {
            const currentIndex = cursor;
            cursor += 1;
            if (await uploadOne(queue[currentIndex], targetFolderId)) succeeded += 1;
          }
        },
      );
      await Promise.all(workers);
      if (succeeded === queue.length) {
        const skippedSummary = [
          discardedCount > 0
            ? `${discardedCount} archivo${discardedCount === 1 ? "" : "s"} descartado${discardedCount === 1 ? "" : "s"}.`
            : "",
          filesToCorrectCount > 0
            ? `${filesToCorrectCount} PDF${filesToCorrectCount === 1 ? "" : "s"} con errores no se subieron.`
            : "",
        ]
          .filter(Boolean)
          .join(" ");
        toast.success(
          `${uploadedCount + succeeded} plano${uploadedCount + succeeded === 1 ? "" : "s"} cargado${uploadedCount + succeeded === 1 ? "" : "s"}`,
          skippedSummary ? { description: skippedSummary } : undefined,
        );
        reset();
        onOpenChange(false);
      } else {
        toast.error("Algunos planos no pudieron cargarse", {
          description: "Los archivos completados no se repetirán. Puedes reintentar los pendientes.",
        });
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No fue posible crear la carpeta de planos",
      );
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="flex max-h-[92vh] max-w-6xl flex-col overflow-hidden rounded-sm">
        <DialogHeader>
          <DialogTitle>Cargar carpeta de planos</DialogTitle>
          <DialogDescription>
            Solo se cargarán archivos PDF. Los demás formatos se descartarán automáticamente y podrás revisarlos en la lista.
          </DialogDescription>
        </DialogHeader>

        {reviewedFileCount === 0 ? (
          <div
            className={cn(
              "my-2 flex min-h-96 flex-col items-center justify-center border-2 border-dashed bg-card px-6 text-center",
              isDragging && "border-foreground",
            )}
            style={{ borderColor: isDragging ? undefined : COLORS.borderStrong }}
            onDragEnter={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
            }}
            onDrop={(event) => void handleDrop(event)}
          >
            {isPreparing ? (
              <>
                <Loader2 className="mb-4 h-12 w-12 animate-spin text-foreground" />
                <p className="text-xl text-foreground">Revisando archivos</p>
                <p className="mt-2 text-sm text-subtle-foreground">Validando el contenido de cada PDF.</p>
              </>
            ) : (
              <>
                <FolderOpen className="mb-4 h-12 w-12 text-foreground" />
                <p className="text-xl text-foreground">Suelta aquí la carpeta de planos</p>
                <p className="mt-2 text-sm text-subtle-foreground">
                  También puedes seleccionarla desde tu equipo. Se mostrarán todos los archivos antes de subir.
                </p>
                <Button type="button" className="mt-6 rounded-sm" onClick={() => folderInputRef.current?.click()}>
                  Seleccionar carpeta <Upload className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 gap-5 overflow-hidden py-2 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]">
            <div className="flex min-h-0 flex-col gap-4">
              {files.length > 0 && (
                <div className="grid gap-4 rounded-sm border bg-card p-4 sm:grid-cols-2" style={{ borderColor: COLORS.itemBorder }}>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="plan-folder-name">Nombre de la carpeta</Label>
                    <Input
                      id="plan-folder-name"
                      value={folderName}
                      disabled={settingsLocked}
                      maxLength={MAX_FOLDER_NAME_LENGTH}
                      onChange={(event) => setFolderName(event.target.value)}
                      placeholder="Ej. Arquitectura"
                      className="rounded-sm shadow-none"
                      style={{ borderColor: folderNameIssue ? COLORS.danger : undefined }}
                    />
                    {folderNameIssue && <p className="text-xs" style={{ color: COLORS.danger }}>{folderNameIssue}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="plan-folder-discipline">Disciplina</Label>
                    <Input
                      id="plan-folder-discipline"
                      value={discipline}
                      disabled={settingsLocked}
                      maxLength={80}
                      onChange={(event) => setDiscipline(event.target.value)}
                      placeholder="Arquitectura"
                      className="rounded-sm shadow-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Estado</Label>
                    <Select value={status} disabled={settingsLocked} onValueChange={setStatus}>
                      <SelectTrigger className="rounded-sm shadow-none"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Vigente">Vigente</SelectItem>
                        <SelectItem value="Borrador">Borrador</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="rounded-sm border px-3 py-2" style={{ borderColor: COLORS.itemBorder, backgroundColor: COLORS.itemBg }}>
                    {reviewedFileCount} archivo{reviewedFileCount === 1 ? "" : "s"} revisado{reviewedFileCount === 1 ? "" : "s"}
                  </span>
                  <span className="rounded-sm border px-3 py-2" style={{ borderColor: COLORS.itemBorder, color: COLORS.textSoft }}>
                    {files.length} PDF{files.length === 1 ? "" : "s"} aceptado{files.length === 1 ? "" : "s"}
                  </span>
                  {discardedCount > 0 && <span className="rounded-sm border px-3 py-2" style={{ borderColor: COLORS.danger, color: COLORS.danger }}>{discardedCount} descartado{discardedCount === 1 ? "" : "s"}</span>}
                  {filesToCorrectCount > 0 && <span className="rounded-sm border px-3 py-2" style={{ borderColor: COLORS.danger, color: COLORS.danger }}>{filesToCorrectCount} por corregir</span>}
                </div>
                {!settingsLocked && <Button type="button" variant="outline" className="rounded-sm" onClick={() => folderInputRef.current?.click()}>Cambiar carpeta</Button>}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto rounded-sm border" style={{ borderColor: COLORS.itemBorder }}>
                {files.length > 0 ? (
                  <div className="border-b bg-card px-4 py-3 text-xs font-medium uppercase tracking-wide" style={{ borderColor: COLORS.itemBorder, color: COLORS.textSoft }}>
                    PDFs aceptados ({files.length})
                  </div>
                ) : (
                  <div className="border-b bg-card px-4 py-6 text-center" style={{ borderColor: COLORS.itemBorder }}>
                    <p className="text-sm font-medium text-foreground">No se encontraron PDFs compatibles</p>
                    <p className="mt-1 text-xs" style={{ color: COLORS.textSoft }}>Revisa los archivos descartados a continuación.</p>
                  </div>
                )}
                {files.map((file) => {
                  const issue = validationIssues.get(file.id);
                  const selected = file.id === selectedFileId;
                  return (
                    <div
                      key={file.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedFileId(file.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") setSelectedFileId(file.id);
                      }}
                      className="grid cursor-pointer gap-3 border-b p-4 last:border-b-0 sm:grid-cols-[40px_minmax(0,1fr)_36px]"
                      style={{ borderColor: COLORS.itemBorder, backgroundColor: selected ? COLORS.itemBg : "white" }}
                    >
                      <span className="flex h-10 w-10 items-center justify-center rounded-sm border" style={{ borderColor: issue ? COLORS.danger : COLORS.itemBorder, color: issue ? COLORS.danger : COLORS.textSoft }}>
                        {file.uploadState === "uploading" ? <Loader2 className="h-5 w-5 animate-spin" /> : file.uploadState === "uploaded" ? <Check className="h-5 w-5" style={{ color: COLORS.green }} /> : issue ? <AlertCircle className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center">
                          <Input
                            aria-label={`Nombre para ${file.file.name}`}
                            value={file.draftName}
                            disabled={file.uploadState === "uploading" || file.uploadState === "uploaded"}
                            maxLength={MAX_FILE_NAME_LENGTH}
                            onClick={(event) => event.stopPropagation()}
                            onChange={(event) => updateFile(file.id, {
                              draftName: event.target.value,
                              uploadError: undefined,
                              uploadState: file.uploadState === "error" ? "ready" : file.uploadState,
                            })}
                            className="h-9 rounded-r-none rounded-l-sm shadow-none"
                            style={{ borderColor: issue ? COLORS.danger : COLORS.borderStrong }}
                          />
                          <span className="flex h-9 items-center rounded-r-sm border border-l-0 bg-card px-3 text-sm" style={{ borderColor: issue ? COLORS.danger : COLORS.borderStrong, color: COLORS.textSoft }}>.pdf</span>
                        </div>
                        <p className="mt-1 truncate text-xs" style={{ color: COLORS.muted }}>
                          {folderName || "Carpeta"} / {buildRelativePath(file.relativePath, sourceRoot, file.draftName)} · {formatBytes(file.file.size)}
                        </p>
                        {(issue || file.uploadError) && <p className="mt-1 text-xs" style={{ color: COLORS.danger }}>{issue || file.uploadError}</p>}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={file.uploadState === "uploading" || file.uploadState === "uploaded"}
                        onClick={(event) => {
                          event.stopPropagation();
                          removeFile(file.id);
                        }}
                        aria-label={`Quitar ${file.file.name}`}
                      ><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  );
                })}
                {discardedCount > 0 && (
                  <>
                    <div className="border-b border-t bg-card px-4 py-3 text-xs font-medium uppercase tracking-wide" style={{ borderColor: COLORS.itemBorder, color: COLORS.danger }}>
                      Archivos descartados ({discardedCount})
                    </div>
                    {discardedFiles.map((file) => (
                      <div key={file.id} className="grid gap-3 border-b bg-card p-4 last:border-b-0 sm:grid-cols-[40px_minmax(0,1fr)]" style={{ borderColor: COLORS.itemBorder }}>
                        <span className="flex h-10 w-10 items-center justify-center rounded-sm border" style={{ borderColor: COLORS.danger, color: COLORS.danger }}><AlertCircle className="h-5 w-5" /></span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground" title={file.file.name}>{file.file.name}</p>
                          <p className="mt-1 truncate text-xs" style={{ color: COLORS.muted }} title={normalizePath(file.relativePath)}>{normalizePath(file.relativePath)} · {formatBytes(file.file.size)}</p>
                          <p className="mt-1 text-xs" style={{ color: COLORS.danger }}>{file.reason}</p>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>

            <div className="flex min-h-72 flex-col overflow-hidden rounded-sm border bg-card" style={{ borderColor: COLORS.itemBorder }}>
              <div className="border-b px-4 py-3" style={{ borderColor: COLORS.itemBorder }}>
                <p className="truncate text-sm font-medium text-foreground">{selectedFile?.file.name || "Vista previa"}</p>
                <p className="mt-1 text-xs" style={{ color: COLORS.muted }}>{selectedFile ? formatBytes(selectedFile.file.size) : "Selecciona un archivo"}</p>
              </div>
              <div className="flex min-h-0 flex-1 items-center justify-center bg-card">
                {previewUrl ? (
                  <iframe src={`${previewUrl}#toolbar=0&navpanes=0`} title={`Vista previa de ${selectedFile?.file.name || "plano"}`} className="h-full min-h-[420px] w-full" />
                ) : selectedFile ? (
                  <div className="px-6 text-center">
                    <AlertCircle className="mx-auto h-9 w-9" style={{ color: COLORS.danger }} />
                    <p className="mt-3 text-sm font-medium text-foreground">Sin vista previa</p>
                    <p className="mt-1 text-xs" style={{ color: COLORS.danger }}>{validationIssues.get(selectedFile.id)}</p>
                  </div>
                ) : <FileText className="h-10 w-10" style={{ color: COLORS.muted }} />}
              </div>
            </div>
          </div>
        )}

        <input
          ref={folderInputRef}
          type="file"
          multiple
          className="sr-only"
          onChange={(event) => void handleFolderInput(event)}
          {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
        />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleClose(false)} disabled={isUploading}>Cancelar</Button>
          {files.length > 0 && (
            <Button type="button" onClick={() => void handleUpload()} disabled={!canUpload}>
              {isUploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isUploading
                ? `Subiendo ${uploadedCount} de ${validFiles.length}`
                : `Subir ${pendingValidFiles.length} plano${pendingValidFiles.length === 1 ? "" : "s"}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
