import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useConvexAuth } from "convex/react";

interface ProtectedRouteProps {
  children: ReactNode;
  requiredRole?: "admin" | "user" | "viewer";
  redirectTo?: string;
}

export default function ProtectedRoute({ 
  children, 
  requiredRole = "viewer",
  redirectTo = "/sign-in" 
}: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const currentUser = useQuery(api.users.getCurrentUser);

  // Show loading state while checking authentication
  if (isLoading || (isAuthenticated && currentUser === undefined)) {
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

  return <>{children}</>;
}

// Role hierarchy: admin > user > viewer
function hasRequiredRole(
  userRole: string,
  requiredRole: "admin" | "user" | "viewer"
): boolean {
  const roleHierarchy: Record<string, number> = {
    admin: 3,
    user: 2,
    viewer: 1,
  };

  const userLevel = roleHierarchy[userRole] || 0;
  const requiredLevel = roleHierarchy[requiredRole] || 0;

  return userLevel >= requiredLevel;
}
