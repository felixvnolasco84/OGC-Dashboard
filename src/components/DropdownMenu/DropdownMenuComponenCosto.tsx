"use client";

import { Doc, Id } from "convex/_generated/dataModel";
import { MoreHorizontal, Pencil, CreditCard, MoreHorizontalIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "../ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import EditCostForm from "../Forms/EditCostForm";
import { useSeePaymentDetailsModal } from "@/hooks/see-payment-details";
import { useNavigate } from "react-router-dom";

export default function DropdownMenuComponentCosto({
  costo,
}: {
  costo: Doc<"costos">;
}) {
  const seePaymentDetailsModal = useSeePaymentDetailsModal();

  const navigate = useNavigate();

  //Navigate to cost details with react router
  const handleViewDetails = () => {
    navigate(`/dashboard/costos/${costo._id}`);
  }

  const handleViewPayments = () => {

    const mockPayments: Doc<"pagos">[] = [
      {
        _id: "payment_1" as Id<"pagos">,
        _creationTime: Date.now(),
        administracion: costo.administracion,
        partida: costo.partida,
        familia: costo.familia,
        sub_partida: costo.sub_partida,
        monto: ((costo.monto_decimal || 0) * 0.6).toString(), // 60% of total
        fecha: "15/01/2024",
        tipo_pago: "Transferencia Bancaria",
        tarjeta: "",
        banco: "BBVA Bancomer",
        tipo_cambio: "1.0",
        moneda: "MXN",
        logo_banco: "https://www.bbva.com/wp-content/uploads/2019/04/Logo-BBVA.jpg",
        numero_cuenta: "1234567890123456",
        numero_transferencia: "TRF20240115001",
        codigo_referencia: costo.codigo_referencia,
        factura: costo.factura,
        informacion_facturacion_pago: "payment_1" as Id<"informacion_facturacion_pago">,
      },
      {
        _id: "payment_2" as Id<"pagos">,
        _creationTime: Date.now(),
        administracion: costo.administracion,
        partida: costo.partida,
        familia: costo.familia,
        sub_partida: costo.sub_partida,
        monto: ((costo.monto_decimal || 0) * 0.25).toString(), // 25% of total
        fecha: "22/01/2024",
        tipo_pago: "Tarjeta de Crédito",
        tarjeta: "**** **** **** 4532",
        banco: "Santander",
        tipo_cambio: "1.0",
        moneda: "MXN",
        logo_banco: "https://upload.wikimedia.org/wikipedia/commons/c/c4/Banco_Santander_Logotipo_%282007-2018%29.svg",
        numero_cuenta: "",
        numero_transferencia: "",
        codigo_referencia: "CC" + costo.codigo_referencia,
        factura: costo.factura,
        informacion_facturacion_pago: "payment_2" as Id<"informacion_facturacion_pago">,
      },
      {
        _id: "payment_3" as Id<"pagos">,
        _creationTime: Date.now(),
        administracion: costo.administracion,
        partida: costo.partida,
        familia: costo.familia,
        sub_partida: costo.sub_partida,
        monto: ((costo.monto_decimal || 0) * 0.10).toString(), // 10% of total
        fecha: "28/01/2024",
        tipo_pago: "Efectivo",
        tarjeta: "",
        banco: "",
        tipo_cambio: "1.0",
        moneda: "MXN",
        logo_banco: "",
        numero_cuenta: "",
        numero_transferencia: "",
        codigo_referencia: "EF" + costo.codigo_referencia,
        factura: costo.factura,
        informacion_facturacion_pago: "payment_3" as Id<"informacion_facturacion_pago">,
      }
    ];

    // Create payment context with mock data
    const paymentContext = {
      payments: mockPayments,
      relatedCost: costo,
      totalAmount: costo.monto_decimal || 0,
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
        <PopoverContent className="w-48 p-1">
          <div className="space-y-1">
            <DialogTrigger asChild>
              <Button
                variant="ghost"
                className="w-full justify-start flex items-center gap-2"
              >
                <Pencil className="h-4 w-4" />
                Editar
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
              <MoreHorizontalIcon className="h-4 w-4" />
              Ver detalles
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar Costo</DialogTitle>
          <DialogDescription>Actualiza la información del costo</DialogDescription>
        </DialogHeader>
        {costo && <EditCostForm cost={costo} onClose={() => { }} />}
      </DialogContent>
    </Dialog>
  );
}
