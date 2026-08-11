import assert from "node:assert/strict";
import {
  LaborPaymentImportValidationError,
  normalizeLaborImportText,
  parseLaborImportDate,
  parseLaborPaymentRows,
} from "../src/lib/laborPaymentImport.ts";

const headers = [
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
  "NO. PERSONAS",
];

const partidas = [
  "CABO DE OFICIOS",
  "OFICIAL ALBAÑIL",
  "OFICIAL FIERRERO",
  "AYUDANTE DE ALBAÑIL",
  "FASAR 36+IVA%",
].map((subpartida, index) => ({
  _id: `partida-${index}`,
  nivel: 3,
  nombre: "ALBAÑILERÍAS",
  familia: "MANO_OBRA",
  sub_partida: subpartida,
}));

function row(subpartida, monto, proveedor, factura, tipoPago, personas) {
  return [
    "TORRE_G",
    "ALBAÑILERÍAS",
    "MANO_OBRA",
    subpartida,
    monto,
    46160,
    proveedor,
    factura,
    "OTRO",
    tipoPago,
    "MXN",
    personas,
  ];
}

const referenceRows = [
  headers,
  row("CABO DE OFICIOS", 5152, "DISPERSIÓN", "DIS-LARENAG-18052026.pdf", "TRANSFERENCIA", 1),
  row("CABO DE OFICIOS", 3348, "EFECTIVO", "EFE-LARENAG-18052026.pdf", "EFECTIVO", 1),
  row("OFICIAL ALBAÑIL", 39079.39, "DISPERSIÓN", "DIS-LARENAG-18052026.pdf", "TRANSFERENCIA", 10),
  row("OFICIAL ALBAÑIL", 30092.04, "EFECTIVO", "EFE-LARENAG-18052026.pdf", "EFECTIVO", 10),
  row("OFICIAL FIERRERO", 3950, "DISPERSIÓN", "DIS-LARENAG-18052026.pdf", "TRANSFERENCIA", 1),
  row("OFICIAL FIERRERO", 2550, "EFECTIVO", "EFE-LARENAG-18052026.pdf", "EFECTIVO", 1),
  row("AYUDANTE DE ALBAÑIL", 21515.16, "DISPERSIÓN", "DIS-LARENAG-18052026.pdf", "TRANSFERENCIA", 8),
  row("AYUDANTE DE ALBAÑIL", 13841.98, "EFECTIVO", "EFE-LARENAG-18052026.pdf", "EFECTIVO", 8),
  row("FASAR 36+IVA%", 48341.53, "DISPERSIÓN", "DIS-LARENAG-18052026.pdf", "TRANSFERENCIA", 23),
];

function parse(rows = referenceRows, overrides = {}) {
  return parseLaborPaymentRows(rows, {
    projectName: "Torre G",
    projectCurrency: "MXN",
    partidas,
    ...overrides,
  });
}

function expectFailure(action, expectedText) {
  assert.throws(action, (error) => {
    assert.ok(error instanceof LaborPaymentImportValidationError);
    assert.match(error.issues.join("\n"), expectedText);
    return true;
  });
}

assert.equal(normalizeLaborImportText("Mano_Obra-á"), "MANO OBRA A");
assert.equal(parseLaborImportDate(46160), "2026-05-18");
assert.equal(parseLaborImportDate("18/05/2026"), "2026-05-18");
assert.equal(parseLaborImportDate("31/02/2026"), null);

const parsed = parse();
assert.equal(parsed.rowCount, 9);
assert.equal(parsed.amountTotal, 167870.1);
assert.equal(parsed.weeks.length, 1);
assert.equal(parsed.weeks[0].date, "2026-05-18");
assert.equal(parsed.weeks[0].transactions.length, 2);
assert.deepEqual(
  parsed.weeks[0].transactions.map((transaction) => transaction.monto_total).sort((a, b) => b - a),
  [118038.08, 49832.02],
);
assert.equal(parsed.weeks[0].total_people, 23);
assert.deepEqual(parsed.weeks[0].roles.map((role) => role.count), [10, 8, 1, 1, 3]);
assert.equal(parsed.weeks[0].roles.at(-1)?.label, "No desglosado");

const withoutFasarCount = referenceRows.map((entry, index) => (
  index === referenceRows.length - 1 ? [...entry.slice(0, 11), ""] : [...entry]
));
const inferred = parse(withoutFasarCount);
assert.equal(inferred.weeks[0].total_people, 20);
assert.match(inferred.warnings.join("\n"), /se infirió/i);

const secondWeekRole = row(
  "CABO DE OFICIOS",
  100,
  "DISPERSIÓN",
  "DIS-25052026.pdf",
  "TRANSFERENCIA",
  2,
);
secondWeekRole[5] = 46167;
const secondWeekFasar = row(
  "FASAR 36+IVA%",
  36,
  "DISPERSIÓN",
  "DIS-25052026.pdf",
  "TRANSFERENCIA",
  2,
);
secondWeekFasar[5] = 46167;
const multipleWeeks = parse([...referenceRows, secondWeekRole, secondWeekFasar]);
assert.deepEqual(multipleWeeks.weeks.map((week) => week.date), ["2026-05-18", "2026-05-25"]);
assert.equal(multipleWeeks.weeks[1].total_people, 2);

const conflictingFasar = [...referenceRows, row(
  "FASAR 36+IVA%",
  1,
  "EFECTIVO",
  "EFE-LARENAG-18052026.pdf",
  "EFECTIVO",
  22,
)];
expectFailure(() => parse(conflictingFasar), /FASAR declaran totales/i);

expectFailure(() => parse([...referenceRows, [...referenceRows[1]]]), /duplicados exactos/i);
const invalidDate = referenceRows.map((entry) => [...entry]);
invalidDate[1][5] = "31/02/2026";
expectFailure(() => parse(invalidDate), /FECHA no es válida/i);
const decimalPeople = referenceRows.map((entry) => [...entry]);
decimalPeople[1][11] = 1.5;
expectFailure(() => parse(decimalPeople), /entero no negativo/i);
const mixedCurrency = referenceRows.map((entry) => [...entry]);
mixedCurrency[1][10] = "USD";
expectFailure(() => parse(mixedCurrency), /mezcla monedas/i);
const incompatibleCategory = [...referenceRows, [...referenceRows[1]]];
incompatibleCategory.at(-1)[4] = 1;
incompatibleCategory.at(-1)[8] = "SERVICIO";
expectFailure(() => parse(incompatibleCategory), /mezcla categorías/i);
const excessiveRoles = referenceRows.map((entry) => [...entry]);
excessiveRoles.at(-1)[11] = 19;
expectFailure(() => parse(excessiveRoles), /por encima del total FASAR/i);
expectFailure(
  () => parse(referenceRows, { projectCurrency: "USD" }),
  /no coincide con la moneda principal/i,
);
expectFailure(
  () => parse(referenceRows, { projectName: "Otro proyecto" }),
  /no coincide con el proyecto/i,
);
expectFailure(
  () => parse(referenceRows, { partidas: [...partidas, { ...partidas[0], _id: "duplicada" }] }),
  /es ambigua/i,
);

console.log("Labor payment import rules: OK");
