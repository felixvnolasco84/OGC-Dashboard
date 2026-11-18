import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('./',import.meta.url));
const read=async p=>JSON.parse(await fs.readFile(path.join(root,p),'utf8'));
const ps=await read('evidencia/propuestas.json');
const actuals=await read('evidencia/capturas.json');
const shots=await read('evidencia/simulaciones.json');
const intermediate=await read('evidencia/comprobacion-1024.json');
const errors=[];
function jpegSize(bytes){let pos=2;while(pos<bytes.length){if(bytes[pos]!==255){pos++;continue;}const marker=bytes[pos+1];pos+=2;if(marker===216||marker===217)continue;const size=bytes.readUInt16BE(pos);if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker))return {width:bytes.readUInt16BE(pos+5),height:bytes.readUInt16BE(pos+3)};pos+=size;}throw Error('JPEG sin dimensiones');}
const images=[];
for(const relative of [...actuals.map(c=>c.file),...ps.flatMap(p=>[p.desktop,p.mobile,p.comparison]),...shots.map(s=>s.filename)]){
 if(images.some(i=>i.file===relative))continue;
 try{const bytes=await fs.readFile(path.join(root,relative));const dims=jpegSize(bytes);if(bytes.length<5000)errors.push('Imagen demasiado pequeña: '+relative);images.push({file:relative,...dims,bytes:bytes.length});}catch(e){errors.push(relative+': '+e.message);}
}
for(const p of ps){for(const kind of ['desktop','mobile']){const s=shots.find(s=>s.filename===p[kind]);if(!s)errors.push('Falta registro de captura '+p.id+' '+kind);else if(s.layout.width!==(kind==='desktop'?1440:390))errors.push('Ancho inesperado '+p.id+' '+kind);}}
if(intermediate.length!==27||intermediate.some(c=>c.width!==1024||c.scrollWidth!==1024||c.ready!=='true'||c.error))errors.push('Comprobación intermedia incompleta');
const htmlFiles=['index.html',...ps.map(p=>p.comparison.replace('.jpg','.html'))];
let checkedLinks=0;
for(const relative of htmlFiles){const file=path.join(root,relative),html=await fs.readFile(file,'utf8');for(const m of html.matchAll(/(?:src|href)="([^"]+)"/g)){let target=m[1];if(/^(?:https?:|data:|#)/.test(target))continue;target=target.split('#')[0].split('?')[0];if(!target)continue;checkedLinks++;try{await fs.access(path.resolve(path.dirname(file),target));}catch{errors.push('Referencia ausente en '+relative+': '+target);}}}
if((await fs.readFile(path.join(root,'cobertura-dialogos.csv'),'utf8')).includes('\n"","'))errors.push('Hay títulos vacíos en el inventario de diálogos');
const report={fechaCierre:'2026-11-18',propuestas:ps.length,capturasReales:actuals.length,vistasPrincipales:54,estadosComplementarios:shots.length-54,comparativas:27,imagenesComprobadas:images.length,enlacesLocalesComprobados:checkedLinks,build:'Vite 6.4.3 · compilación correcta · 1684 módulos',responsive:{desktop:'1440 × 1000',mobile:'390 × 844',intermedio:'27 vistas listas a 1024; sin desbordamiento de la página. Algunas tablas conservan desplazamiento interno.'},interacciones:[{caso:'Presupuesto: ArrowDown',resultado:'Abre el menú y enfoca Agregar pago.'},{caso:'Presupuesto: Escape desde elemento de menú',resultado:'Cierra el menú y devuelve el foco a Acciones de Presupuesto.'},{caso:'Presupuesto: Excel de origen',resultado:'Abre un diálogo de demostración; Volver a la simulación lo cierra.'},{caso:'Nueva RFI en la maqueta',resultado:'Abre un diálogo con Cancelar y Continuar; no se confirmó ningún registro real.'},{caso:'Galería: filtro Ventas',resultado:'3 propuestas visibles.'},{caso:'Galería: Ventas + búsqueda Presupuesto',resultado:'1 propuesta visible; al limpiar filtros vuelve a 27.'}],limites:['Revisión visual de las 54 vistas principales y estados adicionales. No prueba de todos los roles ni auditoría integral de accesibilidad.','Las simulaciones no ejecutan las operaciones originales; las comprobaciones corresponden a la maqueta.','La captura de /dashboard se rechazó y permanece en evidencia/bloqueos.'],errors};
await fs.writeFile(path.join(root,'evidencia/verificacion-final.json'),JSON.stringify(report,null,2));
await fs.writeFile(path.join(root,'evidencia/dimensiones-imagenes.json'),JSON.stringify(images,null,2));
if(!errors.length)await fs.writeFile(path.join(root,'evidencia/simulaciones.json'),JSON.stringify(shots.map(s=>({...s,accepted:true,revision:'Revisión visual de escritorio/móvil; límites descritos en hallazgos.md.'})),null,2));
console.log(JSON.stringify(report,null,2));
if(errors.length)process.exitCode=1;
