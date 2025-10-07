"use client";

import { Doc } from "convex/_generated/dataModel";
import { MoreHorizontal, Pencil, CreditCard, MoreHorizontalIcon, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "../ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { useSeePaymentDetailsModal } from "@/hooks/see-payment-details";
import { useAggregatedDetailsModal } from "@/hooks/aggregated-details-modal";
import { useNavigate } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import EditPartidaForm from "../Forms/EditPartidaForm";

interface DropdownMenuComponentPartidaProps {
  partida: Doc<"partidas">;
  level: number;
  rowData: {
    displayName: string;
    presupuestoOriginal: number;
    presupuestoAprobado: number;
    pagado: number;
    avance: number;
  };
}

export default function DropdownMenuComponentPartida({
  partida,
  level,
  rowData,
}: DropdownMenuComponentPartidaProps) {
  const seePaymentDetailsModal = useSeePaymentDetailsModal();
  const aggregatedDetailsModal = useAggregatedDetailsModal();

  const navigate = useNavigate();

  // Query real payments for this partida (only for level 2 with real IDs)
  // Level 0 and 1 are aggregated rows with temporary IDs
  const isRealPartida = level === 2 && partida._id && !partida._id.toString().startsWith("temp-");
  const payments = useQuery(
    api.pagos.getByPartidaId,
    isRealPartida ? { partida_id: partida._id } : "skip"
  );

  // Get context-aware labels based on level
  const getContextualLabels = () => {
    switch (level) {
      case 0:
        return {
          title: "Partida",
          editTitle: `Editar Partida: ${rowData.displayName}`,
          viewDetailsText: "Ver resumen de partida",
        };
      case 1:
        return {
          title: "Familia",
          editTitle: `Editar Familia: ${rowData.displayName}`,
          viewDetailsText: "Ver resumen de familia",
        };
      case 2:
        return {
          title: "Sub-partida",
          editTitle: `Editar Sub-partida: ${rowData.displayName}`,
          viewDetailsText: "Ver detalles completos",
        };
      default:
        return {
          title: "Item",
          editTitle: "Editar",
          viewDetailsText: "Ver detalles",
        };
    }
  };

  const labels = getContextualLabels();

  //Navigate to cost details with react router
  const handleViewDetails = () => {
    if (level === 2 && partida._id) {
      // Only navigate to detail page for actual partidas (level 2) with real IDs
      navigate(`/dashboard/partidas/${partida._id}`);
    } else {
      // For aggregated rows, show summary modal
      aggregatedDetailsModal.onOpen({
        name: rowData.displayName,
        level: level,
        levelLabel: labels.title,
        presupuestoOriginal: rowData.presupuestoOriginal,
        presupuestoAprobado: rowData.presupuestoAprobado,
        pagado: rowData.pagado,
        avance: rowData.avance,
      });
    }
  };

  const handleViewPayments = () => {
    // Calculate amounts based on level
    const baseAmount = level === 2
      ? Number(partida.aprobado || 0)
      : rowData.presupuestoAprobado;

    // For aggregated rows (level 0, 1), show message or empty state
    // For real partidas (level 2), use queried payments
    const realPayments = isRealPartida ? (payments || []) : [];

    // Create payment context with real data
    const paymentContext = {
      payments: realPayments,
      relatedPartida: partida,
      totalAmount: baseAmount,
    };

    seePaymentDetailsModal.onOpen(paymentContext);
  };

  return (
    <Dialog>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0">
            <span className="sr-only">Open menu</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-1">
          <div className="space-y-1">
            {/* Show different options based on level */}
            {level === 2 ? (
              // Full options for actual partida rows (level 2)
              <>
                <DialogTrigger asChild>
                  <Button
                    variant="ghost"
                    className="w-full justify-start flex items-center gap-2"
                  >
                    <Pencil className="h-4 w-4" />
                    Editar sub-partida
                  </Button>
                </DialogTrigger>
                <Button
                  variant="ghost"
                  className="w-full justify-start flex items-center gap-2"
                  onClick={handleViewPayments}
                >
                  <CreditCard className="h-4 w-4" />
                  Ver pagos
                </Button>
                <Button
                  variant="ghost"
                  className="w-full justify-start flex items-center gap-2"
                  onClick={handleViewDetails}
                >
                  <FileText className="h-4 w-4" />
                  Ver detalles
                </Button>
              </>
            ) : (
              // Limited options for aggregated rows (level 0, 1)
              <>
                <Button
                  variant="ghost"
                  className="w-full justify-start flex items-center gap-2"
                  onClick={handleViewPayments}
                >
                  <CreditCard className="h-4 w-4" />
                  Ver pagos de {labels.title.toLowerCase()}
                </Button>
                <Button
                  variant="ghost"
                  className="w-full justify-start flex items-center gap-2"
                  onClick={handleViewDetails}
                >
                  <MoreHorizontalIcon className="h-4 w-4" />
                  {labels.viewDetailsText}
                </Button>
              </>
            )}
          </div>
        </PopoverContent>
      </Popover>
      {/* Only show edit dialog for level 2 items */}
      {level === 2 && (
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{labels.editTitle}</DialogTitle>
            <DialogDescription>Actualiza la información de la sub-partida</DialogDescription>
          </DialogHeader>
          {partida &&
            <EditPartidaForm partida={partida} onClose={() => { }} />}
        </DialogContent>
      )}
    </Dialog>
  );
}
