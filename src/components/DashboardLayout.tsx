import { useEffect, useState } from "react";
import { AppSidebar } from "./AppSidebar";
import { AIChatWidget } from "./AIChatWidget";
import { RefreshCw, Search, X, LogOut } from "lucide-react";
import { RealtimeIndicator } from "./RealtimeIndicator";
import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useRatesStore } from "@/store/ratesStore";
import { useAuthStore } from "@/store/authStore";
import { useSyncStatusStore, type SyncStatus } from "@/store/syncStatusStore";
import { usePresenceStore } from "@/store/presenceStore";
import { NotificationBell } from "./NotificationBell";
import {
  OWNER_BOTTOM_NAV, OWNER_MORE_ITEMS, OWNER_MORE_GROUPS,
  AGENT_BOTTOM_NAV, AGENT_MORE_ITEMS,
  STAFF_BOTTOM_NAV, STAFF_MORE_ITEMS,
  type MobileNavItem,
} from "@/config/navMenu";

const SYNC_DOT: Record<SyncStatus, { color: string; glow: string; label: string }> = {
  ok:      { color: "#10b981", glow: "0 0 5px #10b981", label: "Tersinkron" },
  syncing: { color: "#f59e0b", glow: "0 0 5px #f59e0b", label: "Menyinkronkan…" },
  offline: { color: "#9ca3af", glow: "none",            label: "Offline" },
  error:   { color: "#ef4444", glow: "0 0 5px #ef4444", label: "Gagal sync" },
};

function formatLastSync(d: Date | null): string {
  if (!d) return "Belum ada sync";
  const diffSec = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000));
  if (diffSec < 60) return `${diffSec}dtk lalu`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m lalu`;
  return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

interface DashboardLayoutProps {
  children: React.ReactNode;
  noPadding?: boolean;
  hideMobileChrome?: boolean;
}


export function DashboardLayout({ children, noPadding = false, hideMobileChrome = false }: DashboardLayoutProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [moreOpen, setMoreOpen]     = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const { rates, mode: rateMode, loading: ratesLoading, lastUpdated, refresh: refreshRates } = useRatesStore();
  const { user: currentUser, logout } = useAuthStore();
  const { join: joinPresence, leave: leavePresence } = usePresenceStore();

  // Broadcast presence while logged in
  useEffect(() => {
    if (currentUser?.id && currentUser?.agencyId) {
      joinPresence(
        currentUser.agencyId,
        currentUser.id,
        currentUser.displayName ?? "—",
        currentUser.role,
      );
    }
    return () => { leavePresence(); };
  }, [currentUser?.id, currentUser?.agencyId, joinPresence, leavePresence]);

  // Global ⌘K / Ctrl+K shortcut: focus desktop search or open mobile overlay
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        const input = document.querySelector<HTMLInputElement>('input[placeholder="Cari klien, order, trip…"]');
        if (input) input.focus();
        else setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Keyboard detection via visualViewport — hides bottom nav when on-screen
  // keyboard opens on iOS / Android to prevent overlap with focused input.
  useEffect(() => {
    const vp = window.visualViewport;
    if (!vp) return;
    const check = () => {
      const shrinkage = window.innerHeight - vp.height;
      const open = shrinkage > 150;
      setKeyboardOpen(open);
      if (open) setMoreOpen(false);
    };
    vp.addEventListener("resize", check);
    vp.addEventListener("scroll", check);
    return () => {
      vp.removeEventListener("resize", check);
      vp.removeEventListener("scroll", check);
    };
  }, []);

  const syncStatus = useSyncStatusStore((s) => s.status);
  const lastSync   = useSyncStatusStore((s) => s.lastSync);
  const lastError  = useSyncStatusStore((s) => s.lastError);
  const syncInfo   = SYNC_DOT[syncStatus];
  const syncTitle  = `${syncInfo.label}${lastSync ? ` · ${formatLastSync(lastSync)}` : ""}${lastError ? ` · ${lastError}` : ""}`;

  if (!currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white/60 text-sm">
        Memuat sesi…
      </div>
    );
  }

  const displayName = currentUser.displayName ?? "Temantiket";

  const isAgent = currentUser?.role === "agent";
  const isStaff = currentUser?.role === "staff";
  const homeRoute = isStaff ? "/staff/dashboard" : isAgent ? "/agent" : "/";
  const bottomNav = isStaff ? STAFF_BOTTOM_NAV : isAgent ? AGENT_BOTTOM_NAV : OWNER_BOTTOM_NAV;
  const moreItems = isStaff ? STAFF_MORE_ITEMS : isAgent ? AGENT_MORE_ITEMS : OWNER_MORE_ITEMS;

  const handleLogout = () => { logout(); navigate("/login"); };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setSearchOpen(false);
      setSearchQuery("");
      navigate(`/clients?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <>
      <div
        className="app-shell mobile-compact flex w-screen overflow-hidden"
        style={{ background: "hsl(var(--background))" }}
      >
        {/* Sidebar — desktop only (mobile nav is handled by floating bottom bar) */}
        <AppSidebar />

        <div className="flex-1 flex flex-col overflow-hidden min-w-0">

          {/* ── Mobile floating header ── */}
          {!hideMobileChrome && <header
            className="md:hidden fixed z-50 flex items-center gap-0 px-3"
            style={{
              top: "calc(10px + env(safe-area-inset-top, 0px))",
              left: "10px",
              right: "10px",
              height: "54px",
              borderRadius: "20px",
              background: "rgba(255,255,255,0.96)",
              backdropFilter: "blur(32px) saturate(2)",
              WebkitBackdropFilter: "blur(32px) saturate(2)",
              boxShadow: "0 4px 24px rgba(0,0,0,0.10), 0 1px 3px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.8)",
              border: "1px solid rgba(255,255,255,0.6)",
            }}
          >
            {/* Full Temantiket logo — left side */}
            <button
              onClick={() => navigate(homeRoute)}
              className="shrink-0 active:opacity-60 transition-opacity flex items-center"
              style={{ WebkitTapHighlightColor: "transparent", paddingRight: 6 }}
              aria-label="Home"
            >
              <img
                src="/temantiket-logo-full.png"
                alt="Temantiket"
                style={{ height: 22, width: "auto", objectFit: "contain", maxWidth: 130 }}
              />
            </button>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Currency pill */}
            <button
              onClick={() => refreshRates()}
              title={lastUpdated ? `Diperbarui: ${lastUpdated.toLocaleTimeString("id-ID")}` : "Tap untuk perbarui"}
              className="flex items-center gap-1 active:opacity-55 transition-opacity shrink-0"
              style={{
                WebkitTapHighlightColor: "transparent",
                height: 30,
                paddingLeft: 8,
                paddingRight: 8,
                borderRadius: 10,
                background: "rgba(67,97,238,0.07)",
                border: "1px solid rgba(67,97,238,0.13)",
              }}
            >
              <span
                className="h-[5px] w-[5px] rounded-full shrink-0"
                style={{
                  background: rateMode === "manual" ? "#0866FF" : "#10b981",
                  boxShadow: rateMode === "manual" ? "0 0 5px rgba(37,99,235,0.8)" : "0 0 5px rgba(16,185,129,0.8)",
                }}
              />
              <span className="tabular-nums leading-none" style={{ fontSize: "11px", fontWeight: 700, color: "#0866FF" }}>
                {rates.USD ? `${(rates.USD / 1000).toFixed(1)}k` : "—"}
              </span>
              <span style={{ fontSize: "9px", fontWeight: 600, color: "rgba(67,97,238,0.55)", letterSpacing: "0.04em" }}>USD</span>
              <RefreshCw
                className={cn("h-[8px] w-[8px] shrink-0 ml-0.5", ratesLoading && "animate-spin")}
                style={{ color: "#0866FF", opacity: 0.4 }}
                strokeWidth={2.5}
              />
            </button>

            {/* Search icon */}
            <button
              onClick={() => setSearchOpen(true)}
              className="shrink-0 flex items-center justify-center active:opacity-55 transition-opacity"
              style={{ WebkitTapHighlightColor: "transparent", width: 38, height: 38 }}
              aria-label="Cari"
            >
              <Search strokeWidth={1.8} className="h-[16px] w-[16px]" style={{ color: "#6b7280" }} />
            </button>

            {/* Notification Bell */}
            <NotificationBell mobileMode />

            {/* Avatar with sync dot */}
            <button
              onClick={() => navigate("/settings")}
              className="relative shrink-0 flex items-center justify-center active:opacity-70 transition-opacity ml-0.5"
              title={syncTitle}
              style={{ WebkitTapHighlightColor: "transparent", width: 38, height: 38 }}
            >
              <div
                className="rounded-full flex items-center justify-center text-white font-black"
                style={{
                  width: 30,
                  height: 30,
                  fontSize: "11.5px",
                  background: "linear-gradient(140deg, #0866FF 0%, #0866FF 55%, #0654D6 100%)",
                  boxShadow: "0 2px 8px rgba(8,102,255,0.35)",
                }}
              >
                {displayName.charAt(0).toUpperCase()}
              </div>
              <span
                className="absolute rounded-full border-[1.5px]"
                style={{ width: 8, height: 8, bottom: 3, right: 3, background: syncInfo.color, borderColor: "rgba(255,255,255,0.96)", boxShadow: `0 0 4px ${syncInfo.color}` }}
              />
            </button>
          </header>}

          {/* ── Desktop full header ── */}
          <motion.header
            className="hidden md:flex items-center gap-2 md:gap-3 px-5 md:px-6 shrink-0"
            style={{ height: "56px", background: "hsl(var(--card))", borderBottom: "1px solid hsl(var(--border))" }}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            <div className="flex-1 md:max-w-md relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-[15px] w-[15px] pointer-events-none" style={{ color: "hsl(var(--muted-foreground))" }} strokeWidth={1.8} />
              <input
                type="text"
                placeholder="Cari klien, order, trip…"
                className="w-full h-9 pl-9 pr-3 text-[12.5px] rounded-xl outline-none transition-all"
                style={{ background: "hsl(var(--secondary))", border: "1px solid hsl(var(--border))", color: "hsl(var(--foreground))" }}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && searchQuery.trim()) {
                    navigate(`/clients?q=${encodeURIComponent(searchQuery.trim())}`);
                  }
                }}
                onFocus={(e) => { e.target.style.borderColor = "#0866FF"; e.target.style.boxShadow = "0 0 0 3px rgba(8,102,255,0.18)"; }}
                onBlur={(e) => { e.target.style.borderColor = "hsl(var(--border))"; e.target.style.boxShadow = "none"; }}
              />
              <span className="hidden sm:inline-flex absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold px-1.5 py-0.5 rounded-md" style={{ background: "hsl(var(--border))", color: "hsl(var(--muted-foreground))", fontFamily: "monospace" }}>⌘K</span>
            </div>

            <div className="hidden md:block flex-1" />

            <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
              <button
                onClick={() => refreshRates()}
                title={lastUpdated ? `Diperbarui: ${lastUpdated.toLocaleTimeString("id-ID")} · Tap untuk perbarui` : "Tap untuk perbarui"}
                className="flex items-center gap-1.5 h-9 px-2 sm:px-3 rounded-xl transition-all hover:bg-[hsl(var(--secondary))] active:scale-95"
                style={{ border: "1px solid hsl(var(--border))" }}
              >
                <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: rateMode === "manual" ? "#0866FF" : "#10b981", boxShadow: rateMode === "manual" ? "0 0 4px #0866FF" : "0 0 4px #10b981" }} />
                <span className="text-[11px] font-semibold text-[hsl(var(--muted-foreground))]" style={{ fontVariantNumeric: "tabular-nums" }}>
                  <span className="hidden sm:inline">USD </span>
                  <span className="font-bold" style={{ color: "#0866FF" }}>Rp{rates.USD ? (rates.USD >= 10000 ? `${(rates.USD / 1000).toFixed(1)}k` : rates.USD.toLocaleString("id-ID")) : "—"}</span>
                  <span className="hidden lg:inline"><span className="mx-1.5 opacity-30">·</span>SAR <span className="font-bold" style={{ color: "#0866FF" }}>Rp{rates.SAR?.toLocaleString("id-ID") ?? "—"}</span></span>
                </span>
                <RefreshCw className={cn("h-3 w-3 shrink-0", ratesLoading && "animate-spin")} style={{ color: "hsl(var(--muted-foreground))" }} strokeWidth={2} />
              </button>

              <button onClick={() => navigate("/itinerary")} className="keep-icon-bg hidden sm:flex items-center gap-2 h-9 px-3 md:px-3.5 rounded-xl text-white text-[12px] font-semibold transition-all hover:opacity-90 active:scale-95 shrink-0" style={{ background: "linear-gradient(135deg, #0866FF, #0654D6)" }}>
                <img src="/chatgpt-icon.png" alt="AI" className="h-3.5 w-3.5 shrink-0 object-contain" />
                <span className="hidden md:inline">AITEM</span>
              </button>

              <div className="hidden sm:flex items-center gap-1.5 h-9 px-2.5 rounded-xl shrink-0" style={{ border: "1px solid hsl(var(--border))" }} title={syncTitle}>
                <span className="relative flex h-2 w-2 shrink-0">
                  {syncStatus === "syncing" && <span className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping" style={{ background: syncInfo.color }} />}
                  <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: syncInfo.color, boxShadow: syncInfo.glow }} />
                </span>
                <span className="hidden lg:block text-[10px] font-semibold text-[hsl(var(--muted-foreground))] leading-none">{syncInfo.label}</span>
              </div>

              <RealtimeIndicator
                showLabel={false}
                compact
                className="hidden xl:inline-block"
              />

              <NotificationBell />

              <button onClick={() => navigate("/settings")} className="flex items-center gap-2 h-9 pl-1.5 pr-1.5 md:pl-2 md:pr-3 rounded-xl transition-colors hover:bg-[hsl(var(--secondary))] shrink-0" style={{ border: "1px solid hsl(var(--border))" }}>
                <div className="h-6 w-6 rounded-lg flex items-center justify-center text-white text-[10px] font-black shrink-0" style={{ background: "linear-gradient(135deg, #0866FF, #0654D6)" }}>
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
            <AnimatePresence mode="sync" initial={false}>
              <motion.main
                key={location.pathname}
                className={`absolute inset-0 overflow-auto ${hideMobileChrome ? "" : "layout-safe-inset"} ${
                  noPadding
                    ? "md:pt-0 md:pb-0"
                    : "px-4 md:pl-10 md:pr-8 md:py-7"
                }`}
                style={{ overscrollBehavior: "contain" }}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              >
                <div className="mx-auto w-full max-w-[1400px]">
                  {children}
                </div>
              </motion.main>
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* ── Mobile floating bottom nav ── */}
      {!hideMobileChrome && <nav
        className={cn(
          "md:hidden fixed z-50 flex items-center px-1",
          keyboardOpen ? "pointer-events-none" : "",
        )}
        style={{
          bottom: "calc(8px + env(safe-area-inset-bottom, 0px))",
          left: "8px",
          right: "8px",
          height: "58px",
          borderRadius: "20px",
          background: "color-mix(in srgb, hsl(var(--card)) 96%, transparent)",
          backdropFilter: "blur(28px) saturate(2)",
          WebkitBackdropFilter: "blur(28px) saturate(2)",
          boxShadow: "0 4px 24px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06), inset 0 0.5px 0 rgba(255,255,255,0.22)",
          willChange: "transform",
          transform: keyboardOpen ? "translateY(200%)" : "translateY(0)",
          transition: "transform 300ms cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        {bottomNav.map((item) => {
          const isMore = item.path === null;
          const isActive = isMore
            ? moreOpen
            : item.isActiveFn
            ? item.isActiveFn(location.pathname, location.search)
            : item.exact
            ? location.pathname === item.path
            : !!item.path && location.pathname.startsWith(item.path);

          return (
            <button
              key={item.label}
              onClick={() => {
                if (isMore) {
                  setMoreOpen((v) => !v);
                } else if (item.path) {
                  setMoreOpen(false);
                  navigate(item.navigateTo ?? item.path);
                }
              }}
              className="relative flex-1 flex flex-col items-center justify-center h-full gap-[3px] active:scale-90 transition-transform select-none"
              style={{ WebkitTapHighlightColor: "transparent" }}
            >
              {/* Active: subtle pill behind icon only */}
              {isActive && (
                <span
                  className="absolute top-[8px] w-10 h-8 rounded-full"
                  style={{ background: "rgba(8,102,255,0.10)" }}
                />
              )}
              <item.icon
                strokeWidth={isActive ? 2.2 : 1.6}
                className={cn(
                  "h-[20px] w-[20px] relative transition-colors",
                  isActive ? "text-[#0866FF]" : "text-[hsl(var(--muted-foreground))]"
                )}
              />
              <span
                className={cn(
                  "relative text-[10px] font-semibold tracking-[0.01em] transition-colors",
                  isActive ? "text-[#0866FF]" : "text-[hsl(var(--muted-foreground))]"
                )}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>}

      {/* ── "Lainnya" full-menu bottom sheet ── */}
      <AnimatePresence>
        {moreOpen && (
          <motion.div
            className="md:hidden fixed inset-0 z-[55] flex flex-col justify-end"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={() => setMoreOpen(false)} />
            <motion.div
              className="relative rounded-t-[28px] overflow-hidden"
              style={{ background: "hsl(var(--card))", boxShadow: "0 -8px 40px rgba(0,0,0,0.18)" }}
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 36, mass: 0.85 }}
            >
              {/* Handle */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="h-1 w-10 rounded-full" style={{ background: "hsl(var(--border))" }} />
              </div>

              <div className="px-5 pb-2 flex items-center justify-between">
                <h3 className="text-[13px] font-bold text-[hsl(var(--foreground))]">Menu Lengkap</h3>
                <button
                  onClick={() => setMoreOpen(false)}
                  className="h-7 w-7 rounded-full flex items-center justify-center transition-colors active:opacity-60"
                  style={{ background: "hsl(var(--secondary))" }}
                >
                  <X strokeWidth={2} className="h-3.5 w-3.5 text-[hsl(var(--muted-foreground))]" />
                </button>
              </div>

              {/* Items grid — grouped for owner, flat for agent/staff */}
              <div className="px-4 pb-5">
                {(!isAgent && !isStaff)
                  ? OWNER_MORE_GROUPS.map((group) => (
                      <div key={group.label}>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-1 mb-2 mt-3">
                          {group.label}
                        </p>
                        <div className="grid grid-cols-4 gap-x-2 gap-y-3">
                          {group.items.map((item) => {
                            const isActive = !!item.path && location.pathname.startsWith(item.path);
                            return (
                              <button
                                key={item.path}
                                onClick={() => { navigate(item.path!); setMoreOpen(false); }}
                                className="flex flex-col items-center gap-1.5 active:scale-90 transition-transform"
                                style={{ WebkitTapHighlightColor: "transparent" }}
                              >
                                <div
                                  className="h-12 w-12 rounded-2xl flex items-center justify-center transition-colors"
                                  style={{ background: isActive ? "hsl(var(--primary) / 0.12)" : "hsl(var(--secondary))" }}
                                >
                                  <item.icon
                                    strokeWidth={isActive ? 2.1 : 1.7}
                                    className="h-5 w-5"
                                    style={{ color: isActive ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))" }}
                                  />
                                </div>
                                <span
                                  className="text-[10px] font-semibold text-center leading-tight"
                                  style={{ color: isActive ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))" }}
                                >
                                  {item.label}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))
                  : (
                    <div className="grid grid-cols-4 gap-x-2 gap-y-4">
                      {moreItems.map((item) => {
                        const isActive = !!item.path && location.pathname.startsWith(item.path);
                        return (
                          <button
                            key={item.path}
                            onClick={() => { navigate(item.path!); setMoreOpen(false); }}
                            className="flex flex-col items-center gap-1.5 active:scale-90 transition-transform"
                            style={{ WebkitTapHighlightColor: "transparent" }}
                          >
                            <div
                              className="h-12 w-12 rounded-2xl flex items-center justify-center transition-colors"
                              style={{ background: isActive ? "hsl(var(--primary) / 0.12)" : "hsl(var(--secondary))" }}
                            >
                              <item.icon
                                strokeWidth={isActive ? 2.1 : 1.7}
                                className="h-5 w-5"
                                style={{ color: isActive ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))" }}
                              />
                            </div>
                            <span
                              className="text-[10px] font-semibold text-center leading-tight"
                              style={{ color: isActive ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))" }}
                            >
                              {item.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )
                }
              </div>

              {/* Logout row */}
              <div className="mx-4 mt-1 pt-3 layout-safe-pb" style={{ borderTop: "1px solid hsl(var(--border))" }}>
                <button
                  onClick={() => { setMoreOpen(false); handleLogout(); }}
                  className="flex items-center gap-2 h-9 px-3 rounded-xl text-red-500 hover:bg-red-50 transition-colors active:opacity-70"
                >
                  <LogOut strokeWidth={1.8} className="h-4 w-4 shrink-0" />
                  <span className="text-[11px] font-semibold">Keluar dari akun</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Mobile search overlay ── */}
      <AnimatePresence>
        {searchOpen && (
          <motion.div
            className="md:hidden fixed inset-0 z-[60]"
            style={{ background: "rgba(0,0,0,0.45)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => setSearchOpen(false)}
          >
            <motion.div
              className="absolute top-0 left-0 right-0 p-4 pb-5"
              style={{ background: "hsl(var(--card))", borderBottom: "1px solid hsl(var(--border))", boxShadow: "0 8px 32px rgba(0,0,0,0.15)" }}
              initial={{ y: -16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -16, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
            >
              <form onSubmit={handleSearchSubmit} className="flex items-center gap-3">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none" style={{ color: "hsl(var(--muted-foreground))" }} strokeWidth={1.8} />
                  <input
                    autoFocus
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cari klien, trip, order…"
                    className="w-full h-11 pl-10 pr-4 rounded-xl text-[13px] outline-none transition-all"
                    style={{ background: "hsl(var(--secondary))", border: "1.5px solid #0866FF", boxShadow: "0 0 0 3px rgba(8,102,255,0.14)", color: "hsl(var(--foreground))" }}
                  />
                </div>
                <button type="button" onClick={() => { setSearchOpen(false); setSearchQuery(""); }} className="h-10 w-10 flex items-center justify-center rounded-xl transition-colors hover:bg-[hsl(var(--secondary))] shrink-0">
                  <X strokeWidth={2} className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
                </button>
              </form>
              <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-2 px-1">Tekan Enter untuk mencari klien &amp; jamaah</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── AI Command Center ── */}
      <AIChatWidget />
    </>
  );
}
