import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Edit3,
  ExternalLink,
  File,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderInput,
  FolderOpen,
  Loader2,
  Grid2X2,
  List,
  MoreVertical,
  Plus,
  Search,
  Trash2,
  Upload,
} from "lucide-react";

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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  DocumentFolderSidebar,
  MoveLocationDialog,
} from "@/components/documents/DocumentFolderNavigation";
import { useUploadProyectoDocumentsModal } from "@/hooks/upload-proyecto-documents-modal";

type FolderId = Id<"document_folders">;
type DocumentId = Id<"documentos">;

type FolderItem = {
  _id: FolderId;
  nombre: string;
  parent_folder_id?: FolderId;
  proyecto?: Id<"desarrollos">;
  created_at: number;
  updated_at?: number;
};

type DocumentItem = {
  _id: DocumentId;
  nombre: string;
  descripcion: string;
  type: string;
  size?: number;
  url?: string | null;
  folder_id?: FolderId;
  uploaded_at?: number;
  _creationTime: number;
  proyecto?: Id<"desarrollos">;
  transaccion_id?: Id<"transacciones">;
};

type TransaccionItem = {
  _id: Id<"transacciones">;
  banco?: string;
  factura?: string;
  codigo_referencia?: string;
};

type MenuTarget =
  | { kind: "document"; item: DocumentItem }
  | { kind: "folder"; item: FolderItem };

type ContextMenuState = {
  x: number;
  y: number;
  target: MenuTarget;
} | null;

const ROOT_VALUE = "root";
const PAGE_SIZE = 25;
const ORGANIZE_BATCH_SIZE = 100;

type OrganizeDocumentsResult = {
  createdFolders: number;
  isDone: boolean;
  movedDocuments: number;
  processedDocuments: number;
  continueCursor: string | null;
};

export default function ProyectoDocumentosPage() {
  const { proyectoId } = useParams<{ proyectoId: string }>();
  const projectId = proyectoId as Id<"desarrollos"> | undefined;
  const uploadModal = useUploadProyectoDocumentsModal();

  const [searchTerm, setSearchTerm] = useState("");
  const [currentFolderId, setCurrentFolderId] = useState<FolderId | undefined>();
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MenuTarget | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<MenuTarget | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [draftName, setDraftName] = useState("");
  const [folderDialogParentId, setFolderDialogParentId] = useState<FolderId | undefined>();
  const [targetFolderId, setTargetFolderId] = useState<string>(ROOT_VALUE);
  const [page, setPage] = useState(1);
  const [isOrganizing, setIsOrganizing] = useState(false);

  const proyecto = useQuery(api.desarrollos.getById, projectId ? { id: projectId } : "skip");
  const metadata = useQuery(
    api.documentos.getProjectFileManagerMetadata,
    projectId ? { proyecto: projectId } : "skip"
  );
  const documentosPage = useQuery(
    api.documentos.listFileManagerDocuments,
    projectId
      ? {
          folder_id: currentFolderId,
          proyecto: projectId,
          search: searchTerm,
          page,
          pageSize: PAGE_SIZE,
        }
      : "skip"
  );

  const createFolder = useMutation(api.documentos.createFolder);
  const renameFolder = useMutation(api.documentos.renameFolder);
  const renameDocument = useMutation(api.documentos.renameDocument);
  const moveFolder = useMutation(api.documentos.moveFolder);
  const moveDocument = useMutation(api.documentos.moveDocument);
  const deleteFolder = useMutation(api.documentos.deleteFolder);
  const deleteDocument = useMutation(api.documentos.deleteDocument);
  const organizeDocuments = useMutation(api.documentos.organizeDocumentsByProjectAndType);

  useEffect(() => {
    const closeMenu = () => setContextMenu(null);
    window.addEventListener("click", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
    };
  }, []);

  useEffect(() => {
    setPage(1);
  }, [currentFolderId, searchTerm, proyectoId]);

  useEffect(() => {
    if (documentosPage && page !== documentosPage.page) {
      setPage(documentosPage.page);
    }
  }, [documentosPage, page]);

  const folders = (metadata?.folders || []) as FolderItem[];
  const documentos = (documentosPage?.documents || []) as DocumentItem[];

  const folderById = useMemo(() => new Map(folders.map((folder) => [folder._id, folder])), [folders]);
  const currentFolder = currentFolderId ? folderById.get(currentFolderId) : undefined;

  const breadcrumbs = useMemo(() => {
    const items: FolderItem[] = [];
    let cursor = currentFolder;

    while (cursor) {
      items.unshift(cursor);
      cursor = cursor.parent_folder_id ? folderById.get(cursor.parent_folder_id) : undefined;
    }

    return items;
  }, [currentFolder, folderById]);

  const folderItemCount = useMemo(() => {
    const counts = new Map<string, number>();
    folders.forEach((folder) => {
      const key = folder.parent_folder_id || ROOT_VALUE;
      counts.set(key, (counts.get(key) || 0) + 1);
    });

    Object.entries((metadata?.documentCountsByFolder || {}) as Record<string, number>).forEach(([folderId, count]) => {
      counts.set(folderId, (counts.get(folderId) || 0) + count);
    });

    return counts;
  }, [folders, metadata?.documentCountsByFolder]);

  const folderOptions = useMemo(() => flattenFolders(folders), [folders]);
  const visibleFolders = useMemo(() => {
    return folders
      .filter((folder) => (folder.parent_folder_id || undefined) === currentFolderId)
      .filter((folder) => normalize(folder.nombre).includes(normalize(searchTerm)))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [currentFolderId, folders, searchTerm]);

  const transaccionesById = useMemo(() => {
    const transacciones = ((documentosPage?.transacciones || []) as TransaccionItem[]).filter(Boolean);
    return new Map(transacciones.map((tx) => [tx._id, tx]));
  }, [documentosPage?.transacciones]);

  const availableMoveFolders = useMemo(() => {
    if (selectedTarget?.kind !== "folder") return folderOptions;

    const blocked = new Set<string>([selectedTarget.item._id]);
    collectDescendants(folders, selectedTarget.item._id, blocked);
    return folderOptions.filter((option) => !blocked.has(option.id));
  }, [folderOptions, folders, selectedTarget]);

  const isLoading = !proyecto || !metadata || !documentosPage;
  const selectedTargetLabel = selectedTarget?.item.nombre || "";

  const handleUploadClick = () => {
    if (projectId) uploadModal.onOpen(projectId);
  };

  const openContextMenu = (event: React.MouseEvent, target: MenuTarget) => {
    event.preventDefault();
    setSelectedTarget(target);
    setContextMenu({ x: event.clientX, y: event.clientY, target });
  };

  const handleCreateFolder = async () => {
    try {
      await createFolder({
        nombre: draftName,
        parent_folder_id: folderDialogParentId ?? currentFolderId,
        proyecto: projectId,
      });
      setFolderDialogOpen(false);
      setDraftName("");
      setFolderDialogParentId(undefined);
      toast.success("Carpeta creada");
    } catch (error) {
      toast.error("No se pudo crear la carpeta", {
        description: getErrorMessage(error),
      });
    }
  };

  const handleCreateMoveFolder = async (name: string, parentFolderId?: FolderId) => {
    try {
      const folderId = await createFolder({
        nombre: name,
        parent_folder_id: parentFolderId,
        proyecto: projectId,
      });
      toast.success("Carpeta creada");
      return folderId;
    } catch (error) {
      toast.error("No se pudo crear la carpeta", {
        description: getErrorMessage(error),
      });
    }
  };

  const startRename = (target: MenuTarget) => {
    setSelectedTarget(target);
    setDraftName(target.item.nombre);
    setRenameDialogOpen(true);
  };

  const handleRename = async () => {
    if (!selectedTarget) return;

    try {
      if (selectedTarget.kind === "folder") {
        await renameFolder({ id: selectedTarget.item._id, nombre: draftName });
      } else {
        await renameDocument({ id: selectedTarget.item._id, nombre: draftName });
      }

      setRenameDialogOpen(false);
      setDraftName("");
      toast.success("Nombre actualizado");
    } catch (error) {
      toast.error("No se pudo renombrar", {
        description: getErrorMessage(error),
      });
    }
  };

  const startMove = (target: MenuTarget) => {
    setSelectedTarget(target);
    const folderId = target.kind === "document" ? target.item.folder_id : target.item.parent_folder_id;
    setTargetFolderId(folderId || ROOT_VALUE);
    setMoveDialogOpen(true);
  };

  const handleMove = async () => {
    if (!selectedTarget) return;

    const folderId = targetFolderId === ROOT_VALUE ? undefined : (targetFolderId as FolderId);

    try {
      if (selectedTarget.kind === "folder") {
        await moveFolder({ id: selectedTarget.item._id, parent_folder_id: folderId });
      } else {
        await moveDocument({ id: selectedTarget.item._id, folder_id: folderId });
      }

      setMoveDialogOpen(false);
      toast.success("Ubicación actualizada");
    } catch (error) {
      toast.error("No se pudo mover", {
        description: getErrorMessage(error),
      });
    }
  };

  const requestDelete = (target: MenuTarget) => {
    setSelectedTarget(target);
    setDeleteTarget(target);
    setContextMenu(null);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    try {
      if (deleteTarget.kind === "folder") {
        await deleteFolder({ id: deleteTarget.item._id });
        if (currentFolderId === deleteTarget.item._id) setCurrentFolderId(undefined);
        toast.success("Carpeta eliminada");
      } else {
        await deleteDocument({ id: deleteTarget.item._id });
        toast.success("Documento eliminado");
      }

      setDeleteTarget(null);
    } catch (error) {
      toast.error("No se pudo eliminar", {
        description:
          deleteTarget.kind === "folder"
            ? "La carpeta debe estar vacía antes de eliminarse."
            : getErrorMessage(error),
      });
    }
  };

  const handleOrganizeDocuments = async () => {
    setIsOrganizing(true);

    try {
      let cursor: string | null = null;
      let createdFolders = 0;
      let movedDocuments = 0;
      let processedDocuments = 0;
      let isDone = false;

      while (!isDone) {
        const result: OrganizeDocumentsResult = await organizeDocuments({
          paginationOpts: {
            cursor,
            numItems: ORGANIZE_BATCH_SIZE,
          },
        });

        createdFolders += result.createdFolders;
        movedDocuments += result.movedDocuments;
        processedDocuments += result.processedDocuments;
        cursor = result.continueCursor;
        isDone = result.isDone;
      }

      setCurrentFolderId(undefined);
      toast.success("Documentos organizados", {
        description: `${movedDocuments} de ${processedDocuments} archivo(s) movido(s) y ${createdFolders} carpeta(s) creada(s).`,
      });
    } catch (error) {
      toast.error("No se pudieron organizar los documentos", {
        description: getErrorMessage(error),
      });
    } finally {
      setIsOrganizing(false);
    }
  };

  const handleDownload = async (fileUrl: string, fileName: string) => {
    try {
      toast.loading("Descargando documento...", { id: "download" });

      const response = await fetch(fileUrl);
      if (!response.ok) throw new Error("Error al descargar");

      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);

      toast.success("Documento descargado", { id: "download" });
    } catch (error) {
      console.error("Error downloading file:", error);
      toast.error("Error al descargar el documento", { id: "download" });
    }
  };

  if (!proyecto) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <p className="text-gray-500">Cargando...</p>
      </div>
    );
  }

  return (
    <TooltipProvider>
    <div className="min-h-screen bg-white text-left">
      <div className="border-b border-gray-200 px-12 py-8">
        <div className="flex flex-col gap-6">
          <div className="flex items-end justify-between gap-6">
            <div>
              <p className="mb-1 text-sm text-gray-500">Documentos del proyecto</p>
              <h1 className="text-2xl text-gray-900">{proyecto.nombre}</h1>
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="lg"
                className="rounded-none py-6 text-gray-500"
                onClick={handleOrganizeDocuments}
                disabled={isOrganizing}
              >
                Organizar
                {isOrganizing ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <FolderInput className="h-5 w-5" />
                )}
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="rounded-none py-6 text-gray-500"
                onClick={() => {
                  setDraftName("");
                  setFolderDialogParentId(undefined);
                  setFolderDialogOpen(true);
                }}
              >
                Nueva carpeta
                <Plus className="h-5 w-5" />
              </Button>
              <Button size="lg" className="rounded-none py-6" onClick={handleUploadClick}>
                Subir documentos
                <Upload className="h-5 w-5" />
              </Button>
              <Badge variant="outline" className="rounded-none px-4 py-3 bg-gray-100">
                Total: {documentosPage?.total || 0}
              </Badge>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto]">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <Input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Buscar por nombre, tipo o descripción"
                className="h-12 rounded-none border-gray-300 pl-12"
              />
            </div>

            <div className="flex h-12 border border-gray-300">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={cn("h-full rounded-none", viewMode === "list" && "bg-gray-100")}
                    onClick={() => setViewMode("list")}
                  >
                    <List className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Vista de lista</TooltipContent>
              </Tooltip>
              <Separator orientation="vertical" />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={cn("h-full rounded-none", viewMode === "grid" && "bg-gray-100")}
                    onClick={() => setViewMode("grid")}
                  >
                    <Grid2X2 className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Vista de mosaico</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>
      </div>

      <div className="flex min-h-[calc(100vh-225px)]">
        <DocumentFolderSidebar
          activeFolderId={currentFolderId}
          folderOptions={folderOptions
            .filter((f) => f.level > 0)
            .map((f) => ({ ...f, level: f.level - 1 }))}
          folderItemCount={folderItemCount}
          foldersCount={folders.length}
          hideRoot
          onFolderSelect={setCurrentFolderId}
          onFolderContextMenu={(event, id) => {
            const item = folderById.get(id);
            if (item) openContextMenu(event, { kind: "folder", item });
          }}
          visibleLimit={20}
        />

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 xl:px-10">
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="mb-2 flex items-center gap-2 text-sm text-gray-500">
                {breadcrumbs.map((folder, index) => (
                  <span key={folder._id} className="flex min-w-0 items-center gap-2">
                    {index > 0 && <ChevronRight className="h-4 w-4 text-gray-300" />}
                    <button
                      className="truncate hover:text-gray-900"
                      onClick={() => setCurrentFolderId(folder._id)}
                    >
                      {folder.nombre}
                    </button>
                  </span>
                ))}
              </div>
              <h2 className="text-3xl font-normal text-gray-900">
                {currentFolder?.nombre || "Biblioteca del proyecto"}
              </h2>
            </div>
          </div>

          {isLoading ? (
            <div className="flex min-h-[360px] items-center justify-center text-gray-500">
              Cargando documentos...
            </div>
          ) : visibleFolders.length === 0 && documentos.length === 0 ? (
            <div className="flex min-h-[360px] flex-col items-center justify-center border border-dashed border-gray-300 px-6 text-center">
              <FolderOpen className="mb-4 h-10 w-10 text-gray-400" />
              <h3 className="text-lg font-normal text-gray-900">Esta ubicación está vacía</h3>
              <p className="mt-2 max-w-md text-sm text-gray-500">
                Crea carpetas o sube documentos para organizar los archivos de este proyecto.
              </p>
            </div>
          ) : (
            <>
              {viewMode === "list" ? (
                <DocumentListView
                  folders={visibleFolders}
                  documents={documentos}
                  transaccionesById={transaccionesById}
                  folderItemCount={folderItemCount}
                  onOpenFolder={setCurrentFolderId}
                  onContextMenu={openContextMenu}
                  onRename={startRename}
                  onMove={startMove}
                  onDelete={requestDelete}
                  onDownload={handleDownload}
                />
              ) : (
                <DocumentGridView
                  folders={visibleFolders}
                  documents={documentos}
                  transaccionesById={transaccionesById}
                  onOpenFolder={setCurrentFolderId}
                  onContextMenu={openContextMenu}
                  onRename={startRename}
                  onMove={startMove}
                  onDelete={requestDelete}
                  onDownload={handleDownload}
                />
              )}

              {documentosPage && (
                <PaginationControls
                  page={documentosPage.page}
                  pageSize={documentosPage.pageSize}
                  total={documentosPage.total}
                  totalPages={documentosPage.totalPages}
                  onPageChange={setPage}
                />
              )}
            </>
          )}
        </main>
      </div>

      {contextMenu && (
        <div
          className="fixed z-50 w-72 overflow-hidden border border-gray-200 bg-white shadow-lg"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <ActionCommand
            target={contextMenu.target}
            onOpen={() => {
              if (contextMenu.target.kind === "folder") {
                setCurrentFolderId(contextMenu.target.item._id);
              } else if (contextMenu.target.item.url) {
                window.open(contextMenu.target.item.url, "_blank");
              }
              setContextMenu(null);
            }}
            onRename={() => startRename(contextMenu.target)}
            onMove={() => startMove(contextMenu.target)}
            onDelete={() => requestDelete(contextMenu.target)}
          />
        </div>
      )}

      <Dialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-normal">Nueva carpeta</DialogTitle>
            <DialogDescription>
              Crea una carpeta dentro de{" "}
              {(folderDialogParentId ? folderById.get(folderDialogParentId)?.nombre : currentFolder?.nombre) ||
                "Biblioteca"}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="folder-name">Nombre</Label>
            <Input
              id="folder-name"
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              className="rounded-none"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-none" onClick={() => setFolderDialogOpen(false)}>
              Cancelar
            </Button>
            <Button className="rounded-none" onClick={handleCreateFolder} disabled={!draftName.trim()}>
              Crear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-normal">Renombrar</DialogTitle>
            <DialogDescription>{selectedTargetLabel}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="rename-name">Nombre</Label>
            <Input
              id="rename-name"
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              className="rounded-none"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-none" onClick={() => setRenameDialogOpen(false)}>
              Cancelar
            </Button>
            <Button className="rounded-none" onClick={handleRename} disabled={!draftName.trim()}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MoveLocationDialog
        open={moveDialogOpen}
        onOpenChange={setMoveDialogOpen}
        itemName={selectedTargetLabel}
        currentLocationId={
          selectedTarget?.kind === "document"
            ? selectedTarget.item.folder_id
            : selectedTarget?.item.parent_folder_id
        }
        folders={folders}
        folderOptions={availableMoveFolders}
        targetFolderId={targetFolderId}
        onTargetFolderChange={setTargetFolderId}
        onMove={handleMove}
        onCreateFolder={handleCreateMoveFolder}
      />

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteTarget?.kind === "folder" ? "Eliminar carpeta" : "Eliminar documento"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.kind === "folder"
                ? `Se eliminará la carpeta "${deleteTarget.item.nombre}". La carpeta debe estar vacía para poder eliminarla.`
                : `Se eliminará el documento "${deleteTarget?.item.nombre}". Esta acción no se puede deshacer.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteTarget(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 text-white hover:bg-red-700">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </TooltipProvider>
  );
}

function DocumentListView({
  folders,
  documents,
  transaccionesById,
  folderItemCount,
  onOpenFolder,
  onContextMenu,
  onRename,
  onMove,
  onDelete,
  onDownload,
}: {
  folders: FolderItem[];
  documents: DocumentItem[];
  transaccionesById: Map<string, TransaccionItem>;
  folderItemCount: Map<string, number>;
  onOpenFolder: (id: FolderId) => void;
  onContextMenu: (event: React.MouseEvent, target: MenuTarget) => void;
  onRename: (target: MenuTarget) => void;
  onMove: (target: MenuTarget) => void;
  onDelete: (target: MenuTarget) => void;
  onDownload: (url: string, name: string) => void;
}) {
  return (
    <div className="overflow-hidden border border-gray-200">
      <table className="w-full table-fixed border-collapse">
        <colgroup>
          <col className="w-[43%]" />
          <col className="w-[12%]" />
          <col className="w-[14%]" />
          <col className="w-[12%]" />
          <col className="w-[9%]" />
          <col className="w-[10%]" />
        </colgroup>
        <thead className="hidden border-b border-gray-200 xl:table-header-group">
          <tr>
            <th className="px-4 py-4 text-left text-sm font-normal text-gray-600">Nombre</th>
            <th className="px-3 py-4 text-left text-sm font-normal text-gray-600">Proveedor</th>
            <th className="px-3 py-4 text-left text-sm font-normal text-gray-600">Tipo</th>
            <th className="px-3 py-4 text-left text-sm font-normal text-gray-600">Transacción</th>
            <th className="px-3 py-4 text-left text-sm font-normal text-gray-600">Fecha</th>
            <th className="px-2 py-4 text-right text-sm font-normal text-gray-600">Acciones</th>
          </tr>
        </thead>
        <tbody className="block divide-y divide-gray-200 xl:table-row-group">
          {folders.map((folder) => (
            <tr
              key={folder._id}
              className="block p-4 hover:bg-gray-50 xl:table-row xl:p-0"
              onContextMenu={(event) => onContextMenu(event, { kind: "folder", item: folder })}
            >
              <td className="block pb-4 xl:table-cell xl:px-4 xl:py-4">
                <button
                  className="flex min-w-0 items-center gap-3 text-left"
                  onClick={() => onOpenFolder(folder._id)}
                >
                  <Folder className="h-5 w-5 shrink-0 fill-gray-700 text-gray-700" />
                  <span className="min-w-0">
                    <span className="block break-words font-medium text-gray-900 xl:line-clamp-2">{folder.nombre}</span>
                    <span className="block truncate text-xs text-gray-400">
                      {folderItemCount.get(folder._id) || 0} elementos
                    </span>
                  </span>
                </button>
              </td>
              <td className="flex items-start justify-between gap-4 py-2 text-sm text-gray-500 xl:table-cell xl:px-3 xl:py-4">
                <span className="flex-none text-xs font-medium uppercase tracking-wide text-gray-400 xl:hidden">
                  Proveedor
                </span>
                <span className="min-w-0 break-words text-right xl:text-left">-</span>
              </td>
              <td className="flex items-start justify-between gap-4 py-2 text-sm text-gray-500 xl:table-cell xl:px-3 xl:py-4">
                <span className="flex-none text-xs font-medium uppercase tracking-wide text-gray-400 xl:hidden">
                  Tipo
                </span>
                <span className="min-w-0 break-words text-right xl:text-left">Carpeta</span>
              </td>
              <td className="flex items-start justify-between gap-4 py-2 text-sm text-gray-500 xl:table-cell xl:px-3 xl:py-4">
                <span className="flex-none text-xs font-medium uppercase tracking-wide text-gray-400 xl:hidden">
                  Transacción
                </span>
                <span className="min-w-0 break-words text-right xl:text-left">-</span>
              </td>
              <td className="flex items-start justify-between gap-4 py-2 text-sm text-gray-500 xl:table-cell xl:px-3 xl:py-4">
                <span className="flex-none text-xs font-medium uppercase tracking-wide text-gray-400 xl:hidden">
                  Fecha
                </span>
                <span className="min-w-0 break-words text-right xl:text-left">
                  {formatDate(folder.updated_at || folder.created_at)}
                </span>
              </td>
              <td className="block pt-3 xl:table-cell xl:px-2 xl:py-4">
                <div className="flex justify-end">
                  <RowActions
                    target={{ kind: "folder", item: folder }}
                    onRename={onRename}
                    onMove={onMove}
                    onDelete={onDelete}
                  />
                </div>
              </td>
            </tr>
          ))}

          {documents.map((doc) => {
            const transaction = doc.transaccion_id ? transaccionesById.get(doc.transaccion_id) : undefined;

            return (
              <tr
                key={doc._id}
                className="block p-4 hover:bg-gray-50 xl:table-row xl:p-0"
                onContextMenu={(event) => onContextMenu(event, { kind: "document", item: doc })}
              >
                <td className="block pb-4 xl:table-cell xl:px-4 xl:py-4">
                  <div className="flex min-w-0 items-start gap-3">
                    {getFileIcon(doc)}
                    <div className="min-w-0">
                      <button
                        className="break-words text-left text-sm font-medium text-gray-900 hover:underline xl:line-clamp-2"
                        onClick={() => doc.url && window.open(doc.url, "_blank")}
                      >
                        {doc.nombre}
                      </button>
                      <p className="line-clamp-2 break-words text-xs text-gray-400">{doc.descripcion || doc.type}</p>
                    </div>
                  </div>
                </td>
                <td className="flex items-start justify-between gap-4 py-2 text-sm text-gray-900 xl:table-cell xl:px-3 xl:py-4">
                  <span className="flex-none text-xs font-medium uppercase tracking-wide text-gray-400 xl:hidden">
                    Proveedor
                  </span>
                  <span className="min-w-0 break-words text-right xl:text-left">
                    {transaction?.banco || "-"}
                  </span>
                </td>
                <td className="flex items-start justify-between gap-4 py-2 xl:table-cell xl:px-3 xl:py-4">
                  <span className="flex-none text-xs font-medium uppercase tracking-wide text-gray-400 xl:hidden">
                    Tipo
                  </span>
                  <Badge
                    variant="outline"
                    className={`${getTipoBadgeColor(doc.type)} max-w-full break-words whitespace-normal rounded-none px-3 py-1 text-xs font-normal capitalize`}
                  >
                    {doc.type}
                  </Badge>
                </td>
                <td className="flex items-start justify-between gap-4 py-2 text-sm text-gray-900 xl:table-cell xl:px-3 xl:py-4">
                  <span className="flex-none text-xs font-medium uppercase tracking-wide text-gray-400 xl:hidden">
                    Transacción
                  </span>
                  <span className="min-w-0 break-words text-right xl:text-left">
                    {transaction?.factura || transaction?.codigo_referencia || "-"}
                  </span>
                </td>
                <td className="flex items-start justify-between gap-4 py-2 text-sm text-gray-500 xl:table-cell xl:px-3 xl:py-4">
                  <span className="flex-none text-xs font-medium uppercase tracking-wide text-gray-400 xl:hidden">
                    Fecha
                  </span>
                  <span className="min-w-0 break-words text-right xl:text-left">
                    {formatDate(doc.uploaded_at || doc._creationTime)}
                  </span>
                </td>
                <td className="block pt-3 xl:table-cell xl:px-2 xl:py-4">
                  <div className="flex flex-wrap items-center justify-end gap-1">
                    {doc.url && (
                      <>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 rounded-none"
                          title={`Ver ${doc.nombre}`}
                          onClick={() => window.open(doc.url!, "_blank")}
                        >
                          <ExternalLink className="h-4 w-4 text-gray-600" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 rounded-none"
                          title="Descargar documento"
                          onClick={() => onDownload(doc.url!, doc.nombre)}
                        >
                          <Download className="h-4 w-4 text-gray-600" />
                        </Button>
                      </>
                    )}
                    <RowActions
                      target={{ kind: "document", item: doc }}
                      onRename={onRename}
                      onMove={onMove}
                      onDelete={onDelete}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DocumentGridView({
  folders,
  documents,
  transaccionesById,
  onOpenFolder,
  onContextMenu,
  onRename,
  onMove,
  onDelete,
  onDownload,
}: {
  folders: FolderItem[];
  documents: DocumentItem[];
  transaccionesById: Map<string, TransaccionItem>;
  onOpenFolder: (id: FolderId) => void;
  onContextMenu: (event: React.MouseEvent, target: MenuTarget) => void;
  onRename: (target: MenuTarget) => void;
  onMove: (target: MenuTarget) => void;
  onDelete: (target: MenuTarget) => void;
  onDownload: (url: string, name: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {folders.map((folder) => (
        <button
          key={folder._id}
          className="min-h-32 border border-gray-200 p-4 text-left hover:bg-gray-50"
          onDoubleClick={() => onOpenFolder(folder._id)}
          onClick={() => onOpenFolder(folder._id)}
          onContextMenu={(event) => onContextMenu(event, { kind: "folder", item: folder })}
        >
          <div className="mb-6 flex items-center justify-between">
            <Folder className="h-8 w-8 fill-gray-700 text-gray-700" />
            <RowActions
              target={{ kind: "folder", item: folder }}
              onRename={onRename}
              onMove={onMove}
              onDelete={onDelete}
            />
          </div>
          <p className="truncate font-medium text-gray-900">{folder.nombre}</p>
          <p className="mt-1 text-xs text-gray-500">{formatDate(folder.updated_at || folder.created_at)}</p>
        </button>
      ))}

      {documents.map((doc) => {
        const transaction = doc.transaccion_id ? transaccionesById.get(doc.transaccion_id) : undefined;

        return (
          <div
            key={doc._id}
            className="min-h-40 border border-gray-200 p-4 hover:bg-gray-50"
            onContextMenu={(event) => onContextMenu(event, { kind: "document", item: doc })}
          >
            <div className="mb-4 flex items-center justify-between">
              {getFileIcon(doc, "h-8 w-8")}
              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                {doc.url && (
                  <>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 rounded-none"
                      title={`Ver ${doc.nombre}`}
                      onClick={() => window.open(doc.url!, "_blank")}
                    >
                      <ExternalLink className="h-4 w-4 text-gray-600" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 rounded-none"
                      title="Descargar documento"
                      onClick={() => onDownload(doc.url!, doc.nombre)}
                    >
                      <Download className="h-4 w-4 text-gray-600" />
                    </Button>
                  </>
                )}
                <RowActions
                  target={{ kind: "document", item: doc }}
                  onRename={onRename}
                  onMove={onMove}
                  onDelete={onDelete}
                />
              </div>
            </div>
            <button
              className="line-clamp-2 text-left font-medium text-gray-900 hover:underline"
              onClick={() => doc.url && window.open(doc.url, "_blank")}
            >
              {doc.nombre}
            </button>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge
                variant="outline"
                className={`${getTipoBadgeColor(doc.type)} rounded-none px-2 py-0.5 text-xs font-normal capitalize`}
              >
                {doc.type}
              </Badge>
            </div>
            {(transaction?.banco || transaction?.factura || transaction?.codigo_referencia) && (
              <p className="mt-2 truncate text-xs text-gray-500">
                {transaction.banco || transaction.factura || transaction.codigo_referencia}
              </p>
            )}
            <p className="mt-1 truncate text-xs text-gray-400">
              {formatDate(doc.uploaded_at || doc._creationTime)}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function RowActions({
  target,
  onRename,
  onMove,
  onDelete,
}: {
  target: MenuTarget;
  onRename: (target: MenuTarget) => void;
  onMove: (target: MenuTarget) => void;
  onDelete: (target: MenuTarget) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-none">
          <MoreVertical className="h-4 w-4 text-gray-500" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="rounded-none">
        <DropdownMenuItem onClick={() => onRename(target)}>
          <Edit3 className="h-4 w-4" />
          Renombrar
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onMove(target)}>
          <FolderInput className="h-4 w-4" />
          Mover ubicación
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onDelete(target)} className="text-red-600 focus:text-red-700">
          <Trash2 className="h-4 w-4" />
          Eliminar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ActionCommand({
  target,
  onOpen,
  onRename,
  onMove,
  onDelete,
}: {
  target: MenuTarget;
  onOpen: () => void;
  onRename: () => void;
  onMove: () => void;
  onDelete: () => void;
}) {
  return (
    <Command className="rounded-none">
      <CommandList>
        <CommandGroup heading={target.kind === "folder" ? "Carpeta" : "Documento"}>
          <CommandItem onSelect={onOpen}>
            {target.kind === "folder" ? <FolderOpen /> : <Download />}
            {target.kind === "folder" ? "Abrir" : "Abrir archivo"}
          </CommandItem>
          <CommandItem onSelect={onRename}>
            <Edit3 />
            Cambiar nombre
            <CommandShortcut>Ctrl+E</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={onMove}>
            <FolderInput />
            Mover ubicacion
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup>
          <CommandItem onSelect={onDelete} className="text-red-600 data-[selected=true]:text-red-700">
            <Trash2 />
            Eliminar
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  );
}

function PaginationControls({
  page,
  pageSize,
  total,
  totalPages,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  if (total <= pageSize) return null;

  const firstItem = (page - 1) * pageSize + 1;
  const lastItem = Math.min(page * pageSize, total);
  const pages = getPaginationPages(page, totalPages);

  return (
    <div className="mt-5 flex flex-col gap-3 border border-gray-200 px-4 py-3 text-sm text-gray-500 md:flex-row md:items-center md:justify-between">
      <span>
        Mostrando {firstItem}-{lastItem} de {total} documentos
      </span>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-none"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        {pages.map((item, index) =>
          item === "ellipsis" ? (
            <span key={`${item}-${index}`} className="px-2 text-gray-400">
              ...
            </span>
          ) : (
            <Button
              key={item}
              type="button"
              variant={item === page ? "default" : "ghost"}
              className="h-9 w-9 rounded-none px-0"
              onClick={() => onPageChange(item)}
            >
              {item}
            </Button>
          )
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-none"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function flattenFolders(folders: FolderItem[]) {
  const byParent = new Map<string, FolderItem[]>();
  folders.forEach((folder) => {
    const key = folder.parent_folder_id || ROOT_VALUE;
    const siblings = byParent.get(key) || [];
    siblings.push(folder);
    byParent.set(key, siblings);
  });

  byParent.forEach((siblings) => siblings.sort((a, b) => a.nombre.localeCompare(b.nombre)));

  const result: { id: FolderId; name: string; level: number }[] = [];
  const walk = (parentId: string, level: number) => {
    (byParent.get(parentId) || []).forEach((folder) => {
      result.push({ id: folder._id, name: folder.nombre, level });
      walk(folder._id, level + 1);
    });
  };

  walk(ROOT_VALUE, 0);
  return result;
}

function collectDescendants(folders: FolderItem[], folderId: FolderId, blocked: Set<string>) {
  folders
    .filter((folder) => folder.parent_folder_id === folderId)
    .forEach((folder) => {
      blocked.add(folder._id);
      collectDescendants(folders, folder._id, blocked);
    });
}

function getPaginationPages(page: number, totalPages: number) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages: Array<number | "ellipsis"> = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(totalPages - 1, page + 1);

  if (start > 2) pages.push("ellipsis");

  for (let item = start; item <= end; item += 1) {
    pages.push(item);
  }

  if (end < totalPages - 1) pages.push("ellipsis");

  pages.push(totalPages);
  return pages;
}

function getTipoBadgeColor(tipo: string) {
  switch (tipo.toLowerCase()) {
    case "factura":
      return "bg-blue-50 text-blue-700 border-blue-200";
    case "comprobante":
      return "bg-green-50 text-green-700 border-green-200";
    case "presupuesto":
      return "bg-purple-50 text-purple-700 border-purple-200";
    default:
      return "bg-gray-100 text-gray-700 border-gray-200";
  }
}

function formatDate(timestamp?: number) {
  if (!timestamp) return "--";

  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(timestamp));
}

function normalize(value: string) {
  return value.toLowerCase().trim();
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Ocurrió un error inesperado";
}

function getFileIcon(doc: DocumentItem, className = "h-5 w-5 shrink-0") {
  const text = `${doc.type} ${doc.nombre}`.toLowerCase();

  if (text.includes("image") || text.match(/\.(png|jpg|jpeg|webp|gif)$/)) {
    return <FileImage className={cn(className, "text-sky-600")} />;
  }

  if (text.includes("sheet") || text.match(/\.(xls|xlsx|csv)$/)) {
    return <FileSpreadsheet className={cn(className, "text-emerald-600")} />;
  }

  if (text.match(/\.(zip|rar|7z)$/)) {
    return <FileArchive className={cn(className, "text-amber-600")} />;
  }

  if (text.includes("pdf") || text.includes("contrato") || text.includes("factura")) {
    return <FileText className={cn(className, "text-red-600")} />;
  }

  return <File className={cn(className, "text-gray-500")} />;
}
