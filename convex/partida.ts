import { paginationOptsValidator } from "convex/server";
import { Doc, Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { mutation } from "./functions";
import { v } from "convex/values";
import { assertCanWrite } from "./permissions";

type PartidaTotals = {
  presupuesto_original: number;
  presupuesto_aprobado: number;
  pagado: number;
  por_gastar: number;
};

type SyncPartidaResult = {
  partida: string;
  nivel1Updated: number;
  familiasUpdated: number;
  familiasSynced: number;
  subPartidasCount: number;
};

function totalsFromPartidas(partidas: Doc<"partidas">[]): PartidaTotals {
  const presupuesto_original = partidas.reduce((sum, item) => sum + (item.presupuesto_original || 0), 0);
  const presupuesto_aprobado = partidas.reduce((sum, item) => sum + (item.presupuesto_aprobado || 0), 0);
  const pagado = partidas.reduce((sum, item) => sum + (item.pagado || 0), 0);
  return {
    presupuesto_original,
    presupuesto_aprobado,
    pagado,
    por_gastar: presupuesto_aprobado - pagado,
  };
}

function totalsChanged(item: Doc<"partidas">, totals: PartidaTotals) {
  return (
    item.presupuesto_original !== totals.presupuesto_original ||
    item.presupuesto_aprobado !== totals.presupuesto_aprobado ||
    item.pagado !== totals.pagado ||
    item.por_gastar !== totals.por_gastar
  );
}

async function patchTotalsIfChanged(ctx: any, item: Doc<"partidas">, totals: PartidaTotals) {
  if (!totalsChanged(item, totals)) return false;
  await ctx.db.patch(item._id, totals);
  return true;
}

async function updateProjectMetrics(ctx: any, proyecto: Id<"desarrollos">) {
  const nivel1Partidas = await ctx.db
    .query("partidas")
    .withIndex("by_nivel_proyecto", (q: any) => q.eq("nivel", 1).eq("proyecto", proyecto))
    .collect();
  const totals = totalsFromPartidas(nivel1Partidas);

  const existingMetrics = await ctx.db
    .query("meticas_presupuesto")
    .withIndex("by_proyecto", (q: any) => q.eq("proyecto", proyecto))
    .first();

  if (existingMetrics) {
    await ctx.db.patch(existingMetrics._id, {
      presupuesto_original: totals.presupuesto_original,
      presupuesto_aprobado: totals.presupuesto_aprobado,
      gasto_total: totals.pagado,
      por_gastar: totals.por_gastar,
    });
  } else {
    await ctx.db.insert("meticas_presupuesto", {
      proyecto,
      presupuesto_original: totals.presupuesto_original,
      presupuesto_aprobado: totals.presupuesto_aprobado,
      gasto_total: totals.pagado,
      por_gastar: totals.por_gastar,
    });
  }
}

async function recalculateFamiliaRollup(
  ctx: any,
  args: {
    proyecto: Id<"desarrollos">;
    partidaNombre: string;
    familia: string;
  }
) {
  const nivel2Items = await ctx.db
    .query("partidas")
    .withIndex("by_proyecto_nivel_partida_familia", (q: any) =>
      q.eq("proyecto", args.proyecto).eq("nivel", 2).eq("partida_nombre", args.partidaNombre).eq("familia", args.familia)
    )
    .collect();

  if (nivel2Items.length === 0) return;

  const nivel3Items = await ctx.db
    .query("partidas")
    .withIndex("by_proyecto_nivel_partida_familia", (q: any) =>
      q.eq("proyecto", args.proyecto).eq("nivel", 3).eq("partida_nombre", args.partidaNombre).eq("familia", args.familia)
    )
    .collect();

  if (nivel3Items.length === 0) return;

  const totals = totalsFromPartidas(nivel3Items);
  for (const item of nivel2Items) {
    await patchTotalsIfChanged(ctx, item, totals);
  }
}

async function recalculatePartidaRollup(
  ctx: any,
  args: {
    proyecto: Id<"desarrollos">;
    partidaNombre: string;
  }
) {
  const nivel1Items: Doc<"partidas">[] = await ctx.db
    .query("partidas")
    .withIndex("by_proyecto_nivel_nombre", (q: any) =>
      q.eq("proyecto", args.proyecto).eq("nivel", 1).eq("nombre", args.partidaNombre)
    )
    .collect() as Doc<"partidas">[];

  if (nivel1Items.length === 0) return;

  const nivel2Items: Doc<"partidas">[] = await ctx.db
    .query("partidas")
    .withIndex("by_proyecto_nivel_partida", (q: any) =>
      q.eq("proyecto", args.proyecto).eq("nivel", 2).eq("partida_nombre", args.partidaNombre)
    )
    .collect() as Doc<"partidas">[];

  if (nivel2Items.length === 0) return;

  const totals = totalsFromPartidas(nivel2Items);
  for (const item of nivel1Items) {
    await patchTotalsIfChanged(ctx, item, totals);
  }
}

async function syncNivel1PartidaAmounts(
  ctx: any,
  args: {
    proyecto: Id<"desarrollos">;
    partidaNombre: string;
  }
): Promise<SyncPartidaResult> {
  const nivel1Items: Doc<"partidas">[] = await ctx.db
    .query("partidas")
    .withIndex("by_proyecto_nivel_nombre", (q: any) =>
      q.eq("proyecto", args.proyecto).eq("nivel", 1).eq("nombre", args.partidaNombre)
    )
    .collect();

  const nivel2Items: Doc<"partidas">[] = await ctx.db
    .query("partidas")
    .withIndex("by_proyecto_nivel_partida", (q: any) =>
      q.eq("proyecto", args.proyecto).eq("nivel", 2).eq("partida_nombre", args.partidaNombre)
    )
    .collect();

  const nivel3Items: Doc<"partidas">[] = await ctx.db
    .query("partidas")
    .withIndex("by_proyecto_nivel_partida", (q: any) =>
      q.eq("proyecto", args.proyecto).eq("nivel", 3).eq("partida_nombre", args.partidaNombre)
    )
    .collect();

  let familiasUpdated = 0;
  const familias = Array.from(new Set(nivel2Items.map((item) => item.familia).filter(Boolean)));

  for (const familia of familias) {
    const familiaNivel2Items = nivel2Items.filter((item) => item.familia === familia);
    const familiaNivel3Items = nivel3Items.filter((item) => item.familia === familia);

    if (familiaNivel3Items.length === 0) {
      const directTotals = totalsFromPartidas(familiaNivel2Items);
      for (const item of familiaNivel2Items) {
        const changed = await patchTotalsIfChanged(ctx, item, {
          presupuesto_original: item.presupuesto_original || 0,
          presupuesto_aprobado: item.presupuesto_aprobado || 0,
          pagado: item.pagado || 0,
          por_gastar: (item.presupuesto_aprobado || 0) - (item.pagado || 0),
        });
        if (changed) familiasUpdated += 1;
      }

      if (familiaNivel2Items.length > 1) {
        for (const item of familiaNivel2Items) {
          const changed = await patchTotalsIfChanged(ctx, item, directTotals);
          if (changed) familiasUpdated += 1;
        }
      }
      continue;
    }

    const totals = totalsFromPartidas(familiaNivel3Items);
    for (const item of familiaNivel2Items) {
      const changed = await patchTotalsIfChanged(ctx, item, totals);
      if (changed) familiasUpdated += 1;
    }
  }

  const updatedNivel2Items: Doc<"partidas">[] = await ctx.db
    .query("partidas")
    .withIndex("by_proyecto_nivel_partida", (q: any) =>
      q.eq("proyecto", args.proyecto).eq("nivel", 2).eq("partida_nombre", args.partidaNombre)
    )
    .collect();

  let nivel1Updated = 0;
  const nivel1Totals = updatedNivel2Items.length > 0
    ? totalsFromPartidas(updatedNivel2Items)
    : totalsFromPartidas(nivel1Items);

  for (const item of nivel1Items) {
    const changed = await patchTotalsIfChanged(ctx, item, nivel1Totals);
    if (changed) nivel1Updated += 1;
  }

  return {
    partida: args.partidaNombre,
    nivel1Updated,
    familiasUpdated,
    familiasSynced: familias.length,
    subPartidasCount: nivel3Items.length,
  };
}

async function recalculateBudgetAfterPartidaChange(
  ctx: any,
  partida: Doc<"partidas">
) {
  if (!partida.proyecto) return;

  const partidaNombre = partida.nivel === 1 ? partida.nombre : (partida.partida_nombre || partida.nombre);

  if (partida.nivel === 3 && partida.familia) {
    await recalculateFamiliaRollup(ctx, {
      proyecto: partida.proyecto,
      partidaNombre,
      familia: partida.familia,
    });
  }

  if (partida.nivel === 2 || partida.nivel === 3) {
    await recalculatePartidaRollup(ctx, {
      proyecto: partida.proyecto,
      partidaNombre,
    });
  }

  await updateProjectMetrics(ctx, partida.proyecto);
}


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

export const getByProjects = query({
  args: {
    projectIds: v.array(v.id("desarrollos")),
  },
  handler: async (ctx, args) => {
    const result: Record<string, Doc<"partidas">[]> = {};

    for (const projectId of Array.from(new Set(args.projectIds))) {
      result[projectId] = await ctx.db
        .query("partidas")
        .withIndex("by_proyecto", (q) => q.eq("proyecto", projectId))
        .collect();
    }

    return result;
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
    await assertCanWrite(ctx);

    // Validate hierarchy: nivel 2/3 require partida_nombre referencing an existing nivel 1
    if (args.nivel === 2 || args.nivel === 3) {
      if (!args.partida_nombre || args.partida_nombre.trim() === "") {
        throw new Error("partida_nombre es requerido para niveles 2 y 3");
      }
      if (args.proyecto) {
        const parent = await ctx.db
          .query("partidas")
          .withIndex("by_proyecto_nivel_nombre", (q) =>
            q.eq("proyecto", args.proyecto).eq("nivel", 1).eq("nombre", args.partida_nombre!)
          )
          .first();
        if (!parent) {
          throw new Error(`No existe la partida padre "${args.partida_nombre}" en este proyecto`);
        }
      }
    }

    // Calculate por_gastar to keep table in sync without requiring manual sync
    const porGastar = (args.presupuesto_aprobado || 0) - (args.pagado || 0);

    const partidaId = await ctx.db.insert("partidas", {
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
      por_gastar: porGastar,
      archivo_origen: args.archivo_origen,
      proyecto: args.proyecto,
    });

    if (args.proyecto) {
      const createdPartida = await ctx.db.get(partidaId);
      if (createdPartida) {
        await recalculateBudgetAfterPartidaChange(ctx, createdPartida);
      }
    }

    return partidaId;
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
    await assertCanWrite(ctx);

    const { id, ...rest } = args;
    const existingPartida = await ctx.db.get(id);

    if (!existingPartida) {
      throw new Error("Not found");
    }

    const porGastar = (args.presupuesto_aprobado || 0) - (args.pagado || 0);
    await ctx.db.patch(args.id, {
      ...rest,
      por_gastar: porGastar,
    });
    const updatedPartida = await ctx.db.get(args.id);
    if (updatedPartida) {
      await recalculateBudgetAfterPartidaChange(ctx, updatedPartida);
    }
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

export const syncMontosPorPartidaNivel1 = mutation({
  args: {
    projectId: v.id("desarrollos"),
    partidaId: v.optional(v.id("partidas")),
    partidaNombre: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let targetPartidaNames: string[] = [];

    if (args.partidaId) {
      const partida = await ctx.db.get(args.partidaId);
      if (!partida || partida.proyecto !== args.projectId || partida.nivel !== 1) {
        throw new Error("La partida nivel 1 no existe o no pertenece al proyecto");
      }
      targetPartidaNames = [partida.nombre];
    } else if (args.partidaNombre?.trim()) {
      targetPartidaNames = [args.partidaNombre.trim()];
    } else {
      const nivel1Partidas = await ctx.db
        .query("partidas")
        .withIndex("by_nivel_proyecto", (q) =>
          q.eq("nivel", 1).eq("proyecto", args.projectId)
        )
        .collect();
      targetPartidaNames = Array.from(new Set(nivel1Partidas.map((partida) => partida.nombre)));
    }

    const results: SyncPartidaResult[] = [];
    for (const partidaNombre of targetPartidaNames) {
      const result = await syncNivel1PartidaAmounts(ctx, {
        proyecto: args.projectId,
        partidaNombre,
      });
      results.push(result);
    }

    await updateProjectMetrics(ctx, args.projectId);

    return {
      projectId: args.projectId,
      syncedPartidas: results.length,
      nivel1Updated: results.reduce((sum, item) => sum + item.nivel1Updated, 0),
      familiasUpdated: results.reduce((sum, item) => sum + item.familiasUpdated, 0),
      results,
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
    await assertCanWrite(ctx);

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
    await assertCanWrite(ctx);

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

/**
 * Comprehensive sync mutation for a project that:
 * 1. Recalculates budget rollups for all partida levels (1, 2, 3)
 * 2. Recalculates `pagado` for all partida levels (1, 2, 3)
 * 3. Updates `por_gastar` = presupuesto_aprobado - pagado
 * 4. Updates `honorarios_monto` on the proyecto based on honorarios_porcentaje
 * 5. Updates the HONORARIOS partida with the calculated amount
 * 
 * @param projectId - Required: Project ID to sync
 */
export const syncProjectData = mutation({
  args: {
    projectId: v.id("desarrollos"),
  },
  handler: async (ctx, args) => {
    await assertCanWrite(ctx);

    console.log(`🔄 Starting comprehensive sync for project: ${args.projectId}`);

    try {
      // Get the proyecto
      const proyecto = await ctx.db.get(args.projectId);
      if (!proyecto) {
        throw new Error("Proyecto not found");
      }

      // Get all partidas for this project
      let allPartidas = await ctx.db
        .query("partidas")
        .withIndex("by_proyecto", (q) => q.eq("proyecto", args.projectId))
        .collect();
      console.log(`Found ${allPartidas.length} partidas`);

      // ============================================
      // STEP 1: Sync budget rollups for all partida levels
      // ============================================
      console.log("Step 1: Syncing budget rollups for all partidas...");

      const topLevelPartidas = Array.from(
        new Set(
          allPartidas
            .filter((partida) => partida.nivel === 1 && partida.nombre)
            .map((partida) => partida.nombre)
        )
      );

      let budgetRollupsUpdated = 0;
      for (const partidaNombre of topLevelPartidas) {
        const result = await syncNivel1PartidaAmounts(ctx, {
          proyecto: args.projectId,
          partidaNombre,
        });
        budgetRollupsUpdated += result.nivel1Updated + result.familiasUpdated;
      }

      if (budgetRollupsUpdated > 0) {
        allPartidas = await ctx.db
          .query("partidas")
          .withIndex("by_proyecto", (q) => q.eq("proyecto", args.projectId))
          .collect();
      }
      console.log(`✅ Updated budget rollups for ${budgetRollupsUpdated} partidas`);

      // ============================================
      // STEP 2: Sync pagado for all partida levels
      // ============================================
      console.log("Step 2: Syncing pagado for all partidas...");

      // Get all pagos - filter by project's transactions to avoid cross-project issues
      const projectTransactions = await ctx.db
        .query("transacciones")
        .withIndex("by_proyecto", (q) => q.eq("proyecto", args.projectId))
        .collect();
      const projectTransactionIds = new Set(projectTransactions.map(t => t._id));
      
      const allPagos = await ctx.db.query("pagos").collect();
      // Filter pagos to only those belonging to this project's transactions
      const projectPagos = allPagos.filter(p => projectTransactionIds.has(p.transaccion_id));
      console.log(`Found ${projectPagos.length} pagos for this project (${allPagos.length} total)`);

      // Build a map of partida_id -> sum of pagos (only from "Pagado" transactions)
      const pagosByPartidaId = new Map<Id<"partidas">, number>();
      const transactionStatusMap = new Map(projectTransactions.map(t => [t._id, t.status]));
      
      for (const pago of projectPagos) {
        // Only count pagos from transactions with status "Pagado"
        const txStatus = transactionStatusMap.get(pago.transaccion_id);
        if (txStatus !== "Pagado") {
          console.log(`Skipping pago (status=${txStatus}): ${pago.monto}`);
          continue;
        }
        if (!pago.partida_id) continue;
        
        const current = pagosByPartidaId.get(pago.partida_id) || 0;
        pagosByPartidaId.set(pago.partida_id, current + (pago.monto || 0));
        
        // Debug: Log each pago
        const partida = allPartidas.find(p => p._id === pago.partida_id);
        if (partida) {
          console.log(`Pago: ${pago.monto} -> ${partida.sub_partida || partida.familia || partida.nombre} (nivel ${partida.nivel})`);
        }
      }

      // Build aggregation maps for nivel 1 and 2
      // IMPORTANT: Only aggregate from nivel 3 (leaf nodes) to avoid double-counting
      // For nivel 2: key = "nombre|familia" -> sum of pagos from nivel 3 children
      // For nivel 1: key = "nombre" -> sum of pagos from nivel 3 children
      const pagadoByFamilia = new Map<string, number>();
      const pagadoByPartida = new Map<string, number>();

      // Debug: Log partida structure
      console.log("=== PARTIDA STRUCTURE DEBUG ===");
      const sampleNivel2 = allPartidas.find(p => p.nivel === 2 && p.familia === "EXCAVACIÓN");
      const sampleNivel3 = allPartidas.find(p => p.nivel === 3 && p.familia === "EXCAVACIÓN");
      if (sampleNivel2) {
        console.log(`Nivel 2 EXCAVACIÓN: nombre=${sampleNivel2.nombre}, partida_nombre=${sampleNivel2.partida_nombre}, familia=${sampleNivel2.familia}`);
      }
      if (sampleNivel3) {
        console.log(`Nivel 3 sample: nombre=${sampleNivel3.nombre}, partida_nombre=${sampleNivel3.partida_nombre}, familia=${sampleNivel3.familia}, sub_partida=${sampleNivel3.sub_partida}`);
      }

      // Only iterate over nivel 3 partidas (leaf nodes where payments are actually made)
      const nivel3Partidas = allPartidas.filter(p => p.nivel === 3);
      console.log(`Found ${nivel3Partidas.length} nivel 3 partidas`);
      
      for (const partida of nivel3Partidas) {
        const directPagado = pagosByPartidaId.get(partida._id) || 0;

        // Aggregate for familia level (nivel 2) using partida_nombre (parent partida name)
        const familiaKey = `${partida.partida_nombre || partida.nombre}|${partida.familia}`;
        pagadoByFamilia.set(familiaKey, (pagadoByFamilia.get(familiaKey) || 0) + directPagado);
        
        if (directPagado > 0) {
          console.log(`Nivel 3 aggregation: ${partida.sub_partida} -> key=${familiaKey}, amount=${directPagado}`);
        }

        // Aggregate for partida level (nivel 1) using partida_nombre (parent partida name)
        const partidaName = partida.partida_nombre || partida.nombre;
        pagadoByPartida.set(partidaName, (pagadoByPartida.get(partidaName) || 0) + directPagado);
      }
      
      // Also handle nivel 2 partidas that have direct payments (familias without sub-partidas)
      const nivel2Partidas = allPartidas.filter(p => p.nivel === 2);
      for (const partida of nivel2Partidas) {
        const directPagado = pagosByPartidaId.get(partida._id) || 0;
        if (directPagado > 0) {
          // Add to familia aggregation
          const familiaKey = `${partida.nombre}|${partida.familia}`;
          pagadoByFamilia.set(familiaKey, (pagadoByFamilia.get(familiaKey) || 0) + directPagado);
          
          // Add to partida aggregation
          pagadoByPartida.set(partida.nombre, (pagadoByPartida.get(partida.nombre) || 0) + directPagado);
        }
      }

      // Debug: Log the aggregation maps
      console.log("pagadoByFamilia entries:");
      pagadoByFamilia.forEach((value, key) => {
        console.log(`  ${key}: ${value}`);
      });
      console.log("pagadoByPartida entries:");
      pagadoByPartida.forEach((value, key) => {
        console.log(`  ${key}: ${value}`);
      });

      let updatedPagadoCount = 0;

      // Update each partida with correct pagado and por_gastar
      for (const partida of allPartidas) {
        let correctPagado: number;

        if (partida.nivel === 1) {
          correctPagado = pagadoByPartida.get(partida.nombre) || 0;
        } else if (partida.nivel === 2) {
          // Use partida_nombre if available (reference to parent), otherwise use nombre
          const partidaName = partida.partida_nombre || partida.nombre;
          const lookupKey = `${partidaName}|${partida.familia}`;
          correctPagado = pagadoByFamilia.get(lookupKey) || 0;
          console.log(`Nivel 2 lookup: ${partida.familia} -> key=${lookupKey}, pagado=${correctPagado}`);
        } else {
          correctPagado = pagosByPartidaId.get(partida._id) || 0;
        }

        const presupuestoAprobado = partida.presupuesto_aprobado || 0;
        const correctPorGastar = presupuestoAprobado - correctPagado;

        const pagadoChanged = Math.abs((partida.pagado || 0) - correctPagado) > 0.001;
        const porGastarChanged = Math.abs((partida.por_gastar || 0) - correctPorGastar) > 0.001;

        if (pagadoChanged || porGastarChanged) {
          await ctx.db.patch(partida._id, {
            pagado: correctPagado,
            por_gastar: correctPorGastar
          });
          updatedPagadoCount++;
        }
      }
      console.log(`✅ Updated pagado/por_gastar for ${updatedPagadoCount} partidas`);

      // ============================================
      if (updatedPagadoCount > 0) {
        allPartidas = await ctx.db
          .query("partidas")
          .withIndex("by_proyecto", (q) => q.eq("proyecto", args.projectId))
          .collect();
      }

      // ============================================
      // STEP 3: Calculate and update honorarios
      // ============================================
      console.log("Step 3: Calculating honorarios...");

      const honorariosPorcentaje = proyecto.honorarios_porcentaje || 0;
      const excludedPartidasIds = proyecto.excluded_partidas_honorarios || [];

      // Get all transactions for this project
      const allTransactions = await ctx.db
        .query("transacciones")
        .withIndex("by_proyecto", (q) => q.eq("proyecto", args.projectId))
        .collect();

      // Calculate total amount from all transactions
      const totalAmount = allTransactions.reduce(
        (sum, t) => sum + (t.monto_total || 0),
        0
      );

      // Calculate excluded amount if there are excluded partidas
      let excludedAmount = 0;
      if (excludedPartidasIds.length > 0) {
        // Get the excluded nivel 1 partidas to find their names
        const excludedNivel1Partidas: Doc<"partidas">[] = [];
        for (const excludedId of excludedPartidasIds) {
          const partida = await ctx.db.get(excludedId);
          if (partida) excludedNivel1Partidas.push(partida);
        }

        const excludedPartidasNames = excludedNivel1Partidas.map(p => p.nombre);

        // Filter to get all partidas that should be excluded (nivel 1, 2, and 3)
        const allExcludedPartidas = allPartidas.filter(p =>
          excludedPartidasIds.includes(p._id) ||
          (p.partida_nombre && excludedPartidasNames.includes(p.partida_nombre))
        );

        const allExcludedPartidasIds = allExcludedPartidas.map(p => p._id);
        const transactionIds = allTransactions.map(t => t._id);

        // Get pagos that belong to excluded partidas
        const excludedPagos = allPagos.filter(pago =>
          transactionIds.includes(pago.transaccion_id) &&
          Boolean(pago.partida_id && allExcludedPartidasIds.includes(pago.partida_id))
        );

        excludedAmount = excludedPagos.reduce(
          (sum, pago) => sum + (pago.monto || 0),
          0
        );

        console.log(`Excluding ${allExcludedPartidas.length} partidas, amount: ${excludedAmount}`);
      }

      // Calculate honorarios
      const baseAmount = totalAmount - excludedAmount;
      const honorariosMonto = Math.round(baseAmount * (honorariosPorcentaje / 100) * 100) / 100;

      console.log("Honorarios calculation:", {
        totalAmount,
        excludedAmount,
        baseAmount,
        honorariosPorcentaje,
        honorariosMonto
      });

      // Update proyecto's honorarios_monto
      await ctx.db.patch(args.projectId, {
        honorarios_monto: honorariosMonto
      });
      console.log(`✅ Updated proyecto honorarios_monto to ${honorariosMonto}`);

      // ============================================
      // STEP 4: Update HONORARIOS partida
      // ============================================
      console.log("Step 4: Updating HONORARIOS partida...");

      // Find HONORARIOS partida with case-insensitive match (honorarios, Honorarios, HONORARIOS)
      // Use allPartidas which was already fetched earlier
      const honorariosPartida = allPartidas.find(p => 
        p.nivel === 1 && p.nombre.toLowerCase() === "honorarios"
      );

      if (honorariosPartida) {
        const presupuestoAprobado = honorariosPartida.presupuesto_aprobado || 0;
        const porGastar = presupuestoAprobado - honorariosMonto;

        await ctx.db.patch(honorariosPartida._id, {
          pagado: honorariosMonto,
          por_gastar: porGastar
        });
        console.log(`✅ Updated HONORARIOS partida (found as "${honorariosPartida.nombre}"): pagado=${honorariosMonto}, por_gastar=${porGastar}`);
      } else {
        console.log("⚠️ HONORARIOS partida not found (checked: honorarios, Honorarios, HONORARIOS)");
      }

      // ============================================
      allPartidas = await ctx.db
        .query("partidas")
        .withIndex("by_proyecto", (q) => q.eq("proyecto", args.projectId))
        .collect();

      // ============================================
      // STEP 5: Update meticas_presupuesto
      // ============================================
      console.log("Step 5: Updating meticas_presupuesto...");

      // Calculate totals from nivel 1 partidas only
      const nivel1Partidas = allPartidas.filter(p => p.nivel === 1);
      const presupuesto_original = nivel1Partidas.reduce((sum, p) => sum + (p.presupuesto_original || 0), 0);
      const presupuesto_aprobado = nivel1Partidas.reduce((sum, p) => sum + (p.presupuesto_aprobado || 0), 0);
      const gasto_total = nivel1Partidas.reduce((sum, p) => sum + (p.pagado || 0), 0);
      const por_gastar = presupuesto_aprobado - gasto_total;

      const existingMetrics = await ctx.db
        .query("meticas_presupuesto")
        .withIndex("by_proyecto", (q) => q.eq("proyecto", args.projectId))
        .first();

      if (existingMetrics) {
        await ctx.db.patch(existingMetrics._id, {
          presupuesto_original,
          presupuesto_aprobado,
          gasto_total,
          por_gastar
        });
      } else {
        await ctx.db.insert("meticas_presupuesto", {
          proyecto: args.projectId,
          presupuesto_original,
          presupuesto_aprobado,
          gasto_total,
          por_gastar
        });
      }
      console.log(`✅ Updated meticas_presupuesto`);

      const summary = {
        projectId: args.projectId,
        budgetRollupsUpdated,
        partidasUpdated: updatedPagadoCount,
        totalPartidas: allPartidas.length,
        honorariosPorcentaje,
        honorariosMonto,
        metrics: {
          presupuesto_original,
          presupuesto_aprobado,
          gasto_total,
          por_gastar
        }
      };

      console.log("✅ Comprehensive sync completed:", summary);
      return summary;
    } catch (error) {
      console.error("❌ Error in syncProjectData:", error);
      throw error;
    }
  },
});

/**
 * Mutation to recalculate and update `por_gastar` for partidas matching the given filters.
 * 
 * Formula: por_gastar = presupuesto_aprobado - pagado
 * 
 * @param proyecto - Required: Project ID
 * @param nombre - Required: Partida name (nivel 1)
 * @param familia - Required: Familia name (nivel 2)
 */
export const updatePorGastarByFilters = mutation({
  args: {
    proyecto: v.id("desarrollos"),
    nombre: v.string(),
    familia: v.string(),
  },
  handler: async (ctx, args) => {
    await assertCanWrite(ctx);

    console.log(`🔄 Updating por_gastar for: ${args.nombre} / ${args.familia}`);

    // Find all partidas matching the filters
    const matchingPartidas = await ctx.db
      .query("partidas")
      .withIndex("by_proyecto", (q) => q.eq("proyecto", args.proyecto))
      .filter((q) => 
        q.and(
          q.eq(q.field("nombre"), args.nombre),
          q.eq(q.field("familia"), args.familia)
        )
      )
      .collect();

    if (matchingPartidas.length === 0) {
      console.log("No partidas found matching filters");
      return { updated: 0, message: "No partidas found matching filters" };
    }

    let updatedCount = 0;

    for (const partida of matchingPartidas) {
      const presupuestoAprobado = partida.presupuesto_aprobado || 0;
      const pagado = partida.pagado || 0;
      const correctPorGastar = presupuestoAprobado - pagado;

      // Only update if value is different
      if (Math.abs((partida.por_gastar || 0) - correctPorGastar) > 0.001) {
        await ctx.db.patch(partida._id, { por_gastar: correctPorGastar });
        updatedCount++;
        console.log(`Updated partida ${partida._id}: por_gastar = ${correctPorGastar}`);
      }
    }

    const summary = {
      updated: updatedCount,
      total: matchingPartidas.length,
      filters: { proyecto: args.proyecto, nombre: args.nombre, familia: args.familia }
    };

    console.log("✅ Update completed:", summary);
    return summary;
  },
});
