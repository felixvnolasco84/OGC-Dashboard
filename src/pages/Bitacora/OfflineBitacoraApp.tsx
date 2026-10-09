import { CloudOff, ShieldAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import type { ConvexReactClient } from "convex/react";
import { Toaster } from "sonner";
import BitacoraModal from "@/components/Bitacora/BitacoraModal";
import { Button } from "@/components/ui/button";
import { OfflineBitacoraRepositoryProvider } from "@/lib/bitacora-offline/context";
import type { OfflineProfile } from "@/lib/bitacora-offline/types";
import BitacoraPage from "./BitacoraPage";

export function OfflineBitacoraApp({ projectId, profile, client }: { projectId: string; profile: OfflineProfile; client?: ConvexReactClient }) {
  const reloadRequested = useRef(false);
  useEffect(() => {
    const reconnect = () => {
      if (reloadRequested.current || !navigator.onLine || (client && !client.connectionState().isWebSocketConnected)) return;
      reloadRequested.current = true;
      window.location.reload();
    };
    window.addEventListener("online", reconnect);
    const unsubscribe = client?.subscribeToConnectionState((state) => {
      if (state.isWebSocketConnected && navigator.onLine) reconnect();
    });
    if (client?.connectionState().isWebSocketConnected && navigator.onLine) reconnect();
    return () => {
      window.removeEventListener("online", reconnect);
      unsubscribe?.();
    };
  }, [client]);
  return <BrowserRouter>
    <OfflineBitacoraRepositoryProvider projectId={projectId} profile={profile}>
      <Routes>
        <Route path={`/proyecto/${projectId}/bitacora`} element={<><BitacoraPage /><BitacoraModal /><Toaster /></>} />
        <Route path="*" element={<Navigate to={`/proyecto/${projectId}/bitacora`} replace />} />
      </Routes>
    </OfflineBitacoraRepositoryProvider>
  </BrowserRouter>;
}

export function OfflineAccessBlocked({ expired = false, reason = expired ? "expired" : "module" }: { expired?: boolean; reason?: "expired" | "missing" | "storage" | "module" }) {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update); window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  const title = reason === "expired" ? "La preparación de Bitácora venció" : reason === "storage" ? "No se pudo abrir la información local" : reason === "missing" ? "Bitácora aún no está preparada" : "Se requiere conexión";
  const message = reason === "expired" ? "Conéctate para validar tu sesión y volver a abrir Bitácora. Los cambios locales se conservan."
    : reason === "storage" ? "Comprueba que el navegador permita guardar datos y que haya espacio disponible. Los cambios locales no se borraron."
      : reason === "missing" ? "La primera carga debe completarse con conexión y una sesión válida en este dispositivo." : "Este módulo requiere conexión.";
  return <main className="flex min-h-screen items-center justify-center bg-background p-6 text-center">
    <div className="max-w-md border border-border bg-card p-8">
      {reason === "expired" || reason === "storage" ? <ShieldAlert aria-hidden="true" className="mx-auto h-10 w-10 text-destructive" /> : <CloudOff aria-hidden="true" className="mx-auto h-10 w-10 text-muted-foreground" />}
      <h1 className="mt-4 text-xl font-medium">{title}</h1>
      <p role="status" className="mt-2 text-sm text-muted-foreground">{message}</p>
      <div className="mt-5"><Button disabled={!online && reason !== "storage"} onClick={() => window.location.reload()}>{reason === "storage" ? "Volver a comprobar" : "Comprobar conexión"}</Button></div>
    </div>
  </main>;
}
