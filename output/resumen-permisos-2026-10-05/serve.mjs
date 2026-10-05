import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const folder='output/resumen-permisos-2026-10-05';
const server=await createServer({configFile:false,root,plugins:[react()],resolve:{alias:{'@':`${root}/src`,'convex/react':`${root}/${folder}/convex-stub.ts`}},optimizeDeps:{entries:[`${folder}/preview.html`]},server:{host:'127.0.0.1',port:4199,strictPort:true}});
await server.listen();
console.log('Vista de prueba: http://127.0.0.1:4199/'+folder+'/preview.html');
