import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useParams } from "react-router";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useConvexAuth } from "convex/react";
import { Id } from "../../../convex/_generated/dataModel";

interface ProtectedRouteProps {
  children: ReactNode;
  requiredRole?: "admin" | "user" | "viewer" | "contratista" | "finance";
  redirectTo?: string;
}

export default function ProtectedRoute({ 
  children, 
  requiredRole = "viewer",
  redirectTo = "/sign-in" 
}: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const currentUser = useQuery(api.users.getCurrentUser);

  // Detect project/sales project routes from URL params
  const { proyectoId, salesProyectoId } = useParams<{
    proyectoId?: string;
    salesProyectoId?: string;
  }>();

  // Check access to regular proyectos when applicable
  const hasDesarrolloAccess = useQuery(
    api.users.hasAccessToDesarrollo,
    proyectoId ? { desarrolloId: proyectoId as Id<"desarrollos"> } : "skip"
  );

  // Check access to sales projects when applicable
  const hasSalesProjectAccess = useQuery(
    api.users.hasAccessToSalesProject,
    salesProyectoId ? { salesProyectoId: salesProyectoId as Id<"sales_projects"> } : "skip"
  );

  const isProjectRoute = !!proyectoId || !!salesProyectoId;
  const isProjectAccessLoading =
    (!!proyectoId && hasDesarrolloAccess === undefined) ||
    (!!salesProyectoId && hasSalesProjectAccess === undefined);

  // Show loading state while checking authentication and project access
  if (
    isLoading ||
    (isAuthenticated && currentUser === undefined) ||
    (isAuthenticated && isProjectRoute && isProjectAccessLoading)
  ) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4"></div>
          <p className="text-gray-500">Verificando permisos...</p>
        </div>
      </div>
    );
  }

  // Redirect if not authenticated
  if (!isAuthenticated) {
    return <Navigate to={redirectTo} replace />;
  }

  // Redirect if user doesn't have required role
  if (currentUser && !hasRequiredRole(currentUser.role, requiredRole)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center max-w-md px-4">
          <div className="text-6xl mb-4">🔒</div>
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">
            Acceso Denegado
          </h1>
          <p className="text-gray-600 mb-6">
            No tienes permisos para acceder a esta página.
          </p>
          <a
            href="/proyectos"
            className="inline-block px-6 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
          >
            Volver al Inicio
          </a>
        </div>
      </div>
    );
  }

  // Project-level access checks are enforced for every role. Global admins pass
  // through the Convex permission helpers; organization admins are scoped.
  if (currentUser) {
    // Regular proyectos
    if (proyectoId && hasDesarrolloAccess === false) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-white">
          <div className="text-center max-w-md px-4">
            <div className="text-6xl mb-4">🔒</div>
            <h1 className="text-2xl font-semibold text-gray-900 mb-2">
              Acceso Denegado
            </h1>
            <p className="text-gray-600 mb-6">
              No tienes permisos para acceder a esta página.
            </p>
            <a
              href="/proyectos"
              className="inline-block px-6 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
            >
              Volver al Inicio
            </a>
          </div>
        </div>
      );
    }

    // Sales proyectos
    if (salesProyectoId && hasSalesProjectAccess === false) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-white">
          <div className="text-center max-w-md px-4">
            <div className="text-6xl mb-4">🔒</div>
            <h1 className="text-2xl font-semibold text-gray-900 mb-2">
              Acceso Denegado
            </h1>
            <p className="text-gray-600 mb-6">
              No tienes permisos para acceder a esta página.
            </p>
            <a
              href="/sales-proyectos"
              className="inline-block px-6 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
            >
              Volver al Inicio
            </a>
          </div>
        </div>
      );
    }
  }

  return <>{children}</>;
}

// Role hierarchy: admin > user > finance > viewer > contratista
function hasRequiredRole(
  userRole: string,
  requiredRole: "admin" | "user" | "viewer" | "contratista" | "finance"
): boolean {
  const roleHierarchy: Record<string, number> = {
    admin: 5,
    user: 4,
    finance: 3,
    viewer: 2,
    contratista: 1,
  };

  const userLevel = roleHierarchy[userRole] || 0;
  const requiredLevel = roleHierarchy[requiredRole] || 0;

  return userLevel >= requiredLevel;
}
