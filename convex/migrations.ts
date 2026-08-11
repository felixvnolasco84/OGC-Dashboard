import { internalMutation } from "./functions";
import {
  cleanOptional,
  isGenericProviderName,
  normalizeProviderName,
  normalizeRfc,
} from "./providerUtils";

/**
 * One-time migration: Populate moneda_principal field for all existing projects
 * This should be run once after deploying the schema change
 */
export const populateMonedaPrincipal = internalMutation({
  args: {},
  handler: async (ctx) => {
    console.log("🔄 Starting moneda_principal migration...");
    
    // Migrate desarrollos (regular projects)
    const desarrollos = await ctx.db.query("desarrollos").collect();
    let desarrollosUpdated = 0;
    
    for (const proyecto of desarrollos) {
      // Skip if already has moneda_principal
      if (proyecto.moneda_principal) {
        console.log(`⏭️  Skipping proyecto ${proyecto.nombre} - already has currency`);
        continue;
      }
      
      // Get all transactions for this project
      const transactions = await ctx.db
        .query("transacciones")
        .withIndex("by_proyecto", (q) => q.eq("proyecto", proyecto._id))
        .collect();
      
      if (transactions.length === 0) {
        // No transactions, set default to MXN
        await ctx.db.patch(proyecto._id, { moneda_principal: "MXN" });
        console.log(`✅ Set ${proyecto.nombre} to MXN (no transactions)`);
        desarrollosUpdated++;
        continue;
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
      await ctx.db.patch(proyecto._id, { moneda_principal: dominantCurrency });
      console.log(`✅ Set ${proyecto.nombre} to ${dominantCurrency} (${maxCount} transactions)`);
      desarrollosUpdated++;
    }
    
    // Migrate sales_projects
    const salesProjects = await ctx.db.query("sales_projects").collect();
    let salesProjectsUpdated = 0;
    
    for (const salesProyecto of salesProjects) {
      // Skip if already has moneda_principal
      if (salesProyecto.moneda_principal) {
        console.log(`⏭️  Skipping sales project ${salesProyecto.nombre} - already has currency`);
        continue;
      }
      
      // Get all sales transactions for this project
      const transactions = await ctx.db
        .query("sales_transacciones")
        .withIndex("by_sales_proyecto", (q) => q.eq("sales_proyecto", salesProyecto._id))
        .collect();
      
      if (transactions.length === 0) {
        // No transactions, set default to MXN
        await ctx.db.patch(salesProyecto._id, { moneda_principal: "MXN" });
        console.log(`✅ Set sales project ${salesProyecto.nombre} to MXN (no transactions)`);
        salesProjectsUpdated++;
        continue;
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
      await ctx.db.patch(salesProyecto._id, { moneda_principal: dominantCurrency });
      console.log(`✅ Set sales project ${salesProyecto.nombre} to ${dominantCurrency} (${maxCount} transactions)`);
      salesProjectsUpdated++;
    }
    
    const summary = {
      success: true,
      desarrollosTotal: desarrollos.length,
      desarrollosUpdated,
      salesProjectsTotal: salesProjects.length,
      salesProjectsUpdated,
      message: `Migration completed: ${desarrollosUpdated}/${desarrollos.length} desarrollos and ${salesProjectsUpdated}/${salesProjects.length} sales projects updated`,
    };
    
    console.log("🎉 Migration completed successfully!");
    console.log(JSON.stringify(summary, null, 2));
    
    return summary;
  },
});

/**
 * Backfills normalized provider identity fields without merging records.
 * Collisions are returned for explicit administrative review.
 */
export const normalizeExistingProviders = internalMutation({
  args: {},
  handler: async (ctx) => {
    const providers = await ctx.db.query("proveedores").collect();
    const names = new Map<string, string[]>();
    const rfcs = new Map<string, string[]>();

    for (const provider of providers) {
      const normalizedName = normalizeProviderName(provider.razon_social);
      const normalizedRfc = normalizeRfc(provider.rfc);
      const tipo = provider.tipo || (isGenericProviderName(provider.razon_social) ? "generico" : "regular");
      await ctx.db.patch(provider._id, {
        razon_social: provider.razon_social.trim(),
        razon_social_normalizada: normalizedName,
        rfc: cleanOptional(provider.rfc),
        rfc_normalizado: normalizedRfc,
        direccion: cleanOptional(provider.direccion),
        nombre_contacto: cleanOptional(provider.nombre_contacto),
        telefono_contacto: cleanOptional(provider.telefono_contacto),
        cuenta: cleanOptional(provider.cuenta),
        clabe: cleanOptional(provider.clabe),
        banco: cleanOptional(provider.banco),
        tipo,
        updated_at: Date.now(),
      });

      names.set(normalizedName, [...(names.get(normalizedName) || []), provider._id]);
      if (normalizedRfc) {
        rfcs.set(normalizedRfc, [...(rfcs.get(normalizedRfc) || []), provider._id]);
      }
    }

    return {
      updated: providers.length,
      name_collisions: [...names.entries()]
        .filter(([, ids]) => ids.length > 1)
        .map(([value, ids]) => ({ value, ids })),
      rfc_collisions: [...rfcs.entries()]
        .filter(([, ids]) => ids.length > 1)
        .map(([value, ids]) => ({ value, ids })),
    };
  },
});
