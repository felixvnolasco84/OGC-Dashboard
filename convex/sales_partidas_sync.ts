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

/**
 * Internal helper function to sync sales_partidas fields in cascade (nivel 3 → 2 → 1)
 * 
 * Cascade Logic:
 * - Nivel 3 (Sub-partidas): 
 *   - pagado = from sales_pagos where status = "Pagado"
 *   - por_gastar = presupuesto_aprobado - pagado
 *   - presupuesto_original, presupuesto_aprobado = own values (leaf nodes)
 *   - avance = (pagado / presupuesto_aprobado) * 100
 * 
 * - Nivel 2 (Familias): 
 *   - pagado = sum of nivel 3 children's pagado (or direct if no children)
 *   - por_gastar = sum of nivel 3 children's por_gastar (or calculated if no children)
 *   - presupuesto_original = sum of nivel 3 children's presupuesto_original (or own if no children)
 *   - presupuesto_aprobado = sum of nivel 3 children's presupuesto_aprobado (or own if no children)
 *   - avance = (pagado / presupuesto_aprobado) * 100
 * 
 * - Nivel 1 (Unidades): 
 *   - pagado = sum of nivel 2 children's pagado (or direct if no children)
 *   - por_gastar = sum of nivel 2 children's por_gastar (or calculated if no children)
 *   - presupuesto_original = sum of nivel 2 children's presupuesto_original (or own if no children)
 *   - presupuesto_aprobado = sum of nivel 2 children's presupuesto_aprobado (or own if no children)
 *   - avance = (pagado / presupuesto_aprobado) * 100
 * 
 * This ensures all aggregate values correctly flow from bottom to top.
 */
export async function syncSalesPartidasInternal(ctx: any, salesProjectId: any) {
    console.log(`🔄 Starting sync for sales project: ${salesProjectId}`);
        
        try {
            let totalUpdated = 0;
            
            // Get all sales_partidas for this project
            const allPartidas = await ctx.db
                .query("sales_partidas")
                .withIndex("by_sales_proyecto", (q: any) => q.eq("sales_proyecto", salesProjectId))
                .collect();
            
            console.log(`Found ${allPartidas.length} total partidas`);
            
            // Group partidas by nivel
            const nivel3Items = allPartidas.filter((p: any) => p.nivel === 3);
            const nivel2Items = allPartidas.filter((p: any) => p.nivel === 2);
            const nivel1Items = allPartidas.filter((p: any) => p.nivel === 1);
            
            console.log(`Nivel 3: ${nivel3Items.length}, Nivel 2: ${nivel2Items.length}, Nivel 1: ${nivel1Items.length}`);
            
            // STEP 1: Update nivel 3 (sub-partidas) - direct calculation from sales_pagos
            console.log(`[1/3] Updating nivel 3 items...`);
            if (nivel3Items.length > 0) {
                const pagadoMap = await calculateSalesPagadoForPartidas(ctx, nivel3Items.map((i: any) => i._id));
                
                for (const item of nivel3Items) {
                    const totalPagado = pagadoMap.get(item._id) || 0;
                    const porGastar = item.presupuesto_aprobado - totalPagado;
                    const avance = item.presupuesto_aprobado > 0 
                        ? (totalPagado / item.presupuesto_aprobado) * 100 
                        : 0;
                    
                    if (item.pagado !== totalPagado || item.por_gastar !== porGastar) {
                        await ctx.db.patch(item._id, { 
                            pagado: totalPagado,
                            por_gastar: porGastar,
                            avance: avance
                        });
                        totalUpdated++;
                    }
                }
                console.log(`✅ Updated ${totalUpdated} nivel 3 items`);
            }
            
            // STEP 2: Update nivel 2 (familias) - sum all fields from nivel 3 or direct if no nivel 3
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
                    (n3: any) => n3.partida_nombre === partidaNombre && n3.familia === familia
                );
                
                let totalPagadoNivel2 = 0;
                let totalPorGastarNivel2 = 0;
                let totalPresupuestoOriginalNivel2 = 0;
                let totalPresupuestoAprobadoNivel2 = 0;
                
                if (nivel3Children.length > 0) {
                    // Sum all fields from nivel 3 children
                    // Get updated nivel 3 items from DB (they were just updated in step 1)
                    const updatedNivel3Children = await Promise.all(
                        nivel3Children.map((child: any) => ctx.db.get(child._id))
                    );
                    
                    totalPagadoNivel2 = updatedNivel3Children.reduce((sum, child) => sum + (child?.pagado || 0), 0);
                    totalPorGastarNivel2 = updatedNivel3Children.reduce((sum, child) => sum + (child?.por_gastar || 0), 0);
                    totalPresupuestoOriginalNivel2 = updatedNivel3Children.reduce((sum, child) => sum + (child?.presupuesto_original || 0), 0);
                    totalPresupuestoAprobadoNivel2 = updatedNivel3Children.reduce((sum, child) => sum + (child?.presupuesto_aprobado || 0), 0);
                } else {
                    // Direct payment - calculate from sales_pagos on nivel 2 items
                    const pagadoMap = await calculateSalesPagadoForPartidas(ctx, items.map((i: any) => i._id));
                    totalPagadoNivel2 = Array.from(pagadoMap.values()).reduce((sum, val) => sum + val, 0);
                    // For nivel 2 without children, use own values
                    totalPorGastarNivel2 = items[0].presupuesto_aprobado - totalPagadoNivel2;
                    totalPresupuestoOriginalNivel2 = items[0].presupuesto_original;
                    totalPresupuestoAprobadoNivel2 = items[0].presupuesto_aprobado;
                }
                
                // Calculate avance percentage
                const avanceNivel2 = totalPresupuestoAprobadoNivel2 > 0 
                    ? (totalPagadoNivel2 / totalPresupuestoAprobadoNivel2) * 100 
                    : 0;
                
                // Update all nivel 2 items in this group
                for (const item of items) {
                    const needsUpdate = 
                        item.pagado !== totalPagadoNivel2 || 
                        item.por_gastar !== totalPorGastarNivel2 ||
                        item.presupuesto_original !== totalPresupuestoOriginalNivel2 ||
                        item.presupuesto_aprobado !== totalPresupuestoAprobadoNivel2;
                        
                    if (needsUpdate) {
                        await ctx.db.patch(item._id, { 
                            pagado: totalPagadoNivel2,
                            por_gastar: totalPorGastarNivel2,
                            presupuesto_original: totalPresupuestoOriginalNivel2,
                            presupuesto_aprobado: totalPresupuestoAprobadoNivel2,
                            avance: avanceNivel2
                        });
                        totalUpdated++;
                    }
                }
            }
            console.log(`✅ Updated nivel 2 items`);
            
            // STEP 3: Update nivel 1 (unidades) - sum all fields from nivel 2 children
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
                    (n2: any) => n2.partida_nombre === partidaNombre
                );
                
                let totalPagadoNivel1 = 0;
                let totalPorGastarNivel1 = 0;
                let totalPresupuestoOriginalNivel1 = 0;
                let totalPresupuestoAprobadoNivel1 = 0;
                
                if (allNivel2InPartida.length > 0) {
                    // Sum all fields from nivel 2 children
                    // Get updated nivel 2 items from DB (they were just updated in step 2)
                    const updatedNivel2Children = await Promise.all(
                        allNivel2InPartida.map((child: any) => ctx.db.get(child._id))
                    );
                    
                    totalPagadoNivel1 = updatedNivel2Children.reduce((sum, child) => sum + (child?.pagado || 0), 0);
                    totalPorGastarNivel1 = updatedNivel2Children.reduce((sum, child) => sum + (child?.por_gastar || 0), 0);
                    totalPresupuestoOriginalNivel1 = updatedNivel2Children.reduce((sum, child) => sum + (child?.presupuesto_original || 0), 0);
                    totalPresupuestoAprobadoNivel1 = updatedNivel2Children.reduce((sum, child) => sum + (child?.presupuesto_aprobado || 0), 0);
                } else {
                    // No nivel 2 children - calculate directly from sales_pagos on nivel 1 items
                    const pagadoMap = await calculateSalesPagadoForPartidas(ctx, items.map((i: any) => i._id));
                    totalPagadoNivel1 = Array.from(pagadoMap.values()).reduce((sum, val) => sum + val, 0);
                    // For nivel 1 without children, use own values
                    totalPorGastarNivel1 = items[0].presupuesto_aprobado - totalPagadoNivel1;
                    totalPresupuestoOriginalNivel1 = items[0].presupuesto_original;
                    totalPresupuestoAprobadoNivel1 = items[0].presupuesto_aprobado;
                }
                
                // Calculate avance percentage
                const avanceNivel1 = totalPresupuestoAprobadoNivel1 > 0 
                    ? (totalPagadoNivel1 / totalPresupuestoAprobadoNivel1) * 100 
                    : 0;
                
                // Update all nivel 1 items in this group
                for (const item of items) {
                    const needsUpdate = 
                        item.pagado !== totalPagadoNivel1 || 
                        item.por_gastar !== totalPorGastarNivel1 ||
                        item.presupuesto_original !== totalPresupuestoOriginalNivel1 ||
                        item.presupuesto_aprobado !== totalPresupuestoAprobadoNivel1;
                        
                    if (needsUpdate) {
                        await ctx.db.patch(item._id, { 
                            pagado: totalPagadoNivel1,
                            por_gastar: totalPorGastarNivel1,
                            presupuesto_original: totalPresupuestoOriginalNivel1,
                            presupuesto_aprobado: totalPresupuestoAprobadoNivel1,
                            avance: avanceNivel1
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
}

// Public mutation wrapper for manual syncs
export const syncSalesPartidasFromTransactions = mutation({
    args: {
        salesProjectId: v.id("sales_projects"),
    },
    handler: async (ctx, args) => {
        return await syncSalesPartidasInternal(ctx, args.salesProjectId);
    },
});
