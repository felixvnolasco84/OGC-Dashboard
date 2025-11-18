import { Outlet } from "react-router";
import Sidebar from "./ui/Sidebar";

import { StoreUserEffect } from "./Auth/StoreUserEffect";

import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import { Toaster } from "sonner";
import { ModalProvider } from "./providers/modal-provider";

const queryClient = new QueryClient()
function WebsiteLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <StoreUserEffect />
      <div className="flex h-screen bg-white overflow-x-hidden">
        <Sidebar />
        <main className="flex-1 ml-64 h-screen overflow-auto">
          <Outlet />
        </main>

        <ModalProvider />
        <Toaster />
      </div>
    </QueryClientProvider>);
}

export default WebsiteLayout;
