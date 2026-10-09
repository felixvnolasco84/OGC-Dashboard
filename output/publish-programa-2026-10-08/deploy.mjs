import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const stage = path.resolve('output/publish-programa-2026-10-08/source');
const deploymentName = 'animated-walrus-612';
const expectedUrl = `https://${deploymentName}.convex.cloud`;
const sourceEnv = fs.readFileSync(path.join(stage, '.env.local'), 'utf8');
if (!/^CONVEX_DEPLOYMENT=dev:animated-walrus-612(?:\s|$)/m.test(sourceEnv)) throw new Error('Configuración fuera del destino autorizado.');
const { accessToken } = JSON.parse(fs.readFileSync('C:/Users/felix/.convex/config.json', 'utf8'));
const response = await fetch('https://api.convex.dev/api/deployment/authorize_within_current_project', {
  method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ selectedDeploymentName: deploymentName, projectSelection: { kind: 'deploymentName', deploymentName } }),
});
if (!response.ok) throw new Error(`Autorización: HTTP ${response.status}`);
const deployment = await response.json();
if (deployment.url !== expectedUrl || deployment.deploymentName !== deploymentName || deployment.deploymentType !== 'dev' || !deployment.adminKey) throw new Error('Credenciales distintas del destino autorizado.');
try {
  console.log(`Destino validado: ${deploymentName} (${expectedUrl})`);
  const cli = path.resolve('node_modules/convex/bin/main.js');
  const result = spawnSync(process.execPath, [cli, 'dev', '--once', '--typecheck', 'enable', '--url', expectedUrl, '--admin-key', deployment.adminKey, '--env-file', '.env.local'], { cwd: stage, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  fs.writeFileSync(path.join(stage, '.env.local'), sourceEnv);
}
