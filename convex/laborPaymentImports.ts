import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { updateProviderStatsForTransactionChange } from "./providerStats";
import { v, type Infer } from "convex/values";
import { repairProjectPaymentTotals } from "./budgetMaintenance";
import {
  assertCanWrite,
  assertProviderManager,
  checkDesarrolloAccess,
  getCurrentUserOrThrow,
} from "./permissions";
import {
  buildProviderMatchIndex,
  classifyProviderImportAction,
  isGenericProviderName,
  normalizeProviderName,
} from "./providerUtils";
import { mostSpecificCostLabel, normalizeCostText } from "./costRules";
import { classifyProjectMatch } from "./projectMatchUtils";
import { assertProviderManagementRole, hasProviderManagementAccess } from "./providerRules";
import { markInvoicesStaleForTransaction } from "./invoiceIntegrity";
import { summarizeLaborWorkforce } from "./laborWorkforceRules";

const MAX_ROWS = 1_000;
const MONEY_TOLERANCE = 0.01;

const roleValidator = v.object({
  key: v.string(),
  label: v.string(),
  count: v.number(),
});

const lineItemValidator = v.object({
  partida_id: v.id("partidas"),
  partida: v.string(),
  familia: v.string(),
  sub_partida: v.string(),
  monto: v.number(),
  numero_personas_origen: v.optional(v.number()),
  source_row: v.number(),
});

const transactionValidator = v.object({
  source_key: v.string(),
  monto_total: v.number(),
  tipo_pago: v.string(),
  moneda: v.string(),
  categoria: v.string(),
  factura: v.string(),
  proveedor: v.string(),
  proveedor_id: v.optional(v.id("proveedores")),
  line_items: v.array(lineItemValidator),
});

const weekValidator = v.object({
  date: v.string(),
  total_people: v.number(),
  roles: v.array(roleValidator),
  row_count: v.number(),
  amount_total: v.number(),
  warnings: v.array(v.string()),
  transactions: v.array(transactionValidator),
});

type ImportTransaction = Infer<typeof transactionValidator>;
type ImportLine = Infer<typeof lineItemValidator>;

function invoiceKey(transaction: { factura?: string; tipo_pago: string; moneda: string }, providerKey: string) {
  // Keep invoice punctuation: two distinct folios must never overwrite each other.
  return JSON.stringify([transaction.factura?.trim().toUpperCase(), normalizeText(transaction.tipo_pago),
    normalizeText(transaction.moneda), providerKey]);
}

function paymentValues(items: Array<{ monto: number; numero_personas_origen?: number }>) {
  return JSON.stringify(items.map(item => [Math.round(item.monto * 100), item.numero_personas_origen ?? null])
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
}

function mergePaymentConcepts(existing: Doc<"pagos">[], incoming: ImportLine[]) {
  const writes: Array<{ item: ImportLine; previous?: Doc<"pagos"> }> = [];
  const includedPartidas = new Set(incoming.map(item => String(item.partida_id)));
  const preserved = existing.filter(item => !includedPartidas.has(String(item.partida_id)));
  for (const partidaId of includedPartidas) {
    const before = existing.filter(item => String(item.partida_id) === partidaId);
    const after = incoming.filter(item => String(item.partida_id) === partidaId);
    if (paymentValues(before) === paymentValues(after)) {
      preserved.push(...before);
      continue;
    }
    if (before.length > after.length) {
      throw new Error("La recarga contiene menos filas de un concepto ya registrado en esa factura. Revisa el pago desde Editar antes de reducir sus filas.");
    }
    after.forEach((item, index) => writes.push({ item, previous: before[index] }));
  }
  const merged = [...preserved, ...writes.map(({ item }) => ({
    monto: item.monto, numero_personas_origen: item.numero_personas_origen, source_row: item.source_row,
    sub_partida_snapshot: item.sub_partida, familia_snapshot: item.familia,
  }))];
  return { writes, merged, amount: Math.round(merged.reduce((sum, item) => sum + item.monto, 0) * 100) / 100 };
}

function normalizeText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function assertIsoDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`Fecha inv?lida: ${value}.`);
  const date = new Date(`${value}T00:00:00Z`);
  if (date.toISOString().slice(0, 10) !== value) throw new Error(`Fecha inv?lida: ${value}.`);
}

function displayDate(isoDate: string) {
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

function assertPositiveMoney(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} debe ser mayor que cero.`);
}

async function resolveProvider(
  ctx: MutationCtx,
  userId: Id<"users">,
  providerName: string,
  providersByName: ReadonlyMap<string, readonly Doc<"proveedores">[]>,
  providerId?: Id<"proveedores">,
) {
  const normalized = normalizeProviderName(providerName);
  if (!normalized) throw new Error("El nombre del proveedor no es válido.");
  if (providerId) {
    const provider = await ctx.db.get(providerId);
    if (!provider || provider.merged_into) throw new Error(`Proveedor no encontrado: ${providerName}.`);
    if (provider.archived_at) throw new Error(`El proveedor ${provider.razon_social} está archivado.`);
    if (normalizeProviderName(provider.razon_social) !== normalizeProviderName(providerName)) {
      throw new Error(`El proveedor seleccionado no coincide con ${providerName}.`);
    }
  }

  const match = classifyProviderImportAction(providerName, providersByName);
  if (match.action === "blocked_conflict") {
    throw new Error(`Hay varios proveedores activos equivalentes a ${providerName}.`);
  }
  if (match.action === "blocked_archived") {
    throw new Error(`El proveedor ${providerName} está archivado.`);
  }
  if (match.action === "reuse" && match.provider) {
    if (providerId && match.provider._id !== providerId) {
      throw new Error(`La coincidencia de ${providerName} cambió; vuelve a validar el archivo.`);
    }
    return { providerId: match.provider._id, status: "matched" as const };
  }
  if (providerId) {
    throw new Error(`El proveedor seleccionado para ${providerName} ya no está disponible.`);
  }

  await assertProviderManager(ctx);
  const createdProviderId = await ctx.db.insert("proveedores", {
    razon_social: providerName.trim(),
    razon_social_normalizada: normalized,
    tipo: isGenericProviderName(providerName) ? "generico" : "regular",
    created_by: userId,
    created_at: Date.now(),
    updated_at: Date.now(),
    stats_transaction_count: 0,
    stats_total_amount: 0,
    stats_project_count: 0,
    stats_initialized_at: Date.now(),
    list_search_text: normalized,
    list_is_complete: isGenericProviderName(providerName),
    list_is_archived: false,
    list_is_generic: isGenericProviderName(providerName),
  });
  return { providerId: createdProviderId, status: "created" as const };
}

export const getActiveLaborImports = query({
  args: { proyecto: v.id("desarrollos") },
  handler: async (ctx, args) => {
    await getCurrentUserOrThrow(ctx);
    if (!(await checkDesarrolloAccess(ctx, args.proyecto))) {
      throw new Error("No tienes acceso a este proyecto.");
    }
    return await ctx.db
      .query("labor_payment_imports")
      .withIndex("by_proyecto_estado_fecha", (q) =>
        q.eq("proyecto", args.proyecto).eq("status", "active")
      )
      .order("asc")
      .collect();
  },
});

export const replaceLaborPaymentImport = mutation({
  args: {
    proyecto: v.id("desarrollos"),
    source: v.object({
      file_name: v.string(),
      file_hash: v.string(),
      sheet_name: v.string(),
      administration: v.string(),
      currency: v.string(),
      row_count: v.number(),
    }),
    weeks: v.array(weekValidator),
  },
  handler: async (ctx, args) => {
    const user = await assertCanWrite(ctx);
    if (!(await checkDesarrolloAccess(ctx, args.proyecto))) {
      throw new Error("No tienes acceso para importar en este proyecto.");
    }
    const project = await ctx.db.get(args.proyecto);
    if (!project) throw new Error("El proyecto ya no existe.");
    if (!/^[a-f0-9]{64}$/i.test(args.source.file_hash)) throw new Error("Hash de archivo inv?lido.");
    if (!args.source.file_name.trim() || !args.source.sheet_name.trim()) {
      throw new Error("Faltan metadatos del archivo.");
    }
    if (!Number.isInteger(args.source.row_count) || args.source.row_count <= 0 || args.source.row_count > MAX_ROWS) {
      throw new Error(`La carga debe contener entre 1 y ${MAX_ROWS} filas.`);
    }
    if (!args.weeks.length) throw new Error("La carga no contiene cortes semanales.");
    const sourceCurrency = normalizeText(args.source.currency);
    if (!sourceCurrency) throw new Error("La moneda es obligatoria.");
    if (classifyProjectMatch(args.source.administration, [project]).status !== "matched") {
      throw new Error("La administraci?n del archivo no coincide con el proyecto.");
    }
    if (project.moneda_principal && normalizeText(project.moneda_principal) !== sourceCurrency) {
      throw new Error(`La moneda ${sourceCurrency} no coincide con ${project.moneda_principal}.`);
    }

    const requestedDates = new Set<string>();
    let validatedRows = 0;
    let validatedAmount = 0;
    const partidaDocs = new Map<string, Doc<"partidas">>();
    for (const week of args.weeks) {
      assertIsoDate(week.date);
      if (requestedDates.has(week.date)) throw new Error(`El corte ${week.date} est? duplicado.`);
      requestedDates.add(week.date);
      if (!Number.isInteger(week.total_people) || week.total_people < 0) {
        throw new Error(`${week.date}: total de personas inv?lido.`);
      }
      const roleKeys = new Set<string>();
      let roleTotal = 0;
      for (const role of week.roles) {
        const key = normalizeText(role.key);
        if (!key || roleKeys.has(key)) throw new Error(`${week.date}: puesto duplicado o inv?lido.`);
        if (!Number.isInteger(role.count) || role.count < 0) throw new Error(`${week.date}: conteo de puesto inv?lido.`);
        roleKeys.add(key);
        roleTotal += role.count;
      }
      if (roleTotal !== week.total_people) {
        throw new Error(`${week.date}: los puestos suman ${roleTotal}, no ${week.total_people}.`);
      }
      if (!Number.isInteger(week.row_count) || week.row_count <= 0) throw new Error(`${week.date}: filas inv?lidas.`);
      assertPositiveMoney(week.amount_total, `${week.date}: monto semanal`);
      let transactionAmount = 0;
      let transactionRows = 0;
      const sourceKeys = new Set<string>();
      for (const transaction of week.transactions) {
        if (!transaction.source_key.trim() || sourceKeys.has(transaction.source_key)) {
          throw new Error(`${week.date}: clave de transacci?n duplicada.`);
        }
        sourceKeys.add(transaction.source_key);
        if (
          !transaction.factura.trim() ||
          !transaction.tipo_pago.trim() ||
          !transaction.proveedor.trim() ||
          !transaction.categoria.trim()
        ) {
          throw new Error(`${week.date}: factura, tipo de pago, proveedor y categor?a son obligatorios.`);
        }
        if (normalizeText(transaction.moneda) !== sourceCurrency) {
          throw new Error(`${week.date}: la transacci?n ${transaction.factura} usa otra moneda.`);
        }
        assertPositiveMoney(transaction.monto_total, `${week.date}: monto de ${transaction.factura}`);
        if (!transaction.line_items.length) throw new Error(`${week.date}: ${transaction.factura} no tiene conceptos.`);
        let lineItemTotal = 0;
        for (const item of transaction.line_items) {
          assertPositiveMoney(item.monto, `Fila ${item.source_row}: monto`);
          if (!Number.isInteger(item.source_row) || item.source_row < 2 || item.source_row > MAX_ROWS + 1) {
            throw new Error("N?mero de fila de origen inv?lido.");
          }
          if (
            item.numero_personas_origen !== undefined &&
            (!Number.isInteger(item.numero_personas_origen) || item.numero_personas_origen < 0)
          ) throw new Error(`Fila ${item.source_row}: NO. PERSONAS inv?lido.`);
          const cachedPartida = partidaDocs.get(String(item.partida_id));
          const partida = cachedPartida || await ctx.db.get(item.partida_id);
          if (!partida || partida.proyecto !== args.proyecto) {
            throw new Error(`Fila ${item.source_row}: la partida no pertenece al proyecto.`);
          }
          if (
            normalizeText(partida.nombre) !== normalizeText(item.partida) ||
            normalizeText(partida.familia) !== normalizeText(item.familia) ||
            normalizeText(partida.sub_partida) !== normalizeText(item.sub_partida)
          ) throw new Error(`Fila ${item.source_row}: la jerarqu?a de la partida cambi?.`);
          partidaDocs.set(String(partida._id), partida);
          lineItemTotal += item.monto;
        }
        if (Math.abs(lineItemTotal - transaction.monto_total) > MONEY_TOLERANCE) {
          throw new Error(`${week.date}: los conceptos de ${transaction.factura} no coinciden con su total.`);
        }
        transactionAmount += transaction.monto_total;
        transactionRows += transaction.line_items.length;
      }
      if (transactionRows !== week.row_count) throw new Error(`${week.date}: el conteo de filas no coincide.`);
      if (Math.abs(transactionAmount - week.amount_total) > MONEY_TOLERANCE) {
        throw new Error(`${week.date}: las transacciones no coinciden con el monto semanal.`);
      }
      validatedRows += week.row_count;
      validatedAmount += week.amount_total;
    }
    if (validatedRows !== args.source.row_count) throw new Error("El conteo total de filas no coincide.");

    const providersByName = buildProviderMatchIndex(await ctx.db.query("proveedores").collect());
    const providerKey = (name: string, id?: Id<"proveedores">) => {
      const match = classifyProviderImportAction(name, providersByName);
      return String(id || match.provider?._id || normalizeProviderName(name));
    };
    if (!hasProviderManagementAccess(user) && args.weeks.some(week =>
      week.transactions.some(transaction => classifyProviderImportAction(transaction.proveedor, providersByName).action === "create"),
    )) assertProviderManagementRole(user);

    // A date is a reporting cut, not a replacement key. Compare actual payments
    // even for a known hash: a previous import may have been changed or deleted.
    const plans = [];
    for (const week of args.weeks) {
      const previousImports = await ctx.db.query("labor_payment_imports")
        .withIndex("by_proyecto_fecha_estado", q => q.eq("proyecto", args.proyecto).eq("capture_date", week.date).eq("status", "active"))
        .collect();
      const previousTransactions = (await Promise.all(previousImports.map(previousImport => ctx.db.query("transacciones")
        .withIndex("by_labor_import", q => q.eq("labor_import_id", previousImport._id)).collect()))).flat();
      const paymentsByTransaction = new Map(await Promise.all(previousTransactions.map(async transaction => {
        if (transaction.proyecto !== args.proyecto) throw new Error("El corte contiene un pago de otro proyecto.");
        const payments = await ctx.db.query("pagos").withIndex("by_transaccion", q => q.eq("transaccion_id", transaction._id)).collect();
        return [transaction._id, payments] as const;
      })));
      const seenKeys = new Set<string>();
      const transactions = week.transactions.map((input: ImportTransaction) => {
        const key = invoiceKey(input, providerKey(input.proveedor, input.proveedor_id));
        if (seenKeys.has(key)) throw new Error(`La factura ${input.factura} aparece como varios pagos equivalentes en la recarga.`);
        seenKeys.add(key);
        const matches = previousTransactions.filter(transaction => transaction.fecha === displayDate(week.date) &&
          invoiceKey(transaction, providerKey(transaction.proveedor || "", transaction.proveedor_id)) === key);
        if (matches.length > 1) throw new Error(`Hay varios pagos equivalentes para ${input.factura}. Revisa los duplicados antes de importar.`);
        const existing = matches[0];
        const previousPayments = existing ? paymentsByTransaction.get(existing._id) || [] : [];
        if (existing && Math.abs(previousPayments.reduce((sum, item) => sum + item.monto, 0) - existing.monto_total) > MONEY_TOLERANCE) {
          throw new Error(`Los conceptos de ${input.factura} no coinciden con su total registrado. Revisa el pago antes de importar.`);
        }
        const concepts = mergePaymentConcepts(previousPayments, input.line_items);
        const changed = !existing || concepts.writes.length > 0 || existing.monto_total !== concepts.amount ||
          existing.status !== "Pagado" || normalizeText(existing.categoria) !== normalizeText(input.categoria);
        return { input, existing, concepts, changed };
      });
      const changed = transactions.some(transaction => transaction.changed);
      const matchedIds = new Set(transactions.flatMap(transaction => transaction.existing ? [transaction.existing._id] : []));
      const preservedTransactions = previousTransactions.filter(transaction => !matchedIds.has(transaction._id));
      const workforceRows = [
        ...preservedTransactions.flatMap(transaction => (paymentsByTransaction.get(transaction._id) || []).map(payment => ({
          subpartida: payment.sub_partida_snapshot || "", familia: payment.familia_snapshot || "",
          numeroPersonas: payment.numero_personas_origen, tipoPago: transaction.tipo_pago, sourceRow: payment.source_row,
        }))),
        ...transactions.flatMap(transaction => transaction.concepts.merged.map(payment => ({
          subpartida: payment.sub_partida_snapshot || "", familia: payment.familia_snapshot || "",
          numeroPersonas: payment.numero_personas_origen, tipoPago: transaction.input.tipo_pago, sourceRow: payment.source_row,
        }))),
      ];
      const workforce = summarizeLaborWorkforce(workforceRows);
      if (workforce.errors.length) throw new Error(`${week.date}: ${workforce.errors.join(" ")}`);
      plans.push({ week, previousImports, transactions, preservedTransactions, workforce, changed,
        rowCount: workforceRows.length,
        amount: Math.round((preservedTransactions.reduce((sum, transaction) => sum + transaction.monto_total, 0) +
          transactions.reduce((sum, transaction) => sum + transaction.concepts.amount, 0)) * 100) / 100,
      });
    }
    const resultSummary = {
      dates: [...requestedDates].sort(),
      transaction_count: args.weeks.reduce((sum, week) => sum + week.transactions.length, 0),
      row_count: validatedRows,
      amount_total: Math.round(validatedAmount * 100) / 100,
      total_people: [...plans].sort((left, right) => left.week.date.localeCompare(right.week.date)).at(-1)?.workforce.totalPeople || 0,
    };
    if (plans.every(plan => !plan.changed)) {
      return { status: "unchanged" as const, ...resultSummary, providers_created: 0, providers_reused: 0 };
    }

    const now = Date.now();
    let replacedDates = 0;
    const resolvedProviders = new Map<string, { providerId: Id<"proveedores">; status: "matched" | "created" }>();
    const createdProviderIds = new Set<Id<"proveedores">>();
    const reusedProviderIds = new Set<Id<"proveedores">>();
    for (const plan of plans) {
      if (!plan.changed) continue;
      const { week } = plan;
      const newImportId = await ctx.db.insert("labor_payment_imports", {
        proyecto: args.proyecto, capture_date: week.date,
        total_people: plan.workforce.totalPeople, roles: plan.workforce.roles,
        source_file_name: args.source.file_name.trim(), source_file_hash: args.source.file_hash.toLowerCase(),
        source_sheet_name: args.source.sheet_name.trim(), source_administration: args.source.administration.trim(),
        source_currency: sourceCurrency, source_row_count: plan.rowCount,
        transaction_count: plan.preservedTransactions.length + plan.transactions.length, amount_total: plan.amount,
        warnings: [...new Set([...week.warnings, ...plan.workforce.warnings])].map(warning => warning.slice(0, 300)),
        status: "active", imported_by: user._id, imported_at: now,
      });
      if (plan.previousImports.length) replacedDates += 1;
      for (const previousImport of plan.previousImports) {
        await ctx.db.patch(previousImport._id, { status: "superseded", superseded_at: now,
          superseded_by_user: user._id, superseded_by_import: newImportId });
      }
      // Keep transaction IDs and linked documents while consolidating the cut.
      for (const transaction of plan.preservedTransactions) {
        await ctx.db.patch(transaction._id, { labor_import_id: newImportId });
      }
      for (const transaction of plan.transactions) {
        const { input, existing, concepts } = transaction;
        if (!transaction.changed && existing) {
          await ctx.db.patch(existing._id, { labor_import_id: newImportId });
          continue;
        }
        const key = normalizeProviderName(input.proveedor);
        let provider = resolvedProviders.get(key);
        if (!provider) {
          provider = await resolveProvider(ctx, user._id, input.proveedor, providersByName, input.proveedor_id);
          resolvedProviders.set(key, provider);
          (provider.status === "created" ? createdProviderIds : reusedProviderIds).add(provider.providerId);
        }
        const fields = {
          proyecto: args.proyecto, proveedor_id: provider.providerId, proveedor: input.proveedor.trim(),
          labor_import_id: newImportId, import_source_key: input.source_key,
          import_signature: `${args.source.file_hash.toLowerCase()}:${input.source_key}`,
          monto_total: concepts.amount, fecha: displayDate(week.date), tipo_pago: input.tipo_pago.trim(),
          moneda: sourceCurrency, tipo_cambio: "1", status: "Pagado", categoria: input.categoria.trim(), factura: input.factura.trim(),
        };
        let transactionId: Id<"transacciones">;
        if (existing) {
          await markInvoicesStaleForTransaction(ctx, existing._id);
          await ctx.db.patch(existing._id, fields);
          transactionId = existing._id;
        } else transactionId = await ctx.db.insert("transacciones", fields);
        await updateProviderStatsForTransactionChange(ctx, existing || null, fields);
        for (const { item, previous } of concepts.writes) {
          const partida = partidaDocs.get(String(item.partida_id));
          if (!partida) throw new Error("Una partida de la importación ya no existe.");
          const partidaNombre = String(partida.nivel === 1 ? partida.nombre : partida.partida_nombre || partida.nombre || "").trim();
          const familia = String(partida.familia || "").trim();
          const subPartida = String(partida.sub_partida || "").trim();
          const concepto = mostSpecificCostLabel({ sub_partida: subPartida, familia, partida: partidaNombre, nombre: partida.nombre });
          const paymentFields = {
            transaccion_id: transactionId, partida_id: item.partida_id, proyecto_id: args.proyecto,
            concepto, concepto_normalizado: normalizeCostText(concepto), partida_nombre_snapshot: partidaNombre,
            familia_snapshot: familia, sub_partida_snapshot: subPartida, classification_status: "mapped" as const,
            monto: Math.round(item.monto * 100) / 100, numero_personas_origen: item.numero_personas_origen, source_row: item.source_row,
          };
          if (previous) await ctx.db.patch(previous._id, paymentFields);
          else await ctx.db.insert("pagos", paymentFields);
        }
      }
    }

    if (!project.moneda_principal) {
      await ctx.db.patch(args.proyecto, { moneda_principal: sourceCurrency });
    }
    // Rebuild once after the merge. Recalculating each changed concept
    // repeatedly reads the same payment history and can exceed mutation limits.
    // Keep this in the same mutation so a failure rolls back the entire import.
    await repairProjectPaymentTotals(ctx, args.proyecto);

    return {
      status: replacedDates ? "replaced" as const : "created" as const,
      ...resultSummary, replaced_dates: replacedDates,
      providers_created: createdProviderIds.size, providers_reused: reusedProviderIds.size,
    };
  },
});
