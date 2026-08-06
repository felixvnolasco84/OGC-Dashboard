import { useState } from "react";
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
import { Sparkles } from "lucide-react";
import type { Id } from "../../convex/_generated/dataModel";

const queryClient = new QueryClient()
function WebsiteLayout() {
  const currentUser = useQuery(api.users.getCurrentUser);
  const isViewer = currentUser?.role === "viewer";
  const isAdmin = currentUser?.role === "admin";
  const [assistantOpen, setAssistantOpen] = useState(false);
  const location = useLocation();
  const routeProjectId = location.pathname.match(/^\/proyecto\/([^/]+)/)?.[1] as
    | Id<"desarrollos">
    | undefined;

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <StoreUserEffect />
        <SidebarProvider className="bg-white overflow-x-hidden">
          <AppSidebar />
          <main className="flex-1 h-screen overflow-auto">
            <div className="sticky top-0 z-10 flex h-10 items-center justify-between border-b border-gray-200 bg-white px-2">
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
              <Outlet />
            </div>
          </main>
          <ModalProvider />
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
    </QueryClientProvider>);
}

export default WebsiteLayout;
