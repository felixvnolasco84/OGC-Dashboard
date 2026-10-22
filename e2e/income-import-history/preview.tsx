import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import IngresosModal from "@/components/modals/ingresos-modal";
import { useIngresosModal } from "@/hooks/ingresos-modal";
import { Button } from "@/components/ui/button";
import type { Id } from "../../convex/_generated/dataModel";
import "@/index.css";
function Preview() {
  const modal = useIngresosModal();
  return <main className="min-h-screen bg-background p-4 text-foreground sm:p-6"><h1 className="text-xl">Prueba local · respaldo de ingresos</h1><p className="mt-2 text-sm text-muted-foreground">Datos ficticios. Sin conexión con cuentas ni backend reales.</p><Button className="mt-5" onClick={() => modal.onOpen({ projectId: "project" as Id<"desarrollos">, projectName: "Obra de prueba · datos ficticios" })}>Abrir ingresos de prueba</Button><IngresosModal /><Toaster /></main>;
}
createRoot(document.getElementById("root")!).render(<Preview />);
