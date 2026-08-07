import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useMutation, useQuery } from "convex/react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useProjectPlanNavigation } from "@/hooks/project-plan-navigation";
import {
  planDirectorySegments,
  planPathsMatch,
  planPathStartsWith,
} from "@/lib/plan-folder-navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Cloud,
  Download,
  FileImage,
  FileText,
  Focus,
  Folder,
  FolderOpen,
  FolderUp,
  Loader2,
  MessageSquare,
  MousePointer2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";
import type {
  AnnotationDraft,
  AnnotationTool,
  CommentMentionDraft,
  MentionableUser,
  PlanoAnnotation,
  PlanoComment,
  PlanoDetail,
  PlanoFolder,
  PlanoListItem,
} from "./planosTypes";
import FolderPlanUploadDialog from "./FolderPlanUploadDialog";
import { collectDroppedPlanFiles, type IncomingPlanFile } from "./folderPlanFiles";
import MentionCommentComposer from "./MentionCommentComposer";
import MentionNotificationCenter from "./MentionNotificationCenter";
import MentionText from "./MentionText";

const PlanCanvas = lazy(() => import("./PlanCanvas"));

const UI_COLORS = {
  pending: "#ADADAD",
  blue: "#76AFD9",
  green: "#50AC66",
  itemBg: "#FBFBFB",
  itemBorder: "#E6E6E6",
  borderStrong: "#DBDBDB",
  text: "#3D3D3A",
  textSoft: "#898982",
  muted: "#A3A39E",
  label: "#A5A5A0",
  danger: "#E75F79",
};
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const ACCEPTED_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const EMPTY_FOLDER_PATH: string[] = [];
const TOOL_OPTIONS: Array<{ id: AnnotationTool; label: string; icon: typeof MousePointer2 }> = [
  { id: "select", label: "Seleccionar", icon: MousePointer2 },
  { id: "cloud", label: "Nube", icon: Cloud },
  { id: "freehand", label: "Trazo libre", icon: Pencil },
];

function formatDateTime(timestamp: number) {
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileTitle(fileName: string) {
  return fileName.replace(/\.[^/.]+$/, "").replace(/[_-]+/g, " ").trim();
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length > 1) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function planStatusColor(status: string) {
  if (status === "Vigente") return UI_COLORS.green;
  if (status === "Borrador") return UI_COLORS.blue;
  return UI_COLORS.pending;
}

function annotationName(type: PlanoAnnotation["tipo"]) {
  return type === "freehand" ? "Trazo libre" : "Nube";
}

function CommentList({
  comments,
  currentUserId,
  isAdmin,
  onDelete,
}: {
  comments: PlanoComment[];
  currentUserId?: string;
  isAdmin: boolean;
  onDelete: (commentId: Id<"plano_comentarios">) => void;
}) {
  if (comments.length === 0) {
    return (
      <div className="border border-dashed p-6 text-center text-sm" style={{ borderColor: UI_COLORS.itemBorder, color: UI_COLORS.muted }}>
        Aún no hay comentarios.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {comments.map((comment) => (
        <div key={comment._id} className="border bg-white p-3" style={{ borderColor: UI_COLORS.itemBorder }}>
          <div className="flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border text-xs font-medium" style={{ borderColor: UI_COLORS.itemBorder, backgroundColor: UI_COLORS.itemBg, color: UI_COLORS.textSoft }}>
              {getInitials(comment.user_name)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-900">{comment.user_name}</p>
                  <p className="text-xs" style={{ color: UI_COLORS.muted }}>{formatDateTime(comment.created_at)}</p>
                </div>
                {(isAdmin || currentUserId === comment.user_id) && (
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" style={{ color: UI_COLORS.muted }} onClick={() => onDelete(comment._id)} aria-label="Eliminar comentario">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-gray-700"><MentionText comment={comment} /></p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

type PlanForm = {
  titulo: string;
  numero: string;
  disciplina: string;
  revision: string;
  status: string;
};

function PlanFormFields({
  form,
  setForm,
  includeArchived,
  prefix,
}: {
  form: PlanForm;
  setForm: React.Dispatch<React.SetStateAction<PlanForm>>;
  includeArchived?: boolean;
  prefix: string;
}) {
  return (
    <div className="grid gap-4 py-2 md:grid-cols-2">
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor={`${prefix}-title`}>Título</Label>
        <Input id={`${prefix}-title`} value={form.titulo} onChange={(event) => setForm((current) => ({ ...current, titulo: event.target.value }))} placeholder="Ej. Planta arquitectónica nivel 1" maxLength={160} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${prefix}-number`}>Número de plano</Label>
        <Input id={`${prefix}-number`} value={form.numero} onChange={(event) => setForm((current) => ({ ...current, numero: event.target.value }))} placeholder="A-101" maxLength={80} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${prefix}-discipline`}>Disciplina</Label>
        <Input id={`${prefix}-discipline`} value={form.disciplina} onChange={(event) => setForm((current) => ({ ...current, disciplina: event.target.value }))} placeholder="Arquitectura" maxLength={80} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${prefix}-revision`}>Revisión</Label>
        <Input id={`${prefix}-revision`} value={form.revision} onChange={(event) => setForm((current) => ({ ...current, revision: event.target.value }))} placeholder="01" maxLength={40} />
      </div>
      <div className="space-y-2">
        <Label>Estado</Label>
        <Select value={form.status} onValueChange={(value) => setForm((current) => ({ ...current, status: value }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="Vigente">Vigente</SelectItem>
            <SelectItem value="Borrador">Borrador</SelectItem>
            {includeArchived && <SelectItem value="Archivado">Archivado</SelectItem>}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

export default function PlanosPage() {
  const { proyectoId, planoId } = useParams<{ proyectoId: string; planoId?: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderDragDepthRef = useRef(0);
  const planNavigationProjectId = useProjectPlanNavigation((state) => state.projectId);
  const planNavigationFolderId = useProjectPlanNavigation((state) => state.folderId);
  const planNavigationPath = useProjectPlanNavigation((state) => state.path);
  const setPlanNavigationLocation = useProjectPlanNavigation((state) => state.setCurrentLocation);
  const currentUser = useQuery(api.users.getCurrentUser);
  const projectId = proyectoId as Id<"desarrollos"> | undefined;
  const selectedPlanId = planoId as Id<"planos"> | undefined;
  const project = useQuery(api.desarrollos.getById, projectId ? { id: projectId } : "skip");
  const plans = useQuery(api.planos.getByProject, projectId ? { proyecto: projectId } : "skip") as PlanoListItem[] | undefined;
  const planFolders = useQuery(api.planos.getFoldersByProject, projectId ? { proyecto: projectId } : "skip") as PlanoFolder[] | undefined;
  const planDetail = useQuery(api.planos.getDetail, selectedPlanId ? { plano_id: selectedPlanId } : "skip") as PlanoDetail | undefined;
  const mentionableUsers = useQuery(api.planos.getMentionableUsers, projectId ? { proyecto: projectId } : "skip") as MentionableUser[] | undefined;

  const generateUploadUrl = useMutation(api.planos.generateUploadUrl);
  const createPlan = useMutation(api.planos.create);
  const updatePlanMetadata = useMutation(api.planos.updateMetadata);
  const removePlan = useMutation(api.planos.remove);
  const createAnnotation = useMutation(api.planos.createAnnotation);
  const setAnnotationStatus = useMutation(api.planos.setAnnotationStatus);
  const removeAnnotation = useMutation(api.planos.removeAnnotation);
  const addComment = useMutation(api.planos.addComment);
  const removeComment = useMutation(api.planos.removeComment);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const currentFolderId = planNavigationProjectId === projectId
    ? planNavigationFolderId
    : undefined;
  const currentFolderPath = planNavigationProjectId === projectId
    ? planNavigationPath
    : EMPTY_FOLDER_PATH;
  const [libraryTab, setLibraryTab] = useState<"all" | "open" | "resolved">("all");
  const [folderUploadOpen, setFolderUploadOpen] = useState(false);
  const [folderUploadEntries, setFolderUploadEntries] = useState<IncomingPlanFile[]>([]);
  const [isDraggingFolder, setIsDraggingFolder] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadFile, setUploadFile] = useState<File>();
  const [uploadForm, setUploadForm] = useState<PlanForm>({ titulo: "", numero: "", disciplina: "", revision: "", status: "Vigente" });
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<PlanForm>({ titulo: "", numero: "", disciplina: "", revision: "", status: "Vigente" });
  const [tool, setTool] = useState<AnnotationTool>("select");
  const [zoom, setZoom] = useState(1);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState<number>();
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string>();
  const [detailTab, setDetailTab] = useState<"annotations" | "comments">("annotations");
  const [annotationDraft, setAnnotationDraft] = useState<AnnotationDraft>();
  const [annotationText, setAnnotationText] = useState("");
  const [annotationMentions, setAnnotationMentions] = useState<CommentMentionDraft[]>([]);
  const [annotationSubmitting, setAnnotationSubmitting] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [commentMentions, setCommentMentions] = useState<CommentMentionDraft[]>([]);
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const annotationSubmitLockRef = useRef(false);
  const commentSubmitLockRef = useRef(false);
  const [deleteTarget, setDeleteTarget] = useState<
    | { type: "plan"; id: Id<"planos">; name: string }
    | { type: "annotation"; id: Id<"plano_anotaciones"> }
  >();
  const [deleting, setDeleting] = useState(false);
  const linkedAnnotationId = searchParams.get("annotation");
  const linkedTab = searchParams.get("tab");
  const setCurrentPlanLocation = useCallback((folderId?: Id<"plano_carpetas">, path: string[] = []) => {
    if (projectId) setPlanNavigationLocation(projectId, folderId, path);
  }, [projectId, setPlanNavigationLocation]);

  const canWrite = Boolean(currentUser && currentUser.role !== "viewer");
  const canManagePlan = Boolean(planDetail && currentUser && (currentUser.role === "admin" || currentUser._id === planDetail.uploaded_by_id));
  const selectedAnnotation = planDetail?.annotations.find((annotation) => annotation._id === selectedAnnotationId);
  const selectedAnnotationComments = useMemo(
    () => planDetail?.comments.filter((comment) => comment.anotacion_id === selectedAnnotationId) || [],
    [planDetail?.comments, selectedAnnotationId],
  );
  const generalComments = useMemo(
    () => planDetail?.comments.filter((comment) => !comment.anotacion_id) || [],
    [planDetail?.comments],
  );
  const composerUsers = useMemo(
    () => (mentionableUsers || []).filter((user) => user._id !== currentUser?._id),
    [currentUser?._id, mentionableUsers],
  );

  useEffect(() => {
    setPage(1);
    setPageCount(undefined);
    setZoom(1);
    setTool("select");
    setSelectedAnnotationId(undefined);
    setDetailTab("annotations");
    setAnnotationDraft(undefined);
    setAnnotationText("");
    setAnnotationMentions([]);
    setCommentText("");
    setCommentMentions([]);
  }, [selectedPlanId]);

  useEffect(() => {
    if (!planDetail) return;
    if (linkedAnnotationId) {
      const annotation = planDetail.annotations.find((item) => item._id === linkedAnnotationId);
      if (annotation) {
        setSelectedAnnotationId(annotation._id);
        setPage(annotation.pagina);
        setDetailTab("annotations");
      } else {
        navigate(`/proyecto/${projectId}/planos/${selectedPlanId}`, { replace: true });
      }
    } else if (linkedTab === "comments") {
      setSelectedAnnotationId(undefined);
      setDetailTab("comments");
    }
  }, [linkedAnnotationId, linkedTab, navigate, planDetail, projectId, selectedPlanId]);

  useEffect(() => {
    if (pageCount !== undefined && page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  useEffect(() => {
    if (!planDetail || !editOpen) return;
    setEditForm({
      titulo: planDetail.titulo,
      numero: planDetail.numero || "",
      disciplina: planDetail.disciplina || "",
      revision: planDetail.revision || "",
      status: planDetail.status,
    });
  }, [editOpen, planDetail]);

  useEffect(() => {
    if (!selectedPlanId || !planDetail) return;
    setCurrentPlanLocation(planDetail.carpeta_id, planDirectorySegments(planDetail));
  }, [planDetail, selectedPlanId, setCurrentPlanLocation]);

  useEffect(() => {
    if (!currentFolderId || !planFolders) return;
    if (planFolders.some((folder) => folder._id === currentFolderId)) return;
    setCurrentPlanLocation();
  }, [currentFolderId, planFolders, setCurrentPlanLocation]);

  const stats = useMemo(() => {
    const allPlans = plans || [];
    return {
      total: allPlans.length,
      open: allPlans.reduce((sum, plan) => sum + plan.open_annotation_count, 0),
      resolved: allPlans.reduce((sum, plan) => sum + Math.max(0, plan.annotation_count - plan.open_annotation_count), 0),
    };
  }, [plans]);
  const folderById = useMemo(() => new Map((planFolders || []).map((folder) => [folder._id, folder])), [planFolders]);
  const currentFolder = currentFolderId ? folderById.get(currentFolderId) : undefined;
  const visibleFolders = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("es");
    if (!currentFolderId) {
      return (planFolders || [])
        .filter((folder) => !normalizedSearch || folder.nombre.toLocaleLowerCase("es").includes(normalizedSearch))
        .map((folder) => ({
          key: folder._id,
          name: folder.nombre,
          planCount: folder.plan_count,
          updatedAt: folder.updated_at || folder.created_at,
          onOpen: () => {
            setCurrentPlanLocation(folder._id);
            setSearch("");
          },
        }));
    }

    const childFolders = new Map<string, { planCount: number; updatedAt: number }>();
    for (const plan of plans || []) {
      if (plan.carpeta_id !== currentFolderId) continue;
      const directory = planDirectorySegments(plan);
      if (!planPathStartsWith(directory, currentFolderPath) || directory.length <= currentFolderPath.length) continue;
      const childName = directory[currentFolderPath.length];
      const current = childFolders.get(childName);
      childFolders.set(childName, {
        planCount: (current?.planCount || 0) + 1,
        updatedAt: Math.max(current?.updatedAt || 0, plan.updated_at || plan.created_at),
      });
    }

    return Array.from(childFolders, ([name, metadata]) => ({
      key: `${currentFolderId}/${[...currentFolderPath, name].join("/")}`,
      name,
      ...metadata,
      onOpen: () => {
        setCurrentPlanLocation(currentFolderId, [...currentFolderPath, name]);
        setSearch("");
      },
    }))
      .filter((folder) => !normalizedSearch || folder.name.toLocaleLowerCase("es").includes(normalizedSearch))
      .sort((left, right) => left.name.localeCompare(right.name, "es"));
  }, [currentFolderId, currentFolderPath, planFolders, plans, search, setCurrentPlanLocation]);
  const filteredPlans = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("es");
    return (plans || []).filter((plan) => {
      const folder = plan.carpeta_id ? folderById.get(plan.carpeta_id) : undefined;
      const matchesSearch = !normalizedSearch || [plan.titulo, plan.numero, plan.disciplina, plan.revision, plan.nombre_archivo, plan.ruta_relativa, folder?.nombre].some((value) => value?.toLocaleLowerCase("es").includes(normalizedSearch));
      const matchesStatus = statusFilter === "all" || plan.status === statusFilter;
      const matchesFolder = currentFolderId
        ? plan.carpeta_id === currentFolderId && planPathsMatch(planDirectorySegments(plan), currentFolderPath)
        : !plan.carpeta_id;
      const matchesTab = libraryTab === "all" || (libraryTab === "open" && plan.open_annotation_count > 0) || (libraryTab === "resolved" && plan.annotation_count > 0 && plan.open_annotation_count === 0);
      return matchesSearch && matchesStatus && matchesFolder && matchesTab;
    });
  }, [currentFolderId, currentFolderPath, folderById, libraryTab, plans, search, statusFilter]);
  const handlePageCountChange = useCallback((count: number) => setPageCount(Math.max(1, count)), []);

  const openUploadDialog = () => {
    setUploadFile(undefined);
    setUploadForm({ titulo: "", numero: "", disciplina: "", revision: "", status: "Vigente" });
    if (fileInputRef.current) fileInputRef.current.value = "";
    setUploadOpen(true);
  };
  const openFolderUploadDialog = () => {
    setFolderUploadEntries([]);
    setFolderUploadOpen(true);
  };
  const handleFolderDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    if (!canWrite || folderUploadOpen || uploadOpen || !Array.from(event.dataTransfer.types).includes("Files")) return;
    event.preventDefault();
    folderDragDepthRef.current += 1;
    setIsDraggingFolder(true);
  };
  const handleFolderDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (!canWrite || !Array.from(event.dataTransfer.types).includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };
  const handleFolderDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    if (!isDraggingFolder) return;
    event.preventDefault();
    folderDragDepthRef.current = Math.max(0, folderDragDepthRef.current - 1);
    if (folderDragDepthRef.current === 0) setIsDraggingFolder(false);
  };
  const handleFolderDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    if (!canWrite) return;
    event.preventDefault();
    folderDragDepthRef.current = 0;
    setIsDraggingFolder(false);
    try {
      const entries = await collectDroppedPlanFiles(event.dataTransfer);
      if (entries.length === 0) return toast.error("La carpeta no contiene archivos");
      setFolderUploadEntries(entries);
      setFolderUploadOpen(true);
    } catch {
      toast.error("No fue posible leer la carpeta seleccionada");
    }
  };

  const handleFileSelection = (file?: File) => {
    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type)) return toast.error("Usa un archivo PDF, JPG, PNG o WebP");
    if (currentFolderId && file.type !== "application/pdf") return toast.error("Las carpetas de planos solo admiten archivos PDF");
    if (file.size <= 0) return toast.error("El archivo está vacío");
    if (file.size > MAX_FILE_SIZE) return toast.error("El archivo no puede superar 50 MB");
    setUploadFile(file);
    setUploadForm((current) => ({ ...current, titulo: current.titulo || fileTitle(file.name) }));
  };
  const handleUpload = async () => {
    if (!projectId || !uploadFile || !uploadForm.titulo.trim()) return toast.error("Selecciona un archivo y escribe un título");
    setUploading(true);
    try {
      const uploadUrl = await generateUploadUrl({ proyecto: projectId });
      const response = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": uploadFile.type }, body: uploadFile });
      if (!response.ok) throw new Error("No fue posible subir el archivo");
      const { storageId } = (await response.json()) as { storageId: Id<"_storage"> };
      const newPlanId = await createPlan({
        proyecto: projectId,
        carpeta_id: currentFolderId,
        ruta_relativa: currentFolderId
          ? [...currentFolderPath, uploadFile.name].join("/")
          : undefined,
        storage_id: storageId,
        nombre_archivo: uploadFile.name,
        titulo: uploadForm.titulo,
        numero: uploadForm.numero || undefined,
        disciplina: uploadForm.disciplina || undefined,
        revision: uploadForm.revision || undefined,
        status: uploadForm.status,
        type: uploadFile.type,
        size: uploadFile.size,
      });
      setUploadOpen(false);
      toast.success("Plano cargado");
      navigate(`/proyecto/${projectId}/planos/${newPlanId}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No fue posible cargar el plano");
    } finally {
      setUploading(false);
    }
  };
  const handleEdit = async () => {
    if (!selectedPlanId || !editForm.titulo.trim()) return;
    setEditing(true);
    try {
      await updatePlanMetadata({ plano_id: selectedPlanId, titulo: editForm.titulo, numero: editForm.numero || undefined, disciplina: editForm.disciplina || undefined, revision: editForm.revision || undefined, status: editForm.status });
      setEditOpen(false);
      toast.success("Datos del plano actualizados");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No fue posible actualizar el plano");
    } finally {
      setEditing(false);
    }
  };
  const handleSelectAnnotation = (annotationId: string) => {
    const annotation = planDetail?.annotations.find((item) => item._id === annotationId);
    if (annotation) setPage(annotation.pagina);
    setSelectedAnnotationId(annotationId);
    setDetailTab("annotations");
    setTool("select");
    setCommentText("");
    setCommentMentions([]);
    if (selectedPlanId) navigate(`/proyecto/${projectId}/planos/${selectedPlanId}?annotation=${annotationId}`, { replace: true });
  };
  const handleSaveAnnotation = async () => {
    if (annotationSubmitLockRef.current || !selectedPlanId || !annotationDraft || !annotationText.trim()) return;
    annotationSubmitLockRef.current = true;
    setAnnotationSubmitting(true);
    try {
      const annotationId = await createAnnotation({ plano_id: selectedPlanId, ...annotationDraft, comentario: annotationText, mentions: annotationMentions });
      setAnnotationDraft(undefined);
      setAnnotationText("");
      setAnnotationMentions([]);
      setSelectedAnnotationId(annotationId);
      setTool("select");
      setDetailTab("annotations");
      navigate(`/proyecto/${projectId}/planos/${selectedPlanId}?annotation=${annotationId}`, { replace: true });
      toast.success("Anotación agregada");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No fue posible guardar la anotación");
    } finally {
      annotationSubmitLockRef.current = false;
      setAnnotationSubmitting(false);
    }
  };
  const handleToggleAnnotationStatus = async (annotation: PlanoAnnotation) => {
    try {
      await setAnnotationStatus({ anotacion_id: annotation._id, status: annotation.status === "Resuelta" ? "Abierta" : "Resuelta" });
      toast.success(annotation.status === "Resuelta" ? "Anotación reabierta" : "Anotación resuelta");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No fue posible cambiar el estado");
    }
  };
  const handleAddComment = async () => {
    if (commentSubmitLockRef.current || !selectedPlanId || !commentText.trim()) return;
    commentSubmitLockRef.current = true;
    setCommentSubmitting(true);
    try {
      await addComment({ plano_id: selectedPlanId, anotacion_id: detailTab === "annotations" && selectedAnnotation ? selectedAnnotation._id : undefined, comentario: commentText, mentions: commentMentions });
      setCommentText("");
      setCommentMentions([]);
      toast.success("Comentario agregado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No fue posible agregar el comentario");
    } finally {
      commentSubmitLockRef.current = false;
      setCommentSubmitting(false);
    }
  };
  const handleRemoveComment = async (commentId: Id<"plano_comentarios">) => {
    try {
      await removeComment({ comentario_id: commentId });
      toast.success("Comentario eliminado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No fue posible eliminar el comentario");
    }
  };
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (deleteTarget.type === "plan") {
        await removePlan({ plano_id: deleteTarget.id });
        navigate(`/proyecto/${projectId}/planos`);
        toast.success("Plano eliminado");
      } else {
        await removeAnnotation({ anotacion_id: deleteTarget.id });
        setSelectedAnnotationId(undefined);
        navigate(`/proyecto/${projectId}/planos/${selectedPlanId}`, { replace: true });
        toast.success("Anotación eliminada");
      }
      setDeleteTarget(undefined);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No fue posible eliminar el registro");
    } finally {
      setDeleting(false);
    }
  };

  if (!projectId || project === null) {
    return <div className="flex min-h-screen items-center justify-center bg-white text-sm text-gray-500">Proyecto no encontrado o sin acceso.</div>;
  }
  if (project === undefined || plans === undefined || planFolders === undefined || currentUser === undefined || (selectedPlanId && !planDetail)) {
    return <div className="flex min-h-screen items-center justify-center bg-white"><Loader2 className="h-8 w-8 animate-spin text-gray-400" /></div>;
  }

  const sharedDialogs = (
    <>
      <Dialog open={Boolean(annotationDraft)} onOpenChange={(open) => {
        if (!open && !annotationSubmitting) {
          setAnnotationDraft(undefined);
          setAnnotationText("");
          setAnnotationMentions([]);
        }
      }}>
        <DialogContent className="max-w-lg rounded-sm">
          <DialogHeader>
            <DialogTitle>Nueva anotación</DialogTitle>
            <DialogDescription>Describe la observación marcada en la página {annotationDraft?.pagina}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="annotation-comment">Observación</Label>
            <MentionCommentComposer
              id="annotation-comment"
              autoFocus
              value={annotationText}
              mentions={annotationMentions}
              mentionableUsers={composerUsers}
              submitting={annotationSubmitting}
              onChange={(value, mentions) => {
                setAnnotationText(value);
                setAnnotationMentions(mentions);
              }}
              onSubmit={handleSaveAnnotation}
              placeholder="Ej. Verificar dimensión de vano con @integrante antes de ejecutar"
              rows={5}
              maxLength={2000}
              hideSubmit
            />
            <p className="text-right text-xs" style={{ color: UI_COLORS.muted }}>{annotationText.length}/2000</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => {
              setAnnotationDraft(undefined);
              setAnnotationText("");
              setAnnotationMentions([]);
            }} disabled={annotationSubmitting}>Cancelar</Button>
            <Button type="button" onClick={handleSaveAnnotation} disabled={annotationSubmitting || !annotationText.trim()}>
              {annotationSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Guardar anotación
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl rounded-sm">
          <DialogHeader><DialogTitle>Editar datos del plano</DialogTitle><DialogDescription>Actualiza la identificación y el estado documental.</DialogDescription></DialogHeader>
          <PlanFormFields form={editForm} setForm={setEditForm} includeArchived prefix="edit-plan" />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditOpen(false)} disabled={editing}>Cancelar</Button>
            <Button type="button" onClick={handleEdit} disabled={editing || !editForm.titulo.trim()}>{editing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Guardar cambios</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(undefined)}>
        <AlertDialogContent className="max-w-md rounded-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{deleteTarget?.type === "plan" ? "Eliminar plano" : "Eliminar anotación"}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.type === "plan"
                ? `Se eliminará “${deleteTarget.name}”, todas sus anotaciones, comentarios y el archivo. Esta acción no se puede deshacer.`
                : "Se eliminará la anotación y toda su conversación. Esta acción no se puede deshacer."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} style={{ backgroundColor: UI_COLORS.danger }}>{deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  if (selectedPlanId && planDetail) {
    return (
      <div className="min-h-screen bg-white text-left">
        <div className="border-b border-gray-200 px-6 py-6 lg:px-16">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <button type="button" onClick={() => navigate(`/proyecto/${projectId}/planos`)} className="mb-3 inline-flex items-center gap-2 text-sm" style={{ color: UI_COLORS.textSoft }}>
                <ArrowLeft className="h-4 w-4" />Biblioteca de planos
              </button>
              <p className="text-sm text-gray-500">{project?.nombre} · Plano</p>
              <div className="mt-1 flex flex-wrap items-center gap-3">
                <h1 className="truncate text-3xl font-normal text-gray-900">{planDetail.titulo}</h1>
                <span className="inline-flex items-center gap-2 rounded-sm px-2.5 py-1 text-xs" style={{ backgroundColor: UI_COLORS.itemBg, color: UI_COLORS.textSoft }}>
                  <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: planStatusColor(planDetail.status) }} />{planDetail.status}
                </span>
              </div>
              <p className="mt-2 text-sm" style={{ color: UI_COLORS.muted }}>
                {[planDetail.numero && `No. ${planDetail.numero}`, planDetail.disciplina, planDetail.revision && `Rev. ${planDetail.revision}`, formatBytes(planDetail.size)].filter(Boolean).join(" · ")}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 self-start lg:self-auto">
              <MentionNotificationCenter projectId={projectId} compact />
              <Button type="button" variant="outline" className="h-11 gap-2 rounded-sm bg-white shadow-none" style={{ borderColor: UI_COLORS.borderStrong, color: UI_COLORS.textSoft }} asChild>
                <a href={planDetail.url || "#"} download={planDetail.nombre_archivo} target="_blank" rel="noreferrer"><Download className="h-4 w-4" />Descargar</a>
              </Button>
              {canManagePlan && (
                <>
                  <Button type="button" variant="outline" onClick={() => setEditOpen(true)} className="h-11 gap-2 rounded-sm bg-white shadow-none" style={{ borderColor: UI_COLORS.borderStrong, color: UI_COLORS.textSoft }}><Pencil className="h-4 w-4" />Editar datos</Button>
                  <Button type="button" variant="outline" onClick={() => setDeleteTarget({ type: "plan", id: planDetail._id, name: planDetail.titulo })} className="h-11 gap-2 rounded-sm bg-white shadow-none" style={{ borderColor: UI_COLORS.borderStrong, color: UI_COLORS.danger }}><Trash2 className="h-4 w-4" />Eliminar</Button>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="grid min-h-[calc(100vh-13rem)] xl:grid-cols-[minmax(0,1fr)_390px]">
          <section className="min-w-0 border-b xl:border-b-0 xl:border-r" style={{ borderColor: UI_COLORS.itemBorder }}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-white px-4 py-3" style={{ borderColor: UI_COLORS.itemBorder }}>
              <div className="flex flex-wrap items-center gap-1">
                {TOOL_OPTIONS.map((option) => {
                  const Icon = option.icon;
                  return (
                    <Button key={option.id} type="button" variant="ghost" size="sm" disabled={!canWrite && option.id !== "select"} onClick={() => setTool(option.id)} className={cn("h-9 gap-2 rounded-sm px-3 text-sm font-normal", tool === option.id && "font-medium")} style={{ backgroundColor: tool === option.id ? UI_COLORS.itemBg : "white", color: tool === option.id ? UI_COLORS.text : UI_COLORS.textSoft }} title={option.label}>
                      <Icon className="h-4 w-4" /><span className="hidden 2xl:inline">{option.label}</span>
                    </Button>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex h-9 items-center rounded-sm border bg-white" style={{ borderColor: UI_COLORS.itemBorder }}>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 rounded-sm" onClick={() => setZoom((value) => Math.max(0.5, value - 0.25))} disabled={zoom <= 0.5} aria-label="Alejar"><ZoomOut className="h-4 w-4" /></Button>
                  <button type="button" onClick={() => setZoom(1)} className="min-w-14 px-1 text-xs tabular-nums" style={{ color: UI_COLORS.textSoft }}>{Math.round(zoom * 100)}%</button>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 rounded-sm" onClick={() => setZoom((value) => Math.min(3, value + 0.25))} disabled={zoom >= 3} aria-label="Acercar"><ZoomIn className="h-4 w-4" /></Button>
                </div>
                <div className="flex h-9 items-center rounded-sm border bg-white" style={{ borderColor: UI_COLORS.itemBorder }}>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 rounded-sm" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1} aria-label="Página anterior"><ChevronLeft className="h-4 w-4" /></Button>
                  <span className="min-w-20 text-center text-xs tabular-nums" style={{ color: UI_COLORS.textSoft }}>{page} / {pageCount ?? "…"}</span>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 rounded-sm" onClick={() => setPage((value) => Math.min(pageCount ?? value + 1, value + 1))} disabled={pageCount === undefined || page >= pageCount} aria-label="Página siguiente"><ChevronRight className="h-4 w-4" /></Button>
                </div>
              </div>
            </div>
            <div className="h-[calc(100vh-17.5rem)] min-h-[36rem] overflow-auto p-4 lg:p-6" style={{ backgroundColor: UI_COLORS.itemBg }}>
              {planDetail.url ? (
                <Suspense fallback={<div className="flex min-h-[36rem] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" style={{ color: UI_COLORS.muted }} /></div>}>
                  <PlanCanvas
                    url={planDetail.url}
                    mimeType={planDetail.type}
                    page={page}
                    zoom={zoom}
                    tool={tool}
                    annotations={planDetail.annotations}
                    selectedAnnotationId={selectedAnnotationId}
                    readOnly={!canWrite}
                    onPageCountChange={handlePageCountChange}
                    onDraft={(draft) => {
                      setAnnotationDraft(draft);
                      setAnnotationText("");
                      setAnnotationMentions([]);
                    }}
                    onSelectAnnotation={handleSelectAnnotation}
                  />
                </Suspense>
              ) : <div className="flex h-full items-center justify-center text-sm" style={{ color: UI_COLORS.muted }}>El archivo no está disponible.</div>}
            </div>
          </section>

          <aside className="min-w-0 bg-white">
            <Tabs value={detailTab} onValueChange={(value) => {
              setDetailTab(value as "annotations" | "comments");
              setCommentText("");
              setCommentMentions([]);
              navigate(value === "comments" ? `/proyecto/${projectId}/planos/${selectedPlanId}?tab=comments` : `/proyecto/${projectId}/planos/${selectedPlanId}`, { replace: true });
            }} className="h-full">
              <TabsList className="grid h-14 w-full grid-cols-2 rounded-none border-b bg-white p-0" style={{ borderColor: UI_COLORS.itemBorder }}>
                <TabsTrigger value="annotations" className="h-14 gap-2 rounded-none border-b-2 border-transparent bg-white data-[state=active]:border-gray-900 data-[state=active]:bg-white data-[state=active]:shadow-none"><Focus className="h-4 w-4" />Anotaciones<span className="rounded-sm px-2 py-0.5 text-xs" style={{ backgroundColor: UI_COLORS.itemBg, color: UI_COLORS.textSoft }}>{planDetail.annotations.length}</span></TabsTrigger>
                <TabsTrigger value="comments" className="h-14 gap-2 rounded-none border-b-2 border-transparent bg-white data-[state=active]:border-gray-900 data-[state=active]:bg-white data-[state=active]:shadow-none"><MessageSquare className="h-4 w-4" />Comentarios<span className="rounded-sm px-2 py-0.5 text-xs" style={{ backgroundColor: UI_COLORS.itemBg, color: UI_COLORS.textSoft }}>{generalComments.length}</span></TabsTrigger>
              </TabsList>
              <TabsContent value="annotations" className="m-0">
                <div className="max-h-[calc(100vh-17.5rem)] min-h-[36rem] overflow-y-auto p-4">
                  {selectedAnnotation ? (
                    <div className="space-y-5">
                      <button type="button" onClick={() => {
                        setSelectedAnnotationId(undefined);
                        setCommentText("");
                        setCommentMentions([]);
                        navigate(`/proyecto/${projectId}/planos/${selectedPlanId}`, { replace: true });
                      }} className="inline-flex items-center gap-2 text-sm" style={{ color: UI_COLORS.textSoft }}><ArrowLeft className="h-4 w-4" />Todas las anotaciones</button>
                      <div className="border p-4" style={{ borderColor: UI_COLORS.itemBorder, backgroundColor: UI_COLORS.itemBg }}>
                        <div className="flex items-start justify-between gap-3">
                          <div><p className="text-sm font-medium text-gray-900">{annotationName(selectedAnnotation.tipo)}</p><p className="mt-1 text-xs" style={{ color: UI_COLORS.muted }}>Página {selectedAnnotation.pagina} · {selectedAnnotation.created_by_name}</p></div>
                          <span className="inline-flex items-center gap-2 rounded-sm bg-white px-2 py-1 text-xs" style={{ color: UI_COLORS.textSoft }}><span className="h-2 w-2 rounded-sm" style={{ backgroundColor: selectedAnnotation.status === "Resuelta" ? UI_COLORS.green : UI_COLORS.blue }} />{selectedAnnotation.status}</span>
                        </div>
                        <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-6 text-gray-700"><MentionText comment={selectedAnnotation} /></p>
                        {canWrite && (
                          <div className="mt-4 flex flex-wrap gap-2 border-t pt-3" style={{ borderColor: UI_COLORS.itemBorder }}>
                            <Button type="button" variant="outline" size="sm" onClick={() => handleToggleAnnotationStatus(selectedAnnotation)} className="gap-2 rounded-sm bg-white shadow-none" style={{ borderColor: UI_COLORS.itemBorder, color: UI_COLORS.textSoft }}>
                              {selectedAnnotation.status === "Resuelta" ? <Focus className="h-4 w-4" /> : <Check className="h-4 w-4" />}{selectedAnnotation.status === "Resuelta" ? "Reabrir" : "Resolver"}
                            </Button>
                            {(currentUser?.role === "admin" || currentUser?._id === selectedAnnotation.created_by_id) && (
                              <Button type="button" variant="ghost" size="sm" onClick={() => setDeleteTarget({ type: "annotation", id: selectedAnnotation._id })} className="gap-2 rounded-sm" style={{ color: UI_COLORS.danger }}><Trash2 className="h-4 w-4" />Eliminar</Button>
                            )}
                          </div>
                        )}
                      </div>
                      <div>
                        <h2 className="mb-3 text-sm font-medium text-gray-900">Conversación</h2>
                        {canWrite && <div className="mb-4"><MentionCommentComposer value={commentText} mentions={commentMentions} mentionableUsers={composerUsers} submitting={commentSubmitting} onChange={(value, mentions) => { setCommentText(value); setCommentMentions(mentions); }} onSubmit={handleAddComment} /></div>}
                        <CommentList comments={selectedAnnotationComments} currentUserId={currentUser?._id} isAdmin={currentUser?.role === "admin"} onDelete={handleRemoveComment} />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {planDetail.annotations.length === 0 ? (
                        <div className="border border-dashed p-8 text-center" style={{ borderColor: UI_COLORS.itemBorder }}><Cloud className="mx-auto h-7 w-7" style={{ color: UI_COLORS.muted }} /><p className="mt-3 text-sm font-medium text-gray-900">Sin anotaciones</p><p className="mt-1 text-sm" style={{ color: UI_COLORS.muted }}>Selecciona una herramienta y marca una observación directamente sobre el plano.</p></div>
                      ) : planDetail.annotations.map((annotation) => (
                        <button key={annotation._id} type="button" onClick={() => handleSelectAnnotation(annotation._id)} className="w-full border bg-white p-3 text-left transition hover:bg-[#FBFBFB]" style={{ borderColor: UI_COLORS.itemBorder }}>
                          <div className="flex items-start gap-3">
                            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border text-xs font-medium" style={{ borderColor: UI_COLORS.itemBorder, color: UI_COLORS.textSoft, backgroundColor: UI_COLORS.itemBg }}>P{annotation.pagina}</span>
                            <div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><p className="text-sm font-medium text-gray-900">{annotationName(annotation.tipo)}</p><span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: annotation.status === "Resuelta" ? UI_COLORS.green : UI_COLORS.blue }} title={annotation.status} /></div><p className="mt-1 line-clamp-2 text-sm leading-5 text-gray-600"><MentionText comment={annotation} /></p><p className="mt-2 text-xs" style={{ color: UI_COLORS.muted }}>{annotation.created_by_name} · {annotation.comment_count} comentario{annotation.comment_count === 1 ? "" : "s"}</p></div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </TabsContent>
              <TabsContent value="comments" className="m-0">
                <div className="max-h-[calc(100vh-17.5rem)] min-h-[36rem] overflow-y-auto p-4">
                  {canWrite && <div className="mb-5"><MentionCommentComposer value={commentText} mentions={commentMentions} mentionableUsers={composerUsers} submitting={commentSubmitting} onChange={(value, mentions) => { setCommentText(value); setCommentMentions(mentions); }} onSubmit={handleAddComment} /></div>}
                  <CommentList comments={generalComments} currentUserId={currentUser?._id} isAdmin={currentUser?.role === "admin"} onDelete={handleRemoveComment} />
                </div>
              </TabsContent>
            </Tabs>
          </aside>
        </div>
        {sharedDialogs}
      </div>
    );
  }

  const currentLocationName = currentFolderPath[currentFolderPath.length - 1]
    || currentFolder?.nombre
    || `Planos ${project?.nombre}`;
  const hasVisibleItems = visibleFolders.length > 0 || filteredPlans.length > 0;
  const hasActiveFilters = Boolean(search.trim()) || statusFilter !== "all" || libraryTab !== "all";

  return (
    <div className="relative min-h-screen bg-white text-left" onDragEnter={handleFolderDragEnter} onDragLeave={handleFolderDragLeave} onDragOver={handleFolderDragOver} onDrop={(event) => void handleFolderDrop(event)}>
      {isDraggingFolder && (
        <div className="pointer-events-none absolute inset-3 z-40 flex items-center justify-center border-2 border-dashed border-gray-900 bg-white/95">
          <div className="max-w-md px-6 text-center"><Upload className="mx-auto mb-4 h-12 w-12 text-gray-700" /><p className="text-xl text-gray-900">Suelta la carpeta de planos para agregarla</p><p className="mt-2 text-sm text-gray-500">Podrás revisar nombres, formatos, Disciplina y Estado antes de subir.</p></div>
        </div>
      )}
      <div className="border-b border-gray-200 px-6 py-8 lg:px-16">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            {currentFolder && (
              <div className="mb-2 flex min-w-0 items-center gap-2 overflow-x-auto pb-1 text-sm" style={{ color: UI_COLORS.textSoft }}>
                <button
                  type="button"
                  className="shrink-0 hover:text-gray-900"
                  onClick={() => {
                    setCurrentPlanLocation();
                    setSearch("");
                  }}
                >
                  Planos {project?.nombre}
                </button>
                {currentFolderPath.length > 0 && (
                  <>
                    <ChevronRight className="h-4 w-4 shrink-0" style={{ color: UI_COLORS.itemBorder }} />
                    <button
                      type="button"
                      className="max-w-48 shrink-0 truncate hover:text-gray-900"
                      onClick={() => {
                        setCurrentPlanLocation(currentFolderId);
                        setSearch("");
                      }}
                    >
                      {currentFolder.nombre}
                    </button>
                  </>
                )}
                {currentFolderPath.slice(0, -1).map((segment, index) => (
                  <span key={`${segment}-${index}`} className="flex min-w-0 items-center gap-2">
                    <ChevronRight className="h-4 w-4 shrink-0" style={{ color: UI_COLORS.itemBorder }} />
                    <button
                      type="button"
                      className="max-w-48 truncate hover:text-gray-900"
                      onClick={() => {
                        setCurrentPlanLocation(currentFolderId, currentFolderPath.slice(0, index + 1));
                        setSearch("");
                      }}
                    >
                      {segment}
                    </button>
                  </span>
                ))}
              </div>
            )}
            {!currentFolder && <p className="text-sm text-gray-500">Proyecto</p>}
            <h1 className="mt-1 break-words text-3xl font-normal text-gray-900">{currentLocationName}</h1>
            <p className="mt-2 text-sm" style={{ color: UI_COLORS.muted }}>
              {currentFolder
                ? "Explora los planos de esta ubicación y abre un archivo para revisarlo."
                : "Revisa documentos, marca observaciones y concentra la conversación técnica."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 self-start lg:self-auto">
            <MentionNotificationCenter projectId={projectId} />
            {canWrite && (
              <>
                <Button type="button" variant="outline" onClick={openUploadDialog} className="h-14 gap-3 rounded-sm bg-white px-6 text-base font-normal shadow-none" style={{ borderColor: UI_COLORS.borderStrong, color: UI_COLORS.textSoft }}><Plus className="h-5 w-5" />Cargar plano</Button>
                <Button type="button" onClick={openFolderUploadDialog} className="h-14 gap-3 rounded-sm px-6 text-base font-normal shadow-none"><FolderUp className="h-5 w-5" />Cargar carpeta</Button>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="space-y-8 px-6 py-8 lg:px-16">
        <div className="flex overflow-x-auto border-b" style={{ borderColor: UI_COLORS.itemBorder }}>
          {[
            { id: "all" as const, label: "Planos", value: stats.total },
            { id: "open" as const, label: "Observaciones abiertas", value: stats.open },
            { id: "resolved" as const, label: "Planos revisados", value: stats.resolved },
          ].map((item) => (
            <button key={item.id} type="button" onClick={() => setLibraryTab(item.id)} className={cn("flex min-w-max items-center gap-4 px-4 py-4 text-sm text-gray-600", libraryTab === item.id && "border-b-2 border-gray-900 text-gray-900")}><span>{item.label}</span><span className="flex h-7 min-w-7 items-center justify-center rounded-sm px-2 text-xs" style={{ backgroundColor: UI_COLORS.itemBg }}>{item.value}</span></button>
          ))}
        </div>
        <div className="grid gap-4 rounded-sm border bg-white p-4 lg:grid-cols-[minmax(280px,1fr)_240px]" style={{ borderColor: UI_COLORS.itemBorder }}>
          <div className="relative"><Search className="absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2" style={{ color: UI_COLORS.muted }} /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar en esta ubicación" className="h-9 rounded-sm bg-white pl-14 text-base font-normal shadow-none" style={{ borderColor: UI_COLORS.itemBorder }} /></div>
          <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="h-9 rounded-sm bg-white px-5 text-base shadow-none" style={{ borderColor: UI_COLORS.itemBorder }}><SelectValue placeholder="Estado" /></SelectTrigger><SelectContent><SelectItem value="all">Todos los estados</SelectItem><SelectItem value="Vigente">Vigentes</SelectItem><SelectItem value="Borrador">Borradores</SelectItem><SelectItem value="Archivado">Archivados</SelectItem></SelectContent></Select>
        </div>
        <div className="overflow-hidden rounded-sm border bg-white" style={{ borderColor: UI_COLORS.itemBorder }}>
          <div className="hidden grid-cols-[minmax(0,1.4fr)_0.8fr_0.7fr_0.8fr_38px] gap-4 border-b px-6 py-4 text-sm lg:grid" style={{ borderColor: UI_COLORS.itemBorder, color: UI_COLORS.label }}><span>Nombre</span><span>Revisión</span><span>Estado</span><span>Actividad</span><span /></div>
          {hasVisibleItems ? (
            <>
              {visibleFolders.map((folder) => (
                <button key={folder.key} type="button" onClick={folder.onOpen} className="grid w-full gap-4 border-b px-5 py-5 text-left transition hover:bg-[#FBFBFB] lg:grid-cols-[minmax(0,1.4fr)_0.8fr_0.7fr_0.8fr_38px] lg:items-center lg:px-6" style={{ borderColor: UI_COLORS.itemBorder }}>
                  <div className="flex min-w-0 items-center gap-4">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm border" style={{ borderColor: UI_COLORS.itemBorder, backgroundColor: UI_COLORS.itemBg, color: UI_COLORS.textSoft }}>
                      <Folder className="h-5 w-5 fill-current" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-gray-900">{folder.name}</span>
                      <span className="mt-1 block text-xs" style={{ color: UI_COLORS.muted }}>{folder.planCount} plano{folder.planCount === 1 ? "" : "s"}</span>
                    </span>
                  </div>
                  <div><span className="text-xs lg:hidden" style={{ color: UI_COLORS.label }}>Revisión</span><p className="mt-1 text-sm lg:mt-0" style={{ color: UI_COLORS.muted }}>—</p></div>
                  <div><span className="text-xs lg:hidden" style={{ color: UI_COLORS.label }}>Estado</span><p className="mt-1 text-sm lg:mt-0" style={{ color: UI_COLORS.textSoft }}>Carpeta</p></div>
                  <div><span className="text-xs lg:hidden" style={{ color: UI_COLORS.label }}>Actividad</span><p className="mt-1 text-sm lg:mt-0" style={{ color: UI_COLORS.textSoft }}>{formatDateTime(folder.updatedAt)}</p></div>
                  <ChevronRight className="hidden h-4 w-4 lg:block" style={{ color: UI_COLORS.muted }} />
                </button>
              ))}
              {filteredPlans.map((plan) => (
            <button key={plan._id} type="button" onClick={() => navigate(`/proyecto/${projectId}/planos/${plan._id}`)} className="grid w-full gap-4 border-b px-5 py-5 text-left transition last:border-b-0 hover:bg-[#FBFBFB] lg:grid-cols-[minmax(0,1.4fr)_0.8fr_0.7fr_0.8fr_38px] lg:items-center lg:px-6" style={{ borderColor: UI_COLORS.itemBorder }}>
              <div className="flex min-w-0 items-start gap-4"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm border" style={{ borderColor: UI_COLORS.itemBorder, backgroundColor: UI_COLORS.itemBg, color: UI_COLORS.textSoft }}>{plan.type === "application/pdf" ? <FileText className="h-5 w-5" /> : <FileImage className="h-5 w-5" />}</span><span className="min-w-0"><span className="block truncate text-sm font-medium text-gray-900">{plan.titulo}</span><span className="mt-1 block truncate text-xs" style={{ color: UI_COLORS.muted }}>{[plan.numero, plan.disciplina, formatBytes(plan.size)].filter(Boolean).join(" · ")}</span></span></div>
              <div className="min-w-0"><span className="text-xs lg:hidden" style={{ color: UI_COLORS.label }}>Revisión</span><p className="mt-1 truncate text-sm lg:mt-0" style={{ color: UI_COLORS.textSoft }}>{plan.revision || "Sin revisión"}</p></div>
              <div><span className="text-xs lg:hidden" style={{ color: UI_COLORS.label }}>Estado</span><span className="mt-1 flex items-center gap-2 text-sm lg:mt-0" style={{ color: UI_COLORS.textSoft }}><span className="h-2 w-2 rounded-sm" style={{ backgroundColor: planStatusColor(plan.status) }} />{plan.status}</span></div>
              <div><span className="text-xs lg:hidden" style={{ color: UI_COLORS.label }}>Actividad</span><p className="mt-1 text-sm lg:mt-0" style={{ color: UI_COLORS.textSoft }}>{plan.open_annotation_count > 0 ? `${plan.open_annotation_count} abierta${plan.open_annotation_count === 1 ? "" : "s"}` : `${plan.annotation_count} anotación${plan.annotation_count === 1 ? "" : "es"}`}</p><p className="mt-0.5 text-xs" style={{ color: UI_COLORS.muted }}>{plan.comment_count} comentario{plan.comment_count === 1 ? "" : "s"}</p></div>
              <ChevronRight className="hidden h-4 w-4 lg:block" style={{ color: UI_COLORS.muted }} />
            </button>
              ))}
            </>
          ) : (
            <div className="px-6 py-16 text-center"><FolderOpen className="mx-auto h-8 w-8" style={{ color: UI_COLORS.muted }} /><p className="mt-4 text-sm font-medium text-gray-900">{hasActiveFilters ? "No hay resultados" : plans.length === 0 && planFolders.length === 0 ? "Aún no hay planos" : "Esta ubicación está vacía"}</p><p className="mt-1 text-sm" style={{ color: UI_COLORS.muted }}>{hasActiveFilters ? "Ajusta la búsqueda o los filtros seleccionados." : plans.length === 0 && planFolders.length === 0 ? "Carga el primer plano para comenzar la revisión colaborativa." : "Regresa a la carpeta anterior o carga un plano en esta ubicación."}</p>{canWrite && plans.length === 0 && planFolders.length === 0 && <div className="mt-5 flex flex-wrap justify-center gap-2"><Button type="button" variant="outline" onClick={openUploadDialog} className="gap-2 rounded-sm bg-white shadow-none" style={{ borderColor: UI_COLORS.itemBorder, color: UI_COLORS.textSoft }}><Upload className="h-4 w-4" />Cargar plano</Button><Button type="button" onClick={openFolderUploadDialog} className="gap-2 rounded-sm shadow-none"><FolderUp className="h-4 w-4" />Cargar carpeta</Button></div>}</div>
          )}
        </div>
      </div>

      <FolderPlanUploadDialog open={folderUploadOpen} onOpenChange={setFolderUploadOpen} projectId={projectId} initialEntries={folderUploadEntries} />
      <Dialog open={uploadOpen} onOpenChange={(open) => !uploading && setUploadOpen(open)}>
        <DialogContent className="max-w-2xl rounded-sm">
          <DialogHeader><DialogTitle>Cargar plano</DialogTitle><DialogDescription>{currentFolderId ? `Se cargará en ${currentLocationName}. Las carpetas admiten archivos PDF de hasta 50 MB.` : "PDF, JPG, PNG o WebP de hasta 50 MB. Las anotaciones conservarán su posición en cada página."}</DialogDescription></DialogHeader>
          <div className="space-y-2">
            <Label>Archivo</Label>
            <button type="button" onClick={() => fileInputRef.current?.click()} className="flex min-h-28 w-full items-center justify-center gap-3 border border-dashed bg-white p-5 text-sm" style={{ borderColor: UI_COLORS.borderStrong, color: UI_COLORS.textSoft }}>
              {uploadFile ? <>{uploadFile.type === "application/pdf" ? <FileText className="h-6 w-6" /> : <FileImage className="h-6 w-6" />}<span className="min-w-0 text-left"><span className="block truncate font-medium text-gray-900">{uploadFile.name}</span><span className="block text-xs" style={{ color: UI_COLORS.muted }}>{formatBytes(uploadFile.size)} · Clic para reemplazar</span></span></> : <><Upload className="h-6 w-6" /><span>Seleccionar archivo</span></>}
            </button>
            <input ref={fileInputRef} type="file" accept={currentFolderId ? ".pdf,application/pdf" : ".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"} className="sr-only" onChange={(event) => handleFileSelection(event.target.files?.[0])} />
          </div>
          <PlanFormFields form={uploadForm} setForm={setUploadForm} prefix="plan" />
          <DialogFooter><Button type="button" variant="outline" onClick={() => setUploadOpen(false)} disabled={uploading}>Cancelar</Button><Button type="button" onClick={handleUpload} disabled={uploading || !uploadFile || !uploadForm.titulo.trim()}>{uploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Cargar plano</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
