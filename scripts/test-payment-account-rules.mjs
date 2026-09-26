import assert from "node:assert/strict";
import {
  accountIdentity, accountMatchesSnapshot, accountsConflict, historicalAccountIssue,
  normalizeAccountNumber, normalizeBank, normalizePaymentMethod, paymentScopeKey,
} from "../convex/paymentAccountRules.ts";

assert.equal(normalizePaymentMethod("Transferencia Bancaria"), "transferencia");
assert.equal(normalizePaymentMethod("SPEI"), "transferencia");
assert.equal(normalizePaymentMethod("CHEQUE"), "cheque");
assert.equal(normalizePaymentMethod("Tarjeta"), null);
assert.equal(normalizeBank("  Bánco   Uno "), "BANCO UNO");
assert.equal(normalizeAccountNumber(" 00-1234 5678 "), "0012345678");
assert.equal(accountIdentity("Banco Uno", "00-1234 5678"), "BANCO UNO|account:0012345678");
assert.equal(accountIdentity("Banco Uno", undefined, "012345678901234567"), "BANCO UNO|clabe:012345678901234567");
assert.equal(historicalAccountIssue("Banco Uno", "123"), "datos_incompletos");
assert.equal(historicalAccountIssue("Banco Uno", "0012345678", "123"), "datos_incompletos");
assert.equal(historicalAccountIssue("Banco Uno", "0012345678"), null);
assert.equal(accountsConflict(
  { numero_cuenta: "0012345678", clabe: "012345678901234567" },
  { numero_cuenta: "0012345678", clabe: "112345678901234567" },
), true);
assert.equal(accountMatchesSnapshot(
  { banco: "BANCO UNO", numero_cuenta: "0012345678", clabe: "012345678901234567" },
  { banco: "Bánco Uno", numero_cuenta: "00-1234 5678", clabe: "112345678901234567" },
), false);
assert.equal(accountMatchesSnapshot(
  { banco: "BANCO UNO", numero_cuenta: "0012345678", clabe: "012345678901234567" },
  { banco: "Bánco Uno", numero_cuenta: "00-1234 5678" },
), true);
assert.equal(paymentScopeKey({ _id: "project-a", organization_id: "org-a" }), "organization:org-a");
assert.equal(paymentScopeKey({ _id: "project-b", organization_id: "org-a" }), "organization:org-a");
assert.notEqual(paymentScopeKey({ _id: "project-a" }), paymentScopeKey({ _id: "project-b" }));

console.log("Payment account rules passed");
