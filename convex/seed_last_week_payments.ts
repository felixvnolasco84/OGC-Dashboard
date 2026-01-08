/**
 * Seed script to create test data for "Pagado semana anterior" feature
 * 
 * Current date: 08/01/2026 (Wednesday)
 * Last week: 29/12/2025 (Monday) - 04/01/2026 (Sunday)
 * 
 * Run this script using: npx convex run seed_last_week_payments:seedLastWeekPayments
 */

import { mutation } from "./functions";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

// Seed function to create test transactions and payments for last week
export const seedLastWeekPayments = mutation({
  args: {
    proyecto_id: v.id("desarrollos"),
  },
  handler: async (ctx, args) => {
    console.log("🌱 Starting seed for last week payments...");
    
    // Get some partidas from the project to create payments for
    const partidas = await ctx.db
      .query("partidas")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto_id))
      .collect();
    
    if (partidas.length === 0) {
      throw new Error("No partidas found for this project. Please upload partidas first.");
    }
    
    console.log(`Found ${partidas.length} partidas`);
    
    // Filter to get partidas at different levels
    const nivel1Partidas = partidas.filter(p => p.nivel === 1);
    const nivel2Partidas = partidas.filter(p => p.nivel === 2);
    const nivel3Partidas = partidas.filter(p => p.nivel === 3);
    
    console.log(`Nivel 1: ${nivel1Partidas.length}, Nivel 2: ${nivel2Partidas.length}, Nivel 3: ${nivel3Partidas.length}`);
    
    // Last week dates (29/12/2025 - 04/01/2026)
    const lastWeekDates = [
      "2025-12-29", // Monday
      "2025-12-30", // Tuesday
      "2025-12-31", // Wednesday (New Year's Eve)
      "2026-01-01", // Thursday (New Year)
      "2026-01-02", // Friday
    ];
    
    // Create transactions for each day of last week
    const createdTransactions: Id<"transacciones">[] = [];
    
    for (let i = 0; i < lastWeekDates.length; i++) {
      const fecha = lastWeekDates[i];
      
      // Create a transaction for this day
      const transactionId = await ctx.db.insert("transacciones", {
        proyecto: args.proyecto_id,
        monto_total: 0, // Will be updated after adding pagos
        fecha: fecha,
        tipo_pago: "transferencia",
        moneda: "MXN",
        tipo_cambio: "1",
        status: "Pagado",
        categoria: "material",
        banco: `Banco Test ${i + 1}`,
        codigo_referencia: `REF-SEED-${fecha}-${i}`,
      });
      
      createdTransactions.push(transactionId);
      console.log(`✅ Created transaction for ${fecha}: ${transactionId}`);
    }
    
    // Create pagos (line items) for each transaction
    // Distribute payments across different partida levels
    let totalPaymentsCreated = 0;
    
    for (let txIndex = 0; txIndex < createdTransactions.length; txIndex++) {
      const transactionId = createdTransactions[txIndex];
      let transactionTotal = 0;
      
      // Add payments to nivel 3 partidas (if available)
      if (nivel3Partidas.length > 0) {
        // Pick 2-3 random nivel 3 partidas
        const numPayments = Math.min(3, nivel3Partidas.length);
        for (let j = 0; j < numPayments; j++) {
          const partidaIndex = (txIndex * 3 + j) % nivel3Partidas.length;
          const partida = nivel3Partidas[partidaIndex];
          const monto = Math.round((5000 + Math.random() * 15000) * 100) / 100; // 5,000 - 20,000
          
          await ctx.db.insert("pagos", {
            transaccion_id: transactionId,
            partida_id: partida._id,
            monto: monto,
          });
          
          transactionTotal += monto;
          totalPaymentsCreated++;
          console.log(`  💰 Payment ${monto} to nivel 3: ${partida.sub_partida}`);
        }
      }
      
      // Add payments to nivel 2 partidas (familias without sub-partidas)
      if (nivel2Partidas.length > 0 && nivel3Partidas.length === 0) {
        const numPayments = Math.min(2, nivel2Partidas.length);
        for (let j = 0; j < numPayments; j++) {
          const partidaIndex = (txIndex * 2 + j) % nivel2Partidas.length;
          const partida = nivel2Partidas[partidaIndex];
          const monto = Math.round((10000 + Math.random() * 30000) * 100) / 100; // 10,000 - 40,000
          
          await ctx.db.insert("pagos", {
            transaccion_id: transactionId,
            partida_id: partida._id,
            monto: monto,
          });
          
          transactionTotal += monto;
          totalPaymentsCreated++;
          console.log(`  💰 Payment ${monto} to nivel 2: ${partida.familia}`);
        }
      }
      
      // Update transaction total
      await ctx.db.patch(transactionId, { monto_total: transactionTotal });
      console.log(`  📊 Transaction total: ${transactionTotal}`);
    }
    
    console.log(`\n🎉 Seed completed!`);
    console.log(`   - Created ${createdTransactions.length} transactions`);
    console.log(`   - Created ${totalPaymentsCreated} payments`);
    console.log(`   - Date range: ${lastWeekDates[0]} to ${lastWeekDates[lastWeekDates.length - 1]}`);
    
    return {
      success: true,
      transactionsCreated: createdTransactions.length,
      paymentsCreated: totalPaymentsCreated,
      dateRange: {
        start: lastWeekDates[0],
        end: lastWeekDates[lastWeekDates.length - 1],
      },
    };
  },
});

// Helper mutation to clean up seed data
export const cleanupSeedData = mutation({
  args: {
    proyecto_id: v.id("desarrollos"),
  },
  handler: async (ctx, args) => {
    console.log("🧹 Cleaning up seed data...");
    
    // Find all transactions with seed reference codes
    const transactions = await ctx.db
      .query("transacciones")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto_id))
      .collect();
    
    const seedTransactions = transactions.filter(t => 
      t.codigo_referencia?.startsWith("REF-SEED-")
    );
    
    let deletedPagos = 0;
    let deletedTransactions = 0;
    
    for (const transaction of seedTransactions) {
      // Delete all pagos for this transaction
      const pagos = await ctx.db
        .query("pagos")
        .withIndex("by_transaccion", (q) => q.eq("transaccion_id", transaction._id))
        .collect();
      
      for (const pago of pagos) {
        await ctx.db.delete(pago._id);
        deletedPagos++;
      }
      
      // Delete the transaction
      await ctx.db.delete(transaction._id);
      deletedTransactions++;
    }
    
    console.log(`✅ Cleanup completed!`);
    console.log(`   - Deleted ${deletedTransactions} transactions`);
    console.log(`   - Deleted ${deletedPagos} payments`);
    
    return {
      success: true,
      deletedTransactions,
      deletedPagos,
    };
  },
});
