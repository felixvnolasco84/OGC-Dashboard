export function normalizePaymentMethod(value: string): "transferencia" | "cheque" | null {
  const normalized = value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (normalized.includes("transferencia") || normalized === "spei" || normalized === "traspaso") return "transferencia";
  if (normalized.includes("cheque")) return "cheque";
  return null;
}

export function normalizeBank(value?: string) {
  return (value || "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ").toUpperCase();
}

export function normalizeAccountNumber(value?: string) {
  return (value || "").replace(/[\s\u00a0\u202f-]/g, "");
}

export function isValidAccount(value?: string) {
  return /^\d{8,20}$/.test(normalizeAccountNumber(value));
}

export function isValidClabe(value?: string) {
  return /^\d{18}$/.test(normalizeAccountNumber(value));
}

export function accountIdentity(bank?: string, account?: string, clabe?: string) {
  const normalizedBank = normalizeBank(bank);
  const normalizedAccount = normalizeAccountNumber(account);
  const normalizedClabe = normalizeAccountNumber(clabe);
  if (!normalizedBank) return null;
  if (isValidAccount(normalizedAccount)) return `${normalizedBank}|account:${normalizedAccount}`;
  if (isValidClabe(normalizedClabe)) return `${normalizedBank}|clabe:${normalizedClabe}`;
  return null;
}

export function historicalAccountIssue(bank?: string, account?: string, clabe?: string) {
  if (!normalizeBank(bank)) return "datos_incompletos";
  const number = normalizeAccountNumber(account);
  const clabeNumber = normalizeAccountNumber(clabe);
  if ((number && !isValidAccount(number)) || (clabeNumber && !isValidClabe(clabeNumber))) {
    return "datos_incompletos";
  }
  return accountIdentity(bank, number, clabeNumber) ? null : "datos_incompletos";
}

export function accountMatchesSnapshot(
  account: { banco: string; numero_cuenta?: string; clabe?: string },
  snapshot: { banco?: string; numero_cuenta?: string; clabe?: string },
) {
  if (normalizeBank(account.banco) !== normalizeBank(snapshot.banco)) return false;
  const number = normalizeAccountNumber(snapshot.numero_cuenta);
  const clabeNumber = normalizeAccountNumber(snapshot.clabe);
  return Boolean(accountIdentity(snapshot.banco, snapshot.numero_cuenta, snapshot.clabe)) &&
    (!number || number === normalizeAccountNumber(account.numero_cuenta)) &&
    (!clabeNumber || clabeNumber === normalizeAccountNumber(account.clabe));
}

export function accountsConflict(
  left: { numero_cuenta?: string; clabe?: string },
  right: { numero_cuenta?: string; clabe?: string },
) {
  const leftAccount = normalizeAccountNumber(left.numero_cuenta);
  const rightAccount = normalizeAccountNumber(right.numero_cuenta);
  const leftClabe = normalizeAccountNumber(left.clabe);
  const rightClabe = normalizeAccountNumber(right.clabe);
  return Boolean(
    (leftAccount && rightAccount && leftAccount !== rightAccount && leftClabe && leftClabe === rightClabe) ||
    (leftClabe && rightClabe && leftClabe !== rightClabe && leftAccount && leftAccount === rightAccount),
  );
}

export function maskAccount(value?: string) {
  const normalized = normalizeAccountNumber(value);
  return normalized ? `•••• ${normalized.slice(-4)}` : "";
}

export function paymentScopeKey(project: { _id: string; organization_id?: string }) {
  return project.organization_id ? `organization:${project.organization_id}` : `project:${project._id}`;
}
