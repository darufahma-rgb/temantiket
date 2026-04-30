import { useState } from "react";
import { AppSidebar } from "./AppSidebar";
import { Menu, LayoutDashboard, Calculator, Package, GitBranch, Settings, FileText, RefreshCw, LogOut, StickyNote, FileSpreadsheet, MoreHorizontal, ChevronRight } from "lucide-react";

import { NavLink, useLocation, useNavigate } from "react-router-dom";
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

// 5 primary tabs (last is "Lainnya" / More) — standard mobile pattern
const primaryNavItems = [
  { title: "Beranda", url: "/", icon: LayoutDashboard, end: true },
  { title: "Paket", url: "/packages", icon: Package, end: false },
  { title: "Kalkulator", url: "/calculator", icon: Calculator, end: false },
  { title: "Progress", url: "/progress", icon: GitBranch, end: false },
];

// Secondary items live inside the "Lainnya" bottom sheet
const moreNavItems = [
  { title: "Catatan", url: "/notes", icon: StickyNote, desc: "Catatan & memo cepat" },
  { title: "Export Center", url: "/exports", icon: FileSpreadsheet, desc: "Rooming & manifest Excel" },
  { title: "Pengaturan", url: "/settings", icon: Settings, desc: "Akun, tim, kurs, tampilan" },
];

interface DashboardLayoutProps {
  children: React.ReactNode;
  noPadding?: boolean;
}

export function DashboardLayout({ children, noPadding = false }: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { rates, mode: rateMode, loading: ratesLoading, lastUpdated, refresh: refreshRates } = useRatesStore();
  const { user: currentUser, logout } = useAuthStore();
  const syncStatus = useSyncStatusStore((s) => s.status);
  const lastSync = useSyncStatusStore((s) => s.lastSync);
  const lastError = useSyncStatusStore((s) => s.lastError);
  const syncInfo = SYNC_DOT[syncStatus];
  const syncTitle = `${syncInfo.label}${lastSync ? ` · ${formatLastSync(lastSync)}` : ""}${lastError ? ` · ${lastError}` : ""}`;

  const handleLogout = () => { logout(); navigate("/login"); };

  const displayName = currentUser?.displayName ?? "IGH Tour";

  const activeCheck = (url: string, end: boolean) => {
    if (url.startsWith("/trips")) return location.pathname.startsWith("/trips");
    return end ? location.pathname === url : location.pathname.startsWith(url);
  };

  const moreActive = moreNavItems.some((m) => location.pathname.startsWith(m.url));

  // Halaman yang pakai mode compact di mobile/PWA (Beranda "/" tetap spacious)
  const COMPACT_PAGE_PREFIXES = [
    "/calculator", "/packages", "/progress", "/trips",
    "/notes", "/exports", "/settings",
  ];
  const isCompactPage = COMPACT_PAGE_PREFIXES.some((p) =>
    location.pathname === p || location.pathname.startsWith(p + "/") || location.pathname.startsWith(p + "?")
  );

  const goTo = (url: string) => {
    setMoreOpen(false);
    navigate(url);
  };

  return (
    <>
      {/* ── Mobile layout ── */}
      <div
        className={`mobile-compact md:hidden app-shell-mobile ${isCompactPage ? "compact-page" : ""}`}
        style={{ background: "hsl(var(--card))" }}
      >
        <AppSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        {/* ── Mobile Header — clean, compact, single brand ── */}
        <motion.header
          className="pwa-header flex items-center gap-2 px-3.5 shrink-0"
          style={{
            minHeight: "52px",
            background: "hsl(var(--card))",
            borderBottom: "1px solid hsl(var(--border))",
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.25 }}
        >
          {/* Hamburger */}
          <button
            aria-label="Buka menu"
            className="flex items-center justify-center shrink-0 h-9 w-9 -ml-1.5 rounded-xl transition-opacity active:opacity-60"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu strokeWidth={2} className="h-[20px] w-[20px] text-[hsl(var(--foreground))]" />
          </button>

          {/* Brand — single wordmark logo only */}
          <button
            onClick={() => navigate("/")}
            className="flex items-center shrink-0 transition-opacity active:opacity-60"
            aria-label="Beranda IGH Tour"
          >
            <img
              src="/logo-igh-tour-text.png"
              alt="IGH Tour"
              className="h-[26px] w-auto object-contain"
              onError={(e) => {
                const img = e.target as HTMLImageElement;
                img.style.display = "none";
                const fb = document.createElement("span");
                fb.textContent = "IGH Tour";
                fb.className = "text-[14px] font-black tracking-tight text-orange-600";
                img.parentElement!.appendChild(fb);
              }}
            />
          </button>

          <div className="flex-1" />

          {/* Sync status — green/yellow/red dot + last sync */}
          <div
            className="flex items-center gap-1 shrink-0 mr-1.5"
            title={syncTitle}
            aria-label={syncTitle}
          >
            <span className="relative flex h-1.5 w-1.5">
              {syncStatus === "syncing" && (
                <span className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping" style={{ background: syncInfo.color }} />
              )}
              <span
                className="relative inline-flex h-1.5 w-1.5 rounded-full"
                style={{ background: syncInfo.color, boxShadow: syncInfo.glow }}
              />
            </span>
            <span className="text-[9.5px] font-semibold text-[hsl(var(--muted-foreground))] leading-none tabular-nums">
              {syncStatus === "offline" ? "Offline" : formatLastSync(lastSync)}
            </span>
          </div>

          {/* Live rate indicator — full numbers, tap to refresh */}
          <button
            onClick={() => refreshRates()}
            className="flex items-center gap-1.5 shrink-0 h-9 pl-2 pr-1.5 rounded-2xl bg-gradient-to-r from-orange-50 via-amber-50 to-orange-50 border border-orange-100/80 shadow-[0_1px_2px_rgba(249,115,22,0.08)] transition-all active:scale-95"
            style={{ fontVariantNumeric: "tabular-nums" }}
            title={lastUpdated ? `Diperbarui: ${lastUpdated.toLocaleTimeString("id-ID")} · Tap untuk perbarui` : "Tap untuk perbarui"}
            aria-label="Kurs live"
          >
            <span className="relative flex h-1.5 w-1.5 ml-0.5">
              <span
                className={cn(
                  "absolute inline-flex h-full w-full rounded-full opacity-75",
                  rateMode === "manual" ? "bg-orange-400" : "bg-emerald-400 animate-ping"
                )}
              />
              <span
                className="relative inline-flex h-1.5 w-1.5 rounded-full"
                style={{ background: rateMode === "manual" ? "#f97316" : "#10b981" }}
              />
            </span>

            <div className="flex items-center gap-1.5 leading-none">
              <div className="flex flex-col items-end gap-[1px]">
                <span className="text-[8px] font-bold uppercase tracking-wider text-orange-500/80 leading-none">USD</span>
                <span className="text-[11px] font-extrabold text-orange-800 leading-none tabular-nums">
                  {rates.USD ? rates.USD.toLocaleString("id-ID", { maximumFractionDigits: 0 }) : "—"}
                </span>
              </div>
              <span className="h-5 w-px bg-orange-200/80" />
              <div className="flex flex-col items-end gap-[1px]">
                <span className="text-[8px] font-bold uppercase tracking-wider text-orange-500/80 leading-none">SAR</span>
                <span className="text-[11px] font-extrabold text-orange-800 leading-none tabular-nums">
                  {rates.SAR ? rates.SAR.toLocaleString("id-ID", { maximumFractionDigits: 0 }) : "—"}
                </span>
              </div>
            </div>

            <span className="inline-flex h-6 w-6 items-center justify-center rounded-xl bg-white/70 ml-0.5">
              <RefreshCw
                strokeWidth={2.2}
                className={cn(
                  "h-3 w-3 text-orange-500",
                  ratesLoading && "animate-spin"
                )}
              />
            </span>
          </button>
        </motion.header>

        {/* Page content */}
        <div className="flex-1 overflow-hidden relative min-h-0">
          <AnimatePresence mode="wait" initial={false}>
            <motion.main
              key={location.pathname}
              className={`pwa-main-content absolute inset-0 overflow-auto ${
                noPadding ? "" : "p-3"
              }`}
              initial={{ x: 40, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -40, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              {children}
            </motion.main>
          </AnimatePresence>
        </div>

        {/* ── Bottom nav — 5 tabs (4 primary + Lainnya) ── */}
        <nav
          className="pwa-bottom-nav shrink-0"
          style={{
            background: "hsl(var(--card))",
            borderTop: "1px solid hsl(var(--border))",
          }}
        >
          <div className="flex items-stretch px-1 pt-1 pb-[max(8px,env(safe-area-inset-bottom))]">
            {primaryNavItems.map((item) => {
              const isActive = activeCheck(item.url, item.end);
              return (
                <NavLink
                  key={item.title}
                  to={item.url}
                  end={item.end}
                  className="flex-1 flex flex-col items-center"
                >
                  <motion.div
                    className="flex flex-col items-center gap-[3px] w-full pt-1.5 pb-0.5"
                    whileTap={{ scale: 0.9 }}
                    transition={{ duration: 0.1 }}
                  >
                    <div className="w-full flex justify-center -mt-1 mb-0.5">
                      <AnimatePresence>
                        {isActive ? (
                          <motion.div
                            layoutId="nav-bar"
                            className="h-[2.5px] w-6 rounded-full bg-orange-500"
                            initial={{ opacity: 0, scaleX: 0 }}
                            animate={{ opacity: 1, scaleX: 1 }}
                            exit={{ opacity: 0, scaleX: 0 }}
                            transition={{ type: "spring", stiffness: 500, damping: 35 }}
                          />
                        ) : (
                          <div className="h-[2.5px] w-6" />
                        )}
                      </AnimatePresence>
                    </div>

                    <item.icon
                      strokeWidth={isActive ? 2.3 : 1.7}
                      className={cn(
                        "h-[20px] w-[20px] transition-colors duration-150",
                        isActive ? "text-orange-500" : "text-[hsl(var(--muted-foreground))]"
                      )}
                    />

                    <span
                      className={cn(
                        "text-[10px] font-semibold leading-none tracking-tight transition-colors duration-150 mt-1",
                        isActive ? "text-orange-500" : "text-[hsl(var(--muted-foreground))]"
                      )}
                    >
                      {item.title}
                    </span>
                  </motion.div>
                </NavLink>
              );
            })}

            {/* Lainnya (More) — opens bottom sheet */}
            <button
              onClick={() => setMoreOpen(true)}
              className="flex-1 flex flex-col items-center"
              aria-label="Lainnya"
            >
              <motion.div
                className="flex flex-col items-center gap-[3px] w-full pt-1.5 pb-0.5"
                whileTap={{ scale: 0.9 }}
                transition={{ duration: 0.1 }}
              >
                <div className="w-full flex justify-center -mt-1 mb-0.5">
                  <AnimatePresence>
                    {moreActive ? (
                      <motion.div
                        layoutId="nav-bar"
                        className="h-[2.5px] w-6 rounded-full bg-orange-500"
                        initial={{ opacity: 0, scaleX: 0 }}
                        animate={{ opacity: 1, scaleX: 1 }}
                        exit={{ opacity: 0, scaleX: 0 }}
                        transition={{ type: "spring", stiffness: 500, damping: 35 }}
                      />
                    ) : (
                      <div className="h-[2.5px] w-6" />
                    )}
                  </AnimatePresence>
                </div>
                <MoreHorizontal
                  strokeWidth={moreActive ? 2.3 : 1.7}
                  className={cn(
                    "h-[20px] w-[20px] transition-colors duration-150",
                    moreActive ? "text-orange-500" : "text-[hsl(var(--muted-foreground))]"
                  )}
                />
                <span
                  className={cn(
                    "text-[10px] font-semibold leading-none tracking-tight transition-colors duration-150 mt-1",
                    moreActive ? "text-orange-500" : "text-[hsl(var(--muted-foreground))]"
                  )}
                >
                  Lainnya
                </span>
              </motion.div>
            </button>
          </div>
        </nav>

        {/* ── "Lainnya" bottom sheet ── */}
        <AnimatePresence>
          {moreOpen && (
            <div className="fixed inset-0 z-[60] flex flex-col justify-end">
              <motion.div
                className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={() => setMoreOpen(false)}
              />
              <motion.div
                className="relative bg-[hsl(var(--card))] rounded-t-[1.75rem] shadow-2xl pb-[max(1rem,env(safe-area-inset-bottom))]"
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", stiffness: 360, damping: 36, mass: 0.85 }}
              >
                {/* Grabber */}
                <div className="flex justify-center pt-2.5 pb-1">
                  <div className="h-1 w-10 rounded-full bg-[hsl(var(--border))]" />
                </div>

                {/* Header */}
                <div className="px-5 pt-1 pb-3 flex items-center justify-between">
                  <div>
                    <h3 className="text-[15px] font-bold text-[hsl(var(--foreground))] leading-tight">Lainnya</h3>
                    <p className="text-[11px] text-[hsl(var(--muted-foreground))] mt-0.5">Tools, ekspor, & pengaturan</p>
                  </div>
                  {currentUser && (
                    <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-full bg-orange-50">
                      <div className="h-5 w-5 rounded-full bg-orange-500 flex items-center justify-center text-white text-[10px] font-bold">
                        {displayName.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-[11px] font-semibold text-orange-700 max-w-[100px] truncate">{displayName}</span>
                    </div>
                  )}
                </div>

                {/* Items */}
                <div className="px-3 space-y-1">
                  {moreNavItems.map((item) => {
                    const isActive = location.pathname.startsWith(item.url);
                    return (
                      <button
                        key={item.url}
                        onClick={() => goTo(item.url)}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-3 rounded-2xl transition-colors text-left",
                          isActive
                            ? "bg-orange-50 text-orange-700"
                            : "hover:bg-[hsl(var(--secondary))]"
                        )}
                      >
                        <div
                          className={cn(
                            "h-9 w-9 rounded-xl flex items-center justify-center shrink-0",
                            isActive
                              ? "bg-orange-500 text-white"
                              : "bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))]"
                          )}
                        >
                          <item.icon strokeWidth={isActive ? 2.2 : 1.8} className="h-[17px] w-[17px]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className={cn("text-[13.5px] font-semibold leading-tight", isActive ? "text-orange-700" : "text-[hsl(var(--foreground))]")}>
                            {item.title}
                          </div>
                          <div className="text-[11px] text-[hsl(var(--muted-foreground))] mt-0.5 leading-tight truncate">
                            {item.desc}
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-[hsl(var(--muted-foreground))] shrink-0" />
                      </button>
                    );
                  })}

                  {/* Logout */}
                  <button
                    onClick={() => { setMoreOpen(false); handleLogout(); }}
                    className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl transition-colors text-left hover:bg-red-50 mt-2"
                  >
                    <div className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0 bg-red-50 text-red-500">
                      <LogOut strokeWidth={1.8} className="h-[17px] w-[17px]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13.5px] font-semibold leading-tight text-red-600">Keluar</div>
                      <div className="text-[11px] text-[hsl(var(--muted-foreground))] mt-0.5 leading-tight">Sign out dari akun</div>
                    </div>
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Desktop / Tablet layout — full-bleed edge-to-edge ── */}
      <div
        className="mobile-compact hidden md:flex h-screen w-screen overflow-hidden"
        style={{ background: "hsl(var(--background))" }}
      >
        <AppSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <motion.header
            className="pwa-header flex items-center gap-3 px-4 md:px-5 lg:px-6 py-2.5 md:py-3 border-b border-[hsl(var(--border))] shrink-0"
            style={{ background: "hsl(var(--card))" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          >
            {/* Live rates — minimal style */}
            <div className="flex items-center gap-2.5 shrink-0">
              <div
                className="h-1.5 w-1.5 rounded-full"
                style={{
                  background: rateMode === "manual" ? "#f97316" : "#10b981",
                  boxShadow: rateMode === "manual" ? "0 0 5px #f97316" : "0 0 5px #10b981",
                }}
              />
              <div className="flex items-center gap-2 lg:gap-3 text-[11px] font-semibold" style={{ fontVariantNumeric: "tabular-nums" }}>
                <span className={cn(
                  "text-[9px] uppercase tracking-wide font-bold",
                  rateMode === "manual" ? "text-orange-500" : "text-emerald-500"
                )}>
                  {rateMode === "manual" ? "Manual" : "Live"}
                </span>
                <span className="text-[hsl(var(--muted-foreground))]">
                  USD <span className="text-orange-500 font-bold">Rp{rates.USD?.toLocaleString("id-ID") ?? "—"}</span>
                </span>
                <span className="text-[hsl(var(--border))]">·</span>
                <span className="text-[hsl(var(--muted-foreground))]">
                  SAR <span className="text-orange-500 font-bold">Rp{rates.SAR?.toLocaleString("id-ID") ?? "—"}</span>
                </span>
              </div>
              <button
                onClick={() => refreshRates()}
                className="transition-colors text-[hsl(var(--muted-foreground))] hover:text-orange-500"
                title={lastUpdated ? `Diperbarui: ${lastUpdated.toLocaleTimeString("id-ID")}` : "Belum diperbarui"}
              >
                <RefreshCw className={cn("h-3 w-3", ratesLoading && "animate-spin")} />
              </button>
            </div>

            <div className="flex-1" />

            <div className="flex items-center gap-3 lg:gap-4 shrink-0">
              {/* Sync status indicator (desktop) */}
              <div
                className="flex items-center gap-1.5"
                title={syncTitle}
                aria-label={syncTitle}
              >
                <span className="relative flex h-1.5 w-1.5">
                  {syncStatus === "syncing" && (
                    <span className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping" style={{ background: syncInfo.color }} />
                  )}
                  <span
                    className="relative inline-flex h-1.5 w-1.5 rounded-full"
                    style={{ background: syncInfo.color, boxShadow: syncInfo.glow }}
                  />
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))] leading-none">
                  {syncInfo.label}
                </span>
                <span className="text-[10px] text-[hsl(var(--muted-foreground))] leading-none tabular-nums">
                  {lastSync ? `· ${formatLastSync(lastSync)}` : ""}
                </span>
              </div>

              <div className="hidden lg:flex flex-col items-end">
                <div className="text-[13px] font-bold text-[hsl(var(--foreground))] leading-tight">{displayName}</div>
                <div className="text-[10px] font-medium text-[hsl(var(--muted-foreground))] capitalize tracking-wide">{currentUser?.role ?? "agent"}</div>
              </div>
              <button
                onClick={handleLogout}
                className="h-8 w-8 flex items-center justify-center text-[hsl(var(--muted-foreground))] hover:text-red-500 transition-colors"
                title="Keluar"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </motion.header>

          <div className="flex-1 overflow-hidden relative">
            <AnimatePresence mode="wait" initial={false}>
              <motion.main
                key={location.pathname}
                className={`pwa-main-content absolute inset-0 overflow-auto ${noPadding
                  ? "pb-0"
                  : "p-4 md:p-5 lg:p-7 xl:p-8"
                }`}
                initial={{ x: 56, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -56, opacity: 0 }}
                transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
              >
                <div className="mx-auto w-full max-w-[1400px]">
                  {children}
                </div>
              </motion.main>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </>
  );
}
