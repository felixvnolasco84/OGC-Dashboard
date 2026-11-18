import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {propuestas} from './simulador/propuestas.mjs';
const root=fileURLToPath(new URL('./',import.meta.url));
const workspace=path.resolve(root,'../..');
export const slug=s=>s.normalize('NFD').replace(/\p{Diacritic}/gu,'').replaceAll('&','y').replace(/[^a-zA-Z0-9]+/g,'_').replace(/^_|_$/g,'');
const enriched=[];const errors=[];
for(const p of propuestas){for(const source of p.sources){try{await fs.access(path.join(workspace,source));}catch{errors.push('Fuente inexistente: '+source);}}if(p.template){const html=await fs.readFile(path.join(root,'evidencia/dom',p.template+'.html'),'utf8');if(html.includes('[Truncated]'))errors.push('HTML incompleto: '+p.template);}
const prefix=`P${p.id}_${slug(p.module)}_${slug(p.page)}_${slug(p.surface)}`;
enriched.push({...p,desktop:`propuestas/${prefix}_Propuesta_Desktop.jpg`,mobile:`propuestas/${prefix}_Propuesta_Movil.jpg`,comparison:`comparativas/${prefix}_Antes_Despues.jpg`});}
await fs.writeFile(path.join(root,'evidencia/propuestas.json'),JSON.stringify(enriched,null,2));
console.log(JSON.stringify({propuestas:enriched.length,templates:new Set(enriched.map(p=>p.template).filter(Boolean)).size,errors},null,2));
if(errors.length)process.exitCode=1;
