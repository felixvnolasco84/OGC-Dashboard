import { readFileSync } from "node:fs";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

function readLocalEnv(name) {
  const contents = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  const line = contents
    .split(/\r?\n/)
    .find((candidate) => candidate.startsWith(`${name}=`));
  return line?.slice(name.length + 1).trim();
}

const convexUrl = process.env.CONVEX_URL || readLocalEnv("VITE_CONVEX_URL");
const mockSecret = process.env.TASK_EMAIL_MOCK_SECRET;
const recipient = process.env.TASK_EMAIL_MOCK_RECIPIENT || "felixvnolasco@gmail.com";

if (!convexUrl) throw new Error("Missing CONVEX_URL or VITE_CONVEX_URL");
if (!mockSecret) throw new Error("Missing TASK_EMAIL_MOCK_SECRET in the process environment");

const client = new ConvexHttpClient(convexUrl);
const result = await client.action(api.taskNotifications.sendCommentMockEmails, {
  recipient,
  mockKey: mockSecret,
});

console.log(JSON.stringify(result, null, 2));
if (result.failed > 0 || result.sent !== result.total) {
  process.exitCode = 1;
}
