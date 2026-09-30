import { useQuery } from "convex/react";
import { Navigate } from "react-router";
import { api } from "../../../convex/_generated/api";
import ProyectosTablePage from "@/pages/ProyectosTable/ProyectosTablePage";

export default function RoleHomePage() {
  const currentUser = useQuery(api.users.getCurrentUser);
  if (currentUser?.role === "almacenista") {
    const projectId = currentUser.allowed_desarrollos[0];
    return projectId
      ? <Navigate to={`/proyecto/${projectId}/requisiciones`} replace />
      : <p className="p-8 text-muted-foreground">No tienes proyectos asignados. Solicita acceso a un administrador.</p>;
  }
  return <ProyectosTablePage />;
}
