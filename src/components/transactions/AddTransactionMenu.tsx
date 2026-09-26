import { useState } from "react";
import { CreditCard, FileSpreadsheet, Plus, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function AddTransactionMenu({
  visible = true,
  onAddPayment,
  onUploadExcel,
  onUploadInvoice,
}: {
  visible?: boolean;
  onAddPayment: () => void;
  onUploadExcel: () => void;
  onUploadInvoice: () => void;
}) {
  const [open, setOpen] = useState(false);

  const runAfterClose = (action: () => void) => {
    setOpen(false);
    window.setTimeout(action, 100);
  };

  if (!visible) return null;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
        >
          Agregar
          <Plus className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        variant="transactionMenu"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <DropdownMenuItem
          variant="transactionAction"
          onSelect={() => runAfterClose(onAddPayment)}
        >
          <CreditCard className="mt-0.5" />
          <span className="flex min-w-0 flex-col">
            <span>Agregar pago</span>
            <span className="text-xs font-normal text-muted-foreground">
              Registrar una transacción manual
            </span>
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="transactionAction"
          onSelect={() => runAfterClose(onUploadExcel)}
        >
          <FileSpreadsheet className="mt-0.5" />
          <span className="flex min-w-0 flex-col">
            <span>Subir Excel</span>
            <span className="text-xs font-normal text-muted-foreground">
              Importar varias transacciones desde un archivo
            </span>
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="transactionAction"
          onSelect={() => runAfterClose(onUploadInvoice)}
        >
          <Receipt className="mt-0.5" />
          <span className="flex min-w-0 flex-col">
            <span>Cargar factura</span>
            <span className="text-xs font-normal text-muted-foreground">
              Extraer conceptos de un CFDI y clasificarlos
            </span>
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
