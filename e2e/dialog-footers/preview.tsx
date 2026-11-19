import { useState } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import ProviderFormDialog, { type ProviderWithMeta } from "@/components/providers/ProviderFormDialog";
import { Button } from "@/components/ui/button";
import "@/index.css";

const editing = new URLSearchParams(location.search).has("edit");
const provider = { _id: "provider-test", razon_social: "Proveedor ficticio", tipo: "regular" } as ProviderWithMeta;
function Preview() {
  const [open, setOpen] = useState(false);
  return <main className="p-6 space-y-4">
    <h1>P23 · Proveedor con datos ficticios</h1>
    <Button onClick={() => setOpen(true)}>Abrir formulario</Button>
    <ProviderFormDialog open={open} onOpenChange={setOpen} provider={editing ? provider : undefined} />
    <Toaster />
  </main>;
}
createRoot(document.getElementById("root")!).render(<Preview />);
