import { Component, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { registerSW } from "virtual:pwa-register";

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

// ─── Root-level error boundary ─────────────────────────────────────────────────
// Menangkap crash fatal di level paling atas (error sebelum React bisa render
// sama sekali). Untuk crash per-halaman, RouteErrorBoundary lebih spesifik.

interface AppErrorState {
  error: Error | null;
}

class AppErrorBoundary extends Component<{ children: ReactNode }, AppErrorState> {
  state: AppErrorState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[App] Render crash:", error, info.componentStack);
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.error) {
      const isDev = import.meta.env.DEV;
      const msg = this.state.error.message;

      return (
        <div
          style={{
            fontFamily: "-apple-system, 'Segoe UI', Roboto, sans-serif",
            minHeight: "100dvh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "#0a0f1e",
            color: "#e2e8f0",
            padding: "24px 20px",
            textAlign: "center",
          }}
        >
          {/* Icon */}
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 20,
              background: "linear-gradient(135deg,#7f1d1d,#991b1b)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 28,
              marginBottom: 20,
              boxShadow: "0 8px 24px rgba(239,68,68,0.25)",
            }}
          >
            ⚠️
          </div>

          <h1
            style={{
              fontSize: "1.125rem",
              fontWeight: 700,
              marginBottom: 8,
              color: "#f1f5f9",
            }}
          >
            Aplikasi gagal dimuat
          </h1>
          <p
            style={{
              fontSize: "0.8125rem",
              color: "#94a3b8",
              lineHeight: 1.6,
              maxWidth: 340,
              marginBottom: 4,
            }}
          >
            Terjadi error tak terduga saat memuat Temantiket. Coba muat ulang
            halaman atau hubungi admin jika masalah berlanjut.
          </p>

          {isDev && (
            <details style={{ marginBottom: 20, textAlign: "left", width: "100%", maxWidth: 440 }}>
              <summary
                style={{
                  fontSize: "0.75rem",
                  color: "#f87171",
                  cursor: "pointer",
                  userSelect: "none",
                  marginBottom: 6,
                }}
              >
                Detail error (dev only)
              </summary>
              <pre
                style={{
                  fontSize: "0.6875rem",
                  background: "#1e1e2e",
                  border: "1px solid #334155",
                  borderRadius: 12,
                  padding: "12px 14px",
                  overflowX: "auto",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  color: "#fca5a5",
                  maxHeight: 160,
                }}
              >
                {msg}
                {"\n"}
                {this.state.error.stack?.split("\n").slice(1, 6).join("\n")}
              </pre>
            </details>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: isDev ? 0 : 20 }}>
            <button
              onClick={this.handleReload}
              style={{
                height: 40,
                padding: "0 20px",
                borderRadius: 12,
                background: "linear-gradient(135deg,#0866FF,#0654D6)",
                color: "#fff",
                fontWeight: 700,
                fontSize: "0.8125rem",
                border: "none",
                cursor: "pointer",
                boxShadow: "0 4px 12px rgba(26,68,212,0.4)",
              }}
            >
              Muat Ulang
            </button>
            <button
              onClick={() => (window.location.href = "/")}
              style={{
                height: 40,
                padding: "0 20px",
                borderRadius: 12,
                background: "transparent",
                color: "#94a3b8",
                fontWeight: 600,
                fontSize: "0.8125rem",
                border: "1px solid #334155",
                cursor: "pointer",
              }}
            >
              Ke Beranda
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const rootEl = document.getElementById("root")!;

// Notify the inline boot fallback in index.html that React is mounting.
window.dispatchEvent(new Event("igh:booted"));

createRoot(rootEl).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>,
);
