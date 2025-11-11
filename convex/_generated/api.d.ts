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
import type * as chart_configurations from "../chart_configurations.js";
import type * as desarrollos from "../desarrollos.js";
import type * as documentos from "../documentos.js";
import type * as functions from "../functions.js";
import type * as meticas_presupuesto from "../meticas_presupuesto.js";
import type * as pagos from "../pagos.js";
import type * as partida from "../partida.js";
import type * as permissions from "../permissions.js";
import type * as projected_transactions from "../projected_transactions.js";
import type * as proveedores from "../proveedores.js";
import type * as sync from "../sync.js";
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
  chart_configurations: typeof chart_configurations;
  desarrollos: typeof desarrollos;
  documentos: typeof documentos;
  functions: typeof functions;
  meticas_presupuesto: typeof meticas_presupuesto;
  pagos: typeof pagos;
  partida: typeof partida;
  permissions: typeof permissions;
  projected_transactions: typeof projected_transactions;
  proveedores: typeof proveedores;
  sync: typeof sync;
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
