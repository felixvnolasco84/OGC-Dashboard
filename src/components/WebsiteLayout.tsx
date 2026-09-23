import { useEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router";
import AppSidebar from "./ui/SidebarComponent";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { StoreUserEffect } from "./Auth/StoreUserEffect";
import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import { Toaster } from "sonner";
import { ModalProvider } from "./providers/modal-provider";
import { TooltipProvider } from "./ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "./ui/Sidebar";
import MentionNotificationCenter from "@/pages/Planos/MentionNotificationCenter";
import ProjectAssistantPanel from "./assistant/ProjectAssistantPanel";
import { Button } from "./ui/button";
import { Sparkles, WifiOff } from "lucide-react";
import type { Id } from "../../convex/_generated/dataModel";
import { OnlineBitacoraRepositoryProvider } from "@/lib/bitacora-offline/context";

const queryClient = new QueryClient()
function WebsiteLayout() {
  const currentUser = useQuery(api.users.getCurrentUser);
  const isViewer = currentUser?.role === "viewer";
  const isAdmin = currentUser?.role === "admin";
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const location = useLocation();
  const mainScrollRef = useRef<HTMLElement>(null);
  const routeProjectId = location.pathname.match(/^\/proyecto\/([^/]+)/)?.[1] as
    | Id<"desarrollos">
    | undefined;
  const isBitacoraRoute = Boolean(routeProjectId && location.pathname === `/proyecto/${routeProjectId}/bitacora`);

  useEffect(() => {
    mainScrollRef.current?.scrollTo({ top: 0, left: 0 });
  }, [location.pathname]);

  useEffect(() => {
    const online = () => setIsOnline(true);
    const offline = () => setIsOnline(false);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, []);

  const content = (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <StoreUserEffect />
        <SidebarProvider className="bg-card overflow-x-hidden">
          <AppSidebar />
          <main ref={mainScrollRef} data-dashboard-scroll="true" className="h-svh min-w-0 flex-1 overflow-auto overscroll-contain">
            <div className="sticky top-0 z-10 flex h-10 items-center justify-between border-b border-border bg-card px-2">
              <SidebarTrigger />
              <div className="flex items-center gap-1">
                {isAdmin && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setAssistantOpen(true)}
                    aria-label="Abrir asistente de proyectos"
                    title="Asistente de proyectos"
                  >
                    <Sparkles className="h-4 w-4" />
                  </Button>
                )}
                {currentUser && <MentionNotificationCenter iconOnly />}
              </div>
            </div>
            <div data-viewer-readonly={isViewer ? "true" : undefined}>
              {!isOnline && !isBitacoraRoute ? (
                <div className="flex min-h-[70vh] flex-col items-center justify-center gap-3 p-8 text-center">
                  <WifiOff className="h-10 w-10 text-muted-foreground" />
                  <h1 className="text-xl font-medium">Este módulo requiere conexión</h1>
                  <p className="max-w-md text-sm text-muted-foreground">Por ahora, sólo Bitácora está disponible sin internet.</p>
                </div>
              ) : <Outlet />}
            </div>
          </main>
          <ModalProvider includeBitacora={isBitacoraRoute} />
          {isAdmin && (
            <ProjectAssistantPanel
              open={assistantOpen}
              onOpenChange={setAssistantOpen}
              routeProjectId={routeProjectId}
            />
          )}
          <Toaster />
        </SidebarProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );

  if (isBitacoraRoute && routeProjectId) {
    return (
      <OnlineBitacoraRepositoryProvider projectId={routeProjectId} currentUser={currentUser}>
        {content}
      </OnlineBitacoraRepositoryProvider>
    );
  }

  return content;
}

export default WebsiteLayout;
