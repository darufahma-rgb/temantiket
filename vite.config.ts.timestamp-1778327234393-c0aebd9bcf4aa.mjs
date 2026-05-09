// vite.config.ts
import { defineConfig } from "file:///home/runner/workspace/node_modules/vite/dist/node/index.js";
import react from "file:///home/runner/workspace/node_modules/@vitejs/plugin-react-swc/index.js";
import path from "path";
import { VitePWA } from "file:///home/runner/workspace/node_modules/vite-plugin-pwa/dist/index.js";
var __vite_injected_original_dirname = "/home/runner/workspace";
var vite_config_default = defineConfig(({ mode }) => ({
  define: {
    "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(process.env.VITE_SUPABASE_ANON_KEY || ""),
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(process.env.VITE_SUPABASE_URL || "")
  },
  server: {
    host: "0.0.0.0",
    port: 5e3,
    allowedHosts: true,
    hmr: {
      overlay: false
    },
    headers: {
      "Cache-Control": "no-store"
    },
    proxy: {
      "/api/frankfurter": {
        target: "https://api.frankfurter.app",
        changeOrigin: true,
        rewrite: (path2) => path2.replace(/^\/api\/frankfurter/, "")
      },
      "/api/ocr-passport": {
        target: "http://localhost:3001",
        changeOrigin: true
      },
      "/api/invite-member": {
        target: "http://localhost:3001",
        changeOrigin: true
      },
      "/api/remove-member": {
        target: "http://localhost:3001",
        changeOrigin: true
      },
      "/api/bootstrap": {
        target: "http://localhost:3001",
        changeOrigin: true
      },
      "/api/ai": {
        target: "http://localhost:3001",
        changeOrigin: true
      },
      "/api/export": {
        target: "http://localhost:3001",
        changeOrigin: true
      },
      "/api/award-commission-points": {
        target: "http://localhost:3001",
        changeOrigin: true
      }
    }
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
        navigateFallback: "index.html"
      },
      includeAssets: ["favicon.ico", "temantiket-pwa-icon.png", "offline.html"],
      manifest: {
        name: "Temantiket - Manajemen Umrah & Haji",
        short_name: "Temantiket",
        description: "Aplikasi manajemen trip, jamaah, paket, kalkulasi biaya, dan dokumen untuk Umrah dan Haji.",
        theme_color: "#0ea5e9",
        background_color: "#f0f9ff",
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
            type: "image/png"
          },
          {
            src: "/temantiket-pwa-icon.png",
            sizes: "96x96",
            type: "image/png"
          },
          {
            src: "/temantiket-pwa-icon.png",
            sizes: "128x128",
            type: "image/png"
          },
          {
            src: "/temantiket-pwa-icon.png",
            sizes: "144x144",
            type: "image/png"
          },
          {
            src: "/temantiket-pwa-icon.png",
            sizes: "152x152",
            type: "image/png"
          },
          {
            src: "/temantiket-pwa-icon.png",
            sizes: "192x192",
            type: "image/png"
          },
          {
            src: "/temantiket-pwa-icon.png",
            sizes: "384x384",
            type: "image/png"
          },
          {
            src: "/temantiket-pwa-icon.png",
            sizes: "512x512",
            type: "image/png"
          },
          {
            src: "/temantiket-pwa-icon.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable"
          }
        ],
        shortcuts: [
          {
            name: "Kalkulator Biaya",
            short_name: "Kalkulator",
            description: "Hitung biaya paket Umrah & Haji",
            url: "/calculator?source=pwa",
            icons: [{ src: "/temantiket-pwa-icon.png", sizes: "96x96" }]
          },
          {
            name: "Paket Trip",
            short_name: "Paket",
            description: "Kelola paket perjalanan",
            url: "/packages?source=pwa",
            icons: [{ src: "/temantiket-pwa-icon.png", sizes: "96x96" }]
          }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2,woff,ttf}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
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
              networkTimeoutSeconds: 5
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-stylesheets",
              expiration: { maxEntries: 5, maxAgeSeconds: 60 * 60 * 24 * 365 }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-webfonts",
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 }
            }
          },
          {
            urlPattern: /^https:\/\/unpkg\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "cdn-cache",
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 7 }
            }
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
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          // Supabase Storage public/signed asset binaries
          {
            urlPattern: /^https:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/.*/i,
            handler: "CacheFirst",
            method: "GET",
            options: {
              cacheName: "supabase-storage-cache",
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      "@": path.resolve(__vite_injected_original_dirname, "./src"),
      "@assets": path.resolve(__vite_injected_original_dirname, "./attached_assets")
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"]
  },
  optimizeDeps: {
    exclude: ["@swc/core", "@swc/wasm"]
  }
}));
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvaG9tZS9ydW5uZXIvd29ya3NwYWNlXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCIvaG9tZS9ydW5uZXIvd29ya3NwYWNlL3ZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9ob21lL3J1bm5lci93b3Jrc3BhY2Uvdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tIFwidml0ZVwiO1xuaW1wb3J0IHJlYWN0IGZyb20gXCJAdml0ZWpzL3BsdWdpbi1yZWFjdC1zd2NcIjtcbmltcG9ydCBwYXRoIGZyb20gXCJwYXRoXCI7XG5pbXBvcnQgeyBWaXRlUFdBIH0gZnJvbSBcInZpdGUtcGx1Z2luLXB3YVwiO1xuXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoKHsgbW9kZSB9KSA9PiAoe1xuICBkZWZpbmU6IHtcbiAgICBcImltcG9ydC5tZXRhLmVudi5WSVRFX1NVUEFCQVNFX0FOT05fS0VZXCI6IEpTT04uc3RyaW5naWZ5KHByb2Nlc3MuZW52LlZJVEVfU1VQQUJBU0VfQU5PTl9LRVkgfHwgXCJcIiksXG4gICAgXCJpbXBvcnQubWV0YS5lbnYuVklURV9TVVBBQkFTRV9VUkxcIjogSlNPTi5zdHJpbmdpZnkocHJvY2Vzcy5lbnYuVklURV9TVVBBQkFTRV9VUkwgfHwgXCJcIiksXG4gIH0sXG4gIHNlcnZlcjoge1xuICAgIGhvc3Q6IFwiMC4wLjAuMFwiLFxuICAgIHBvcnQ6IDUwMDAsXG4gICAgYWxsb3dlZEhvc3RzOiB0cnVlLFxuICAgIGhtcjoge1xuICAgICAgb3ZlcmxheTogZmFsc2UsXG4gICAgfSxcbiAgICBoZWFkZXJzOiB7XG4gICAgICBcIkNhY2hlLUNvbnRyb2xcIjogXCJuby1zdG9yZVwiLFxuICAgIH0sXG4gICAgcHJveHk6IHtcbiAgICAgIFwiL2FwaS9mcmFua2Z1cnRlclwiOiB7XG4gICAgICAgIHRhcmdldDogXCJodHRwczovL2FwaS5mcmFua2Z1cnRlci5hcHBcIixcbiAgICAgICAgY2hhbmdlT3JpZ2luOiB0cnVlLFxuICAgICAgICByZXdyaXRlOiAocGF0aCkgPT4gcGF0aC5yZXBsYWNlKC9eXFwvYXBpXFwvZnJhbmtmdXJ0ZXIvLCBcIlwiKSxcbiAgICAgIH0sXG4gICAgICBcIi9hcGkvb2NyLXBhc3Nwb3J0XCI6IHtcbiAgICAgICAgdGFyZ2V0OiBcImh0dHA6Ly9sb2NhbGhvc3Q6MzAwMVwiLFxuICAgICAgICBjaGFuZ2VPcmlnaW46IHRydWUsXG4gICAgICB9LFxuICAgICAgXCIvYXBpL2ludml0ZS1tZW1iZXJcIjoge1xuICAgICAgICB0YXJnZXQ6IFwiaHR0cDovL2xvY2FsaG9zdDozMDAxXCIsXG4gICAgICAgIGNoYW5nZU9yaWdpbjogdHJ1ZSxcbiAgICAgIH0sXG4gICAgICBcIi9hcGkvcmVtb3ZlLW1lbWJlclwiOiB7XG4gICAgICAgIHRhcmdldDogXCJodHRwOi8vbG9jYWxob3N0OjMwMDFcIixcbiAgICAgICAgY2hhbmdlT3JpZ2luOiB0cnVlLFxuICAgICAgfSxcbiAgICAgIFwiL2FwaS9ib290c3RyYXBcIjoge1xuICAgICAgICB0YXJnZXQ6IFwiaHR0cDovL2xvY2FsaG9zdDozMDAxXCIsXG4gICAgICAgIGNoYW5nZU9yaWdpbjogdHJ1ZSxcbiAgICAgIH0sXG4gICAgICBcIi9hcGkvYWlcIjoge1xuICAgICAgICB0YXJnZXQ6IFwiaHR0cDovL2xvY2FsaG9zdDozMDAxXCIsXG4gICAgICAgIGNoYW5nZU9yaWdpbjogdHJ1ZSxcbiAgICAgIH0sXG4gICAgICBcIi9hcGkvZXhwb3J0XCI6IHtcbiAgICAgICAgdGFyZ2V0OiBcImh0dHA6Ly9sb2NhbGhvc3Q6MzAwMVwiLFxuICAgICAgICBjaGFuZ2VPcmlnaW46IHRydWUsXG4gICAgICB9LFxuICAgICAgXCIvYXBpL2F3YXJkLWNvbW1pc3Npb24tcG9pbnRzXCI6IHtcbiAgICAgICAgdGFyZ2V0OiBcImh0dHA6Ly9sb2NhbGhvc3Q6MzAwMVwiLFxuICAgICAgICBjaGFuZ2VPcmlnaW46IHRydWUsXG4gICAgICB9LFxuICAgIH0sXG4gIH0sXG4gIHBsdWdpbnM6IFtcbiAgICByZWFjdCgpLFxuICAgIFZpdGVQV0Eoe1xuICAgICAgcmVnaXN0ZXJUeXBlOiBcImF1dG9VcGRhdGVcIixcbiAgICAgIGluamVjdFJlZ2lzdGVyOiBcInNjcmlwdC1kZWZlclwiLFxuICAgICAgZGV2T3B0aW9uczoge1xuICAgICAgICAvLyBcdTI2QTBcdUZFMEYgTUFUSUtBTiBzZXJ2aWNlIHdvcmtlciBkaSBkZXYuIFNXIGNhY2hpbmcgYnVuZGxlIFZpdGUgeWFuZ1xuICAgICAgICAvLyBoYXNoLW55YSBiZXJ1YmFoIHRpYXAgSE1SL3Jlc3RhcnQgXHUyMTkyIHdoaXRlLXNjcmVlbiBrYXJlbmEgY2h1bmsgbGFtYVxuICAgICAgICAvLyBkaS1zZXJ2ZSB1bnR1ayBtb2R1bGUgeWcgdWRhaCBiZXJ1YmFoIGV4cG9ydC1ueWEuIFNXIHByb2QgdGV0YXBcbiAgICAgICAgLy8gamFsYW4gKGxpaGF0IHdvcmtib3ggY29uZmlnIGRpIGJhd2FoKSBidWF0IG9mZmxpbmUgc3VwcG9ydC5cbiAgICAgICAgZW5hYmxlZDogZmFsc2UsXG4gICAgICAgIHR5cGU6IFwibW9kdWxlXCIsXG4gICAgICAgIG5hdmlnYXRlRmFsbGJhY2s6IFwiaW5kZXguaHRtbFwiLFxuICAgICAgfSxcbiAgICAgIGluY2x1ZGVBc3NldHM6IFtcImZhdmljb24uaWNvXCIsIFwidGVtYW50aWtldC1wd2EtaWNvbi5wbmdcIiwgXCJvZmZsaW5lLmh0bWxcIl0sXG4gICAgICBtYW5pZmVzdDoge1xuICAgICAgICBuYW1lOiBcIlRlbWFudGlrZXQgLSBNYW5hamVtZW4gVW1yYWggJiBIYWppXCIsXG4gICAgICAgIHNob3J0X25hbWU6IFwiVGVtYW50aWtldFwiLFxuICAgICAgICBkZXNjcmlwdGlvbjogXCJBcGxpa2FzaSBtYW5hamVtZW4gdHJpcCwgamFtYWFoLCBwYWtldCwga2Fsa3VsYXNpIGJpYXlhLCBkYW4gZG9rdW1lbiB1bnR1ayBVbXJhaCBkYW4gSGFqaS5cIixcbiAgICAgICAgdGhlbWVfY29sb3I6IFwiIzBlYTVlOVwiLFxuICAgICAgICBiYWNrZ3JvdW5kX2NvbG9yOiBcIiNmMGY5ZmZcIixcbiAgICAgICAgZGlzcGxheTogXCJzdGFuZGFsb25lXCIsXG4gICAgICAgIGRpc3BsYXlfb3ZlcnJpZGU6IFtcImZ1bGxzY3JlZW5cIiwgXCJzdGFuZGFsb25lXCJdLFxuICAgICAgICBvcmllbnRhdGlvbjogXCJwb3J0cmFpdC1wcmltYXJ5XCIsXG4gICAgICAgIHNjb3BlOiBcIi9cIixcbiAgICAgICAgc3RhcnRfdXJsOiBcIi8/c291cmNlPXB3YVwiLFxuICAgICAgICBsYW5nOiBcImlkXCIsXG4gICAgICAgIGRpcjogXCJsdHJcIixcbiAgICAgICAgaWQ6IFwidGVtYW50aWtldC1hcHBcIixcbiAgICAgICAgY2F0ZWdvcmllczogW1widHJhdmVsXCIsIFwiYnVzaW5lc3NcIiwgXCJwcm9kdWN0aXZpdHlcIl0sXG4gICAgICAgIGljb25zOiBbXG4gICAgICAgICAge1xuICAgICAgICAgICAgc3JjOiBcIi90ZW1hbnRpa2V0LXB3YS1pY29uLnBuZ1wiLFxuICAgICAgICAgICAgc2l6ZXM6IFwiNzJ4NzJcIixcbiAgICAgICAgICAgIHR5cGU6IFwiaW1hZ2UvcG5nXCIsXG4gICAgICAgICAgfSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICBzcmM6IFwiL3RlbWFudGlrZXQtcHdhLWljb24ucG5nXCIsXG4gICAgICAgICAgICBzaXplczogXCI5Nng5NlwiLFxuICAgICAgICAgICAgdHlwZTogXCJpbWFnZS9wbmdcIixcbiAgICAgICAgICB9LFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIHNyYzogXCIvdGVtYW50aWtldC1wd2EtaWNvbi5wbmdcIixcbiAgICAgICAgICAgIHNpemVzOiBcIjEyOHgxMjhcIixcbiAgICAgICAgICAgIHR5cGU6IFwiaW1hZ2UvcG5nXCIsXG4gICAgICAgICAgfSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICBzcmM6IFwiL3RlbWFudGlrZXQtcHdhLWljb24ucG5nXCIsXG4gICAgICAgICAgICBzaXplczogXCIxNDR4MTQ0XCIsXG4gICAgICAgICAgICB0eXBlOiBcImltYWdlL3BuZ1wiLFxuICAgICAgICAgIH0sXG4gICAgICAgICAge1xuICAgICAgICAgICAgc3JjOiBcIi90ZW1hbnRpa2V0LXB3YS1pY29uLnBuZ1wiLFxuICAgICAgICAgICAgc2l6ZXM6IFwiMTUyeDE1MlwiLFxuICAgICAgICAgICAgdHlwZTogXCJpbWFnZS9wbmdcIixcbiAgICAgICAgICB9LFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIHNyYzogXCIvdGVtYW50aWtldC1wd2EtaWNvbi5wbmdcIixcbiAgICAgICAgICAgIHNpemVzOiBcIjE5MngxOTJcIixcbiAgICAgICAgICAgIHR5cGU6IFwiaW1hZ2UvcG5nXCIsXG4gICAgICAgICAgfSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICBzcmM6IFwiL3RlbWFudGlrZXQtcHdhLWljb24ucG5nXCIsXG4gICAgICAgICAgICBzaXplczogXCIzODR4Mzg0XCIsXG4gICAgICAgICAgICB0eXBlOiBcImltYWdlL3BuZ1wiLFxuICAgICAgICAgIH0sXG4gICAgICAgICAge1xuICAgICAgICAgICAgc3JjOiBcIi90ZW1hbnRpa2V0LXB3YS1pY29uLnBuZ1wiLFxuICAgICAgICAgICAgc2l6ZXM6IFwiNTEyeDUxMlwiLFxuICAgICAgICAgICAgdHlwZTogXCJpbWFnZS9wbmdcIixcbiAgICAgICAgICB9LFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIHNyYzogXCIvdGVtYW50aWtldC1wd2EtaWNvbi5wbmdcIixcbiAgICAgICAgICAgIHNpemVzOiBcIjUxMng1MTJcIixcbiAgICAgICAgICAgIHR5cGU6IFwiaW1hZ2UvcG5nXCIsXG4gICAgICAgICAgICBwdXJwb3NlOiBcIm1hc2thYmxlXCIsXG4gICAgICAgICAgfSxcbiAgICAgICAgXSxcbiAgICAgICAgc2hvcnRjdXRzOiBbXG4gICAgICAgICAge1xuICAgICAgICAgICAgbmFtZTogXCJLYWxrdWxhdG9yIEJpYXlhXCIsXG4gICAgICAgICAgICBzaG9ydF9uYW1lOiBcIkthbGt1bGF0b3JcIixcbiAgICAgICAgICAgIGRlc2NyaXB0aW9uOiBcIkhpdHVuZyBiaWF5YSBwYWtldCBVbXJhaCAmIEhhamlcIixcbiAgICAgICAgICAgIHVybDogXCIvY2FsY3VsYXRvcj9zb3VyY2U9cHdhXCIsXG4gICAgICAgICAgICBpY29uczogW3sgc3JjOiBcIi90ZW1hbnRpa2V0LXB3YS1pY29uLnBuZ1wiLCBzaXplczogXCI5Nng5NlwiIH1dLFxuICAgICAgICAgIH0sXG4gICAgICAgICAge1xuICAgICAgICAgICAgbmFtZTogXCJQYWtldCBUcmlwXCIsXG4gICAgICAgICAgICBzaG9ydF9uYW1lOiBcIlBha2V0XCIsXG4gICAgICAgICAgICBkZXNjcmlwdGlvbjogXCJLZWxvbGEgcGFrZXQgcGVyamFsYW5hblwiLFxuICAgICAgICAgICAgdXJsOiBcIi9wYWNrYWdlcz9zb3VyY2U9cHdhXCIsXG4gICAgICAgICAgICBpY29uczogW3sgc3JjOiBcIi90ZW1hbnRpa2V0LXB3YS1pY29uLnBuZ1wiLCBzaXplczogXCI5Nng5NlwiIH1dLFxuICAgICAgICAgIH0sXG4gICAgICAgIF0sXG4gICAgICB9LFxuICAgICAgd29ya2JveDoge1xuICAgICAgICBnbG9iUGF0dGVybnM6IFtcIioqLyoue2pzLGNzcyxodG1sLGljbyxwbmcsc3ZnLHdvZmYyLHdvZmYsdHRmfVwiXSxcbiAgICAgICAgbWF4aW11bUZpbGVTaXplVG9DYWNoZUluQnl0ZXM6IDUgKiAxMDI0ICogMTAyNCxcbiAgICAgICAgY2xlYW51cE91dGRhdGVkQ2FjaGVzOiB0cnVlLFxuICAgICAgICBza2lwV2FpdGluZzogdHJ1ZSxcbiAgICAgICAgY2xpZW50c0NsYWltOiB0cnVlLFxuICAgICAgICBuYXZpZ2F0ZUZhbGxiYWNrOiBcImluZGV4Lmh0bWxcIixcbiAgICAgICAgbmF2aWdhdGVGYWxsYmFja0RlbnlsaXN0OiBbL15cXC9hcGlcXC8vXSxcbiAgICAgICAgcnVudGltZUNhY2hpbmc6IFtcbiAgICAgICAgICB7XG4gICAgICAgICAgICB1cmxQYXR0ZXJuOiAvXmh0dHBzOlxcL1xcL2FwaVxcLmZyYW5rZnVydGVyXFwuYXBwXFwvLiovaSxcbiAgICAgICAgICAgIGhhbmRsZXI6IFwiTmV0d29ya0ZpcnN0XCIsXG4gICAgICAgICAgICBvcHRpb25zOiB7XG4gICAgICAgICAgICAgIGNhY2hlTmFtZTogXCJleGNoYW5nZS1yYXRlcy1jYWNoZVwiLFxuICAgICAgICAgICAgICBleHBpcmF0aW9uOiB7IG1heEVudHJpZXM6IDUsIG1heEFnZVNlY29uZHM6IDMwMCB9LFxuICAgICAgICAgICAgICBuZXR3b3JrVGltZW91dFNlY29uZHM6IDUsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgICAge1xuICAgICAgICAgICAgdXJsUGF0dGVybjogL15odHRwczpcXC9cXC9mb250c1xcLmdvb2dsZWFwaXNcXC5jb21cXC8uKi9pLFxuICAgICAgICAgICAgaGFuZGxlcjogXCJDYWNoZUZpcnN0XCIsXG4gICAgICAgICAgICBvcHRpb25zOiB7XG4gICAgICAgICAgICAgIGNhY2hlTmFtZTogXCJnb29nbGUtZm9udHMtc3R5bGVzaGVldHNcIixcbiAgICAgICAgICAgICAgZXhwaXJhdGlvbjogeyBtYXhFbnRyaWVzOiA1LCBtYXhBZ2VTZWNvbmRzOiA2MCAqIDYwICogMjQgKiAzNjUgfSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICB1cmxQYXR0ZXJuOiAvXmh0dHBzOlxcL1xcL2ZvbnRzXFwuZ3N0YXRpY1xcLmNvbVxcLy4qL2ksXG4gICAgICAgICAgICBoYW5kbGVyOiBcIkNhY2hlRmlyc3RcIixcbiAgICAgICAgICAgIG9wdGlvbnM6IHtcbiAgICAgICAgICAgICAgY2FjaGVOYW1lOiBcImdvb2dsZS1mb250cy13ZWJmb250c1wiLFxuICAgICAgICAgICAgICBleHBpcmF0aW9uOiB7IG1heEVudHJpZXM6IDMwLCBtYXhBZ2VTZWNvbmRzOiA2MCAqIDYwICogMjQgKiAzNjUgfSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICB1cmxQYXR0ZXJuOiAvXmh0dHBzOlxcL1xcL3VucGtnXFwuY29tXFwvLiovaSxcbiAgICAgICAgICAgIGhhbmRsZXI6IFwiQ2FjaGVGaXJzdFwiLFxuICAgICAgICAgICAgb3B0aW9uczoge1xuICAgICAgICAgICAgICBjYWNoZU5hbWU6IFwiY2RuLWNhY2hlXCIsXG4gICAgICAgICAgICAgIGV4cGlyYXRpb246IHsgbWF4RW50cmllczogMjAsIG1heEFnZVNlY29uZHM6IDYwICogNjAgKiAyNCAqIDcgfSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgICAvLyBTdXBhYmFzZSBSRVNUIEFQSSBcdTIwMTQgTmV0d29ya0ZpcnN0IHNvIG9mZmxpbmUgcmVhZHMgc2VydmUgbGFzdCBjYWNoZWQgcGF5bG9hZFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIHVybFBhdHRlcm46IC9eaHR0cHM6XFwvXFwvW2EtejAtOV0rXFwuc3VwYWJhc2VcXC5jb1xcL3Jlc3RcXC92MVxcLy4qL2ksXG4gICAgICAgICAgICBoYW5kbGVyOiBcIk5ldHdvcmtGaXJzdFwiLFxuICAgICAgICAgICAgbWV0aG9kOiBcIkdFVFwiLFxuICAgICAgICAgICAgb3B0aW9uczoge1xuICAgICAgICAgICAgICBjYWNoZU5hbWU6IFwic3VwYWJhc2UtcmVzdC1jYWNoZVwiLFxuICAgICAgICAgICAgICBleHBpcmF0aW9uOiB7IG1heEVudHJpZXM6IDIwMCwgbWF4QWdlU2Vjb25kczogNjAgKiA2MCAqIDI0ICogMyB9LFxuICAgICAgICAgICAgICBuZXR3b3JrVGltZW91dFNlY29uZHM6IDQsXG4gICAgICAgICAgICAgIGNhY2hlYWJsZVJlc3BvbnNlOiB7IHN0YXR1c2VzOiBbMCwgMjAwXSB9LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICAgIC8vIFN1cGFiYXNlIFN0b3JhZ2UgcHVibGljL3NpZ25lZCBhc3NldCBiaW5hcmllc1xuICAgICAgICAgIHtcbiAgICAgICAgICAgIHVybFBhdHRlcm46IC9eaHR0cHM6XFwvXFwvW2EtejAtOV0rXFwuc3VwYWJhc2VcXC5jb1xcL3N0b3JhZ2VcXC92MVxcLy4qL2ksXG4gICAgICAgICAgICBoYW5kbGVyOiBcIkNhY2hlRmlyc3RcIixcbiAgICAgICAgICAgIG1ldGhvZDogXCJHRVRcIixcbiAgICAgICAgICAgIG9wdGlvbnM6IHtcbiAgICAgICAgICAgICAgY2FjaGVOYW1lOiBcInN1cGFiYXNlLXN0b3JhZ2UtY2FjaGVcIixcbiAgICAgICAgICAgICAgZXhwaXJhdGlvbjogeyBtYXhFbnRyaWVzOiAxMDAsIG1heEFnZVNlY29uZHM6IDYwICogNjAgKiAyNCAqIDcgfSxcbiAgICAgICAgICAgICAgY2FjaGVhYmxlUmVzcG9uc2U6IHsgc3RhdHVzZXM6IFswLCAyMDBdIH0sXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIF0sXG4gICAgICB9LFxuICAgIH0pLFxuICBdLFxuICByZXNvbHZlOiB7XG4gICAgYWxpYXM6IHtcbiAgICAgIFwiQFwiOiBwYXRoLnJlc29sdmUoX19kaXJuYW1lLCBcIi4vc3JjXCIpLFxuICAgICAgXCJAYXNzZXRzXCI6IHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsIFwiLi9hdHRhY2hlZF9hc3NldHNcIiksXG4gICAgfSxcbiAgICBkZWR1cGU6IFtcInJlYWN0XCIsIFwicmVhY3QtZG9tXCIsIFwicmVhY3QvanN4LXJ1bnRpbWVcIiwgXCJyZWFjdC9qc3gtZGV2LXJ1bnRpbWVcIiwgXCJAdGFuc3RhY2svcmVhY3QtcXVlcnlcIiwgXCJAdGFuc3RhY2svcXVlcnktY29yZVwiXSxcbiAgfSxcbiAgb3B0aW1pemVEZXBzOiB7XG4gICAgZXhjbHVkZTogW1wiQHN3Yy9jb3JlXCIsIFwiQHN3Yy93YXNtXCJdLFxuICB9LFxufSkpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUFvUCxTQUFTLG9CQUFvQjtBQUNqUixPQUFPLFdBQVc7QUFDbEIsT0FBTyxVQUFVO0FBQ2pCLFNBQVMsZUFBZTtBQUh4QixJQUFNLG1DQUFtQztBQUt6QyxJQUFPLHNCQUFRLGFBQWEsQ0FBQyxFQUFFLEtBQUssT0FBTztBQUFBLEVBQ3pDLFFBQVE7QUFBQSxJQUNOLDBDQUEwQyxLQUFLLFVBQVUsUUFBUSxJQUFJLDBCQUEwQixFQUFFO0FBQUEsSUFDakcscUNBQXFDLEtBQUssVUFBVSxRQUFRLElBQUkscUJBQXFCLEVBQUU7QUFBQSxFQUN6RjtBQUFBLEVBQ0EsUUFBUTtBQUFBLElBQ04sTUFBTTtBQUFBLElBQ04sTUFBTTtBQUFBLElBQ04sY0FBYztBQUFBLElBQ2QsS0FBSztBQUFBLE1BQ0gsU0FBUztBQUFBLElBQ1g7QUFBQSxJQUNBLFNBQVM7QUFBQSxNQUNQLGlCQUFpQjtBQUFBLElBQ25CO0FBQUEsSUFDQSxPQUFPO0FBQUEsTUFDTCxvQkFBb0I7QUFBQSxRQUNsQixRQUFRO0FBQUEsUUFDUixjQUFjO0FBQUEsUUFDZCxTQUFTLENBQUNBLFVBQVNBLE1BQUssUUFBUSx1QkFBdUIsRUFBRTtBQUFBLE1BQzNEO0FBQUEsTUFDQSxxQkFBcUI7QUFBQSxRQUNuQixRQUFRO0FBQUEsUUFDUixjQUFjO0FBQUEsTUFDaEI7QUFBQSxNQUNBLHNCQUFzQjtBQUFBLFFBQ3BCLFFBQVE7QUFBQSxRQUNSLGNBQWM7QUFBQSxNQUNoQjtBQUFBLE1BQ0Esc0JBQXNCO0FBQUEsUUFDcEIsUUFBUTtBQUFBLFFBQ1IsY0FBYztBQUFBLE1BQ2hCO0FBQUEs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
