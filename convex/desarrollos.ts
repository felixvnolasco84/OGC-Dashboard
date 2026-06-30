import { query, mutation as rawMutation, QueryCtx } from "./_generated/server";
import { Doc } from "./_generated/dataModel";
import { mutation } from "./functions";
import { v } from "convex/values";
import {
    checkDesarrolloAccess,
    getCurrentUserOrThrow,
    getScopedOrganizationId,
    getUserDesarrollos,
    hasAdminAccess,
    hasGlobalAdminAccess,
} from "./permissions";

// Get all projects (filtered by user permissions)
export const getAll = query(async (ctx) => {
    // If not authenticated, return all (for backward compatibility during migration)
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
        return await ctx.db.query("desarrollos").collect();
    }

    // Return only desarrollos the user has access to
    return await getUserDesarrollos(ctx);
});

// Get all projects with their metrics
export const getAllWithMetrics = query(async (ctx) => {
    const proyectos = await getUserDesarrollos(ctx);
    
    const proyectosWithMetrics = await Promise.all(
        proyectos.map(async (proyecto) => {
            // Get metrics for this project
            const metrics = await ctx.db
                .query("meticas_presupuesto")
                .withIndex("by_proyecto", (q) => q.eq("proyecto", proyecto._id))
                .first();
            
            const presupuestoAprobado = metrics?.presupuesto_aprobado || 0;
            const gastoTotal = metrics?.gasto_total || 0;
            
            return {
                ...proyecto,
                presupuesto_original: metrics?.presupuesto_original || 0,
                presupuesto_aprobado: presupuestoAprobado,
                pagado: gastoTotal,
                avance: presupuestoAprobado > 0 
                    ? Math.round((gastoTotal / presupuestoAprobado) * 100)
                    : 0,
            };
        })
    );
    
    return proyectosWithMetrics;
});

const normalizeReportLabel = (value?: string) => {
    return (value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
};

const matchesAnyReportLabel = (value: string | undefined, labels: string[]) => {
    const normalized = normalizeReportLabel(value);
    return labels.some((label) => normalized.includes(label));
};

const HONORARIOS_LABELS = ["honorarios"];
const INDIRECTOS_LABELS = ["indirectos", "indirecto"];
const STRUCTURE_COST_GROUPS = [
    { key: "nomina", label: "NÓMINA", labels: ["nomina", "residente", "residentes", "sueldos"] },
    { key: "transporte", label: "TRANSPORTE", labels: ["transporte"] },
    { key: "impuestos", label: "IMPUESTOS", labels: ["impuestos", "imss", "isn", "infonavit", "cargas sociales"] },
    { key: "renta", label: "RENTA", labels: ["renta"] },
];
const OGC_STRUCTURE_COST_GROUPS = [
    ...STRUCTURE_COST_GROUPS.filter(() => false),
    { key: "nomina", label: "NOMINA", labels: ["nomina", "residente", "residentes", "sueldos"] },
    { key: "cargas_sociales", label: "CARGAS SOCIALES ADMN (IMSS, ISN, INFONAVIT)", labels: ["impuestos", "imss", "isn", "infonavit", "cargas sociales"] },
    { key: "transporte", label: "TRANSPORTE", labels: ["transporte"] },
    { key: "renta", label: "RENTA", labels: ["renta"] },
    { key: "otros", label: "OTROS", labels: ["otros", "administracion", "administrativo"] },
    { key: "disp_honorarios", label: "DISP HONORARIOS", labels: ["disp honorarios", "dispersion honorarios"] },
];
type OgcMovement = Doc<"ogc_movimientos">;
type PnlQueryArgs = {
    periodYear?: number;
    cutoffMonth?: number;
    usdToMxn?: number;
    eurToMxn?: number;
};
type PnlPeriod = {
    year: number;
    cutoffMonth: number;
    start: Date;
    end: Date;
    currentMonthKey: string;
};
type ExchangeRates = {
    USD: number;
    EUR: number;
};
type MonthlyOgcMovementSummary = {
    honorarios: number;
    indirectos: number;
    costosDirectosObra: number;
    structureBreakdown: Record<string, number>;
};

const normalizeMovementCategory = (value?: string) => normalizeReportLabel(value).replace(/\s+/g, " ");

const matchesMovementGroup = (movement: Pick<OgcMovement, "categoria" | "descripcion">, labels: string[]) => {
    const categoria = normalizeMovementCategory(movement.categoria);
    const descripcion = normalizeMovementCategory(movement.descripcion);
    return labels.some((label) => {
        const normalizedLabel = normalizeMovementCategory(label);
        return categoria.includes(normalizedLabel) || descripcion.includes(normalizedLabel);
    });
};

const getMovementGroupKey = (movement: Pick<OgcMovement, "categoria" | "descripcion">) => {
    return OGC_STRUCTURE_COST_GROUPS.find((group) => matchesMovementGroup(movement, group.labels))?.key || "otros";
};

const parseReportDate = (date?: string) => {
    if (!date) return null;

    if (date.includes("/")) {
        const [day, month, year] = date.split("/").map(Number);
        const parsed = new Date(year, month - 1, day);
        return Number.isFinite(parsed.getTime()) ? parsed : null;
    }

    if (date.includes("-")) {
        const parsed = new Date(date);
        return Number.isFinite(parsed.getTime()) ? parsed : null;
    }

    const parsed = new Date(date);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
};

const normalizePnlPeriod = (args: PnlQueryArgs = {}): PnlPeriod => {
    const now = new Date();
    const year = Number.isInteger(args.periodYear) ? args.periodYear! : now.getFullYear();
    const requestedMonth = Number.isInteger(args.cutoffMonth) ? args.cutoffMonth! : now.getMonth() + 1;
    const cutoffMonth = Math.min(Math.max(requestedMonth, 1), 12);

    return {
        year,
        cutoffMonth,
        start: new Date(year, 0, 1, 0, 0, 0, 0),
        end: new Date(year, cutoffMonth, 0, 23, 59, 59, 999),
        currentMonthKey: `${year}-${cutoffMonth}`,
    };
};

const normalizeExchangeRates = (args: PnlQueryArgs = {}): ExchangeRates => ({
    USD: Number.isFinite(args.usdToMxn) && args.usdToMxn! > 0 ? args.usdToMxn! : 17,
    EUR: Number.isFinite(args.eurToMxn) && args.eurToMxn! > 0 ? args.eurToMxn! : 18.5,
});

const parseExchangeRate = (value?: string | number) => {
    const parsed = typeof value === "number" ? value : Number(String(value || "").replace(",", "."));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const convertToMxn = (
    amount: number,
    currency?: string,
    exchangeRate?: string | number,
    rates: ExchangeRates = { USD: 17, EUR: 18.5 }
) => {
    const normalizedCurrency = (currency || "MXN").trim().toUpperCase();
    const safeAmount = Number.isFinite(amount) ? amount : 0;

    if (normalizedCurrency === "USD") {
        return safeAmount * (parseExchangeRate(exchangeRate) || rates.USD);
    }

    if (normalizedCurrency === "EUR") {
        return safeAmount * (parseExchangeRate(exchangeRate) || rates.EUR);
    }

    return safeAmount;
};

const isDateWithinPeriod = (date: Date | null, period: PnlPeriod) => {
    if (!date) return false;
    return date.getTime() >= period.start.getTime() && date.getTime() <= period.end.getTime();
};

const emptyStructureBreakdownMap = () => {
    return OGC_STRUCTURE_COST_GROUPS.reduce((acc, group) => {
        acc[group.key] = 0;
        return acc;
    }, {} as Record<string, number>);
};

const createEmptyMonthlySummary = (): MonthlyOgcMovementSummary => ({
    honorarios: 0,
    indirectos: 0,
    costosDirectosObra: 0,
    structureBreakdown: emptyStructureBreakdownMap(),
});

const addMonthlyAmount = (
    monthly: Record<string, MonthlyOgcMovementSummary>,
    monthKey: string | null,
    updater: (summary: MonthlyOgcMovementSummary) => void
) => {
    if (!monthKey) return;
    monthly[monthKey] = monthly[monthKey] || createEmptyMonthlySummary();
    updater(monthly[monthKey]);
};

const mergeMonthlySummaries = (
    target: Record<string, MonthlyOgcMovementSummary>,
    source: Record<string, MonthlyOgcMovementSummary>
) => {
    Object.entries(source).forEach(([monthKey, sourceSummary]) => {
        target[monthKey] = target[monthKey] || createEmptyMonthlySummary();
        target[monthKey].honorarios += sourceSummary.honorarios;
        target[monthKey].indirectos += sourceSummary.indirectos;
        target[monthKey].costosDirectosObra += sourceSummary.costosDirectosObra || 0;
        Object.entries(sourceSummary.structureBreakdown || {}).forEach(([key, amount]) => {
            target[monthKey].structureBreakdown[key] = (target[monthKey].structureBreakdown[key] || 0) + amount;
        });
    });
};

const getMonthlyStructureTotal = (summary?: MonthlyOgcMovementSummary) => {
    if (!summary) return 0;
    return Object.values(summary.structureBreakdown || {}).reduce((sum, amount) => sum + (amount || 0), 0);
};

const getStructureGroupsWithMovements = (summary: Pick<MonthlyOgcMovementSummary, "structureBreakdown">) => {
    return new Set(
        Object.entries(summary.structureBreakdown || {})
            .filter(([, amount]) => (amount || 0) > 0)
            .map(([key]) => key)
    );
};

const getAccessibleOgcMovements = async (ctx: QueryCtx, proyectos: Doc<"desarrollos">[]) => {
    const user = await getCurrentUserOrThrow(ctx);
    const organizationId = getScopedOrganizationId(user);
    const projectIds = new Set(proyectos.map((proyecto) => proyecto._id as string));
    const movements = await ctx.db.query("ogc_movimientos").collect();

    return movements.filter((movement) => {
        if (movement.status && movement.status !== "activo") return false;
        if (hasGlobalAdminAccess(user)) return true;
        if (!movement.proyecto) return movement.organization_id === organizationId;
        if (movement.organization_id && movement.organization_id !== organizationId) return false;
        return projectIds.has(movement.proyecto as string);
    });
};

const summarizeOgcMovements = (movements: OgcMovement[], period: PnlPeriod, rates: ExchangeRates) => {
    return movements.reduce(
        (acc, movement) => {
            const parsedDate = parseReportDate(movement.fecha);
            if (!isDateWithinPeriod(parsedDate, period)) return acc;

            if (movement.status && movement.status !== "activo") return acc;

            const amount = Math.abs(convertToMxn(movement.monto || 0, movement.moneda, movement.tipo_cambio, rates));
            const monthKey = parsedDate ? `${parsedDate.getFullYear()}-${parsedDate.getMonth() + 1}` : null;

            if (movement.tipo === "ingreso") {
                if (matchesAnyReportLabel(movement.categoria, INDIRECTOS_LABELS)) {
                    acc.indirectos += amount;
                    addMonthlyAmount(acc.monthly, monthKey, (summary) => {
                        summary.indirectos += amount;
                    });
                } else {
                    acc.honorarios += amount;
                    addMonthlyAmount(acc.monthly, monthKey, (summary) => {
                        summary.honorarios += amount;
                    });
                }
                acc.hasIncomeMovements = true;
            } else {
                const groupKey = getMovementGroupKey(movement);
                acc.structureBreakdown[groupKey] = (acc.structureBreakdown[groupKey] || 0) + amount;
                acc.costosEstructura += amount;
                acc.hasStructureMovements = true;

                addMonthlyAmount(acc.monthly, monthKey, (summary) => {
                    summary.structureBreakdown[groupKey] =
                        (summary.structureBreakdown[groupKey] || 0) + amount;
                });
            }

            return acc;
        },
        {
            honorarios: 0,
            indirectos: 0,
            costosEstructura: 0,
            structureBreakdown: emptyStructureBreakdownMap(),
            monthly: {} as Record<string, MonthlyOgcMovementSummary>,
            hasIncomeMovements: false,
            hasStructureMovements: false,
        }
    );
};

const getLatestAvancePercent = async (ctx: QueryCtx, proyectoId: Doc<"desarrollos">["_id"]) => {
    const records = await ctx.db
        .query("weekly_avance_real")
        .withIndex("by_proyecto", (q) => q.eq("proyecto", proyectoId))
        .collect();

    const latest = records
        .filter((record) => Number.isFinite(record.avance_real))
        .sort((a, b) => b.week_date - a.week_date)[0];

    return (latest?.avance_real || 0) / 100;
};

const getAverageWeeklyExpense = async (ctx: QueryCtx, proyectoId: Doc<"desarrollos">["_id"], now: Date) => {
    const fourWeeksAgo = now.getTime() - 1000 * 60 * 60 * 24 * 28;
    const transactions = await ctx.db
        .query("transacciones")
        .withIndex("by_proyecto", (q) => q.eq("proyecto", proyectoId))
        .collect();

    const totalLastFourWeeks = transactions
        .filter((transaction) => transaction.status === "Pagado")
        .filter((transaction) => {
            const parsedDate = parseReportDate(transaction.fecha);
            if (!parsedDate) return false;
            const timestamp = parsedDate.getTime();
            return timestamp >= fourWeeksAgo && timestamp <= now.getTime();
        })
        .reduce((sum, transaction) => sum + (transaction.monto_total || 0), 0);

    return totalLastFourWeeks / 4;
};

const getProjectCollectedIncome = async (
    ctx: QueryCtx,
    proyectoId: Doc<"desarrollos">["_id"],
    period: PnlPeriod,
    rates: ExchangeRates
) => {
    const ingresos = await ctx.db
        .query("ingresos")
        .withIndex("by_proyecto", (q) => q.eq("proyecto", proyectoId))
        .collect();

    return ingresos
        .filter((ingreso) => isDateWithinPeriod(parseReportDate(ingreso.fecha), period))
        .reduce((sum, ingreso) => sum + Math.abs(convertToMxn(ingreso.monto || 0, ingreso.moneda, undefined, rates)), 0);
};

const summarizeProjectPayments = async (
    ctx: QueryCtx,
    proyecto: Doc<"desarrollos">,
    period: PnlPeriod,
    rates: ExchangeRates,
    suppressedStructureGroups = new Set<string>()
) => {
    const [metrics, partidas, transactions] = await Promise.all([
        ctx.db
            .query("meticas_presupuesto")
            .withIndex("by_proyecto", (q) => q.eq("proyecto", proyecto._id))
            .first(),
        ctx.db
            .query("partidas")
            .withIndex("by_proyecto", (q) => q.eq("proyecto", proyecto._id))
            .collect(),
        ctx.db
            .query("transacciones")
            .withIndex("by_proyecto", (q) => q.eq("proyecto", proyecto._id))
            .collect(),
    ]);

    const partidasById = new Map(partidas.map((partida) => [partida._id as string, partida]));
    const summary = {
        metrics,
        honorarios: 0,
        indirectos: 0,
        totalPagado: 0,
        costosDirectosObra: 0,
        costosEstructura: 0,
        structureBreakdown: emptyStructureBreakdownMap(),
        monthly: {} as Record<string, MonthlyOgcMovementSummary>,
    };

    const periodTransactions = transactions.filter((transaction) => {
        if (transaction.status !== "Pagado") return false;
        return isDateWithinPeriod(parseReportDate(transaction.fecha), period);
    });

    for (const transaction of periodTransactions) {
        const parsedDate = parseReportDate(transaction.fecha);
        const monthKey = parsedDate ? `${parsedDate.getFullYear()}-${parsedDate.getMonth() + 1}` : null;
        const pagos = await ctx.db
            .query("pagos")
            .withIndex("by_transaccion", (q) => q.eq("transaccion_id", transaction._id))
            .collect();

        for (const pago of pagos) {
            const partida = partidasById.get(pago.partida_id as string);
            const amount = Math.abs(convertToMxn(pago.monto || 0, transaction.moneda, transaction.tipo_cambio, rates));

            if (!partida || amount === 0) continue;

            summary.totalPagado += amount;

            if (
                matchesAnyReportLabel(partida.nombre, HONORARIOS_LABELS) ||
                matchesAnyReportLabel(partida.familia, HONORARIOS_LABELS) ||
                matchesAnyReportLabel(partida.sub_partida, HONORARIOS_LABELS)
            ) {
                summary.honorarios += amount;
                addMonthlyAmount(summary.monthly, monthKey, (monthlySummary) => {
                    monthlySummary.honorarios += amount;
                });
                continue;
            }

            if (
                matchesAnyReportLabel(partida.nombre, INDIRECTOS_LABELS) ||
                matchesAnyReportLabel(partida.familia, INDIRECTOS_LABELS) ||
                matchesAnyReportLabel(partida.sub_partida, INDIRECTOS_LABELS)
            ) {
                summary.indirectos += amount;
                addMonthlyAmount(summary.monthly, monthKey, (monthlySummary) => {
                    monthlySummary.indirectos += amount;
                });
                continue;
            }

            const structureGroup = OGC_STRUCTURE_COST_GROUPS.find((group) => (
                matchesAnyReportLabel(partida.nombre, group.labels) ||
                matchesAnyReportLabel(partida.familia, group.labels) ||
                matchesAnyReportLabel(partida.sub_partida, group.labels)
            ));

            if (structureGroup && !suppressedStructureGroups.has(structureGroup.key)) {
                summary.costosEstructura += amount;
                summary.structureBreakdown[structureGroup.key] = (summary.structureBreakdown[structureGroup.key] || 0) + amount;
                addMonthlyAmount(summary.monthly, monthKey, (monthlySummary) => {
                    monthlySummary.structureBreakdown[structureGroup.key] =
                        (monthlySummary.structureBreakdown[structureGroup.key] || 0) + amount;
                });
                continue;
            }

            summary.costosDirectosObra += amount;
            addMonthlyAmount(summary.monthly, monthKey, (monthlySummary) => {
                monthlySummary.costosDirectosObra += amount;
            });
        }
    }

    return summary;
};

const getOgcFormulaTotals = async (
    ctx: QueryCtx,
    proyecto: Doc<"desarrollos">,
    period: PnlPeriod,
    rates: ExchangeRates,
    ogcMovements: OgcMovement[] = []
) => {
    const movementSummary = summarizeOgcMovements(ogcMovements, period, rates);
    const suppressedStructureGroups = getStructureGroupsWithMovements(movementSummary);
    const projectPaymentSummary = await summarizeProjectPayments(ctx, proyecto, period, rates, suppressedStructureGroups);
    const monthlyOgcMovements = {} as Record<string, MonthlyOgcMovementSummary>;
    mergeMonthlySummaries(monthlyOgcMovements, projectPaymentSummary.monthly);
    mergeMonthlySummaries(monthlyOgcMovements, movementSummary.monthly);

    const legacyHonorarios = projectPaymentSummary.honorarios;
    const legacyIndirectos = projectPaymentSummary.indirectos;
    const honorarios = legacyHonorarios + movementSummary.honorarios;
    const indirectos = legacyIndirectos + movementSummary.indirectos;
    const ingresosOgc = honorarios + indirectos;
    const mergedStructureBreakdown = OGC_STRUCTURE_COST_GROUPS.map((group) => ({
        key: group.key,
        label: group.label,
        amount:
            (projectPaymentSummary.structureBreakdown[group.key] || 0) +
            (movementSummary.structureBreakdown[group.key] || 0),
    }));
    const costosDirectosObra = projectPaymentSummary.costosDirectosObra;
    const costosEstructuraOgc = projectPaymentSummary.costosEstructura + movementSummary.costosEstructura;
    const costosEstructuraMasIndirectos = costosEstructuraOgc + indirectos;
    const margenBruto = ingresosOgc - costosDirectosObra - costosEstructuraOgc;
    const ebitda = ingresosOgc - costosEstructuraMasIndirectos;

    return {
        metrics: projectPaymentSummary.metrics,
        honorarios,
        indirectos,
        ingresosOgc,
        costosDirectosObra,
        costosEstructuraAsignadaOgc: costosEstructuraOgc,
        costosEstructuraOgc,
        costosEstructuraMasIndirectos,
        margenBruto,
        ebitda,
        estructuraPercent: ingresosOgc > 0 ? costosEstructuraOgc / ingresosOgc : 0,
        ebitdaMargin: ingresosOgc > 0 ? ebitda / ingresosOgc : 0,
        margenBrutoPercent: ingresosOgc > 0 ? margenBruto / ingresosOgc : 0,
        structureBreakdown: mergedStructureBreakdown,
        hasOgcIncomeMovements: movementSummary.hasIncomeMovements,
        hasOgcStructureMovements: movementSummary.hasStructureMovements,
        hasLegacyStructureSuppressed: suppressedStructureGroups.size > 0,
        legacyStructureSuppressedGroups: OGC_STRUCTURE_COST_GROUPS
            .filter((group) => suppressedStructureGroups.has(group.key))
            .map(({ key, label }) => ({ key, label })),
        monthlyOgcMovements,
    };
};

const getWipFormulaTotals = async (
    ctx: QueryCtx,
    proyecto: Doc<"desarrollos">,
    formulaTotals: Awaited<ReturnType<typeof getOgcFormulaTotals>>,
    now: Date,
    period: PnlPeriod,
    rates: ExchangeRates
) => {
    const presupuesto = formulaTotals.metrics?.presupuesto_aprobado || 0;
    const costoReal = formulaTotals.metrics?.gasto_total || 0;
    const pagado = await getProjectCollectedIncome(ctx, proyecto._id, period, rates);
    const avance = await getLatestAvancePercent(ctx, proyecto._id);
    const valorGanado = avance * presupuesto;
    const restante = Math.max(presupuesto - valorGanado, 0);
    const cpi = costoReal > 0 ? valorGanado / costoReal : 0;
    const eac = cpi > 0 ? costoReal + restante / cpi : 0;
    const varianza = eac > 0 ? presupuesto - eac : 0;
    const saldo = pagado - costoReal;
    const averageWeeklyExpense = await getAverageWeeklyExpense(ctx, proyecto._id, now);
    const runway = saldo > 0 && averageWeeklyExpense > 0 ? saldo / averageWeeklyExpense : 0;

    return {
        presupuesto,
        costoReal,
        avance,
        valorGanado,
        restante,
        eac,
        varianza,
        cpi,
        pagado,
        saldo,
        runway,
        averageWeeklyExpense,
    };
};

const pnlQueryArgs = {
    periodYear: v.optional(v.number()),
    cutoffMonth: v.optional(v.number()),
    usdToMxn: v.optional(v.number()),
    eurToMxn: v.optional(v.number()),
};

// Aggregated P&L metrics using the formulas from the OGC monthly P&L reference.
export const getPnlSummary = query({
    args: pnlQueryArgs,
    handler: async (ctx, args) => {
    const proyectos = await getUserDesarrollos(ctx);
    const now = new Date();
    const period = normalizePnlPeriod(args);
    const rates = normalizeExchangeRates(args);
    const ogcMovements = await getAccessibleOgcMovements(ctx, proyectos);
    const allMovementSummary = summarizeOgcMovements(ogcMovements, period, rates);
    const companyOnlyMovementSummary = summarizeOgcMovements(ogcMovements.filter((movement) => !movement.proyecto), period, rates);

    const projects = await Promise.all(
        proyectos.map(async (proyecto) => {
            const totals = await getOgcFormulaTotals(
                ctx,
                proyecto,
                period,
                rates,
                ogcMovements.filter((movement) => movement.proyecto === proyecto._id)
            );
            return {
                id: proyecto._id,
                nombre: proyecto.nombre,
                status: proyecto.status,
                ...totals,
            };
        })
    );

    const totals = projects.reduce(
        (acc, project) => {
            acc.honorarios += project.honorarios;
            acc.indirectos += project.indirectos;
            acc.ingresosOgc += project.ingresosOgc;
            acc.costosDirectosObra += project.costosDirectosObra;
            acc.costosEstructuraOgc += project.costosEstructuraOgc;
            acc.costosEstructuraMasIndirectos += project.costosEstructuraMasIndirectos;
            acc.margenBruto += project.margenBruto;
            acc.ebitda += project.ebitda;
            project.structureBreakdown.forEach((item) => {
                acc.structureBreakdown[item.key] = (acc.structureBreakdown[item.key] || 0) + item.amount;
            });
            mergeMonthlySummaries(acc.monthlyOgcMovements, project.monthlyOgcMovements);
            return acc;
        },
        {
            honorarios: 0,
            indirectos: 0,
            ingresosOgc: 0,
            costosDirectosObra: 0,
            costosEstructuraOgc: 0,
            costosEstructuraMasIndirectos: 0,
            margenBruto: 0,
            ebitda: 0,
            structureBreakdown: {} as Record<string, number>,
            monthlyOgcMovements: {} as Record<string, MonthlyOgcMovementSummary>,
        }
    );

    totals.honorarios += companyOnlyMovementSummary.honorarios;
    totals.indirectos += companyOnlyMovementSummary.indirectos;
    totals.ingresosOgc += companyOnlyMovementSummary.honorarios + companyOnlyMovementSummary.indirectos;
    totals.costosEstructuraOgc += companyOnlyMovementSummary.costosEstructura;
    totals.costosEstructuraMasIndirectos += companyOnlyMovementSummary.costosEstructura + companyOnlyMovementSummary.indirectos;
    totals.ebitda += companyOnlyMovementSummary.honorarios - companyOnlyMovementSummary.costosEstructura;
    Object.entries(companyOnlyMovementSummary.structureBreakdown).forEach(([key, amount]) => {
        totals.structureBreakdown[key] = (totals.structureBreakdown[key] || 0) + amount;
    });
    mergeMonthlySummaries(totals.monthlyOgcMovements, companyOnlyMovementSummary.monthly);

    return {
        projects,
        totals: {
            ...totals,
            structureBreakdown: OGC_STRUCTURE_COST_GROUPS.map((group) => ({
                key: group.key,
                label: group.label,
                amount: totals.structureBreakdown[group.key] || 0,
            })),
            hasOgcIncomeMovements: allMovementSummary.hasIncomeMovements,
            hasOgcStructureMovements: allMovementSummary.hasStructureMovements,
            estructuraPercent: totals.ingresosOgc > 0 ? totals.costosEstructuraOgc / totals.ingresosOgc : 0,
            ebitdaMargin: totals.ingresosOgc > 0 ? totals.ebitda / totals.ingresosOgc : 0,
            margenBrutoPercent: totals.ingresosOgc > 0 ? totals.margenBruto / totals.ingresosOgc : 0,
            activeProjects: projects.filter((project) => project.status !== "Cancelado").length,
        },
        monthlyOgcMovements: totals.monthlyOgcMovements,
        structureGroups: OGC_STRUCTURE_COST_GROUPS.map(({ key, label }) => ({ key, label })),
        period: {
            year: period.year,
            cutoffMonth: period.cutoffMonth,
            start: period.start.getTime(),
            end: period.end.getTime(),
            currentMonthKey: period.currentMonthKey,
        },
        currency: {
            display: "MXN",
            rates,
        },
        formulas: {
            ingresosOgc: "honorarios + indirectos",
            estructura: "total costos estructura OGC",
            estructuraPercent: "estructura / ingresos OGC",
            margenBruto: "ingresos OGC - costos directos por obra - estructura OGC",
            margenBrutoPercent: "margen bruto / ingresos OGC",
            ebitda: "ingresos OGC - (estructura OGC + indirectos)",
            ebitdaMargin: "EBITDA / ingresos OGC",
        },
        generatedAt: now.getTime(),
    };
    },
});

// Aggregated profitability data for the P&L Project profitability tab.
export const getProfitabilitySummary = query({
    args: pnlQueryArgs,
    handler: async (ctx, args) => {
    const proyectos = await getUserDesarrollos(ctx);
    const now = new Date();
    const period = normalizePnlPeriod(args);
    const rates = normalizeExchangeRates(args);
    const ogcMovements = await getAccessibleOgcMovements(ctx, proyectos);
    const allMovementSummary = summarizeOgcMovements(ogcMovements, period, rates);
    const companyOnlyMovementSummary = summarizeOgcMovements(ogcMovements.filter((movement) => !movement.proyecto), period, rates);

    const projects = await Promise.all(
        proyectos.map(async (proyecto) => {
            const formulaTotals = await getOgcFormulaTotals(
                ctx,
                proyecto,
                period,
                rates,
                ogcMovements.filter((movement) => movement.proyecto === proyecto._id)
            );
            const wip = await getWipFormulaTotals(ctx, proyecto, formulaTotals, now, period, rates);
            const ingresosOgc = formulaTotals.ingresosOgc;
            const costosOgc = formulaTotals.costosDirectosObra + formulaTotals.costosEstructuraAsignadaOgc;
            const currentMonthSummary = formulaTotals.monthlyOgcMovements[period.currentMonthKey];
            const currentMonthIngresos = (currentMonthSummary?.honorarios || 0) + (currentMonthSummary?.indirectos || 0);
            const currentMonthCostos = (currentMonthSummary?.costosDirectosObra || 0) + getMonthlyStructureTotal(currentMonthSummary);

            return {
                id: proyecto._id,
                nombre: proyecto.nombre,
                status: proyecto.status,
                honorarios: formulaTotals.honorarios,
                indirectos: formulaTotals.indirectos,
                ingresosOgc,
                costosOgc,
                costosEstructuraOgc: formulaTotals.costosEstructuraOgc,
                costosEstructuraMasIndirectos: formulaTotals.costosEstructuraMasIndirectos,
                structureBreakdown: formulaTotals.structureBreakdown,
                ebitda: formulaTotals.ebitda,
                ebitdaMargin: formulaTotals.ebitdaMargin,
                margen: formulaTotals.margenBruto,
                margenPercent: formulaTotals.margenBrutoPercent,
                monthlyOgcMovements: formulaTotals.monthlyOgcMovements,
                currentMonthIngresos,
                currentMonthCostos,
                currentMonthMargen: currentMonthIngresos - currentMonthCostos,
                currentMonthMargenPercent:
                    currentMonthIngresos > 0 ? (currentMonthIngresos - currentMonthCostos) / currentMonthIngresos : 0,
                hasLegacyStructureSuppressed: formulaTotals.hasLegacyStructureSuppressed,
                legacyStructureSuppressedGroups: formulaTotals.legacyStructureSuppressedGroups,
                wip,
            };
        })
    );

    const totals = projects.reduce(
        (acc, project) => {
            acc.wip.presupuesto += project.wip.presupuesto;
            acc.wip.costoReal += project.wip.costoReal;
            acc.wip.pagado += project.wip.pagado;
            acc.wip.saldo += project.wip.saldo;
            acc.ingresosOgc += project.ingresosOgc;
            acc.costosOgc += project.costosOgc;
            acc.honorarios += project.honorarios;
            acc.indirectos += project.indirectos;
            acc.costosEstructuraOgc += project.costosEstructuraOgc;
            acc.costosEstructuraMasIndirectos += project.costosEstructuraMasIndirectos;
            acc.ebitda += project.ebitda;
            acc.margen += project.margen;
            acc.currentMonthIngresos += project.currentMonthIngresos;
            acc.currentMonthCostos += project.currentMonthCostos;
            acc.currentMonthMargen += project.currentMonthMargen;
            project.structureBreakdown.forEach((item) => {
                acc.structureBreakdown[item.key] = (acc.structureBreakdown[item.key] || 0) + item.amount;
            });
            mergeMonthlySummaries(acc.monthlyOgcMovements, project.monthlyOgcMovements);
            return acc;
        },
        {
            honorarios: 0,
            indirectos: 0,
            ingresosOgc: 0,
            costosOgc: 0,
            costosEstructuraOgc: 0,
            costosEstructuraMasIndirectos: 0,
            ebitda: 0,
            margen: 0,
            currentMonthIngresos: 0,
            currentMonthCostos: 0,
            currentMonthMargen: 0,
            structureBreakdown: {} as Record<string, number>,
            monthlyOgcMovements: {} as Record<string, MonthlyOgcMovementSummary>,
            wip: {
                presupuesto: 0,
                costoReal: 0,
                pagado: 0,
                saldo: 0,
            },
        }
    );

    totals.honorarios += companyOnlyMovementSummary.honorarios;
    totals.indirectos += companyOnlyMovementSummary.indirectos;
    totals.ingresosOgc += companyOnlyMovementSummary.honorarios + companyOnlyMovementSummary.indirectos;
    totals.costosEstructuraOgc += companyOnlyMovementSummary.costosEstructura;
    totals.costosEstructuraMasIndirectos += companyOnlyMovementSummary.costosEstructura + companyOnlyMovementSummary.indirectos;
    totals.ebitda += companyOnlyMovementSummary.honorarios - companyOnlyMovementSummary.costosEstructura;
    Object.entries(companyOnlyMovementSummary.structureBreakdown).forEach(([key, amount]) => {
        totals.structureBreakdown[key] = (totals.structureBreakdown[key] || 0) + amount;
    });
    mergeMonthlySummaries(totals.monthlyOgcMovements, companyOnlyMovementSummary.monthly);
    const companyCurrentMonth = companyOnlyMovementSummary.monthly[period.currentMonthKey];
    const companyCurrentMonthIngresos = (companyCurrentMonth?.honorarios || 0) + (companyCurrentMonth?.indirectos || 0);
    const companyCurrentMonthCostos = getMonthlyStructureTotal(companyCurrentMonth);
    totals.currentMonthIngresos += companyCurrentMonthIngresos;
    totals.currentMonthCostos += companyCurrentMonthCostos;
    totals.currentMonthMargen += companyCurrentMonthIngresos - companyCurrentMonthCostos;

    return {
        projects,
        totals: {
            ...totals,
            structureBreakdown: OGC_STRUCTURE_COST_GROUPS.map((group) => ({
                key: group.key,
                label: group.label,
                amount: totals.structureBreakdown[group.key] || 0,
            })),
            hasOgcIncomeMovements: allMovementSummary.hasIncomeMovements,
            hasOgcStructureMovements: allMovementSummary.hasStructureMovements,
            margenPercent: totals.ingresosOgc > 0 ? totals.margen / totals.ingresosOgc : 0,
            ebitdaMargin: totals.ingresosOgc > 0 ? totals.ebitda / totals.ingresosOgc : 0,
            currentMonthMargenPercent:
                totals.currentMonthIngresos > 0 ? totals.currentMonthMargen / totals.currentMonthIngresos : 0,
            activeProjects: projects.filter((project) => project.status !== "Cancelado").length,
            wip: {
                ...totals.wip,
                ejecutadoPercent: totals.wip.presupuesto > 0 ? totals.wip.costoReal / totals.wip.presupuesto : 0,
                backlogPendiente: Math.max(totals.wip.presupuesto - totals.wip.pagado, 0),
            },
        },
        period: {
            year: period.year,
            cutoffMonth: period.cutoffMonth,
            start: period.start.getTime(),
            end: period.end.getTime(),
            currentMonthKey: period.currentMonthKey,
        },
        currency: {
            display: "MXN",
            rates,
        },
        generatedAt: now.getTime(),
    };
    },
});

// Get project by ID
export const getById = query({
    args: {
        id: v.id("desarrollos"),
    },
    handler: async (ctx, args) => {
        const hasAccess = await checkDesarrolloAccess(ctx, args.id);
        if (!hasAccess) {
            return null;
        }

        return await ctx.db.get(args.id);
    },
});

// Create new project
export const create = mutation({
    args: {
        nombre: v.string(),
        descripcion: v.string(),
        image: v.string(),
        status: v.optional(v.string()),
        fecha_creacion: v.optional(v.string()),
        honorarios_porcentaje: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const currentUser = await getCurrentUserOrThrow(ctx);
        if (!hasAdminAccess(currentUser)) {
            throw new Error("Unauthorized: Admin access required");
        }

        const organizationId = getScopedOrganizationId(currentUser);
        const project = await ctx.db.insert("desarrollos", {
            nombre: args.nombre,
            descripcion: args.descripcion,
            image: args.image,
            status: args.status || "Activo",
            fecha_creacion: args.fecha_creacion || new Date().toLocaleDateString("es-MX", {
                day: "2-digit",
                month: "short",
                year: "numeric",
            }),
            honorarios_porcentaje: args.honorarios_porcentaje || 0,
            honorarios_monto: 0, // Initial value, will be calculated by triggers
            ...(organizationId ? { organization_id: organizationId } : {}),
        });

        if (organizationId && !currentUser.allowed_desarrollos.includes(project)) {
            await ctx.db.patch(currentUser._id, {
                allowed_desarrollos: [...currentUser.allowed_desarrollos, project],
            });
        }

        return project;
    },
});

// Update project
export const update = mutation({
    args: {
        id: v.id("desarrollos"),
        nombre: v.optional(v.string()),
        descripcion: v.optional(v.string()),
        image: v.optional(v.string()),
        status: v.optional(v.string()),
        fecha_creacion: v.optional(v.string()),
        honorarios_porcentaje: v.optional(v.number()),
        excluded_partidas_honorarios: v.optional(v.array(v.id("partidas"))),
    },
    handler: async (ctx, args) => {
        const { id, ...rest } = args;
        const currentUser = await getCurrentUserOrThrow(ctx);
        if (!hasAdminAccess(currentUser)) {
            throw new Error("Unauthorized: Admin access required");
        }

        const hasAccess = await checkDesarrolloAccess(ctx, id);
        if (!hasAccess) {
            throw new Error("Unauthorized: Project belongs to another organization");
        }

        // Filter out undefined valuese
        const updateData = Object.fromEntries(
            Object.entries(rest).filter(([, value]) => value !== undefined)
        );
        return await ctx.db.patch(id, updateData);
    },
});

// Batch size for paginated deletes to avoid hitting read limits
const BATCH_SIZE = 100;

// Delete project and all related data (cascade delete)
// Uses rawMutation to bypass triggers and avoid timeout during bulk deletes
// Deletes in batches to avoid hitting the 4096 read limit
export const deleteProject = rawMutation({
    args: {
        id: v.id("desarrollos"),
    },
    handler: async (ctx, args) => {
        const currentUser = await getCurrentUserOrThrow(ctx);
        if (!hasAdminAccess(currentUser)) {
            throw new Error("Unauthorized: Admin access required");
        }

        const hasAccess = await checkDesarrolloAccess(ctx, args.id);
        if (!hasAccess) {
            throw new Error("Unauthorized: Project belongs to another organization");
        }

        // Verify the project exists
        const project = await ctx.db.get(args.id);
        if (!project) {
            throw new Error("Project not found");
        }

        let deletedPagos = 0;
        let deletedTransacciones = 0;
        let deletedPartidas = 0;
        let deletedDocumentos = 0;
        let deletedMeticas = 0;
        let deletedProjectedTransactions = 0;
        let deletedWeeklyTotals = 0;
        let deletedBitacora = 0;
        let deletedPhotoComments = 0;
        const appwriteFileIds: string[] = [];

        // 1. Delete pagos in batches (paginate to avoid too many reads)
        // First get transacciones with pagination
        let transaccionesCursor = await ctx.db
            .query("transacciones")
            .withIndex("by_proyecto", (q) => q.eq("proyecto", args.id))
            .take(BATCH_SIZE);
        
        while (transaccionesCursor.length > 0) {
            // For each transaction batch, get and delete pagos
            for (const transaccion of transaccionesCursor) {
                const pagos = await ctx.db
                    .query("pagos")
                    .withIndex("by_transaccion", (q) => q.eq("transaccion_id", transaccion._id))
                    .collect();
                for (const pago of pagos) {
                    await ctx.db.delete(pago._id);
                    deletedPagos++;
                }
            }
            
            // Delete this batch of transacciones
            for (const t of transaccionesCursor) {
                await ctx.db.delete(t._id);
                deletedTransacciones++;
            }
            
            // Get next batch (items after the last one we processed)
            const lastId = transaccionesCursor[transaccionesCursor.length - 1]._id;
            transaccionesCursor = await ctx.db
                .query("transacciones")
                .withIndex("by_proyecto", (q) => q.eq("proyecto", args.id))
                .filter((q) => q.gt(q.field("_id"), lastId))
                .take(BATCH_SIZE);
        }

        // 2. Delete documentos in batches (and collect file IDs)
        let documentosCursor = await ctx.db
            .query("documentos")
            .withIndex("by_proyecto", (q) => q.eq("proyecto", args.id))
            .take(BATCH_SIZE);
        
        while (documentosCursor.length > 0) {
            // Collect file IDs and delete photo_comments before deleting docs
            for (const doc of documentosCursor) {
                if (doc.image) appwriteFileIds.push(doc.image);
                
                // Delete any photo_comments for this document
                const comments = await ctx.db
                    .query("photo_comments")
                    .withIndex("by_photo", (q) => q.eq("photo_id", doc._id))
                    .collect();
                for (const comment of comments) {
                    await ctx.db.delete(comment._id);
                    deletedPhotoComments++;
                }
                
                await ctx.db.delete(doc._id);
                deletedDocumentos++;
            }
            
            const lastId = documentosCursor[documentosCursor.length - 1]._id;
            documentosCursor = await ctx.db
                .query("documentos")
                .withIndex("by_proyecto", (q) => q.eq("proyecto", args.id))
                .filter((q) => q.gt(q.field("_id"), lastId))
                .take(BATCH_SIZE);
        }

        // 3. Delete partidas in batches
        let partidasCursor = await ctx.db
            .query("partidas")
            .withIndex("by_proyecto", (q) => q.eq("proyecto", args.id))
            .take(BATCH_SIZE);
        
        while (partidasCursor.length > 0) {
            for (const p of partidasCursor) {
                await ctx.db.delete(p._id);
                deletedPartidas++;
            }
            
            const lastId = partidasCursor[partidasCursor.length - 1]._id;
            partidasCursor = await ctx.db
                .query("partidas")
                .withIndex("by_proyecto", (q) => q.eq("proyecto", args.id))
                .filter((q) => q.gt(q.field("_id"), lastId))
                .take(BATCH_SIZE);
        }

        // 4. Delete bitacora entries in batches
        let bitacoraCursor = await ctx.db
            .query("bitacora")
            .withIndex("by_proyecto", (q) => q.eq("proyecto", args.id))
            .take(BATCH_SIZE);
        
        while (bitacoraCursor.length > 0) {
            for (const b of bitacoraCursor) {
                await ctx.db.delete(b._id);
                deletedBitacora++;
            }
            
            const lastId = bitacoraCursor[bitacoraCursor.length - 1]._id;
            bitacoraCursor = await ctx.db
                .query("bitacora")
                .withIndex("by_proyecto", (q) => q.eq("proyecto", args.id))
                .filter((q) => q.gt(q.field("_id"), lastId))
                .take(BATCH_SIZE);
        }

        // 5. Delete meticas_presupuesto (usually just one per project)
        const meticas = await ctx.db
            .query("meticas_presupuesto")
            .withIndex("by_proyecto", (q) => q.eq("proyecto", args.id))
            .collect();
        for (const m of meticas) {
            await ctx.db.delete(m._id);
            deletedMeticas++;
        }

        // 6. Delete projected_transactions in batches
        let projectedCursor = await ctx.db
            .query("projected_transactions")
            .withIndex("by_proyecto", (q) => q.eq("proyecto", args.id))
            .take(BATCH_SIZE);
        
        while (projectedCursor.length > 0) {
            for (const pt of projectedCursor) {
                await ctx.db.delete(pt._id);
                deletedProjectedTransactions++;
            }
            
            const lastId = projectedCursor[projectedCursor.length - 1]._id;
            projectedCursor = await ctx.db
                .query("projected_transactions")
                .withIndex("by_proyecto", (q) => q.eq("proyecto", args.id))
                .filter((q) => q.gt(q.field("_id"), lastId))
                .take(BATCH_SIZE);
        }

        // 7. Delete weekly_projected_totals in batches
        let weeklyCursor = await ctx.db
            .query("weekly_projected_totals")
            .withIndex("by_proyecto", (q) => q.eq("proyecto", args.id))
            .take(BATCH_SIZE);
        
        while (weeklyCursor.length > 0) {
            for (const wt of weeklyCursor) {
                await ctx.db.delete(wt._id);
                deletedWeeklyTotals++;
            }
            
            const lastId = weeklyCursor[weeklyCursor.length - 1]._id;
            weeklyCursor = await ctx.db
                .query("weekly_projected_totals")
                .withIndex("by_proyecto", (q) => q.eq("proyecto", args.id))
                .filter((q) => q.gt(q.field("_id"), lastId))
                .take(BATCH_SIZE);
        }

        // 8. Finally, delete the proyecto itself
        await ctx.db.delete(args.id);

        return {
            success: true,
            deletedPartidas,
            deletedPagos,
            deletedTransacciones,
            deletedDocumentos,
            deletedMeticas,
            deletedProjectedTransactions,
            deletedWeeklyTotals,
            deletedBitacora,
            deletedPhotoComments,
            appwriteFileIds,
        };
    },
});

// Manually recalculate honorarios monto for a proyecto
export const recalculateHonorariosMonto = mutation({
    args: {
        id: v.id("desarrollos"),
    },
    handler: async (ctx, args) => {
        // Verify the project exists
        const project = await ctx.db.get(args.id);
        if (!project) {
            throw new Error("Project not found");
        }

        const honorariosPorcentaje = project.honorarios_porcentaje || 0;

        // Get all transactions for this proyecto
        const allTransactions = await ctx.db
            .query("transacciones")
            .withIndex("by_proyecto", (q) => q.eq("proyecto", args.id))
            .collect();

        // Calculate total amount from all transactions
        const totalAmount = allTransactions.reduce(
            (sum, t) => sum + (t.monto_total || 0),
            0
        );

        // Calculate honorarios amount: total * percentage / 100
        const honorariosMonto = totalAmount * (honorariosPorcentaje / 100);

        // Round to 2 decimal places
        const roundedHonorariosMonto = Math.round(honorariosMonto * 100) / 100;

        // Update the desarrollo's honorarios_monto field
        await ctx.db.patch(args.id, { 
            honorarios_monto: roundedHonorariosMonto 
        });

        return {
            honorarios_porcentaje: honorariosPorcentaje,
            honorarios_monto: roundedHonorariosMonto,
            totalAmount,
        };
    },
});

// Recalculate honorarios monto for all projects (useful for bulk updates)
export const recalculateAllHonorariosMonto = mutation({
    args: {},
    handler: async (ctx) => {
        // Get all projects
        const allProjects = await ctx.db.query("desarrollos").collect();
        
        const results = [];
        
        for (const project of allProjects) {
            const honorariosPorcentaje = project.honorarios_porcentaje || 0;

            // Get all transactions for this proyecto
            const allTransactions = await ctx.db
                .query("transacciones")
                .withIndex("by_proyecto", (q) => q.eq("proyecto", project._id))
                .collect();

            // Calculate total amount from all transactions
            const totalAmount = allTransactions.reduce(
                (sum, t) => sum + (t.monto_total || 0),
                0
            );

            // Calculate honorarios amount: total * percentage / 100
            const honorariosMonto = totalAmount * (honorariosPorcentaje / 100);

            // Round to 2 decimal places
            const roundedHonorariosMonto = Math.round(honorariosMonto * 100) / 100;

            // Update the desarrollo's honorarios_monto field
            await ctx.db.patch(project._id, { 
                honorarios_monto: roundedHonorariosMonto 
            });

            results.push({
                projectId: project._id,
                projectName: project.nombre,
                honorarios_porcentaje: honorariosPorcentaje,
                honorarios_monto: roundedHonorariosMonto,
            });
        }

        return {
            success: true,
            projectsUpdated: results.length,
            results,
        };
    },
});

// Debug query to check HONORARIOS partida and gasto_total breakdown
export const debugHonorariosPartida = query({
    args: {
        id: v.id("desarrollos"),
    },
    handler: async (ctx, args) => {
        // Get the project
        const project = await ctx.db.get(args.id);
        if (!project) {
            throw new Error("Project not found");
        }

        // Get all nivel 1 partidas for this project
        const nivel1Partidas = await ctx.db
            .query("partidas")
            .filter((q) => 
                q.and(
                    q.eq(q.field("nivel"), 1),
                    q.eq(q.field("proyecto"), args.id)
                )
            )
            .collect();

        // Find the HONORARIOS partida with case-insensitive matching
        const honorariosPartida = nivel1Partidas.find((p) => 
            p.nombre.toLowerCase() === "honorarios"
        );

        // Calculate sum of all nivel 1 partidas' pagado
        const sumPagadoNivel1 = nivel1Partidas.reduce(
            (sum, p) => sum + (p.pagado || 0),
            0
        );

        // Get metrics from meticas_presupuesto table
        const metrics = await ctx.db
            .query("meticas_presupuesto")
            .withIndex("by_proyecto", (q) => q.eq("proyecto", args.id))
            .first();

        // Get all transactions to calculate base gasto
        const allTransactions = await ctx.db
            .query("transacciones")
            .withIndex("by_proyecto", (q) => q.eq("proyecto", args.id))
            .collect();

        const totalFromTransactions = allTransactions.reduce(
            (sum, t) => sum + (t.monto_total || 0),
            0
        );

        return {
            project: {
                id: project._id,
                nombre: project.nombre,
                honorarios_porcentaje: project.honorarios_porcentaje,
                honorarios_monto: project.honorarios_monto,
            },
            honorariosPartida: honorariosPartida ? {
                id: honorariosPartida._id,
                nombre: honorariosPartida.nombre,
                pagado: honorariosPartida.pagado,
                presupuesto_aprobado: honorariosPartida.presupuesto_aprobado,
                por_gastar: honorariosPartida.por_gastar,
            } : null,
            nivel1PartidasCount: nivel1Partidas.length,
            sumPagadoNivel1,
            metrics: metrics ? {
                gasto_total: metrics.gasto_total,
                presupuesto_aprobado: metrics.presupuesto_aprobado,
                por_gastar: metrics.por_gastar,
            } : null,
            totalFromTransactions,
            expectedGastoTotal: totalFromTransactions + (project.honorarios_monto || 0),
            diagnosis: {
                honorariosPartidaExists: !!honorariosPartida,
                honorariosPartidaPagadoMatchesMonto: honorariosPartida?.pagado === project.honorarios_monto,
                metricsGastoMatchesSumPagado: metrics?.gasto_total === sumPagadoNivel1,
            }
        };
    },
});
