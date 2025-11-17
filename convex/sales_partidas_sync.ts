/* eslint-disable @typescript-eslint/no-explicit-any */
import { mutation } from "./functions";
import { v } from "convex/values";

// Helper to calculate pagado for sales_partidas from sales_pagos (only "Pagado" transactions)
async function calculateSalesPagadoForPartidas(ctx: { db: any }, partidaIds: any[]): Promise<Map<string, number>> {
  const pagadoMap = new Map<string, number>();
  
  // Query sales_pagos for all these partidas in parallel
  const pagosArrays = await Promise.all(
    partidaIds.map(id => 
      ctx.db
        .query("sales_pagos")
        .withIndex("by_sales_partida_id", (q: any) => q.eq("sales_partida_id", id))
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
      const transaction = await ctx.db.get(pago.sales_transaccion_id);
      
      // Only count if transaction exists and status is "Pagado"
      if (transaction && transaction.status === "Pagado") {
        total += (pago.monto || 0);
      }
    }
    
    pagadoMap.set(partidaId, total);
  }
  
  return pagadoMap;
}

// Sync sales_partidas pagado and por_gastar fields in cascade (nivel 3 → 2 → 1)
export const syncSalesPartidasFromTransactions = mutation({
    args: {
        salesProjectId: v.id("sales_projects"),
    },
    handler: async (ctx, args) => {
        console.log(`🔄 Starting sync for sales project: ${args.salesProjectId}`);
        
        try {
            let totalUpdated = 0;
            
            // Get all sales_partidas for this project
            const allPartidas = await ctx.db
                .query("sales_partidas")
                .withIndex("by_sales_proyecto", (q) => q.eq("sales_proyecto", args.salesProjectId))
                .collect();
            
            console.log(`Found ${allPartidas.length} total partidas`);
            
            // Group partidas by nivel
            const nivel3Items = allPartidas.filter(p => p.nivel === 3);
            const nivel2Items = allPartidas.filter(p => p.nivel === 2);
            const nivel1Items = allPartidas.filter(p => p.nivel === 1);
            
            console.log(`Nivel 3: ${nivel3Items.length}, Nivel 2: ${nivel2Items.length}, Nivel 1: ${nivel1Items.length}`);
            
            // STEP 1: Update nivel 3 (sub-partidas) - direct calculation from sales_pagos
            console.log(`[1/3] Updating nivel 3 items...`);
            if (nivel3Items.length > 0) {
                const pagadoMap = await calculateSalesPagadoForPartidas(ctx, nivel3Items.map(i => i._id));
                
                for (const item of nivel3Items) {
                    const totalPagado = pagadoMap.get(item._id) || 0;
                    const porGastar = item.presupuesto_aprobado - totalPagado;
                    
                    if (item.pagado !== totalPagado || item.por_gastar !== porGastar) {
                        await ctx.db.patch(item._id, { 
                            pagado: totalPagado,
                            por_gastar: porGastar 
                        });
                        totalUpdated++;
                    }
                }
                console.log(`✅ Updated ${totalUpdated} nivel 3 items`);
            }
            
            // STEP 2: Update nivel 2 (familias) - sum from nivel 3 or direct if no nivel 3
            console.log(`[2/3] Updating nivel 2 items...`);
            
            // Group nivel 2 by partida_nombre and familia for efficient processing
            const nivel2Groups = new Map<string, any[]>();
            for (const item of nivel2Items) {
                const key = `${item.partida_nombre || ''}-${item.familia || ''}`;
                if (!nivel2Groups.has(key)) {
                    nivel2Groups.set(key, []);
                }
                nivel2Groups.get(key)!.push(item);
            }
            
            for (const items of nivel2Groups.values()) {
                const firstItem = items[0];
                const partidaNombre = firstItem.partida_nombre || '';
                const familia = firstItem.familia || '';
                
                // Check if this familia has nivel 3 children
                const nivel3Children = nivel3Items.filter(
                    n3 => n3.partida_nombre === partidaNombre && n3.familia === familia
                );
                
                let totalPagadoNivel2 = 0;
                
                if (nivel3Children.length > 0) {
                    // Sum from nivel 3 children
                    const pagadoMap = await calculateSalesPagadoForPartidas(ctx, nivel3Children.map(i => i._id));
                    totalPagadoNivel2 = Array.from(pagadoMap.values()).reduce((sum, val) => sum + val, 0);
                } else {
                    // Direct payment - calculate from sales_pagos on nivel 2 items
                    const pagadoMap = await calculateSalesPagadoForPartidas(ctx, items.map(i => i._id));
                    totalPagadoNivel2 = Array.from(pagadoMap.values()).reduce((sum, val) => sum + val, 0);
                }
                
                // Update all nivel 2 items in this group
                for (const item of items) {
                    const porGastar = item.presupuesto_aprobado - totalPagadoNivel2;
                    
                    if (item.pagado !== totalPagadoNivel2 || item.por_gastar !== porGastar) {
                        await ctx.db.patch(item._id, { 
                            pagado: totalPagadoNivel2,
                            por_gastar: porGastar 
                        });
                        totalUpdated++;
                    }
                }
            }
            console.log(`✅ Updated nivel 2 items`);
            
            // STEP 3: Update nivel 1 (partidas) - sum from nivel 3 and direct nivel 2 payments
            console.log(`[3/3] Updating nivel 1 items...`);
            
            // Group nivel 1 by nombre
            const nivel1Groups = new Map<string, any[]>();
            for (const item of nivel1Items) {
                const key = item.nombre;
                if (!nivel1Groups.has(key)) {
                    nivel1Groups.set(key, []);
                }
                nivel1Groups.get(key)!.push(item);
            }
            
            for (const [partidaNombre, items] of nivel1Groups) {
                // Get all nivel 2 items in this partida
                const allNivel2InPartida = nivel2Items.filter(
                    n2 => n2.partida_nombre === partidaNombre
                );
                
                // Get all nivel 3 items in this partida
                const allNivel3InPartida = nivel3Items.filter(
                    n3 => n3.partida_nombre === partidaNombre
                );
                
                let totalPagadoNivel1 = 0;
                
                // Sum from all nivel 3 items (sub-partidas)
                if (allNivel3InPartida.length > 0) {
                    const pagadoMap3 = await calculateSalesPagadoForPartidas(ctx, allNivel3InPartida.map(i => i._id));
                    totalPagadoNivel1 = Array.from(pagadoMap3.values()).reduce((sum, val) => sum + val, 0);
                }
                
                // Add direct payments from nivel 2 items that have NO nivel 3 children
                for (const nivel2Item of allNivel2InPartida) {
                    const nivel3ForThisFamilia = allNivel3InPartida.filter(
                        n3 => n3.familia === nivel2Item.familia
                    );
                    
                    if (nivel3ForThisFamilia.length === 0) {
                        // This familia has NO sub-partidas, include its direct payments
                        const pagadoMapNivel2 = await calculateSalesPagadoForPartidas(ctx, [nivel2Item._id]);
                        const directPayment = pagadoMapNivel2.get(nivel2Item._id) || 0;
                        totalPagadoNivel1 += directPayment;
                    }
                }
                
                // Update all nivel 1 items in this group
                for (const item of items) {
                    const porGastar = item.presupuesto_aprobado - totalPagadoNivel1;
                    
                    if (item.pagado !== totalPagadoNivel1 || item.por_gastar !== porGastar) {
                        await ctx.db.patch(item._id, { 
                            pagado: totalPagadoNivel1,
                            por_gastar: porGastar 
                        });
                        totalUpdated++;
                    }
                }
            }
            console.log(`✅ Updated nivel 1 items`);
            
            console.log(`✅ Sync completed successfully. Updated ${totalUpdated} partida(s).`);
            
            return {
                success: true,
                message: `Sincronización completada. ${totalUpdated} partida(s) actualizada(s).`,
                updatedCount: totalUpdated,
                totalPartidas: allPartidas.length,
            };
        } catch (error) {
            console.error("❌ Error syncing sales partidas:", error);
            throw error;
        }
    },
});
