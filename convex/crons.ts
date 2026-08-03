import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "scan due financial report subscriptions",
  { minutes: 5 },
  internal.reportes.scanDueSubscriptions,
);

export default crons;

