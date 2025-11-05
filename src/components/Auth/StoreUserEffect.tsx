import { useEffect } from "react";
import { useConvexAuth, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";

/**
 * Component that stores the authenticated user in Convex database
 * Should be rendered once when the app loads
 */
export function StoreUserEffect() {
  const { isAuthenticated } = useConvexAuth();
  const storeUser = useMutation(api.users.storeUser);

  useEffect(() => {
    if (isAuthenticated) {
      // Store or update user in database
      storeUser().catch((error) => {
        console.error("Failed to store user:", error);
      });
    }
  }, [isAuthenticated, storeUser]);

  return null;
}
