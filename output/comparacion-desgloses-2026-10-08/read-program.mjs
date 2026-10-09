import fs from 'node:fs';
import { ConvexHttpClient } from 'convex/browser';

const env = fs.readFileSync('.env.local', 'utf8');
const deploymentName = env.match(/^CONVEX_DEPLOYMENT=\w+:([^\s#]+)/m)?.[1];
if (deploymentName !== 'animated-walrus-612') throw new Error('Despliegue distinto al programa de referencia local.');
const { accessToken } = JSON.parse(fs.readFileSync('C:/Users/felix/.convex/config.json', 'utf8'));
const response = await fetch('https://api.convex.dev/api/deployment/authorize_within_current_project', {
  method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ selectedDeploymentName: deploymentName, projectSelection: { kind: 'deploymentName', deploymentName } }),
});
if (!response.ok) throw new Error(`Autorización: HTTP ${response.status}`);
const deployment = await response.json();
const { actor } = JSON.parse(fs.readFileSync('.migration/larena-indirectos-delete-2026-10-05/before.json', 'utf8'));
const client = new ConvexHttpClient(deployment.url, { logger: false });
client.setAdminAuth(deployment.adminKey, { subject: actor.clerkId, issuer: 'https://convex.test', tokenIdentifier: `https://convex.test|${actor.clerkId}`, email: actor.email, name: actor.name });
const currentUser = await client.query('users:getCurrentUser', {});
if (!currentUser || currentUser.clerkId !== actor.clerkId) throw new Error('No se pudo validar el acceso del usuario.');
const projectIds = ['jh73xarwj1zvgjkp9pff1fh2jd7w7kqb', 'jh7a280xbfnvcamjtg9sweeyjd7w7eez'];
const projects = [];
for (const id of projectIds) {
  const project = await client.query('desarrollos:getById', { id });
  const [details, schedules, history] = await Promise.all([
    client.query('programa_obra:getDetallesByProyecto', { proyecto_id: id }),
    client.query('programa_obra:getSchedulesByProyecto', { proyecto_id: id }),
    client.query('programa_obra:getAvanceHistorialByProyecto', { proyecto_id: id }),
  ]);
  let execution;
  try {
    const result = await client.query('programa_obra:getExecutionProgram', { proyecto: id });
    execution = { events: result.events, revisions: result.revisions, activities: result.activities };
  } catch { execution = { unavailable: true }; }
  projects.push({ id, name: project.nombre, details, schedules, history, execution });
  console.log(JSON.stringify({ project: project.nombre, details: details.length, schedules: schedules.length, history: history.length, revisions: execution.revisions?.length ?? 0 }));
}
fs.writeFileSync(new URL('./program-reference.json', import.meta.url), JSON.stringify({ deployment: deploymentName, readAt: new Date().toISOString(), projects }, null, 2));
