import { useState } from "react";
import { AppSidebar } from "./AppSidebar";
import { AIChatWidget } from "./AIChatWidget";
import {
  Menu, RefreshCw, Sparkles, Search, Bell,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useRatesStore } from "@/store/ratesStore";
import { useAuthStore } from "@/store/authStore";
import { useSyncStatusStore, type SyncStatus } from "@/store/syncStatusStore";

const SYNC_DOT: Record<SyncStatus, { color: string; glow: string; label: string }> = {
  ok:      { color: "#10b981", glow: "0 0 5px #10b981", label: "Tersinkron" },
  syncing: { color: "#f59e0b", glow: "0 0 5px #f59e0b", label: "Menyinkronkan…" },
  offline: { color: "#9ca3af", glow: "none",            label: "Offline" },
  error:   { color: "#ef4444", glow: "0 0 5px #ef4444", label: "Gagal sync" },
};

function formatLastSync(d: Date | null): string {
  if (!d) return "Belum ada sync";
  const diffSec = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000));
  if (diffSec < 60) return `${diffSec}d lalu`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m lalu`;
  return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

interface DashboardLayoutProps {
  children: React.ReactNode;
  noPadding?: boolean;
}

export function DashboardLayout({ children, noPadding = false }: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const { rates, mode: rateMode, loading: ratesLoading, lastUpdated, refresh: refreshRates } = useRatesStore();
  const { user: currentUser, logout } = useAuthStore();
  const syncStatus = useSyncStatusStore((s) => s.status);
  const lastSync    = useSyncStatusStore((s) => s.lastSync);
  const lastError   = useSyncStatusStore((s) => s.lastError);
  const syncInfo    = SYNC_DOT[syncStatus];
  const syncTitle   = `${syncInfo.label}${lastSync ? ` · ${formatLastSync(lastSync)}` : ""}${lastError ? ` · ${lastError}` : ""}`;

  const handleLogout = () => { logout(); navigate("/login"); };
  const displayName  = currentUser?.displayName ?? "Temantiket";

  return (
    <>
      {/* ── Unified layout — same structure for mobile and desktop ── */}
      <div
        className="app-shell mobile-compact flex w-screen overflow-hidden"
        style={{ background: "hsl(var(--background))" }}
      >
        {/* Sidebar — always-visible on desktop, drawer on mobile */}
        <AppSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        {/* Right column: header + content */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">

          {/* ── Unified Header ── */}
          <motion.header
            className="flex items-center gap-2 md:gap-3 px-3 md:px-5 lg:px-6 shrink-0"
            style={{
              height: "56px",
              background: "hsl(var(--card))",
              borderBottom: "1px solid hsl(var(--border))",
            }}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            {/* Hamburger — mobile only (sidebar is drawer on mobile) */}
            <button
              aria-label="Buka menu"
              className="md:hidden flex items-center justify-center h-8 w-8 -ml-0.5 rounded-lg transition-opacity active:opacity-60 shrink-0"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu strokeWidth={2} className="h-[18px] w-[18px] text-[hsl(var(--foreground))]" />
            </button>

            {/* Search bar */}
            <div className="flex-1 md:max-w-md relative">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 h-[15px] w-[15px] pointer-events-none"
                style={{ color: "hsl(var(--muted-foreground))" }}
                strokeWidth={1.8}
              />
              <input
                type="text"
                placeholder="Cari klien, order, trip…"
                className="w-full h-9 pl-9 pr-3 text-[12.5px] rounded-xl outline-none transition-all"
                style={{
                  background: "hsl(var(--secondary))",
                  border: "1px solid hsl(var(--border))",
                  color: "hsl(var(--foreground))",
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = "#1a44d4";
                  e.target.style.boxShadow = "0 0 0 3px rgba(14,165,233,0.12)";
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = "hsl(var(--border))";
                  e.target.style.boxShadow = "none";
                }}
              />
              <span
                className="hidden sm:inline-flex absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                style={{
                  background: "hsl(var(--border))",
                  color: "hsl(var(--muted-foreground))",
                  fontFamily: "monospace",
                }}
              >
                ⌘K
              </span>
            </div>

            <div className="hidden md:block flex-1" />

            <div className="flex items-center gap-1.5 md:gap-2 shrink-0">

              {/* Live rates pill */}
              <button
                onClick={() => refreshRates()}
                title={lastUpdated ? `Diperbarui: ${lastUpdated.toLocaleTimeString("id-ID")} · Tap untuk perbarui` : "Tap untuk perbarui"}
                className="flex items-center gap-1.5 h-9 px-2 sm:px-3 rounded-xl transition-all hover:bg-[hsl(var(--secondary))] active:scale-95"
                style={{ border: "1px solid hsl(var(--border))" }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full shrink-0"
                  style={{
                    background: rateMode === "manual" ? "#1a44d4" : "#10b981",
                    boxShadow: rateMode === "manual" ? "0 0 4px #1a44d4" : "0 0 4px #10b981",
                  }}
                />
                <span
                  className="text-[11px] font-semibold text-[hsl(var(--muted-foreground))]"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  <span className="hidden sm:inline">USD </span>
                  <span className="text-sky-500 font-bold">
                    Rp{rates.USD ? (rates.USD >= 10000 ? `${(rates.USD/1000).toFixed(1)}k` : rates.USD.toLocaleString("id-ID")) : "—"}
                  </span>
                  <span className="hidden lg:inline">
                    <span className="mx-1.5 opacity-30">·</span>
                    SAR{" "}
                    <span className="text-sky-500 font-bold">
                      Rp{rates.SAR?.toLocaleString("id-ID") ?? "—"}
                    </span>
                  </span>
                </span>
                <RefreshCw
                  className={cn("h-3 w-3 shrink-0", ratesLoading && "animate-spin")}
                  style={{ color: "hsl(var(--muted-foreground))" }}
                  strokeWidth={2}
                />
              </button>

              {/* AI Assistant — hidden on very small phones */}
              <button
                onClick={() => navigate("/itinerary")}
                className="keep-icon-bg hidden sm:flex items-center gap-2 h-9 px-3 md:px-3.5 rounded-xl text-white text-[12px] font-semibold transition-all hover:opacity-90 active:scale-95 shrink-0"
                style={{ background: "linear-gradient(135deg, #1a44d4, #0a2472)" }}
              >
                <Sparkles className="h-3.5 w-3.5 shrink-0" strokeWidth={2} style={{ color: "white" }} />
                <span className="hidden md:inline">AI Assistant</span>
              </button>

              {/* Sync status dot */}
              <div
                className="hidden sm:flex items-center gap-1.5 h-9 px-2.5 rounded-xl shrink-0"
                style={{ border: "1px solid hsl(var(--border))" }}
                title={syncTitle}
              >
                <span className="relative flex h-2 w-2 shrink-0">
                  {syncStatus === "syncing" && (
                    <span
                      className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping"
                      style={{ background: syncInfo.color }}
                    />
                  )}
                  <span
                    className="relative inline-flex h-2 w-2 rounded-full"
                    style={{ background: syncInfo.color, boxShadow: syncInfo.glow }}
                  />
                </span>
                <span className="hidden lg:block text-[10px] font-semibold text-[hsl(var(--muted-foreground))] leading-none">
                  {syncInfo.label}
                </span>
              </div>

              {/* Notification bell */}
              <button
                className="keep-icon-bg hidden sm:flex relative h-9 w-9 items-center justify-center rounded-xl transition-colors hover:bg-[hsl(var(--secondary))] shrink-0"
                style={{ border: "1px solid hsl(var(--border))" }}
                title="Notifikasi"
              >
                <Bell className="h-4 w-4" style={{ color: "hsl(var(--muted-foreground))" }} strokeWidth={1.8} />
              </button>

              {/* User avatar + name */}
              <button
                onClick={() => navigate("/settings")}
                className="flex items-center gap-2 h-9 pl-1.5 pr-1.5 md:pl-2 md:pr-3 rounded-xl transition-colors hover:bg-[hsl(var(--secondary))] shrink-0"
                style={{ border: "1px solid hsl(var(--border))" }}
              >
                <div
                  className="h-6 w-6 rounded-lg flex items-center justify-center text-white text-[10px] font-black shrink-0"
                  style={{ background: "linear-gradient(135deg, #1a44d4, #0a2472)" }}
                >
                  {displayName.charAt(0).toUpperCase()}
                </div>
                <div className="hidden lg:flex flex-col items-start leading-none">
                  <span className="text-[12px] font-bold text-[hsl(var(--foreground))]">{displayName}</span>
                  <span className="text-[9px] font-medium text-[hsl(var(--muted-foreground))] capitalize mt-0.5">
                    {currentUser?.role ?? "user"}
                  </span>
                </div>
              </button>
            </div>
          </motion.header>

          {/* ── Main content ── */}
          <div
            className="flex-1 overflow-hidden relative"
            style={{ background: "hsl(var(--background))" }}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.main
                key={location.pathname}
                className={`absolute inset-0 overflow-auto ${
                  noPadding ? "pb-0" : "p-3 md:p-5 lg:p-6 xl:p-7"
                }`}
                initial={{ x: 40, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -40, opacity: 0 }}
                transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
              >
                <div className="mx-auto w-full max-w-[1400px]">
                  {children}
                </div>
              </motion.main>
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* ── AI Command Center — floating widget, semua halaman ── */}
      <AIChatWidget />
    </>
  );
}
