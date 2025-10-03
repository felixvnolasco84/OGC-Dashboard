"use client";

import { Doc, Id } from "convex/_generated/dataModel";
import { MoreHorizontal, Pencil, CreditCard, MoreHorizontalIcon, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "../ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { useSeePaymentDetailsModal } from "@/hooks/see-payment-details";
import { useNavigate } from "react-router-dom";
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

  const navigate = useNavigate();

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
      // For aggregated rows, show summary in console (could be a modal in future)
      console.log(`Viewing ${labels.title} summary:`, {
        name: rowData.displayName,
        level: level,
        presupuestoOriginal: rowData.presupuestoOriginal,
        presupuestoAprobado: rowData.presupuestoAprobado,
        pagado: rowData.pagado,
        avance: rowData.avance,
      });
      // TODO: Could open a summary modal here for aggregated data
    }
  };

  const handleViewPayments = () => {
    // Calculate amounts based on level
    const baseAmount = level === 2 
      ? Number(partida.Cantidad || 0)
      : rowData.presupuestoAprobado;

    const mockPayments: Doc<"pagos">[] = [
      {
        _id: "payment_1" as Id<"pagos">,
        _creationTime: Date.now(),
        administracion: partida.nombre,
        partida: partida.nombre,
        familia: partida.familia,
        sub_partida: partida.sub_partida,
        monto: (baseAmount * 0.6).toString(), // 60% of total
        fecha: "15/01/2024",
        tipo_pago: "Transferencia Bancaria",
        tarjeta: "",
        banco: "BBVA Bancomer",
        tipo_cambio: "1.0",
        moneda: "MXN",
        logo_banco: "https://www.bbva.com/wp-content/uploads/2019/04/Logo-BBVA.jpg",
        numero_cuenta: "1234567890123456",
        numero_transferencia: "TRF20240115001",
        codigo_referencia: partida._id || `ref-${rowData.displayName}`,
        factura: "",
        informacion_facturacion_pago: "payment_1" as Id<"informacion_facturacion_pago">,
      },
      {
        _id: "payment_2" as Id<"pagos">,
        _creationTime: Date.now(),
        administracion: partida.nombre,
        partida: partida.nombre,
        familia: partida.familia,
        sub_partida: partida.sub_partida,
        monto: (baseAmount * 0.25).toString(), // 25% of total
        fecha: "22/01/2024",
        tipo_pago: "Tarjeta de Crédito",
        tarjeta: "**** **** **** 4532",
        banco: "Santander",
        tipo_cambio: "1.0",
        moneda: "MXN",
        logo_banco: "https://upload.wikimedia.org/wikipedia/commons/c/c4/Banco_Santander_Logotipo_%282007-2018%29.svg",
        numero_cuenta: "",
        numero_transferencia: "",
        codigo_referencia: "CC" + (partida._id || rowData.displayName),
        factura: "",
        informacion_facturacion_pago: "payment_2" as Id<"informacion_facturacion_pago">,
      },
      {
        _id: "payment_3" as Id<"pagos">,
        _creationTime: Date.now(),
        administracion: partida.nombre,
        partida: partida.nombre,
        familia: partida.familia,
        sub_partida: partida.sub_partida,
        monto: (baseAmount * 0.10).toString(), // 10% of total
        fecha: "28/01/2024",
        tipo_pago: "Efectivo",
        tarjeta: "",
        banco: "",
        tipo_cambio: "1.0",
        moneda: "MXN",
        logo_banco: "",
        numero_cuenta: "",
        numero_transferencia: "",
        codigo_referencia: "EF" + (partida._id || rowData.displayName),
        factura: "",
        informacion_facturacion_pago: "payment_3" as Id<"informacion_facturacion_pago">,
      }
    ];

    // Create payment context with contextual data
    const paymentContext = {
      payments: mockPayments,
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
                  Ver pagos del {labels.title.toLowerCase()}
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
