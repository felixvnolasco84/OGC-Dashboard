import fs from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const out = path.join(root, 'outputs/auditoria-acciones-2026-11-17');
await Promise.all(['actuales','propuestas','comparativas','evidencia','simulador'].map(d => fs.mkdir(path.join(out,d),{recursive:true})));
const files = [];
async function walk(dir) { for (const entry of await fs.readdir(dir,{withFileTypes:true})) { const p=path.join(dir,entry.name); if(entry.isDirectory()) await walk(p); else if(/\.tsx$/.test(p)) files.push(p); } }
await walk(path.join(root,'src'));
const inventory=[];
for(const file of files) {
  const text=await fs.readFile(file,'utf8');
  const source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const controls=[];const dialogs=[];const routes=[];
  function visit(node) {
    if(ts.isJsxElement(node)||ts.isJsxSelfClosingElement(node)) {
      const open=ts.isJsxElement(node)?node.openingElement:node;
      const tag=open.tagName.getText(source);
      const line=source.getLineAndCharacterOfPosition(node.getStart(source)).line+1;
      const attrs=Object.fromEntries(open.attributes.properties.filter(ts.isJsxAttribute).map(a=>[a.name.getText(source),a.initializer?.getText(source)??'true']));
      const content=ts.isJsxElement(node)?node.children.map(c=>ts.isJsxText(c)?c.text:ts.isJsxExpression(c)?`{${c.expression?.getText(source)??''}}`:c.getText(source)).join(' ').replace(/\s+/g,' ').slice(0,500):'';
      if(['Button','DropdownMenuItem','DropdownMenuSubTrigger','TabsTrigger','SelectTrigger','button'].includes(tag)) controls.push({tag,line,content,attrs});
      if(['DialogTitle','AlertDialogTitle','SheetTitle','DrawerTitle'].includes(tag)) dialogs.push({tag,line,title:content});
      if(tag==='Route') routes.push({line,attrs,content});
    }
    ts.forEachChild(node,visit);
  }
  visit(source);
  if(controls.length||dialogs.length||routes.length) inventory.push({file:path.relative(root,file).replaceAll('\\','/'),controls,dialogs,routes});
}
await fs.writeFile(path.join(out,'evidencia/inventario-codigo.json'),JSON.stringify(inventory,null,2));
const main=inventory.find(f=>f.file==='src/main.tsx');
await fs.writeFile(path.join(out,'evidencia/rutas.json'),JSON.stringify(main.routes,null,2));
await fs.writeFile(path.join(out,'evidencia/controles-codigo.txt'),inventory.map(f=>`${f.file}\n${f.controls.map(c=>`  L${c.line} ${c.tag}: ${c.content}`).join('\n')}\n${f.dialogs.map(c=>`  L${c.line} ${c.tag}: ${c.title}`).join('\n')}`).join('\n\n'));
console.log(JSON.stringify({files:inventory.length,routes:main.routes.length,controls:inventory.reduce((n,f)=>n+f.controls.length,0),dialogTitles:inventory.reduce((n,f)=>n+f.dialogs.length,0)}));
