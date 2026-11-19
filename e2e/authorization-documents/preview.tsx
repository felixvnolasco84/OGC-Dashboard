import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import PermisosYLegalTab from "../../src/pages/AutorizacionesObra/PermisosYLegalTab";
import PresupuestosContratosTab from "../../src/pages/AutorizacionesObra/PresupuestosContratosTab";
import ImssYSirocTab from "../../src/pages/AutorizacionesObra/ImssYSirocTab";
import "../../src/index.css";
import "../../src/responsive.css";

const tab = new URLSearchParams(location.search).get("tab") || "permisos";
createRoot(document.getElementById("root")!).render(<>
  <header className="border-b p-4 text-sm text-muted-foreground">P20 · Datos ficticios · Sin conexión al backend</header>
  <main className="mx-auto max-w-[1400px] px-4 py-4 sm:px-8">
    {tab === "permisos" ? <PermisosYLegalTab proyectoId="project-p20" /> : tab === "contratos" ? <PresupuestosContratosTab proyectoId="project-p20" /> : <ImssYSirocTab proyectoId="project-p20" />}
  </main>
  <Toaster />
</>);
