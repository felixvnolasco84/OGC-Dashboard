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
    
    const { partida, familia, sub_partida, proyecto } = payment;
    console.log("Payment details:", { partida, familia, sub_partida, proyecto });
    
    // Recalculate pagado for all affected partidas in the hierarchy
    await updatePagadoForHierarchy(ctx, { partida, familia, sub_partida, proyecto });
    console.log("✅ Successfully updated pagado for all hierarchy levels");
    
    // Update meticas_presupuesto after payment changes
    await updateMeticasPresupuesto(ctx, proyecto);
    console.log("✅ Successfully updated meticas_presupuesto");
  } catch (error) {
    console.error("❌ Error in payment trigger:", error);
    throw error; // Re-throw to see the error in Convex logs
  }
});

// Helper function to recalculate and update pagado for all levels of the hierarchy
async function updatePagadoForHierarchy(
  ctx: { db: any },
  context: { partida: string; familia: string; sub_partida: string; proyecto: string }
) {
  const { partida, familia, sub_partida, proyecto } = context;
  
  // Get all payments for this project
  const allPayments = await ctx.db
    .query("pagos")
    .filter((q: any) => q.eq(q.field("proyecto"), proyecto))
    .collect();
  
  console.log(`Updating pagado for proyecto: ${proyecto}, found ${allPayments.length} payments`);
  
  try {
    // 1. Update nivel 3 (sub-partida) - specific sub_partida
    console.log(`[1/3] Querying nivel 3 items for: ${partida} > ${familia} > ${sub_partida}`);
    const nivel3Items = await ctx.db
      .query("partidas")
      .filter((q: any) => 
        q.and(
          q.eq(q.field("nivel"), 3),
          q.eq(q.field("proyecto"), proyecto),
          q.eq(q.field("partida_nombre"), partida),
          q.eq(q.field("familia"), familia),
          q.eq(q.field("sub_partida"), sub_partida)
        )
      )
      .collect();
    
    console.log(`[1/3] Found ${nivel3Items.length} nivel 3 items`);
  
  for (const item of nivel3Items) {
    const itemPayments = allPayments.filter((p: any) => 
      p.partida === partida && 
      p.familia === familia && 
      p.sub_partida === sub_partida
    );
    const totalPagado = itemPayments.reduce((sum: number, p: any) => sum + p.monto, 0);
    const porGastar = item.presupuesto_aprobado - totalPagado;
    
    await ctx.db.patch(item._id, { 
      pagado: totalPagado,
      por_gastar: porGastar 
    });
    console.log(`Updated nivel 3 (${partida} > ${familia} > ${sub_partida}): pagado=${totalPagado}, por_gastar=${porGastar}`);
  }
  
  // 2. Update nivel 2 (familia) - sum all sub-partidas in this familia
  console.log(`[2/3] Querying nivel 2 items for: ${partida} > ${familia}`);
  const nivel2Items = await ctx.db
    .query("partidas")
    .filter((q: any) => 
      q.and(
        q.eq(q.field("nivel"), 2),
        q.eq(q.field("proyecto"), proyecto),
        q.eq(q.field("partida_nombre"), partida),
        q.eq(q.field("familia"), familia)
      )
    )
    .collect();
  
  console.log(`[2/3] Found ${nivel2Items.length} nivel 2 items`);
  
  for (const item of nivel2Items) {
    const itemPayments = allPayments.filter((p: any) => 
      p.partida === partida && 
      p.familia === familia
    );
    const totalPagado = itemPayments.reduce((sum: number, p: any) => sum + p.monto, 0);
    const porGastar = item.presupuesto_aprobado - totalPagado;
    
    await ctx.db.patch(item._id, { 
      pagado: totalPagado,
      por_gastar: porGastar 
    });
    console.log(`Updated nivel 2 (${partida} > ${familia}): pagado=${totalPagado}, por_gastar=${porGastar}`);
  }
  
  // 3. Update nivel 1 (partida) - sum all familias in this partida
  console.log(`[3/3] Querying nivel 1 items for: ${partida}`);
  const nivel1Items = await ctx.db
    .query("partidas")
    .filter((q: any) => 
      q.and(
        q.eq(q.field("nivel"), 1),
        q.eq(q.field("proyecto"), proyecto),
        q.eq(q.field("nombre"), partida)
      )
    )
    .collect();
  
  console.log(`[3/3] Found ${nivel1Items.length} nivel 1 items`);
  
  for (const item of nivel1Items) {
    const itemPayments = allPayments.filter((p: any) => p.partida === partida);
    const totalPagado = itemPayments.reduce((sum: number, p: any) => sum + p.monto, 0);
    const porGastar = item.presupuesto_aprobado - totalPagado;
    
    await ctx.db.patch(item._id, { 
      pagado: totalPagado,
      por_gastar: porGastar 
    });
    console.log(`Updated nivel 1 (${partida}): pagado=${totalPagado}, por_gastar=${porGastar}`);
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
      
      // Get all nivel 3 items in this familia
      const nivel3Items = await ctx.db
        .query("partidas")
        .filter((q: any) => 
          q.and(
            q.eq(q.field("nivel"), 3),
            q.eq(q.field("proyecto"), proyecto),
            q.eq(q.field("partida_nombre"), partida_nombre),
            q.eq(q.field("familia"), familia)
          )
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
        .filter((q: any) => 
          q.and(
            q.eq(q.field("nivel"), 2),
            q.eq(q.field("proyecto"), proyecto),
            q.eq(q.field("partida_nombre"), partida_nombre),
            q.eq(q.field("familia"), familia)
          )
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
        .filter((q: any) => 
          q.and(
            q.eq(q.field("nivel"), 2),
            q.eq(q.field("proyecto"), proyecto),
            q.eq(q.field("partida_nombre"), partida_nombre)
          )
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
        .filter((q: any) => 
          q.and(
            q.eq(q.field("nivel"), 1),
            q.eq(q.field("proyecto"), proyecto),
            q.eq(q.field("nombre"), partida_nombre)
          )
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
      .filter((q: any) => 
        q.and(
          q.eq(q.field("nivel"), 1),
          q.eq(q.field("proyecto"), proyectoId)
        )
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

// Create wrappers that replace the built-in `mutation` and `internalMutation`
// The wrappers override `ctx` so that `ctx.db.insert`, `ctx.db.patch`, etc. run registered trigger functions
export const mutation = customMutation(rawMutation, customCtx(triggers.wrapDB));
export const internalMutation = customMutation(rawInternalMutation, customCtx(triggers.wrapDB));