import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import AddPaymentModal from "@/components/modals/add-payment-modal";
import { Button } from "@/components/ui/button";
import { useAddPaymentModal, type PartidaItem } from "@/hooks/add-payment-modal";
import type { Id } from "../../convex/_generated/dataModel";
import { recorded, useMutationCount } from "./convex-stub";
import "@/index.css";

const projectId = "fixture-project" as Id<"desarrollos">;
function start(mode: "empty" | "direct" | "multi" | "incomplete") {
  useAddPaymentModal.getState().onOpen({ projectId });
  if (mode === "empty") return;
  const direct: PartidaItem = {
    id: "direct-part", partida: "OBRA", isExpanded: true,
    familias: [{ id: "direct-family", familia: "CONCRETO", partida_id: "direct" as Id<"partidas">,
      monto: 100.25, isExpanded: true, subPartidas: [] }],
  };
  const nested: PartidaItem = {
    id: "nested-part", partida: "OBRA", isExpanded: true,
    familias: [{ id: "nested-family", familia: "ACERO", isExpanded: true, subPartidas: [{
      id: "nested-sub", partida_id: "leaf" as Id<"partidas">, sub_partida: "VARILLA", monto: mode === "incomplete" ? 0 : 200.50,
    }] }],
  };
  useAddPaymentModal.setState({ partidas: mode === "direct" ? [direct] : [direct, nested] });
}

function Preview() {
  const count = useMutationCount();
  return <main className="min-h-screen bg-background p-6 text-foreground">
    <h1 className="text-xl font-semibold">P04 · Registrar pagos</h1>
    <p className="my-4 text-sm text-muted-foreground">Componente real; consultas, pagos y adjuntos simulados localmente.</p>
    <div className="flex flex-wrap gap-2">
      <Button onClick={() => start("empty")}>Abrir vacío</Button>
      <Button onClick={() => start("direct")}>Pago directo a familia</Button>
      <Button onClick={() => start("multi")}>Varias partidas</Button>
      <Button onClick={() => start("incomplete")}>Concepto incompleto</Button>
    </div>
    <output className="mt-4 block" data-testid="mock-mutations">Mutaciones simuladas: {count}</output>
    <pre data-testid="mock-payload" className="mt-4 whitespace-pre-wrap break-all text-xs">{JSON.stringify(recorded, null, 2)}</pre>
    <AddPaymentModal /><Toaster />
  </main>;
}
createRoot(document.getElementById("root")!).render(<Preview />);
