import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url));
export default defineConfig({root,cacheDir:root+'outputs/auditoria-acciones-2026-11-17/simulador/.vite',plugins:[react()],resolve:{alias:{'@':root+'src'}},server:{host:'127.0.0.1',port:5182,strictPort:true,fs:{strict:true,allow:[root]},watch:{ignored:['**/evidencia/**','**/actuales/**','**/propuestas/**','**/comparativas/**']}},optimizeDeps:{entries:['outputs/auditoria-acciones-2026-11-17/simulador/index.html'],include:['react','react-dom/client','lucide-react','@radix-ui/react-dropdown-menu','@radix-ui/react-dialog']}});

