import { Outlet } from "react-router";
import Navbar from "./ui/Navbar";
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
      <div className="max-w-7xl mx-auto relative">
        <Navbar />
        <Outlet />
        <ModalProvider />
        {/* <Footer /> */}
        <Toaster />
      </div>
    </QueryClientProvider>);
}

export default WebsiteLayout;
