import { feeBudgetConvert } from "./indirectosBudget";
import { getBudgetIndirectos } from "./indirectosBudget";
import { canonicalFeeConcepts } from "./feeConceptRules";
import { repairProjectPaymentTotals } from "./budgetMaintenance";
import { mutation as rawMutation, internalMutation as rawInternalMutation } from "./_generated/server";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { DataModel, Doc, Id } from "./_generated/dataModel";
import { Triggers } from "convex-helpers/server/triggers";
import { customCtx, customMutation } from "convex-helpers/server/customFunctions";
import { calculateHonorariosFromRecords, getHonorariosModo, isHonorariosPartida } from "./honorariosRules";
import { calculatePresupuestoMetrics } from "./presupuestoRules";
import { approvedBudgetPatch } from "./budgetRollupRules";
import { calculateHierarchyPaymentTotals } from "./paymentHierarchyRules";

// Initialize Triggers with table types from schema.ts
const triggers = new Triggers<DataModel>();

// Register trigger for pagos table to update pagado field in partidas
triggers.register("pagos", async (ctx, change) => {

  try {
    // Get the payment record to extract context information
    let payment;
    if (change.operation === "insert" || change.operation === "update") {
      payment = change.newDoc;
    } else if (change.operation === "delete") {
      payment = change.oldDoc;
    }
    
    if (!payment) {
      console.log("No payment found, skipping trigger");
      return;
    }
    
    const transactionDoc = await ctx.db.get(payment.transaccion_id);
    if (!transactionDoc) {
      console.log("Transaction not found, skipping trigger");
      return;
    }
    const transaction = transactionDoc as any;
    const affectedIds = new Set<Id<"partidas">>();
    if (payment.partida_id) affectedIds.add(payment.partida_id);
    if (change.operation === "update" && change.oldDoc?.partida_id) {
      affectedIds.add(change.oldDoc.partida_id);
    }
    const affectedPartidas = (await Promise.all([...affectedIds].map((id) => ctx.db.get(id))))
      .filter((partida): partida is Doc<"partidas"> =>
        Boolean(partida && partida.proyecto === transaction.proyecto));

    for (const partida of affectedPartidas) {
      await updatePagadoForHierarchy(ctx, {
        partida: partida.partida_nombre || partida.nombre || "",
        familia: partida.familia || "",
        sub_partida: partida.sub_partida || "",
        nivel: partida.nivel,
        proyecto: transaction.proyecto,
      });
    }
    console.log("✅ Successfully updated pagado for all hierarchy levels");

    const proyectoDoc = await ctx.db.get(transaction.proyecto as Id<"desarrollos">);
    const manualMode = getHonorariosModo(proyectoDoc?.honorarios_modo) === "transacciones";
    const shouldRecalculate = Boolean(proyectoDoc?.fee_concepts?.length) || (manualMode
      ? affectedPartidas.some(isHonorariosPartida)
      : Boolean(proyectoDoc?.excluded_partidas_honorarios?.length));
    if (shouldRecalculate) {
      await updateHonorariosMonto(ctx, transaction.proyecto);
    } else {
      await updateMeticasPresupuesto(ctx, transaction.proyecto);
    }
    console.log("✅ Successfully updated budget metrics");
  } catch (error) {
    console.error("❌ Error in payment trigger:", error);
    throw error; // Re-throw to see the error in Convex logs
  }
});

// Helper to calculate pagado for a specific set of partida IDs (only "Pagado" transactions)
async function calculatePagadoForPartidas(ctx: { db: any }, partidaIds: any[], proyectoId: string): Promise<Map<string, number>> {
  const pagadoMap = new Map<string, number>();
  
  // Query pagos for all these partidas in parallel
  const pagosArrays = await Promise.all(
    partidaIds.map(id => 
      ctx.db
        .query("pagos")
        .withIndex("by_partida_id", (q: any) => q.eq("partida_id", id))
        .collect()
    )
  );
  
  // Sum up pagos for each partida, BUT only include those from "Pagado" transactions
  for (let i = 0; i < partidaIds.length; i++) {
    const partidaId = partidaIds[i];
    const pagos = pagosArrays[i];
    let total = 0;
    
    for (const pago of pagos) {
      // Get the associated transaction to check status
      const transaction = await ctx.db.get(pago.transaccion_id);
      
      // Only count if transaction exists and status is "Pagado"
      if (transaction && transaction.proyecto === proyectoId && transaction.status === "Pagado") {
        total += (pago.monto || 0);
      }
    }
    
    pagadoMap.set(partidaId, total);
  }
  
  return pagadoMap;
}

// Recalculate from direct payments at every level, including parent payments
// even when the parent also has children. Cached parent totals are never summed.
async function updatePagadoForHierarchy(
  ctx: { db: any },
  context: { partida: string; familia: string; sub_partida: string; nivel: number; proyecto: string }
) {
  const { partida, familia, sub_partida, nivel, proyecto } = context;
  const [roots, families, leaves, project] = await Promise.all([
    ctx.db.query("partidas").withIndex("by_proyecto_nivel_nombre", (q: any) =>
      q.eq("proyecto", proyecto).eq("nivel", 1).eq("nombre", partida)).collect(),
    ctx.db.query("partidas").withIndex("by_proyecto_nivel_partida", (q: any) =>
      q.eq("proyecto", proyecto).eq("nivel", 2).eq("partida_nombre", partida)).collect(),
    ctx.db.query("partidas").withIndex("by_proyecto_nivel_partida", (q: any) =>
      q.eq("proyecto", proyecto).eq("nivel", 3).eq("partida_nombre", partida)).collect(),
    ctx.db.get(proyecto),
  ]);
  const allPartidas: Doc<"partidas">[] = [...roots, ...families, ...leaves];
  const directPayments = await calculatePagadoForPartidas(ctx, allPartidas.map(item => item._id), proyecto);
  const totals = calculateHierarchyPaymentTotals(allPartidas, directPayments, project?.honorarios_monto);
  for (const item of allPartidas) {
    const affected = item.nivel === 1 ||
      (item.nivel === 2 && item.familia === familia) ||
      (item.nivel === 3 && nivel === 3 && item.familia === familia && item.sub_partida === sub_partida);
    if (!affected) continue;
    const pagado = totals.get(String(item._id)) || 0;
    const por_gastar = item.presupuesto_aprobado - pagado;
    if (item.pagado !== pagado || item.por_gastar !== por_gastar) {
      await ctx.db.patch(item._id, { pagado, por_gastar });
    }
  }
}

// Helper function to cascade presupuesto_aprobado updates up the hierarchy
async function cascadePresupuestoAprobadoUpdate(
  ctx: { db: any },
  updatedPartida: any
) {
  const { nivel, proyecto, partida_nombre, familia } = updatedPartida;
  
  console.log(`🔄 Cascading presupuesto_aprobado update for nivel ${nivel}`);
  
  try {
    // If nivel 3 (sub_partida) was updated, recalculate nivel 2 (familia)
    if (nivel === 3 && partida_nombre && familia) {
      console.log(`[1/2] Updating nivel 2 (familia) for: ${partida_nombre} > ${familia}`);
      
      // Get all nivel 3 items in this familia using indexed query where possible
      const nivel3Items = await ctx.db
        .query("partidas")
        .withIndex("by_proyecto_nivel_partida_familia", (q: any) =>
          q.eq("proyecto", proyecto).eq("nivel", 3).eq("partida_nombre", partida_nombre).eq("familia", familia)
        )
        .collect();
      
      // Sum presupuesto_aprobado from all nivel 3 items
      const totalPresupuestoAprobado = nivel3Items.reduce(
        (sum: number, item: any) => sum + (item.presupuesto_aprobado || 0),
        0
      );
      
      // Update the nivel 2 (familia) record
      const nivel2Items = await ctx.db
        .query("partidas")
        .withIndex("by_proyecto_nivel_partida_familia", (q: any) =>
          q.eq("proyecto", proyecto).eq("nivel", 2).eq("partida_nombre", partida_nombre).eq("familia", familia)
        )
        .collect();
      
      for (const item of nivel2Items) {
        const pagado = item.pagado || 0;
        const porGastar = totalPresupuestoAprobado - pagado;
        await ctx.db.patch(item._id, approvedBudgetPatch(totalPresupuestoAprobado, pagado));
        console.log(`✅ Updated nivel 2: presupuesto_aprobado=${totalPresupuestoAprobado}, por_gastar=${porGastar}`);
      }
    }
    
    // If nivel 2 (familia) was updated, recalculate nivel 1 (partida)
    if ((nivel === 2 || nivel === 3) && partida_nombre) {
      console.log(`[2/2] Updating nivel 1 (partida) for: ${partida_nombre}`);
      
      // Get all nivel 2 items in this partida
      const nivel2Items = await ctx.db
        .query("partidas")
        .withIndex("by_proyecto_nivel_partida", (q: any) =>
          q.eq("proyecto", proyecto).eq("nivel", 2).eq("partida_nombre", partida_nombre)
        )
        .collect();
      
      // Sum presupuesto_aprobado from all nivel 2 items
      const totalPresupuestoAprobado = nivel2Items.reduce(
        (sum: number, item: any) => sum + (item.presupuesto_aprobado || 0),
        0
      );
      
      // Update the nivel 1 (partida) record
      const nivel1Items = await ctx.db
        .query("partidas")
        .withIndex("by_proyecto_nivel_nombre", (q: any) => 
          q.eq("proyecto", proyecto).eq("nivel", 1).eq("nombre", partida_nombre)
        )
        .collect();
      
      for (const item of nivel1Items) {
        const pagado = item.pagado || 0;
        const porGastar = totalPresupuestoAprobado - pagado;
        await ctx.db.patch(item._id, approvedBudgetPatch(totalPresupuestoAprobado, pagado));
        console.log(`✅ Updated nivel 1: presupuesto_aprobado=${totalPresupuestoAprobado}, por_gastar=${porGastar}`);
      }
    }
    
    console.log("✅ Cascade update completed successfully");
  } catch (error) {
    console.error("❌ Error cascading presupuesto_aprobado update:", error);
    throw error;
  }
}

// Register trigger for partidas table to cascade presupuesto_aprobado updates
triggers.register("partidas", async (ctx, change) => {
  console.log("Partida changed:", change.operation, change.id);
  
  try {
    // Get the partida record to extract proyecto information
    let partida;
    if (change.operation === "insert" || change.operation === "update") {
      partida = change.newDoc;
    } else if (change.operation === "delete") {
      partida = change.oldDoc;
    }
    
    if (!partida || !partida.proyecto) {
      console.log("No partida or proyecto found, skipping trigger");
      return;
    }
    
    // Update por_gastar if presupuesto_aprobado changed
    if (change.operation === "update" && change.oldDoc) {
      const oldAprobado = change.oldDoc.presupuesto_aprobado;
      const newAprobado = change.newDoc.presupuesto_aprobado;
      const newPagado = change.newDoc.pagado;
      
      // If presupuesto_aprobado changed, cascade updates up the hierarchy
      if (oldAprobado !== newAprobado) {
        const newPorGastar = newAprobado - (newPagado || 0);
        await ctx.db.patch(change.id, { por_gastar: newPorGastar });
        console.log(`Updated por_gastar for partida ${change.id}: ${newPorGastar}`);
        
        // Cascade presupuesto_aprobado updates up the hierarchy
        await cascadePresupuestoAprobadoUpdate(ctx, partida);
        const project = await ctx.db.get(partida.proyecto);
        if (project?.fee_concepts?.length) await repairProjectPaymentTotals(ctx, partida.proyecto);
        
        // Update meticas_presupuesto
        console.log("Updating meticas_presupuesto for proyecto:", partida.proyecto);
        await updateMeticasPresupuesto(ctx, partida.proyecto);
        console.log("✅ Successfully updated meticas_presupuesto after partida change");
      } else if (partida.nivel === 1 && (
        change.oldDoc.pagado !== newPagado ||
        change.oldDoc.presupuesto_original !== change.newDoc.presupuesto_original
      )) {
        await updateMeticasPresupuesto(ctx, partida.proyecto);
      }
    }
    
    // On insert, calculate initial por_gastar
    if (change.operation === "insert") {
      const porGastar = partida.presupuesto_aprobado - (partida.pagado || 0);
      await ctx.db.patch(change.id, { por_gastar: porGastar });
      console.log(`Set initial por_gastar for partida ${change.id}: ${porGastar}`);
    }
    if (change.operation !== "update") {
      const project = await ctx.db.get(partida.proyecto);
      if (project?.fee_concepts?.length) await repairProjectPaymentTotals(ctx, partida.proyecto);
      if (partida.nivel === 1) await updateMeticasPresupuesto(ctx, partida.proyecto);
    }
    if (change.operation === "update" && change.oldDoc?.presupuesto_original !== partida.presupuesto_original) {
      const project = await ctx.db.get(partida.proyecto);
      if (project?.fee_concepts?.length) await repairProjectPaymentTotals(ctx, partida.proyecto);
    }
  } catch (error) {
    console.error("❌ Error in partida trigger:", error);
    throw error;
  }
});

// Helper function to update or create meticas_presupuesto for a proyecto
async function updateMeticasPresupuesto(
  ctx: { db: any },
  proyectoId: string
) {
  console.log(`Calculating metrics for proyecto: ${proyectoId}`);
  
  try {
    // Get all partidas for this proyecto (nivel 1 only for aggregated totals)
    const nivel1Partidas = await ctx.db
      .query("partidas")
      .withIndex("by_nivel_proyecto", (q: any) => 
        q.eq("nivel", 1).eq("proyecto", proyectoId)
      )
      .collect();
    
    const proyecto = await ctx.db.get(proyectoId);
    const { presupuesto_original, presupuesto_aprobado, gasto_total, por_gastar } =
      calculatePresupuestoMetrics(nivel1Partidas, proyecto?.honorarios_monto, await getBudgetIndirectos(ctx, proyecto));
    
    console.log("Calculated metrics:", {
      presupuesto_original,
      presupuesto_aprobado,
      gasto_total,
      por_gastar
    });
    
    // Check if meticas_presupuesto already exists for this proyecto
    const existingMetrics = await ctx.db
      .query("meticas_presupuesto")
      .withIndex("by_proyecto", (q: any) => q.eq("proyecto", proyectoId))
      .first();
    
    if (existingMetrics) {
      // Update existing record
      await ctx.db.patch(existingMetrics._id, {
        presupuesto_original,
        presupuesto_aprobado,
        gasto_total,
        por_gastar
      });
      console.log("Updated existing meticas_presupuesto record");
    } else {
      // Create new record
      await ctx.db.insert("meticas_presupuesto", {
        proyecto: proyectoId,
        presupuesto_original,
        presupuesto_aprobado,
        gasto_total,
        por_gastar
      });
      console.log("Created new meticas_presupuesto record");
    }
  } catch (error) {
    console.error("❌ Error updating meticas_presupuesto:", error);
    throw error;
  }
}

// Helper function to calculate and update honorarios monto for a proyecto
async function updateHonorariosMonto(
  ctx: { db: any },
  proyectoId: string
) {
  console.log(`Calculating honorarios monto for proyecto: ${proyectoId}`);
  
  try {
    // Get the proyecto to access honorarios_porcentaje
    const proyecto = await ctx.db.get(proyectoId);
    if (!proyecto) {
      console.log("Proyecto not found, skipping honorarios calculation");
      return;
    }
    if (proyecto.fee_concepts?.length) {
      await repairProjectPaymentTotals(ctx, proyectoId as Id<"desarrollos">);
      return;
    }
    
    const transactions = await ctx.db.query("transacciones")
      .withIndex("by_proyecto", (q: any) => q.eq("proyecto", proyectoId)).collect();
    const needsPayments = getHonorariosModo(proyecto.honorarios_modo) === "transacciones" ||
      Boolean(proyecto.excluded_partidas_honorarios?.length) || Boolean(proyecto.fee_concepts?.length);
    const partidas = needsPayments ? await ctx.db.query("partidas")
      .withIndex("by_proyecto", (q: any) => q.eq("proyecto", proyectoId)).collect() : [];
    const pagos = needsPayments ? (await Promise.all(transactions.map((t: any) => ctx.db.query("pagos")
      .withIndex("by_transaccion", (q: any) => q.eq("transaccion_id", t._id)).collect()))).flat() : [];
    const roundedHonorariosMonto = calculateHonorariosFromRecords({
      proyectoId, modo: proyecto.honorarios_modo, porcentaje: proyecto.honorarios_porcentaje,
      feeConcepts: proyecto.fee_concepts, convert: feeBudgetConvert(proyecto),
      excludedPartidas: proyecto.excluded_partidas_honorarios, transactions, partidas, pagos,
    });

    // Update the desarrollo's honorarios_monto field
    await ctx.db.patch(proyectoId, { 
      honorarios_monto: roundedHonorariosMonto 
    });
    
    console.log(`✅ Updated honorarios_monto to ${roundedHonorariosMonto}`);
    
    // Update the HONORARIOS partida with the new amount
    await updateHonorariosPartida(ctx, proyectoId, roundedHonorariosMonto);
    await updateMeticasPresupuesto(ctx, proyectoId);
  } catch (error) {
    console.error("❌ Error updating honorarios_monto:", error);
    throw error;
  }
}

// Helper function to update the HONORARIOS partida with honorarios_monto
// Handles different case variations: "HONORARIOS", "Honorarios", "honorarios"
async function updateHonorariosPartida(
  ctx: { db: any },
  proyectoId: string,
  honorariosMonto: number
) {
  console.log(`Updating HONORARIOS partida for proyecto: ${proyectoId}`);
  
  try {
    // Restrict the scan to nivel 1 partidas in this project. Using `.filter()`
    // here used to scan the complete global partidas table on every transaction.
    const nivel1Partidas = await ctx.db
      .query("partidas")
      .withIndex("by_nivel_proyecto", (q: any) =>
        q.eq("nivel", 1).eq("proyecto", proyectoId)
      )
      .collect();
    
    // Find the honorarios partida with case-insensitive matching
    const project = await ctx.db.get(proyectoId);
    const sourceId = project?.fee_concepts?.find((c: { concepto: string; partida_id: string }) => c.concepto === "honorarios")?.partida_id;
    const honorariosPartida = nivel1Partidas.find((p: Doc<"partidas">) => sourceId ? p._id === sourceId : isHonorariosPartida(p));
    
    if (honorariosPartida) {
      // Update pagado and por_gastar for existing HONORARIOS partida
      const presupuestoAprobado = honorariosPartida.presupuesto_aprobado || 0;
      const porGastar = presupuestoAprobado - honorariosMonto;
      
      await ctx.db.patch(honorariosPartida._id, {
        pagado: honorariosMonto,
        por_gastar: porGastar
      });
      
      console.log(`✅ Updated HONORARIOS partida (${honorariosPartida.nombre}): pagado=${honorariosMonto}, por_gastar=${porGastar}`);
    } else {
      console.log("⚠️ HONORARIOS partida not found for this proyecto (checked case-insensitive)");
    }
  } catch (error) {
    console.error("❌ Error updating HONORARIOS partida:", error);
    throw error;
  }
}

// Helper function to update proyecto's primary currency based on transaction history
async function updateProyectoMonedaPrincipal(ctx: { db: any }, proyectoId: string) {
  // Get all transactions for this proyecto
  const transactions = await ctx.db
    .query("transacciones")
    .withIndex("by_proyecto", (q: any) => q.eq("proyecto", proyectoId))
    .collect();
  
  if (transactions.length === 0) {
    // No transactions, set default to MXN
    await ctx.db.patch(proyectoId, { moneda_principal: "MXN" });
    return;
  }
  
  // Count currency occurrences
  const currencyCounts = new Map<string, number>();
  for (const transaction of transactions) {
    if (!transaction) continue;
    const currency = transaction.moneda || "MXN";
    currencyCounts.set(currency, (currencyCounts.get(currency) || 0) + 1);
  }
  
  // Find most common currency
  let dominantCurrency = "MXN";
  let maxCount = 0;
  for (const [currency, count] of currencyCounts.entries()) {
    if (count > maxCount) {
      maxCount = count;
      dominantCurrency = currency;
    }
  }
  
  // Update proyecto with dominant currency
  await ctx.db.patch(proyectoId, { moneda_principal: dominantCurrency });
  console.log(`✅ Updated proyecto ${proyectoId} currency to ${dominantCurrency}`);
}

async function refreshTransactionHierarchies(ctx: { db: any }, transaction: any) {
  const payments = await ctx.db
    .query("pagos")
    .withIndex("by_transaccion", (q: any) => q.eq("transaccion_id", transaction._id))
    .collect();
  const hierarchies = new Map<string, { partida: string; familia: string; sub_partida: string; nivel: number; proyecto: string }>();
  for (const payment of payments) {
    if (!payment.partida_id) continue;
    const partida = await ctx.db.get(payment.partida_id);
    if (!partida || partida.proyecto !== transaction.proyecto) continue;
    const context = {
      partida: partida.partida_nombre || partida.nombre || "",
      familia: partida.familia || "",
      sub_partida: partida.sub_partida || "",
      nivel: partida.nivel,
      proyecto: transaction.proyecto,
    };
    hierarchies.set(`${context.partida}|${context.familia}|${context.sub_partida}`, context);
  }
  for (const context of hierarchies.values()) await updatePagadoForHierarchy(ctx, context);
  await updateMeticasPresupuesto(ctx, transaction.proyecto);
}

// Register trigger for transacciones table to update honorarios monto and currency
triggers.register("transacciones", async (ctx, change) => {
  console.log("Transaction changed:", change.operation, change.id);
  
  try {
    // Get the transaction record to extract proyecto information
    let transaction;
    if (change.operation === "insert" || change.operation === "update") {
      transaction = change.newDoc;
    } else if (change.operation === "delete") {
      transaction = change.oldDoc;
    }
    
    if (!transaction || !transaction.proyecto) {
      console.log("No transaction or proyecto found, skipping trigger");
      return;
    }
    
    // Recalculate all derived cost data when any financial classification can
    // change. Payment inserts/updates handle line-item changes separately.
    if (change.operation === "update" && change.oldDoc) {
      const montoChanged = change.oldDoc.monto_total !== change.newDoc.monto_total;
      const monedaChanged = change.oldDoc.moneda !== change.newDoc.moneda;
      const statusChanged = change.oldDoc.status !== change.newDoc.status;
      const fechaChanged = change.oldDoc.fecha !== change.newDoc.fecha;
      const rateChanged = change.oldDoc.tipo_cambio !== change.newDoc.tipo_cambio;
      
      if (!montoChanged && !monedaChanged && !statusChanged && !fechaChanged && !rateChanged) {
        console.log("No financial transaction fields changed, skipping updates");
        return;
      }
      
      // Update currency if moneda changed
      if (monedaChanged) {
        await updateProyectoMonedaPrincipal(ctx, transaction.proyecto);
      }
      if (statusChanged || monedaChanged) {
        await refreshTransactionHierarchies(ctx, transaction);
      }
    } else if (change.operation === "insert") {
      // On insert, always update currency
      await updateProyectoMonedaPrincipal(ctx, transaction.proyecto);
    } else if (change.operation === "delete") {
      // On delete, recalculate currency
      await updateProyectoMonedaPrincipal(ctx, transaction.proyecto);
    }
    
    // Update honorarios monto for the proyecto
    await updateHonorariosMonto(ctx, transaction.proyecto);
    console.log("✅ Successfully updated honorarios_monto after transaction change");
  } catch (error) {
    console.error("❌ Error in transaction trigger:", error);
    throw error;
  }
});

// Recalculate honorarios when the project calculation settings change.
triggers.register("desarrollos", async (ctx, change) => {
  console.log("Desarrollo changed:", change.operation, change.id);
  
  try {
    // Ignore updates to derived fields to avoid triggering the calculation again.
    if (change.operation === "update" && change.oldDoc) {
      const modeChanged = getHonorariosModo(change.oldDoc.honorarios_modo) !==
        getHonorariosModo(change.newDoc.honorarios_modo);
      const oldPercentage = change.oldDoc.honorarios_porcentaje;
      const newPercentage = change.newDoc.honorarios_porcentaje;
      const oldExcludedPartidas = JSON.stringify(change.oldDoc.excluded_partidas_honorarios || []);
      const newExcludedPartidas = JSON.stringify(change.newDoc.excluded_partidas_honorarios || []);
      
      const percentageChanged = oldPercentage !== newPercentage;
      const excludedPartidasChanged = oldExcludedPartidas !== newExcludedPartidas;
      
      if (modeChanged || percentageChanged || excludedPartidasChanged ||
          JSON.stringify(canonicalFeeConcepts(change.oldDoc.fee_concepts)) !== JSON.stringify(canonicalFeeConcepts(change.newDoc.fee_concepts)) ||
          change.oldDoc.indirectos_porcentaje !== change.newDoc.indirectos_porcentaje ||
          change.oldDoc.indirectos_fecha_inicio !== change.newDoc.indirectos_fecha_inicio) {
        if (change.oldDoc.fee_concepts?.length && !change.newDoc.fee_concepts?.length) {
          await repairProjectPaymentTotals(ctx, change.id);
          return;
        }
        if (percentageChanged) {
          console.log(`Honorarios percentage changed from ${oldPercentage} to ${newPercentage}`);
        }
        if (excludedPartidasChanged) {
          console.log(`Excluded partidas changed`);
        }
        
        // Recalculate honorarios_monto with the new percentage or exclusions
        await updateHonorariosMonto(ctx, change.id);
        console.log("✅ Successfully updated honorarios_monto after changes");
      }
    }
  } catch (error) {
    console.error("❌ Error in desarrollo trigger:", error);
    throw error;
  }
});

// Helper function to update sales project's primary currency based on transaction history
async function updateSalesProyectoMonedaPrincipal(ctx: { db: any }, salesProyectoId: string) {
  // Get all sales transactions for this sales project
  const transactions = await ctx.db
    .query("sales_transacciones")
    .withIndex("by_sales_proyecto", (q: any) => q.eq("sales_proyecto", salesProyectoId))
    .collect();
  
  if (transactions.length === 0) {
    // No transactions, set default to MXN
    await ctx.db.patch(salesProyectoId, { moneda_principal: "MXN" });
    return;
  }
  
  // Count currency occurrences
  const currencyCounts = new Map<string, number>();
  for (const transaction of transactions) {
    if (!transaction) continue;
    const currency = transaction.moneda || "MXN";
    currencyCounts.set(currency, (currencyCounts.get(currency) || 0) + 1);
  }
  
  // Find most common currency
  let dominantCurrency = "MXN";
  let maxCount = 0;
  for (const [currency, count] of currencyCounts.entries()) {
    if (count > maxCount) {
      maxCount = count;
      dominantCurrency = currency;
    }
  }
  
  // Update sales project with dominant currency
  await ctx.db.patch(salesProyectoId, { moneda_principal: dominantCurrency });
  console.log(`✅ Updated sales_proyecto ${salesProyectoId} currency to ${dominantCurrency}`);
}

// Register trigger for sales_transacciones table to update currency
triggers.register("sales_transacciones", async (ctx, change) => {
  console.log("Sales transaction changed:", change.operation, change.id);
  
  try {
    // Get the transaction record to extract sales_proyecto information
    let transaction;
    if (change.operation === "insert" || change.operation === "update") {
      transaction = change.newDoc;
    } else if (change.operation === "delete") {
      transaction = change.oldDoc;
    }
    
    if (!transaction || !transaction.sales_proyecto) {
      console.log("No sales transaction or sales_proyecto found, skipping trigger");
      return;
    }
    
    // For updates, check if moneda changed
    if (change.operation === "update" && change.oldDoc) {
      const monedaChanged = change.oldDoc.moneda !== change.newDoc.moneda;
      
      if (monedaChanged) {
        await updateSalesProyectoMonedaPrincipal(ctx, transaction.sales_proyecto);
      }
    } else if (change.operation === "insert") {
      // On insert, always update currency
      await updateSalesProyectoMonedaPrincipal(ctx, transaction.sales_proyecto);
    } else if (change.operation === "delete") {
      // On delete, recalculate currency
      await updateSalesProyectoMonedaPrincipal(ctx, transaction.sales_proyecto);
    }
    
    console.log("✅ Successfully updated sales project currency after transaction change");
  } catch (error) {
    console.error("❌ Error in sales transaction trigger:", error);
    throw error;
  }
});

// Register trigger for ingresos table to update totals when income entries change
triggers.register("ingresos", async (ctx, change) => {
  console.log("Ingreso changed:", change.operation, change.id);
  
  try {
    // Get the ingreso record to extract proyecto information
    let ingreso;
    if (change.operation === "insert" || change.operation === "update") {
      ingreso = change.newDoc;
    } else if (change.operation === "delete") {
      ingreso = change.oldDoc;
    }
    
    if (!ingreso || !ingreso.proyecto) {
      console.log("No ingreso or proyecto found, skipping trigger");
      return;
    }
    
    // Recalculate and update ingresos_totals for this proyecto
    await updateIngresosTotalsInternal(ctx, ingreso.proyecto);
    console.log("✅ Successfully updated ingresos_totals after ingreso change");
  } catch (error) {
    console.error("❌ Error in ingreso trigger:", error);
    throw error;
  }
});

// Helper function to update ingresos_totals (internal implementation for trigger)
export async function updateIngresosTotalsInternal(
  ctx: { db: any },
  proyectoId: string
) {
  console.log(`Calculating ingresos totals for proyecto: ${proyectoId}`);
  
  try {
    // Get all ingresos for this proyecto
    const ingresos = await ctx.db
      .query("ingresos")
      .withIndex("by_proyecto", (q: any) => q.eq("proyecto", proyectoId))
      .collect();
    
    // Calculate totals
    const total_ingresos = ingresos.reduce(
      (sum: number, i: any) => sum + (i.monto || 0),
      0
    );
    const total_count = ingresos.length;
    
    console.log("Calculated ingresos totals:", { total_ingresos, total_count });
    
    // Check if totals record exists
    const existingTotals = await ctx.db
      .query("ingresos_totals")
      .withIndex("by_proyecto", (q: any) => q.eq("proyecto", proyectoId))
      .first();
    
    if (existingTotals) {
      // Update existing record
      await ctx.db.patch(existingTotals._id, {
        total_ingresos,
        total_count,
        last_updated: Date.now(),
      });
      console.log("Updated existing ingresos_totals record");
    } else {
      // Create new record
      await ctx.db.insert("ingresos_totals", {
        proyecto: proyectoId,
        total_ingresos,
        total_count,
        last_updated: Date.now(),
      });
      console.log("Created new ingresos_totals record");
    }
  } catch (error) {
    console.error("❌ Error updating ingresos_totals:", error);
    throw error;
  }
}

// Create wrappers that replace the built-in `mutation` and `internalMutation`
// The wrappers override `ctx` so that `ctx.db.insert`, `ctx.db.patch`, etc. run registered trigger functions
export const mutation = customMutation(rawMutation, customCtx(triggers.wrapDB));
export const internalMutation = customMutation(rawInternalMutation, customCtx(triggers.wrapDB));

// Export helper functions for bulk operations that bypass per-item triggers
export { updatePagadoForHierarchy, updateMeticasPresupuesto, updateHonorariosMonto, updateProyectoMonedaPrincipal };
