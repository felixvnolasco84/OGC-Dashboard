export function hasProviderManagementAccess(user?: { role: string } | null): boolean {
  return user?.role === "admin";
}

export function assertProviderManagementRole(user?: { role: string } | null) {
  if (!hasProviderManagementAccess(user)) {
    throw new Error("Solo admin puede gestionar proveedores.");
  }
}
