import { paginationOptsValidator } from "convex/server";
import { Doc, Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { mutation } from "./functions";
import { v } from "convex/values";


//TODO: IMPLEMENT PAGINATION IN THE REST OF THE APP WHERE IT MAKES SENSE
export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    proyectoId: v.id("desarrollos"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.query("partidas").withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyectoId)).order("asc").paginate(args.paginationOpts);
  },
});

export const getByNivel = query({
  args: {
    proyecto: v.id("desarrollos"),
    nivel: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("partidas")
      .withIndex("by_proyecto_nivel_nombre", (q) => 
        q.eq("proyecto", args.proyecto).eq("nivel", args.nivel)
      )
      .collect();
  },
});

export const getPartidas = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("partidas").collect();
  },
});


export const getByFamily = query({
  args: {
    family: v.string(),
  },
  handler: async (ctx, args) => {
    const tasks = await ctx.db
      .query("partidas")
      .filter((q) => q.eq(q.field("familia"), args.family))
      .order("desc")
      .take(100)

    return tasks;
  },
});

export const getByProject = query({
  args: {
    projectId: v.id("desarrollos"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("partidas")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.projectId))
      .collect();
  },
});

export const getByProjectPaginated = query({
  args: {
    projectId: v.id("desarrollos"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("partidas")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.projectId))
      .order("asc")
      .paginate(args.paginationOpts);
  },
});

export const getProjectMetrics = query({
  args: {
    projectId: v.optional(v.id("desarrollos")),
  },
  handler: async (ctx, args) => {
    let partidas;
    if (!args.projectId) {
      partidas = await ctx.db.query("partidas").collect();
    } else {
      partidas = await ctx.db
        .query("partidas")
        .withIndex("by_proyecto", (q) => q.eq("proyecto", args.projectId))
        .collect();
    }

    // Calculate metrics
    const presupuestoAprobado = partidas.reduce(
      (sum, p) => sum + (p.presupuesto_aprobado || 0),
      0
    );
    const pagado = partidas.reduce(
      (sum, p) => sum + (p.pagado || 0),
      0
    );
    const porLiquidar = presupuestoAprobado - pagado;

    return {
      presupuestoAprobado,
      gastoTotal: pagado,
      porGastar: porLiquidar,
      totalPartidas: partidas.length,
    };
  },
});

export const getGroupedByPartida = query({
  args: {
    projectId: v.optional(v.id("desarrollos")),
  },
  handler: async (ctx, args) => {
    let partidas;
    if (!args.projectId) {
      partidas = await ctx.db.query("partidas").collect();
    } else {
      partidas = await ctx.db
        .query("partidas")
        .withIndex("by_proyecto", (q) => q.eq("proyecto", args.projectId))
        .collect();
    }

    type PartidaType = typeof partidas[0];
    type GroupedPartida = {
      nombre: string;
      presupuestoAprobado: number;
      pagado: number;
      porLiquidar: number;
      items: PartidaType[];
    };

    // Group by partida name
    const grouped = partidas.reduce((acc, p) => {
      const key = p.nombre;
      if (!acc[key]) {
        acc[key] = {
          nombre: key,
          presupuestoAprobado: 0,
          pagado: 0,
          porLiquidar: 0,
          items: [],
        };
      }
      acc[key].presupuestoAprobado += p.presupuesto_aprobado || 0;
      acc[key].pagado += p.pagado || 0;
      acc[key].porLiquidar = acc[key].presupuestoAprobado - acc[key].pagado;
      acc[key].items.push(p);
      return acc;
    }, {} as Record<string, GroupedPartida>);

    return Object.values(grouped);
  },
});

export const getGroupedByFamilia = query({
  args: {
    projectId: v.optional(v.id("desarrollos")),
  },
  handler: async (ctx, args) => {
    let partidas;
    if (!args.projectId) {
      partidas = await ctx.db.query("partidas").collect();
    } else {
      partidas = await ctx.db
        .query("partidas")
        .withIndex("by_proyecto", (q) => q.eq("proyecto", args.projectId))
        .collect();
    }

    type PartidaType = typeof partidas[0];
    type GroupedFamilia = {
      familia: string;
      presupuestoAprobado: number;
      pagado: number;
      porLiquidar: number;
      items: PartidaType[];
    };

    // Group by familia
    const grouped = partidas.reduce((acc, p) => {
      const key = p.familia;
      if (!acc[key]) {
        acc[key] = {
          familia: key,
          presupuestoAprobado: 0,
          pagado: 0,
          porLiquidar: 0,
          items: [],
        };
      }
      acc[key].presupuestoAprobado += p.presupuesto_aprobado || 0;
      acc[key].pagado += p.pagado || 0;
      acc[key].porLiquidar = acc[key].presupuestoAprobado - acc[key].pagado;
      acc[key].items.push(p);
      return acc;
    }, {} as Record<string, GroupedFamilia>);

    return Object.values(grouped);
  },
});



export const createPartida = mutation({
  args: {
    nivel: v.number(),
    nombre: v.string(),
    familia: v.string(),
    sub_partida: v.string(),
    partida_nombre: v.optional(v.string()),
    unidad: v.string(),
    cantidad: v.number(),
    precio_unitario: v.number(),
    presupuesto_original: v.number(),
    presupuesto_aprobado: v.number(),
    pagado: v.number(),
    archivo_origen: v.string(),
    proyecto: v.optional(v.id("desarrollos")),
  },
  handler: async (ctx, args) => {
    const partida = await ctx.db.insert("partidas", {
      nivel: args.nivel,
      nombre: args.nombre,
      familia: args.familia,
      sub_partida: args.sub_partida,
      partida_nombre: args.partida_nombre,
      unidad: args.unidad,
      cantidad: args.cantidad,
      precio_unitario: args.precio_unitario,
      presupuesto_original: args.presupuesto_original,
      presupuesto_aprobado: args.presupuesto_aprobado,
      pagado: args.pagado,
      archivo_origen: args.archivo_origen,
      proyecto: args.proyecto,
    });
    return partida;
  },
});

export const update = mutation({
  args: {
    id: v.id("partidas"),
    nivel: v.number(),
    nombre: v.string(),
    familia: v.string(),
    sub_partida: v.string(),
    partida_nombre: v.optional(v.string()),
    unidad: v.string(),
    cantidad: v.number(),
    precio_unitario: v.number(),
    presupuesto_original: v.number(),
    presupuesto_aprobado: v.number(),
    pagado: v.number(),
    archivo_origen: v.string(),
    proyecto: v.optional(v.id("desarrollos")),
  },
  handler: async (ctx, args) => {

    const { id, ...rest } = args;
    const existingPartida = await ctx.db.get(id);

    if (!existingPartida) {
      throw new Error("Not found");
    }

    const updatedPartida = await ctx.db.patch(args.id, {
      ...rest,
    });
    return updatedPartida;
  },
});


export const getByAdministracion = query({
  args: {
    proyecto: v.id("desarrollos"),
  },
  handler: async (ctx, args) => {
    const tasks = await ctx.db
      .query("partidas")
      .filter((q) => q.eq(q.field("proyecto"), args.proyecto))
      .order("desc")
      .take(100);
    return tasks;
  },
});


export const getByDiferentFilters = query({
  args: {
    proyecto: v.id("desarrollos"),
    partida: v.optional(v.string()),
    sub_partida: v.optional(v.string()),
    family: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let queryBuilder = ctx.db
      .query("partidas")
      .filter((q) => q.eq(q.field("proyecto"), args.proyecto));

    if (args.partida) {
      queryBuilder = queryBuilder.filter((q) => q.eq(q.field("nombre"), args.partida));
    }

    if (args.family) {
      queryBuilder = queryBuilder.filter((q) => q.eq(q.field("familia"), args.family));
    }

    if (args.sub_partida) {
      queryBuilder = queryBuilder.filter((q) => q.eq(q.field("sub_partida"), args.sub_partida));
    }

    const tasks = await queryBuilder
      .order("desc")
      .take(100);

    // Group data by partida -> familia -> sub_partida
    const groupedData: {
      [partida: string]: {
        [familia: string]: Array<{
          _id: Id<"partidas">;
          description: string;
          specification: string;
        }>
      }
    } = {};

    tasks.forEach(task => {
      if (!groupedData[task.nombre]) {
        groupedData[task.nombre] = {};
      }
      if (!groupedData[task.nombre][task.familia]) {
        groupedData[task.nombre][task.familia] = [];
      }
      groupedData[task.nombre][task.familia].push({
        _id: task._id, // Keep the original string ID
        description: task.sub_partida,
        specification: `${task.cantidad} - ${task.precio_unitario}`
      });
    });

    // Transform to expected output format
    const result = Object.entries(groupedData).map(([partidaName, familias], partidaIndex) => ({
      id: partidaIndex + 1,
      name: partidaName,
      familias: Object.entries(familias).map(([familiaName, subpartidas], familiaIndex) => ({
        id: familiaIndex + 1,
        name: familiaName,
        subpartidas: subpartidas
      }))
    }));

    return result;
  },
});

export const getBySubPartida = query({
  args: {
    sub_partida: v.string(),
  },
  handler: async (ctx, args) => {
    const tasks = await ctx.db
      .query("partidas")
      .filter((q) => q.eq(q.field("sub_partida"), args.sub_partida))
      .order("desc")
      .take(100);
    return tasks;
  },
});


export const getById = query({
  args: {
    id: v.id("partidas"),
  },
  handler: async (ctx, args) => {

    const partida = await ctx.db.get(args.id);

    if (!partida) {
      return null;
    }

    // Get related proyecto information
    let proyectoData: Doc<"desarrollos"> | null = null;
    if (partida.proyecto) {
      proyectoData = await ctx.db.get(partida.proyecto);
    }

    const pagos = await ctx.db
      .query("pagos")
      .withIndex("by_partida_id", (q) => q.eq("partida_id", args.id))
      .collect();

    // Enrich pagos with transaction data
    const pagosWithTransactionData = await Promise.all(
      pagos.map(async (pago) => {
        const transaction = await ctx.db.get(pago.transaccion_id);
        return {
          ...pago,
          // Transaction fields
          fecha: transaction?.fecha,
          tipo_pago: transaction?.tipo_pago,
          moneda: transaction?.moneda,
          tipo_cambio: transaction?.tipo_cambio,
          status: transaction?.status,
          banco: transaction?.banco,
          tarjeta: transaction?.tarjeta,
          numero_cuenta: transaction?.numero_cuenta,
          numero_transferencia: transaction?.numero_transferencia,
          codigo_referencia: transaction?.codigo_referencia,
          factura: transaction?.factura,
          comprobante: transaction?.comprobante,
          categoria: transaction?.categoria,
          // Keep transaction reference
          transaction,
        };
      })
    );

    return {
      ...partida,
      proyectoData: proyectoData,
      pagos: pagosWithTransactionData
    };
  },
});

// Get distinct familias for a given partida name and project
export const getDistinctFamiliasByPartida = query({
  args: {
    partidaNombre: v.string(),
    projectId: v.id("desarrollos"),
  },
  handler: async (ctx, args) => {
    const partidas = await ctx.db
      .query("partidas")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.projectId))
      .filter((q) => q.eq(q.field("nombre"), args.partidaNombre))
      .collect();

    // Get unique familias
    const familias = [...new Set(partidas.map(p => p.familia).filter(f => f && f.trim() !== ""))];
    return familias.sort();
  },
});

// Get distinct sub_partidas for a given partida and familia
export const getDistinctSubPartidasByFamilia = query({
  args: {
    partidaNombre: v.string(),
    familia: v.string(),
    projectId: v.id("desarrollos"),
  },
  handler: async (ctx, args) => {
    const partidas = await ctx.db
      .query("partidas")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.projectId))
      .filter((q) =>
        q.and(
          q.eq(q.field("nombre"), args.partidaNombre),
          q.eq(q.field("familia"), args.familia)
        )
      )
      .collect();

    // Get unique sub_partidas
    const subPartidas = [...new Set(partidas.map(p => p.sub_partida).filter(sp => sp && sp.trim() !== ""))];
    return subPartidas.sort();
  },
});

/**
 * Mutation to sync/backfill the `por_gastar` calculated column for all existing partidas.
 * This should be run once after adding the por_gastar field to the schema.
 * 
 * Formula: por_gastar = presupuesto_aprobado - pagado
 * 
 * Usage: Call this mutation from the Convex dashboard or via API to update all existing records.
 */
export const syncPorGastarForAllPartidas = mutation({
  args: {
    projectId: v.optional(v.id("desarrollos")), // Optional: sync only for specific project
  },
  handler: async (ctx, args) => {
    console.log("🔄 Starting por_gastar sync for all partidas...");

    try {
      // Get all partidas (filtered by project if provided)
      let partidas;
      if (args.projectId) {
        partidas = await ctx.db
          .query("partidas")
          .withIndex("by_proyecto", (q) => q.eq("proyecto", args.projectId))
          .collect();
        console.log(`Found ${partidas.length} partidas for project ${args.projectId}`);
      } else {
        partidas = await ctx.db.query("partidas").collect();
        console.log(`Found ${partidas.length} total partidas`);
      }

      let updatedCount = 0;
      let skippedCount = 0;

      // Update each partida with calculated por_gastar
      for (const partida of partidas) {
        const presupuestoAprobado = partida.presupuesto_aprobado || 0;
        const pagado = partida.pagado || 0;
        const porGastar = presupuestoAprobado - pagado;

        // Only update if por_gastar is different or doesn't exist
        if (partida.por_gastar !== porGastar) {
          await ctx.db.patch(partida._id, { por_gastar: porGastar });
          updatedCount++;

          // Log every 50 updates to track progress
          if (updatedCount % 50 === 0) {
            console.log(`✅ Updated ${updatedCount} partidas...`);
          }
        } else {
          skippedCount++;
        }
      }

      const summary = {
        total: partidas.length,
        updated: updatedCount,
        skipped: skippedCount,
        projectId: args.projectId || "all projects"
      };

      console.log("✅ Sync completed:", summary);
      return summary;
    } catch (error) {
      console.error("❌ Error syncing por_gastar:", error);
      throw error;
    }
  },
});

/**
 * Mutation to sync/backfill the `gastado` (pagado) calculated column for all existing partidas.
 * This should be run once after adding the gastado field or to recalculate existing values.
 * 
 * Formula: gastado = SUM(pagos.monto) for all pagos associated with the partida
 * 
 * Usage: Call this mutation from the Convex dashboard or via API to update all existing records.
 */
export const syncGastadoForAllPartidas = mutation({
  args: {
    projectId: v.optional(v.id("desarrollos")), // Optional: sync only for specific project
  },
  handler: async (ctx, args) => {
    console.log("🔄 Starting gastado sync for all partidas...");

    try {
      // Get all partidas (filtered by project if provided)
      let partidas;
      if (args.projectId) {
        partidas = await ctx.db
          .query("partidas")
          .withIndex("by_proyecto", (q) => q.eq("proyecto", args.projectId))
          .collect();
        console.log(`Found ${partidas.length} partidas for project ${args.projectId}`);
      } else {
        partidas = await ctx.db.query("partidas").collect();
        console.log(`Found ${partidas.length} total partidas`);
      }

      let updatedCount = 0;
      let skippedCount = 0;

      // Update each partida with calculated gastado
      for (const partida of partidas) {
        // Get all pagos for this partida
        const pagos = await ctx.db
          .query("pagos")
          .filter((q) => q.eq(q.field("partida_id"), partida._id))
          .collect();

        // Calculate total gastado by summing all pago amounts
        const gastado = pagos.reduce((sum, pago) => sum + (pago.monto || 0), 0);

        // Only update if gastado is different or doesn't exist
        if (partida.pagado !== gastado) {
          await ctx.db.patch(partida._id, { pagado: gastado });
          updatedCount++;

          // Log every 50 updates to track progress
          if (updatedCount % 50 === 0) {
            console.log(`✅ Updated ${updatedCount} partidas...`);
          }
        } else {
          skippedCount++;
        }
      }

      const summary = {
        total: partidas.length,
        updated: updatedCount,
        skipped: skippedCount,
        projectId: args.projectId || "all projects"
      };

      console.log("✅ Sync completed:", summary);
      return summary;
    } catch (error) {
      console.error("❌ Error syncing gastado:", error);
      throw error;
    }
  },
});
