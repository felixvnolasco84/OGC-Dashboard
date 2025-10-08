import { Outlet } from "react-router";
import Sidebar from "./ui/Sidebar";
import { ModalProvider } from "./providers/modal-provider";

import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import { Toaster } from "sonner";

const queryClient = new QueryClient()
function WebsiteLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex h-screen bg-white">
        <Sidebar />
        <div className="flex-1 ml-64 flex flex-col">          
          <main className="flex-1 overflow-auto">
            <Outlet />
          </main>
        </div>
        <ModalProvider />
        <Toaster />
      </div>
    </QueryClientProvider>);
}

export default WebsiteLayout;
