import { Component, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { registerSW } from "virtual:pwa-register";
import { isSupabaseConfigured } from "@/lib/supabase";

// Di dev mode: matikan & buang semua service worker yang udah terlanjur
// ke-install. SW caching bundle Vite (yg hash-nya berubah tiap restart) bikin
// white-screen karena chunk lama di-serve untuk module yang udah berubah
// export-nya. Lihat juga `devOptions.enabled: false` di vite.config.ts.
if (import.meta.env.DEV && typeof navigator !== "undefined" && "serviceWorker" in navigator) {
  void navigator.serviceWorker.getRegistrations().then((regs) => {
    for (const reg of regs) void reg.unregister();
  });
  if ("caches" in window) {
    void caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
  }
} else {
  registerSW({
    onNeedRefresh() {},
    onOfflineReady() {
      console.log("[PWA] App ready for offline use");
    },
  });
}

function ConfigErrorScreen({ title, detail }: { title: string; detail: string }) {
  return (
    <div
      style={{
        fontFamily: "-apple-system, 'Segoe UI', sans-serif",
        maxWidth: 520,
        margin: "80px auto",
        padding: 24,
        textAlign: "center",
        color: "#3b1f0d",
      }}
    >
      <h1 style={{ fontSize: "1.25rem", marginBottom: 8, fontWeight: 700 }}>{title}</h1>
      <p style={{ fontSize: "0.875rem", color: "#7c4a1f", lineHeight: 1.5, whiteSpace: "pre-line" }}>{detail}</p>
    </div>
  );
}

class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[App] Render crash:", error, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <ConfigErrorScreen
          title="Aplikasi error saat dimuat"
          detail={`${this.state.error.message}\n\nCoba muat ulang halaman. Kalau masih, hubungi admin.`}
        />
      );
    }
    return this.props.children;
  }
}

const rootEl = document.getElementById("root")!;

// Notify the inline boot fallback in index.html that React is mounting.
window.dispatchEvent(new Event("igh:booted"));

if (!isSupabaseConfigured()) {
  // Render pesan jelas — bukan layar putih — kalau env Supabase belum ada.
  createRoot(rootEl).render(
    <ConfigErrorScreen
      title="Konfigurasi server belum lengkap"
      detail={
        "Variabel VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY belum di-set di environment hosting.\n\nBuka dashboard hosting (Vercel) → Settings → Environment Variables, tambahkan kedua variabel itu, lalu redeploy."
      }
    />,
  );
} else {
  createRoot(rootEl).render(
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>,
  );
}
