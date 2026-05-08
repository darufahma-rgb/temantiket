import { useState } from "react";
import { AppSidebar } from "./AppSidebar";
import { AIChatWidget } from "./AIChatWidget";
import {
  RefreshCw, Sparkles, Search, Bell, X,
  LayoutDashboard, ShoppingBag, Users, Settings, Package,
  Ticket, Calculator, StickyNote, FileSpreadsheet, BarChart3,
  MessageSquare, Megaphone, BookUser, Trophy, MoreHorizontal, LogOut,
  Landmark, Wallet,
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

interface NavItem {
  icon: React.ElementType;
  label: string;
  path: string | null;
  exact?: boolean;
  navigateTo?: string;
  isActiveFn?: (pathname: string, search: string) => boolean;
}

/* ── Owner ── */
const OWNER_BOTTOM_NAV: NavItem[] = [
  { icon: LayoutDashboard, label: "Home",    path: "/",         exact: true },
  { icon: ShoppingBag,     label: "Order",   path: "/orders"               },
  { icon: Users,           label: "Klien",   path: "/clients"              },
  { icon: Package,         label: "Paket",   path: "/packages"             },
  { icon: MoreHorizontal,  label: "Lainnya", path: null                    },
];
const OWNER_MORE_ITEMS: NavItem[] = [
  { icon: Calculator,      label: "Kalkulator",   path: "/calculator"        },
  { icon: Sparkles,        label: "Itinerary AI", path: "/itinerary"         },
  { icon: Ticket,          label: "Harga Tiket",  path: "/ticket-prices"     },
  { icon: BarChart3,       label: "Laporan",      path: "/reports"           },
  { icon: FileSpreadsheet, label: "Export",       path: "/exports"           },
  { icon: MessageSquare,   label: "Broadcast",    path: "/bc-templates"      },
  { icon: Megaphone,       label: "Caption Gen",  path: "/agent/marketing"   },
  { icon: StickyNote,      label: "Catatan",      path: "/notes"             },
  { icon: BookUser,        label: "Mgt. Agen",    path: "/agent-center"      },
  { icon: Trophy,          label: "Leaderboard",  path: "/agent/leaderboard" },
  { icon: Settings,        label: "Pengaturan",   path: "/settings"          },
];

/* ── Agent ── */
const AGENT_BOTTOM_NAV: NavItem[] = [
  { icon: Trophy,         label: "Home",    path: "/agent",    exact: true },
  { icon: Package,        label: "Paket",   path: "/packages"              },
  { icon: ShoppingBag,    label: "Order",   path: "/orders"                },
  { icon: Users,          label: "Klien",   path: "/clients"               },
  { icon: MoreHorizontal, label: "Lainnya", path: null                     },
];
const AGENT_MORE_ITEMS: NavItem[] = [
  { icon: MessageSquare, label: "Broadcast",    path: "/bc-templates"      },
  { icon: Megaphone,     label: "Caption Gen",  path: "/agent/marketing"   },
  { icon: Trophy,        label: "Leaderboard",  path: "/agent/leaderboard" },
  { icon: Settings,      label: "Pengaturan",   path: "/settings"          },
];

/* ── Staff ── */
const STAFF_BOTTOM_NAV: NavItem[] = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/staff/dashboard", exact: true },
  { icon: Landmark,        label: "Visa",      path: "/staff/visa",      exact: true },
  { icon: Wallet,          label: "Komisi",    path: "/staff/commission", exact: true },
  { icon: BookUser,        label: "Profil",    path: "/staff/profile" },
  { icon: MoreHorizontal,  label: "Lainnya",   path: null             },
];
const STAFF_MORE_ITEMS: NavItem[] = [
  { icon: Calculator, label: "Kalkulator", path: "/calculator" },
  { icon: Settings,   label: "Pengaturan", path: "/settings"   },
];

export function DashboardLayout({ children, noPadding = false }: DashboardLayoutProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [moreOpen, setMoreOpen]     = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const { rates, mode: rateMode, loading: ratesLoading, lastUpdated, refresh: refreshRates } = useRatesStore();
  const { user: currentUser, logout } = useAuthStore();
  const syncStatus = useSyncStatusStore((s) => s.status);
  const lastSync   = useSyncStatusStore((s) => s.lastSync);
  const lastError  = useSyncStatusStore((s) => s.lastError);
  const syncInfo   = SYNC_DOT[syncStatus];
  const syncTitle  = `${syncInfo.label}${lastSync ? ` · ${formatLastSync(lastSync)}` : ""}${lastError ? ` · ${lastError}` : ""}`;

  const displayName = currentUser?.displayName ?? "Temantiket";

  const isAgent = currentUser?.role === "agent";
  const isStaff = currentUser?.role === "staff";
  const homeRoute = isStaff ? "/staff/visa" : isAgent ? "/agent" : "/";
  const bottomNav = isStaff ? STAFF_BOTTOM_NAV : isAgent ? AGENT_BOTTOM_NAV : OWNER_BOTTOM_NAV;
  const moreItems = isStaff ? STAFF_MORE_ITEMS : isAgent ? AGENT_MORE_ITEMS : OWNER_MORE_ITEMS;

  const handleLogout = () => { logout(); navigate("/login"); };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setSearchOpen(false);
      setSearchQuery("");
      navigate("/clients");
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
          <header
            className="md:hidden fixed z-50 flex items-center gap-2 px-2.5"
            style={{
              top: "calc(8px + env(safe-area-inset-top, 0px))",
              left: "8px",
              right: "8px",
              height: "44px",
              borderRadius: "14px",
              background: "color-mix(in srgb, hsl(var(--card)) 94%, transparent)",
              backdropFilter: "blur(20px) saturate(1.8)",
              WebkitBackdropFilter: "blur(20px) saturate(1.8)",
              border: "1px solid hsl(var(--border))",
              boxShadow: "0 2px 12px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.05)",
            }}
          >
            {/* Left — logo */}
            <button
              onClick={() => navigate(homeRoute)}
              className="shrink-0 active:scale-90 transition-transform"
              style={{ WebkitTapHighlightColor: "transparent" }}
            >
              <div
                className="h-[30px] w-[30px] rounded-[9px] flex items-center justify-center"
                style={{
                  background: "linear-gradient(140deg, #2563eb 0%, #1a44d4 60%, #0a2472 100%)",
                  boxShadow: "0 2px 6px rgba(26,68,212,0.30)",
                }}
              >
                <img
                  src="/temantiket-icon.png"
                  alt="Temantiket"
                  className="h-[17px] w-[17px] object-contain"
                  style={{ filter: "brightness(0) invert(1)" }}
                />
              </div>
            </button>

            {/* Center — compact currency pill */}
            <button
              onClick={() => refreshRates()}
              title={lastUpdated ? `Diperbarui: ${lastUpdated.toLocaleTimeString("id-ID")}` : "Tap untuk perbarui"}
              className="flex-1 flex items-center justify-center gap-1.5 h-[30px] rounded-[8px] active:opacity-60 transition-opacity min-w-0 overflow-hidden"
              style={{
                background: "hsl(var(--secondary))",
                border: "1px solid hsl(var(--border))",
              }}
            >
              <span
                className="h-[5px] w-[5px] rounded-full shrink-0"
                style={{
                  background: rateMode === "manual" ? "#2563eb" : "#10b981",
                  boxShadow: rateMode === "manual" ? "0 0 4px rgba(37,99,235,0.8)" : "0 0 4px rgba(16,185,129,0.8)",
                }}
              />
              <span className="text-[11.5px] font-semibold tabular-nums leading-none truncate" style={{ color: "hsl(var(--foreground))" }}>
                <span style={{ color: "hsl(var(--muted-foreground))", fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>USD </span>
                <span className="text-sky-500 font-extrabold">{rates.USD ? `${(rates.USD / 1000).toFixed(1)}k` : "—"}</span>
                {rates.SAR && (
                  <>
                    <span className="mx-1.5 opacity-25">·</span>
                    <span style={{ color: "hsl(var(--muted-foreground))", fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>SAR </span>
                    <span className="text-sky-500 font-extrabold">{rates.SAR.toLocaleString("id-ID")}</span>
                  </>
                )}
              </span>
              <RefreshCw
                className={cn("h-[9px] w-[9px] shrink-0", ratesLoading && "animate-spin")}
                style={{ color: "hsl(var(--muted-foreground))", opacity: 0.4 }}
                strokeWidth={2.5}
              />
            </button>

            {/* Right — search + avatar */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => setSearchOpen(true)}
                className="h-[30px] w-[30px] flex items-center justify-center rounded-[8px] active:scale-90 transition-transform"
                style={{
                  background: "hsl(var(--secondary))",
                  border: "1px solid hsl(var(--border))",
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                <Search strokeWidth={2} className="h-[13px] w-[13px]" style={{ color: "hsl(var(--muted-foreground))" }} />
              </button>

              <button
                onClick={() => navigate("/settings")}
                className="relative h-[30px] w-[30px] shrink-0 active:scale-90 transition-transform"
                title={syncTitle}
                style={{ WebkitTapHighlightColor: "transparent" }}
              >
                <div
                  className="h-full w-full rounded-[9px] flex items-center justify-center text-white text-[11px] font-black"
                  style={{
                    background: "linear-gradient(140deg, #2563eb 0%, #1a44d4 60%, #0a2472 100%)",
                    boxShadow: "0 2px 6px rgba(26,68,212,0.28)",
                  }}
                >
                  {displayName.charAt(0).toUpperCase()}
                </div>
                <span
                  className="absolute bottom-[-1px] right-[-1px] h-[8px] w-[8px] rounded-full border-[1.5px]"
                  style={{
                    background: syncInfo.color,
                    borderColor: "hsl(var(--card))",
                  }}
                />
              </button>
            </div>
          </header>

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
                onFocus={(e) => { e.target.style.borderColor = "#1a44d4"; e.target.style.boxShadow = "0 0 0 3px rgba(14,165,233,0.12)"; }}
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
                <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: rateMode === "manual" ? "#1a44d4" : "#10b981", boxShadow: rateMode === "manual" ? "0 0 4px #1a44d4" : "0 0 4px #10b981" }} />
                <span className="text-[11px] font-semibold text-[hsl(var(--muted-foreground))]" style={{ fontVariantNumeric: "tabular-nums" }}>
                  <span className="hidden sm:inline">USD </span>
                  <span className="text-sky-500 font-bold">Rp{rates.USD ? (rates.USD >= 10000 ? `${(rates.USD / 1000).toFixed(1)}k` : rates.USD.toLocaleString("id-ID")) : "—"}</span>
                  <span className="hidden lg:inline"><span className="mx-1.5 opacity-30">·</span>SAR <span className="text-sky-500 font-bold">Rp{rates.SAR?.toLocaleString("id-ID") ?? "—"}</span></span>
                </span>
                <RefreshCw className={cn("h-3 w-3 shrink-0", ratesLoading && "animate-spin")} style={{ color: "hsl(var(--muted-foreground))" }} strokeWidth={2} />
              </button>

              <button onClick={() => navigate("/itinerary")} className="keep-icon-bg hidden sm:flex items-center gap-2 h-9 px-3 md:px-3.5 rounded-xl text-white text-[12px] font-semibold transition-all hover:opacity-90 active:scale-95 shrink-0" style={{ background: "linear-gradient(135deg, #1a44d4, #0a2472)" }}>
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

              <button className="keep-icon-bg hidden sm:flex relative h-9 w-9 items-center justify-center rounded-xl transition-colors hover:bg-[hsl(var(--secondary))] shrink-0" style={{ border: "1px solid hsl(var(--border))" }} title="Notifikasi">
                <Bell className="h-4 w-4" style={{ color: "hsl(var(--muted-foreground))" }} strokeWidth={1.8} />
              </button>

              <button onClick={() => navigate("/settings")} className="flex items-center gap-2 h-9 pl-1.5 pr-1.5 md:pl-2 md:pr-3 rounded-xl transition-colors hover:bg-[hsl(var(--secondary))] shrink-0" style={{ border: "1px solid hsl(var(--border))" }}>
                <div className="h-6 w-6 rounded-lg flex items-center justify-center text-white text-[10px] font-black shrink-0" style={{ background: "linear-gradient(135deg, #1a44d4, #0a2472)" }}>
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
                className={`absolute inset-0 overflow-auto layout-safe-inset ${
                  noPadding
                    ? "md:pt-0 md:pb-0"
                    : "px-4 md:pl-10 md:pr-8 md:py-7"
                }`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12, ease: "easeOut" }}
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
      <nav
        className="md:hidden fixed z-50 flex items-center"
        style={{
          bottom: "calc(10px + env(safe-area-inset-bottom, 0px))",
          left: "10px",
          right: "10px",
          height: "54px",
          borderRadius: "16px",
          background: "color-mix(in srgb, hsl(var(--card)) 92%, transparent)",
          backdropFilter: "blur(24px) saturate(2)",
          WebkitBackdropFilter: "blur(24px) saturate(2)",
          border: "1px solid hsl(var(--border))",
          boxShadow: "0 8px 28px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.08), inset 0 0.5px 0 rgba(255,255,255,0.18)",
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
              className="relative flex-1 flex flex-col items-center justify-center gap-[3px] h-full transition-all active:scale-90 select-none"
            >
              {isActive && !isMore && (
                <span
                  className="absolute top-0 left-1/2 -translate-x-1/2 h-[2.5px] w-8 rounded-b-full"
                  style={{ background: "#1a44d4" }}
                />
              )}
              <item.icon
                strokeWidth={isActive ? 2.2 : 1.6}
                className={cn(
                  "h-[19px] w-[19px] transition-colors",
                  isActive ? "text-[#1a44d4]" : "text-[hsl(var(--muted-foreground))]"
                )}
              />
              <span className={cn("mobile-nav-label transition-colors", isActive ? "text-[#1a44d4]" : "text-[hsl(var(--muted-foreground))]")}>
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>

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

              {/* Items grid */}
              <div className="px-4 pb-4 grid grid-cols-4 gap-x-2 gap-y-4">
                {moreItems.map((item) => {
                  const isActive = !!item.path && location.pathname.startsWith(item.path);
                  return (
                    <button
                      key={item.path}
                      onClick={() => { navigate(item.path!); setMoreOpen(false); }}
                      className="flex flex-col items-center gap-1.5 active:scale-90 transition-transform"
                    >
                      <div
                        className="h-[50px] w-[50px] rounded-2xl flex items-center justify-center transition-colors"
                        style={{
                          background: isActive ? "rgba(26,68,212,0.1)" : "hsl(var(--secondary))",
                          border: isActive ? "1.5px solid rgba(26,68,212,0.3)" : "1px solid hsl(var(--border))",
                        }}
                      >
                        <item.icon
                          strokeWidth={1.7}
                          className="h-[22px] w-[22px]"
                          style={{ color: isActive ? "#1a44d4" : "hsl(var(--muted-foreground))" }}
                        />
                      </div>
                      <span
                        className="mobile-nav-label text-center"
                        style={{ color: isActive ? "#1a44d4" : "hsl(var(--muted-foreground))" }}
                      >
                        {item.label}
                      </span>
                    </button>
                  );
                })}
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
                    style={{ background: "hsl(var(--secondary))", border: "1.5px solid #1a44d4", boxShadow: "0 0 0 3px rgba(26,68,212,0.10)", color: "hsl(var(--foreground))" }}
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
