import { query, mutation as baseMutation } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, updatePagadoForHierarchy, updateMeticasPresupuesto, updateHonorariosMonto, updateProyectoMonedaPrincipal } from "./functions";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { assertAdmin, assertCanWrite, checkDesarrolloAccess } from "./permissions";
import { isProviderComplete } from "./providerUtils";
import { moneyDelta, mostSpecificCostLabel, normalizeCostText } from "./costRules";

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
      await ctx.db.patch(transaction._id, {
        proveedor_id: args.proveedor_id || undefined,
      });
    }
    return { updated: transactions.length };
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

// Get transactions by project with line items and documents count
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

        return {
          ...transaction,
          proveedor,
          lineItemsCount: lineItems.length,
          documentsCount: documents.length,
          partidaNames: partidaNames.slice(0, 3), // First 3 partida names
          costConcepts: [...new Set(costConcepts)],
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

// Get all transactions with project name, line items count, and documents count
export const getAllWithDetails = query({
  args: {},
  handler: async (ctx) => {
    await assertAdmin(ctx);
    const transactions = await ctx.db
      .query("transacciones")
      .order("desc")
      .collect();

    // For each transaction, get related data
    const transactionsWithDetails = await Promise.all(
      transactions.map(async (transaction) => {
        // Get project name
        const proyecto = await ctx.db.get(transaction.proyecto);
        const proveedor = await providerSummary(ctx, transaction.proveedor_id);
        
        // Count line items
        const lineItems = await ctx.db
          .query("pagos")
          .withIndex("by_transaccion", (q) =>
            q.eq("transaccion_id", transaction._id)
          )
          .collect();

        // Count documents
        const documents = await ctx.db
          .query("documentos")
          .withIndex("by_transaccion", (q) =>
            q.eq("transaccion_id", transaction._id)
          )
          .collect();

        return {
          ...transaction,
          proveedor,
          proyectoNombre: proyecto?.nombre,
          lineItemsCount: lineItems.length,
          documentsCount: documents.length,
        };
      })
    );

    return transactionsWithDetails;
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
