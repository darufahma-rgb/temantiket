import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Bell, Users, ShoppingBag, Ticket, Calculator,
  Package, StickyNote, CheckCircle, ChevronRight,
  Map, Home, MoreHorizontal, Calendar, TrendingUp,
  TrendingDown, Sparkles, Grid3X3,
} from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useOrdersStore } from "@/store/ordersStore";
import { useClientsStore } from "@/store/clientsStore";
import { usePackagesStore } from "@/store/packagesStore";
import { useNotificationStore } from "@/store/notificationStore";
import { useRatesStore } from "@/store/ratesStore";
import { getTierInfo } from "@/features/agentPoints/agentTiers";
import { listAgentPoints } from "@/features/agentPoints/agentPointsRepo";
import { revenueIDR } from "@/lib/profit";
import { cn } from "@/lib/utils";
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from "recharts";

// ── helpers ───────────────────────────────────────────────────────────────────

function todayStr() { return new Date().toISOString().slice(0, 10); }
function yesterdayStr() { return new Date(Date.now() - 86_400_000).toISOString().slice(0, 10); }

function pct(curr: number, prev: number): number {
  if (prev === 0) return curr > 0 ? 100 : 0;
  return Math.round(((curr - prev) / prev) * 100);
}

function fmtUSD(idr: number, usdRate: number): string {
  const usd = idr / usdRate;
  if (usd >= 1_000_000) return (usd / 1_000_000).toFixed(1) + "M";
  if (usd >= 1_000) return (usd / 1_000).toFixed(1) + "k";
  return usd.toFixed(0);
}

function fmtIDR(n: number): string {
  if (n >= 1_000_000_000) {
    const v = n / 1_000_000_000;
    const s = parseFloat(v.toFixed(2)).toString().replace(".", ",");
    return "Rp " + s + "M";
  }
  if (n >= 1_000_000) {
    const v = n / 1_000_000;
    const s = parseFloat(v.toFixed(2)).toString().replace(".", ",");
    return "Rp " + s + "jt";
  }
  if (n >= 1_000) {
    const v = n / 1_000;
    const s = parseFloat(v.toFixed(1)).toString().replace(".", ",");
    return "Rp " + s + "rb";
  }
  return "Rp " + n.toLocaleString("id-ID");
}

function fmtAxisY(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(0) + " Jt";
  if (n >= 1_000) return (n / 1_000).toFixed(0) + "k";
  return String(n);
}

function getInitials(name?: string): string {
  if (!name) return "A";
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

function roleLabel(role?: string): string {
  if (role === "owner") return "OWNER";
  if (role === "staff") return "STAFF";
  if (role === "agent") return "AGEN";
  return "USER";
}

function fmtDateLong(): string {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric", month: "long", year: "numeric",
  }).format(new Date());
}

// ── TYPE & STATUS maps ────────────────────────────────────────────────────────

const TYPE_LABEL: Record<string, string> = {
  flight: "Tiket Pesawat", visa_student: "Visa Pelajar",
  visa_voa: "Visa VOA", umrah: "Umrah", other: "Lainnya",
};

const STATUS_COLOR: Record<string, { bg: string; text: string }> = {
  Draft:       { bg: "#f1f5f9", text: "#64748b" },
  Confirmed:   { bg: "#fef3c7", text: "#d97706" },
  Processing:  { bg: "#dbeafe", text: "#2563eb" },
  Paid:        { bg: "#d1fae5", text: "#059669" },
  Completed:   { bg: "#dcfce7", text: "#16a34a" },
  Cancelled:   { bg: "#fee2e2", text: "#dc2626" },
};

// ── QUICK ACCESS items ────────────────────────────────────────────────────────

const QUICK_ROW_1 = [
  { icon: Users,       label: "Klien &\nJamaah",  path: "/clients",           color: "#3b82f6", bg: "#eff6ff" },
  { icon: ShoppingBag, label: "Order\nHub",        path: "/orders",            color: "#8b5cf6", bg: "#f5f3ff" },
  { icon: Ticket,      label: "Harga\nTiket",      path: "/ticket-prices",     color: "#f59e0b", bg: "#fffbeb" },
  { icon: Map,         label: "Itinerary",         path: "/itinerary",         color: "#10b981", bg: "#ecfdf5" },
  { icon: CheckCircle, label: "Visa\nTracker",     path: "/visa-tracker",      color: "#ef4444", bg: "#fef2f2" },
];

const QUICK_ROW_2 = [
  { icon: Calculator,  label: "Kalkulator",        path: "/calculator",        color: "#0066FF", bg: "#eff6ff", ai: false },
  { icon: Package,     label: "Paket &\nTrip",     path: "/packages",          color: "#06b6d4", bg: "#ecfeff", ai: false },
  { icon: Sparkles,    label: "Caption\nAI",       path: "/caption-generator", color: "#f59e0b", bg: "#fffbeb", ai: true  },
  { icon: StickyNote,  label: "Catatan",           path: "/notes",             color: "#6366f1", bg: "#eef2ff", ai: false },
  { icon: Grid3X3,     label: "Lainnya",           path: "/more",              color: "#64748b", bg: "#f8fafc", ai: false },
];

// ── BOTTOM TAB items ──────────────────────────────────────────────────────────

const TABS = [
  { icon: Home,           label: "Home",    path: "/" },
  { icon: ShoppingBag,    label: "Order",   path: "/orders" },
  { icon: Users,          label: "Klien",   path: "/clients" },
  { icon: Package,        label: "Paket",   path: "/packages" },
  { icon: MoreHorizontal, label: "Lainnya", path: "/settings" },
];

// ── DECORATIVE elegant pattern ────────────────────────────────────────────────

function ElegantPattern() {
  return (
    <svg width="160" height="130" viewBox="0 0 160 130" fill="none" xmlns="http://www.w3.org/2000/svg" className="pointer-events-none select-none">
      {/* Concentric rings — top-right anchor */}
      <circle cx="140" cy="20" r="52" stroke="white" strokeOpacity="0.07" strokeWidth="1" fill="none" />
      <circle cx="140" cy="20" r="36" stroke="white" strokeOpacity="0.09" strokeWidth="1" fill="none" />
      <circle cx="140" cy="20" r="20" stroke="white" strokeOpacity="0.12" strokeWidth="1.5" fill="none" />
      <circle cx="140" cy="20" r="7"  fill="white" fillOpacity="0.09" />
      {/* Dot grid */}
      {[0,1,2,3,4,5].map(col =>
        [0,1,2,3].map(row => (
          <circle key={`${col}-${row}`} cx={8 + col * 20} cy={60 + row * 20} r="1.4" fill="white" fillOpacity={0.08 + col * 0.012} />
        ))
      )}
      {/* Diagonal accent lines */}
      <line x1="80" y1="110" x2="160" y2="70"  stroke="white" strokeOpacity="0.06" strokeWidth="1" />
      <line x1="90" y1="128" x2="160" y2="90"  stroke="white" strokeOpacity="0.04" strokeWidth="1" />
      {/* Small diamonds */}
      <rect x="50" y="96" width="7" height="7" rx="1" transform="rotate(45 53.5 99.5)" fill="white" fillOpacity="0.10" />
      <rect x="20" y="50" width="5" height="5" rx="1" transform="rotate(45 22.5 52.5)" fill="white" fillOpacity="0.07" />
      <rect x="110" y="100" width="6" height="6" rx="1" transform="rotate(45 113 103)" fill="white" fillOpacity="0.08" />
    </svg>
  );
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────

export function MobileOwnerDashboard() {
  const navigate  = useNavigate();
  const location  = useLocation();

  const user      = useAuthStore((s) => s.user);
  const { orders, fetchOrders, loaded: ordersLoaded }     = useOrdersStore();
  const { clients, fetchClients, loaded: clientsLoaded }  = useClientsStore();
  const { items: packages, refresh: refreshPkg, loaded: pkgLoaded } = usePackagesStore();
  const { notifications, fetchNotifications } = useNotificationStore();
  const rates     = useRatesStore((s) => s.rates);
  const egpRate   = rates.EGP ?? 515;
  const usdRate   = rates.USD ?? 16_000;

  const [myPoints, setMyPoints] = useState(0);
  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toISOString().slice(0, 7));

  // ── fetch on mount ─────────────────────────────────────────────────────────
  useEffect(() => { if (!ordersLoaded)  void fetchOrders();  }, [ordersLoaded,  fetchOrders]);
  useEffect(() => { if (!clientsLoaded) void fetchClients(); }, [clientsLoaded, fetchClients]);
  useEffect(() => { if (!pkgLoaded)     void refreshPkg();   }, [pkgLoaded,     refreshPkg]);
  useEffect(() => { void fetchNotifications(); }, [fetchNotifications]);

  useEffect(() => {
    if (!user?.id) return;
    listAgentPoints().then((rows) => {
      const total = rows.filter((r) => r.awarded_to === user.id).reduce((s, r) => s + r.points, 0);
      setMyPoints(total);
    }).catch(() => {});
  }, [user?.id]);

  // ── derived data ───────────────────────────────────────────────────────────
  const today     = todayStr();
  const yesterday = yesterdayStr();

  const ordersToday     = useMemo(() => orders.filter((o) => (o.createdAt ?? "").startsWith(today)).length,     [orders, today]);
  const ordersYesterday = useMemo(() => orders.filter((o) => (o.createdAt ?? "").startsWith(yesterday)).length, [orders, yesterday]);

  const clientsToday     = useMemo(() => clients.filter((c) => (c.createdAt ?? "").startsWith(today)).length,     [clients, today]);
  const clientsYesterday = useMemo(() => clients.filter((c) => (c.createdAt ?? "").startsWith(yesterday)).length, [clients, yesterday]);

  const flightToday     = useMemo(() => orders.filter((o) => o.type === "flight" && (o.createdAt ?? "").startsWith(today)).length,     [orders, today]);
  const flightYesterday = useMemo(() => orders.filter((o) => o.type === "flight" && (o.createdAt ?? "").startsWith(yesterday)).length, [orders, yesterday]);

  const pkgDone         = useMemo(() => packages.filter((p) => p.status === "Completed").length, [packages]);
  const pkgDoneYest     = 0; // packages don't have a completed_at timestamp we can compare easily

  const totalRevenue    = useMemo(() => orders.reduce((s, o) => s + revenueIDR(o, egpRate), 0), [orders, egpRate]);
  const unread          = useMemo(() => notifications.filter((n) => !n.is_read).length, [notifications]);

  const recentOrders    = useMemo(() =>
    [...orders]
      .sort((a, b) => new Date(b.createdAt ?? "").getTime() - new Date(a.createdAt ?? "").getTime())
      .slice(0, 4),
    [orders]
  );

  // ── monthly performance chart ──────────────────────────────────────────────
  const monthOptions = useMemo(() => {
    const set = new Set<string>();
    orders.forEach((o) => {
      if (o.createdAt) set.add(o.createdAt.slice(0, 7));
    });
    const arr = Array.from(set).sort().slice(-6);
    return arr.length ? arr : [new Date().toISOString().slice(0, 7)];
  }, [orders]);

  const chartData = useMemo(() => {
    const daysInMonth = new Date(
      Number(selectedMonth.slice(0, 4)),
      Number(selectedMonth.slice(5, 7)),
      0
    ).getDate();

    const buckets: Record<string, number> = {};
    for (let d = 1; d <= daysInMonth; d++) {
      const dayStr = `${selectedMonth}-${String(d).padStart(2, "0")}`;
      buckets[dayStr] = 0;
    }
    orders
      .filter((o) => (o.createdAt ?? "").startsWith(selectedMonth))
      .forEach((o) => {
        const day = (o.createdAt ?? "").slice(0, 10);
        if (day in buckets) buckets[day] += revenueIDR(o, egpRate);
      });

    return Object.entries(buckets).map(([date, rev]) => ({
      day: Number(date.slice(8)),
      rev,
    })).filter((_, i) => i % 3 === 0 || i === Object.keys(buckets).length - 1);
  }, [orders, selectedMonth, egpRate]);

  const totalMonthRevenue = useMemo(() =>
    orders
      .filter((o) => (o.createdAt ?? "").startsWith(selectedMonth))
      .reduce((s, o) => s + revenueIDR(o, egpRate), 0),
    [orders, selectedMonth, egpRate]
  );

  // ── tier ──────────────────────────────────────────────────────────────────
  const tierInfo = getTierInfo(myPoints);
  const tierMeta = tierInfo.current;
  const nextTierMin = tierInfo.next?.minPoints ?? tierMeta.minPoints * 10;

  // ── KPI stats ─────────────────────────────────────────────────────────────
  const KPI_STATS = [
    {
      label: "Order Baru",
      value: ordersToday,
      pctChange: pct(ordersToday, ordersYesterday),
      icon: <ShoppingBag className="h-5 w-5" />,
      color: "#0066FF", bg: "#eff6ff",
    },
    {
      label: "Klien Aktif",
      value: clients.length,
      pctChange: pct(clientsToday, clientsYesterday),
      icon: <Users className="h-5 w-5" />,
      color: "#10b981", bg: "#ecfdf5",
    },
    {
      label: "Tiket Terbit",
      value: flightToday,
      pctChange: pct(flightToday, flightYesterday),
      icon: <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth={1.8}><path d="M21 16v-2l-8-5V3.5A1.5 1.5 0 0 0 11.5 2 1.5 1.5 0 0 0 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5Z"/></svg>,
      color: "#f59e0b", bg: "#fffbeb",
    },
    {
      label: "Paket Done",
      value: pkgDone,
      pctChange: pct(pkgDone, pkgDoneYest),
      icon: <Package className="h-5 w-5" />,
      color: "#8b5cf6", bg: "#f5f3ff",
    },
  ];

  const firstName = user?.displayName?.split(" ")[0] ?? "Admin";

  const monthLabel = (m: string) => {
    return new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(
      new Date(m + "-01")
    );
  };

  return (
    <div className="min-h-screen bg-[#F2F5FB] overflow-x-hidden pb-[76px]">

      {/* ═══════════════════════════════════════════════════════════════
          HEADER
      ═══════════════════════════════════════════════════════════════ */}
      <div
        className="bg-white px-5 pb-3 flex items-center justify-between gap-3"
        style={{
          paddingTop: "calc(12px + env(safe-area-inset-top, 0px))",
          boxShadow: "0 1px 0 rgba(0,0,0,0.06)",
        }}
      >
        {/* Logo */}
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 shrink-0 active:opacity-70"
          style={{ WebkitTapHighlightColor: "transparent" }}
        >
          <img
            src="/temantiket-icon-mark.svg"
            alt="Temantiket"
            className="h-8 w-8 object-contain"
          />
          <div>
            <p className="text-[13px] font-black text-[#0f1c3f] leading-none tracking-tight">temantiket</p>
            <p className="text-[8px] text-slate-400 font-medium leading-none mt-0.5">mudah, cepat, amanah</p>
          </div>
        </button>

        {/* Center: live exchange rates */}
        <button
          onClick={() => navigate("/reports")}
          className="flex items-center gap-1.5 bg-[#F2F5FB] rounded-full px-3 py-1.5 active:opacity-70"
          style={{ WebkitTapHighlightColor: "transparent" }}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" style={{ boxShadow: "0 0 4px #34d399" }} />
          <div className="flex items-center gap-1 leading-none">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">USD</span>
            <span className="text-[12px] font-extrabold text-[#0064E0]">
              {rates.USD ? `${(rates.USD / 1000).toFixed(1)}k` : "—"}
            </span>
            {rates.SAR && (
              <>
                <span className="text-[9px] text-slate-300 mx-0.5">·</span>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">SAR</span>
                <span className="text-[12px] font-extrabold text-[#0064E0]">
                  {rates.SAR.toLocaleString("id-ID")}
                </span>
              </>
            )}
          </div>
        </button>

        {/* Right: bell + avatar */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => navigate("/notifications")}
            className="relative h-9 w-9 rounded-full bg-[#F2F5FB] flex items-center justify-center active:opacity-70"
            style={{ WebkitTapHighlightColor: "transparent" }}
          >
            <Bell strokeWidth={1.8} className="h-5 w-5 text-slate-600" />
            {unread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 h-4 min-w-[16px] px-0.5 rounded-full bg-red-500 text-[9px] font-bold text-white flex items-center justify-center">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </button>
          <button
            onClick={() => navigate("/settings")}
            className="h-9 w-9 rounded-full bg-gradient-to-br from-[#0038B8] to-[#33A6FF] flex items-center justify-center shadow-sm active:opacity-80"
            style={{ WebkitTapHighlightColor: "transparent" }}
          >
            <span className="text-white text-[12px] font-extrabold">{getInitials(user?.displayName)}</span>
          </button>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          HERO CARD
      ═══════════════════════════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="mx-4 mt-4"
      >
        <div
          className="relative rounded-[24px] overflow-hidden"
          style={{
            background: "linear-gradient(135deg, #1a2d8a 0%, #2d4dd4 40%, #4f6ef7 70%, #6f8fff 100%)",
            boxShadow: "0 12px 32px rgba(45,77,212,0.35)",
          }}
        >
          {/* decoration blobs */}
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -top-8 -right-8 h-40 w-40 rounded-full" style={{ background: "radial-gradient(circle, rgba(111,143,255,0.4) 0%, transparent 70%)" }} />
            <div className="absolute -bottom-10 -left-10 h-36 w-36 rounded-full" style={{ background: "radial-gradient(circle, rgba(45,77,212,0.5) 0%, transparent 70%)" }} />
          </div>

          {/* Elegant decorative pattern */}
          <div className="pointer-events-none absolute right-0 top-0">
            <ElegantPattern />
          </div>

          {/* Greeting */}
          <div className="relative px-6 pt-6 pb-0">
            <p className="text-sky-200/80 text-[12px] font-medium mb-1">Assalamu'alaikum,</p>
            <h2 className="text-white text-[28px] font-extrabold leading-none mb-2">{firstName}</h2>
            <span
              className="inline-block px-3 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-widest"
              style={{ background: "rgba(255,255,255,0.18)", color: "#fff", border: "1px solid rgba(255,255,255,0.25)" }}
            >
              {roleLabel(user?.role)}
            </span>
          </div>

          {/* Tier progress bar */}
          <div
            className="relative mt-5 mx-4 mb-4 rounded-2xl px-4 py-3"
            style={{ background: "rgba(0,0,0,0.25)" }}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-white/10 flex items-center justify-center">
                  <span className="text-[14px]">{tierMeta.emoji}</span>
                </div>
                <div>
                  <p className="text-[9px] text-white/50 font-medium uppercase tracking-wider leading-none mb-0.5">Level Anda</p>
                  <p className="text-[13px] font-extrabold text-white leading-none">{tierMeta.label} Agent</p>
                </div>
              </div>
              <p className="text-[11px] font-bold text-white/70 tabular-nums">
                {myPoints.toLocaleString("id-ID")} / {nextTierMin.toLocaleString("id-ID")} Poin
              </p>
            </div>
            <div className="h-1.5 rounded-full bg-white/15 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${Math.min(100, Math.max(3, (myPoints / nextTierMin) * 100))}%`,
                  background: "linear-gradient(90deg, #fbbf24, #f59e0b)",
                }}
              />
            </div>
          </div>
        </div>
      </motion.div>

      {/* ═══════════════════════════════════════════════════════════════
          RINGKASAN HARI INI
      ═══════════════════════════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.38, delay: 0.06, ease: [0.22, 1, 0.36, 1] }}
        className="mx-4 mt-4"
      >
        <div className="bg-white rounded-[20px] px-4 py-4" style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
          {/* header row */}
          <div className="flex items-center justify-between mb-4">
            <p className="text-[15px] font-extrabold text-[#0f1c3f]">Ringkasan Hari Ini</p>
            <div className="flex items-center gap-1.5 text-slate-400">
              <Calendar strokeWidth={1.5} className="h-3.5 w-3.5" />
              <span className="text-[11px] font-medium">{fmtDateLong()}</span>
            </div>
          </div>

          {/* 4 KPI columns */}
          <div className="grid grid-cols-4 divide-x divide-slate-100">
            {KPI_STATS.map((stat, i) => {
              const up = stat.pctChange >= 0;
              return (
                <div key={stat.label} className={cn("flex flex-col items-center gap-1", i > 0 ? "px-1" : "pr-1")}>
                  <div
                    className="h-10 w-10 rounded-2xl flex items-center justify-center"
                    style={{ backgroundColor: stat.bg, color: stat.color }}
                  >
                    {stat.icon}
                  </div>
                  <p className="text-[22px] font-black text-[#0f1c3f] tabular-nums leading-none mt-0.5">
                    {stat.value}
                  </p>
                  <p className="text-[8.5px] font-semibold text-slate-400 text-center leading-tight uppercase tracking-wide px-0.5">
                    {stat.label}
                  </p>
                  <div className="flex items-center gap-0.5">
                    {up
                      ? <TrendingUp className="h-2.5 w-2.5 text-emerald-500" strokeWidth={2.5} />
                      : <TrendingDown className="h-2.5 w-2.5 text-red-400" strokeWidth={2.5} />
                    }
                    <span className={cn("text-[8.5px] font-bold", up ? "text-emerald-500" : "text-red-400")}>
                      {stat.pctChange === 0 ? "0%" : `${up ? "+" : ""}${stat.pctChange}%`}
                    </span>
                  </div>
                  <span className="text-[7.5px] text-slate-300 font-medium">vs kemarin</span>
                </div>
              );
            })}
          </div>
        </div>
      </motion.div>

      {/* ═══════════════════════════════════════════════════════════════
          AKSES CEPAT
      ═══════════════════════════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.38, delay: 0.10, ease: [0.22, 1, 0.36, 1] }}
        className="mx-4 mt-5"
      >
        <p className="text-[15px] font-extrabold text-[#0f1c3f] mb-3">Akses Cepat</p>

        {/* Row 1 */}
        <div className="grid grid-cols-5 gap-1 mb-2">
          {QUICK_ROW_1.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className="flex flex-col items-center gap-1.5 active:opacity-60 transition-opacity"
                style={{ WebkitTapHighlightColor: "transparent" }}
              >
                <div
                  className="h-12 w-12 rounded-2xl flex items-center justify-center shadow-sm"
                  style={{ backgroundColor: item.bg }}
                >
                  <Icon className="h-5 w-5" style={{ color: item.color }} strokeWidth={1.8} />
                </div>
                <p className="text-[9px] font-semibold text-slate-600 text-center leading-tight whitespace-pre-line">
                  {item.label}
                </p>
              </button>
            );
          })}
        </div>

        {/* Row 2 */}
        <div className="grid grid-cols-5 gap-1">
          {QUICK_ROW_2.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className="flex flex-col items-center gap-1.5 active:opacity-60 transition-opacity"
                style={{ WebkitTapHighlightColor: "transparent" }}
              >
                <div
                  className="h-12 w-12 rounded-2xl flex items-center justify-center shadow-sm relative"
                  style={{ backgroundColor: item.bg }}
                >
                  <Icon className="h-5 w-5" style={{ color: item.color }} strokeWidth={1.8} />
                  {item.ai && (
                    <span className="absolute -top-1 -right-1 bg-[#f59e0b] text-white text-[7px] font-extrabold px-1 py-0.5 rounded-full leading-none">
                      AI
                    </span>
                  )}
                </div>
                <p className="text-[9px] font-semibold text-slate-600 text-center leading-tight whitespace-pre-line">
                  {item.label}
                </p>
              </button>
            );
          })}
        </div>
      </motion.div>

      {/* ═══════════════════════════════════════════════════════════════
          AI POWER BANNER
      ═══════════════════════════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.38, delay: 0.14, ease: [0.22, 1, 0.36, 1] }}
        className="mx-4 mt-5"
      >
        <button
          onClick={() => navigate("/caption-generator")}
          className="w-full rounded-[20px] overflow-hidden active:opacity-80 transition-opacity text-left"
          style={{
            background: "linear-gradient(135deg, #5b21b6 0%, #7c3aed 40%, #2563eb 100%)",
            boxShadow: "0 8px 24px rgba(124,58,237,0.30)",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <div className="flex items-center gap-4 px-5 py-4">
            {/* Icon */}
            <div className="h-12 w-12 rounded-2xl flex items-center justify-center shrink-0" style={{ background: "rgba(255,255,255,0.15)" }}>
              <span className="text-[24px] font-black text-white">AI</span>
              <span className="text-white text-[14px] ml-0.5">+</span>
            </div>
            {/* Text */}
            <div className="flex-1 min-w-0">
              <p className="text-white text-[14px] font-extrabold leading-snug">Upgrade ke AI Power</p>
              <p className="text-white/70 text-[10px] mt-0.5 leading-snug">Nikmati fitur AI untuk mengoptimasi bisnis travel Anda.</p>
              <div className="mt-2.5 inline-flex items-center gap-1.5 bg-white/20 border border-white/30 rounded-full px-3 py-1">
                <span className="text-white text-[10px] font-bold">Upgrade Sekarang</span>
                <ChevronRight className="h-3 w-3 text-white" strokeWidth={2.5} />
              </div>
            </div>
            {/* AI chip decoration */}
            <div className="shrink-0 opacity-60">
              <svg viewBox="0 0 48 48" width="48" height="48" fill="none">
                <rect x="14" y="14" width="20" height="20" rx="4" stroke="white" strokeWidth="1.5" />
                <rect x="18" y="18" width="12" height="12" rx="2" fill="white" fillOpacity="0.3" />
                <line x1="9"  y1="19" x2="14" y2="19" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                <line x1="9"  y1="24" x2="14" y2="24" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                <line x1="9"  y1="29" x2="14" y2="29" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                <line x1="39" y1="19" x2="34" y2="19" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                <line x1="39" y1="24" x2="34" y2="24" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                <line x1="39" y1="29" x2="34" y2="29" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                <line x1="19" y1="9"  x2="19" y2="14" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                <line x1="24" y1="9"  x2="24" y2="14" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                <line x1="29" y1="9"  x2="29" y2="14" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                <line x1="19" y1="39" x2="19" y2="34" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                <line x1="24" y1="39" x2="24" y2="34" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                <line x1="29" y1="39" x2="29" y2="34" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
          </div>
        </button>
      </motion.div>

      {/* ═══════════════════════════════════════════════════════════════
          ORDER TERBARU
      ═══════════════════════════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.38, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
        className="mx-4 mt-6"
      >
        <div className="flex items-center justify-between mb-3">
          <p className="text-[15px] font-extrabold text-[#0f1c3f]">Order Terbaru</p>
          <button
            onClick={() => navigate("/orders")}
            className="flex items-center gap-0.5 text-[12px] font-semibold text-[#0066FF] active:opacity-60"
            style={{ WebkitTapHighlightColor: "transparent" }}
          >
            Lihat Semua <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.5} />
          </button>
        </div>

        <div className="bg-white rounded-[20px] overflow-hidden divide-y divide-slate-100" style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
          {recentOrders.length === 0 ? (
            <div className="py-10 text-center">
              <ShoppingBag strokeWidth={1.5} className="h-8 w-8 text-slate-200 mx-auto mb-2" />
              <p className="text-[12px] text-slate-400 font-medium">Belum ada order</p>
            </div>
          ) : (
            recentOrders.map((order, i) => {
              const sc = STATUS_COLOR[order.status ?? "Draft"] ?? STATUS_COLOR["Draft"];
              const typeLabel = TYPE_LABEL[order.type] ?? "Order";
              const dateStr = order.createdAt
                ? new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" }).format(new Date(order.createdAt)) +
                  " • " + new Date(order.createdAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
                : "—";

              return (
                <motion.button
                  key={order.id}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  onClick={() => navigate(`/orders/${order.id}`)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-slate-50 transition-colors"
                  style={{ WebkitTapHighlightColor: "transparent" }}
                >
                  {/* Icon */}
                  <div className="h-10 w-10 rounded-xl bg-[#eff6ff] flex items-center justify-center shrink-0">
                    <ShoppingBag className="h-4.5 w-4.5 text-[#0066FF]" strokeWidth={1.8} />
                  </div>

                  {/* Title + meta */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-bold text-[#0f1c3f] truncate">{order.title ?? typeLabel}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span
                        className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                        style={{ backgroundColor: sc.bg + "CC", color: sc.text }}
                      >
                        {typeLabel}
                      </span>
                      <span className="text-[9px] text-slate-400">{dateStr}</span>
                    </div>
                  </div>

                  {/* Right: status + amount */}
                  <div className="text-right shrink-0">
                    <span
                      className="text-[9px] font-bold px-2 py-0.5 rounded-full block mb-1"
                      style={{ backgroundColor: sc.bg, color: sc.text }}
                    >
                      {order.status ?? "Draft"}
                    </span>
                    <p className="text-[11px] font-bold text-[#0f1c3f] tabular-nums">
                      {fmtIDR(revenueIDR(order, egpRate))}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-300 shrink-0 ml-1" strokeWidth={2} />
                </motion.button>
              );
            })
          )}
        </div>
      </motion.div>

      {/* ═══════════════════════════════════════════════════════════════
          PERFORMA BULANAN
      ═══════════════════════════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.38, delay: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="mx-4 mt-6 mb-4"
      >
        <div className="bg-white rounded-[20px] px-4 pt-4 pb-5" style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
          {/* Header */}
          <div className="flex items-center justify-between mb-1">
            <p className="text-[15px] font-extrabold text-[#0f1c3f]">Performa Bulanan</p>
            <div className="flex items-center gap-1">
              <Calendar strokeWidth={1.5} className="h-3.5 w-3.5 text-slate-400" />
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="text-[11px] font-semibold text-[#0066FF] bg-transparent border-none outline-none cursor-pointer appearance-none pr-3"
                style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%230066FF' strokeWidth='1.5' strokeLinecap='round'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 0px center" }}
              >
                {monthOptions.map((m) => (
                  <option key={m} value={m}>{monthLabel(m)}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Total */}
          <div className="flex items-baseline gap-1.5 mb-4 ml-1">
            <span className="text-[20px] font-black text-[#0066FF] tabular-nums">{fmtIDR(totalMonthRevenue)}</span>
            <span className="text-[10px] text-slate-400 font-medium">{monthLabel(selectedMonth)}</span>
          </div>

          {/* Chart */}
          <div className="h-[140px] -mx-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 9, fill: "#94a3b8", fontWeight: 600 }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 9, fill: "#94a3b8", fontWeight: 600 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={fmtAxisY}
                  width={44}
                />
                <Tooltip
                  contentStyle={{
                    background: "#0f1c3f", border: "none", borderRadius: 10,
                    padding: "6px 10px", fontSize: 10, color: "#fff",
                  }}
                  formatter={(v: number) => [fmtIDR(v), "Revenue"]}
                  labelFormatter={(l) => `Tgl ${l}`}
                  cursor={{ stroke: "#0066FF", strokeWidth: 1, strokeDasharray: "4 2" }}
                />
                <Line
                  type="monotone"
                  dataKey="rev"
                  stroke="#0066FF"
                  strokeWidth={2.5}
                  dot={{ fill: "#0066FF", r: 3, strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: "#0066FF", strokeWidth: 2, stroke: "#fff" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </motion.div>

      {/* ═══════════════════════════════════════════════════════════════
          BOTTOM TAB BAR
      ═══════════════════════════════════════════════════════════════ */}
      <div
        className="fixed bottom-0 left-0 right-0 md:hidden z-50"
        style={{
          background: "white",
          boxShadow: "0 -1px 0 rgba(0,0,0,0.06), 0 -4px 16px rgba(0,0,0,0.08)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <div className="grid grid-cols-5 h-[60px]">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = tab.path === "/"
              ? location.pathname === "/"
              : location.pathname.startsWith(tab.path);
            return (
              <button
                key={tab.path}
                onClick={() => navigate(tab.path)}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 transition-colors active:opacity-60",
                  isActive ? "text-[#0066FF]" : "text-slate-400"
                )}
                style={{ WebkitTapHighlightColor: "transparent" }}
              >
                <Icon
                  strokeWidth={isActive ? 2.5 : 1.8}
                  className="h-5 w-5"
                  fill={isActive ? "currentColor" : "none"}
                />
                <span className={cn("text-[9px] font-semibold", isActive && "font-extrabold")}>
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

    </div>
  );
}
