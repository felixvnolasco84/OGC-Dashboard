import assert from "node:assert/strict";
import {
  buildProviderMatchIndex,
  classifyProviderImportAction,
  classifyProviderMatch,
  classifyTransactionProviderMatch,
  isGenericProviderName,
  isProviderComplete,
  normalizeProviderName,
  normalizeRfc,
} from "../convex/providerUtils.ts";
import {
  classifyProjectMatch,
  normalizeProjectName,
  projectNameMatchMode,
} from "../convex/projectMatchUtils.ts";
import {
  buildTransactionSignature,
  getParserValidationErrors,
  getProviderName,
  getProviderNames,
  validateTransactionTotals,
} from "../src/lib/transactionImport.ts";
import {
  PROVIDER_BACKFILL_PREVIEW_BATCH_SIZE,
  PROVIDER_BACKFILL_SYNC_BATCH_SIZE,
  ProviderBackfillImportValidationError,
  chunkProviderBackfillCandidates,
  parseProviderBackfillRows,
} from "../src/lib/providerBackfillImport.ts";

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

const providerMatchIndex = buildProviderMatchIndex([
  { _id: "active", razon_social: "Ferretería Santana" },
  { _id: "archived", razon_social: "Proveedor archivado", archived_at: 1 },
  { _id: "duplicate-a", razon_social: "Proveedor duplicado" },
  { _id: "duplicate-b", razon_social: "PROVEEDOR. DUPLICADO" },
  { _id: "merged", razon_social: "Proveedor fusionado", merged_into: "active" },
]);

const activeMatch = classifyProviderMatch(" FERRETERIA   SANTANA ", providerMatchIndex);
assert.equal(activeMatch.status, "matched");
assert.equal(activeMatch.provider?._id, "active");
assert.equal(
  classifyProviderImportAction("FERRETERÍA SANTANA", providerMatchIndex).action,
  "reuse",
);
assert.equal(
  classifyProviderImportAction("Proveedor nuevo", providerMatchIndex).action,
  "create",
);
assert.equal(
  classifyProviderImportAction("Proveedor archivado", providerMatchIndex).action,
  "blocked_archived",
);
assert.equal(
  classifyProviderImportAction("Proveedor duplicado", providerMatchIndex).action,
  "blocked_conflict",
);
assert.equal(classifyProviderMatch("Proveedor archivado", providerMatchIndex).status, "archived");
assert.equal(classifyProviderMatch("Proveedor duplicado", providerMatchIndex).status, "conflict");
assert.equal(classifyProviderMatch("Proveedor inexistente", providerMatchIndex).status, "unmatched");
assert.equal(classifyProviderMatch("Proveedor fusionado", providerMatchIndex).status, "unmatched");

const assignedMatch = classifyTransactionProviderMatch(
  "Otro nombre",
  "active",
  providerMatchIndex,
);
assert.equal(assignedMatch.status, "already_assigned");
assert.equal(assignedMatch.provider, undefined);
assert.equal(
  classifyTransactionProviderMatch(undefined, undefined, providerMatchIndex).status,
  "missing_name",
);
assert.equal(
  classifyTransactionProviderMatch("Ferretería Santana", undefined, providerMatchIndex).status,
  "matched",
);

const projectCatalog = [
  { _id: "larena-j", nombre: "Larena - Torre J" },
  { _id: "larena-k", nombre: "Larena - Torre K" },
  { _id: "pacifico", nombre: "Residencial Pacífico" },
];
assert.equal(normalizeProjectName("Tórre_J"), "TORRE J");
assert.equal(projectNameMatchMode("TORRE_J", "Larena - Torre J"), "alias");
assert.equal(projectNameMatchMode("Proyecto Larena Torre J", "Larena - Torre J"), "alias");
assert.equal(classifyProjectMatch("TORRE_J", projectCatalog).project?._id, "larena-j");
assert.equal(classifyProjectMatch("larena torre k", projectCatalog).project?._id, "larena-k");
assert.equal(classifyProjectMatch("J", projectCatalog).status, "unmatched");
assert.equal(
  classifyProjectMatch("TORRE_J", [
    ...projectCatalog,
    { _id: "otro-j", nombre: "Otro desarrollo - Torre J" },
  ]).status,
  "conflict",
);
assert.equal(
  classifyProjectMatch("Larena - Torre J", [
    { _id: "duplicate-a", nombre: "Larena - Torre J" },
    { _id: "duplicate-b", nombre: "LARENA_TORRE_J" },
  ]).status,
  "conflict",
);

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

const providerBackfillHeaders = [
  "ADMINISTRACIÓN",
  "PARTIDA",
  "FAMILIA",
  "SUBPARTIDA",
  "MONTO",
  "FECHA",
  "PROVEEDOR",
  "FACTURA",
  "CATEGORÍA",
  "TIPO DE PAGO",
  "MONEDA",
];
const providerBackfillRows = [
  providerBackfillHeaders,
  ["TORRE_J", "CIMENTACIÓN", "IMPERMEABILIZANTES", "PLASTICO NEGRO NMICRAS", "$14,935.00", "26/06/2026", "LUIS MANUEL NAVARRO GONZALEZ (HERMANOS NAVARRO FERRETERIA)", "LMN-CON-260626.pdf", "MATERIAL", "TRANSFERENCIA", "MXN"],
  ["TORRE_J", "ESTRUCTURAS_COMPLEMENTARIAS", "ACERO", "VARILLA", "$31,998.87", "26/06/2026", "ACEROS DEL PAFIFICO", "APA-ACE-260626.pdf", "MATERIAL", "TRANSFERENCIA", "MXN"],
  ["TORRE_J", "ESTRUCTURAS_COMPLEMENTARIAS", "ACERO", "ALAMBRON", "$6,797.06", "26/06/2026", "ACEROS DEL PAFIFICO", "APA-ACE-260626.pdf", "MATERIAL", "TRANSFERENCIA", "MXN"],
  ["TORRE_J", "ESTRUCTURAS_COMPLEMENTARIAS", "ACERO", "ALAMBRE RECOCIDO", "$3,880.53", "26/06/2026", "ACEROS DEL PAFIFICO", "APA-ACE-260626.pdf", "MATERIAL", "TRANSFERENCIA", "MXN"],
  ["TORRE_J", "ESTRUCTURAS_COMPLEMENTARIAS", "MANO_OBRA", "AYUDANTE DE ALBAÑIL", "$7,875.16", "20/07/2026", "DISPERSIÓN", "DIS-LARENAJ-20072026.pdf", "OTRO", "TRANSFERENCIA", "MXN"],
  ["TORRE_J", "ESTRUCTURAS_COMPLEMENTARIAS", "MANO_OBRA", "AYUDANTE DE ALBAÑIL", "$4,624.84", "20/07/2026", "EFECTIVO", "EFE-LARENAJ-20072026.pdf", "OTRO", "EFECTIVO", "MXN"],
];
const providerBackfill = parseProviderBackfillRows(providerBackfillRows);
assert.equal(providerBackfill.rowCount, 6);
assert.equal(providerBackfill.transactionCount, 4);
assert.equal(providerBackfill.providerCount, 4);
assert.equal(
  providerBackfill.candidates.find((candidate) => candidate.invoice === "APA-ACE-260626.pdf")?.amount_total,
  42676.46,
);

const positionalBackfill = parseProviderBackfillRows(providerBackfillRows.slice(1));
assert.equal(positionalBackfill.transactionCount, 4);

assert.throws(
  () => parseProviderBackfillRows([
    providerBackfillHeaders,
    ...providerBackfillRows.slice(1, 3),
    ["TORRE_J", "ESTRUCTURAS_COMPLEMENTARIAS", "ACERO", "ALAMBRON", "$6,797.06", "26/06/2026", "OTRO PROVEEDOR", "APA-ACE-260626.pdf", "MATERIAL", "TRANSFERENCIA", "MXN"],
  ]),
  ProviderBackfillImportValidationError,
);

const fiveThousandRows = [
  providerBackfillHeaders,
  ...Array.from({ length: 5_000 }, (_, index) => [
    "TORRE_J",
    "ESTRUCTURAS_COMPLEMENTARIAS",
    "ACERO",
    `CONCEPTO ${index + 1}`,
    "$1.00",
    "26/06/2026",
    `PROVEEDOR ${index % 50}`,
    `FACTURA-${index + 1}.pdf`,
    "MATERIAL",
    "TRANSFERENCIA",
    "MXN",
  ]),
];
const fiveThousandBackfill = parseProviderBackfillRows(fiveThousandRows);
assert.equal(fiveThousandBackfill.rowCount, 5_000);
assert.equal(fiveThousandBackfill.transactionCount, 5_000);
assert.equal(fiveThousandBackfill.providerCount, 50);
assert.equal(
  chunkProviderBackfillCandidates(
    fiveThousandBackfill.candidates,
    PROVIDER_BACKFILL_PREVIEW_BATCH_SIZE,
  ).length,
  10,
);
assert.equal(
  chunkProviderBackfillCandidates(
    fiveThousandBackfill.candidates,
    PROVIDER_BACKFILL_SYNC_BATCH_SIZE,
  ).length,
  50,
);

console.log("Provider and transaction import rules: OK");
