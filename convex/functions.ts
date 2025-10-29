import { mutation as rawMutation, internalMutation as rawInternalMutation } from "./_generated/server";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { DataModel } from "./_generated/dataModel";
import { Triggers } from "convex-helpers/server/triggers";
import { customCtx, customMutation } from "convex-helpers/server/customFunctions";

// Initialize Triggers with table types from schema.ts
const triggers = new Triggers<DataModel>();

// Register trigger for pagos table to update pagado field in partidas
triggers.register("pagos", async (ctx, change) => {
  console.log("Payment changed:", change.operation, change.id);
  
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
    
    // Fetch related data from partidas and transacciones tables
    // (pagos table is now simplified and doesn't store these fields)
    const partidaDoc = await ctx.db.get(payment.partida_id);
    if (!partidaDoc || partidaDoc === null) {
      console.log("Partida not found, skipping trigger");
      return;
    }
    
    const transactionDoc = await ctx.db.get(payment.transaccion_id);
    if (!transactionDoc || transactionDoc === null) {
      console.log("Transaction not found, skipping trigger");
      return;
    }
    
    // Type assertion to access fields
    const partida = partidaDoc as any;
    const transaction = transactionDoc as any;
    
    const context = {
      partida: partida.partida_nombre || partida.nombre || "",
      familia: partida.familia || "",
      sub_partida: partida.sub_partida || "",
      nivel: partida.nivel,
      proyecto: transaction.proyecto
    };
    
    console.log("Payment details:", context);
    
    // Recalculate pagado for all affected partidas in the hierarchy
    await updatePagadoForHierarchy(ctx, context);
    console.log("✅ Successfully updated pagado for all hierarchy levels");
    
    // Update meticas_presupuesto after payment changes
    await updateMeticasPresupuesto(ctx, transaction.proyecto);
    console.log("✅ Successfully updated meticas_presupuesto");
  } catch (error) {
    console.error("❌ Error in payment trigger:", error);
    throw error; // Re-throw to see the error in Convex logs
  }
});

// Helper to calculate pagado for a specific set of partida IDs
async function calculatePagadoForPartidas(ctx: { db: any }, partidaIds: any[]): Promise<Map<string, number>> {
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
  
  // Sum up pagos for each partida
  partidaIds.forEach((id, index) => {
    const total = pagosArrays[index].reduce((sum: number, p: any) => sum + (p.monto || 0), 0);
    pagadoMap.set(id, total);
  });
  
  return pagadoMap;
}

// Helper function to recalculate and update pagado for all levels of the hierarchy
async function updatePagadoForHierarchy(
  ctx: { db: any },
  context: { partida: string; familia: string; sub_partida: string; nivel: number; proyecto: string }
) {
  const { partida, familia, sub_partida, nivel, proyecto } = context;
  
  console.log(`Updating pagado for nivel ${nivel}: ${partida} > ${familia} > ${sub_partida}`);
  
  try {
    // Handle based on the nivel of the payment
    if (nivel === 3 && sub_partida) {
      // Payment is on nivel 3 (sub-partida)
      // 1. Update nivel 3 (sub-partida) - specific sub_partida
      console.log(`[1/3] Querying nivel 3 items for: ${partida} > ${familia} > ${sub_partida}`);
      const nivel3Items = await ctx.db
        .query("partidas")
        .withIndex("by_proyecto_nivel_partida_familia", (q: any) =>
          q.eq("proyecto", proyecto).eq("nivel", 3).eq("partida_nombre", partida).eq("familia", familia)
        )
        .filter((q: any) => q.eq(q.field("sub_partida"), sub_partida))
        .collect();
      
      console.log(`[1/3] Found ${nivel3Items.length} nivel 3 items`);
      
      if (nivel3Items.length > 0) {
        const pagadoMap = await calculatePagadoForPartidas(ctx, nivel3Items.map((i: any) => i._id));
        
        for (const item of nivel3Items) {
          const totalPagado = pagadoMap.get(item._id) || 0;
          const porGastar = item.presupuesto_aprobado - totalPagado;
          
          await ctx.db.patch(item._id, { 
            pagado: totalPagado,
            por_gastar: porGastar 
          });
          console.log(`Updated nivel 3: pagado=${totalPagado}, por_gastar=${porGastar}`);
        }
      }
    }
  
    // 2. Update nivel 2 (familia)
    console.log(`[2/3] Updating nivel 2 items for: ${partida} > ${familia}`);
    const nivel2Items = await ctx.db
      .query("partidas")
      .withIndex("by_proyecto_nivel_partida_familia", (q: any) =>
        q.eq("proyecto", proyecto).eq("nivel", 2).eq("partida_nombre", partida).eq("familia", familia)
      )
      .collect();
    
    console.log(`[2/3] Found ${nivel2Items.length} nivel 2 items`);
    
    if (nivel2Items.length > 0) {
      // Check if this familia has sub-partidas (nivel 3)
      const allNivel3InFamilia = await ctx.db
        .query("partidas")
        .withIndex("by_proyecto_nivel_partida_familia", (q: any) =>
          q.eq("proyecto", proyecto).eq("nivel", 3).eq("partida_nombre", partida).eq("familia", familia)
        )
        .collect();
      
      let totalPagadoNivel2 = 0;
      
      if (allNivel3InFamilia.length > 0) {
        // Familia has sub-partidas: sum pagos from all nivel 3 items
        const pagadoMap = await calculatePagadoForPartidas(ctx, allNivel3InFamilia.map((i: any) => i._id));
        totalPagadoNivel2 = Array.from(pagadoMap.values()).reduce((sum, val) => sum + val, 0);
        console.log(`Nivel 2 has sub-partidas, total from nivel 3: ${totalPagadoNivel2}`);
      } else {
        // Familia has NO sub-partidas: calculate pagos directly on nivel 2 items
        const pagadoMap = await calculatePagadoForPartidas(ctx, nivel2Items.map((i: any) => i._id));
        totalPagadoNivel2 = Array.from(pagadoMap.values()).reduce((sum, val) => sum + val, 0);
        console.log(`Nivel 2 has NO sub-partidas, direct payment: ${totalPagadoNivel2}`);
      }
      
      for (const item of nivel2Items) {
        const porGastar = item.presupuesto_aprobado - totalPagadoNivel2;
        
        await ctx.db.patch(item._id, { 
          pagado: totalPagadoNivel2,
          por_gastar: porGastar 
        });
        console.log(`Updated nivel 2: pagado=${totalPagadoNivel2}, por_gastar=${porGastar}`);
      }
    }
  
    // 3. Update nivel 1 (partida) - sum from all nivel 2 and nivel 3 items
    console.log(`[3/3] Updating nivel 1 items for: ${partida}`);
    const nivel1Items = await ctx.db
      .query("partidas")
      .withIndex("by_proyecto_nivel_nombre", (q: any) => 
        q.eq("proyecto", proyecto).eq("nivel", 1).eq("nombre", partida)
      )
      .collect();
    
    console.log(`[3/3] Found ${nivel1Items.length} nivel 1 items`);
    
    if (nivel1Items.length > 0) {
      // Get all nivel 2 items in this partida
      const allNivel2InPartida = await ctx.db
        .query("partidas")
        .withIndex("by_proyecto_nivel_partida", (q: any) =>
          q.eq("proyecto", proyecto).eq("nivel", 2).eq("partida_nombre", partida)
        )
        .collect();
      
      // Get all nivel 3 items in this partida
      const allNivel3InPartida = await ctx.db
        .query("partidas")
        .withIndex("by_proyecto_nivel_partida", (q: any) =>
          q.eq("proyecto", proyecto).eq("nivel", 3).eq("partida_nombre", partida)
        )
        .collect();
      
      let totalPagadoNivel1 = 0;
      
      if (allNivel3InPartida.length > 0) {
        // Sum pagos from all nivel 3 items (sub-partidas)
        const pagadoMap3 = await calculatePagadoForPartidas(ctx, allNivel3InPartida.map((i: any) => i._id));
        totalPagadoNivel1 = Array.from(pagadoMap3.values()).reduce((sum, val) => sum + val, 0);
        console.log(`Total from nivel 3 items: ${totalPagadoNivel1}`);
      }
      
      // Add pagos from nivel 2 items that have NO nivel 3 children (direct familia payments)
      for (const nivel2Item of allNivel2InPartida) {
        // Check if this familia has nivel 3 items
        const nivel3ForThisFamilia = allNivel3InPartida.filter(
          (n3: any) => n3.familia === nivel2Item.familia
        );
        
        if (nivel3ForThisFamilia.length === 0) {
          // This familia has NO sub-partidas, so include its direct payments
          const pagadoMapNivel2 = await calculatePagadoForPartidas(ctx, [nivel2Item._id]);
          const directPayment = pagadoMapNivel2.get(nivel2Item._id) || 0;
          totalPagadoNivel1 += directPayment;
          console.log(`Added direct familia payment for ${nivel2Item.familia}: ${directPayment}`);
        }
      }
      
      for (const item of nivel1Items) {
        const porGastar = item.presupuesto_aprobado - totalPagadoNivel1;
        
        await ctx.db.patch(item._id, { 
          pagado: totalPagadoNivel1,
          por_gastar: porGastar 
        });
        console.log(`Updated nivel 1: pagado=${totalPagadoNivel1}, por_gastar=${porGastar}`);
      }
    }
  } catch (error) {
    console.error("❌ Error updating partidas hierarchy:", error);
    throw error;
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
        await ctx.db.patch(item._id, { 
          presupuesto_aprobado: totalPresupuestoAprobado,
          por_gastar: porGastar
        });
        console.log(`✅ Updated nivel 2: presupuesto_aprobado=${totalPresupuestoAprobado}, por_gastar=${porGastar}`);
      }
    }
    
    // If nivel 2 (familia) was updated, recalculate nivel 1 (partida)
    if ((nivel === 2 || nivel === 3) && partida_nombre) {
      console.log(`[2/2] Updating nivel 1 (partida) for: ${partida_nombre}`);
      
      // Get all nivel 2 items in this partida
      const nivel2Items = await ctx.db
        .query("partidas")
        .withIndex("by_nivel_proyecto", (q: any) => 
          q.eq("nivel", 2).eq("proyecto", proyecto)
        )
        .filter((q: any) => q.eq(q.field("partida_nombre"), partida_nombre))
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
        await ctx.db.patch(item._id, { 
          presupuesto_aprobado: totalPresupuestoAprobado,
          por_gastar: porGastar
        });
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
        
        // Update meticas_presupuesto
        console.log("Updating meticas_presupuesto for proyecto:", partida.proyecto);
        await updateMeticasPresupuesto(ctx, partida.proyecto);
        console.log("✅ Successfully updated meticas_presupuesto after partida change");
      }
    }
    
    // On insert, calculate initial por_gastar
    if (change.operation === "insert") {
      const porGastar = partida.presupuesto_aprobado - (partida.pagado || 0);
      await ctx.db.patch(change.id, { por_gastar: porGastar });
      console.log(`Set initial por_gastar for partida ${change.id}: ${porGastar}`);
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
    
    // Calculate totals by summing nivel 1 partidas
    const presupuesto_original = nivel1Partidas.reduce(
      (sum: number, p: any) => sum + (p.presupuesto_original || 0),
      0
    );
    
    const presupuesto_aprobado = nivel1Partidas.reduce(
      (sum: number, p: any) => sum + (p.presupuesto_aprobado || 0),
      0
    );
    
    const gasto_total = nivel1Partidas.reduce(
      (sum: number, p: any) => sum + (p.pagado || 0),
      0
    );
    
    const por_gastar = presupuesto_aprobado - gasto_total;
    
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
    
    const honorariosPorcentaje = proyecto.honorarios_porcentaje || 0;
    
    // Get all transactions for this proyecto
    const allTransactions = await ctx.db
      .query("transacciones")
      .withIndex("by_proyecto", (q: any) => q.eq("proyecto", proyectoId))
      .collect();
    
    // Calculate total amount from all transactions
    const totalAmount = allTransactions.reduce(
      (sum: number, t: any) => sum + (t.monto_total || 0),
      0
    );
    
    // Calculate honorarios amount: total * percentage / 100
    const honorariosMonto = totalAmount * (honorariosPorcentaje / 100);
    
    // Round to 2 decimal places
    const roundedHonorariosMonto = Math.round(honorariosMonto * 100) / 100;
    
    console.log("Honorarios calculation:", {
      totalAmount,
      honorariosPorcentaje,
      honorariosMonto: roundedHonorariosMonto
    });
    
    // Update the desarrollo's honorarios_monto field
    await ctx.db.patch(proyectoId, { 
      honorarios_monto: roundedHonorariosMonto 
    });
    
    console.log(`✅ Updated honorarios_monto to ${roundedHonorariosMonto}`);
  } catch (error) {
    console.error("❌ Error updating honorarios_monto:", error);
    throw error;
  }
}

// Register trigger for transacciones table to update honorarios monto
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
    
    // For updates, only recalculate if monto_total changed (percentage is set separately)
    if (change.operation === "update" && change.oldDoc) {
      const montoChanged = change.oldDoc.monto_total !== change.newDoc.monto_total;
      
      if (!montoChanged) {
        console.log("monto_total not changed, skipping honorarios update");
        return;
      }
    }
    
    // Update honorarios monto for the proyecto
    await updateHonorariosMonto(ctx, transaction.proyecto);
    console.log("✅ Successfully updated honorarios_monto after transaction change");
  } catch (error) {
    console.error("❌ Error in transaction trigger:", error);
    throw error;
  }
});

// Register trigger for desarrollos table to recalculate honorarios_monto when percentage changes
triggers.register("desarrollos", async (ctx, change) => {
  console.log("Desarrollo changed:", change.operation, change.id);
  
  try {
    // Only handle updates where honorarios_porcentaje changed
    if (change.operation === "update" && change.oldDoc) {
      const oldPercentage = change.oldDoc.honorarios_porcentaje;
      const newPercentage = change.newDoc.honorarios_porcentaje;
      
      if (oldPercentage !== newPercentage) {
        console.log(`Honorarios percentage changed from ${oldPercentage} to ${newPercentage}`);
        
        // Recalculate honorarios_monto with the new percentage
        await updateHonorariosMonto(ctx, change.id);
        console.log("✅ Successfully updated honorarios_monto after percentage change");
      }
    }
  } catch (error) {
    console.error("❌ Error in desarrollo trigger:", error);
    throw error;
  }
});

// Create wrappers that replace the built-in `mutation` and `internalMutation`
// The wrappers override `ctx` so that `ctx.db.insert`, `ctx.db.patch`, etc. run registered trigger functions
export const mutation = customMutation(rawMutation, customCtx(triggers.wrapDB));
export const internalMutation = customMutation(rawInternalMutation, customCtx(triggers.wrapDB));