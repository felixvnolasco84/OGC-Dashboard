import { useAuth } from "@clerk/clerk-react";
import { useEffect, useState, type ReactNode } from "react";
import type { ConvexReactClient } from "convex/react";
import { findValidOfflineProfile } from "@/lib/bitacora-offline/db";
import type { OfflineProfile } from "@/lib/bitacora-offline/types";
import { OfflineBitacoraApp } from "@/pages/Bitacora/OfflineBitacoraApp";

/** Preserve the existing direct-entry fallback without selecting another account. */
export default function BitacoraOnlineStartup({ children, client, projectId, routePath }: {
  children: ReactNode;
  client: ConvexReactClient;
  projectId?: string;
  routePath?: string;
}) {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const [fallback, setFallback] = useState<OfflineProfile>();
  useEffect(() => {
    setFallback(undefined);
    if (!projectId || !routePath || !isLoaded || !isSignedIn || !userId) return;
    let active = true;
    let timer: number | undefined;
    const onRoute = () => window.location.pathname.replace(/\/$/, "") === routePath;
    const checkConnection = ({ isWebSocketConnected }: { isWebSocketConnected: boolean }) => {
      window.clearTimeout(timer);
      if (isWebSocketConnected) { setFallback(undefined); return; }
      timer = window.setTimeout(async () => {
        if (!active || !onRoute() || client.connectionState().isWebSocketConnected) return;
        const profile = await findValidOfflineProfile(projectId, Date.now(), userId).catch(() => undefined);
        if (active && onRoute() && !client.connectionState().isWebSocketConnected) setFallback(profile);
      }, 7000);
    };
    const unsubscribe = client.subscribeToConnectionState(checkConnection);
    checkConnection(client.connectionState());
    return () => { active = false; window.clearTimeout(timer); unsubscribe(); };
  }, [client, projectId, routePath, isLoaded, isSignedIn, userId]);
  if (projectId && routePath && isLoaded && isSignedIn && fallback?.clerkId === userId && window.location.pathname.replace(/\/$/, "") === routePath) {
    return <OfflineBitacoraApp projectId={projectId} profile={fallback} client={client} />;
  }
  return children;
}
