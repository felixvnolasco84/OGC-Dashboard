import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

// New internal functions are absent from generated types until `convex dev` runs once.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const convexInternal = internal as any;

const crons = cronJobs();

crons.interval(
  "scan due financial report subscriptions",
  { minutes: 5 },
  internal.reportes.scanDueSubscriptions,
);

crons.weekly(
  "create weekly organization minutes",
  { dayOfWeek: "monday", hourUTC: 12, minuteUTC: 0 },
  internal.tareas.generateWeeklyMinutes,
  {},
);

// 07:00 America/Mexico_City. Mexico City remains on UTC-6 year-round.
crons.daily(
  "send task due-date notifications",
  { hourUTC: 13, minuteUTC: 0 },
  convexInternal.taskNotifications.scanDueTaskNotifications,
  {},
);

export default crons;
