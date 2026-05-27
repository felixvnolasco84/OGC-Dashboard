import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Edit3,
  File,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderInput,
  FolderOpen,
  Grid2X2,
  List,
  MoreVertical,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useUploadDocumentsModal } from "@/hooks/upload-documents-modal";

type FolderId = Id<"document_folders">;
type DocumentId = Id<"documentos">;

type FolderItem = {
  _id: FolderId;
  nombre: string;
  parent_folder_id?: FolderId;
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
  sales_proyecto?: Id<"sales_projects">;
  transaccion_id?: Id<"transacciones">;
  sales_transaccion_id?: Id<"sales_transacciones">;
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

const fileIconClass = "h-5 w-5 shrink-0";

export default function DocumentosPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [currentFolderId, setCurrentFolderId] = useState<FolderId | undefined>();
  const [selectedProject, setSelectedProject] = useState<string>(ROOT_VALUE);
  const [selectedType, setSelectedType] = useState<string>(ROOT_VALUE);
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [selectedTarget, setSelectedTarget] = useState<MenuTarget | null>(null);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [targetFolderId, setTargetFolderId] = useState<string>(ROOT_VALUE);
  const [page, setPage] = useState(1);

  const uploadModal = useUploadDocumentsModal();
  const metadata = useQuery(api.documentos.getFileManagerMetadata);

  const selectedProjectIds = useMemo(() => {
    const isRegularProject = metadata?.proyectos?.some((project) => project._id === selectedProject);
    const isSalesProject = metadata?.salesProjects?.some((project) => project._id === selectedProject);

    return {
      proyecto: isRegularProject ? (selectedProject as Id<"desarrollos">) : undefined,
      sales_proyecto: isSalesProject ? (selectedProject as Id<"sales_projects">) : undefined,
    };
  }, [metadata?.proyectos, metadata?.salesProjects, selectedProject]);

  const documentsPage = useQuery(api.documentos.listFileManagerDocuments, {
    folder_id: currentFolderId,
    proyecto: selectedProjectIds.proyecto,
    sales_proyecto: selectedProjectIds.sales_proyecto,
    type: selectedType === ROOT_VALUE ? undefined : selectedType,
    search: searchTerm,
    page,
    pageSize: PAGE_SIZE,
  });

  const createFolder = useMutation(api.documentos.createFolder);
  const renameFolder = useMutation(api.documentos.renameFolder);
  const renameDocument = useMutation(api.documentos.renameDocument);
  const moveFolder = useMutation(api.documentos.moveFolder);
  const moveDocument = useMutation(api.documentos.moveDocument);
  const deleteFolder = useMutation(api.documentos.deleteFolder);
  const deleteDocument = useMutation(api.documentos.deleteDocument);

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
  }, [currentFolderId, searchTerm, selectedProject, selectedType]);

  useEffect(() => {
    if (documentsPage && page !== documentsPage.page) {
      setPage(documentsPage.page);
    }
  }, [documentsPage, page]);

  const folders = (metadata?.folders || []) as FolderItem[];
  const documentos = (documentsPage?.documents || []) as DocumentItem[];

  const projectById = useMemo(() => {
    const map = new Map<string, string>();
    metadata?.proyectos?.forEach((project) => map.set(project._id, project.nombre));
    metadata?.salesProjects?.forEach((project) => map.set(project._id, `${project.nombre} (Ventas)`));
    return map;
  }, [metadata?.proyectos, metadata?.salesProjects]);

  const folderById = useMemo(() => {
    return new Map(folders.map((folder) => [folder._id, folder]));
  }, [folders]);

  const folderChildrenCount = useMemo(() => {
    const counts = new Map<string, number>();
    folders.forEach((folder) => {
      const key = folder.parent_folder_id || ROOT_VALUE;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return counts;
  }, [folders]);

  const folderOptions = useMemo(() => flattenFolders(folders), [folders]);

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

  const documentTypes = useMemo(() => {
    return documentsPage?.documentTypes || [];
  }, [documentsPage?.documentTypes]);

  const visibleFolders = useMemo(() => {
    return folders
      .filter((folder) => (folder.parent_folder_id || undefined) === currentFolderId)
      .filter((folder) => normalize(folder.nombre).includes(normalize(searchTerm)))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [currentFolderId, folders, searchTerm]);

  const visibleDocuments = useMemo(() => {
    return documentos;
  }, [documentos]);

  const totalSize = documentsPage?.totalSize || 0;
  const selectedTargetLabel = selectedTarget?.item.nombre || "";
  const isLoading = !metadata || !documentsPage;
  const hasFilters = Boolean(searchTerm || selectedProject !== ROOT_VALUE || selectedType !== ROOT_VALUE);

  const openContextMenu = (event: React.MouseEvent, target: MenuTarget) => {
    event.preventDefault();
    setSelectedTarget(target);
    setContextMenu({ x: event.clientX, y: event.clientY, target });
  };

  const startRename = (target: MenuTarget) => {
    setSelectedTarget(target);
    setDraftName(target.item.nombre);
    setRenameDialogOpen(true);
  };

  const startMove = (target: MenuTarget) => {
    setSelectedTarget(target);
    const folderId = target.kind === "document" ? target.item.folder_id : target.item.parent_folder_id;
    setTargetFolderId(folderId || ROOT_VALUE);
    setMoveDialogOpen(true);
  };

  const handleCreateFolder = async () => {
    try {
      await createFolder({
        nombre: draftName,
        parent_folder_id: currentFolderId,
      });
      setFolderDialogOpen(false);
      setDraftName("");
      toast.success("Carpeta creada");
    } catch (error) {
      toast.error("No se pudo crear la carpeta", {
        description: getErrorMessage(error),
      });
    }
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
      toast.success("Ubicacion actualizada");
    } catch (error) {
      toast.error("No se pudo mover", {
        description: getErrorMessage(error),
      });
    }
  };

  const handleDelete = async (target: MenuTarget) => {
    try {
      if (target.kind === "folder") {
        await deleteFolder({ id: target.item._id });
        if (currentFolderId === target.item._id) setCurrentFolderId(undefined);
        toast.success("Carpeta eliminada");
      } else {
        await deleteDocument({ id: target.item._id });
        toast.success("Documento eliminado");
      }
    } catch (error) {
      toast.error("No se pudo eliminar", {
        description:
          target.kind === "folder"
            ? "La carpeta debe estar vacia antes de eliminarse."
            : getErrorMessage(error),
      });
    }
  };

  const availableMoveFolders = useMemo(() => {
    if (selectedTarget?.kind !== "folder") return folderOptions;

    const blocked = new Set<string>([selectedTarget.item._id]);
    collectDescendants(folders, selectedTarget.item._id, blocked);
    return folderOptions.filter((option) => !blocked.has(option.id));
  }, [folderOptions, folders, selectedTarget]);

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-white text-left">
        <div className="border-b border-gray-200 px-12 py-8">
          <div className="flex flex-col gap-6">
            <div className="flex items-end justify-between gap-6">
              <div>
                <p className="mb-1 text-base text-gray-500">Gestion documental</p>
                <h1 className="text-2xl font-normal text-gray-900">Documentos</h1>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="lg"
                  className="rounded-none py-6 text-gray-500"
                  onClick={() => {
                    setDraftName("");
                    setFolderDialogOpen(true);
                  }}
                >
                  Nueva carpeta
                  <Plus className="h-5 w-5" />
                </Button>
                <Button
                  size="lg"
                  className="rounded-none py-6"
                  onClick={() => uploadModal.onOpen()}
                >
                  Subir documentos
                  <Upload className="h-5 w-5" />
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(280px,1fr)_220px_220px_auto]">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                <Input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Buscar por nombre, tipo o descripcion"
                  className="h-12 rounded-none border-gray-300 pl-12"
                />
              </div>

              <Select value={selectedProject} onValueChange={setSelectedProject}>
                <SelectTrigger className="h-12 rounded-none">
                  <SelectValue placeholder="Proyecto" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ROOT_VALUE}>Todos los proyectos</SelectItem>
                  {metadata?.proyectos?.map((project) => (
                    <SelectItem key={project._id} value={project._id}>
                      {project.nombre}
                    </SelectItem>
                  ))}
                  {metadata?.salesProjects?.map((project) => (
                    <SelectItem key={project._id} value={project._id}>
                      {project.nombre} (Ventas)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedType} onValueChange={setSelectedType}>
                <SelectTrigger className="h-12 rounded-none">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ROOT_VALUE}>Todos los tipos</SelectItem>
                  {documentTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

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

        <div className="grid min-h-[calc(100vh-225px)] grid-cols-[280px_1fr]">
          <aside className="border-r border-gray-200 px-8 py-8">
            <Button
              variant="ghost"
              className={cn(
                "mb-2 h-10 w-full justify-start rounded-none px-3 text-sm font-normal",
                !currentFolderId && "bg-gray-100 text-gray-900"
              )}
              onClick={() => setCurrentFolderId(undefined)}
            >
              <FolderOpen className="h-4 w-4 text-gray-500" />
              Biblioteca
              <span className="ml-auto text-xs text-gray-400">{folderChildrenCount.get(ROOT_VALUE) || 0}</span>
            </Button>

            <div className="mt-4 space-y-1">
              {folderOptions.slice(0, 12).map((folder) => (
                <Button
                  key={folder.id}
                  variant="ghost"
                  className={cn(
                    "h-9 w-full justify-start rounded-none px-3 text-sm font-normal text-gray-600",
                    currentFolderId === folder.id && "bg-gray-100 text-gray-900"
                  )}
                  style={{ paddingLeft: `${12 + folder.level * 14}px` }}
                  onClick={() => setCurrentFolderId(folder.id)}
                  onContextMenu={(event) => {
                    const item = folderById.get(folder.id);
                    if (item) openContextMenu(event, { kind: "folder", item });
                  }}
                >
                  <Folder className="h-4 w-4 text-gray-500" />
                  <span className="truncate">{folder.name}</span>
                </Button>
              ))}
            </div>

            <Separator className="my-6" />

            <div className="space-y-4 text-sm">
              <Metric label="Archivos" value={(documentsPage?.total || 0).toString()} />
              <Metric label="Carpetas" value={folders.length.toString()} />
              <Metric label="Almacenamiento" value={formatBytes(totalSize)} />
            </div>
          </aside>

          <main className="px-12 py-8">
            <div className="mb-6 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="mb-2 flex items-center gap-2 text-sm text-gray-500">
                  <button
                    className="hover:text-gray-900"
                    onClick={() => setCurrentFolderId(undefined)}
                  >
                    Biblioteca
                  </button>
                  {breadcrumbs.map((folder) => (
                    <span key={folder._id} className="flex min-w-0 items-center gap-2">
                      <ChevronRight className="h-4 w-4 text-gray-300" />
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
                  {currentFolder?.nombre || "Biblioteca de documentos"}
                </h2>
              </div>

              {(searchTerm || selectedProject !== ROOT_VALUE || selectedType !== ROOT_VALUE) && (
                <Button
                  variant="ghost"
                  className="rounded-none text-gray-500"
                  onClick={() => {
                    setSearchTerm("");
                    setSelectedProject(ROOT_VALUE);
                    setSelectedType(ROOT_VALUE);
                  }}
                >
                  Limpiar filtros
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>

            {isLoading ? (
              <div className="flex min-h-[360px] items-center justify-center text-gray-500">
                Cargando documentos...
              </div>
            ) : visibleFolders.length === 0 && visibleDocuments.length === 0 ? (
              <EmptyState
                hasFilters={hasFilters}
                onCreateFolder={() => {
                  setDraftName("");
                  setFolderDialogOpen(true);
                }}
              />
            ) : (
              <>
                {viewMode === "list" ? (
                  <DocumentList
                    folders={visibleFolders}
                    documents={visibleDocuments}
                    projectById={projectById}
                    folderChildrenCount={folderChildrenCount}
                    onOpenFolder={setCurrentFolderId}
                    onContextMenu={openContextMenu}
                    onRename={startRename}
                    onMove={startMove}
                    onDelete={handleDelete}
                  />
                ) : (
                  <DocumentGrid
                    folders={visibleFolders}
                    documents={visibleDocuments}
                    projectById={projectById}
                    onOpenFolder={setCurrentFolderId}
                    onContextMenu={openContextMenu}
                    onRename={startRename}
                    onMove={startMove}
                    onDelete={handleDelete}
                  />
                )}
                <PaginationControls
                  page={documentsPage.page}
                  pageSize={documentsPage.pageSize}
                  total={documentsPage.total}
                  totalPages={documentsPage.totalPages}
                  onPageChange={setPage}
                />
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
              }}
              onRename={() => startRename(contextMenu.target)}
              onMove={() => startMove(contextMenu.target)}
              onDelete={() => handleDelete(contextMenu.target)}
            />
          </div>
        )}

        <Dialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-normal">Nueva carpeta</DialogTitle>
              <DialogDescription>
                Crea una carpeta dentro de {currentFolder?.nombre || "Biblioteca"}.
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

        <Dialog open={moveDialogOpen} onOpenChange={setMoveDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-normal">Mover ubicacion</DialogTitle>
              <DialogDescription>{selectedTargetLabel}</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label>Destino</Label>
              <Select value={targetFolderId} onValueChange={setTargetFolderId}>
                <SelectTrigger className="rounded-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ROOT_VALUE}>Biblioteca</SelectItem>
                  {availableMoveFolders.map((folder) => (
                    <SelectItem key={folder.id} value={folder.id}>
                      {"  ".repeat(folder.level)}
                      {folder.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="outline" className="rounded-none" onClick={() => setMoveDialogOpen(false)}>
                Cancelar
              </Button>
              <Button className="rounded-none" onClick={handleMove}>
                Mover
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}

function DocumentList({
  folders,
  documents,
  projectById,
  folderChildrenCount,
  onOpenFolder,
  onContextMenu,
  onRename,
  onMove,
  onDelete,
}: {
  folders: FolderItem[];
  documents: DocumentItem[];
  projectById: Map<string, string>;
  folderChildrenCount: Map<string, number>;
  onOpenFolder: (id: FolderId) => void;
  onContextMenu: (event: React.MouseEvent, target: MenuTarget) => void;
  onRename: (target: MenuTarget) => void;
  onMove: (target: MenuTarget) => void;
  onDelete: (target: MenuTarget) => void;
}) {
  return (
    <div className="border border-gray-200">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="h-12 px-6 font-normal text-gray-500">Nombre</TableHead>
            <TableHead className="h-12 font-normal text-gray-500">Proyecto</TableHead>
            <TableHead className="h-12 font-normal text-gray-500">Tipo</TableHead>
            <TableHead className="h-12 font-normal text-gray-500">Modificado</TableHead>
            <TableHead className="h-12 font-normal text-gray-500">Tamano</TableHead>
            <TableHead className="h-12 w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {folders.map((folder) => (
            <TableRow
              key={folder._id}
              className="cursor-pointer hover:bg-gray-50"
              onDoubleClick={() => onOpenFolder(folder._id)}
              onContextMenu={(event) => onContextMenu(event, { kind: "folder", item: folder })}
            >
              <TableCell className="px-6 py-4">
                <button className="flex min-w-0 items-center gap-3" onClick={() => onOpenFolder(folder._id)}>
                  <Folder className="h-5 w-5 shrink-0 fill-gray-700 text-gray-700" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-gray-900">{folder.nombre}</span>
                    <span className="block truncate text-xs text-gray-400">
                      {folderChildrenCount.get(folder._id) || 0} elementos
                    </span>
                  </span>
                </button>
              </TableCell>
              <TableCell className="text-gray-500">Biblioteca</TableCell>
              <TableCell className="text-gray-500">Carpeta</TableCell>
              <TableCell className="text-gray-500">{formatDate(folder.updated_at || folder.created_at)}</TableCell>
              <TableCell className="text-gray-500">--</TableCell>
              <TableCell>
                <InlineActions
                  target={{ kind: "folder", item: folder }}
                  onRename={onRename}
                  onMove={onMove}
                  onDelete={onDelete}
                />
              </TableCell>
            </TableRow>
          ))}

          {documents.map((doc) => (
            <TableRow
              key={doc._id}
              className="hover:bg-gray-50"
              onContextMenu={(event) => onContextMenu(event, { kind: "document", item: doc })}
            >
              <TableCell className="px-6 py-4">
                <div className="flex min-w-0 items-center gap-3">
                  {getFileIcon(doc)}
                  <div className="min-w-0">
                    <button
                      className="truncate text-sm font-medium text-gray-900 hover:underline"
                      onClick={() => doc.url && window.open(doc.url, "_blank")}
                    >
                      {doc.nombre}
                    </button>
                    <p className="truncate text-xs text-gray-400">{doc.descripcion || doc.type}</p>
                  </div>
                </div>
              </TableCell>
              <TableCell className="text-gray-600">
                {projectById.get(doc.proyecto || doc.sales_proyecto || "") || "--"}
              </TableCell>
              <TableCell className="text-gray-500">{doc.type || "--"}</TableCell>
              <TableCell className="text-gray-500">{formatDate(doc.uploaded_at || doc._creationTime)}</TableCell>
              <TableCell className="text-gray-500">{formatBytes(doc.size)}</TableCell>
              <TableCell>
                <InlineActions
                  target={{ kind: "document", item: doc }}
                  onRename={onRename}
                  onMove={onMove}
                  onDelete={onDelete}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
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

function DocumentGrid({
  folders,
  documents,
  projectById,
  onOpenFolder,
  onContextMenu,
  onRename,
  onMove,
  onDelete,
}: {
  folders: FolderItem[];
  documents: DocumentItem[];
  projectById: Map<string, string>;
  onOpenFolder: (id: FolderId) => void;
  onContextMenu: (event: React.MouseEvent, target: MenuTarget) => void;
  onRename: (target: MenuTarget) => void;
  onMove: (target: MenuTarget) => void;
  onDelete: (target: MenuTarget) => void;
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
            <InlineActions
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

      {documents.map((doc) => (
        <div
          key={doc._id}
          className="min-h-40 border border-gray-200 p-4 hover:bg-gray-50"
          onContextMenu={(event) => onContextMenu(event, { kind: "document", item: doc })}
        >
          <div className="mb-6 flex items-center justify-between">
            {getFileIcon(doc, "h-8 w-8")}
            <InlineActions
              target={{ kind: "document", item: doc }}
              onRename={onRename}
              onMove={onMove}
              onDelete={onDelete}
            />
          </div>
          <button
            className="line-clamp-2 text-left font-medium text-gray-900 hover:underline"
            onClick={() => doc.url && window.open(doc.url, "_blank")}
          >
            {doc.nombre}
          </button>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge variant="outline" className="rounded-xl font-normal">
              {doc.type}
            </Badge>
            <span className="text-xs text-gray-500">{formatBytes(doc.size)}</span>
          </div>
          <p className="mt-3 truncate text-xs text-gray-500">
            {projectById.get(doc.proyecto || doc.sales_proyecto || "") || "Sin proyecto"}
          </p>
        </div>
      ))}
    </div>
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

function InlineActions({
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
    <div className="flex items-center justify-end gap-1" onClick={(event) => event.stopPropagation()}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-none" onClick={() => onRename(target)}>
            <Edit3 className="h-4 w-4 text-gray-500" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Renombrar</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-none" onClick={() => onMove(target)}>
            <FolderInput className="h-4 w-4 text-gray-500" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Mover</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-none" onClick={() => onDelete(target)}>
            <MoreVertical className="h-4 w-4 text-gray-500" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Mas acciones</TooltipContent>
      </Tooltip>
    </div>
  );
}

function EmptyState({
  hasFilters,
  onCreateFolder,
}: {
  hasFilters: boolean;
  onCreateFolder: () => void;
}) {
  return (
    <div className="flex min-h-[360px] flex-col items-center justify-center border border-dashed border-gray-300 px-6 text-center">
      <FolderOpen className="mb-4 h-10 w-10 text-gray-400" />
      <h3 className="text-lg font-normal text-gray-900">
        {hasFilters ? "No hay resultados" : "Esta ubicacion esta vacia"}
      </h3>
      <p className="mt-2 max-w-md text-sm text-gray-500">
        {hasFilters
          ? "Ajusta la busqueda o limpia los filtros para ver mas documentos."
          : "Crea carpetas para organizar contratos, facturas, comprobantes y soportes por flujo de trabajo."}
      </p>
      {!hasFilters && (
        <Button variant="outline" className="mt-6 rounded-none" onClick={onCreateFolder}>
          Crear carpeta
          <Plus className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 text-base text-gray-900">{value}</p>
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

function getFileIcon(doc: DocumentItem, className = fileIconClass) {
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

function formatDate(timestamp?: number) {
  if (!timestamp) return "--";

  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(timestamp));
}

function formatBytes(bytes?: number) {
  if (!bytes) return "--";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function normalize(value: string) {
  return value.toLowerCase().trim();
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Intenta de nuevo.";
}
