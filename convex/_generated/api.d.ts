/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as assistant from "../assistant.js";
import type * as assistantRules from "../assistantRules.js";
import type * as assistantTypes from "../assistantTypes.js";
import type * as autorizaciones_obra from "../autorizaciones_obra.js";
import type * as bitacora from "../bitacora.js";
import type * as chart_configurations from "../chart_configurations.js";
import type * as crons from "../crons.js";
import type * as currency_helpers from "../currency_helpers.js";
import type * as desarrollos from "../desarrollos.js";
import type * as documentos from "../documentos.js";
import type * as files from "../files.js";
import type * as functions from "../functions.js";
import type * as imss_siroc from "../imss_siroc.js";
import type * as ingresos from "../ingresos.js";
import type * as ingresos_documentos from "../ingresos_documentos.js";
import type * as laborPaymentImports from "../laborPaymentImports.js";
import type * as meticas_presupuesto from "../meticas_presupuesto.js";
import type * as migrations from "../migrations.js";
import type * as ogc_movimientos from "../ogc_movimientos.js";
import type * as pagos from "../pagos.js";
import type * as partida from "../partida.js";
import type * as permissions from "../permissions.js";
import type * as planos from "../planos.js";
import type * as programa_obra from "../programa_obra.js";
import type * as projected_transactions from "../projected_transactions.js";
import type * as proveedores from "../proveedores.js";
import type * as providerUtils from "../providerUtils.js";
import type * as reportGeneration from "../reportGeneration.js";
import type * as reportInsights from "../reportInsights.js";
import type * as reportPdf from "../reportPdf.js";
import type * as reportSnapshot from "../reportSnapshot.js";
import type * as reportTypes from "../reportTypes.js";
import type * as reportes from "../reportes.js";
import type * as reportingUtils from "../reportingUtils.js";
import type * as requisicion_history from "../requisicion_history.js";
import type * as requisiciones from "../requisiciones.js";
import type * as rfis from "../rfis.js";
import type * as sale_chart_configurations from "../sale_chart_configurations.js";
import type * as sales_documentos from "../sales_documentos.js";
import type * as sales_meticas_presupuesto from "../sales_meticas_presupuesto.js";
import type * as sales_pagos from "../sales_pagos.js";
import type * as sales_partidas from "../sales_partidas.js";
import type * as sales_partidas_queries from "../sales_partidas_queries.js";
import type * as sales_partidas_sync from "../sales_partidas_sync.js";
import type * as sales_projected_transactions from "../sales_projected_transactions.js";
import type * as sales_projected_transactions_queries from "../sales_projected_transactions_queries.js";
import type * as sales_projects from "../sales_projects.js";
import type * as sales_projects_migration from "../sales_projects_migration.js";
import type * as sales_transacciones from "../sales_transacciones.js";
import type * as sales_transacciones_queries from "../sales_transacciones_queries.js";
import type * as seed_last_week_payments from "../seed_last_week_payments.js";
import type * as subcontratistas from "../subcontratistas.js";
import type * as sync from "../sync.js";
import type * as tareas from "../tareas.js";
import type * as transacciones from "../transacciones.js";
import type * as users from "../users.js";
import type * as weekly_avance_real from "../weekly_avance_real.js";
import type * as weekly_projected_totals from "../weekly_projected_totals.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  assistant: typeof assistant;
  assistantRules: typeof assistantRules;
  assistantTypes: typeof assistantTypes;
  autorizaciones_obra: typeof autorizaciones_obra;
  bitacora: typeof bitacora;
  chart_configurations: typeof chart_configurations;
  crons: typeof crons;
  currency_helpers: typeof currency_helpers;
  desarrollos: typeof desarrollos;
  documentos: typeof documentos;
  files: typeof files;
  functions: typeof functions;
  imss_siroc: typeof imss_siroc;
  ingresos: typeof ingresos;
  ingresos_documentos: typeof ingresos_documentos;
  laborPaymentImports: typeof laborPaymentImports;
  meticas_presupuesto: typeof meticas_presupuesto;
  migrations: typeof migrations;
  ogc_movimientos: typeof ogc_movimientos;
  pagos: typeof pagos;
  partida: typeof partida;
  permissions: typeof permissions;
  planos: typeof planos;
  programa_obra: typeof programa_obra;
  projected_transactions: typeof projected_transactions;
  proveedores: typeof proveedores;
  providerUtils: typeof providerUtils;
  reportGeneration: typeof reportGeneration;
  reportInsights: typeof reportInsights;
  reportPdf: typeof reportPdf;
  reportSnapshot: typeof reportSnapshot;
  reportTypes: typeof reportTypes;
  reportes: typeof reportes;
  reportingUtils: typeof reportingUtils;
  requisicion_history: typeof requisicion_history;
  requisiciones: typeof requisiciones;
  rfis: typeof rfis;
  sale_chart_configurations: typeof sale_chart_configurations;
  sales_documentos: typeof sales_documentos;
  sales_meticas_presupuesto: typeof sales_meticas_presupuesto;
  sales_pagos: typeof sales_pagos;
  sales_partidas: typeof sales_partidas;
  sales_partidas_queries: typeof sales_partidas_queries;
  sales_partidas_sync: typeof sales_partidas_sync;
  sales_projected_transactions: typeof sales_projected_transactions;
  sales_projected_transactions_queries: typeof sales_projected_transactions_queries;
  sales_projects: typeof sales_projects;
  sales_projects_migration: typeof sales_projects_migration;
  sales_transacciones: typeof sales_transacciones;
  sales_transacciones_queries: typeof sales_transacciones_queries;
  seed_last_week_payments: typeof seed_last_week_payments;
  subcontratistas: typeof subcontratistas;
  sync: typeof sync;
  tareas: typeof tareas;
  transacciones: typeof transacciones;
  users: typeof users;
  weekly_avance_real: typeof weekly_avance_real;
  weekly_projected_totals: typeof weekly_projected_totals;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
