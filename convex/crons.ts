import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

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

export default crons;
