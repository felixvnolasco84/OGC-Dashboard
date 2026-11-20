import { useEffect, useRef } from "react";
import { Download, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function PlanViewerActions({
  title,
  url,
  fileName,
  canManage,
  busy,
  onEdit,
  onDelete,
}: {
  title: string;
  url: string | null;
  fileName: string;
  canManage: boolean;
  busy: boolean;
  onEdit: (trigger: HTMLButtonElement | null) => void;
  onDelete: (trigger: HTMLButtonElement | null) => void;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pendingAction = useRef<"edit" | "delete" | null>(null);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; pendingAction.current = null; };
  }, []);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          ref={triggerRef}
          type="button"
          variant="outline"
          disabled={busy}
          size="actionIcon"
          className="rounded-sm bg-card text-subtle-foreground shadow-none"
          aria-label={`Acciones del archivo: ${title}`}
          title={`Acciones del archivo: ${title}`}
          data-viewer-readonly-allow="true"
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-64 max-w-[calc(100vw-2rem)] rounded-sm"
        aria-label={`Archivo: ${title}`}
        onCloseAutoFocus={(event) => {
          const action = pendingAction.current;
          pendingAction.current = null;
          if (!action || !mounted.current || !canManage || busy) return;
          // Let the menu release its focus trap before opening either dialog.
          // Pass the persistent trigger to the shared dialogs for focus return.
          event.preventDefault();
          triggerRef.current?.focus();
          if (action === "edit") onEdit(triggerRef.current);
          else onDelete(triggerRef.current);
        }}
      >
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Archivo</DropdownMenuLabel>
        <DropdownMenuGroup>
          {url ? (
            <DropdownMenuItem asChild className="min-h-11" data-viewer-readonly-allow="true">
              <a href={url} download={fileName} target="_blank" rel="noreferrer">
                <Download aria-hidden="true" />Descargar plano
              </a>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem disabled className="min-h-11" title="El archivo no está disponible.">
              <Download aria-hidden="true" />Descargar plano
            </DropdownMenuItem>
          )}
          {canManage && (
            <DropdownMenuItem disabled={busy} className="min-h-11" onSelect={() => { pendingAction.current = "edit"; }}>
              <Pencil aria-hidden="true" />Editar datos
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
        {canManage && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Acción destructiva</DropdownMenuLabel>
            <DropdownMenuItem
              disabled={busy}
              className="min-h-11 text-danger focus:text-danger"
              onSelect={() => { pendingAction.current = "delete"; }}
            >
              <Trash2 aria-hidden="true" />Eliminar plano
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
