"use client";

import { Doc } from "convex/_generated/dataModel";
import { MoreHorizontal, Pencil, CreditCard, MoreHorizontalIcon, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "../ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { useSeePaymentDetailsModal } from "@/hooks/see-transactions-details";
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
  // Note: level 0 = nivel 1 (partida), level 1 = nivel 2 (familia), level 2 = nivel 3 (sub-partida)
  const isRealPartida = level === 2 && partida._id && !partida._id.toString().startsWith("temp-");

  // Level 2 (nivel 3): Get payments by partida_id (specific sub-partida)
  const level2Payments = useQuery(
    api.pagos.getByPartidaId,
    isRealPartida ? { partida_id: partida._id } : "skip"
  );

  // Level 0 (nivel 1): Get all payments for this partida name
  // For nivel 1 items, partida.nombre is the partida name
  const level0Payments = useQuery(
    api.pagos.getByPartidaName,
    level === 0 && partida.nombre
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
    level === 1 && partida.familia && partida.nombre
      ? {
        partida_name: partida.nombre, // For aggregated rows, nombre IS the partida name
        familia_name: partida.familia,
        proyecto_id: partida.proyecto
      }
      : "skip"
  );

  // Select the appropriate payments based on level
  const payments = level === 0 ? level0Payments : level === 1 ? level1Payments : level2Payments;

  // For level 1 (familia), check if it has any sub-partidas (nivel 3 items)
  // Query all partidas in this project with the same partida name and familia
  const allPartidas = useQuery(
    api.partida.getByProject,
    level === 1 && partida.proyecto ? { projectId: partida.proyecto } : "skip"
  );

  // Check if this familia has any sub-partidas
  const hasSubPartidas = level === 1 && allPartidas
    ? allPartidas.some(
        (p: Doc<"partidas">) =>
          p.nivel === 3 && // nivel 3 = sub-partida
          p.nombre === partida.nombre && // same partida
          p.familia === partida.familia // same familia
      )
    : false;

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
        // If familia has no sub-partidas, treat it like a leaf node (show detailed view)
        return {
          title: "Familia",
          editTitle: `Editar Familia: ${rowData.displayName}`,
          viewDetailsText: hasSubPartidas ? "Ver resumen de familia" : "Ver detalles completos",
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
    // Navigate to detail page for:
    // 1. Level 2 (sub-partidas) with real IDs
    // 2. Level 1 (familias) with no sub-partidas and real IDs
    const shouldNavigateToDetails = 
      (level === 2 && partida._id) || 
      (level === 1 && !hasSubPartidas && partida._id);

    if (shouldNavigateToDetails) {
      navigate(`/dashboard/partidas/${partida._id}`);
    } else {
      // For aggregated rows or familias with sub-partidas, show summary modal
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

  const handleViewTransactions = () => {
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

    seePaymentDetailsModal.onOpen(paymentContext);
  };

  return (
    <Dialog>
      <Popover>
        <PopoverTrigger asChild>
          <Button className="border-none border-transparent" variant="ghost" size={"icon"}>
            <span className="sr-only">Open menu</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-1 text-wrap">
          <div className="space-y-1">
            {/* Show edit option for all levels - each level now has its own database record */}
            <DialogTrigger asChild>
              <Button
                variant="ghost"
                className="w-full justify-start flex items-center gap-2 text-wrap"
              >
                <Pencil className="h-4 w-4" />
                Editar {labels.title.toLowerCase()}
              </Button>
            </DialogTrigger>

            {/* View payments option */}
            <Button
              variant="ghost"
              className="w-full justify-start flex items-center gap-2 text-wrap "
              onClick={handleViewTransactions}
            >
              <CreditCard className="h-4 w-4" />
              {level === 2 ? 'Ver pagos' : `Ver transacciones`}
              {/* Ver transacciones */}
            </Button>

            {/* View details option */}
            <Button
              variant="ghost"
              className="w-full justify-start flex items-center gap-2 text-wrap"
              onClick={handleViewDetails}
            >
              {/* Show FileText icon for leaf nodes (level 2 or level 1 without sub-partidas) */}
              {(level === 2 || (level === 1 && !hasSubPartidas)) ? <FileText className="h-4 w-4" /> : <MoreHorizontalIcon className="h-4 w-4" />}
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
