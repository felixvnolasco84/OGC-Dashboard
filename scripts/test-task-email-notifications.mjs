import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildTaskEmailMockData,
  getTaskEmailSubject,
  renderTaskEmail,
  TASK_EMAIL_NOTIFICATION_MATRIX,
  TASK_EMAIL_NOTIFICATION_TYPES,
} from "../convex/taskEmailTemplates.ts";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const outputDirectory = path.resolve(scriptDirectory, "../output/task-email-previews");
await mkdir(outputDirectory, { recursive: true });

assert.equal(TASK_EMAIL_NOTIFICATION_TYPES.length, 14, "The useful notification matrix must remain complete");
assert.equal(new Set(TASK_EMAIL_NOTIFICATION_TYPES).size, TASK_EMAIL_NOTIFICATION_TYPES.length, "Notification types must be unique");
assert.deepEqual(
  TASK_EMAIL_NOTIFICATION_MATRIX.map((item) => item.type),
  [...TASK_EMAIL_NOTIFICATION_TYPES],
  "Every notification type needs a template configuration",
);

const previewLinks = [];
for (const [index, type] of TASK_EMAIL_NOTIFICATION_TYPES.entries()) {
  const data = buildTaskEmailMockData(type, {
    current: index + 1,
    total: TASK_EMAIL_NOTIFICATION_TYPES.length,
  }, {
    taskUrl: `http://localhost:5173/tareas?mock=${type}`,
    logoUrl: "../../public/OGC-LOGO.svg",
  });
  const subject = getTaskEmailSubject(data);
  const html = renderTaskEmail(data);

  assert.match(subject, /^\[MOCK \d{2}\/14\]/, `${type}: mock subject must be identifiable`);
  assert.ok(html.includes("#FAFAFA"), `${type}: background color is missing`);
  assert.ok(html.includes("#716F6D"), `${type}: gray text color is missing`);
  assert.ok(html.includes("#1D2436"), `${type}: black text color is missing`);
  assert.ok(html.includes("OGC-LOGO.svg"), `${type}: OGC logo is missing`);
  assert.ok(!html.includes("#50AC66"), `${type}: forbidden green color is present`);
  assert.ok(!html.toLowerCase().includes("brick"), `${type}: legacy Brick branding is present`);
  assert.ok(html.includes("Ver tarea en OGC"), `${type}: call to action is missing`);

  const fileName = `${String(index + 1).padStart(2, "0")}-${type}.html`;
  await writeFile(path.join(outputDirectory, fileName), html, "utf8");
  previewLinks.push(`<li><a href="${fileName}" target="preview">${String(index + 1).padStart(2, "0")} · ${type}</a></li>`);
}

const indexHtml = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>OGC · Plantillas de tareas</title>
<style>body{margin:0;font:14px Arial;color:#1D2436;background:#FAFAFA;display:grid;grid-template-columns:260px 1fr;height:100vh}nav{padding:24px;border-right:1px solid #E5E3E1;overflow:auto}h1{font-size:18px}ul{padding:0;list-style:none}li{margin:7px 0}a{color:#716F6D;text-decoration:none}a:hover{color:#1D2436}iframe{width:100%;height:100%;border:0}</style></head>
<body><nav><h1>Plantillas de tareas</h1><p>14 escenarios</p><ul>${previewLinks.join("")}</ul></nav><iframe name="preview" src="01-assigned.html" title="Vista previa"></iframe></body></html>`;
await writeFile(path.join(outputDirectory, "index.html"), indexHtml, "utf8");

console.log(`Validated ${TASK_EMAIL_NOTIFICATION_TYPES.length} task email templates.`);
console.log(`Preview index: ${path.join(outputDirectory, "index.html")}`);
