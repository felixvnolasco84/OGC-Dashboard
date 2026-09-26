"use client";

import { useState } from "react";
import { Doc } from "convex/_generated/dataModel";
import { MoreHorizontal, Pencil, CreditCard, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { useSeePaymentDetailsModal } from "@/hooks/see-transactions-details";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import EditPartidaForm from "../Forms/EditPartidaForm";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";

interface DropdownMenuComponentPartidaProps {
  partida: Doc<"partidas">;
  level: number;
  rowData: {
    displayName: string;
    presupuestoOriginal: number;
    presupuestoAprobado: number;
    pagado: number;
    avance: number;
    hasChildren: boolean;
  };
  currency?: string;
}

export default function DropdownMenuComponentPartida({
  partida,
  level,
  rowData,
  currency = "MXN",
}: DropdownMenuComponentPartidaProps) {
  const seePaymentDetailsModal = useSeePaymentDetailsModal();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const currentUser = useQuery(api.users.getCurrentUser);
  const isViewer = currentUser?.role === "viewer";
  const canEdit = currentUser !== undefined && currentUser !== null && !isViewer;

  // Query payments based on level with proper proyecto filtering
  // Note: level 0 = nivel 1 (partida), level 1 = nivel 2 (familia), level 2 = nivel 3 (sub-partida)
  const isRealPartida = level === 2 && partida._id && !partida._id.toString().startsWith("temp-");
  const shouldPrimePayments = isMenuOpen;
  const deletionImpact = useQuery(
    api.partida.getSubPartidaDeletionImpact,
    isDeleteOpen && canEdit && isRealPartida ? { id: partida._id } : "skip",
  );
  const deleteSubPartida = useMutation(api.partida.deleteSubPartida);

  // Level 2 (nivel 3): Get payments by partida_id (specific sub-partida)
  const level2Payments = useQuery(
    api.pagos.getByPartidaId,
    shouldPrimePayments && isRealPartida ? { partida_id: partida._id } : "skip"
  );

  // Level 0 (nivel 1): Get all payments for this partida name
  // For nivel 1 items, partida.nombre is the partida name
  const level0Payments = useQuery(
    api.pagos.getByPartidaName,
    shouldPrimePayments && level === 0 && partida.nombre
      ? {
        partida_name: partida.nombre,
        proyecto_id: partida.proyecto
      }
      : "skip"
  );

  // Level 1 (nivel 2): Get all payments for this familia within the partida
  // For aggregated rows: partida.nombre is the partida name
  // For actual DB records: use partida_nombre to find the parent partida
  const level1Payments = useQuery(
    api.pagos.getByFamilia,
    shouldPrimePayments && level === 1 && partida.familia && partida.nombre
      ? {
        partida_name: partida.nombre, // For aggregated rows, nombre IS the partida name
        familia_name: partida.familia,
        proyecto_id: partida.proyecto
      }
      : "skip"
  );

  // Select the appropriate payments based on level
  const payments = level === 0 ? level0Payments : level === 1 ? level1Payments : level2Payments;
  const shouldLoadPayments =
    (level === 0 && Boolean(partida.nombre)) ||
    (level === 1 && Boolean(partida.familia && partida.nombre)) ||
    isRealPartida;
  const isLoadingPayments = shouldPrimePayments && shouldLoadPayments && payments === undefined;


  // Get context-aware labels based on level
  const getContextualLabels = () => {
    switch (level) {
      case 0:
        return {
          title: "Partida",
          editTitle: `Editar Partida: ${rowData.displayName}`,
        };
      case 1:
        // If familia has no sub-partidas, treat it like a leaf node (show detailed view)
        return {
          title: "Familia",
          editTitle: `Editar Familia: ${rowData.displayName}`,
        };
      case 2:
        return {
          title: "Sub-partida",
          editTitle: `Editar Sub-partida: ${rowData.displayName}`,
        };
      default:
        return {
          title: "Item",
          editTitle: "Editar",
        };
    }
  };

  const labels = getContextualLabels();

  const handleOpenEdit = () => {
    setIsMenuOpen(false);
    window.setTimeout(() => setIsEditOpen(true), 100);
  };

  const handleOpenDelete = () => {
    setIsMenuOpen(false);
    window.setTimeout(() => setIsDeleteOpen(true), 100);
  };

  const handleDelete = async () => {
    if (!deletionImpact?.canDelete || isDeleting) return;
    setIsDeleting(true);
    try {
      await deleteSubPartida({ id: partida._id });
      toast.success("Subpartida eliminada.");
      setIsDeleteOpen(false);
    } catch (error) {
      const message = error instanceof Error
        ? error.message.match(/Uncaught Error: ([^\n]+)/)?.[1] || error.message
        : "No se pudo eliminar la subpartida.";
      toast.error(message);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleViewTransactions = () => {
    if (isLoadingPayments) return;

    // Calculate amounts based on level
    // Use presupuesto_aprobado from the actual partida record for level 2 (nivel 3)
    // For aggregated levels (0 and 1), use the calculated totals from rowData
    const baseAmount = level === 2
      ? Number(partida.presupuesto_aprobado || 0)
      : rowData.presupuestoAprobado;

    // Get the appropriate payments based on level
    // Now all levels have properly filtered payments from their respective queries
    const relevantPayments = payments || [];

    // Create payment context with all related payments
    const paymentContext = {
      payments: relevantPayments,
      relatedPartida: partida,
      totalAmount: baseAmount,
    };

    setIsMenuOpen(false);
    window.setTimeout(() => seePaymentDetailsModal.onOpen(paymentContext), 100);
  };

  return (
    <>
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="quiet"
              size="iconSm"
              data-viewer-readonly-allow="true"
            >
              <span className="sr-only">Abrir menú</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={6}>
            {canEdit && (
              <>
                <DropdownMenuGroup>
                  <DropdownMenuItem onSelect={handleOpenEdit}>
                    <Pencil className="h-4 w-4" />
                    Editar {labels.title.toLowerCase()}
                  </DropdownMenuItem>
                  {level === 2 && (
                    <DropdownMenuItem onSelect={handleOpenDelete} variant="destructive">
                      <Trash2 className="h-4 w-4" />
                      Eliminar subpartida
                    </DropdownMenuItem>
                  )}
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuGroup>
              <DropdownMenuItem
                onSelect={handleViewTransactions}
                disabled={isLoadingPayments}
                aria-busy={isLoadingPayments}
                data-viewer-readonly-allow="true"
              >
                {isLoadingPayments ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CreditCard className="h-4 w-4" />
                )}
                {isLoadingPayments ? "Cargando..." : level === 2 ? "Ver pagos" : "Ver transacciones"}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{labels.editTitle}</DialogTitle>
            <DialogDescription>
              Actualiza la información de {level === 0 ? "la partida" : level === 1 ? "la familia" : "la subpartida"}
            </DialogDescription>
          </DialogHeader>
          <EditPartidaForm
            partida={partida}
            level={level}
            onClose={() => setIsEditOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={isDeleteOpen}
        onOpenChange={(open) => {
          if (!isDeleting) setIsDeleteOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deletionImpact && !deletionImpact.canDelete
                ? "No se puede eliminar la subpartida"
                : "¿Eliminar subpartida?"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  <span className=" text-foreground">{rowData.displayName}</span>
                  {" · "}
                  Presupuesto aprobado: {formatCurrency(rowData.presupuestoAprobado, currency)}
                </p>
                {deletionImpact === undefined ? (
                  <p>Verificando pagos y datos asociados...</p>
                ) : deletionImpact.canDelete ? (
                  <p>
                    Esta acción eliminará el concepto del presupuesto y recalculará los totales de su familia y partida. No se puede deshacer.
                  </p>
                ) : (
                  <div className="space-y-2">
                    <p>Debes retirar o reasignar estos datos antes de eliminarla:</p>
                    <ul className="list-disc space-y-1 pl-5">
                      {deletionImpact.blockers.map((blocker) => (
                        <li key={blocker}>{blocker}</li>
                      ))}
                    </ul>
                    <p>Puedes renombrar la subpartida sin perder esos vínculos.</p>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              {deletionImpact && !deletionImpact.canDelete ? "Cerrar" : "Cancelar"}
            </AlertDialogCancel>
            {deletionImpact?.canDelete && (
              <AlertDialogAction
                disabled={isDeleting}
                variant="destructive"
                onClick={(event) => {
                  event.preventDefault();
                  void handleDelete();
                }}
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Eliminando...
                  </>
                ) : (
                  "Eliminar"
                )}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
