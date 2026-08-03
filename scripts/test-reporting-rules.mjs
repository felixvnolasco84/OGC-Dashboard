import assert from "node:assert/strict";
import {
  addIsoDays,
  canClaimReportSubscription,
  calculateApprovedCommitments,
  calculateEarnedValue,
  excelSerialToIsoDate,
  nextRunAt,
  parseProjectDate,
  previousPeriod,
  reportSubscriptionPeriodKey,
  sanitizeReportText,
  shouldAttachReportPdf,
  zonedDateTimeToTimestamp,
} from "../convex/reportingUtils.ts";
import {
  allowedSectionsForRole,
  profileForRole,
} from "../convex/reportTypes.ts";
import {
  canUserAccessDesarrollo,
  canUserReceiveProjectReport,
} from "../convex/permissions.ts";

assert.equal(parseProjectDate("31/12/2025"), "2025-12-31");
assert.equal(parseProjectDate("2026-01-01T17:20:00Z"), "2026-01-01");
assert.equal(parseProjectDate("29/02/2024"), "2024-02-29");
assert.equal(parseProjectDate("29/02/2023"), null);
assert.equal(parseProjectDate("5 de septiembre de 2026"), "2026-09-05");
assert.equal(parseProjectDate("05 Sep 2026"), "2026-09-05");
assert.equal(excelSerialToIsoDate(25569), "1970-01-01");
assert.equal(addIsoDays("2025-12-31", 1), "2026-01-01");
assert.equal(addIsoDays("2024-02-28", 1), "2024-02-29");

const mexicoMonday = zonedDateTimeToTimestamp(
  2026,
  6,
  1,
  8,
  0,
  "America/Mexico_City",
);
assert.deepEqual(
  previousPeriod("weekly", mexicoMonday, "America/Mexico_City"),
  {
    start: "2026-05-25",
    end: "2026-05-31",
    key: "weekly:2026-05-25:2026-05-31",
  },
);
assert.deepEqual(
  previousPeriod(
    "monthly",
    zonedDateTimeToTimestamp(2026, 1, 1, 8, 0, "America/Mexico_City"),
    "America/Mexico_City",
  ),
  {
    start: "2025-12-01",
    end: "2025-12-31",
    key: "monthly:2025-12-01:2025-12-31",
  },
);

const afterDailyRun = zonedDateTimeToTimestamp(
  2026,
  7,
  29,
  8,
  1,
  "America/Mexico_City",
);
assert.equal(
  nextRunAt({
    frequency: "daily",
    timezone: "America/Mexico_City",
    local_hour: 8,
    local_minute: 0,
  }, afterDailyRun),
  zonedDateTimeToTimestamp(2026, 7, 30, 8, 0, "America/Mexico_City"),
);

const earned = calculateEarnedValue({
  approvedBudget: 1_000,
  actualCost: 400,
  physicalProgressPercent: 50,
  plannedProgressPercent: 60,
});
assert.equal(earned.pv, 600);
assert.equal(earned.ev, 500);
assert.equal(earned.ac, 400);
assert.equal(earned.cpi, 1.25);
assert.ok(earned.spi && Math.abs(earned.spi - 5 / 6) < 1e-10);
assert.equal(earned.eac, 800);
assert.equal(earned.etc, 400);
assert.equal(earned.varianceAtCompletion, 200);

assert.equal(calculateApprovedCommitments(
  [
    { id: "approved", status: "En proceso", reviewStatus: "Aprobada" },
    { id: "paid", status: "Pagado", reviewStatus: "Aprobada" },
    { id: "pending", status: "En proceso", reviewStatus: "Pendiente de revisión" },
  ],
  [
    { requisitionId: "approved", amount: 1_200, reviewStatus: "aprobado" },
    { requisitionId: "approved", amount: 800, reviewStatus: "rechazado" },
    { requisitionId: "paid", amount: 4_000, reviewStatus: "aprobado" },
    { requisitionId: "pending", amount: 2_000 },
  ],
), 1_200);

assert.equal(profileForRole("admin"), "full");
assert.equal(profileForRole("finance"), "finance");
assert.equal(profileForRole("contratista"), "contractor");
assert.equal(allowedSectionsForRole("viewer").includes("requisitions"), false);
assert.equal(allowedSectionsForRole("contratista").includes("financial"), false);

const sanitized = sanitizeReportText(
  "Escribe a ana@example.com o +52 55 1234 5678. Cuenta 1234 5678 9012 3456.",
);
assert.equal(sanitized.includes("ana@example.com"), false);
assert.equal(sanitized.includes("55 1234 5678"), false);
assert.equal(sanitized.includes("1234 5678 9012 3456"), false);
assert.match(sanitized, /\[correo\]/);

const projectA = { _id: "project-a", organization_id: "org-a" };
const projectB = { _id: "project-b", organization_id: "org-b" };
const scopedAdmin = {
  role: "admin",
  email: "admin@example.com",
  organization_id: "org-a",
  allowed_desarrollos: [],
};
assert.equal(canUserAccessDesarrollo(scopedAdmin, projectA), true);
assert.equal(canUserAccessDesarrollo(scopedAdmin, projectB), false);
assert.equal(canUserAccessDesarrollo(
  { ...scopedAdmin, allowed_desarrollos: ["project-b"] },
  projectB,
), true);
assert.equal(canUserAccessDesarrollo({
  role: "viewer",
  email: "viewer@example.com",
  allowed_desarrollos: ["project-a"],
}, projectA), true);
assert.equal(canUserAccessDesarrollo({
  role: "viewer",
  email: "viewer@example.com",
  allowed_desarrollos: [],
}, projectA), false);
assert.equal(canUserAccessDesarrollo({
  role: "user",
  email: "ops@ogc.mx",
  allowed_desarrollos: [],
}, projectB), true);
assert.equal(canUserReceiveProjectReport({
  role: "viewer",
  email: "pending@example.com",
  invitation_status: "pending",
  allowed_desarrollos: ["project-a"],
}, projectA), false);
assert.equal(canUserReceiveProjectReport({
  role: "viewer",
  email: "",
  allowed_desarrollos: ["project-a"],
}, projectA), false);

assert.equal(canClaimReportSubscription(undefined, 1_000), true);
assert.equal(canClaimReportSubscription(999, 1_000), true);
assert.equal(canClaimReportSubscription(1_001, 1_000), false);
assert.equal(
  reportSubscriptionPeriodKey("subscription-1", "weekly:2026-01-01:2026-01-07"),
  "subscription-1:weekly:2026-01-01:2026-01-07",
);
assert.equal(shouldAttachReportPdf(25 * 1024 * 1024 - 1), true);
assert.equal(shouldAttachReportPdf(25 * 1024 * 1024), false);

console.log(
  "Reporting rules passed: mixed dates, leap years, timezone periods, scheduling, earned value, and sanitization.",
);
