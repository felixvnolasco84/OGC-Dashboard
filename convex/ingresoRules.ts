export function hasIncomeManagementAccess(user?: { role: string } | null): boolean {
  return user?.role === "admin" || user?.role === "finance";
}

export function assertIncomeManagementRole(user: { role: string }) {
  if (!hasIncomeManagementAccess(user)) {
    throw new Error("Solo finance y admin pueden gestionar ingresos.");
  }
}
