import { useMemo } from "react";

type RfiDirectoryUser = {
  _id: string;
  name: string;
  email: string;
};

function resolveStoredIdentity<T extends RfiDirectoryUser>(user: T) {
  const storedName = user.name.trim();
  const storedEmail = user.email.trim();
  const validName =
    storedName &&
    storedName !== "Usuario" &&
    storedName !== storedEmail &&
    !storedName.endsWith("@pending.invalid")
      ? storedName
      : "";
  const validEmail =
    storedEmail && !storedEmail.endsWith("@pending.invalid")
      ? storedEmail
      : "";
  const email = validEmail || "Correo no disponible";
  const name =
    validName ||
    (validEmail ? validEmail.split("@")[0] : "Usuario sin nombre");

  return { ...user, name, email };
}

export function useRfiUserDirectory<T extends RfiDirectoryUser>(
  users: readonly T[] | undefined,
) {
  const resolvedUsers = useMemo(
    () => (users ?? []).map(resolveStoredIdentity),
    [users],
  );

  const usersById = useMemo(
    () => new Map(resolvedUsers.map((user) => [user._id, user] as const)),
    [resolvedUsers],
  );

  return { users: resolvedUsers, usersById };
}
