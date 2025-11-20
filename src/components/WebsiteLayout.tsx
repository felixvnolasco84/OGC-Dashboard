import { Outlet } from "react-router";
import Sidebar from "./ui/Sidebar";

import { StoreUserEffect } from "./Auth/StoreUserEffect";

import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import { Toaster } from "sonner";
import { ModalProvider } from "./providers/modal-provider";
import { useConvexAuth } from "convex/react";

const queryClient = new QueryClient()
function WebsiteLayout() {
  const { isAuthenticated, isLoading } = useConvexAuth();

  return (
    <QueryClientProvider client={queryClient}>
      <StoreUserEffect />
      <div className="flex h-screen bg-white overflow-x-hidden">
        <Sidebar />
        <main className={`flex-1 h-screen overflow-auto ${isAuthenticated && !isLoading ? 'ml-64' : ''}`}>
          <Outlet />
        </main>

        <ModalProvider />
        <Toaster />
      </div>
    </QueryClientProvider>);
}

export default WebsiteLayout;
