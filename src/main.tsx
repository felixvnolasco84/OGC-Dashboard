import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import WebsiteLayout from "./components/WebsiteLayout.tsx";
import ScrollToTop from "./components/ui/ScrollToTop.tsx";
import { HelmetProvider } from "react-helmet-async";
import DynamicMeta from "./components/DynamicMeta.tsx";
import { BrowserRouter, Routes, Route } from "react-router";
import Legales from "./pages/Legales.tsx";
import AvisoPrivacidad from "./pages/AvisoPrivacidad.tsx";
import Dashboard from "./pages/Dashboard/Dashboard.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HelmetProvider>
      <BrowserRouter>
        <ScrollToTop />
        <DynamicMeta />
        <Routes>
          <Route element={<WebsiteLayout />}>
            <Route index element={<App />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/legal" element={<Legales />} />
            <Route path="/aviso-de-privacidad" element={<AvisoPrivacidad />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </HelmetProvider>
  </StrictMode>
);
