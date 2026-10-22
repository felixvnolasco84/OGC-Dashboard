import { httpRouter } from "convex/server";
import { original, preflight } from "./budgetCreationHttp";

const http = httpRouter();
http.route({ path: "/initial-budget/original", method: "OPTIONS", handler: preflight });
http.route({ path: "/initial-budget/original", method: "POST", handler: original });
http.route({ path: "/initial-budget/original", method: "GET", handler: original });
export default http;
