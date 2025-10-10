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

  // Query payments based on level with proper proyecto filtering
  const isRealPartida = level === 2 && partida._id && !partida._id.toString().startsWith("temp-");

  // Level 2: Get payments by partida_id (specific sub-partida)
  const level2Payments = useQuery(
    api.pagos.getByPartidaId,
    isRealPartida ? { partida_id: partida._id } : "skip"
  );

  // Level 0: Get all payments for this partida name
  // proyecto_id is optional - will filter by it if available
  const level0Payments = useQuery(
    api.pagos.getByPartidaName,
    level === 0 && partida.nombre
      ? {
        partida_name: partida.nombre,
        proyecto_id: partida.proyecto
      }
      : "skip"
  );

  // Level 1: Get all payments for this familia within the partida
  // proyecto_id is optional - will filter by it if available
  const level1Payments = useQuery(
    api.pagos.getByFamilia,
    level === 1 && partida.nombre && partida.familia
      ? {
        partida_name: partida.nombre,
        familia_name: partida.familia,
        proyecto_id: partida.proyecto
      }
      : "skip"
  );

  // Select the appropriate payments based on level
  const payments = level === 0 ? level0Payments : level === 1 ? level1Payments : level2Payments;

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

    // Get the appropriate payments based on level
    // Now all levels have properly filtered payments from their respective queries
    const relevantPayments = payments || [];

    // Create payment context with all related payments
    const paymentContext = {
      payments: relevantPayments,
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
            {/* Show edit option for all levels */}
            <DialogTrigger asChild>
              <Button
                variant="ghost"
                className="w-full justify-start flex items-center gap-2"
              >
                <Pencil className="h-4 w-4" />
                Editar {labels.title.toLowerCase()}
              </Button>
            </DialogTrigger>

            {/* View payments option */}
            <Button
              variant="ghost"
              className="w-full justify-start flex items-center gap-2"
              onClick={handleViewPayments}
            >
              <CreditCard className="h-4 w-4" />
              {level === 2 ? 'Ver pagos' : `Ver pagos de ${labels.title.toLowerCase()}`}
            </Button>

            {/* View details option */}
            <Button
              variant="ghost"
              className="w-full justify-start flex items-center gap-2"
              onClick={handleViewDetails}
            >
              {level === 2 ? <FileText className="h-4 w-4" /> : <MoreHorizontalIcon className="h-4 w-4" />}
              {labels.viewDetailsText}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      {/* Edit dialog for all levels */}
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{labels.editTitle}</DialogTitle>
          <DialogDescription>
            Actualiza la información de {level === 0 ? 'la partida' : level === 1 ? 'la familia' : 'la sub-partida'}
          </DialogDescription>
        </DialogHeader>
        {partida &&
          <EditPartidaForm partida={partida} level={level} onClose={() => { }} />}
      </DialogContent>
    </Dialog>
  );
}
