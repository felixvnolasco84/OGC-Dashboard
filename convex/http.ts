import { httpRouter } from "convex/server";
import { original, preflight } from "./budgetCreationHttp";
import { claim, events } from "./whatsappHttp";

const http = httpRouter();
http.route({ path: "/integrations/whatsapp/claim", method: "POST", handler: claim });
http.route({ path: "/integrations/whatsapp/events", method: "POST", handler: events });
http.route({ path: "/initial-budget/original", method: "OPTIONS", handler: preflight });
http.route({ path: "/initial-budget/original", method: "POST", handler: original });
http.route({ path: "/initial-budget/original", method: "GET", handler: original });
export default http;
