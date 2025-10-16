/* eslint-disable no-restricted-imports */
import { mutation as rawMutation, internalMutation as rawInternalMutation } from "./_generated/server";
/* eslint-enable no-restricted-imports */
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
    
    await ctx.db.patch(item._id, { pagado: totalPagado });
    console.log(`Updated nivel 3 (${partida} > ${familia} > ${sub_partida}): ${totalPagado}`);
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
    
    await ctx.db.patch(item._id, { pagado: totalPagado });
    console.log(`Updated nivel 2 (${partida} > ${familia}): ${totalPagado}`);
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
    
    await ctx.db.patch(item._id, { pagado: totalPagado });
    console.log(`Updated nivel 1 (${partida}): ${totalPagado}`);
  }
  } catch (error) {
    console.error("❌ Error updating partidas hierarchy:", error);
    throw error;
  }
}

// Create wrappers that replace the built-in `mutation` and `internalMutation`
// The wrappers override `ctx` so that `ctx.db.insert`, `ctx.db.patch`, etc. run registered trigger functions
export const mutation = customMutation(rawMutation, customCtx(triggers.wrapDB));
export const internalMutation = customMutation(rawInternalMutation, customCtx(triggers.wrapDB));