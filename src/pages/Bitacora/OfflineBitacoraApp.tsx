import { CloudOff, ShieldAlert } from "lucide-react";
import { useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { Toaster } from "sonner";
import BitacoraModal from "@/components/Bitacora/BitacoraModal";
import { Button } from "@/components/ui/button";
import { OfflineBitacoraRepositoryProvider } from "@/lib/bitacora-offline/context";
import type { OfflineProfile } from "@/lib/bitacora-offline/types";
import BitacoraPage from "./BitacoraPage";

export function OfflineBitacoraApp({ projectId, profile }: { projectId: string; profile: OfflineProfile }) {
  useEffect(() => {
    const reconnect = () => window.location.reload();
    window.addEventListener("online", reconnect);
    return () => window.removeEventListener("online", reconnect);
  }, []);
  return <BrowserRouter>
    <OfflineBitacoraRepositoryProvider projectId={projectId} profile={profile}>
      <Routes>
        <Route path={`/proyecto/${projectId}/bitacora`} element={<><BitacoraPage /><BitacoraModal /><Toaster /></>} />
        <Route path="*" element={<Navigate to={`/proyecto/${projectId}/bitacora`} replace />} />
      </Routes>
    </OfflineBitacoraRepositoryProvider>
  </BrowserRouter>;
}

export function OfflineAccessBlocked({ expired = false }: { expired?: boolean }) {
  return <main className="flex min-h-screen items-center justify-center bg-background p-6 text-center">
    <div className="max-w-md border border-border bg-card p-8">
      {expired ? <ShieldAlert className="mx-auto h-10 w-10 text-amber-700" /> : <CloudOff className="mx-auto h-10 w-10 text-muted-foreground" />}
      <h1 className="mt-4 text-xl font-medium">Se requiere conexión</h1>
      <p className="mt-2 text-sm text-muted-foreground">{expired ? "No hay una preparación offline vigente para este proyecto. Puede no haberse completado o haber vencido después de siete días. Reconecta para validar tu sesión; los cambios locales no se borraron." : "Este módulo requiere conexión."}</p>
      <Button className="mt-5" onClick={() => window.location.reload()}>Reintentar conexión</Button>
    </div>
  </main>;
}
