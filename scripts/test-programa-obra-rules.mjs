import assert from "node:assert/strict";
import {
  deriveMilestoneStatus,
  getAssistedMatchMode,
  getExpectedMilestoneAmount,
  getMexicoCityDateKey,
  getReminderDays,
  isActionableMilestone,
  parseProgramDateToUtcDay,
  transactionMatchesMilestone,
  validateMilestonePercentage,
  validateReminderDays,
} from "../convex/programaObraMilestoneRules.ts";
import { collectExpandableIds, computeGanttPagination, ROW_CSS_PX } from "../src/pages/Programa Obra/programa-obra-pdf-layout.ts";
import { countDelayedProgramaItems, isProgramaItemDelayed } from "../src/pages/Programa Obra/programa-obra-status.ts";

const delayNow = new Date(2026, 8, 29, 12).getTime();
const activity = (id, finish, level = 0, extra = {}) => ({
  id, level, avanceReal: 25, children: [],
  ...(level === 0 ? { schedule: { fecha_fin: finish } } : { detalleSchedule: { fecha_fin: finish } }),
  ...extra,
});
const lateFamily = activity("family-late", "28/09/2026", 1);
const contextParent = activity("parent-context", "30/09/2026", 0, { children: [lateFamily] });
const lateParent = activity("parent-late", "2026-09-28");
const completeFamily = activity("family-complete", "28/09/2026", 1, { isComplete: true });
assert.equal(isProgramaItemDelayed(contextParent, delayNow), false, "context parents must not inflate the count");
assert.equal(isProgramaItemDelayed(lateFamily, delayNow), true);
assert.equal(countDelayedProgramaItems([contextParent, lateParent, completeFamily], delayNow), 2);
assert.equal(countDelayedProgramaItems([contextParent, lateFamily], delayNow), 1, "count a matching activity once");
assert.equal(isProgramaItemDelayed(activity("due-today", "29/09/2026"), Date.parse("2026-09-30T05:59:59Z")), false, "finish remains valid until the end of the Mexico City day");
assert.equal(isProgramaItemDelayed(activity("due-today", "29/09/2026"), Date.parse("2026-09-30T06:00:00Z")), true);
assert.equal(isProgramaItemDelayed(activity("no-date", undefined), delayNow), false);
assert.equal(isProgramaItemDelayed(activity("invalid-date", "31/02/2026"), delayNow), false);
assert.equal(isProgramaItemDelayed(activity("complete", "28/09/2026", 0, { avanceReal: 100 }), delayNow), false);
assert.equal(isProgramaItemDelayed(activity("exact", "28/09/2026", 0, { avanceReal: 99.99, isComplete: false }), delayNow), true);

assert.equal(getReminderDays("anticipo"), 7);
assert.equal(getReminderDays("suministro"), 14);
assert.equal(getReminderDays("finiquito"), 7);
assert.equal(getReminderDays("anticipo", 120), 90);

assert.equal(parseProgramDateToUtcDay("03/09/2026"), parseProgramDateToUtcDay("2026-09-03"));
assert.equal(parseProgramDateToUtcDay("31/02/2026"), null);
assert.equal(getMexicoCityDateKey(Date.parse("2026-09-04T04:59:00Z")), "2026-09-03");

const base = {
  plannedDate: "10/09/2026",
  reminderDays: 7,
  completed: false,
  evidencePresent: false,
};
assert.equal(deriveMilestoneStatus({ ...base, todayKey: "2026-09-02" }), "scheduled");
assert.equal(deriveMilestoneStatus({ ...base, todayKey: "2026-09-03" }), "upcoming");
assert.equal(deriveMilestoneStatus({ ...base, todayKey: "2026-09-10" }), "due_today");
assert.equal(deriveMilestoneStatus({ ...base, todayKey: "2026-09-11" }), "overdue");
assert.equal(deriveMilestoneStatus({ ...base, todayKey: "2026-09-01", partial: true }), "partial");
assert.equal(deriveMilestoneStatus({ ...base, todayKey: "2026-09-01", reviewRequired: true }), "review_required");
assert.equal(deriveMilestoneStatus({ ...base, todayKey: "2026-09-01", completed: true }), "missing_evidence");
assert.equal(deriveMilestoneStatus({ ...base, todayKey: "2026-09-01", completed: true, evidencePresent: true }), "completed");
assert.equal(isActionableMilestone("completed"), false);
assert.equal(isActionableMilestone("missing_evidence"), true);

assert.equal(getExpectedMilestoneAmount(1_000_000, 20), 200_000);
assert.equal(getExpectedMilestoneAmount(1_000_000), null);
assert.equal(transactionMatchesMilestone("Anticipo", "anticipo"), true);
assert.equal(transactionMatchesMilestone("MATERIAL", "suministro"), true);
assert.equal(transactionMatchesMilestone("estimación", "finiquito"), false);

assert.equal(getAssistedMatchMode({ kind: "anticipo", confirmedCount: 0, exactCount: 1, withinReminderWindow: false }), "automatic");
assert.equal(getAssistedMatchMode({ kind: "anticipo", confirmedCount: 0, exactCount: 2, withinReminderWindow: true }), "review");
assert.equal(getAssistedMatchMode({ kind: "suministro", confirmedCount: 0, exactCount: 1, withinReminderWindow: false }), "automatic");
assert.equal(getAssistedMatchMode({ kind: "suministro", confirmedCount: 0, exactCount: 2, withinReminderWindow: false }), "none");
assert.equal(getAssistedMatchMode({ kind: "suministro", confirmedCount: 0, exactCount: 2, withinReminderWindow: true }), "review");
assert.equal(getAssistedMatchMode({ kind: "finiquito", confirmedCount: 0, exactCount: 0, manualCandidateCount: 1, withinReminderWindow: true }), "review");
assert.equal(getAssistedMatchMode({ kind: "finiquito", confirmedCount: 0, exactCount: 0, manualCandidateCount: 1, withinReminderWindow: false }), "none");
assert.equal(getAssistedMatchMode({ kind: "finiquito", confirmedCount: 1, exactCount: 0, manualCandidateCount: 4, withinReminderWindow: true }), "confirmed");

assert.doesNotThrow(() => validateReminderDays(90));
assert.throws(() => validateReminderDays(91));
assert.doesNotThrow(() => validateMilestonePercentage(0));
assert.throws(() => validateMilestonePercentage(-1));

const expanded = collectExpandableIds([
  { id: "partida-a", children: [{ id: "fam-a1", children: [] }, { id: "fam-a2", children: [{ id: "sub-a2", children: [] }] }] },
  { id: "partida-b", children: [] },
]);
assert.equal(expanded.has("partida-a"), true);
assert.equal(expanded.has("fam-a2"), true);
assert.equal(expanded.has("fam-a1"), false);
assert.equal(expanded.has("partida-b"), false);
assert.equal(expanded.has("sub-a2"), false);

const shortGantt = computeGanttPagination({
  canvasHeight: 2000,
  elementHeight: 1000,
  headerCssH: 44,
  usableHMm: 265,
});
assert.equal(shortGantt.vPages, 1);

const tallGantt = computeGanttPagination({
  canvasHeight: 22000,
  elementHeight: 11000,
  headerCssH: 44,
  usableHMm: 265,
});
assert.ok(tallGantt.vPages > 1, "expanded programs must paginate vertically instead of shrinking unreadably");
assert.equal(tallGantt.bodyCanvasPerPage % (ROW_CSS_PX * 2), 0, "PDF page boundaries must land between full rows");

console.log("Programa de Obra milestone rules: OK");
