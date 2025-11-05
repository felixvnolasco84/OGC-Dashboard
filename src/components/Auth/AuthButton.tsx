import { SignInButton, SignUpButton, UserButton, useUser } from "@clerk/clerk-react";
import { Button } from "../ui/button";
import { useConvexAuth } from "convex/react";
import { Loader2 } from "lucide-react";

export function AuthButton() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { user } = useUser();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm text-gray-600">Cargando...</span>
      </div>
    );
  }

  if (isAuthenticated && user) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-700">
          {user.firstName || user.emailAddresses[0]?.emailAddress}
        </span>
        <UserButton afterSignOutUrl="/" />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <SignInButton mode="modal">
        <Button variant="ghost">Iniciar Sesión</Button>
      </SignInButton>
      <SignUpButton mode="modal">
        <Button>Registrarse</Button>
      </SignUpButton>
    </div>
  );
}
