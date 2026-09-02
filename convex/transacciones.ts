import { query, mutation as baseMutation } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, updatePagadoForHierarchy, updateMeticasPresupuesto, updateHonorariosMonto, updateProyectoMonedaPrincipal } from "./functions";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  assertAdmin,
  assertCanWrite,
  checkDesarrolloAccess,
  getCurrentUserOrThrow,
} from "./permissions";
import {
  buildProviderMatchIndex,
  classifyTransactionProviderMatch,
  isGenericProviderName,
  isProviderComplete,
  normalizeProviderName,
} from "./providerUtils";
import {
  classifyProjectMatch,
  type ProjectMatchMode,
} from "./projectMatchUtils";
import { moneyDelta, mostSpecificCostLabel, normalizeCostText } from "./costRules";
import { parseInvoiceIssuedDate } from "./invoiceRules";
import {
  markInvoicesStaleForTransaction,
  transactionChangeInvalidatesInvoice,
} from "./invoiceIntegrity";

type TransactionLineItemInput = {
  partida_id: Id<"partidas">;
  partida: string;
  familia: string;
  sub_partida: string;
  monto: number;
};

type PreparedTransactionLineItem = TransactionLineItemInput & {
  partidaDoc: Doc<"partidas">;
  concepto: string;
  partida_nombre_snapshot: string;
  familia_snapshot: string;
  sub_partida_snapshot: string;
};

const PROVIDER_SYNC_PAGE_SIZE = 100;
const PROVIDER_EXCEL_PREVIEW_BATCH_SIZE = 500;
const PROVIDER_EXCEL_SYNC_BATCH_SIZE = 100;
const PROVIDER_EXCEL_DATE_TOLERANCE_DAYS = 1;
const PROVIDER_EXCEL_AMOUNT_TOLERANCE_CENTS = 1;

const providerExcelCandidateValidator = v.object({
  source_key: v.string(),
  project_name: v.string(),
  amount_total: v.number(),
  date: v.string(),
  provider_name: v.string(),
  invoice: v.string(),
  payment_type: v.string(),
  currency: v.string(),
  source_rows: v.array(v.number()),
  transaction_ids: v.optional(v.array(v.id("transacciones"))),
});

type ProviderExcelCandidate = {
  source_key: string;
  project_name: string;
  amount_total: number;
  date: string;
  provider_name: string;
  invoice: string;
  payment_type: string;
  currency: string;
  source_rows: number[];
  transaction_ids?: Id<"transacciones">[];
};

type ProviderExcelStatus =
  | "ready_existing_provider"
  | "ready_new_provider"
  | "already_assigned"
  | "transaction_not_found"
  | "transaction_conflict"
  | "project_not_found"
  | "project_conflict"
  | "project_mismatch"
  | "provider_archived"
  | "provider_conflict";

type ProviderExcelResolution = {
  candidate: ProviderExcelCandidate;
  status: ProviderExcelStatus;
  transactions?: Doc<"transacciones">[];
  provider?: Doc<"proveedores">;
  matchedProviderName?: string;
  candidateCount?: number;
  matchMode?: "exact" | "historical_tolerance";
  matchedProjectName?: string;
  projectMatchMode?: ProjectMatchMode;
  matchedTransactionDate?: string;
  matchedTransactionAmount?: number;
};

function emptyProviderExcelCounts() {
  return {
    scanned: 0,
    ready_existing_provider: 0,
    ready_new_provider: 0,
    already_assigned: 0,
    transaction_not_found: 0,
    transaction_conflict: 0,
    project_not_found: 0,
    project_conflict: 0,
    project_mismatch: 0,
    provider_archived: 0,
    provider_conflict: 0,
    updated: 0,
    providers_created: 0,
  };
}

function normalizeProviderExcelDate(value: string) {
  const trimmed = value.trim();
  let match = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(trimmed);
  if (match) {
    return `${match[3].padStart(2, "0")}/${match[2].padStart(2, "0")}/${match[1]}`;
  }
  match = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(trimmed);
  if (match) {
    return `${match[1].padStart(2, "0")}/${match[2].padStart(2, "0")}/${match[3]}`;
  }
  return trimmed;
}

function providerExcelTransactionKey(input: {
  invoice?: string;
  date: string;
  amount: number;
  paymentType: string;
  currency: string;
}) {
  return [
    normalizeProviderName(input.invoice || ""),
    normalizeProviderExcelDate(input.date),
    Math.round(input.amount * 100),
    normalizeProviderName(input.paymentType),
    normalizeProviderName(input.currency),
  ].join("|");
}

function providerExcelTransactionKeyWithoutDate(input: {
  invoice?: string;
  paymentType: string;
  currency: string;
}) {
  return [
    normalizeProviderName(input.invoice || ""),
    normalizeProviderName(input.paymentType),
    normalizeProviderName(input.currency),
  ].join("|");
}

function providerExcelDateTimestamp(value: string) {
  const normalized = normalizeProviderExcelDate(value);
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(normalized);
  if (!match) return null;
  return Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
}

function isWithinProviderExcelDateTolerance(left: string, right: string) {
  const leftTimestamp = providerExcelDateTimestamp(left);
  const rightTimestamp = providerExcelDateTimestamp(right);
  if (leftTimestamp === null || rightTimestamp === null) return false;
  return Math.abs(leftTimestamp - rightTimestamp) <=
    PROVIDER_EXCEL_DATE_TOLERANCE_DAYS * 86_400_000;
}

function providerExcelTransactionMatchMode(
  candidate: ProviderExcelCandidate,
  transaction: Doc<"transacciones">,
): ProviderExcelResolution["matchMode"] | null {
  const exactCandidateKey = providerExcelTransactionKey({
    invoice: candidate.invoice,
    date: candidate.date,
    amount: candidate.amount_total,
    paymentType: candidate.payment_type,
    currency: candidate.currency,
  });
  const exactTransactionKey = providerExcelTransactionKey({
    invoice: transaction.factura,
    date: transaction.fecha,
    amount: transaction.monto_total,
    paymentType: transaction.tipo_pago,
    currency: transaction.moneda,
  });
  if (exactCandidateKey === exactTransactionKey) return "exact";

  const candidateWithoutDate = providerExcelTransactionKeyWithoutDate({
    invoice: candidate.invoice,
    paymentType: candidate.payment_type,
    currency: candidate.currency,
  });
  const transactionWithoutDate = providerExcelTransactionKeyWithoutDate({
    invoice: transaction.factura,
    paymentType: transaction.tipo_pago,
    currency: transaction.moneda,
  });
  return candidateWithoutDate === transactionWithoutDate &&
    isWithinProviderExcelDateTolerance(candidate.date, transaction.fecha) &&
    Math.abs(
      Math.round(candidate.amount_total * 100) -
      Math.round(transaction.monto_total * 100)
    ) <= PROVIDER_EXCEL_AMOUNT_TOLERANCE_CENTS
    ? "historical_tolerance"
    : null;
}

function assertProviderExcelCandidates(
  candidates: ProviderExcelCandidate[],
  maxBatchSize: number,
) {
  if (!candidates.length) throw new Error("El archivo no contiene transacciones para revisar.");
  if (candidates.length > maxBatchSize) {
    throw new Error(`Cada lote puede contener hasta ${maxBatchSize} transacciones.`);
  }
  const sourceKeys = new Set<string>();
  for (const candidate of candidates) {
    if (!candidate.source_key.trim() || sourceKeys.has(candidate.source_key)) {
      throw new Error("El lote contiene una clave de transacción vacía o duplicada.");
    }
    sourceKeys.add(candidate.source_key);
    if (
      !candidate.project_name.trim() ||
      !candidate.provider_name.trim() ||
      !candidate.invoice.trim() ||
      !candidate.payment_type.trim() ||
      !candidate.currency.trim()
    ) {
      throw new Error("El lote contiene una transacción con datos obligatorios vacíos.");
    }
    if (!Number.isFinite(candidate.amount_total) || candidate.amount_total <= 0) {
      throw new Error("El lote contiene un monto inválido.");
    }
    if (
      candidate.transaction_ids &&
      new Set(candidate.transaction_ids).size !== candidate.transaction_ids.length
    ) {
      throw new Error("El lote contiene identificadores de transacción duplicados.");
    }
  }
}

async function resolveProviderExcelCandidates(
  ctx: QueryCtx | MutationCtx,
  scopeProjectId: Id<"desarrollos"> | undefined,
  candidates: ProviderExcelCandidate[],
  maxBatchSize: number,
) {
  assertProviderExcelCandidates(candidates, maxBatchSize);
  const [projects, providers] = await Promise.all([
    ctx.db.query("desarrollos").collect(),
    ctx.db.query("proveedores").collect(),
  ]);
  const scopedProject = scopeProjectId
    ? projects.find((project) => project._id === scopeProjectId)
    : undefined;
  if (scopeProjectId && !scopedProject) throw new Error("El proyecto seleccionado ya no existe.");

  const providersByName = buildProviderMatchIndex(providers);
  const transactionsByProject = new Map<string, {
    exact: Map<string, Doc<"transacciones">[]>;
    withoutDate: Map<string, Doc<"transacciones">[]>;
  }>();

  const getTransactions = async (projectId: Id<"desarrollos">) => {
    const cached = transactionsByProject.get(projectId);
    if (cached) return cached;
    const transactions = await ctx.db
      .query("transacciones")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", projectId))
      .collect();
    const exact = new Map<string, Doc<"transacciones">[]>();
    const withoutDate = new Map<string, Doc<"transacciones">[]>();
    for (const transaction of transactions) {
      const exactKey = providerExcelTransactionKey({
        invoice: transaction.factura,
        date: transaction.fecha,
        amount: transaction.monto_total,
        paymentType: transaction.tipo_pago,
        currency: transaction.moneda,
      });
      exact.set(exactKey, [...(exact.get(exactKey) || []), transaction]);
      const withoutDateKey = providerExcelTransactionKeyWithoutDate({
        invoice: transaction.factura,
        paymentType: transaction.tipo_pago,
        currency: transaction.moneda,
      });
      withoutDate.set(withoutDateKey, [
        ...(withoutDate.get(withoutDateKey) || []),
        transaction,
      ]);
    }
    const indexed = { exact, withoutDate };
    transactionsByProject.set(projectId, indexed);
    return indexed;
  };

  const resolutions: ProviderExcelResolution[] = [];
  for (const candidate of candidates) {
    let project: Doc<"desarrollos"> | undefined;
    let projectMatchMode: ProjectMatchMode | undefined;
    if (scopedProject) {
      const projectMatch = classifyProjectMatch(candidate.project_name, [scopedProject]);
      if (projectMatch.status !== "matched") {
        resolutions.push({ candidate, status: "project_mismatch" });
        continue;
      }
      project = scopedProject;
      projectMatchMode = projectMatch.mode;
    } else {
      const projectMatch = classifyProjectMatch(candidate.project_name, projects);
      if (projectMatch.status === "unmatched") {
        resolutions.push({ candidate, status: "project_not_found" });
        continue;
      }
      if (projectMatch.status === "conflict") {
        resolutions.push({
          candidate,
          status: "project_conflict",
          candidateCount: projectMatch.matches.length,
        });
        continue;
      }
      project = projectMatch.project;
      projectMatchMode = projectMatch.mode;
    }
    if (!project) {
      resolutions.push({ candidate, status: "project_not_found" });
      continue;
    }
    const projectDetails = {
      matchedProjectName: project.nombre,
      projectMatchMode,
    };

    let transactionMatches: Doc<"transacciones">[] = [];
    let matchMode: ProviderExcelResolution["matchMode"] = "exact";
    if (candidate.transaction_ids?.length) {
      const referencedTransactions = await Promise.all(
        candidate.transaction_ids.map((transactionId) => ctx.db.get(transactionId)),
      );
      const referencedModes = referencedTransactions.map((transaction) =>
        transaction && transaction.proyecto === project._id
          ? providerExcelTransactionMatchMode(candidate, transaction)
          : null
      );
      if (referencedTransactions.every(Boolean) && referencedModes.every(Boolean)) {
        transactionMatches = referencedTransactions as Doc<"transacciones">[];
        matchMode = referencedModes.includes("historical_tolerance")
          ? "historical_tolerance"
          : "exact";
      }
    }

    if (!transactionMatches.length) {
      const transactionKey = providerExcelTransactionKey({
        invoice: candidate.invoice,
        date: candidate.date,
        amount: candidate.amount_total,
        paymentType: candidate.payment_type,
        currency: candidate.currency,
      });
      const transactionIndexes = await getTransactions(project._id);
      transactionMatches = transactionIndexes.exact.get(transactionKey) || [];
      matchMode = "exact";
      if (!transactionMatches.length) {
        const withoutDateKey = providerExcelTransactionKeyWithoutDate({
          invoice: candidate.invoice,
          paymentType: candidate.payment_type,
          currency: candidate.currency,
        });
        transactionMatches = (transactionIndexes.withoutDate.get(withoutDateKey) || [])
          .filter((transaction) =>
            providerExcelTransactionMatchMode(candidate, transaction) === "historical_tolerance"
          );
        matchMode = "historical_tolerance";
      }
    }
    if (!transactionMatches.length) {
      resolutions.push({ candidate, ...projectDetails, status: "transaction_not_found" });
      continue;
    }
    const firstTransaction = transactionMatches[0];
    const areExactDuplicates = transactionMatches.every((transaction) =>
      normalizeProviderExcelDate(transaction.fecha) ===
        normalizeProviderExcelDate(firstTransaction.fecha) &&
      Math.round(transaction.monto_total * 100) ===
        Math.round(firstTransaction.monto_total * 100)
    );
    const assignedTransactions = transactionMatches.filter(
      (transaction) => Boolean(transaction.proveedor_id)
    );
    if (
      transactionMatches.length > 1 &&
      (!areExactDuplicates ||
        (assignedTransactions.length > 0 &&
          assignedTransactions.length < transactionMatches.length))
    ) {
      resolutions.push({
        candidate,
        ...projectDetails,
        status: "transaction_conflict",
        candidateCount: transactionMatches.length,
        matchMode,
      });
      continue;
    }
    if (assignedTransactions.length === transactionMatches.length) {
      resolutions.push({
        candidate,
        ...projectDetails,
        status: "already_assigned",
        transactions: transactionMatches,
        matchMode,
        matchedTransactionDate: firstTransaction.fecha,
        matchedTransactionAmount: firstTransaction.monto_total,
        candidateCount: transactionMatches.length,
      });
      continue;
    }

    const providerMatch = classifyTransactionProviderMatch(
      candidate.provider_name,
      undefined,
      providersByName,
    );
    if (providerMatch.status === "archived") {
      resolutions.push({
        candidate,
        ...projectDetails,
        status: "provider_archived",
        transactions: transactionMatches,
        candidateCount: providerMatch.matches.length,
        matchMode,
        matchedTransactionDate: firstTransaction.fecha,
        matchedTransactionAmount: firstTransaction.monto_total,
      });
      continue;
    }
    if (providerMatch.status === "conflict") {
      resolutions.push({
        candidate,
        ...projectDetails,
        status: "provider_conflict",
        transactions: transactionMatches,
        candidateCount: providerMatch.matches.length,
        matchMode,
        matchedTransactionDate: firstTransaction.fecha,
        matchedTransactionAmount: firstTransaction.monto_total,
      });
      continue;
    }
    if (providerMatch.status === "matched" && providerMatch.provider) {
      resolutions.push({
        candidate,
        ...projectDetails,
        status: "ready_existing_provider",
        transactions: transactionMatches,
        provider: providerMatch.provider,
        matchedProviderName: providerMatch.provider.razon_social,
        matchMode,
        matchedTransactionDate: firstTransaction.fecha,
        matchedTransactionAmount: firstTransaction.monto_total,
        candidateCount: transactionMatches.length,
      });
      continue;
    }
    resolutions.push({
      candidate,
      ...projectDetails,
      status: "ready_new_provider",
      transactions: transactionMatches,
      matchMode,
      matchedTransactionDate: firstTransaction.fecha,
      matchedTransactionAmount: firstTransaction.monto_total,
      candidateCount: transactionMatches.length,
    });
  }
  return resolutions;
}

function summarizeProviderExcelResolutions(resolutions: ProviderExcelResolution[]) {
  const counts = emptyProviderExcelCounts();
  counts.scanned = resolutions.length;
  for (const resolution of resolutions) counts[resolution.status] += 1;
  return {
    counts,
    rows: resolutions.map((resolution) => ({
      ...resolution.candidate,
      status: resolution.status,
      transaction_id: resolution.transactions?.[0]?._id,
      transaction_ids: resolution.transactions?.map((transaction) => transaction._id),
      matched_transaction_count: resolution.transactions?.length,
      matched_provider_name: resolution.matchedProviderName,
      matched_project_name: resolution.matchedProjectName,
      project_match_mode: resolution.projectMatchMode,
      candidate_count: resolution.candidateCount,
      match_mode: resolution.matchMode,
      matched_transaction_date: resolution.matchedTransactionDate,
      matched_transaction_amount: resolution.matchedTransactionAmount,
    })),
  };
}

type ProviderSyncStatus =
  | "matched"
  | "unmatched"
  | "archived"
  | "conflict"
  | "missing_name"
  | "already_assigned";

type ProviderSyncRow = {
  status: ProviderSyncStatus;
  providerName: string;
  normalizedName: string;
  providerId?: Id<"proveedores">;
  matchedProviderName?: string;
  candidateNames: string[];
};

function emptyProviderSyncCounts() {
  return {
    scanned: 0,
    matched: 0,
    unmatched: 0,
    archived: 0,
    conflict: 0,
    missing_name: 0,
    already_assigned: 0,
    updated: 0,
  };
}

function classifyTransactionProvider(
  transaction: Doc<"transacciones">,
  providersByName: ReadonlyMap<string, readonly Doc<"proveedores">[]>,
): ProviderSyncRow {
  const providerName = transaction.proveedor?.trim() || "";
  const match = classifyTransactionProviderMatch(
    providerName,
    transaction.proveedor_id,
    providersByName,
  );
  return {
    status: match.status,
    providerName: providerName || "Sin nombre de proveedor",
    normalizedName: match.normalized,
    providerId: transaction.proveedor_id || match.provider?._id,
    matchedProviderName: match.provider?.razon_social,
    candidateNames: match.matches.map((provider) => provider.razon_social),
  };
}

function groupProviderSyncRows(rows: ProviderSyncRow[]) {
  const groups = new Map<string, ProviderSyncRow & { transaction_count: number }>();
  for (const row of rows) {
    const key = [row.status, row.normalizedName, row.providerId || ""].join("|");
    const current = groups.get(key);
    if (current) {
      current.transaction_count += 1;
      continue;
    }
    groups.set(key, { ...row, transaction_count: 1 });
  }
  return [...groups.values()].map((group) => ({
    status: group.status,
    provider_name: group.providerName,
    normalized_name: group.normalizedName,
    provider_id: group.providerId,
    matched_provider_name: group.matchedProviderName,
    candidate_names: group.candidateNames,
    transaction_count: group.transaction_count,
  }));
}

async function assertProviderSyncScope(
  ctx: QueryCtx | MutationCtx,
  projectId?: Id<"desarrollos">,
) {
  await assertAdmin(ctx);
  if (projectId && !(await ctx.db.get(projectId))) {
    throw new Error("El proyecto seleccionado ya no existe.");
  }
}

async function getProviderSyncPage(
  ctx: QueryCtx | MutationCtx,
  projectId: Id<"desarrollos"> | undefined,
  cursor: string | null,
) {
  const paginationOpts = { cursor, numItems: PROVIDER_SYNC_PAGE_SIZE };
  return projectId
    ? await ctx.db
        .query("transacciones")
        .withIndex("by_proyecto", (q) => q.eq("proyecto", projectId))
        .order("asc")
        .paginate(paginationOpts)
    : await ctx.db
        .query("transacciones")
        .order("asc")
        .paginate(paginationOpts);
}

function assertTransactionTotal(montoTotal: number, lineItems: Array<{ monto: number }>) {
  if (!Number.isFinite(montoTotal)) throw new Error("El monto total no es válido.");
  if (!lineItems.length) throw new Error("La transacción debe incluir al menos un concepto.");
  if (lineItems.some((item) => !Number.isFinite(item.monto))) {
    throw new Error("Todos los conceptos deben tener un monto válido.");
  }
  const lineItemsTotal = lineItems.reduce((sum, item) => sum + item.monto, 0);
  if (Math.abs(moneyDelta(montoTotal, lineItemsTotal)) > 0.01) {
    throw new Error("El monto total debe coincidir con la suma de los conceptos.");
  }
}

async function prepareTransactionLineItems(
  ctx: MutationCtx,
  proyecto: Id<"desarrollos">,
  montoTotal: number,
  lineItems: TransactionLineItemInput[],
): Promise<PreparedTransactionLineItem[]> {
  assertTransactionTotal(montoTotal, lineItems);
  const partidaIds = [...new Set(lineItems.map((item) => item.partida_id))];
  const partidas = await Promise.all(partidaIds.map((id) => ctx.db.get(id)));
  const partidasById = new Map(
    partidas
      .filter((partida): partida is Doc<"partidas"> => Boolean(partida))
      .map((partida) => [String(partida._id), partida]),
  );

  return lineItems.map((item) => {
    const partidaDoc = partidasById.get(String(item.partida_id));
    if (!partidaDoc || partidaDoc.proyecto !== proyecto) {
      throw new Error("Uno de los conceptos no pertenece al proyecto de la transacción.");
    }
    const partidaNombre = String(
      partidaDoc.nivel === 1
        ? partidaDoc.nombre
        : partidaDoc.partida_nombre || partidaDoc.nombre || "",
    ).trim();
    const familia = String(partidaDoc.familia || "").trim();
    const subPartida = String(partidaDoc.sub_partida || "").trim();
    const concepto = mostSpecificCostLabel({
      sub_partida: subPartida,
      familia,
      partida: partidaNombre,
      nombre: partidaDoc.nombre,
    });
    return {
      ...item,
      // Derive hierarchy labels from Convex. Client labels are display-only and
      // are intentionally ignored for persistence and rollup updates.
      partida: partidaNombre,
      familia,
      sub_partida: subPartida,
      partidaDoc,
      concepto,
      partida_nombre_snapshot: partidaNombre,
      familia_snapshot: familia,
      sub_partida_snapshot: subPartida,
    };
  });
}

async function validateTransactionWrite(
  ctx: MutationCtx,
  proyecto: Id<"desarrollos">,
  proveedorId?: Id<"proveedores"> | null
) {
  await assertCanWrite(ctx);
  if (!(await checkDesarrolloAccess(ctx, proyecto))) {
    throw new Error("No tienes acceso para modificar este proyecto.");
  }
  if (!proveedorId) return null;
  const proveedor = await ctx.db.get(proveedorId);
  if (!proveedor || proveedor.merged_into) throw new Error("Proveedor no encontrado.");
  if (proveedor.archived_at) throw new Error("No se puede asignar un proveedor archivado.");
  return proveedor;
}

async function providerSummary(ctx: QueryCtx, proveedorId?: Id<"proveedores">) {
  if (!proveedorId) return null;
  const proveedor = await ctx.db.get(proveedorId);
  if (!proveedor) return null;
  const tipo = proveedor.tipo || "regular";
  return {
    _id: proveedor._id,
    razon_social: proveedor.razon_social,
    rfc: proveedor.rfc,
    tipo,
    is_complete: isProviderComplete({ ...proveedor, tipo }),
    is_archived: Boolean(proveedor.archived_at),
  };
}

// Create a transaction with multiple line items (concepts)
export const createTransaction = mutation({
  args: {
    proyecto: v.id("desarrollos"),
    proveedor_id: v.optional(v.id("proveedores")),
    import_batch_id: v.optional(v.id("transaction_import_batches")),
    import_source_key: v.optional(v.string()),
    import_signature: v.optional(v.string()),
    allow_duplicate_signature: v.optional(v.boolean()),
    monto_total: v.number(),
    fecha: v.string(),
    tipo_pago: v.string(),
    moneda: v.string(),
    tipo_cambio: v.string(),
    status: v.string(),
    categoria: v.optional(v.string()),
    banco: v.optional(v.string()),
    tarjeta: v.optional(v.string()),
    numero_cuenta: v.optional(v.string()),
    numero_transferencia: v.optional(v.string()),
    codigo_referencia: v.optional(v.string()),
    factura: v.optional(v.string()),
    comprobante: v.optional(v.string()),
    presupuesto_archivo: v.optional(v.string()),
    // Array of line items
    lineItems: v.array(
      v.object({
        partida_id: v.id("partidas"),
        partida: v.string(),
        familia: v.string(),
        sub_partida: v.string(),
        monto: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    await validateTransactionWrite(ctx, args.proyecto, args.proveedor_id);
    const { lineItems, allow_duplicate_signature, ...transactionData } = args;

    if (transactionData.import_batch_id && transactionData.import_source_key) {
      const existing = await ctx.db
        .query("transacciones")
        .withIndex("by_import_batch_source", (q) =>
          q.eq("import_batch_id", transactionData.import_batch_id)
            .eq("import_source_key", transactionData.import_source_key)
        )
        .first();
      if (existing) return { transaccionId: existing._id, pagoIds: [], duplicate: true };
    }
    if (transactionData.import_signature && !allow_duplicate_signature) {
      const duplicate = await ctx.db
        .query("transacciones")
        .withIndex("by_proyecto_import_signature", (q) =>
          q.eq("proyecto", args.proyecto).eq("import_signature", transactionData.import_signature)
        )
        .first();
      if (duplicate) throw new Error("La transacción coincide con una importación existente.");
    }
    const preparedLineItems = await prepareTransactionLineItems(
      ctx,
      args.proyecto,
      args.monto_total,
      lineItems,
    );

    // Normalize fecha to DD/MM/YYYY if it arrives as YYYY-MM-DD (from HTML date input)
    if (transactionData.fecha && transactionData.fecha.includes("-")) {
      const [year, month, day] = transactionData.fecha.split("-");
      transactionData.fecha = `${day}/${month}/${year}`;
    }

    // Create the parent transaction
    const transaccionId = await ctx.db.insert("transacciones", transactionData);

    // Create all line items referencing this transaction
    const pagoIds = [];
    const uniqueHierarchies = new Map<string, { partida: string; familia: string; sub_partida: string }>();
    
    for (const item of preparedLineItems) {
      const pagoId = await ctx.db.insert("pagos", {
        transaccion_id: transaccionId,
        partida_id: item.partida_id,
        proyecto_id: args.proyecto,
        concepto: item.concepto,
        concepto_normalizado: normalizeCostText(item.concepto),
        partida_nombre_snapshot: item.partida_nombre_snapshot,
        familia_snapshot: item.familia_snapshot,
        sub_partida_snapshot: item.sub_partida_snapshot,
        classification_status: "mapped",
        monto: item.monto,
      });
      pagoIds.push(pagoId);
      
      // Collect unique hierarchies (partida > familia > sub_partida combinations)
      const hierarchyKey = `${item.partida}|${item.familia}|${item.sub_partida}`;
      if (!uniqueHierarchies.has(hierarchyKey)) {
        uniqueHierarchies.set(hierarchyKey, {
          partida: item.partida,
          familia: item.familia,
          sub_partida: item.sub_partida,
        });
      }
    }

    // Note: Individual triggers will still fire for each pago insert
    // The optimization in updatePagadoForHierarchy (using indexed queries)
    // ensures each trigger execution is efficient
    
    console.log(`Created transaction with ${pagoIds.length} line items affecting ${uniqueHierarchies.size} unique hierarchies`);

    return {
      transaccionId,
      pagoIds,
      duplicate: false,
    };
  },
});

// Bulk version of createTransaction that bypasses per-item triggers.
// Inserts all records first, then runs hierarchy/metrics updates once.
// Use this for bulk uploads to avoid exceeding the 32K document read limit.
export const createTransactionBulk = baseMutation({
  args: {
    proyecto: v.id("desarrollos"),
    proveedor_id: v.optional(v.id("proveedores")),
    import_batch_id: v.optional(v.id("transaction_import_batches")),
    import_source_key: v.optional(v.string()),
    import_signature: v.optional(v.string()),
    allow_duplicate_signature: v.optional(v.boolean()),
    monto_total: v.number(),
    fecha: v.string(),
    tipo_pago: v.string(),
    moneda: v.string(),
    tipo_cambio: v.string(),
    status: v.string(),
    categoria: v.optional(v.string()),
    banco: v.optional(v.string()),
    tarjeta: v.optional(v.string()),
    numero_cuenta: v.optional(v.string()),
    numero_transferencia: v.optional(v.string()),
    codigo_referencia: v.optional(v.string()),
    factura: v.optional(v.string()),
    comprobante: v.optional(v.string()),
    presupuesto_archivo: v.optional(v.string()),
    lineItems: v.array(
      v.object({
        partida_id: v.id("partidas"),
        partida: v.string(),
        familia: v.string(),
        sub_partida: v.string(),
        monto: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    await validateTransactionWrite(ctx, args.proyecto, args.proveedor_id);
    const { lineItems, allow_duplicate_signature, ...transactionData } = args;

    if (transactionData.import_batch_id && transactionData.import_source_key) {
      const existing = await ctx.db
        .query("transacciones")
        .withIndex("by_import_batch_source", (q) =>
          q.eq("import_batch_id", transactionData.import_batch_id)
            .eq("import_source_key", transactionData.import_source_key)
        )
        .first();
      if (existing) return { transaccionId: existing._id, pagoIds: [], duplicate: true };
    }
    if (transactionData.import_signature && !allow_duplicate_signature) {
      const duplicate = await ctx.db
        .query("transacciones")
        .withIndex("by_proyecto_import_signature", (q) =>
          q.eq("proyecto", args.proyecto).eq("import_signature", transactionData.import_signature)
        )
        .first();
      if (duplicate) throw new Error("La transacción coincide con una importación existente.");
    }
    const preparedLineItems = await prepareTransactionLineItems(
      ctx,
      args.proyecto,
      args.monto_total,
      lineItems,
    );

    // Normalize fecha to DD/MM/YYYY if it arrives as YYYY-MM-DD
    let normalizedFecha = transactionData.fecha;
    if (normalizedFecha.includes("-")) {
      const [year, month, day] = normalizedFecha.split("-");
      normalizedFecha = `${day}/${month}/${year}`;
    }

    // Insert transaction (raw DB, no trigger)
    const transaccionId = await ctx.db.insert("transacciones", {
      ...transactionData,
      fecha: normalizedFecha,
    });

    // Insert all line items (raw DB, no triggers)
    const pagoIds = [];
    for (const item of preparedLineItems) {
      const pagoId = await ctx.db.insert("pagos", {
        transaccion_id: transaccionId,
        partida_id: item.partida_id,
        proyecto_id: args.proyecto,
        concepto: item.concepto,
        concepto_normalizado: normalizeCostText(item.concepto),
        partida_nombre_snapshot: item.partida_nombre_snapshot,
        familia_snapshot: item.familia_snapshot,
        sub_partida_snapshot: item.sub_partida_snapshot,
        classification_status: "mapped",
        monto: item.monto,
      });
      pagoIds.push(pagoId);
    }

    // Collect unique hierarchies to avoid redundant updates
    const uniqueHierarchies = new Map<string, { partida: string; familia: string; sub_partida: string; nivel: number }>();
    for (const item of preparedLineItems) {
      const hierarchyKey = `${item.partida}|${item.familia}|${item.sub_partida}`;
      if (!uniqueHierarchies.has(hierarchyKey)) {
        uniqueHierarchies.set(hierarchyKey, {
          partida: item.partida,
          familia: item.familia,
          sub_partida: item.sub_partida,
          nivel: item.partidaDoc.nivel,
        });
      }
    }

    // Run hierarchy updates ONCE per unique partida/familia/sub_partida combo
    const proyectoStr = args.proyecto as string;
    for (const [, hierarchy] of uniqueHierarchies) {
      await updatePagadoForHierarchy(ctx, { ...hierarchy, proyecto: proyectoStr });
    }

    // Run aggregate updates ONCE (not per line item)
    await updateMeticasPresupuesto(ctx, proyectoStr);
    await updateHonorariosMonto(ctx, proyectoStr);
    await updateProyectoMonedaPrincipal(ctx, proyectoStr);

    console.log(`[Bulk] Created transaction with ${pagoIds.length} line items, updated ${uniqueHierarchies.size} hierarchies`);

    return { transaccionId, pagoIds, duplicate: false };
  },
});

// Update transaction details (not the line items)
export const updateTransaction = mutation({
  args: {
    id: v.id("transacciones"),
    proveedor_id: v.optional(v.union(v.id("proveedores"), v.null())),
    monto_total: v.optional(v.number()),
    fecha: v.optional(v.string()),
    tipo_pago: v.optional(v.string()),
    moneda: v.optional(v.string()),
    tipo_cambio: v.optional(v.string()),
    status: v.optional(v.string()),
    categoria: v.optional(v.string()),
    banco: v.optional(v.string()),
    tarjeta: v.optional(v.string()),
    numero_cuenta: v.optional(v.string()),
    numero_transferencia: v.optional(v.string()),
    codigo_referencia: v.optional(v.string()),
    factura: v.optional(v.string()),
    comprobante: v.optional(v.string()),
    presupuesto_archivo: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...updateData } = args;

    const existingTransaction = await ctx.db.get(id);
    if (!existingTransaction) {
      throw new Error("Transaction not found");
    }
    await validateTransactionWrite(ctx, existingTransaction.proyecto, updateData.proveedor_id);
    if (updateData.monto_total !== undefined) {
      const lineItems = await ctx.db
        .query("pagos")
        .withIndex("by_transaccion", (q) => q.eq("transaccion_id", id))
        .collect();
      assertTransactionTotal(updateData.monto_total, lineItems);
    }

    // Filter out undefined values
    const cleanUpdateData: Record<string, unknown> = Object.fromEntries(
      Object.entries(updateData).filter(([, value]) => value !== undefined)
    );
    if (updateData.proveedor_id === null) {
      cleanUpdateData.proveedor_id = undefined;
    }

    if (transactionChangeInvalidatesInvoice(existingTransaction, updateData)) {
      await markInvoicesStaleForTransaction(ctx, id);
    }

    await ctx.db.patch(
      id,
      cleanUpdateData as Partial<
        Omit<Doc<"transacciones">, "_id" | "_creationTime" | "proyecto">
      >
    );
    return id;
  },
});

export const assignProviderBulk = baseMutation({
  args: {
    ids: v.array(v.id("transacciones")),
    proveedor_id: v.union(v.id("proveedores"), v.null()),
  },
  handler: async (ctx, args) => {
    await assertCanWrite(ctx);
    const ids = [...new Set(args.ids)];
    if (ids.length === 0) return { updated: 0 };

    if (args.proveedor_id) {
      const provider = await ctx.db.get(args.proveedor_id);
      if (!provider || provider.merged_into) throw new Error("Proveedor no encontrado.");
      if (provider.archived_at) throw new Error("No se puede asignar un proveedor archivado.");
    }

    const transactions = await Promise.all(ids.map((id) => ctx.db.get(id)));
    if (transactions.some((transaction) => !transaction)) {
      throw new Error("Una o más transacciones ya no existen.");
    }
    const projectIds = new Set(
      transactions.flatMap((transaction) => transaction ? [transaction.proyecto] : [])
    );
    for (const projectId of projectIds) {
      if (!(await checkDesarrolloAccess(ctx, projectId))) {
        throw new Error("No tienes acceso a uno de los proyectos seleccionados.");
      }
    }

    for (const transaction of transactions) {
      if (!transaction) continue;
      if (String(transaction.proveedor_id || "") !== String(args.proveedor_id || "")) {
        await markInvoicesStaleForTransaction(ctx, transaction._id);
      }
      await ctx.db.patch(transaction._id, {
        proveedor_id: args.proveedor_id || undefined,
      });
    }
    return { updated: transactions.length };
  },
});

export const previewProviderSyncPage = query({
  args: {
    proyecto_id: v.optional(v.id("desarrollos")),
    cursor: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    await assertProviderSyncScope(ctx, args.proyecto_id);
    const [page, providers] = await Promise.all([
      getProviderSyncPage(ctx, args.proyecto_id, args.cursor),
      ctx.db.query("proveedores").collect(),
    ]);
    const providersByName = buildProviderMatchIndex(providers);
    const rows = page.page.map((transaction) =>
      classifyTransactionProvider(transaction, providersByName)
    );
    const counts = emptyProviderSyncCounts();
    counts.scanned = rows.length;
    for (const row of rows) counts[row.status] += 1;

    return {
      counts,
      groups: groupProviderSyncRows(rows),
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

export const syncProvidersPage = baseMutation({
  args: {
    proyecto_id: v.optional(v.id("desarrollos")),
    cursor: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    await assertProviderSyncScope(ctx, args.proyecto_id);
    const [page, providers] = await Promise.all([
      getProviderSyncPage(ctx, args.proyecto_id, args.cursor),
      ctx.db.query("proveedores").collect(),
    ]);
    const providersByName = buildProviderMatchIndex(providers);
    const rows: ProviderSyncRow[] = [];
    const counts = emptyProviderSyncCounts();
    counts.scanned = page.page.length;

    for (const transaction of page.page) {
      const row = classifyTransactionProvider(transaction, providersByName);
      rows.push(row);
      counts[row.status] += 1;
      if (row.status !== "matched" || !row.providerId) continue;
      if (transaction.proveedor_id !== row.providerId) {
        await markInvoicesStaleForTransaction(ctx, transaction._id);
      }
      await ctx.db.patch(transaction._id, { proveedor_id: row.providerId });
      counts.updated += 1;
    }

    return {
      counts,
      groups: groupProviderSyncRows(rows),
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

export const previewProviderExcelSync = query({
  args: {
    proyecto_id: v.optional(v.id("desarrollos")),
    candidates: v.array(providerExcelCandidateValidator),
  },
  handler: async (ctx, args) => {
    await assertAdmin(ctx);
    return summarizeProviderExcelResolutions(
      await resolveProviderExcelCandidates(
        ctx,
        args.proyecto_id,
        args.candidates,
        PROVIDER_EXCEL_PREVIEW_BATCH_SIZE,
      ),
    );
  },
});

export const syncProvidersFromExcel = baseMutation({
  args: {
    proyecto_id: v.optional(v.id("desarrollos")),
    candidates: v.array(providerExcelCandidateValidator),
  },
  handler: async (ctx, args) => {
    await assertAdmin(ctx);
    const user = await getCurrentUserOrThrow(ctx);
    const resolutions = await resolveProviderExcelCandidates(
      ctx,
      args.proyecto_id,
      args.candidates,
      PROVIDER_EXCEL_SYNC_BATCH_SIZE,
    );
    const report = summarizeProviderExcelResolutions(resolutions);
    const createdProviders = new Map<string, Id<"proveedores">>();

    for (const resolution of resolutions) {
      if (
        !resolution.transactions?.length ||
        (resolution.status !== "ready_existing_provider" &&
          resolution.status !== "ready_new_provider")
      ) continue;

      let providerId = resolution.provider?._id;
      if (!providerId) {
        const normalizedName = normalizeProviderName(resolution.candidate.provider_name);
        providerId = createdProviders.get(normalizedName);
        if (!providerId) {
          providerId = await ctx.db.insert("proveedores", {
            razon_social: resolution.candidate.provider_name.trim(),
            razon_social_normalizada: normalizedName,
            tipo: isGenericProviderName(resolution.candidate.provider_name)
              ? "generico"
              : "regular",
            created_by: user._id,
            created_at: Date.now(),
            updated_at: Date.now(),
          });
          createdProviders.set(normalizedName, providerId);
          report.counts.providers_created += 1;
        }
      }

      for (const transaction of resolution.transactions) {
        if (transaction.proveedor_id !== providerId) {
          await markInvoicesStaleForTransaction(ctx, transaction._id);
        }
        await ctx.db.patch(transaction._id, {
          proveedor: resolution.candidate.provider_name.trim(),
          proveedor_id: providerId,
        });
        report.counts.updated += 1;
      }
    }

    return report;
  },
});

// Delete transaction and all its line items
export const deleteTransaction = mutation({
  args: {
    id: v.id("transacciones"),
  },
  handler: async (ctx, args) => {
    const existingTransaction = await ctx.db.get(args.id);
    if (!existingTransaction) {
      throw new Error("Transaction not found");
    }
    await assertCanWrite(ctx);
    if (!(await checkDesarrolloAccess(ctx, existingTransaction.proyecto))) {
      throw new Error("No tienes acceso para modificar este proyecto.");
    }

    await markInvoicesStaleForTransaction(ctx, args.id);

    // Delete all line items (pagos) associated with this transaction
    const lineItems = await ctx.db
      .query("pagos")
      .withIndex("by_transaccion", (q) => q.eq("transaccion_id", args.id))
      .collect();

    for (const item of lineItems) {
      await ctx.db.delete(item._id);
    }

    // Delete associated documents
    const documents = await ctx.db
      .query("documentos")
      .withIndex("by_transaccion", (q) => q.eq("transaccion_id", args.id))
      .collect();

    for (const doc of documents) {
      await ctx.db.delete(doc._id);
    }

    // Delete the transaction
    await ctx.db.delete(args.id);
  },
});

export const startImportBatch = baseMutation({
  args: {
    proyecto: v.id("desarrollos"),
    file_name: v.string(),
    file_hash: v.string(),
    total_transactions: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await assertCanWrite(ctx);
    if (!(await checkDesarrolloAccess(ctx, args.proyecto))) {
      throw new Error("No tienes acceso para importar en este proyecto.");
    }
    const existing = await ctx.db
      .query("transaction_import_batches")
      .withIndex("by_proyecto_file_hash", (q) =>
        q.eq("proyecto", args.proyecto).eq("file_hash", args.file_hash)
      )
      .first();
    if (existing?.status === "completed") {
      throw new Error("Este archivo ya fue importado en el proyecto.");
    }
    if (existing) {
      await ctx.db.patch(existing._id, {
        status: "processing",
        total_transactions: args.total_transactions,
        updated_at: Date.now(),
        error: undefined,
      });
      return { batch_id: existing._id, resumed: true };
    }
    const batchId = await ctx.db.insert("transaction_import_batches", {
      proyecto: args.proyecto,
      file_name: args.file_name,
      file_hash: args.file_hash,
      status: "processing",
      total_transactions: args.total_transactions,
      imported_transactions: 0,
      failed_transactions: 0,
      created_by: user._id,
      created_at: Date.now(),
      updated_at: Date.now(),
    });
    return { batch_id: batchId, resumed: false };
  },
});

export const completeImportBatch = baseMutation({
  args: {
    batch_id: v.id("transaction_import_batches"),
    imported_transactions: v.number(),
    failed_transactions: v.number(),
  },
  handler: async (ctx, args) => {
    await assertCanWrite(ctx);
    const batch = await ctx.db.get(args.batch_id);
    if (!batch) throw new Error("Lote de importación no encontrado.");
    if (!(await checkDesarrolloAccess(ctx, batch.proyecto))) {
      throw new Error("No tienes acceso a este lote.");
    }
    await ctx.db.patch(args.batch_id, {
      status: "completed",
      imported_transactions: args.imported_transactions,
      failed_transactions: args.failed_transactions,
      updated_at: Date.now(),
      completed_at: Date.now(),
      error: undefined,
    });
    return args.batch_id;
  },
});

export const failImportBatch = baseMutation({
  args: { batch_id: v.id("transaction_import_batches"), error: v.string() },
  handler: async (ctx, args) => {
    await assertCanWrite(ctx);
    const batch = await ctx.db.get(args.batch_id);
    if (!batch) return null;
    if (!(await checkDesarrolloAccess(ctx, batch.proyecto))) {
      throw new Error("No tienes acceso a este lote.");
    }
    await ctx.db.patch(args.batch_id, {
      status: "failed",
      error: args.error.slice(0, 500),
      updated_at: Date.now(),
    });
    return args.batch_id;
  },
});

export const checkImportSignatures = query({
  args: { proyecto: v.id("desarrollos"), signatures: v.array(v.string()) },
  handler: async (ctx, args) => {
    if (!(await checkDesarrolloAccess(ctx, args.proyecto))) {
      throw new Error("No tienes acceso a este proyecto.");
    }
    const duplicates: string[] = [];
    for (const signature of [...new Set(args.signatures)]) {
      const existing = await ctx.db
        .query("transacciones")
        .withIndex("by_proyecto_import_signature", (q) =>
          q.eq("proyecto", args.proyecto).eq("import_signature", signature)
        )
        .first();
      if (existing) duplicates.push(signature);
    }
    return duplicates;
  },
});

export const inspectImportCandidates = query({
  args: {
    proyecto: v.id("desarrollos"),
    file_hash: v.string(),
    candidates: v.array(v.object({
      signature: v.string(),
      source_key: v.string(),
    })),
  },
  handler: async (ctx, args) => {
    if (!(await checkDesarrolloAccess(ctx, args.proyecto))) {
      throw new Error("No tienes acceso a este proyecto.");
    }

    const existingBatch = await ctx.db
      .query("transaction_import_batches")
      .withIndex("by_proyecto_file_hash", (q) =>
        q.eq("proyecto", args.proyecto).eq("file_hash", args.file_hash)
      )
      .first();

    if (existingBatch?.status === "completed") {
      return {
        file_status: "completed" as const,
        batch_id: existingBatch._id,
        duplicate_signatures: [] as string[],
        resumable_source_keys: [] as string[],
      };
    }

    const duplicateSignatures = new Set<string>();
    const resumableSourceKeys = new Set<string>();

    for (const candidate of args.candidates) {
      if (existingBatch) {
        const existingSource = await ctx.db
          .query("transacciones")
          .withIndex("by_import_batch_source", (q) =>
            q.eq("import_batch_id", existingBatch._id)
              .eq("import_source_key", candidate.source_key)
          )
          .first();
        if (existingSource) {
          resumableSourceKeys.add(candidate.source_key);
          continue;
        }
      }

      const existingSignature = await ctx.db
        .query("transacciones")
        .withIndex("by_proyecto_import_signature", (q) =>
          q.eq("proyecto", args.proyecto).eq("import_signature", candidate.signature)
        )
        .first();
      if (existingSignature) duplicateSignatures.add(candidate.signature);
    }

    return {
      file_status: existingBatch?.status || "new" as const,
      batch_id: existingBatch?._id,
      duplicate_signatures: [...duplicateSignatures],
      resumable_source_keys: [...resumableSourceKeys],
    };
  },
});

// Get transaction with all its line items and documents
export const getTransactionById = query({
  args: {
    id: v.id("transacciones"),
  },
  handler: async (ctx, args) => {
    const transaction = await ctx.db.get(args.id);
    if (!transaction) {
      return null;
    }
    if (!(await checkDesarrolloAccess(ctx, transaction.proyecto))) {
      throw new Error("No tienes acceso a este proyecto.");
    }

    // Get all line items for this transaction
    const pagos = await ctx.db
      .query("pagos")
      .withIndex("by_transaccion", (q) => q.eq("transaccion_id", args.id))
      .collect();

    // Enrich each pago with its partida data
    const lineItems = await Promise.all(
      pagos.map(async (pago) => {
        const partida = pago.partida_id ? await ctx.db.get(pago.partida_id) : null;
        return {
          ...pago,
          partida: partida ? {
            _id: partida._id,
            nombre: partida.nombre,
            familia: partida.familia,
            sub_partida: partida.sub_partida,
          } : undefined,
        };
      })
    );

    // Get associated documents
    const documents = await ctx.db
      .query("documentos")
      .withIndex("by_transaccion", (q) => q.eq("transaccion_id", args.id))
      .collect();

    const proveedor = await providerSummary(ctx, transaction.proveedor_id);

    return {
      ...transaction,
      proveedor,
      lineItems,
      documents,
    };
  },
});

// Lightweight transaction details for the details modal. Keeping counts here
// avoids loading and enriching every line item when the modal only needs a
// summary.
export const getTransactionDetailsById = query({
  args: {
    id: v.id("transacciones"),
  },
  handler: async (ctx, args) => {
    const transaction = await ctx.db.get(args.id);
    if (!transaction) return null;
    if (!(await checkDesarrolloAccess(ctx, transaction.proyecto))) {
      throw new Error("No tienes acceso a este proyecto.");
    }

    const [lineItems, documents, proveedor] = await Promise.all([
      ctx.db
        .query("pagos")
        .withIndex("by_transaccion", (q) => q.eq("transaccion_id", args.id))
        .collect(),
      ctx.db
        .query("documentos")
        .withIndex("by_transaccion", (q) => q.eq("transaccion_id", args.id))
        .collect(),
      providerSummary(ctx, transaction.proveedor_id),
    ]);

    return {
      ...transaction,
      proveedor,
      lineItemsCount: lineItems.length,
      documentsCount: documents.length,
    };
  },
});

// Load only the enriched concepts needed by the concepts modal.
export const getTransactionConceptosById = query({
  args: {
    id: v.id("transacciones"),
  },
  handler: async (ctx, args) => {
    const transaction = await ctx.db.get(args.id);
    if (!transaction) return null;
    if (!(await checkDesarrolloAccess(ctx, transaction.proyecto))) {
      throw new Error("No tienes acceso a este proyecto.");
    }

    const pagos = await ctx.db
      .query("pagos")
      .withIndex("by_transaccion", (q) => q.eq("transaccion_id", args.id))
      .collect();

    const partidaIds = [...new Set(
      pagos.flatMap((pago) => pago.partida_id ? [pago.partida_id] : []),
    )];
    const partidas = await Promise.all(partidaIds.map((partidaId) => ctx.db.get(partidaId)));
    const partidasById = new Map(
      partidas
        .filter((partida): partida is NonNullable<typeof partida> => partida !== null)
        .map((partida) => [partida._id, partida])
    );
    const lineItems = pagos.map((pago) => {
      const partida = pago.partida_id ? partidasById.get(pago.partida_id) : undefined;
      return {
        ...pago,
        partida: partida ? {
          _id: partida._id,
          nombre: partida.nombre,
          familia: partida.familia,
          sub_partida: partida.sub_partida,
        } : undefined,
      };
    });

    return {
      ...transaction,
      lineItems,
    };
  },
});

// Load transaction documents with their actual storage URLs so the document
// modal can open both current Convex files and legacy URL-backed files.
export const getTransactionDocumentsById = query({
  args: {
    id: v.id("transacciones"),
  },
  handler: async (ctx, args) => {
    const transaction = await ctx.db.get(args.id);
    if (!transaction) return null;
    if (!(await checkDesarrolloAccess(ctx, transaction.proyecto))) {
      throw new Error("No tienes acceso a este proyecto.");
    }

    const documents = await ctx.db
      .query("documentos")
      .withIndex("by_transaccion", (q) => q.eq("transaccion_id", args.id))
      .collect();
    const documentsWithUrls = await Promise.all(
      documents.map(async (document) => ({
        ...document,
        url: document.storage_id
          ? await ctx.storage.getUrl(document.storage_id)
          : document.image || null,
      }))
    );

    return {
      ...transaction,
      documents: documentsWithUrls,
    };
  },
});

// List all transactions for a project
export const listByProyecto = query({
  args: {
    proyecto_id: v.id("desarrollos"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    if (!(await checkDesarrolloAccess(ctx, args.proyecto_id))) {
      throw new Error("No tienes acceso a este proyecto.");
    }
    const result = await ctx.db
      .query("transacciones")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto_id))
      .order("desc")
      .paginate(args.paginationOpts);

    // For each transaction, get its line items count
    const transactionsWithCounts = await Promise.all(
      result.page.map(async (transaction) => {
        const lineItemsCount = await ctx.db
          .query("pagos")
          .withIndex("by_transaccion", (q) =>
            q.eq("transaccion_id", transaction._id)
          )
          .collect()
          .then((items) => items.length);

        return {
          ...transaction,
          lineItemsCount,
        };
      })
    );

    return {
      ...result,
      page: transactionsWithCounts,
    };
  },
});

// Get all transactions for a proyecto (non-paginated)
export const getByProyecto = query({
  args: {
    proyecto_id: v.id("desarrollos"),
  },
  handler: async (ctx, args) => {
    if (!(await checkDesarrolloAccess(ctx, args.proyecto_id))) {
      throw new Error("No tienes acceso a este proyecto.");
    }
    const transactions = await ctx.db
      .query("transacciones")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto_id))
      .collect();

    return transactions;
  },
});

const TABLE_PAGE_SIZE_MIN = 25;
const TABLE_PAGE_SIZE_MAX = 50;

const tableListFilterValidator = {
  proyecto_id: v.id("desarrollos"),
  search: v.optional(v.string()),
  minAmount: v.optional(v.number()),
  maxAmount: v.optional(v.number()),
  dateFrom: v.optional(v.string()),
  dateTo: v.optional(v.string()),
  invoiceDateFrom: v.optional(v.string()),
  invoiceDateTo: v.optional(v.string()),
  status: v.optional(v.string()),
  tipoPago: v.optional(v.string()),
  categoria: v.optional(v.string()),
  moneda: v.optional(v.string()),
  proveedorId: v.optional(v.string()),
  missingDocuments: v.optional(v.boolean()),
};

type TableListFilterArgs = {
  proyecto_id: Id<"desarrollos">;
  search?: string;
  minAmount?: number;
  maxAmount?: number;
  dateFrom?: string;
  dateTo?: string;
  invoiceDateFrom?: string;
  invoiceDateTo?: string;
  status?: string;
  tipoPago?: string;
  categoria?: string;
  moneda?: string;
  proveedorId?: string;
  missingDocuments?: boolean;
};

function parseFechaParts(fecha: string): { day: number; month: number; year: number } | null {
  const parts = fecha.split("/");
  if (parts.length !== 3) return null;
  const day = Number(parts[0]);
  const month = Number(parts[1]);
  const year = Number(parts[2]);
  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return null;
  return { day, month, year };
}

function fechaSortValue(fecha: string): number {
  const parts = parseFechaParts(fecha);
  if (!parts) return 0;
  return parts.year * 10000 + parts.month * 100 + parts.day;
}

function fechaToYmd(fecha: string): string | null {
  const parts = parseFechaParts(fecha);
  if (!parts) return null;
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function includesSearch(value: string | undefined, search: string): boolean {
  return Boolean(value && value.toLowerCase().includes(search));
}

async function loadProviderSummaries(
  ctx: QueryCtx,
  proveedorIds: Array<Id<"proveedores">>,
) {
  const uniqueIds = [...new Set(proveedorIds)];
  const summaries = await Promise.all(uniqueIds.map((id) => providerSummary(ctx, id)));
  return new Map(
    summaries
      .filter((summary): summary is NonNullable<typeof summary> => summary !== null)
      .map((summary) => [summary._id, summary]),
  );
}

async function collectRelatedSearchMatchIds(
  ctx: QueryCtx,
  proyectoId: Id<"desarrollos">,
  search: string,
) {
  const matchIds = new Set<string>();
  const [pagos, partidas, invoices] = await Promise.all([
    ctx.db.query("pagos").withIndex("by_proyecto", (q) => q.eq("proyecto_id", proyectoId)).collect(),
    ctx.db.query("partidas").withIndex("by_proyecto", (q) => q.eq("proyecto", proyectoId)).collect(),
    ctx.db
      .query("invoice_records")
      .withIndex("by_project_status", (q) => q.eq("proyecto", proyectoId).eq("status", "approved"))
      .collect(),
  ]);

  const matchingPartidaIds = new Set(
    partidas
      .filter((partida) =>
        includesSearch(partida.nombre, search) ||
        includesSearch(partida.familia, search) ||
        includesSearch(partida.sub_partida, search)
      )
      .map((partida) => partida._id),
  );

  for (const pago of pagos) {
    const matchesText =
      includesSearch(pago.concepto, search) ||
      includesSearch(pago.source_description_snapshot, search) ||
      includesSearch(pago.sub_partida_snapshot, search) ||
      includesSearch(pago.familia_snapshot, search) ||
      includesSearch(pago.partida_nombre_snapshot, search);
    if (matchesText || (pago.partida_id && matchingPartidaIds.has(pago.partida_id))) {
      matchIds.add(pago.transaccion_id);
    }
  }

  const categoryIds = [...new Set(invoices.flatMap((invoice) => invoice.approved_category_ids ?? []))];
  const categories = await Promise.all(categoryIds.map((id) => ctx.db.get(id)));
  const matchingCategoryIds = new Set(
    categories
      .filter((category): category is NonNullable<typeof category> =>
        Boolean(
          category &&
          (includesSearch(category.code, search) || includesSearch(category.label, search)),
        )
      )
      .map((category) => category._id),
  );

  for (const invoice of invoices) {
    const matchesText =
      includesSearch(invoice.folio, search) ||
      includesSearch(invoice.uuid, search) ||
      includesSearch(invoice.issuer_name, search);
    const matchesCategory = invoice.approved_category_ids?.some((id) => matchingCategoryIds.has(id));
    if (!matchesText && !matchesCategory) continue;
    if (invoice.primary_transaction_id) matchIds.add(invoice.primary_transaction_id);
    for (const transactionId of invoice.source_transaction_ids) {
      matchIds.add(transactionId);
    }
  }

  return matchIds;
}

async function loadLinkedDocumentCounts(
  ctx: QueryCtx,
  proyectoId: Id<"desarrollos">,
) {
  const documents = await ctx.db
    .query("documentos")
    .withIndex("by_proyecto", (q) => q.eq("proyecto", proyectoId))
    .collect();

  const counts = new Map<string, number>();
  for (const document of documents) {
    if (!document.transaccion_id) continue;
    counts.set(document.transaccion_id, (counts.get(document.transaccion_id) ?? 0) + 1);
  }
  return counts;
}

async function listFilteredProjectTransactions(
  ctx: QueryCtx,
  args: TableListFilterArgs,
) {
  const search = args.search?.trim().toLowerCase() || "";
  const transactions = await ctx.db
    .query("transacciones")
    .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto_id))
    .collect();

  const providerSummaries = search
    ? await loadProviderSummaries(
        ctx,
        transactions.flatMap((transaction) => transaction.proveedor_id ? [transaction.proveedor_id] : []),
      )
    : new Map<Id<"proveedores">, NonNullable<Awaited<ReturnType<typeof providerSummary>>>>();
  const relatedMatchIds = search
    ? await collectRelatedSearchMatchIds(ctx, args.proyecto_id, search)
    : null;
  const documentCounts = args.missingDocuments !== undefined
    ? await loadLinkedDocumentCounts(ctx, args.proyecto_id)
    : null;

  const approvedInvoiceDates = new Map<string, Set<string>>();
  if (args.invoiceDateFrom || args.invoiceDateTo) {
    const approvedInvoices = await ctx.db
      .query("invoice_records")
      .withIndex("by_project_status", (q) => q.eq("proyecto", args.proyecto_id).eq("status", "approved"))
      .collect();
    for (const invoice of approvedInvoices) {
      const issuedDate = parseInvoiceIssuedDate(invoice.issued_at);
      if (!issuedDate) continue;
      for (const transactionId of invoice.source_transaction_ids) {
        const key = String(transactionId);
        const dates = approvedInvoiceDates.get(key) || new Set<string>();
        dates.add(issuedDate);
        approvedInvoiceDates.set(key, dates);
      }
    }
  }

  const filtered = transactions.filter((transaction) => {
    if (search) {
      const providerName = transaction.proveedor_id
        ? providerSummaries.get(transaction.proveedor_id)?.razon_social
        : undefined;
      const matchesText =
        includesSearch(transaction.factura, search) ||
        includesSearch(transaction.codigo_referencia, search) ||
        includesSearch(transaction.tipo_pago, search) ||
        includesSearch(transaction.categoria, search) ||
        includesSearch(transaction.banco, search) ||
        includesSearch(providerName, search);
      if (!matchesText && !relatedMatchIds?.has(transaction._id)) return false;
    }

    if (args.minAmount != null && Number.isFinite(args.minAmount) && transaction.monto_total < args.minAmount) {
      return false;
    }
    if (args.maxAmount != null && Number.isFinite(args.maxAmount) && transaction.monto_total > args.maxAmount) {
      return false;
    }

    const transactionYmd = fechaToYmd(transaction.fecha);
    if (args.dateFrom && (!transactionYmd || transactionYmd < args.dateFrom)) return false;
    if (args.dateTo && (!transactionYmd || transactionYmd > args.dateTo)) return false;
    const invoiceDates = approvedInvoiceDates.get(String(transaction._id));
    if ((args.invoiceDateFrom || args.invoiceDateTo) && !invoiceDates?.size) return false;
    if (invoiceDates && ![...invoiceDates].some((invoiceYmd) =>
      (!args.invoiceDateFrom || invoiceYmd >= args.invoiceDateFrom) &&
      (!args.invoiceDateTo || invoiceYmd <= args.invoiceDateTo))) return false;

    if (args.status && transaction.status !== args.status) return false;
    if (args.tipoPago && transaction.tipo_pago?.toLowerCase() !== args.tipoPago.toLowerCase()) return false;
    if (args.categoria && transaction.categoria?.toLowerCase() !== args.categoria.toLowerCase()) return false;
    if (args.moneda && transaction.moneda !== args.moneda) return false;

    if (args.proveedorId === "unassigned") {
      if (transaction.proveedor_id) return false;
    } else if (args.proveedorId && transaction.proveedor_id !== args.proveedorId) {
      return false;
    }

    if (args.missingDocuments && (documentCounts?.get(transaction._id) ?? 0) > 0) {
      return false;
    }
    if (args.missingDocuments === false && (documentCounts?.get(transaction._id) ?? 0) === 0) {
      return false;
    }

    return true;
  });

  return { filtered, providerSummaries, search };
}

// Aggregated project totals plus pending-work counts for the transactions table.
export const getTotalsByProyecto = query({
  args: {
    proyecto_id: v.id("desarrollos"),
  },
  handler: async (ctx, args) => {
    if (!(await checkDesarrolloAccess(ctx, args.proyecto_id))) {
      throw new Error("No tienes acceso a este proyecto.");
    }
    const [transactions, documentCounts] = await Promise.all([
      ctx.db
        .query("transacciones")
        .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto_id))
        .collect(),
      loadLinkedDocumentCounts(ctx, args.proyecto_id),
    ]);

    let withoutProvider = 0;
    let withoutDocuments = 0;
    let amount = 0;
    for (const transaction of transactions) {
      amount += transaction.monto_total;
      if (!transaction.proveedor_id) withoutProvider += 1;
      if ((documentCounts.get(transaction._id) ?? 0) === 0) withoutDocuments += 1;
    }

    return {
      count: transactions.length,
      amount,
      withoutProvider,
      withoutDocuments,
    };
  },
});

// Lightweight paginated table query. Concepts, documents, and invoice analysis
// stay out of this result and are loaded by the transaction modals on demand.
export const listTableByProyecto = query({
  args: {
    ...tableListFilterValidator,
    page: v.number(),
    pageSize: v.number(),
    sortField: v.union(v.literal("fecha"), v.literal("monto_total")),
    sortDirection: v.union(v.literal("asc"), v.literal("desc")),
  },
  handler: async (ctx, args) => {
    if (!(await checkDesarrolloAccess(ctx, args.proyecto_id))) {
      throw new Error("No tienes acceso a este proyecto.");
    }

    const pageSize = Math.min(Math.max(Math.trunc(args.pageSize), TABLE_PAGE_SIZE_MIN), TABLE_PAGE_SIZE_MAX);
    const page = Math.max(Math.trunc(args.page), 1);
    const { filtered, providerSummaries, search } = await listFilteredProjectTransactions(ctx, args);

    filtered.sort((a, b) => {
      const comparison = args.sortField === "monto_total"
        ? a.monto_total - b.monto_total
        : fechaSortValue(a.fecha) - fechaSortValue(b.fecha);
      return args.sortDirection === "asc" ? comparison : -comparison;
    });

    const total = filtered.length;
    const matchedAmount = filtered.reduce((sum, transaction) => sum + transaction.monto_total, 0);
    const totalPages = Math.max(Math.ceil(total / pageSize), 1);
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * pageSize;
    const pageRows = filtered.slice(start, start + pageSize);

    const pageProviderSummaries = search
      ? providerSummaries
      : await loadProviderSummaries(
          ctx,
          pageRows.flatMap((transaction) => transaction.proveedor_id ? [transaction.proveedor_id] : []),
        );

    const items = await Promise.all(pageRows.map(async (transaction) => {
      const documents = await ctx.db
        .query("documentos")
        .withIndex("by_transaccion", (q) => q.eq("transaccion_id", transaction._id))
        .collect();

      return {
        ...transaction,
        proveedor: transaction.proveedor_id
          ? pageProviderSummaries.get(transaction.proveedor_id) ?? null
          : null,
        documentsCount: documents.length,
      };
    }));

    return {
      items,
      total,
      matchedAmount,
      page: safePage,
      pageSize,
      totalPages,
    };
  },
});

export const listTableIdsByProyecto = query({
  args: tableListFilterValidator,
  handler: async (ctx, args) => {
    if (!(await checkDesarrolloAccess(ctx, args.proyecto_id))) {
      throw new Error("No tienes acceso a este proyecto.");
    }

    const { filtered } = await listFilteredProjectTransactions(ctx, args);
    return filtered.map((transaction) => transaction._id);
  },
});

// Heavy per-row enrichment for compact dashboard views. The project transactions
// table uses listTableByProyecto instead of loading concepts, documents, and
// invoice analysis for every row.
export const getByProyectoWithDetails = query({
  args: {
    proyecto_id: v.id("desarrollos"),
  },
  handler: async (ctx, args) => {
    if (!(await checkDesarrolloAccess(ctx, args.proyecto_id))) {
      throw new Error("No tienes acceso a este proyecto.");
    }
    const transactions = await ctx.db
      .query("transacciones")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto_id))
      .order("desc")
      .collect();

    // For each transaction, count related data and get partida info
    const transactionsWithDetails = await Promise.all(
      transactions.map(async (transaction) => {
        const proveedor = await providerSummary(ctx, transaction.proveedor_id);
        const approvedInvoice = await ctx.db
          .query("invoice_records")
          .withIndex("by_transaction", (q) => q.eq("primary_transaction_id", transaction._id))
          .filter((q) => q.eq(q.field("status"), "approved"))
          .order("desc")
          .first();
        // Get line items with partida details
        const lineItems = await ctx.db
          .query("pagos")
          .withIndex("by_transaccion", (q) =>
            q.eq("transaccion_id", transaction._id)
          )
          .collect();

        // Get partida names for display
        const partidaNames: string[] = [];
        const costConcepts: string[] = [];
        for (const item of lineItems) {
          const partida = item.partida_id ? await ctx.db.get(item.partida_id) : null;
          const label = item.concepto || partida?.sub_partida || partida?.familia || partida?.nombre || "Sin nombre";
          partidaNames.push(label);
          costConcepts.push(
            ...[
              item.concepto,
              item.sub_partida_snapshot,
              item.familia_snapshot,
              item.partida_nombre_snapshot,
              partida?.sub_partida,
              partida?.familia,
              partida?.nombre,
            ].flatMap((value) => value?.trim() ? [value.trim()] : []),
          );
        }

        // Get documents with URLs
        const documents = await ctx.db
          .query("documentos")
          .withIndex("by_transaccion", (q) =>
            q.eq("transaccion_id", transaction._id)
          )
          .collect();

        // Get URL for the first document (factura)
        let firstDocumentUrl: string | null = null;
        if (documents.length > 0) {
          const firstDoc = documents[0];
          if (firstDoc.storage_id) {
            firstDocumentUrl = await ctx.storage.getUrl(firstDoc.storage_id);
          } else if (firstDoc.image) {
            firstDocumentUrl = firstDoc.image;
          }
        }
        const invoiceAnalysisTerms: string[] = [];
        if (approvedInvoice?.active_run_id) {
          const approvedItems = await ctx.db
            .query("invoice_items")
            .withIndex("by_run", (q) => q.eq("run_id", approvedInvoice.active_run_id!))
            .collect();
          const categoryIds = [...new Set(approvedItems.flatMap((item) => item.category_id ? [item.category_id] : []))];
          const categories = await Promise.all(categoryIds.map((id) => ctx.db.get(id)));
          invoiceAnalysisTerms.push(
            ...approvedItems.map((item) => item.canonical_label),
            ...categories.flatMap((category) => category ? [category.code, category.label] : []),
            ...(approvedInvoice.folio ? [approvedInvoice.folio] : []),
            ...(approvedInvoice.uuid ? [approvedInvoice.uuid] : []),
          );
        }

        return {
          ...transaction,
          proveedor,
          lineItemsCount: lineItems.length,
          documentsCount: documents.length,
          partidaNames: partidaNames.slice(0, 3), // First 3 partida names
          costConcepts: [...new Set(costConcepts)],
          invoiceAnalysisTerms: [...new Set(invoiceAnalysisTerms)],
          invoiceIssuedAt: approvedInvoice?.issued_at,
          documentUrl: firstDocumentUrl, // URL to open the document
        };
      })
    );

    return transactionsWithDetails;
  },
});

// Get aggregated payment data by partida (for backward compatibility with existing views)
export const getByPartidaName = query({
  args: {
    partida_name: v.string(),
    proyecto_id: v.optional(v.id("desarrollos")),
  },
  handler: async (ctx, args) => {
    // Use indexed query based on whether proyecto_id is provided
    const matchingPartidas = args.proyecto_id
      ? await ctx.db
          .query("partidas")
          .withIndex("by_nombre_proyecto", (q) => 
            q.eq("nombre", args.partida_name).eq("proyecto", args.proyecto_id)
          )
          .collect()
      : await ctx.db
          .query("partidas")
          .withIndex("by_nombre", (q) => q.eq("nombre", args.partida_name))
          .collect();

    // Get pagos for these partidas
    const allPayments = [];
    for (const partida of matchingPartidas) {
      const pagos = await ctx.db
        .query("pagos")
        .withIndex("by_partida_id", (q) => q.eq("partida_id", partida._id))
        .collect();

      for (const pago of pagos) {
        const transaction = await ctx.db.get(pago.transaccion_id);
        if (!args.proyecto_id || transaction?.proyecto === args.proyecto_id) {
          allPayments.push({
            ...pago,
            partida: partida.nombre,
            familia: partida.familia,
            sub_partida: partida.sub_partida,
            transaction,
          });
        }
      }
    }

    return allPayments;
  },
});

// Get aggregated payment data by familia (for backward compatibility)
export const getByFamilia = query({
  args: {
    partida_name: v.string(),
    familia_name: v.string(),
    proyecto_id: v.optional(v.id("desarrollos")),
  },
  handler: async (ctx, args) => {
    // Use indexed query based on whether proyecto_id is provided
    const matchingPartidas = args.proyecto_id
      ? await ctx.db
          .query("partidas")
          .withIndex("by_nombre_familia_proyecto", (q) => 
            q.eq("nombre", args.partida_name)
             .eq("familia", args.familia_name)
             .eq("proyecto", args.proyecto_id)
          )
          .collect()
      : await ctx.db
          .query("partidas")
          .withIndex("by_nombre_familia", (q) => 
            q.eq("nombre", args.partida_name).eq("familia", args.familia_name)
          )
          .collect();

    // Get pagos for these partidas
    const allPayments = [];
    for (const partida of matchingPartidas) {
      const pagos = await ctx.db
        .query("pagos")
        .withIndex("by_partida_id", (q) => q.eq("partida_id", partida._id))
        .collect();

      for (const pago of pagos) {
        const transaction = await ctx.db.get(pago.transaccion_id);
        if (!args.proyecto_id || transaction?.proyecto === args.proyecto_id) {
          allPayments.push({
            ...pago,
            partida: partida.nombre,
            familia: partida.familia,
            sub_partida: partida.sub_partida,
            transaction,
          });
        }
      }
    }

    return allPayments;
  },
});

// Get all line items (pagos) for a specific partida_id
export const getByPartidaId = query({
  args: {
    partida_id: v.id("partidas"),
  },
  handler: async (ctx, args) => {
    const payments = await ctx.db
      .query("pagos")
      .withIndex("by_partida_id", (q) => q.eq("partida_id", args.partida_id))
      .collect();

    // For each payment, get its parent transaction
    const paymentsWithTransactions = await Promise.all(
      payments.map(async (pago) => {
        const transaction = await ctx.db.get(pago.transaccion_id);
        return {
          ...pago,
          transaction,
        };
      })
    );

    return paymentsWithTransactions;
  },
});

// Paginated admin table query. Loading every transaction and then querying its
// related records exceeded Convex's read limit once the dataset grew, so the
// enrichment is intentionally limited to the current page.
export const getAllWithDetails = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    await assertAdmin(ctx);
    const result = await ctx.db
      .query("transacciones")
      .order("desc")
      .paginate(args.paginationOpts);

    const projectIds = [...new Set(result.page.map((transaction) => transaction.proyecto))];
    const projects = await Promise.all(projectIds.map((projectId) => ctx.db.get(projectId)));
    const projectsById = new Map(
      projects
        .filter((project): project is NonNullable<typeof project> => project !== null)
        .map((project) => [project._id, project]),
    );
    const providerSummaries = await loadProviderSummaries(
      ctx,
      result.page.flatMap((transaction) => transaction.proveedor_id ? [transaction.proveedor_id] : []),
    );

    const transactionsWithDetails = await Promise.all(
      result.page.map(async (transaction) => {
        const [lineItems, documents] = await Promise.all([
          ctx.db
            .query("pagos")
            .withIndex("by_transaccion", (q) => q.eq("transaccion_id", transaction._id))
            .collect(),
          ctx.db
            .query("documentos")
            .withIndex("by_transaccion", (q) => q.eq("transaccion_id", transaction._id))
            .collect(),
        ]);

        return {
          ...transaction,
          proveedor: transaction.proveedor_id
            ? providerSummaries.get(transaction.proveedor_id) ?? null
            : null,
          proyectoNombre: projectsById.get(transaction.proyecto)?.nombre,
          lineItemsCount: lineItems.length,
          documentsCount: documents.length,
        };
      })
    );

    return {
      ...result,
      page: transactionsWithDetails,
    };
  },
});

// Get progress chart data for a project (cumulative spending over time)
export const getProgressChartData = query({
  args: {
    proyecto_id: v.id("desarrollos"),
  },
  handler: async (ctx, args) => {
    // Get all partidas for the project to calculate total budget
    const partidas = await ctx.db
      .query("partidas")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto_id))
      .collect();

    const totalPresupuestoAprobado = partidas.reduce(
      (sum, p) => sum + (p.presupuesto_aprobado || 0),
      0
    );

    // Get all transactions for the project sorted by date (ascending)
    const transactions = await ctx.db
      .query("transacciones")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto_id))
      .collect();

    // Sort transactions by date (handle both DD/MM/YYYY and YYYY-MM-DD formats)
    const sortedTransactions = transactions.sort((a, b) => {
      const parseDate = (dateStr: string | undefined) => {
        if (!dateStr) return 0;
        
        // Handle "DD/MM/YYYY" format
        if (dateStr.includes('/')) {
          const parts = dateStr.split('/').map(Number);
          if (parts.length !== 3) return 0;
          const [day, month, year] = parts;
          return new Date(year, month - 1, day).getTime();
        }
        
        // Handle "YYYY-MM-DD" format (ISO)
        if (dateStr.includes('-')) {
          const parts = dateStr.split('-').map(Number);
          if (parts.length !== 3) return 0;
          const [year, month, day] = parts;
          return new Date(year, month - 1, day).getTime();
        }
        
        return 0;
      };
      return parseDate(a.fecha) - parseDate(b.fecha);
    });

    // Create cumulative data points
    const dataPoints: Array<{
      date: string;
      gastoProgramado: number;
      gastoTotal: number;
      avanceReal: number;
    }> = [];

    let cumulativeGasto = 0;

    for (let i = 0; i < sortedTransactions.length; i++) {
      const transaction = sortedTransactions[i];
      
      // Skip transactions without a valid date
      if (!transaction.fecha || typeof transaction.fecha !== 'string') {
        console.warn('Transaction missing fecha:', transaction._id);
        continue;
      }
      
      // Only count "Pagado" transactions
      if (transaction.status === "Pagado") {
        cumulativeGasto += transaction.monto_total;
      }

      // Calculate programmed spending (linear projection from 0 to total budget)
      const progress = (i + 1) / sortedTransactions.length;
      const gastoProgramado = totalPresupuestoAprobado * progress;

      // Calculate real progress percentage
      const avanceReal = totalPresupuestoAprobado > 0 
        ? (cumulativeGasto / totalPresupuestoAprobado) * 100 
        : 0;

      // Format date as "DD Mon YYYY" with full year for better compatibility
      // Handle both "DD/MM/YYYY" and "YYYY-MM-DD" formats
      let day: string, month: string, year: string;
      
      if (transaction.fecha.includes('/')) {
        // Format: "DD/MM/YYYY"
        const parts = transaction.fecha.split('/');
        if (parts.length !== 3) {
          console.warn('Invalid fecha format (expected DD/MM/YYYY):', transaction.fecha);
          continue;
        }
        [day, month, year] = parts;
      } else if (transaction.fecha.includes('-')) {
        // Format: "YYYY-MM-DD"
        const parts = transaction.fecha.split('-');
        if (parts.length !== 3) {
          console.warn('Invalid fecha format (expected YYYY-MM-DD):', transaction.fecha);
          continue;
        }
        [year, month, day] = parts;
      } else {
        console.warn('Invalid fecha format (unknown format):', transaction.fecha);
        continue;
      }
      
      const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
      const monthName = monthNames[parseInt(month, 10) - 1] || 'Ene';
      const dateLabel = `${day} ${monthName} ${year}`;

      dataPoints.push({
        date: dateLabel,
        gastoProgramado,
        gastoTotal: cumulativeGasto,
        avanceReal,
      });
    }

    return dataPoints;
  },
});

// Get chart data for a specific familia (e.g., MANO DE OBRA, HONORARIOS)
// Now supports optional filtering by partida names, familia names, and sub-partida names
export const getFamiliaChartData = query({
  args: {
    proyecto_id: v.id("desarrollos"),
    familia: v.optional(v.string()), // Made optional for flexibility
    partidas: v.optional(v.array(v.string())), // Filter by specific partida names
    familias: v.optional(v.array(v.string())), // Filter by specific familia names
    sub_partidas: v.optional(v.array(v.string())), // Filter by specific sub-partida names
  },
  handler: async (ctx, args) => {
    // Get all partidas for this project
    const partidas = await ctx.db
      .query("partidas")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto_id))
      .collect();

    // Apply filters based on provided criteria
    let filteredPartidas = partidas;

    // Filter by partida names (nivel 1)
    if (args.partidas && args.partidas.length > 0) {
      filteredPartidas = filteredPartidas.filter(p => 
        args.partidas!.includes(p.nombre) || 
        args.partidas!.includes(p.partida_nombre || "")
      );
    }

    // Filter by familia names
    if (args.familias && args.familias.length > 0) {
      filteredPartidas = filteredPartidas.filter(p => args.familias!.includes(p.familia));
    } else if (args.familia) {
      // Backward compatibility: use single familia if provided
      filteredPartidas = filteredPartidas.filter(p => p.familia === args.familia);
    }

    // Filter by sub-partida names
    if (args.sub_partidas && args.sub_partidas.length > 0) {
      filteredPartidas = filteredPartidas.filter(p => args.sub_partidas!.includes(p.sub_partida));
    }

    const partidaIds = filteredPartidas.map(p => p._id);

    if (partidaIds.length === 0) {
      return { dataPoints: [], total: 0 };
    }

    // Get all pagos for these partidas
    const allPagos: Array<{
      monto: number;
      transaction: {
        fecha: string;
        status: string;
      };
    }> = [];

    for (const partidaId of partidaIds) {
      const pagos = await ctx.db
        .query("pagos")
        .withIndex("by_partida_id", (q) => q.eq("partida_id", partidaId))
        .collect();

      for (const pago of pagos) {
        const transaction = await ctx.db.get(pago.transaccion_id);
        if (transaction && transaction.status === "Pagado") {
          allPagos.push({
            monto: pago.monto,
            transaction,
          });
        }
      }
    }

    // Sort by transaction date (handle both DD/MM/YYYY and YYYY-MM-DD formats)
    const sortedPagos = allPagos.sort((a, b) => {
      const parseDate = (dateStr: string) => {
        // Handle "DD/MM/YYYY" format
        if (dateStr.includes('/')) {
          const [day, month, year] = dateStr.split('/').map(Number);
          return new Date(year, month - 1, day).getTime();
        }
        // Handle "YYYY-MM-DD" format (ISO)
        if (dateStr.includes('-')) {
          const [year, month, day] = dateStr.split('-').map(Number);
          return new Date(year, month - 1, day).getTime();
        }
        return 0;
      };
      return parseDate(a.transaction.fecha) - parseDate(b.transaction.fecha);
    });

    // Create cumulative data points
    const dataPoints: Array<{
      date: string;
      monto: number;
    }> = [];

    let cumulativeMonto = 0;

    for (let i = 0; i < sortedPagos.length; i++) {
      const pago = sortedPagos[i];
      cumulativeMonto += pago.monto;

      // Format date as "DD Mon" (handle both DD/MM/YYYY and YYYY-MM-DD formats)
      let day: string, month: string;
      
      if (pago.transaction.fecha.includes('/')) {
        // Format: "DD/MM/YYYY"
        [day, month] = pago.transaction.fecha.split('/');
      } else {
        // Format: "YYYY-MM-DD"
        const parts = pago.transaction.fecha.split('-');
        [, month, day] = parts; // Extract year, month, day
      }
      
      const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
      const monthName = monthNames[parseInt(month, 10) - 1] || 'Ene';
      const dateLabel = `${day} ${monthName}`;

      dataPoints.push({
        date: dateLabel,
        monto: cumulativeMonto,
      });
    }

    return {
      dataPoints,
      total: cumulativeMonto,
    };
  },
});

export const getTopVariancePartidas = query({
  args: {
    proyecto_id: v.id("desarrollos"),
  },
  handler: async (ctx, args) => {
    const partidas = await ctx.db
      .query("partidas")
      .withIndex("by_nivel_proyecto", (q) => q.eq("nivel", 1).eq("proyecto", args.proyecto_id))
      .collect();

    return partidas
      .map((partida) => {
        const presupuesto = Number.isFinite(partida.presupuesto_aprobado) ? partida.presupuesto_aprobado : 0;
        const pagado = Number.isFinite(partida.pagado) ? partida.pagado : 0;
        const varianza = pagado - presupuesto;
        const avance = presupuesto > 0 ? (pagado / presupuesto) * 100 : null;

        return {
          id: partida._id,
          partida: partida.nombre?.trim() || "Sin partida",
          presupuesto,
          pagado,
          varianza,
          avance,
        };
      })
      .sort((a, b) => {
        const varianceDiff = Math.abs(b.varianza) - Math.abs(a.varianza);
        if (varianceDiff !== 0) return varianceDiff;
        return a.partida.localeCompare(b.partida, "es");
      })
      .slice(0, 5);
  },
});

// PROVISIONAL: Migration function to transfer values from codigo_referencia to categoria
// This should be run once and then removed
export const migrateCodigoReferenciaToCategoria = mutation({
  args: {},
  handler: async (ctx) => {
    // Get all transactions
    const allTransactions = await ctx.db.query("transacciones").collect();
    
    let migratedCount = 0;
    const migrationLog: Array<{
      id: string;
      oldCodigoReferencia: string;
      newCategoria: string;
    }> = [];

    for (const transaction of allTransactions) {
      // Only migrate if:
      // 1. codigo_referencia has a value
      // 2. categoria is empty or undefined
      if (transaction.codigo_referencia && !transaction.categoria) {
        await ctx.db.patch(transaction._id, {
          categoria: transaction.codigo_referencia,
          codigo_referencia: "", // Clear the old field
        });
        
        migratedCount++;
        migrationLog.push({
          id: transaction._id,
          oldCodigoReferencia: transaction.codigo_referencia,
          newCategoria: transaction.codigo_referencia,
        });
      }
    }

    return {
      success: true,
      migratedCount,
      totalTransactions: allTransactions.length,
      migrationLog,
    };
  },
});

// PROVISIONAL: Bulk increment fecha by one day for all transacciones of a proyecto
// Run once from the Convex dashboard, then remove.
export const incrementFechaByOneDay = mutation({
  args: {
    proyecto_id: v.id("desarrollos"),
  },
  handler: async (ctx, args) => {
    const transactions = await ctx.db
      .query("transacciones")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto_id))
      .collect();

    let updatedCount = 0;
    const log: Array<{ id: string; oldFecha: string; newFecha: string }> = [];

    for (const tx of transactions) {
      if (!tx.fecha) continue;

      // Parse DD/MM/YYYY
      const parts = tx.fecha.split("/");
      if (parts.length !== 3) continue;

      const [day, month, year] = parts.map(Number);
      const date = new Date(year, month - 1, day);
      date.setDate(date.getDate() + 1);

      const newFecha = `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;

      await markInvoicesStaleForTransaction(ctx, tx._id);
      await ctx.db.patch(tx._id, { fecha: newFecha });
      updatedCount++;
      log.push({ id: tx._id, oldFecha: tx.fecha, newFecha });
    }

    return {
      success: true,
      updatedCount,
      totalTransactions: transactions.length,
      log,
    };
  },
});
