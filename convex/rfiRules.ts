export type RfiPermissionUser = {
  _id: string;
  role: string;
};

export type RfiPermissionTarget = {
  creator_id: string;
  rfi_manager_id?: string;
  status: string;
};

export function canDeleteRfi(
  user: RfiPermissionUser,
  rfi: RfiPermissionTarget,
): boolean {
  return (
    rfi.status === "draft" &&
    (user.role === "admin" || rfi.creator_id === user._id)
  );
}

export function canEditRfi(
  user: RfiPermissionUser,
  rfi: RfiPermissionTarget,
): boolean {
  if (rfi.status === "draft") {
    return user.role === "admin" || rfi.creator_id === user._id;
  }
  if (rfi.status === "pending_manager_review") {
    return (
      user.role === "admin" ||
      rfi.creator_id === user._id ||
      (user.role === "user" && rfi.rfi_manager_id === user._id)
    );
  }
  return false;
}

export function nextRfiNumber(
  existingNumbers: readonly number[],
  reservedLastNumber?: number,
): number {
  const highestExisting = existingNumbers.reduce(
    (highest, number) => Math.max(highest, number),
    0,
  );
  return Math.max(highestExisting, reservedLastNumber ?? 0) + 1;
}
