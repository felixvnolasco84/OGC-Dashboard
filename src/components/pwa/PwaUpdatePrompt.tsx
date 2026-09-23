import { useRegisterSW } from "virtual:pwa-register/react";
import { RefreshCw, X } from "lucide-react";
import { bitacoraDb } from "@/lib/bitacora-offline/db";
import { useBitacoraModal } from "@/hooks/use-bitacora-modal";
import { Button } from "@/components/ui/button";

export default function PwaUpdatePrompt() {
  const modalOpen = useBitacoraModal((state) => state.isOpen);
  const { needRefresh: [needRefresh, setNeedRefresh], updateServiceWorker } = useRegisterSW();
  if (!needRefresh) return null;

  const update = async () => {
    const pending = await bitacoraDb.outbox.count();
    if ((modalOpen || pending > 0) && !window.confirm("Hay un formulario abierto u operaciones pendientes. Los datos ya guardados se conservarán, pero conviene sincronizar antes de actualizar. ¿Continuar?")) return;
    await updateServiceWorker(true);
  };

  return <aside className="fixed bottom-4 right-4 z-[100] max-w-sm border border-border bg-card p-4 shadow-xl" role="status">
    <p className="font-medium">Actualización disponible</p>
    <p className="mt-1 text-sm text-muted-foreground">Tú decides cuándo recargar la PWA.</p>
    <div className="mt-3 flex justify-end gap-2"><Button size="sm" variant="ghost" onClick={() => setNeedRefresh(false)}><X className="mr-1 h-4 w-4" />Después</Button><Button size="sm" onClick={() => void update()}><RefreshCw className="mr-1 h-4 w-4" />Actualizar</Button></div>
  </aside>;
}
