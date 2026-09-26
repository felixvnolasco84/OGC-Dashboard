import assert from "node:assert/strict";
import { buildPaymentDraft } from "../src/lib/payment-draft.ts";
import { parseMoneyInput, sumMoney } from "../src/lib/money.ts";

const sub = (overrides = {}) => ({ id: "sub", partida_id: "", sub_partida: "", monto: 0, ...overrides });
const family = (overrides = {}) => ({
  id: "family", familia: "", partida_id: "", monto: 0, isExpanded: true,
  subPartidas: [sub()], ...overrides,
});
const part = (overrides = {}) => ({
  id: "part", partida: "Obra", isExpanded: true,
  familias: [family()], ...overrides,
});

const direct = buildPaymentDraft([
  part({ familias: [family({ familia: "Cimentación", partida_id: "family-id", monto: 100.25 })] }),
], () => false);
assert.equal(direct.incompleteCount, 0);
assert.deepEqual(direct.lineItems.map((item) => [item.sub_partida, item.monto]), [["", 100.25]]);
assert.equal(buildPaymentDraft([
  part({ familias: [family({ familia: "Cimentación", partida_id: "family-id" })] }),
], () => false).incompleteCount, 1);

const partial = buildPaymentDraft([
  part({ familias: [family({
    familia: "Acero",
    subPartidas: [
      sub({ id: "a", sub_partida: "Varilla", partida_id: "sub-id", monto: 80 }),
      sub({ id: "b", sub_partida: "Malla", partida_id: "sub-id-2", monto: 0 }),
      sub({ id: "c" }),
    ],
  })] }),
], () => true);
assert.equal(partial.lineItems.length, 1);
assert.equal(partial.incompleteCount, 1, "a selected sub-item without an amount must block submission");

assert.equal(buildPaymentDraft([part()], () => false).incompleteCount, 1);
assert.equal(buildPaymentDraft([part({ partida: "" })], () => false).incompleteCount, 0);
assert.equal(sumMoney([0.1, 0.2, 1.005], "MXN"), 1.31);
assert.equal(parseMoneyInput("$1,234.50", "MXN"), 1234.5);
assert.equal(parseMoneyInput("1234,50", "MXN"), 1234.5);
assert.equal(parseMoneyInput("1.234,56 €", "EUR", "de-DE"), 1234.56);
assert.equal(parseMoneyInput("12abc", "MXN"), null);

console.log("Payment draft and money rules OK");
