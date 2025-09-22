import { Outlet } from "react-router";
import Navbar from "./ui/Navbar";
import Sidebar from "./ui/Sidebar";
// import Footer from "./ui/Footer";
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
        {/* Sidebar */}
        <Sidebar />
        
        {/* Main content area */}
        <div className="flex-1 ml-64 flex flex-col">
          {/* Navbar */}
          <Navbar />
          
          {/* Page content */}
          <main className="flex-1 overflow-auto">
            <Outlet />
          </main>
        </div>
        
        <ModalProvider />
        {/* <Footer /> */}
        <Toaster />
      </div>
    </QueryClientProvider>);
}

export default WebsiteLayout;
