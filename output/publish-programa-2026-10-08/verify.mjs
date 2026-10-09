import fs from 'node:fs';
import { ConvexHttpClient } from 'convex/browser';
const deploymentName = 'animated-walrus-612';
const { accessToken } = JSON.parse(fs.readFileSync('C:/Users/felix/.convex/config.json', 'utf8'));
const response = await fetch('https://api.convex.dev/api/deployment/authorize_within_current_project', {
  method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ selectedDeploymentName: deploymentName, projectSelection: { kind: 'deploymentName', deploymentName } }),
});
if (!response.ok) throw new Error(`Autorización: HTTP ${response.status}`);
const deployment = await response.json();
if (deployment.deploymentName !== deploymentName || deployment.url !== `https://${deploymentName}.convex.cloud`) throw new Error('Destino distinto del autorizado.');
const client = new ConvexHttpClient(deployment.url, { logger: false });
client.setAdminAuth(deployment.adminKey);
const spec = await client.query('_system/cli/modules:apiSpec', {});
const entries = spec.filter((entry) => /updateDetalleAvance|updateExecutionProgress|requestExecutionException/.test(JSON.stringify(entry)));
for (const name of ['updateDetalleAvance', 'updateExecutionProgress', 'requestExecutionException']) {
  const match = entries.find((entry) => JSON.stringify(entry).includes(name));
  if (!match || !JSON.stringify(match).includes('actual_start') || !JSON.stringify(match).includes('actual_finish')) throw new Error(`Función pendiente de publicación: ${name}`);
}
console.log(JSON.stringify({ deployment: deploymentName, verified: ['updateDetalleAvance', 'updateExecutionProgress', 'requestExecutionException'], actualDatesArguments: true }));
