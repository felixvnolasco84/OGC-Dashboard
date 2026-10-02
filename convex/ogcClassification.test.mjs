import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { utils, write } from "xlsx";
import { isOgcIncome, normalizeOgcClassification } from "./ogcClassificationRules";
import { recategorizeFromSource, bulkCreate, getIncomeByProyecto, getIncomeTotalsByProyecto } from "./ogc_movimientos";
import { parseOgcExcel } from "../src/lib/ogcExcel";

const sourceFile = "CE_230726.xlsx";
const original = {
  _id: "movement", _creationTime: 1, tipo: "ingreso", categoria: "HONORARIOS", monto: 3960180,
  fecha: "26/01/2026", descripcion: "APORTACIÓN FLUJO OGC", moneda: "MXN",
  archivo_origen: sourceFile, fila_origen: 16, status: "activo", reconciled: true,
  created_by_id: "user", created_by_name: "Original", created_at: 1,
};
const actor = { _id: "user", name: "Felix", email: "felix@polygonag.com", role: "admin", allowed_desarrollos: [], clerkId: "test" };
const correction = {
  id: "movement", expected: {
    tipo: original.tipo, categoria: original.categoria, monto: original.monto,
    fecha: original.fecha, descripcion: original.descripcion, moneda: original.moneda, fila_origen: 16,
  }, tipo: "costo_estructura", categoria: "DISP HONORARIOS", source_rows: [16],
};
const args = { actor_id: "user", source_file: sourceFile, source_hash: "a".repeat(64), corrections: [correction] };
function database(movements = [original], user = actor) {
  const tables = structuredClone({ ogc_movimientos: movements, ogc_movimientos_audit: [], users: [user], desarrollos: [{ _id: "project" }] });
  const ctx = {
    auth: { getUserIdentity: async () => ({ subject: "test" }) },
    db: {
      normalizeId(table, id) { return (tables[table] || []).some(row => row._id === id) ? id : null; },
      async get(id) { return structuredClone(Object.values(tables).flat().find(row => row._id === id) || null); },
      async patch(id, patch) { Object.assign(Object.values(tables).flat().find(row => row._id === id), patch); },
      async insert(table, row) { const id = `${table}-${tables[table].length}`; tables[table].push({ ...row, _id: id }); return id; },
      query(table) {
        const filters = [];
        const q = {
          withIndex(_name, predicate) {
            const builder = { eq(key, value) { filters.push([key, value]); return builder; } };
            predicate?.(builder); return q;
          },
          async collect() { return (tables[table] || []).filter(row => filters.every(([key, value]) => row[key] === value)); },
          async first() { return (await q.collect())[0] || null; },
        }; return q;
      },
    },
  }; return { ctx, tables };
}

describe("source classification repair", () => {
  it("previews without changes and records a before/after audit when applied", async () => {
    const f = database();
    const snapshot = structuredClone(f.tables);
    expect((await recategorizeFromSource._handler(f.ctx, args)).count).toBe(1);
    expect(f.tables).toEqual(snapshot);
    expect((await recategorizeFromSource._handler(f.ctx, { ...args, dry_run: false })).count).toBe(1);
    const saved = f.tables.ogc_movimientos[0];
    expect(saved).toMatchObject({ ...original, tipo: "costo_estructura", categoria: "DISP HONORARIOS" });
    expect(saved.duplicate_key).toContain("|costo_estructura|DISP HONORARIOS|");
    const audit = f.tables.ogc_movimientos_audit[0];
    expect(audit.actor_id).toBe(actor._id);
    expect(JSON.parse(audit.before_json)).toEqual(original);
    expect(JSON.parse(audit.after_json)).toEqual(saved);
    expect(audit.reason).toContain(args.source_hash);
    expect((await recategorizeFromSource._handler(f.ctx, { ...args, dry_run: false })).count).toBe(0);
    expect(f.tables.ogc_movimientos_audit).toHaveLength(1);
  });

  it.each([
    ["changed amount", { monto: 1 }], ["different file", { archivo_origen: "other.xlsx" }],
    ["inactive", { status: "anulado" }], ["invoice", { factura_referencia: "FAC-1" }],
    ["changed project", { proyecto: "project" }],
  ])("rejects %s before modifying any records", async (_name, patch) => {
    const f = database([{ ...original, ...patch }]);
    const snapshot = structuredClone(f.tables);
    await expect(recategorizeFromSource._handler(f.ctx, { ...args, dry_run: false })).rejects.toThrow();
    expect(f.tables).toEqual(snapshot);
  });

  it("requires global admin and validates the entire batch before applying", async () => {
    const f = database([original], { ...actor, email: "reader@example.com", role: "user" });
    await expect(recategorizeFromSource._handler(f.ctx, args)).rejects.toThrow("administrador global");
    const valid = database();
    await expect(recategorizeFromSource._handler(valid.ctx, {
      ...args, dry_run: false, corrections: [correction, { ...correction, id: "missing" }],
    })).rejects.toThrow();
    expect(valid.tables.ogc_movimientos[0]).toEqual(original);
    expect(valid.tables.ogc_movimientos_audit).toEqual([]);
  });
});

it("does not guess DISP from contributions, management, or a person's name", () => {
  expect(normalizeOgcClassification(original)).toEqual({ tipo: "ingreso", categoria: "HONORARIOS" });
  expect(normalizeOgcClassification({ tipo: "ingreso", categoria: " disp   honorarios ", descripcion: "Transporte" }))
    .toEqual({ tipo: "costo_estructura", categoria: "DISP HONORARIOS" });
  expect(isOgcIncome({ tipo: "ingreso", categoria: "OTROS", descripcion: "DISP. HONORARIOS" })).toBe(false);
  expect(normalizeOgcClassification({ tipo: "inventado", categoria: "OTROS" }).tipo).toBeNull();
});

it("normalizes new captures on the server and excludes costs/informatives from income queries", async () => {
  const f = database([]);
  await bulkCreate._handler(f.ctx, { movimientos: [
    { tipo: "ingreso", categoria: "DISP HONORARIOS", monto: 100, fecha: "01/01/2026", moneda: "MXN", proyecto: "project" },
    { tipo: "INFORMATIVO", categoria: "OTROS", monto: 200, fecha: "01/01/2026", moneda: "MXN", proyecto: "project" },
    { tipo: "ingreso", categoria: "HONORARIOS", monto: 300, fecha: "01/01/2026", moneda: "MXN", proyecto: "project" },
  ] });
  expect(f.tables.ogc_movimientos.map(row => row.tipo)).toEqual(["costo_estructura", "informativo", "ingreso"]);
  const queryArgs = { proyecto_id: "project" };
  expect((await getIncomeByProyecto._handler(f.ctx, queryArgs)).length).toBe(1);
  expect((await getIncomeTotalsByProyecto._handler(f.ctx, queryArgs)).total_ingresos).toBe(300);
});

it("reads original categories, dates, row numbers, repeated rows, and informative types from Excel", async () => {
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, utils.aoa_to_sheet([
    ["TIPO", "CATEGORÍA", "MONTO", "FECHA", "OBRA", "DESCRIPCIÓN", "MONEDA"],
    ["COSTO ESTRUCTURA", "DISP HONORARIOS", 100, new Date(2026, 0, 26), null, "APORTACIÓN FLUJO OGC", "MXN"],
    ["COSTO ESTRUCTURA", "DISP HONORARIOS", 100, new Date(2026, 0, 26), null, "APORTACIÓN FLUJO OGC", "MXN"],
    ["INFORMATIVO", "CARGA SOCIAL OBRA (SIROC-RECUPERABLE)", 200, new Date(2026, 0, 19), null, "PAGO IMSS", "MXN"],
    [],
    ["INFORMATIVO", "FLUJO FISCAL (IVA + RETENCIONES)", 300, "01/02/2026", null, "IVA", "MXN"],
    ["INVALIDO", "OTROS", 50, "01/02/2026"],
  ]), "Sheet1");
  const result = await parseOgcExcel(write(workbook, { type: "array", bookType: "xlsx" }));
  expect(result.movimientos.map(row => row.rowIndex)).toEqual([2, 3, 4, 6]);
  expect(result.movimientos.map(row => row.tipo)).toEqual(["costo_estructura", "costo_estructura", "informativo", "informativo"]);
  expect(result.movimientos[0].fecha).toBe("26/01/2026");
  expect(result.movimientos[0].categoria).toBe("DISP HONORARIOS");
  expect(result.errors).toEqual([{ row: 7, error: "Tipo de movimiento no reconocido: INVALIDO" }]);
});

it.skipIf(!process.env.OGC_SOURCE_EXCEL)("reads all 283 source rows with their authoritative classification", async () => {
  const bytes = fs.readFileSync(process.env.OGC_SOURCE_EXCEL);
  const parsed = await parseOgcExcel(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  expect(parsed.errors).toEqual([]);
  expect(parsed.movimientos).toHaveLength(283);
  expect(parsed.movimientos.filter(row => row.categoria === "DISP HONORARIOS")).toHaveLength(49);
  expect(parsed.movimientos.filter(row => row.tipo === "informativo")).toHaveLength(11);
  expect(parsed.movimientos.filter(row => row.tipo === "ingreso")).toHaveLength(0);
});
