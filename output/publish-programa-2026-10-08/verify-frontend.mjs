const root = 'https://ogc-dashboard.vercel.app';
const response = await fetch(`${root}/?publication-check=${Date.now()}`, { headers: { 'Cache-Control': 'no-cache' } });
if (!response.ok) throw new Error(`Sitio: HTTP ${response.status}`);
const html = await response.text();
const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => new URL(match[1], root));
let hasProgressForm = false;
let configuredBackend = false;
for (const script of scripts) {
  const content = await (await fetch(script)).text();
  hasProgressForm ||= ['Avance acumulado (%)', 'Inicio real', 'Avance al día', 'Terminación real'].every((label) => content.includes(label));
  configuredBackend ||= content.includes('https://animated-walrus-612.convex.cloud');
}
console.log(JSON.stringify({ site: root, scripts: scripts.map((url) => url.pathname), hasProgressForm, configuredBackend }));
if (!hasProgressForm || !configuredBackend) process.exitCode = 1;
