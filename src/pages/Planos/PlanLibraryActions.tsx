import { useEffect, useRef, type RefObject } from "react";
import type { Id } from "../../../convex/_generated/dataModel";
import { Bell, ChevronDown, FolderUp, MoreHorizontal, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import MentionNotificationCenter, { type MentionNotificationTrigger } from "./MentionNotificationCenter";

// Open the next surface only after the menu releases its focus/overlay.
// Focusing the persistent trigger first also gives dialogs a valid return target.
function useMenuAction(triggerRef: RefObject<HTMLButtonElement>, enabled = true) {
  const pendingAction = useRef<(() => void) | null>(null);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  return {
    select: (action: () => void) => { pendingAction.current = action; },
    onCloseAutoFocus: (event: Event) => {
      const action = pendingAction.current;
      pendingAction.current = null;
      if (!action || !mounted.current || !enabled) return;
      event.preventDefault();
      triggerRef.current?.focus();
      action();
    },
  };
}

function LibraryMentionMenu({ onOpen, unreadCount, triggerRef }: MentionNotificationTrigger) {
  const menuAction = useMenuAction(triggerRef);
  const unreadLabel = unreadCount === undefined
    ? "Cargando menciones"
    : unreadCount === 0
      ? "Sin menciones sin leer"
      : `${unreadCount} menciones sin leer`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          ref={triggerRef}
          type="button"
          variant="outline"
          size="actionIcon"
          className="relative rounded-sm bg-card text-subtle-foreground shadow-none"
          aria-label={`Más acciones de la biblioteca de planos. ${unreadLabel}`}
          title="Más acciones de la biblioteca de planos"
          data-viewer-readonly-allow="true"
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          {(unreadCount || 0) > 0 && (
            <span aria-hidden="true" className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-sm bg-[#50AC66] px-1.5 text-[11px] font-medium text-on-color">
              {(unreadCount || 0) > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 max-w-[calc(100vw-2rem)] rounded-sm" aria-label="Seguimiento de planos" onCloseAutoFocus={menuAction.onCloseAutoFocus}>
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Seguimiento</DropdownMenuLabel>
        <DropdownMenuGroup>
          <DropdownMenuItem className="min-h-11" onSelect={() => menuAction.select(onOpen)} data-viewer-readonly-allow="true">
            <Bell aria-hidden="true" />
            <span>Menciones de planos</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function PlanLibraryActions({
  projectId, canWrite, busy, onUploadPlan, onUploadFolder,
}: {
  projectId: Id<"desarrollos">;
  canWrite: boolean;
  busy: boolean;
  onUploadPlan: () => void;
  onUploadFolder: () => void;
}) {
  const uploadTriggerRef = useRef<HTMLButtonElement>(null);
  const uploadMenuAction = useMenuAction(uploadTriggerRef, canWrite && !busy);

  return (
    <div className="flex shrink-0 items-center gap-2 self-start lg:self-auto">
      {canWrite && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button ref={uploadTriggerRef} type="button" size="action" disabled={busy} className="rounded-sm font-normal shadow-none" aria-label="Cargar planos">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Cargar
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 max-w-[calc(100vw-2rem)] rounded-sm" aria-label="Cargar planos" onCloseAutoFocus={uploadMenuAction.onCloseAutoFocus}>
            <DropdownMenuItem className="min-h-11" disabled={!canWrite || busy} onSelect={() => uploadMenuAction.select(onUploadPlan)}>
              <Plus aria-hidden="true" />Cargar plano
            </DropdownMenuItem>
            <DropdownMenuItem className="min-h-11" disabled={!canWrite || busy} onSelect={() => uploadMenuAction.select(onUploadFolder)}>
              <FolderUp aria-hidden="true" />Cargar carpeta
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <MentionNotificationCenter projectId={projectId} renderTrigger={(trigger) => <LibraryMentionMenu {...trigger} />} />
    </div>
  );
}
