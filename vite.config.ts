import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => ({
  define: {
    "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(process.env.VITE_SUPABASE_ANON_KEY || ""),
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(process.env.VITE_SUPABASE_URL || ""),
  },
  server: {
    host: "0.0.0.0",
    port: 5000,
    allowedHosts: true,
    hmr: {
      overlay: false,
    },
    headers: {
      "Cache-Control": "no-store",
    },
    proxy: {
      "/api/frankfurter": {
        target: "https://api.frankfurter.app",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/frankfurter/, ""),
      },
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "script-defer",
      devOptions: {
        // ⚠️ MATIKAN service worker di dev. SW caching bundle Vite yang
        // hash-nya berubah tiap HMR/restart → white-screen karena chunk lama
        // di-serve untuk module yg udah berubah export-nya. SW prod tetap
        // jalan (lihat workbox config di bawah) buat offline support.
        enabled: false,
        type: "module",
        navigateFallback: "index.html",
      },
      includeAssets: ["favicon.ico", "temantiket-pwa-icon.png", "offline.html", "pwa-icon-192.png", "pwa-icon-512.png"],
      manifest: {
        name: "Temantiket - Manajemen Umrah & Haji",
        short_name: "Temantiket",
        version: "2.1.0",
        description: "Aplikasi manajemen trip, jamaah, paket, kalkulasi biaya, dan dokumen untuk Umrah dan Haji.",
        theme_color: "#1a44d4",
        background_color: "#1a44d4",
        display: "standalone",
        display_override: ["fullscreen", "standalone"],
        orientation: "portrait-primary",
        scope: "/",
        start_url: "/?source=pwa",
        lang: "id",
        dir: "ltr",
        id: "temantiket-app",
        categories: ["travel", "business", "productivity"],
        icons: [
          {
            src: "/temantiket-pwa-icon.png",
            sizes: "72x72",
            type: "image/png",
          },
          {
            src: "/temantiket-pwa-icon.png",
            sizes: "96x96",
            type: "image/png",
          },
          {
            src: "/temantiket-pwa-icon.png",
            sizes: "128x128",
            type: "image/png",
          },
          {
            src: "/temantiket-pwa-icon.png",
            sizes: "144x144",
            type: "image/png",
          },
          {
            src: "/temantiket-pwa-icon.png",
            sizes: "152x152",
            type: "image/png",
          },
          {
            // PWA install icon — dedicated file, dipisah dari favicon/branding lain
            src: "/pwa-icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any maskable",
          },
          {
            src: "/temantiket-pwa-icon.png",
            sizes: "384x384",
            type: "image/png",
          },
          {
            // PWA install icon high-res + Android adaptive icon
            src: "/pwa-icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
        shortcuts: [
          {
            name: "Kalkulator Biaya",
            short_name: "Kalkulator",
            description: "Hitung biaya paket Umrah & Haji",
            url: "/calculator?source=pwa",
            icons: [{ src: "/pwa-icon-192.png", sizes: "192x192" }],
          },
          {
            name: "Paket Trip",
            short_name: "Paket",
            description: "Kelola paket perjalanan",
            url: "/packages?source=pwa",
            icons: [{ src: "/pwa-icon-192.png", sizes: "192x192" }],
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2,woff,ttf}"],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.frankfurter\.app\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "exchange-rates-cache",
              expiration: { maxEntries: 5, maxAgeSeconds: 300 },
              networkTimeoutSeconds: 5,
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-stylesheets",
              expiration: { maxEntries: 5, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-webfonts",
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            urlPattern: /^https:\/\/unpkg\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "cdn-cache",
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
          // Supabase REST API — NetworkFirst so offline reads serve last cached payload
          {
            urlPattern: /^https:\/\/[a-z0-9]+\.supabase\.co\/rest\/v1\/.*/i,
            handler: "NetworkFirst",
            method: "GET",
            options: {
              cacheName: "supabase-rest-cache",
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 3 },
              networkTimeoutSeconds: 4,
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // Supabase Storage public/signed asset binaries
          {
            urlPattern: /^https:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/.*/i,
            handler: "CacheFirst",
            method: "GET",
            options: {
              cacheName: "supabase-storage-cache",
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(__dirname, "./src") },
      { find: "@assets", replacement: path.resolve(__dirname, "./attached_assets") },
      { find: /^pdf-lib$/, replacement: path.resolve(__dirname, "node_modules/pdf-lib/dist/pdf-lib.esm.js") },
      { find: /^pdfjs-dist$/, replacement: path.resolve(__dirname, "node_modules/pdfjs-dist/build/pdf.mjs") },

    ],
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
  optimizeDeps: {
    exclude: [
      "@swc/core",
      "@swc/wasm",
    ],
    include: [
      "pdf-lib",
      "@pdf-lib/fontkit",
      "tesseract.js",
      "xlsx",
    ],
    esbuildOptions: {
      conditions: ["browser", "module", "import", "default"],
    },
  },
}));
