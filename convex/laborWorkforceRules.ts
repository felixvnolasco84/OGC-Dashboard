type WorkforceRow = {
  subpartida: string;
  familia: string;
  numeroPersonas?: number;
  tipoPago: string;
  sourceRow?: number;
};

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ").trim();
}

// The same crew can receive both a transfer and cash. Equal counts across
// payment methods describe one crew; repeated rows of one method add crews.
function headcount(entries: Array<{ count: number; tipoPago: string }>) {
  const counts = new Map<number, Map<string, number>>();
  for (const entry of entries) {
    const methods = counts.get(entry.count) || new Map<string, number>();
    const method = normalize(entry.tipoPago);
    methods.set(method, (methods.get(method) || 0) + 1);
    counts.set(entry.count, methods);
  }
  return [...counts].reduce((total, [count, methods]) => total + count * Math.max(...methods.values()), 0);
}

export function summarizeLaborWorkforce(rows: WorkforceRow[]) {
  const warnings: string[] = [];
  const errors: string[] = [];
  const fasarRows = rows.filter(row => normalize(row.subpartida).includes("FASAR"));
  const summaryCounts = [...new Set(fasarRows.map(row => row.numeroPersonas)
    .filter((count): count is number => count !== undefined && count > 0))];
  if (summaryCounts.length > 1) errors.push("Las filas FASAR declaran totales de personas distintos.");
  if (fasarRows.length && !summaryCounts.length) {
    warnings.push("La fila FASAR no declara NO. PERSONAS; el total se inferirá desde los puestos.");
  }
  const roleCounts = new Map<string, { label: string; entries: Array<{ count: number; tipoPago: string }> }>();
  for (const row of rows) {
    if (normalize(row.subpartida).includes("FASAR")) continue;
    if (row.numeroPersonas === undefined) {
      warnings.push(`Fila ${row.sourceRow ?? "histórica"}: ${row.subpartida} no tiene NO. PERSONAS.`);
      continue;
    }
    if (row.numeroPersonas === 0) continue;
    const label = row.subpartida || row.familia;
    const key = normalize(label);
    const role = roleCounts.get(key) || { label, entries: [] };
    role.entries.push({ count: row.numeroPersonas, tipoPago: row.tipoPago });
    roleCounts.set(key, role);
  }
  const roles = [...roleCounts].map(([key, role]) => ({ key, label: role.label, count: headcount(role.entries) }));
  const explicitTotal = roles.reduce((sum, role) => sum + role.count, 0);
  const totalPeople = summaryCounts.length === 1 ? summaryCounts[0] : explicitTotal;
  if (summaryCounts.length === 1) {
    if (explicitTotal > totalPeople) errors.push(`Los puestos suman ${explicitTotal}, por encima del total FASAR de ${totalPeople}.`);
    else if (explicitTotal < totalPeople) roles.push({ key: "NO DESGLOSADO", label: "No desglosado", count: totalPeople - explicitTotal });
  } else if (totalPeople > 0) {
    warnings.push("No hay un total FASAR válido; el total se infirió desde los puestos deduplicados.");
  }
  roles.sort((left, right) => left.key === "NO DESGLOSADO" ? 1 : right.key === "NO DESGLOSADO" ? -1
    : right.count - left.count || left.label.localeCompare(right.label, "es"));
  return { totalPeople, roles, warnings: [...new Set(warnings)], errors };
}
