import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';

const dir = path.dirname(fileURLToPath(import.meta.url));
const reportPath = path.join(dir, 'INFORME_PRODUCTO_UX_UI.md');
let markdown = fs.readFileSync(reportPath, 'utf8');
// Map references to the original numbered screenshots, one state per step.
const changes = [
  ['pasos 3 y 13.', 'pasos 3 y 15.'],
  ['pasos 1, 2, 7 y 16.', 'pasos 1, 2, 7 y 19.'],
  ['pasos 2 y 11.', 'pasos 2 y 13.'],
  ['pasos 5 y 17,', 'pasos 5 y 21,'],
  ['pasos 2, 9 y 12.', 'pasos 2, 11 y 14.'],
  ['**Evidencia:** paso 12.', '**Evidencia:** paso 14.'],
  ['pasos 2, 12 y 16.', 'pasos 2, 14 y 19.'],
  ['pasos 1, 8 y 10.', 'pasos 1, 9 y 12.'],
  ['pasos 4, 9, 15 y 17.', 'pasos 4, 10, 20 y 23.'],
  ['pasos 5 y 17.', 'pasos 5 y 21.'],
  ['**Evidencia:** paso 9.', '**Evidencia:** paso 11.'],
  ['**Evidencia:** paso 11.', '**Evidencia:** paso 13.'],
  ['pasos 7, 11 y 18.', 'pasos 7, 13 y 22.'],
  ['**Evidencia:** paso 14. En la primera página de proveedores', '**Evidencia:** paso 16. En la primera página de proveedores'],
  ['pasos 4, 12 y 15.', 'pasos 4, 14 y 17.'],
  ['**Evidencia:** paso 12 y código.', '**Evidencia:** paso 14 y código.'],
  ['**Evidencia:** paso 19 documenta', '**Evidencia:** paso 8 documenta'],
  ['paso 7 del inventario de módulos/archivo 18', 'paso 18'],
  ['**Evidencia:** paso 15. El asistente', '**Evidencia:** paso 17. El asistente'],
  ['pasos 1, 9, 10, 12 y 17.', 'pasos 1, 11, 12, 14 y 21.'],
];
// Replace within individual findings to avoid chained replacements of step numbers.
const pieces = markdown.split(/(?=### \d{2}\. )/);
for (let i = 1; i < pieces.length; i++) {
  const id = Number(pieces[i].slice(4,6));
  const byId = {1:0,2:1,3:2,4:3,7:4,8:5,9:6,10:7,11:8,12:9,15:10,16:10,17:11,18:12,19:13,20:14,22:15,24:16,25:18};
  if (id in byId) { const [from,to] = changes[byId[id]]; pieces[i] = pieces[i].replace(from,to); }
  if (id===14) pieces[i] = pieces[i].replace(...changes[9]);
  if (id===24) pieces[i] = pieces[i].replace(...changes[17]);
}
markdown = pieces.join('').replace(...changes[19]);

const rows = [
 ['Proyectos','Con fricción','Nombre del porcentaje y ancho de tabla; captura 01'],
 ['Presupuesto de Sunrise','Con fricción','Indicadores, jerarquía y periodo; captura 02'],
 ['Control','Bloqueado','Pantalla blanca + timeout; captura 03-control-bloqueado'],
 ['Requisiciones: Por revisar','Con fricción','Vacío con 18 solicitudes existentes; captura 04'],
 ['Requisiciones: Aprobadas','Con fricción','Densidad, importes y pipeline; captura 05'],
 ['Nueva requisición','Con fricción','Formulario vacío, no enviado; captura 06'],
 ['Programa de obra','Funciona, con oportunidades','Gantt, jerarquía e indicadores; captura 07'],
 ['Preparación de Bitácora','Estado transitorio mejorable','Cargó en la visita posterior; captura 08'],
 ['RFIs sin registros','Con fricción','Tabla desborda; no se revisaron RFIs reales; captura 09'],
 ['Planos sin registros','Orientación adecuada','Sin revisión de visor/anotaciones con planos reales; captura 10'],
 ['Documentos del proyecto','Con fricción','Conteos, árbol y controles; captura 11'],
 ['Transacciones del proyecto','Con fricción','Columnas y acciones fuera de vista; captura 12'],
 ['Reportes','Con fricción','Configuración/resumen; sin generación o envío; captura 13'],
 ['Tareas','Con fricción','Prioridad y acceso a registros; captura 14'],
 ['P&L','Bloqueado','Pantalla blanca + timeout; captura 15'],
 ['Proveedores','Con fricción','Muestra del catálogo; duplicados no confirmados; captura 16'],
 ['Asistente','Orientación adecuada, alcance limitado','Sin enviar preguntas; captura 17'],
 ['Bitácora cargada','Funciona, con oportunidades','Agrupación y sincronización visibles; captura 18'],
 ['Presupuesto móvil','Con fricción','Ajusta ancho, resumen empuja registros; captura 19'],
 ['Requisiciones móvil: Por revisar','Con fricción','Vacío y pestañas desplazables; captura 20'],
 ['Requisiciones móvil: Aprobadas','Con fricción','Densidad y longitud de la tarjeta; captura 21'],
 ['Programa móvil','Buena adaptación observada','Lista, estado escrito y avance; captura 22'],
 ['Búsqueda documental sin coincidencias','Con fricción','Mensaje confunde búsqueda con ubicación vacía; captura 23'],
];
const table = '| Paso | Pantalla/estado | Salud general | Evidencia y límite |\n|---|---|---|---|\n' + rows.map((r,i)=>`| ${i+1} | ${r.join(' | ')} |`).join('\n');
markdown = markdown.replace(/\| Paso \| Pantalla\/estado \| Salud general \| Evidencia y límite \|[\s\S]*?(?=\n\n## Galería)/,table);
markdown = markdown.replace('Las capturas se mantienen en su secuencia original de toma; los pasos anteriores agrupan estados relacionados.', 'Las capturas y los pasos se mantienen en la secuencia original de toma; cada paso corresponde a un estado observado.');
markdown = markdown.replace(/(### Captura (\d{2})[^\n]*?) · paso \d+/g,(_,title,num)=>`${title} · paso ${Number(num)}`);
fs.writeFileSync(reportPath, markdown);

const anchors = ['Dictamen','Método y alcance','Prioridad y esfuerzo','Hallazgos y acciones recomendadas','Recorrido numerado y salud general','Galería de evidencia'];
const slug = t=>t.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
let body = marked.parse(markdown);
body = body.replace(/<h([1-4])>([\s\S]*?)<\/h\1>/g,(_,level,txt)=>`<h${level} id="${slug(txt.replace(/<[^>]+>/g,''))}">${txt}</h${level}>`);
let imageCount = 0;
body = body.replace(/<img src="([^\"]+\.png)" alt="([^\"]*)">/g,(_,filename,alt)=>{
  const bytes = fs.readFileSync(path.join(dir,filename)); imageCount++;
  return `<a class="image-link" href="data:image/png;base64,${bytes.toString('base64')}" target="_blank"><img loading="lazy" src="data:image/png;base64,${bytes.toString('base64')}" alt="${alt}" ${filename.includes('movil')?'class="mobile"':''}></a>`;
});
if (imageCount !== 23) throw new Error(`Expected 23 screenshots, got ${imageCount}`);
const html = `<!doctype html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OGC Dashboard · Análisis de producto y UX/UI</title><style>
*{box-sizing:border-box}body{margin:0;background:#f5f5f2;color:#252820;font:16px/1.7 system-ui,sans-serif}nav{position:sticky;top:0;z-index:2;padding:12px 4vw;background:#252820;display:flex;gap:20px;flex-wrap:wrap}nav a{color:#fff;font-size:13px;text-decoration:none}main{max-width:1120px;margin:auto;padding:40px 44px;background:#fff}h1{font-size:38px;line-height:1.15;letter-spacing:-1.1px;max-width:850px}h2{font-size:27px;line-height:1.25;margin-top:54px;padding-top:16px;border-top:1px solid #dfe2d8}h3{font-size:21px;line-height:1.35;margin-top:32px}p{max-width:940px}a{color:#255637}h1,h2,h3{scroll-margin-top:110px}table{border-collapse:collapse;width:100%;font-size:14px;display:block;overflow:auto;margin:24px 0}th,td{padding:12px;text-align:left;vertical-align:top;border:1px solid #dfe2d8}th{background:#eef0e9;line-height:1.4}tr:nth-child(even){background:#f8f9f6}code{background:#f0f1ec;padding:2px 5px;font-size:.88em;overflow-wrap:anywhere}img{max-width:100%;height:auto;display:block;border:1px solid #dfe2d8;margin:18px 0 40px}img.mobile{max-width:390px}.image-link{display:block}li{margin:6px 0}footer{padding:24px;color:#666;font-size:13px;border-top:1px solid #ddd}@media(max-width:600px){main{padding:24px 18px}h1{font-size:29px}nav{position:static;gap:12px}h2{font-size:24px}table{font-size:12px}}@media print{nav{display:none}main{max-width:none;padding:0}body{background:white}img,table{break-inside:avoid}h2,h3{break-after:avoid}}
</style></head><body><nav aria-label="Secciones del informe">${anchors.map(t=>`<a href="#${slug(t)}">${t}</a>`).join('')}</nav><main>${body}<footer>Informe local · 5 de octubre de 2026 · 26 oportunidades · 23 estados documentados. Las imágenes están incluidas en este archivo.</footer></main></body></html>`;
fs.writeFileSync(path.join(dir,'INFORME_PRODUCTO_UX_UI.html'),html);
console.log(JSON.stringify({findings:(markdown.match(/^### \d{2}\./gm)||[]).length,steps:rows.length,screenshots:imageCount,htmlBytes:Buffer.byteLength(html)},null,2));
