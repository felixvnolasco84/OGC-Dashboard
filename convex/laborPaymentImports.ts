import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import {
  updateHonorariosMonto,
  updateMeticasPresupuesto,
  updatePagadoForHierarchy,
} from "./functions";
import {
  assertCanWrite,
  checkDesarrolloAccess,
  getCurrentUserOrThrow,
} from "./permissions";
import { isGenericProviderName, normalizeProviderName } from "./providerUtils";
import { mostSpecificCostLabel, normalizeCostText } from "./costRules";

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
  if (!match) throw new Error(`Fecha inválida: ${value}.`);
  const date = new Date(`${value}T00:00:00Z`);
  if (date.toISOString().slice(0, 10) !== value) throw new Error(`Fecha inválida: ${value}.`);
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
  providerId?: Id<"proveedores">,
) {
  if (providerId) {
    const provider = await ctx.db.get(providerId);
    if (!provider || provider.merged_into) throw new Error(`Proveedor no encontrado: ${providerName}.`);
    if (provider.archived_at) throw new Error(`El proveedor ${provider.razon_social} está archivado.`);
    if (normalizeProviderName(provider.razon_social) !== normalizeProviderName(providerName)) {
      throw new Error(`El proveedor seleccionado no coincide con ${providerName}.`);
    }
    return provider._id;
  }

  const normalized = normalizeProviderName(providerName);
  const matches = await ctx.db
    .query("proveedores")
    .withIndex("by_razon_social_normalizada", (q) => q.eq("razon_social_normalizada", normalized))
    .collect();
  const available = matches.filter((provider) => !provider.merged_into);
  const active = available.filter((provider) => !provider.archived_at);
  if (active.length > 1) throw new Error(`Hay varios proveedores equivalentes a ${providerName}.`);
  if (active.length === 1) return active[0]._id;
  if (available.length) throw new Error(`El proveedor ${providerName} está archivado.`);

  return await ctx.db.insert("proveedores", {
    razon_social: providerName.trim(),
    razon_social_normalizada: normalized,
    tipo: isGenericProviderName(providerName) ? "generico" : "regular",
    created_by: userId,
    created_at: Date.now(),
    updated_at: Date.now(),
  });
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
    if (!/^[a-f0-9]{64}$/i.test(args.source.file_hash)) throw new Error("Hash de archivo inválido.");
    if (!args.source.file_name.trim() || !args.source.sheet_name.trim()) {
      throw new Error("Faltan metadatos del archivo.");
    }
    if (!Number.isInteger(args.source.row_count) || args.source.row_count <= 0 || args.source.row_count > MAX_ROWS) {
      throw new Error(`La carga debe contener entre 1 y ${MAX_ROWS} filas.`);
    }
    if (!args.weeks.length) throw new Error("La carga no contiene cortes semanales.");
    const sourceCurrency = normalizeText(args.source.currency);
    if (!sourceCurrency) throw new Error("La moneda es obligatoria.");
    if (normalizeText(args.source.administration) !== normalizeText(project.nombre)) {
      throw new Error("La administración del archivo no coincide con el proyecto.");
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
      if (requestedDates.has(week.date)) throw new Error(`El corte ${week.date} está duplicado.`);
      requestedDates.add(week.date);
      if (!Number.isInteger(week.total_people) || week.total_people < 0) {
        throw new Error(`${week.date}: total de personas inválido.`);
      }
      const roleKeys = new Set<string>();
      let roleTotal = 0;
      for (const role of week.roles) {
        const key = normalizeText(role.key);
        if (!key || roleKeys.has(key)) throw new Error(`${week.date}: puesto duplicado o inválido.`);
        if (!Number.isInteger(role.count) || role.count < 0) throw new Error(`${week.date}: conteo de puesto inválido.`);
        roleKeys.add(key);
        roleTotal += role.count;
      }
      if (roleTotal !== week.total_people) {
        throw new Error(`${week.date}: los puestos suman ${roleTotal}, no ${week.total_people}.`);
      }
      if (!Number.isInteger(week.row_count) || week.row_count <= 0) throw new Error(`${week.date}: filas inválidas.`);
      assertPositiveMoney(week.amount_total, `${week.date}: monto semanal`);
      let transactionAmount = 0;
      let transactionRows = 0;
      const sourceKeys = new Set<string>();
      for (const transaction of week.transactions) {
        if (!transaction.source_key.trim() || sourceKeys.has(transaction.source_key)) {
          throw new Error(`${week.date}: clave de transacción duplicada.`);
        }
        sourceKeys.add(transaction.source_key);
        if (
          !transaction.factura.trim() ||
          !transaction.tipo_pago.trim() ||
          !transaction.proveedor.trim() ||
          !transaction.categoria.trim()
        ) {
          throw new Error(`${week.date}: factura, tipo de pago, proveedor y categoría son obligatorios.`);
        }
        if (normalizeText(transaction.moneda) !== sourceCurrency) {
          throw new Error(`${week.date}: la transacción ${transaction.factura} usa otra moneda.`);
        }
        assertPositiveMoney(transaction.monto_total, `${week.date}: monto de ${transaction.factura}`);
        if (!transaction.line_items.length) throw new Error(`${week.date}: ${transaction.factura} no tiene conceptos.`);
        let lineItemTotal = 0;
        for (const item of transaction.line_items) {
          assertPositiveMoney(item.monto, `Fila ${item.source_row}: monto`);
          if (!Number.isInteger(item.source_row) || item.source_row < 2 || item.source_row > MAX_ROWS + 1) {
            throw new Error("Número de fila de origen inválido.");
          }
          if (
            item.numero_personas_origen !== undefined &&
            (!Number.isInteger(item.numero_personas_origen) || item.numero_personas_origen < 0)
          ) throw new Error(`Fila ${item.source_row}: NO. PERSONAS inválido.`);
          const cachedPartida = partidaDocs.get(String(item.partida_id));
          const partida = cachedPartida || await ctx.db.get(item.partida_id);
          if (!partida || partida.proyecto !== args.proyecto) {
            throw new Error(`Fila ${item.source_row}: la partida no pertenece al proyecto.`);
          }
          if (
            normalizeText(partida.nombre) !== normalizeText(item.partida) ||
            normalizeText(partida.familia) !== normalizeText(item.familia) ||
            normalizeText(partida.sub_partida) !== normalizeText(item.sub_partida)
          ) throw new Error(`Fila ${item.source_row}: la jerarquía de la partida cambió.`);
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

    const sameHash = await ctx.db
      .query("labor_payment_imports")
      .withIndex("by_proyecto_file_hash", (q) =>
        q.eq("proyecto", args.proyecto).eq("source_file_hash", args.source.file_hash)
      )
      .collect();
    const activeSameHashDates = new Set(
      sameHash.filter((item) => item.status === "active").map((item) => item.capture_date),
    );
    if (
      activeSameHashDates.size === requestedDates.size &&
      [...requestedDates].every((date) => activeSameHashDates.has(date))
    ) {
      return {
        status: "unchanged" as const,
        dates: [...requestedDates].sort(),
        transaction_count: args.weeks.reduce((sum, week) => sum + week.transactions.length, 0),
        row_count: validatedRows,
        amount_total: Math.round(validatedAmount * 100) / 100,
        total_people: [...args.weeks].sort((left, right) => left.date.localeCompare(right.date)).at(-1)?.total_people || 0,
      };
    }

    const oldImportsByDate = new Map<string, Array<Id<"labor_payment_imports">>>();
    const affectedHierarchies = new Map<string, {
      partida: string;
      familia: string;
      sub_partida: string;
      nivel: number;
      proyecto: string;
    }>();
    for (const week of args.weeks) {
      const previousImports = await ctx.db
        .query("labor_payment_imports")
        .withIndex("by_proyecto_fecha_estado", (q) =>
          q.eq("proyecto", args.proyecto).eq("capture_date", week.date).eq("status", "active")
        )
        .collect();
      oldImportsByDate.set(week.date, previousImports.map((item) => item._id));
      for (const previousImport of previousImports) {
        const transactions = await ctx.db
          .query("transacciones")
          .withIndex("by_labor_import", (q) => q.eq("labor_import_id", previousImport._id))
          .collect();
        for (const transaction of transactions) {
          const payments = await ctx.db
            .query("pagos")
            .withIndex("by_transaccion", (q) => q.eq("transaccion_id", transaction._id))
            .collect();
          for (const payment of payments) {
            const partida = payment.partida_id ? await ctx.db.get(payment.partida_id) : null;
            if (partida) {
              const key = `${partida.nombre}|${partida.familia}|${partida.sub_partida}`;
              affectedHierarchies.set(key, {
                partida: partida.partida_nombre || partida.nombre,
                familia: partida.familia,
                sub_partida: partida.sub_partida,
                nivel: partida.nivel,
                proyecto: String(args.proyecto),
              });
            }
            await ctx.db.delete(payment._id);
          }
          await ctx.db.delete(transaction._id);
        }
      }
    }

    const now = Date.now();
    let importedTransactions = 0;
    let replacedDates = 0;
    const resolvedProviders = new Map<string, Id<"proveedores">>();
    for (const week of args.weeks) {
      const newImportId = await ctx.db.insert("labor_payment_imports", {
        proyecto: args.proyecto,
        capture_date: week.date,
        total_people: week.total_people,
        roles: week.roles.map((role) => ({
          key: normalizeText(role.key),
          label: role.label.trim(),
          count: role.count,
        })),
        source_file_name: args.source.file_name.trim(),
        source_file_hash: args.source.file_hash.toLowerCase(),
        source_sheet_name: args.source.sheet_name.trim(),
        source_administration: args.source.administration.trim(),
        source_currency: sourceCurrency,
        source_row_count: week.row_count,
        transaction_count: week.transactions.length,
        amount_total: Math.round(week.amount_total * 100) / 100,
        warnings: week.warnings.map((warning) => warning.slice(0, 300)),
        status: "active",
        imported_by: user._id,
        imported_at: now,
      });
      const oldImportIds = oldImportsByDate.get(week.date) || [];
      if (oldImportIds.length) replacedDates += 1;
      for (const oldImportId of oldImportIds) {
        await ctx.db.patch(oldImportId, {
          status: "superseded",
          superseded_at: now,
          superseded_by_user: user._id,
          superseded_by_import: newImportId,
        });
      }

      for (const transaction of week.transactions) {
        const providerKey = normalizeProviderName(transaction.proveedor);
        let providerId = resolvedProviders.get(providerKey);
        if (!providerId) {
          providerId = await resolveProvider(
            ctx,
            user._id,
            transaction.proveedor,
            transaction.proveedor_id,
          );
          resolvedProviders.set(providerKey, providerId);
        }
        const transactionId = await ctx.db.insert("transacciones", {
          proyecto: args.proyecto,
          proveedor_id: providerId,
          proveedor: transaction.proveedor.trim(),
          labor_import_id: newImportId,
          import_source_key: transaction.source_key,
          import_signature: `${args.source.file_hash.toLowerCase()}:${transaction.source_key}`,
          monto_total: Math.round(transaction.monto_total * 100) / 100,
          fecha: displayDate(week.date),
          tipo_pago: transaction.tipo_pago.trim(),
          moneda: sourceCurrency,
          tipo_cambio: "1",
          status: "Pagado",
          categoria: transaction.categoria.trim(),
          factura: transaction.factura.trim(),
        });
        for (const item of transaction.line_items) {
          const partida = partidaDocs.get(String(item.partida_id));
          if (!partida || partida.proyecto !== args.proyecto) {
            throw new Error("Una partida de la importación no pertenece al proyecto.");
          }
          const partidaNombre = String(
            partida.nivel === 1 ? partida.nombre : partida.partida_nombre || partida.nombre || "",
          ).trim();
          const familia = String(partida.familia || "").trim();
          const subPartida = String(partida.sub_partida || "").trim();
          const concepto = mostSpecificCostLabel({
            sub_partida: subPartida,
            familia,
            partida: partidaNombre,
            nombre: partida.nombre,
          });
          await ctx.db.insert("pagos", {
            transaccion_id: transactionId,
            partida_id: item.partida_id,
            proyecto_id: args.proyecto,
            concepto,
            concepto_normalizado: normalizeCostText(concepto),
            partida_nombre_snapshot: partidaNombre,
            familia_snapshot: familia,
            sub_partida_snapshot: subPartida,
            classification_status: "mapped",
            monto: Math.round(item.monto * 100) / 100,
            numero_personas_origen: item.numero_personas_origen,
            source_row: item.source_row,
          });
          const key = `${partidaNombre}|${familia}|${subPartida}`;
          affectedHierarchies.set(key, {
            partida: partidaNombre,
            familia,
            sub_partida: subPartida,
            nivel: partida.nivel,
            proyecto: String(args.proyecto),
          });
        }
        importedTransactions += 1;
      }
    }

    for (const hierarchy of affectedHierarchies.values()) {
      await updatePagadoForHierarchy(ctx, hierarchy);
    }
    await updateMeticasPresupuesto(ctx, String(args.proyecto));
    await updateHonorariosMonto(ctx, String(args.proyecto));
    if (!project.moneda_principal) {
      await ctx.db.patch(args.proyecto, { moneda_principal: sourceCurrency });
    }

    return {
      status: replacedDates ? "replaced" as const : "created" as const,
      dates: [...requestedDates].sort(),
      replaced_dates: replacedDates,
      transaction_count: importedTransactions,
      row_count: validatedRows,
      amount_total: Math.round(validatedAmount * 100) / 100,
      total_people: [...args.weeks].sort((left, right) => left.date.localeCompare(right.date)).at(-1)?.total_people || 0,
    };
  },
});
