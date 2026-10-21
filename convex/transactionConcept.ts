type Concept = { concepto_adicional?: string };

export function combineTransactionConcepts(values: (string | undefined)[]) {
  return [...new Set(values.map(value => value?.trim()).filter((value): value is string => Boolean(value)))].join(" · ");
}

export function getTransactionConcept(transaction: Concept, lineItems: Concept[] = []) {
  // An explicitly empty transaction concept overrides the legacy line values.
  return transaction.concepto_adicional !== undefined
    ? transaction.concepto_adicional
    : combineTransactionConcepts(lineItems.map(item => item.concepto_adicional));
}
