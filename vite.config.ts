import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { criticalOfflineAssets } from "./scripts/pwa-critical-assets";

const offlineAssets = criticalOfflineAssets();

export default defineConfig({
  plugins: [
    react(),
    offlineAssets.plugin,
    VitePWA({
      registerType: "prompt",
      injectRegister: false,
      includeAssets: ["OGC-LOGO.svg", "logo.png"],
      manifest: {
        name: "OGC Dashboard",
        short_name: "OGC",
        description: "Dashboard de obra con Bitácora offline",
        theme_color: "#111827",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/OGC-LOGO.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        globPatterns: ["index.html", "assets/*.{css,woff2}", "OGC-LOGO.svg", "logo.png"],
        manifestTransforms: [offlineAssets.transform],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.(clerk\.accounts\.dev|clerk\.com|convex\.cloud|convex\.site)\//i,
            handler: "NetworkOnly",
          },
          {
            urlPattern: /\/api\//,
            handler: "NetworkOnly",
          },
          {
            // Hashed optional bundles are immutable. API/auth responses above
            // remain network-only; Bitacora's entire code closure is precached.
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/assets/"),
            handler: "CacheFirst",
            options: {
              cacheName: "ogc-static-assets",
              expiration: { maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60, purgeOnQuotaError: true },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: { manifest: true },
});
