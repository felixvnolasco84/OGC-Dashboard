import { useRef, useState } from "react";
import { Bot, History, MoreHorizontal, RefreshCw } from "lucide-react";
import type { Id } from "../../../convex/_generated/dataModel";
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
import { InvoiceBackfillDialog } from "@/components/invoices/InvoiceBackfillDialog";
import { LaborImportHistoryDialog } from "@/components/transactions/LaborImportHistory";
import { useTransactionDetailsModal } from "@/hooks/transaction-details-modal";
import { useTransactionDocumentosModal } from "@/hooks/transaction-documentos-modal";

type ToolDialog = "invoices" | "history";

// The page keys this component by project so menu/dialog context never crosses projects.
export function ProjectTransactionTools({ projectId, canReviewInvoices, canSync, isSyncing, onSync }: {
  projectId: Id<"desarrollos">;
  canReviewInvoices: boolean;
  canSync: boolean;
  isSyncing: boolean;
  onSync: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialog, setDialog] = useState<ToolDialog | null>(null);
  const pendingDialog = useRef<ToolDialog | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const openAfterClose = (next: ToolDialog) => {
    pendingDialog.current = next;
    setMenuOpen(false);
  };
  const returnFocus = (event: Event) => {
    event.preventDefault();
    // A history/review row can open another modal. Do not steal its focus.
    if (!isTransactionModalOpen()) trigger.current?.focus();
  };

  return <>
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <DropdownMenuTrigger asChild>
        <Button ref={trigger} type="button" variant="outline" size="icon" className="h-12 w-12"
          data-viewer-readonly-allow="true" aria-label="Herramientas de transacciones" title="Herramientas de transacciones">
          <MoreHorizontal className={isSyncing ? "hidden" : "h-5 w-5"} />
          {isSyncing && <RefreshCw className="h-4 w-4 animate-spin" />}
          {isSyncing && <span className="sr-only" role="status">Sincronizando...</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 max-w-[calc(100vw-2rem)] rounded-none"
        onCloseAutoFocus={() => {
          const next = pendingDialog.current;
          pendingDialog.current = null;
          if (next) setDialog(next);
        }}>
        {canReviewInvoices && <>
          <DropdownMenuGroup aria-label="Revisión">
            <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Revisión</DropdownMenuLabel>
            <DropdownMenuItem className="min-h-11 rounded-none" onSelect={() => openAfterClose("invoices")}><Bot />Facturas IA</DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
        </>}
        <DropdownMenuGroup aria-label="Importación">
          <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Importación</DropdownMenuLabel>
          <DropdownMenuItem className="min-h-11 rounded-none" onSelect={() => openAfterClose("history")}><History />Historial de cargas</DropdownMenuItem>
        </DropdownMenuGroup>
        {canSync && <>
          <DropdownMenuSeparator />
          <DropdownMenuGroup aria-label="Mantenimiento">
            <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Mantenimiento</DropdownMenuLabel>
            <DropdownMenuItem className="min-h-11 rounded-none" disabled={isSyncing} onSelect={() => { setMenuOpen(false); onSync(); }}>
              <RefreshCw className={isSyncing ? "animate-spin" : undefined} />
              {isSyncing ? "Sincronizando..." : "Sincronizar documentos"}
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </>}
      </DropdownMenuContent>
    </DropdownMenu>
    <InvoiceBackfillDialog projectId={projectId} hideTrigger open={dialog === "invoices" && canReviewInvoices}
      onOpenChange={(open) => setDialog(open ? "invoices" : null)} onCloseAutoFocus={returnFocus} />
    <LaborImportHistoryDialog projectId={projectId} hideTrigger open={dialog === "history"}
      onOpenChange={(open) => setDialog(open ? "history" : null)} onCloseAutoFocus={returnFocus} />
  </>;
}

function isTransactionModalOpen() {
  return useTransactionDetailsModal.getState().isOpen || useTransactionDocumentosModal.getState().isOpen;
}
