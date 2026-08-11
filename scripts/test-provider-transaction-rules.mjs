import assert from "node:assert/strict";
import {
  isGenericProviderName,
  isProviderComplete,
  normalizeProviderName,
  normalizeRfc,
} from "../convex/providerUtils.ts";
import {
  buildTransactionSignature,
  getParserValidationErrors,
  getProviderName,
  getProviderNames,
  validateTransactionTotals,
} from "../src/lib/transactionImport.ts";

assert.equal(
  normalizeProviderName("  Villagómez Jurado S.A. de C.V. "),
  normalizeProviderName("VILLAGOMEZ JURADO SA DE CV")
);
assert.equal(
  normalizeProviderName("Cortinas & Persianas, S.A."),
  normalizeProviderName("CORTINAS PERSIANAS SA")
);
assert.equal(normalizeRfc(" abc-010203-x9z "), "ABC010203X9Z");
assert.equal(isGenericProviderName("Dispersión"), true);
assert.equal(isGenericProviderName("EFECTIVO"), true);
assert.equal(isGenericProviderName("Proveedor real"), false);
assert.equal(isProviderComplete({ tipo: "regular", razon_social: "Proveedor", rfc: "" }), false);
assert.equal(isProviderComplete({ tipo: "regular", razon_social: "Proveedor", rfc: "ABC010203X9Z" }), true);
assert.equal(isProviderComplete({ tipo: "generico", razon_social: "VARIOS" }), true);

const baseTransaction = {
  transaction: {
    proyecto: "TORRE_I",
    monto_total: 150,
    fecha: 46192,
    tipo_pago: "TRANSFERENCIA",
    moneda: "MXN",
    tipo_cambio: "1",
    status: "Pagado",
    proveedor_nombre: "Ferretería Santana",
  },
  lineitems: [
    {
      partida_identifier: { partida: "A", familia: "B", subpartida: "C" },
      monto: 100,
    },
    {
      partida_identifier: { partida: "A", familia: "B", subpartida: "D" },
      monto: 50,
    },
  ],
  factura: "FAC-1.pdf",
};

assert.deepEqual(getProviderNames(baseTransaction), ["Ferretería Santana"]);
assert.equal(getProviderName(baseTransaction), "Ferretería Santana");
assert.equal(validateTransactionTotals(150, baseTransaction.lineitems).valid, true);
assert.equal(validateTransactionTotals(151, baseTransaction.lineitems).valid, false);

const mixedProviders = {
  ...baseTransaction,
  lineitems: baseTransaction.lineitems.map((item, index) => ({
    ...item,
    proveedor_nombre: index === 0 ? "Proveedor A" : "Proveedor B",
  })),
  transaction: { ...baseTransaction.transaction, proveedor_nombre: undefined },
};
assert.equal(getProviderNames(mixedProviders).length, 2);
assert.equal(getProviderName(mixedProviders), undefined);
assert.deepEqual(
  getParserValidationErrors({
    ...baseTransaction,
    validation_errors: [
      "Proveedor mezclado",
      { code: "DUPLICATE_ROW", message: "Filas exactamente duplicadas", row_numbers: [2, 3] },
    ],
  }),
  ["Proveedor mezclado", "Filas exactamente duplicadas"]
);

const signatureItems = baseTransaction.lineitems.map((item) => ({
  partida: item.partida_identifier.partida,
  familia: item.partida_identifier.familia,
  sub_partida: item.partida_identifier.subpartida,
  monto: item.monto,
}));
const firstSignature = await buildTransactionSignature(baseTransaction, signatureItems);
const reorderedSignature = await buildTransactionSignature(baseTransaction, [...signatureItems].reverse());
assert.equal(firstSignature, reorderedSignature);

const otherProviderSignature = await buildTransactionSignature(
  {
    ...baseTransaction,
    transaction: { ...baseTransaction.transaction, proveedor_nombre: "Otro proveedor" },
  },
  signatureItems
);
assert.notEqual(firstSignature, otherProviderSignature);

console.log("Provider and transaction import rules: OK");
