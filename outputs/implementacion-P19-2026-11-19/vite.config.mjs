import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";

const root = fileURLToPath(new URL("../../", import.meta.url));
export default {
  root,
  cacheDir: `${root}/node_modules/.cache/p19-tools-dev`,
  optimizeDeps: { entries: ["e2e/indirectos/preview.html"] },
  plugins: [react()],
  resolve: { alias: { "@": `${root}/src`, "convex/react": `${root}/e2e/indirectos/convex-stub.ts` } },
  server: { host: "127.0.0.1", port: 5199, strictPort: true },
};
