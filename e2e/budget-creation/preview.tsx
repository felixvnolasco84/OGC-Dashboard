import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { Toaster } from "sonner";
import AddProyectoModal from "@/components/modals/add-proyecto-modal";
import { BudgetOriginalDialog, BudgetRecordSource, BudgetCreationHistory } from "@/components/Presupuesto/BudgetOriginal";
import { useAddProyectoModal } from "@/hooks/add-proyecto-modal";
import { Button } from "@/components/ui/button";
import type { Id } from "../../convex/_generated/dataModel";
import "@/index.css";
function Preview() {
  const modal = useAddProyectoModal();
  const scenario = new URLSearchParams(location.search).get("case");
  return <MemoryRouter><main className="min-h-screen bg-card p-4 text-foreground sm:p-8"><div className="mx-auto max-w-4xl space-y-6">
    <header className="space-y-2 border-b border-border pb-6"><p className="text-sm text-muted-foreground">Prueba local · datos ficticios</p><h1 className="text-2xl">Presupuesto · Residencia del Parque</h1>
      <p className="text-sm text-muted-foreground">Respaldo del Excel usado al crear el proyecto de obra.</p></header>
    <div className="flex flex-wrap gap-3"><Button onClick={modal.onOpen}>Agregar proyecto de prueba</Button><BudgetOriginalDialog projectId={"project" as Id<"desarrollos">} /><BudgetOriginalDialog /></div>
    {scenario === "source" || scenario === "legacy" ? <BudgetRecordSource partidaId={"partida" as Id<"partidas">} />
      : <section className="space-y-3"><h2 className="text-base font-medium">Documentos · Excel del presupuesto inicial</h2><p className="text-sm text-muted-foreground">Original protegido de la creación del proyecto.</p><BudgetCreationHistory projectId={"project" as Id<"desarrollos">} /></section>}
    <AddProyectoModal /><Toaster /></div></main></MemoryRouter>;
}
createRoot(document.getElementById("root")!).render(<Preview />);
