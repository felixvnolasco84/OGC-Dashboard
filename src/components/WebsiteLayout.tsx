import { Outlet } from "react-router";
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

const queryClient = new QueryClient()
function WebsiteLayout() {
  const currentUser = useQuery(api.users.getCurrentUser);
  const isViewer = currentUser?.role === "viewer";

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <StoreUserEffect />
        <SidebarProvider className="bg-white overflow-x-hidden">
          <AppSidebar />
          <main className="flex-1 h-screen overflow-auto">
            <div className="sticky top-0 z-10 flex items-center h-10 px-2 bg-white border-b border-gray-200">
              <SidebarTrigger />
            </div>
            <div data-viewer-readonly={isViewer ? "true" : undefined}>
              <Outlet />
            </div>
          </main>
          <ModalProvider />
          <Toaster />
        </SidebarProvider>
      </TooltipProvider>
    </QueryClientProvider>);
}

export default WebsiteLayout;
