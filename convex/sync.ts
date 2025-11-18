import { mutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Sync transactions with documents based on factura name matching
 * 
 * This function:
 * 1. Finds all transactions for a project
 * 2. Finds all documents for the same project
 * 3. Matches documents to transactions based on factura name
 * 4. Updates documento.transaccion_id to link them
 * 
 * @param proyecto_id - The project to sync
 * @returns Summary of sync results
 */
export const syncTransactionsWithDocuments = mutation({
  args: {
    proyecto_id: v.id("desarrollos"),
  },
  handler: async (ctx, args) => {
    // Get all transactions for this project
    const transacciones = await ctx.db
      .query("transacciones")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto_id))
      .collect();

    // Get all documents for this project
    const documentos = await ctx.db
      .query("documentos")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto_id))
      .collect();

    let matched = 0;
    let unmatched = 0;
    let alreadyLinked = 0;
    let errors = 0;
    const matchDetails: Array<{
      documentoNombre: string;
      transaccionFactura: string;
      action: string;
    }> = [];

    // Create a map of factura -> transaction for quick lookup
    const facturaToTransaction = new Map<string, typeof transacciones[0]>();

    for (const txn of transacciones) {
      if (txn.factura) {
        // Normalize factura name (remove .pdf extension if present for matching)
        const normalizedFactura = txn.factura.toLowerCase().trim();
        facturaToTransaction.set(normalizedFactura, txn);
      }
    }

    // Process each document
    for (const doc of documentos) {
      try {
        // Normalize document name for comparison
        const normalizedDocName = doc.nombre.toLowerCase().trim();

        // Try to find matching transaction
        // First try exact match
        let matchingTransaction = facturaToTransaction.get(normalizedDocName);

        // If no exact match, try without file extension
        if (!matchingTransaction) {
          const nameWithoutExt = normalizedDocName.replace(/\.(pdf|jpg|jpeg|png|doc|docx|xls|xlsx)$/i, '');
          matchingTransaction = facturaToTransaction.get(nameWithoutExt);
        }

        // If still no match, try to find transaction where factura contains the document name (or vice versa)
        if (!matchingTransaction) {
          for (const [factura, txn] of facturaToTransaction.entries()) {
            const facturaWithoutExt = factura.replace(/\.(pdf|jpg|jpeg|png|doc|docx|xls|xlsx)$/i, '');
            const docNameWithoutExt = normalizedDocName.replace(/\.(pdf|jpg|jpeg|png|doc|docx|xls|xlsx)$/i, '');

            // Check if names match after removing extensions
            if (facturaWithoutExt === docNameWithoutExt ||
              facturaWithoutExt.includes(docNameWithoutExt) ||
              docNameWithoutExt.includes(facturaWithoutExt)) {
              matchingTransaction = txn;
              break;
            }
          }
        }

        if (matchingTransaction) {
          // Check if document is already linked to this transaction
          if (doc.transaccion_id === matchingTransaction._id) {
            alreadyLinked++;
            matchDetails.push({
              documentoNombre: doc.nombre,
              transaccionFactura: matchingTransaction.factura || "",
              action: "already_linked",
            });
          } else {
            // Update document to link to transaction
            await ctx.db.patch(doc._id, {
              transaccion_id: matchingTransaction._id,
            });
            matched++;
            matchDetails.push({
              documentoNombre: doc.nombre,
              transaccionFactura: matchingTransaction.factura || "",
              action: "linked",
            });
          }
        } else {
          unmatched++;
          matchDetails.push({
            documentoNombre: doc.nombre,
            transaccionFactura: "",
            action: "no_match",
          });
        }
      } catch (error) {
        errors++;
        console.error(`Error processing document ${doc.nombre}:`, error);
      }
    }

    return {
      success: true,
      summary: {
        totalDocuments: documentos.length,
        totalTransactions: transacciones.length,
        matched,
        unmatched,
        alreadyLinked,
        errors,
      },
      details: matchDetails,
    };
  },
});

/**
 * Sync sales transactions with documents based on factura name matching
 * 
 * This function:
 * 1. Finds all sales transactions for a sales project
 * 2. Finds all documents for the same sales project
 * 3. Matches documents to transactions based on factura name
 * 4. Updates documento.sales_transaccion_id to link them
 * 
 * @param sales_proyecto_id - The sales project to sync
 * @returns Summary of sync results
 */
export const syncSalesTransactionsWithDocuments = mutation({
  args: {
    sales_proyecto_id: v.id("sales_projects"),
  },
  handler: async (ctx, args) => {
    // Get all sales transactions for this project
    const transacciones = await ctx.db
      .query("sales_transacciones")
      .withIndex("by_sales_proyecto", (q) => q.eq("sales_proyecto", args.sales_proyecto_id))
      .collect();

    // Get all documents for this sales project
    const documentos = await ctx.db
      .query("documentos")
      .withIndex("by_sales_proyecto", (q) => q.eq("sales_proyecto", args.sales_proyecto_id))
      .collect();

    let matched = 0;
    let unmatched = 0;
    let alreadyLinked = 0;
    let errors = 0;
    const matchDetails: Array<{
      documentoNombre: string;
      transaccionFactura: string;
      action: string;
    }> = [];

    // Create a map of factura -> transaction for quick lookup
    const facturaToTransaction = new Map<string, typeof transacciones[0]>();

    for (const txn of transacciones) {
      if (txn.factura) {
        // Normalize factura name (remove .pdf extension if present for matching)
        const normalizedFactura = txn.factura.toLowerCase().trim();
        facturaToTransaction.set(normalizedFactura, txn);
      }
    }

    // Process each document
    for (const doc of documentos) {
      try {
        // Normalize document name for comparison
        const normalizedDocName = doc.nombre.toLowerCase().trim();

        // Try to find matching transaction
        // First try exact match
        let matchingTransaction = facturaToTransaction.get(normalizedDocName);

        // If no exact match, try without file extension
        if (!matchingTransaction) {
          const nameWithoutExt = normalizedDocName.replace(/\.(pdf|jpg|jpeg|png|doc|docx|xls|xlsx)$/i, '');
          matchingTransaction = facturaToTransaction.get(nameWithoutExt);
        }

        // If still no match, try to find transaction where factura contains the document name (or vice versa)
        if (!matchingTransaction) {
          for (const [factura, txn] of facturaToTransaction.entries()) {
            const facturaWithoutExt = factura.replace(/\.(pdf|jpg|jpeg|png|doc|docx|xls|xlsx)$/i, '');
            const docNameWithoutExt = normalizedDocName.replace(/\.(pdf|jpg|jpeg|png|doc|docx|xls|xlsx)$/i, '');

            // Check if names match after removing extensions
            if (facturaWithoutExt === docNameWithoutExt ||
              facturaWithoutExt.includes(docNameWithoutExt) ||
              docNameWithoutExt.includes(facturaWithoutExt)) {
              matchingTransaction = txn;
              break;
            }
          }
        }

        if (matchingTransaction) {
          // Check if document is already linked to this transaction
          if (doc.sales_transaccion_id === matchingTransaction._id) {
            alreadyLinked++;
            matchDetails.push({
              documentoNombre: doc.nombre,
              transaccionFactura: matchingTransaction.factura || "",
              action: "already_linked",
            });
          } else {
            // Update document to link to sales transaction
            await ctx.db.patch(doc._id, {
              sales_transaccion_id: matchingTransaction._id,
            });
            matched++;
            matchDetails.push({
              documentoNombre: doc.nombre,
              transaccionFactura: matchingTransaction.factura || "",
              action: "linked",
            });
          }
        } else {
          unmatched++;
          matchDetails.push({
            documentoNombre: doc.nombre,
            transaccionFactura: "",
            action: "no_match",
          });
        }
      } catch (error) {
        errors++;
        console.error(`Error processing document ${doc.nombre}:`, error);
      }
    }

    return {
      success: true,
      summary: {
        totalDocuments: documentos.length,
        totalTransactions: transacciones.length,
        matched,
        unmatched,
        alreadyLinked,
        errors,
      },
      details: matchDetails,
    };
  },
});
