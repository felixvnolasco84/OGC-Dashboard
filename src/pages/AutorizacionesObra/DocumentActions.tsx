import { ChevronDown, History, Loader2, RefreshCw, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWorkAccess } from "./useWorkAccess";

/** Only exposes operations supplied by the document's own cell. */
export function DocumentActions({
  nombre,
  context,
  uploading,
  onChooseFile,
  onDelete,
  onToggleHistory,
  historyOpen = false,
}: {
  nombre?: string;
  context?: string;
  uploading: boolean;
  onChooseFile: () => void;
  onDelete?: () => void;
  onToggleHistory?: () => void;
  historyOpen?: boolean;
}) {
  const canManage = useWorkAccess();
  if (!canManage && !onToggleHistory) return null;

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="shrink-0 text-muted-foreground"
          aria-label={`Documento: ${context || nombre || "sin archivo"}`}
          aria-busy={uploading}
        >
          {uploading && <Loader2 className="animate-spin" aria-hidden="true" />}
          {uploading ? "Subiendo…" : "Documento"}
          <ChevronDown aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56 max-w-[calc(100vw-2rem)]">
        {canManage && (
          <DropdownMenuItem
            disabled={uploading}
            // Keep this synchronous: the native picker needs the user's gesture.
            onSelect={onChooseFile}
          >
            {nombre ? <RefreshCw aria-hidden="true" /> : <Upload aria-hidden="true" />}
            {nombre ? "Reemplazar documento" : "Agregar documento"}
          </DropdownMenuItem>
        )}
        {onToggleHistory && (
          <DropdownMenuItem onSelect={onToggleHistory}>
            <History aria-hidden="true" />
            {historyOpen ? "Ocultar historial" : "Ver historial"}
          </DropdownMenuItem>
        )}
        {canManage && nombre && onDelete && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" disabled={uploading} onSelect={onDelete}>
              <Trash2 aria-hidden="true" />
              Eliminar documento
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
