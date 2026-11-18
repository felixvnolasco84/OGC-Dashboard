import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath} from 'node:url';
const workspace=fileURLToPath(new URL('../../../',import.meta.url));
const root=fileURLToPath(new URL('./',import.meta.url));
export default defineConfig({root,base:'./',publicDir:false,cacheDir:root+'.vite-build',plugins:[react()],resolve:{alias:{'@':workspace+'src'}},build:{outDir:root+'dist',emptyOutDir:false,reportCompressedSize:false,chunkSizeWarningLimit:2000}});
