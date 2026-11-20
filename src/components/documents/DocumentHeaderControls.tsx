import { useEffect, useRef } from "react";
import { ChevronDown, FolderPlus, Grid2X2, List, Plus, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export function DocumentAddMenu({ onUpload, onNewFolder, dialogOpen, disabled = false }: {
  onUpload: () => void;
  onNewFolder: () => void;
  dialogOpen: boolean;
  disabled?: boolean;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pendingAction = useRef<(() => void) | null>(null);
  const ownsDialog = useRef(false);
  const wasDialogOpen = useRef(dialogOpen);

  useEffect(() => {
    const shouldRestore = wasDialogOpen.current && !dialogOpen && ownsDialog.current;
    wasDialogOpen.current = dialogOpen;
    if (!shouldRestore) return;
    ownsDialog.current = false;
    // Both dialogs live outside the menu; restore to its persistent trigger.
    const frame = requestAnimationFrame(() => triggerRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [dialogOpen]);

  return (
    <DropdownMenu onOpenChange={(open) => { if (open) pendingAction.current = null; }}>
      <DropdownMenuTrigger asChild>
        <Button ref={triggerRef} type="button" size="action" disabled={disabled || dialogOpen} className="w-full sm:w-auto">
          <Plus aria-hidden="true" />
          Agregar
          <ChevronDown aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-56 max-w-[calc(100vw-2rem)] rounded-none"
        aria-label="Agregar contenido"
        onCloseAutoFocus={(event) => {
          const action = pendingAction.current;
          pendingAction.current = null;
          if (!action || disabled || !triggerRef.current?.isConnected) return;
          if (triggerRef.current.closest('[data-viewer-readonly="true"]')) return;
          // Wait for the menu to release its focus scope before opening a dialog.
          event.preventDefault();
          triggerRef.current.focus();
          ownsDialog.current = true;
          action();
        }}
      >
        <DropdownMenuItem disabled={disabled} className="min-h-11" onSelect={() => { pendingAction.current = onUpload; }}>
          <Upload aria-hidden="true" />
          Subir documentos
        </DropdownMenuItem>
        <DropdownMenuItem disabled={disabled} className="min-h-11" onSelect={() => { pendingAction.current = onNewFolder; }}>
          <FolderPlus aria-hidden="true" />
          Nueva carpeta
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function DocumentViewToggle({ viewMode, onViewModeChange }: {
  viewMode: "list" | "grid";
  onViewModeChange: (view: "list" | "grid") => void;
}) {
  return (
    <div role="group" aria-label="Vista de documentos" className="flex h-12 w-fit max-w-full border border-border-strong">
      <Button type="button" variant="ghost" className={cn("h-full rounded-none px-3", viewMode === "list" && "bg-muted")} aria-pressed={viewMode === "list"} onClick={() => onViewModeChange("list")}>
        <List aria-hidden="true" />
        Lista
      </Button>
      <Button type="button" variant="ghost" className={cn("h-full rounded-none border-l border-border-strong px-3", viewMode === "grid" && "bg-muted")} aria-pressed={viewMode === "grid"} onClick={() => onViewModeChange("grid")}>
        <Grid2X2 aria-hidden="true" />
        Cuadrícula
      </Button>
    </div>
  );
}
