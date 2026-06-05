import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  HardDrive,
  PanelLeft,
  Plus,
  Search,
  TriangleAlert,
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type DocumentFolderOption<TId extends string = string> = {
  id: TId;
  name: string;
  level: number;
};

export type DocumentFolderTreeItem<TId extends string = string> = {
  _id: TId;
  nombre: string;
  parent_folder_id?: TId;
  created_at: number;
  updated_at?: number;
};

type FolderSidebarMetric = {
  label: string;
  value: string;
};

type DocumentFolderSidebarProps<TId extends string = string> = {
  activeFolderId?: TId;
  folderOptions: DocumentFolderOption<TId>[];
  folderItemCount: Map<string, number>;
  foldersCount: number;
  hideRoot?: boolean;
  metrics?: FolderSidebarMetric[];
  onFolderContextMenu?: (event: React.MouseEvent, id: TId) => void;
  onFolderSelect: (id?: TId) => void;
  rootLabel?: string;
  visibleLimit?: number;
};

type FolderTreeNode<TId extends string = string> = DocumentFolderOption<TId> & {
  children: FolderTreeNode<TId>[];
};

function buildFolderTree<TId extends string = string>(
  folders: DocumentFolderOption<TId>[]
): FolderTreeNode<TId>[] {
  const nodeMap = new Map<TId, FolderTreeNode<TId>>();
  const roots: FolderTreeNode<TId>[] = [];

  folders.forEach((f) => {
    nodeMap.set(f.id, { ...f, children: [] });
  });

  folders.forEach((f, index) => {
    const node = nodeMap.get(f.id)!;
    if (f.level === 0) {
      roots.push(node);
    } else {
      let parentEntry: DocumentFolderOption<TId> | undefined;
      for (let i = index - 1; i >= 0; i--) {
        if (folders[i].level === f.level - 1) {
          parentEntry = folders[i];
          break;
        }
      }
      if (parentEntry) {
        nodeMap.get(parentEntry.id)?.children.push(node);
      } else {
        roots.push(node);
      }
    }
  });

  return roots;
}

function FolderTreeItem<TId extends string = string>({
  node,
  activeFolderId,
  collapsed,
  onFolderSelect,
  onFolderContextMenu,
}: {
  node: FolderTreeNode<TId>;
  activeFolderId?: TId;
  collapsed: boolean;
  onFolderSelect: (id?: TId) => void;
  onFolderContextMenu?: (event: React.MouseEvent, id: TId) => void;
}) {
  const hasChildren = node.children.length > 0;
  const isActive = activeFolderId === node.id;
  const hasActiveDescendant = (n: FolderTreeNode<TId>): boolean =>
    n.children.some((c) => c.id === activeFolderId || hasActiveDescendant(c));
  const defaultOpen = isActive || hasActiveDescendant(node);

  if (!hasChildren) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            className={cn(
              "h-9 w-full rounded-none text-sm font-normal text-gray-600",
              collapsed ? "justify-center px-0" : "justify-start px-3",
              isActive && "bg-gray-100 text-gray-900"
            )}
            style={collapsed ? undefined : { paddingLeft: `${12 + node.level * 14}px` }}
            onClick={() => onFolderSelect(node.id)}
            onContextMenu={(event) => onFolderContextMenu?.(event, node.id)}
          >
            <Folder className="h-4 w-4 shrink-0 text-gray-500" />
            {!collapsed && <span className="truncate">{node.name}</span>}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right" hidden={!collapsed}>{node.name}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Collapsible defaultOpen={defaultOpen} className="w-full">
      <div
        className={cn(
          "flex h-9 w-full items-center rounded-none text-sm font-normal text-gray-600",
          isActive && "bg-gray-100 text-gray-900"
        )}
        style={collapsed ? undefined : { paddingLeft: `${12 + node.level * 14}px` }}
        onContextMenu={(event) => onFolderContextMenu?.(event, node.id)}
      >
        <button
          className="flex min-w-0 flex-1 items-center gap-1 px-1 py-1 hover:text-gray-900"
          onClick={() => onFolderSelect(node.id)}
        >
          <Folder className="h-4 w-4 shrink-0 text-gray-500" />
          {!collapsed && <span className="truncate">{node.name}</span>}
        </button>
        {!collapsed && (
          <CollapsibleTrigger asChild>
            <button className="mr-2 flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-400 hover:text-gray-600">
              <ChevronDown className="h-3.5 w-3.5 transition-transform [[data-state=open]_&]:rotate-0 [[data-state=closed]_&]:-rotate-90" />
            </button>
          </CollapsibleTrigger>
        )}
      </div>
      <CollapsibleContent>
        <div className="space-y-0.5">
          {node.children.map((child) => (
            <FolderTreeItem
              key={child.id}
              node={child}
              activeFolderId={activeFolderId}
              collapsed={collapsed}
              onFolderSelect={onFolderSelect}
              onFolderContextMenu={onFolderContextMenu}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function DocumentFolderSidebar<TId extends string = string>({
  activeFolderId,
  folderOptions,
  folderItemCount,
  foldersCount,
  hideRoot = false,
  metrics = [],
  onFolderContextMenu,
  onFolderSelect,
  rootLabel = "Biblioteca",
  visibleLimit,
}: DocumentFolderSidebarProps<TId>) {
  const [collapsed, setCollapsed] = useState(false);
  const limitedFolders = typeof visibleLimit === "number" ? folderOptions.slice(0, visibleLimit) : folderOptions;
  const folderTree = useMemo(() => buildFolderTree(limitedFolders), [limitedFolders]);

  return (
    <aside
      className={cn(
        "relative shrink-0 border-r border-gray-200 bg-white transition-[width] duration-200 ease-linear",
        collapsed ? "w-16" : "w-[280px]"
      )}
    >
      <button
        type="button"
        aria-label={collapsed ? "Expandir carpetas" : "Colapsar carpetas"}
        title={collapsed ? "Expandir carpetas" : "Colapsar carpetas"}
        className={cn(
          "absolute inset-y-0 -right-2 z-20 hidden w-4 transition-all ease-linear after:absolute after:inset-y-0 after:left-1/2 after:w-[2px] hover:after:bg-gray-200 sm:flex",
          collapsed ? "cursor-e-resize" : "cursor-w-resize"
        )}
        onClick={() => setCollapsed((value) => !value)}
      />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute -right-12 top-3 z-30 h-8 w-8 rounded-none bg-white text-gray-900 hover:bg-gray-50"
            onClick={() => setCollapsed((value) => !value)}
          >
            <PanelLeft className="h-5 w-5" />
            <span className="sr-only">{collapsed ? "Expandir carpetas" : "Colapsar carpetas"}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">{collapsed ? "Expandir carpetas" : "Colapsar carpetas"}</TooltipContent>
      </Tooltip>

      <div className={cn("py-8", collapsed ? "px-2" : "px-8")}>
        {!hideRoot && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                className={cn(
                  "mb-2 h-10 w-full rounded-none px-3 text-sm font-normal",
                  collapsed ? "justify-center" : "justify-start",
                  !activeFolderId && "bg-gray-100 text-gray-900"
                )}
                onClick={() => onFolderSelect(undefined)}
              >
                <FolderOpen className="h-4 w-4 shrink-0 text-gray-500" />
                {!collapsed && (
                  <>
                    <span className="truncate">{rootLabel}</span>
                    <span className="ml-auto text-xs text-gray-400">{folderItemCount.get("root") || 0}</span>
                  </>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right" hidden={!collapsed}>
              {rootLabel}
            </TooltipContent>
          </Tooltip>
        )}

        <div className="mt-4 space-y-0.5">
          {folderTree.map((node) => (
            <FolderTreeItem
              key={node.id}
              node={node}
              activeFolderId={activeFolderId}
              collapsed={collapsed}
              onFolderSelect={onFolderSelect}
              onFolderContextMenu={onFolderContextMenu}
            />
          ))}
        </div>

        {!collapsed && metrics.length > 0 && (
          <>
            <Separator className="my-6" />
            <div className="space-y-4 text-sm">
              {metrics.map((metric) => (
                <div key={metric.label}>
                  <p className="text-xs uppercase tracking-wide text-gray-400">{metric.label}</p>
                  <p className="mt-1 text-base text-gray-900">{metric.value}</p>
                </div>
              ))}
            </div>
          </>
        )}

        {!collapsed && metrics.length === 0 && (
          <p className="mt-6 text-xs text-gray-400">{foldersCount} carpeta(s)</p>
        )}
      </div>
    </aside>
  );
}

type MoveLocationDialogProps<TId extends string = string> = {
  currentLocationId?: TId;
  folders: DocumentFolderTreeItem<TId>[];
  folderOptions: DocumentFolderOption<TId>[];
  itemName: string;
  onCreateFolder?: (name: string, parentFolderId?: TId) => Promise<TId | void> | TId | void;
  onMove: () => void;
  onOpenChange: (open: boolean) => void;
  onTargetFolderChange: (id: string) => void;
  open: boolean;
  rootLabel?: string;
  targetFolderId: string;
};

export function MoveLocationDialog<TId extends string = string>({
  currentLocationId,
  folders,
  folderOptions,
  itemName,
  onCreateFolder,
  onMove,
  onOpenChange,
  onTargetFolderChange,
  open,
  rootLabel = "Biblioteca",
  targetFolderId,
}: MoveLocationDialogProps<TId>) {
  const [browseFolderId, setBrowseFolderId] = useState<TId | undefined>();
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("Carpeta sin titulo");
  const [query, setQuery] = useState("");
  const newFolderInputRef = useRef<HTMLInputElement>(null);

  const folderById = useMemo(() => new Map(folders.map((folder) => [folder._id, folder])), [folders]);
  const availableFolderIds = useMemo(() => new Set(folderOptions.map((folder) => folder.id)), [folderOptions]);
  const browsedFolder = browseFolderId ? folderById.get(browseFolderId) : undefined;

  const children = useMemo(() => {
    const normalizedQuery = normalize(query);
    return folders
      .filter((folder) => (folder.parent_folder_id || undefined) === browseFolderId)
      .filter((folder) => availableFolderIds.has(folder._id))
      .filter((folder) => normalize(folder.nombre).includes(normalizedQuery))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }, [availableFolderIds, browseFolderId, folders, query]);

  const breadcrumbs = useMemo(() => {
    const items: DocumentFolderTreeItem<TId>[] = [];
    let cursor = browsedFolder;

    while (cursor) {
      items.unshift(cursor);
      cursor = cursor.parent_folder_id ? folderById.get(cursor.parent_folder_id) : undefined;
    }

    return items;
  }, [browsedFolder, folderById]);

  const suggestedFolders = useMemo(() => {
    const normalizedQuery = normalize(query);
    const topLevel = folderOptions.filter((folder) => folder.level === 0);
    return (topLevel.length > 0 ? topLevel : folderOptions)
      .filter((folder) => normalize(folder.name).includes(normalizedQuery))
      .slice(0, 8);
  }, [folderOptions, query]);

  useEffect(() => {
    if (!open) return;
    setBrowseFolderId(undefined);
    setIsCreatingFolder(false);
    setNewFolderName("Carpeta sin titulo");
    setQuery("");
  }, [open]);

  useEffect(() => {
    if (!isCreatingFolder) return;
    requestAnimationFrame(() => {
      newFolderInputRef.current?.focus();
      newFolderInputRef.current?.select();
    });
  }, [isCreatingFolder]);

  const canMove = targetFolderId !== (currentLocationId || "root");
  const browsedFolderTargetId = browseFolderId || "root";

  const handleCreateFolder = async () => {
    const trimmedName = newFolderName.trim();
    if (!trimmedName || !onCreateFolder) return;

    const createdFolderId = await onCreateFolder(trimmedName, browseFolderId);
    if (createdFolderId) {
      onTargetFolderChange(createdFolderId);
    }
    setIsCreatingFolder(false);
    setNewFolderName("Carpeta sin titulo");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100vh-2rem)] max-w-4xl flex-col gap-0 overflow-hidden rounded-lg p-0">
        <DialogHeader className="shrink-0 px-9 pb-4 pt-8">
          <DialogTitle className="text-3xl font-normal text-gray-800">Mover "{itemName}"</DialogTitle>
          <div className="mt-4 flex items-center gap-3 text-base text-gray-700">
            <span>Ubicacion actual:</span>
            <div className="inline-flex h-12 items-center gap-2 rounded-lg border border-gray-300 px-3">
              <HardDrive className="h-6 w-6 text-gray-600" />
              <span>{rootLabel}</span>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {!browsedFolder ? (
            <>
            <div className="flex items-center justify-end border-b border-gray-200 px-9 py-2">
              <div className="relative w-60">
                <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="h-10 rounded-none border-0 pl-10 shadow-none focus-visible:ring-0"
                  placeholder="Buscar"
                />
              </div>
            </div>

            <div className="min-h-[220px] px-5 py-3">
              {suggestedFolders.length === 0 ? (
                <div className="flex h-64 items-center justify-center text-sm text-gray-500">
                  No hay carpetas disponibles para mover.
                </div>
              ) : (
                suggestedFolders.map((folder) => (
                  <MoveFolderRow
                    key={folder.id}
                    active={targetFolderId === folder.id}
                    name={folder.name}
                    onBrowse={() => setBrowseFolderId(folder.id)}
                    onSelect={() => onTargetFolderChange(folder.id)}
                  />
                ))
              )}
            </div>
            </>
          ) : (
            <>
            <div className="px-8 pb-4">
              <Button
                variant="ghost"
                className="h-10 rounded-none px-0 text-base font-medium text-gray-800"
                onClick={() => setBrowseFolderId(browsedFolder.parent_folder_id)}
              >
                <ArrowLeft className="h-5 w-5" />
                Mas ubicaciones
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-b border-gray-300 px-8 pb-3 text-base text-gray-600">
              <button className="hover:text-gray-900" onClick={() => setBrowseFolderId(undefined)}>
                {rootLabel}
              </button>
              {breadcrumbs.map((folder) => (
                <span key={folder._id} className="flex min-w-0 items-center gap-2">
                  <ChevronRight className="h-5 w-5 text-gray-600" />
                  <button
                    className={cn(
                      "truncate hover:text-gray-900",
                      folder._id === browseFolderId && "font-medium text-gray-900"
                    )}
                    onClick={() => setBrowseFolderId(folder._id)}
                  >
                    {folder.nombre}
                  </button>
                </span>
              ))}
            </div>

            <div className="grid grid-cols-[1fr_220px] border-b border-gray-100 px-8 py-3 text-sm font-medium text-gray-600">
              <button
                className="flex items-center gap-2 text-left"
                onClick={() => onTargetFolderChange(browsedFolderTargetId)}
              >
                Nombre
                <span className="text-xs uppercase text-gray-400">Asc</span>
              </button>
              <span>Fecha de modificacion</span>
            </div>

            <div className="min-h-[220px] px-5 py-2">
              <MoveFolderRow
                active={targetFolderId === browsedFolderTargetId}
                name={browsedFolder.nombre}
                onBrowse={() => onTargetFolderChange(browsedFolderTargetId)}
                onSelect={() => onTargetFolderChange(browsedFolderTargetId)}
                subtitle="Seleccionar esta carpeta"
              />
              {children.map((folder) => (
                <div
                  key={folder._id}
                  className={cn(
                    "grid grid-cols-[1fr_220px_auto] items-center gap-4 rounded-full border px-3 py-1.5 text-gray-700 hover:bg-gray-100",
                    targetFolderId === folder._id
                      ? "border-blue-600 bg-blue-100 text-blue-700"
                      : "border-transparent"
                  )}
                >
                  <button
                    className="flex min-w-0 items-center gap-4 text-left"
                    onClick={() => onTargetFolderChange(folder._id)}
                    onDoubleClick={() => setBrowseFolderId(folder._id)}
                  >
                    <Folder
                      className={cn(
                        "h-5 w-5 shrink-0 fill-gray-800 text-gray-800",
                        targetFolderId === folder._id && "fill-blue-600 text-blue-600"
                      )}
                    />
                    <span className="truncate">{folder.nombre}</span>
                  </button>
                  <span className={cn("text-gray-500", targetFolderId === folder._id && "text-blue-700")}>
                    {formatDate(folder.updated_at || folder.created_at)}
                  </span>
                  <div className="flex items-center gap-1">
                    {targetFolderId === folder._id && (
                      <Button
                        className="h-9 rounded-full px-5"
                        variant="secondary"
                        onClick={() => onTargetFolderChange(folder._id)}
                      >
                        Mover
                      </Button>
                    )}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-9 w-9 rounded-full"
                          onClick={() => setBrowseFolderId(folder._id)}
                        >
                          <ChevronRight className="h-6 w-6" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Ver contenido</TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              ))}
            </div>
            </>
          )}

          <div className="flex items-center gap-2 px-8 py-2 text-sm font-medium text-gray-800">
            <TriangleAlert className="h-5 w-5" />
            Selecciona una ubicacion para ver la ruta de la carpeta
          </div>

          {isCreatingFolder && (
            <div className="border-t border-gray-200 bg-white px-9 pb-6 pt-7 shadow-[0_-8px_24px_rgba(0,0,0,0.10)]">
              <h3 className="mb-6 text-xl font-medium text-gray-900">Nueva carpeta</h3>
              <Input
                ref={newFolderInputRef}
                value={newFolderName}
                onChange={(event) => setNewFolderName(event.target.value)}
                className="h-20 rounded-md border-2 border-blue-600 text-xl shadow-none focus-visible:ring-0"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void handleCreateFolder();
                  }
                  if (event.key === "Escape") {
                    setIsCreatingFolder(false);
                  }
                }}
              />
              <div className="mt-6 flex justify-end gap-5">
                <Button
                  variant="ghost"
                  className="h-12 rounded-full px-7 text-blue-600"
                  onClick={() => setIsCreatingFolder(false)}
                >
                  Cancelar
                </Button>
                <Button
                  className="h-12 rounded-full px-9"
                  disabled={!newFolderName.trim()}
                  onClick={() => void handleCreateFolder()}
                >
                  Crear
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 flex-row items-center justify-between border-t border-gray-100 px-9 pb-8 pt-3 sm:justify-between">
          <Button
            variant="outline"
            className="h-12 rounded-full px-7 text-blue-600"
            onClick={() => setIsCreatingFolder(true)}
          >
            <Plus className="h-4 w-4" />
            Nueva carpeta
          </Button>
          <div className="flex items-center gap-5">
            <Button variant="ghost" className="h-12 rounded-full px-7 text-blue-600" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button className="h-12 rounded-full px-9" disabled={!canMove} onClick={onMove}>
              Mover
            </Button>
          </div>
        </DialogFooter>

      </DialogContent>
    </Dialog>
  );
}

function MoveFolderRow({
  active,
  name,
  onBrowse,
  onSelect,
  subtitle,
}: {
  active: boolean;
  name: string;
  onBrowse: () => void;
  onSelect: () => void;
  subtitle?: string;
}) {
  return (
    <div
      className={cn(
        "group flex h-12 items-center gap-4 rounded-full border px-4 text-gray-800 hover:bg-gray-100",
        active ? "border-blue-600 bg-blue-100 text-blue-700" : "border-transparent"
      )}
    >
      <Folder className={cn("h-5 w-5 shrink-0 fill-gray-800 text-gray-800", active && "fill-blue-600 text-blue-600")} />
      <button className="min-w-0 flex-1 truncate text-left text-base" onClick={onSelect}>
        {name}
        {subtitle && <span className="ml-2 text-sm text-gray-500">{subtitle}</span>}
      </button>
      <div className={cn("flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100", active && "opacity-100")}>
        <Button className="h-9 rounded-full px-5" variant="secondary" onClick={onSelect}>
          Mover
        </Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon" variant="ghost" className="h-9 w-9 rounded-full" onClick={onBrowse}>
              <ChevronRight className="h-6 w-6" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Ver contenido</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

function formatDate(timestamp?: number) {
  if (!timestamp) return "--";

  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(timestamp));
}

function normalize(value: string) {
  return value.toLowerCase().trim();
}
