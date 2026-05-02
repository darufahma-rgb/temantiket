import { useState } from "react";
import { AppSidebar } from "./AppSidebar";
import { AIChatWidget } from "./AIChatWidget";
import { AIContextualBar } from "./AIContextualBar";
import { Menu, LayoutDashboard, Users, ShoppingBag, Settings, RefreshCw, LogOut, StickyNote, FileSpreadsheet, MoreHorizontal, ChevronRight, Ticket, Sparkles, Calculator, Package, MessageSquare, Wallet, Search, Bell, Command } from "lucide-react";

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

// 4 primary tabs + "Lainnya" — reflect the new nav hierarchy
const primaryNavItems = [
  { title: "Beranda",    url: "/",          icon: LayoutDashboard, end: true  },
  { title: "Klien",      url: "/clients",   icon: Users,           end: false },
  { title: "Orders",     url: "/orders",    icon: ShoppingBag,     end: false },
  { title: "Itinerary",  url: "/itinerary", icon: Sparkles,        end: false },
];

// Secondary items in the "Lainnya" bottom sheet — grouped by concern
const moreNavItems = [
  { title: "Kalkulator & Kurs",    url: "/calculator",    icon: Calculator,    desc: "Update kurs EGP/USD/SAR & hitung harga" },
  { title: "Paket Trip",           url: "/packages",      icon: Package,       desc: "Kelola paket umrah & wisata" },
  { title: "Harga Tiket",          url: "/ticket-prices", icon: Ticket,        desc: "Daftar harga tiket & Smart Import" },
  { title: "Template BC WA",       url: "/bc-templates",  icon: MessageSquare, desc: "Template broadcast & marketing WA" },
  { title: "Catatan",              url: "/notes",         icon: StickyNote,    desc: "Catatan & memo cepat" },
  { title: "Export & Member Card", url: "/exports",       icon: FileSpreadsheet, desc: "Rooming list, manifest & member card" },
  { title: "Laporan Keuangan",     url: "/reports",       icon: Wallet,        desc: "Laporan & analisis keuangan (Owner)" },
  { title: "Pengaturan",           url: "/settings",      icon: Settings,      desc: "Akun, tim, kurs, tampilan" },
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

  const displayName = currentUser?.displayName ?? "Temantiket";

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

          {/* Brand — icon mark + wordmark */}
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-1.5 shrink-0 transition-opacity active:opacity-60"
            aria-label="Beranda Temantiket"
          >
            <img
              src="/temantiket-icon.png"
              alt=""
              className="h-6 w-6 object-contain"
              style={{ filter: "brightness(0)" }}
            />
            <span className="text-[14px] font-black tracking-tight text-[hsl(var(--foreground))]">Temantiket</span>
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
            className="flex items-center gap-1.5 shrink-0 h-9 pl-2 pr-1.5 rounded-2xl bg-gradient-to-r from-sky-50 via-sky-100 to-sky-50 border border-sky-100/80 shadow-[0_1px_2px_rgba(14,165,233,0.08)] transition-all active:scale-95"
            style={{ fontVariantNumeric: "tabular-nums" }}
            title={lastUpdated ? `Diperbarui: ${lastUpdated.toLocaleTimeString("id-ID")} · Tap untuk perbarui` : "Tap untuk perbarui"}
            aria-label="Kurs live"
          >
            <span className="relative flex h-1.5 w-1.5 ml-0.5">
              <span
                className={cn(
                  "absolute inline-flex h-full w-full rounded-full opacity-75",
                  rateMode === "manual" ? "bg-sky-400" : "bg-emerald-400 animate-ping"
                )}
              />
              <span
                className="relative inline-flex h-1.5 w-1.5 rounded-full"
                style={{ background: rateMode === "manual" ? "#1a44d4" : "#10b981" }}
              />
            </span>

            <div className="flex items-center gap-1.5 leading-none">
              <div className="flex flex-col items-end gap-[1px]">
                <span className="text-[8px] font-bold uppercase tracking-wider text-sky-500/80 leading-none">USD</span>
                <span className="text-[11px] font-extrabold text-sky-800 leading-none tabular-nums">
                  {rates.USD ? rates.USD.toLocaleString("id-ID", { maximumFractionDigits: 0 }) : "—"}
                </span>
              </div>
              <span className="h-5 w-px bg-sky-200/80" />
              <div className="flex flex-col items-end gap-[1px]">
                <span className="text-[8px] font-bold uppercase tracking-wider text-sky-500/80 leading-none">SAR</span>
                <span className="text-[11px] font-extrabold text-sky-800 leading-none tabular-nums">
                  {rates.SAR ? rates.SAR.toLocaleString("id-ID", { maximumFractionDigits: 0 }) : "—"}
                </span>
              </div>
            </div>

            <span className="inline-flex h-6 w-6 items-center justify-center rounded-xl bg-white/70 ml-0.5">
              <RefreshCw
                strokeWidth={2.2}
                className={cn(
                  "h-3 w-3 text-sky-500",
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
              {!noPadding && <AIContextualBar />}
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
                            className="h-[2.5px] w-6 rounded-full bg-sky-500"
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
                        isActive ? "text-sky-500" : "text-[hsl(var(--muted-foreground))]"
                      )}
                    />

                    <span
                      className={cn(
                        "text-[10px] font-semibold leading-none tracking-tight transition-colors duration-150 mt-1",
                        isActive ? "text-sky-500" : "text-[hsl(var(--muted-foreground))]"
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
                        className="h-[2.5px] w-6 rounded-full bg-sky-500"
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
                    moreActive ? "text-sky-500" : "text-[hsl(var(--muted-foreground))]"
                  )}
                />
                <span
                  className={cn(
                    "text-[10px] font-semibold leading-none tracking-tight transition-colors duration-150 mt-1",
                    moreActive ? "text-sky-500" : "text-[hsl(var(--muted-foreground))]"
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
                    <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-full bg-sky-50">
                      <div className="h-5 w-5 rounded-full bg-sky-500 flex items-center justify-center text-white text-[10px] font-bold">
                        {displayName.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-[11px] font-semibold text-sky-700 max-w-[100px] truncate">{displayName}</span>
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
                            ? "bg-sky-50 text-sky-700"
                            : "hover:bg-[hsl(var(--secondary))]"
                        )}
                      >
                        <div
                          className={cn(
                            "h-9 w-9 rounded-xl flex items-center justify-center shrink-0",
                            isActive
                              ? "bg-sky-500 text-white"
                              : "bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))]"
                          )}
                        >
                          <item.icon strokeWidth={isActive ? 2.2 : 1.8} className="h-[17px] w-[17px]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className={cn("text-[13.5px] font-semibold leading-tight", isActive ? "text-sky-700" : "text-[hsl(var(--foreground))]")}>
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

      {/* ── Desktop / Tablet layout ── */}
      <div
        className="mobile-compact hidden md:flex h-screen w-screen overflow-hidden"
        style={{ background: "hsl(var(--background))" }}
      >
        <AppSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {/* ── Desktop Header — reference-image style ── */}
          <motion.header
            className="flex items-center gap-3 px-5 lg:px-6 shrink-0"
            style={{
              height: "60px",
              background: "hsl(var(--card))",
              borderBottom: "1px solid hsl(var(--border))",
            }}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            {/* Search bar */}
            <div className="flex-1 max-w-md relative">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none"
                style={{ color: "hsl(var(--muted-foreground))" }}
                strokeWidth={1.8}
              />
              <input
                type="text"
                placeholder="Cari klien, order, trip…"
                className="w-full h-9 pl-9 pr-4 text-[13px] rounded-xl outline-none transition-all"
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
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                style={{
                  background: "hsl(var(--border))",
                  color: "hsl(var(--muted-foreground))",
                  fontFamily: "monospace",
                }}
              >
                ⌘K
              </span>
            </div>

            <div className="flex-1" />

            <div className="flex items-center gap-2 shrink-0">
              {/* Kurs live — compact pill */}
              <button
                onClick={() => refreshRates()}
                title={lastUpdated ? `Diperbarui: ${lastUpdated.toLocaleTimeString("id-ID")}` : "Tap untuk perbarui"}
                className="hidden lg:flex items-center gap-2 h-9 px-3 rounded-xl transition-all hover:bg-[hsl(var(--secondary))]"
                style={{ border: "1px solid hsl(var(--border))" }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full shrink-0"
                  style={{
                    background: rateMode === "manual" ? "#1a44d4" : "#10b981",
                    boxShadow: rateMode === "manual" ? "0 0 4px #1a44d4" : "0 0 4px #10b981",
                  }}
                />
                <span className="text-[11px] font-semibold text-[hsl(var(--muted-foreground))]" style={{ fontVariantNumeric: "tabular-nums" }}>
                  USD <span className="text-sky-500 font-bold">Rp{rates.USD?.toLocaleString("id-ID") ?? "—"}</span>
                  <span className="mx-1.5 opacity-30">·</span>
                  SAR <span className="text-sky-500 font-bold">Rp{rates.SAR?.toLocaleString("id-ID") ?? "—"}</span>
                </span>
                <RefreshCw
                  className={cn("h-3 w-3", ratesLoading && "animate-spin")}
                  style={{ color: "hsl(var(--muted-foreground))" }}
                  strokeWidth={2}
                />
              </button>

              {/* AI Assistant button */}
              <button
                onClick={() => navigate("/itinerary")}
                className="keep-icon-bg hidden md:flex items-center gap-2 h-9 px-3.5 rounded-xl text-white text-[12px] font-semibold transition-all hover:opacity-90 active:scale-95 shrink-0"
                style={{ background: "linear-gradient(135deg, #1a44d4, #0a2472)" }}
              >
                <Sparkles className="h-3.5 w-3.5 shrink-0" strokeWidth={2} style={{ color: "white" }} />
                <span>AI Assistant</span>
              </button>

              {/* Sync status dot */}
              <div
                className="flex items-center gap-1.5 h-9 px-2.5 rounded-xl"
                style={{ border: "1px solid hsl(var(--border))" }}
                title={syncTitle}
              >
                <span className="relative flex h-2 w-2 shrink-0">
                  {syncStatus === "syncing" && (
                    <span className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping" style={{ background: syncInfo.color }} />
                  )}
                  <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: syncInfo.color, boxShadow: syncInfo.glow }} />
                </span>
                <span className="hidden lg:block text-[10px] font-semibold text-[hsl(var(--muted-foreground))] leading-none">
                  {syncInfo.label}
                </span>
              </div>

              {/* Notification bell */}
              <button
                className="keep-icon-bg relative h-9 w-9 flex items-center justify-center rounded-xl transition-colors hover:bg-[hsl(var(--secondary))]"
                style={{ border: "1px solid hsl(var(--border))" }}
                title="Notifikasi"
              >
                <Bell className="h-4 w-4" style={{ color: "hsl(var(--muted-foreground))" }} strokeWidth={1.8} />
              </button>

              {/* User avatar + name */}
              <button
                onClick={() => navigate("/settings")}
                className="flex items-center gap-2.5 h-9 pl-2 pr-3 rounded-xl transition-colors hover:bg-[hsl(var(--secondary))]"
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
                  <span className="text-[9px] font-medium text-[hsl(var(--muted-foreground))] capitalize mt-0.5">{currentUser?.role ?? "user"}</span>
                </div>
              </button>
            </div>
          </motion.header>

          {/* ── Main content ── */}
          <div className="flex-1 overflow-hidden relative" style={{ background: "hsl(var(--background))" }}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.main
                key={location.pathname}
                className={`pwa-main-content absolute inset-0 overflow-auto ${noPadding
                  ? "pb-0"
                  : "p-4 md:p-5 lg:p-6 xl:p-7"
                }`}
                initial={{ x: 40, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -40, opacity: 0 }}
                transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
              >
                <div className="mx-auto w-full max-w-[1400px]">
                  {!noPadding && <AIContextualBar />}
                  {children}
                </div>
              </motion.main>
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* ── AI Command Center — floating widget, semua halaman dashboard ── */}
      <AIChatWidget />
    </>
  );
}
