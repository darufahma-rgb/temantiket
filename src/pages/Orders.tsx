import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams, Link } from "react-router-dom";
import { ShoppingBag, Plus, Search, ArrowLeft, ChevronRight, TrendingUp, Wallet, AlertTriangle, Plane, FileText, Package, SlidersHorizontal, X, CheckCircle, Clock, XCircle, GraduationCap, ChevronDown, LayoutList, LayoutGrid, CalendarDays, RotateCcw, CreditCard, BadgeCheck, Activity, User, MessageSquare, DollarSign } from "lucide-react";
import { PieChart, Pie, Cell } from "recharts";
import { MobileFAB } from "@/components/MobileFAB";
import { AnimatePresence } from "framer-motion";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { useOrdersStore } from "@/store/ordersStore";
import { useClientsStore, type Client } from "@/store/clientsStore";
import { useAuthStore } from "@/store/authStore";
import { useRatesStore } from "@/store/ratesStore";
import { useNotificationStore } from "@/store/notificationStore";
import { revenueIDR } from "@/lib/profit";
import {
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_STYLE,
  PAYMENT_STATUS_EMOJI,
  derivePaymentStatus,
} from "@/lib/paymentStatus";
import { getCommissionForOrderType, loadProductCommissions } from "@/lib/productCommissions";
import {
  ORDER_TYPES, ORDER_TYPE_LABEL, ORDER_TYPE_EMOJI,
  type OrderType,
} from "@/features/orders/ordersRepo";
import { PassportScanButton } from "@/components/PassportScanButton";
import { decidePassportSync } from "@/features/clients/passportSync";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAIContextStore } from "@/store/aiContextStore";

function fmtIDRShort(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}M`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}Jt`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}Rb`;
  return String(n);
}

/** Tampilkan harga order sesuai mata uang aslinya (EGP atau IDR). */
function fmtOrderPrice(totalPrice: number, currency: string): string {
  if (currency === "EGP") return `EGP ${totalPrice.toLocaleString("en")}`;
  return fmtIDR(totalPrice);
}

// Mata uang default per tipe order — visa Mesir dijual dalam EGP, sisanya IDR.
const CURRENCY_BY_TYPE: Record<OrderType, "IDR" | "EGP"> = {
  umrah: "IDR",
  flight: "IDR",
  visa_voa: "EGP",
  visa_student: "EGP",
};
const CURRENCY_SYMBOL: Record<"IDR" | "EGP", string> = { IDR: "Rp", EGP: "EGP" };

const fmtIDR = (v: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(v);

function isOrderType(v: string | undefined): v is OrderType {
  return !!v && (ORDER_TYPES as readonly string[]).includes(v);
}

export default function Orders() {
  const params = useParams<{ type?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const typeFilter: OrderType | undefined = isOrderType(params.type) ? params.type : undefined;
  const clientIdParam = searchParams.get("clientId") || undefined;

  const { orders, loadingOrders, fetchOrders, addOrder, loaded: ordersLoaded } = useOrdersStore();
  const { clients, fetchClients, loaded: clientsLoaded } = useClientsStore();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);

  const [q, setQ] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [mobileCat, setMobileCat] = useState<"all" | "flight" | "arsip">("all");
  const [showSearch, setShowSearch] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [mobileStatus, setMobileStatus] = useState<string>("all");
  const [mobileSortOrder, setMobileSortOrder] = useState<"newest" | "oldest">("newest");

  const { setPageContext, setPageData, clearContext } = useAIContextStore();
  useEffect(() => {
    setPageContext({ pageId: "orders", pageTitle: "Manajemen Order" });
    return () => clearContext();
  }, [setPageContext, clearContext]);

  useEffect(() => {
    setPageData({
      totalOrders: orders.length,
      recentOrders: orders.slice(0, 10).map((o) => ({
        id: o.id,
        type: o.type,
        status: o.status,
        title: o.title ?? null,
        totalPrice: o.totalPrice,
        currency: o.currency,
      })),
    });
  }, [orders.length, setPageData]);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (!ordersLoaded) void fetchOrders();
    if (!clientsLoaded) void fetchClients();
  }, [isAuthenticated, ordersLoaded, clientsLoaded, fetchOrders, fetchClients]);

  const clientNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of clients) m.set(c.id, c.name);
    return m;
  }, [clients]);

  const filtered = useMemo(() => {
    let out = orders;
    if (typeFilter) out = out.filter((o) => o.type === typeFilter);
    if (clientIdParam) out = out.filter((o) => o.clientId === clientIdParam);
    const s = q.trim().toLowerCase();
    if (s) {
      out = out.filter((o) =>
        (o.title ?? "").toLowerCase().includes(s) ||
        (clientNameById.get(o.clientId ?? "") ?? "").toLowerCase().includes(s) ||
        o.status.toLowerCase().includes(s),
      );
    }
    return out;
  }, [orders, typeFilter, clientIdParam, q, clientNameById]);

  const egpRate = useRatesStore((s) => s.rates.EGP ?? 515);
  const totalRevenue = useMemo(
    () => orders.filter(o => o.status !== "Cancelled").reduce((s, o) => s + revenueIDR(o, egpRate), 0),
    [orders, egpRate],
  );
  const draftCount   = useMemo(() => orders.filter(o => o.status === "Draft").length, [orders]);
  const doneCount    = useMemo(() => orders.filter(o => ["Done", "Paid", "Completed"].includes(o.status)).length, [orders]);

  // Mobile-specific category filter
  const mobileFiltered = useMemo(() => {
    let out = orders;
    if (mobileCat === "flight") out = out.filter(o => o.type === "flight");
    else if (mobileCat === "arsip") out = out.filter(o => o.status === "Cancelled");
    else {
      if (mobileStatus === "selesai") out = out.filter(o => ["Done","Paid","Completed"].includes(o.status));
      else if (mobileStatus === "diproses") out = out.filter(o => ["Draft","Confirmed","Processing"].includes(o.status));
      else if (mobileStatus === "dibatalkan") out = out.filter(o => o.status === "Cancelled");
    }
    const s = q.trim().toLowerCase();
    if (s) out = out.filter(o =>
      (o.title ?? "").toLowerCase().includes(s) ||
      (clientNameById.get(o.clientId ?? "") ?? "").toLowerCase().includes(s) ||
      o.status.toLowerCase().includes(s),
    );
    return out;
  }, [orders, mobileCat, mobileStatus, q, clientNameById]);

  const mSelesai    = useMemo(() => orders.filter(o => ["Done","Paid","Completed"].includes(o.status)).length, [orders]);
  const mDiproses   = useMemo(() => orders.filter(o => ["Draft","Confirmed","Processing"].includes(o.status)).length, [orders]);
  const mDibatalkan = useMemo(() => orders.filter(o => o.status === "Cancelled").length, [orders]);

  // ── Mobile: notification store + rates for header ──────────────────
  const { notifications, fetchNotifications } = useNotificationStore();
  useEffect(() => { void fetchNotifications(); }, [fetchNotifications]);
  const mUnread = useMemo(() => notifications.filter(n => !n.is_read).length, [notifications]);
  const usdRate = useRatesStore((s) => s.rates.USD ?? 16_000);
  const mTotalRevIDR = useMemo(() => orders.filter(o => o.status !== "Cancelled").reduce((s, o) => s + revenueIDR(o, egpRate), 0), [orders, egpRate]);
  function fmtUSD(idr: number): string {
    const usd = idr / usdRate;
    if (usd >= 1_000_000) return (usd / 1_000_000).toFixed(1) + "M";
    if (usd >= 1_000) return (usd / 1_000).toFixed(1) + "k";
    return usd.toFixed(0);
  }
  function getInitialsMob(name?: string): string {
    if (!name) return "A";
    return name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
  }

  // ── Mobile: yesterday comparison ───────────────────────────────────
  const todayS     = new Date().toISOString().slice(0, 10);
  const yesterdayS = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  function mPct(curr: number, prev: number): number {
    if (prev === 0) return curr > 0 ? 100 : 0;
    return Math.round(((curr - prev) / prev) * 100);
  }
  const mTotalToday     = useMemo(() => orders.filter(o => (o.createdAt ?? "").startsWith(todayS)).length, [orders, todayS]);
  const mTotalYest      = useMemo(() => orders.filter(o => (o.createdAt ?? "").startsWith(yesterdayS)).length, [orders, yesterdayS]);
  const mSelesaiToday   = useMemo(() => orders.filter(o => ["Done","Paid","Completed"].includes(o.status) && (o.createdAt ?? "").startsWith(todayS)).length, [orders, todayS]);
  const mSelesaiYest    = useMemo(() => orders.filter(o => ["Done","Paid","Completed"].includes(o.status) && (o.createdAt ?? "").startsWith(yesterdayS)).length, [orders, yesterdayS]);
  const mDiprosesToday  = useMemo(() => orders.filter(o => ["Draft","Confirmed","Processing"].includes(o.status) && (o.createdAt ?? "").startsWith(todayS)).length, [orders, todayS]);
  const mDiprosesYest   = useMemo(() => orders.filter(o => ["Draft","Confirmed","Processing"].includes(o.status) && (o.createdAt ?? "").startsWith(yesterdayS)).length, [orders, yesterdayS]);
  const mBatalToday     = useMemo(() => orders.filter(o => o.status === "Cancelled" && (o.createdAt ?? "").startsWith(todayS)).length, [orders, todayS]);
  const mBatalYest      = useMemo(() => orders.filter(o => o.status === "Cancelled" && (o.createdAt ?? "").startsWith(yesterdayS)).length, [orders, yesterdayS]);

  const heading = typeFilter
    ? `Order — ${ORDER_TYPE_LABEL[typeFilter]}`
    : "Semua Order";

  const STATUS_STYLE: Record<string, string> = {
    Draft:     "bg-gray-100 text-gray-500",
    Confirmed: "bg-amber-100 text-amber-700",
    Paid:      "bg-emerald-100 text-emerald-700",
    Done:      "bg-purple-100 text-purple-700",
    Completed: "bg-purple-100 text-purple-700",
    Cancelled: "bg-red-100 text-red-600",
  };

  // ── Desktop-specific state ──────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<"all" | OrderType>("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterJenis, setFilterJenis]   = useState("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterRange, setFilterRange]   = useState("all");
  const [viewMode, setViewMode]         = useState<"list" | "grid">("list");

  // ── Desktop counts ─────────────────────────────────────────────────
  const completedCount = useMemo(() => orders.filter(o => ["Done","Paid","Completed"].includes(o.status)).length, [orders]);
  const confirmedCount = useMemo(() => orders.filter(o => o.status === "Confirmed").length, [orders]);
  const pendingCount   = useMemo(() => orders.filter(o => o.status === "Draft").length, [orders]);
  const cancelledCount = useMemo(() => orders.filter(o => o.status === "Cancelled").length, [orders]);

  // ── Month-over-month growth ────────────────────────────────────────
  const nowD       = new Date();
  const thisMonthStr = `${nowD.getFullYear()}-${String(nowD.getMonth()+1).padStart(2,"0")}`;
  const lastMonthD   = new Date(nowD.getFullYear(), nowD.getMonth()-1, 1);
  const lastMonthStr = `${lastMonthD.getFullYear()}-${String(lastMonthD.getMonth()+1).padStart(2,"0")}`;
  const tmo = useMemo(() => orders.filter(o => o.createdAt.startsWith(thisMonthStr)), [orders, thisMonthStr]);
  const lmo = useMemo(() => orders.filter(o => o.createdAt.startsWith(lastMonthStr)), [orders, lastMonthStr]);
  function growPct(cur: number, prev: number) {
    if (prev === 0) return cur > 0 ? 100 : 0;
    return Math.round(((cur - prev) / prev) * 100);
  }
  const growTotal     = growPct(tmo.length, lmo.length);
  const growCompleted = growPct(
    tmo.filter(o => ["Done","Paid","Completed"].includes(o.status)).length,
    lmo.filter(o => ["Done","Paid","Completed"].includes(o.status)).length,
  );
  const growConfirmed = growPct(
    tmo.filter(o => o.status === "Confirmed").length,
    lmo.filter(o => o.status === "Confirmed").length,
  );
  const growPending = growPct(
    tmo.filter(o => o.status === "Draft").length,
    lmo.filter(o => o.status === "Draft").length,
  );
  const growRevenue = growPct(
    tmo.filter(o => o.status !== "Cancelled").reduce((s, o) => s + revenueIDR(o, egpRate), 0),
    lmo.filter(o => o.status !== "Cancelled").reduce((s, o) => s + revenueIDR(o, egpRate), 0),
  );

  // ── INV number map ─────────────────────────────────────────────────
  const invNumbers = useMemo(() => {
    const sorted = [...orders].sort((a,b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const m = new Map<string, string>();
    sorted.forEach((o, i) => {
      const d = new Date(o.createdAt);
      const yy = String(d.getFullYear()).slice(2);
      const mm = String(d.getMonth()+1).padStart(2,"0");
      const dd = String(d.getDate()).padStart(2,"0");
      m.set(o.id, `INV-${yy}${mm}${dd}-${String(i+1).padStart(4,"0")}`);
    });
    return m;
  }, [orders]);

  // ── Desktop filtered list ──────────────────────────────────────────
  const desktopFiltered = useMemo(() => {
    let out = orders;
    if (activeTab !== "all") out = out.filter(o => o.type === activeTab);
    if (filterStatus === "completed") out = out.filter(o => ["Done","Paid","Completed"].includes(o.status));
    else if (filterStatus === "confirmed") out = out.filter(o => o.status === "Confirmed");
    else if (filterStatus === "pending")   out = out.filter(o => o.status === "Draft");
    else if (filterStatus === "cancelled") out = out.filter(o => o.status === "Cancelled");
    if (filterJenis !== "all") out = out.filter(o => o.type === filterJenis);
    if (filterRange === "under1m")   out = out.filter(o => revenueIDR(o, egpRate) < 1_000_000);
    else if (filterRange === "1m5m") out = out.filter(o => { const v = revenueIDR(o, egpRate); return v >= 1_000_000 && v < 5_000_000; });
    else if (filterRange === "above5m") out = out.filter(o => revenueIDR(o, egpRate) >= 5_000_000);
    const s = q.trim().toLowerCase();
    if (s) out = out.filter(o =>
      (o.title ?? "").toLowerCase().includes(s) ||
      (clientNameById.get(o.clientId ?? "") ?? "").toLowerCase().includes(s) ||
      o.status.toLowerCase().includes(s) ||
      (invNumbers.get(o.id) ?? "").toLowerCase().includes(s),
    );
    return [...out].sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [orders, activeTab, filterStatus, filterJenis, filterRange, q, clientNameById, egpRate, invNumbers]);

  // ── Recent activity (last 8 orders) ───────────────────────────────
  const recentActivity = useMemo(() =>
    [...orders].sort((a,b) => new Date(b.updatedAt ?? b.createdAt).getTime() - new Date(a.updatedAt ?? a.createdAt).getTime()).slice(0, 8),
  [orders]);

  return (
    <>
      {/* ══════════════════════════════════════════════════════════
           MOBILE LAYOUT  (md:hidden) — Native App Style
      ══════════════════════════════════════════════════════════ */}
      <div className="md:hidden min-h-screen bg-[#F2F5FB] pb-[76px] -mx-4">

        {/* ── PAGE HEADER ── */}
        <div
          className="bg-white px-4 pb-3 sticky top-0 z-20"
          style={{ paddingTop: "calc(60px + env(safe-area-inset-top, 0px))", boxShadow: "0 1px 0 rgba(0,0,0,0.06)" }}
        >
          <div className="flex items-center gap-2">
            <button onClick={() => navigate(-1)} className="h-9 w-9 rounded-full bg-[#F2F5FB] flex items-center justify-center active:opacity-60 shrink-0" style={{ WebkitTapHighlightColor: "transparent" }}>
              <ArrowLeft className="h-4 w-4 text-[#0f1c3f]" strokeWidth={2} />
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="text-[17px] font-extrabold text-[#0f1c3f] leading-tight truncate">Order Hub</h1>
              <p className="text-[10px] text-slate-400 font-medium leading-none mt-0.5 truncate">Kelola semua pesanan dalam satu tempat</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button onClick={() => { setShowSearch(s => !s); if (showSearch) setQ(""); }} className="h-9 w-9 rounded-full bg-[#F2F5FB] flex items-center justify-center active:opacity-60" style={{ WebkitTapHighlightColor: "transparent" }}>
                {showSearch ? <X className="h-4 w-4 text-[#0f1c3f]" strokeWidth={2} /> : <Search className="h-4 w-4 text-[#0f1c3f]" strokeWidth={2} />}
              </button>
              <button onClick={() => setShowFilter(s => !s)} className={cn("h-9 px-3 rounded-full flex items-center gap-1.5 text-[11px] font-bold active:opacity-60 transition-all", showFilter || mobileStatus !== "all" ? "bg-[#0066FF] text-white" : "bg-[#F2F5FB] text-[#0f1c3f]")} style={{ WebkitTapHighlightColor: "transparent" }}>
                <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={2} />
                Filter
                {mobileStatus !== "all" && <span className="h-4 w-4 rounded-full bg-white text-[#0066FF] text-[9px] font-black flex items-center justify-center">1</span>}
              </button>
              <button onClick={() => setAddOpen(true)} className="h-9 w-9 rounded-full flex items-center justify-center text-white shadow-sm active:opacity-80" style={{ background: "linear-gradient(135deg,#0066FF,#0038B8)", WebkitTapHighlightColor: "transparent" }}>
                <Plus className="h-4 w-4" strokeWidth={2.5} />
              </button>
            </div>
          </div>

          {/* Search input */}
          <AnimatePresence>
            {showSearch && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                <div className="relative mt-3">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input autoFocus type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="Cari judul, klien, status…" className="w-full h-11 pl-10 pr-10 rounded-2xl text-[13px] outline-none bg-[#F2F5FB] border border-transparent text-[#0f1c3f] placeholder-slate-400 focus:border-blue-300 focus:ring-2 focus:ring-blue-100 transition-all" />
                  {q && <button onClick={() => setQ("")} className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 rounded-full bg-slate-200 flex items-center justify-center active:opacity-60"><X className="h-3 w-3 text-slate-500" /></button>}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Filter chips */}
          <AnimatePresence>
            {showFilter && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                <div className="mt-3 pt-3 border-t border-slate-100">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Status Order</p>
                  <div className="flex flex-wrap gap-2">
                    {[{ id: "all", label: "Semua", count: orders.length }, { id: "diproses", label: "Diproses", count: mDiproses }, { id: "selesai", label: "Selesai", count: mSelesai }, { id: "dibatalkan", label: "Dibatalkan", count: mDibatalkan }].map(f => (
                      <button key={f.id} onClick={() => setMobileStatus(f.id)} className={cn("h-8 px-3 rounded-full text-[11px] font-bold border transition-all active:scale-95", mobileStatus === f.id ? "bg-[#0066FF] text-white border-transparent" : "bg-white text-slate-600 border-slate-200")} style={{ WebkitTapHighlightColor: "transparent" }}>
                        {f.label} <span className="opacity-70">({f.count})</span>
                      </button>
                    ))}
                  </div>
                  {mobileStatus !== "all" && <button onClick={() => setMobileStatus("all")} className="mt-2 text-[11px] text-[#0066FF] font-semibold active:opacity-60">Reset Filter</button>}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── CATEGORY TABS ── */}
        <div className="bg-white px-4 py-3 border-b border-slate-100">
          <div className="flex gap-2 overflow-x-auto scrollbar-none">
            {([
              { id: "all" as const,    label: "Semua Order",   count: orders.length },
              { id: "flight" as const, label: "Tiket Pesawat", count: orders.filter(o => o.type === "flight").length },
              { id: "arsip" as const,  label: "Arsip",         count: mDibatalkan },
            ]).map(tab => (
              <button key={tab.id} onClick={() => { setMobileCat(tab.id); setMobileStatus("all"); }}
                className={cn("shrink-0 h-9 px-4 rounded-full text-[12px] font-bold flex items-center gap-1.5 whitespace-nowrap transition-all active:scale-95 border",
                  mobileCat === tab.id ? "text-white border-transparent shadow-md" : "bg-white text-slate-500 border-slate-200"
                )}
                style={mobileCat === tab.id ? { background: "linear-gradient(135deg,#0066FF,#0038B8)", WebkitTapHighlightColor: "transparent" } : { WebkitTapHighlightColor: "transparent" }}
              >
                {tab.label}
                <span className={cn("text-[9px] font-extrabold px-1.5 py-0.5 rounded-full", mobileCat === tab.id ? "bg-white/25 text-white" : "bg-slate-100 text-slate-500")}>{tab.count}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="px-4 pt-4 space-y-4">

          {/* ── CLIENT FILTER BADGE ── */}
          {clientIdParam && clientNameById.get(clientIdParam) && (
            <div className="flex items-center gap-2.5 bg-white border border-sky-200 rounded-2xl px-4 py-3 shadow-sm">
              <div className="h-8 w-8 rounded-xl bg-[#dbeafe] flex items-center justify-center text-[#0066FF] text-[12px] font-extrabold shrink-0">{clientNameById.get(clientIdParam)!.charAt(0).toUpperCase()}</div>
              <p className="text-[12px] text-[#0f1c3f] font-semibold flex-1 truncate">Klien: <span className="font-bold">{clientNameById.get(clientIdParam)}</span></p>
              <button onClick={() => navigate("/orders")} className="text-[11px] text-[#0066FF] font-bold active:opacity-70 shrink-0 flex items-center gap-1"><X className="h-3.5 w-3.5" /> Hapus</button>
            </div>
          )}

          {/* ── RINGKASAN ORDER ── */}
          <div className="bg-white rounded-[20px] px-4 py-4" style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
            <div className="flex items-center justify-between mb-4">
              <p className="text-[15px] font-extrabold text-[#0f1c3f]">Ringkasan Order</p>
              <div className="flex items-center gap-1.5 text-slate-400">
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                <span className="text-[11px] font-medium">{new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" }).format(new Date())}</span>
              </div>
            </div>
            <div className="grid grid-cols-4 divide-x divide-slate-100">
              {[
                { label: "Total",      value: orders.length,  today: mTotalToday,    yest: mTotalYest,    icon: <ShoppingBag className="h-5 w-5" />, color: "#0066FF", bg: "#eff6ff", onClick: () => setMobileCat("all") },
                { label: "Selesai",    value: mSelesai,       today: mSelesaiToday,  yest: mSelesaiYest,  icon: <CheckCircle  className="h-5 w-5" />, color: "#10b981", bg: "#ecfdf5", onClick: () => setMobileStatus("selesai") },
                { label: "Diproses",   value: mDiproses,      today: mDiprosesToday, yest: mDiprosesYest, icon: <Clock        className="h-5 w-5" />, color: "#f59e0b", bg: "#fffbeb", onClick: () => setMobileStatus("diproses") },
                { label: "Dibatalkan", value: mDibatalkan,    today: mBatalToday,    yest: mBatalYest,    icon: <XCircle      className="h-5 w-5" />, color: "#ef4444", bg: "#fef2f2", onClick: () => setMobileStatus("dibatalkan") },
              ].map((stat, i) => {
                const change = mPct(stat.today, stat.yest);
                const up = change >= 0;
                return (
                  <button key={stat.label} onClick={stat.onClick} className={cn("flex flex-col items-center gap-1 active:opacity-70 transition-opacity", i > 0 ? "px-1" : "pr-1")} style={{ WebkitTapHighlightColor: "transparent" }}>
                    <div className="h-10 w-10 rounded-2xl flex items-center justify-center" style={{ backgroundColor: stat.bg, color: stat.color }}>{stat.icon}</div>
                    <p className="text-[22px] font-black text-[#0f1c3f] tabular-nums leading-none mt-0.5">{stat.value}</p>
                    <p className="text-[8.5px] font-semibold text-slate-400 text-center leading-tight uppercase tracking-wide px-0.5">{stat.label}</p>
                    <div className="flex items-center gap-0.5">
                      {up ? <TrendingUp className="h-2.5 w-2.5 text-emerald-500" strokeWidth={2.5} /> : <TrendingUp className="h-2.5 w-2.5 text-red-400 rotate-180" strokeWidth={2.5} />}
                      <span className={cn("text-[8.5px] font-bold", up ? "text-emerald-500" : "text-red-400")}>{change === 0 ? "0%" : `${up ? "+" : ""}${change}%`}</span>
                    </div>
                    <span className="text-[7.5px] text-slate-300 font-medium">vs kemarin</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── INSIGHT BANNER ── */}
          <button
            onClick={() => navigate("/reports")}
            className="w-full rounded-[20px] overflow-hidden text-left active:opacity-80 transition-opacity"
            style={{ background: "linear-gradient(135deg,#1a2d8a 0%,#2d4dd4 45%,#4f6ef7 100%)", boxShadow: "0 8px 24px rgba(45,77,212,0.25)", WebkitTapHighlightColor: "transparent" }}
          >
            <div className="flex items-center gap-3 px-5 py-4">
              <div className="h-11 w-11 rounded-2xl flex items-center justify-center shrink-0" style={{ background: "rgba(255,255,255,0.15)" }}>
                <svg viewBox="0 0 24 24" className="h-6 w-6 text-white" fill="none" stroke="currentColor" strokeWidth="1.8"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-[14px] font-extrabold leading-snug">Kelola bisnis travel</p>
                <p className="text-white/70 text-[10px] mt-0.5 leading-snug">Pantau semua order dan tingkatkan layanan untuk klien Anda.</p>
                <div className="mt-2 inline-flex items-center gap-1.5 bg-white/20 border border-white/30 rounded-full px-3 py-1">
                  <span className="text-white text-[10px] font-bold">Lihat Insight</span>
                  <ChevronRight className="h-3 w-3 text-white" strokeWidth={2.5} />
                </div>
              </div>
              {/* Decorative illustration */}
              <div className="shrink-0 opacity-75 pointer-events-none">
                <svg viewBox="0 0 80 70" width="80" height="70" fill="none">
                  <rect x="12" y="8" width="36" height="48" rx="5" fill="white" fillOpacity="0.25"/>
                  <rect x="17" y="16" width="26" height="3" rx="1.5" fill="white" fillOpacity="0.60"/>
                  <rect x="17" y="22" width="20" height="2" rx="1" fill="white" fillOpacity="0.40"/>
                  <rect x="17" y="27" width="23" height="2" rx="1" fill="white" fillOpacity="0.40"/>
                  <circle cx="19" cy="35" r="2" fill="#4ade80"/>
                  <rect x="23" y="33.5" width="14" height="2" rx="1" fill="white" fillOpacity="0.50"/>
                  <circle cx="19" cy="42" r="2" fill="#4ade80"/>
                  <rect x="23" y="40.5" width="10" height="2" rx="1" fill="white" fillOpacity="0.50"/>
                  <path d="M55 30 C57 27 63 26 67 29 L70 27 C71 26.5 72 27.5 71.5 28.5 L68 29.5 L70 33 C70.5 34 70 35 69 34.5 L66 33 L64 36 C63 37 62 36.5 62 35.5 L63 32.5 L59 31.5 L55 34 C54 34.5 53.5 33.5 54 33 L56 31 L53 30 C52 29.5 52.5 28.5 55 30Z" fill="white" fillOpacity="0.80"/>
                  <ellipse cx="32" cy="5" rx="10" ry="4.5" fill="white" fillOpacity="0.18"/>
                  <ellipse cx="40" cy="3" rx="7" ry="3.5" fill="white" fillOpacity="0.14"/>
                </svg>
              </div>
            </div>
          </button>

          {/* ── DAFTAR ORDER ── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[15px] font-extrabold text-[#0f1c3f]">Daftar Order</p>
              <button onClick={() => setMobileSortOrder(s => s === "newest" ? "oldest" : "newest")} className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 active:opacity-60" style={{ WebkitTapHighlightColor: "transparent" }}>
                Urutkan: {mobileSortOrder === "newest" ? "Terbaru" : "Terlama"}
                <ChevronDown className="h-3.5 w-3.5" strokeWidth={2} />
              </button>
            </div>

            {loadingOrders && orders.length === 0 ? (
              <div className="bg-white rounded-[20px] overflow-hidden divide-y divide-slate-100" style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
                {[1,2,3].map(i => (
                  <div key={i} className="p-4 flex items-center gap-3 animate-pulse">
                    <div className="h-11 w-11 rounded-2xl bg-slate-100 shrink-0" />
                    <div className="flex-1 space-y-2"><div className="h-3 bg-slate-100 rounded-full w-3/4" /><div className="h-2.5 bg-slate-100 rounded-full w-1/2" /><div className="h-2 bg-slate-100 rounded-full w-1/3" /></div>
                    <div className="space-y-2 shrink-0"><div className="h-4 w-16 bg-slate-100 rounded-full" /><div className="h-3 bg-slate-100 rounded-full w-12" /></div>
                  </div>
                ))}
              </div>
            ) : mobileFiltered.length === 0 ? (
              <div className="bg-white rounded-[20px] px-4 py-12 text-center flex flex-col items-center" style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
                <div className="h-14 w-14 rounded-2xl bg-[#eff6ff] flex items-center justify-center mb-3"><ShoppingBag className="h-6 w-6 text-[#0066FF]" strokeWidth={1.8} /></div>
                <p className="text-[14px] font-bold text-[#0f1c3f]">Belum ada order</p>
                <p className="text-[11px] text-slate-400 mt-1 leading-snug">{q ? "Tidak ada hasil untuk pencarian ini." : "Buat order baru untuk memulai."}</p>
                {!q && <button onClick={() => setAddOpen(true)} className="mt-4 inline-flex items-center gap-1.5 h-10 px-5 rounded-2xl text-[12px] font-bold text-white shadow-sm active:opacity-80" style={{ background: "linear-gradient(135deg,#0066FF,#0038B8)" }}><Plus className="h-3.5 w-3.5" /> Order Baru</button>}
              </div>
            ) : (
              <motion.div
                className="bg-white rounded-[20px] overflow-hidden divide-y divide-slate-100"
                style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}
                initial="hidden" animate="visible"
                variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.04, delayChildren: 0.02 } } }}
              >
                {[...mobileFiltered]
                  .sort((a, b) => {
                    const ta = new Date(a.createdAt ?? "").getTime();
                    const tb = new Date(b.createdAt ?? "").getTime();
                    return mobileSortOrder === "newest" ? tb - ta : ta - tb;
                  })
                  .map((o) => {
                    const clientName = o.clientId ? clientNameById.get(o.clientId) : null;
                    const ps = derivePaymentStatus(o.paidAmount ?? 0, o.totalPrice, o.paymentStatus);

                    const TC: Record<string, { label: string; icon: React.ReactNode; iconBg: string; labelColor: string }> = {
                      flight:       { label: "TIKET PESAWAT", icon: <Plane    className="h-5 w-5 text-[#2563eb]" strokeWidth={1.8} />, iconBg: "#eff6ff", labelColor: "#2563eb" },
                      visa_voa:     { label: "VISA VOA",      icon: <FileText className="h-5 w-5 text-[#10b981]" strokeWidth={1.8} />, iconBg: "#ecfdf5", labelColor: "#10b981" },
                      visa_student: { label: "VISA PELAJAR",  icon: <FileText className="h-5 w-5 text-[#f59e0b]" strokeWidth={1.8} />, iconBg: "#fffbeb", labelColor: "#d97706" },
                      umrah:        { label: "PAKET & TRIP",  icon: <Package  className="h-5 w-5 text-[#8b5cf6]" strokeWidth={1.8} />, iconBg: "#f5f3ff", labelColor: "#7c3aed" },
                    };
                    const tc = TC[o.type] ?? { label: (ORDER_TYPE_LABEL[o.type] ?? "ORDER").toUpperCase(), icon: <ShoppingBag className="h-5 w-5 text-slate-500" strokeWidth={1.8} />, iconBg: "#f1f5f9", labelColor: "#64748b" };

                    const SB: Record<string, { bg: string; text: string; label: string }> = {
                      Draft:      { bg: "#f1f5f9", text: "#64748b", label: "DRAFT" },
                      Confirmed:  { bg: "#fef3c7", text: "#d97706", label: "CONFIRMED" },
                      Processing: { bg: "#dbeafe", text: "#2563eb", label: "DIPROSES" },
                      Done:       { bg: "#dcfce7", text: "#16a34a", label: "SELESAI" },
                      Paid:       { bg: "#dcfce7", text: "#16a34a", label: "DIBAYAR" },
                      Completed:  { bg: "#dcfce7", text: "#16a34a", label: "SELESAI" },
                      Cancelled:  { bg: "#fee2e2", text: "#dc2626", label: "DIBATALKAN" },
                    };
                    const sb = SB[o.status] ?? SB["Draft"];

                    const dateStr = o.createdAt
                      ? new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" }).format(new Date(o.createdAt)) +
                        " • " + new Date(o.createdAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
                      : "—";

                    const PAYMENT_DOT: Record<string, string> = { lunas: "#16a34a", partial: "#d97706", belum: "#dc2626", free: "#16a34a" };
                    const PAYMENT_LBL: Record<string, string> = { lunas: "Lunas", partial: "Sebagian", belum: "Belum Bayar", free: "Gratis" };

                    return (
                      <motion.button
                        key={o.id}
                        variants={{ hidden: { opacity: 0, y: 6 }, visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1] } } }}
                        onClick={() => navigate(`/orders/detail/${o.id}`)}
                        className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-slate-50 transition-colors"
                        style={{ WebkitTapHighlightColor: "transparent" }}
                      >
                        {/* Type icon */}
                        <div className="h-11 w-11 rounded-2xl flex items-center justify-center shrink-0" style={{ backgroundColor: tc.iconBg }}>{tc.icon}</div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <p className="text-[9px] font-extrabold uppercase tracking-wider mb-0.5" style={{ color: tc.labelColor }}>{tc.label}</p>
                          <p className="text-[12.5px] font-extrabold text-[#0f1c3f] leading-snug truncate">{o.title || ORDER_TYPE_LABEL[o.type]}</p>
                          {clientName && <p className="text-[10px] text-slate-400 mt-0.5 truncate font-medium">{clientName}</p>}
                          <p className="text-[9px] text-slate-400 mt-0.5">{dateStr}</p>
                          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                            <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-full" style={{ backgroundColor: sb.bg, color: sb.text }}>{sb.label}</span>
                            <span className="flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: (PAYMENT_DOT[ps] ?? "#64748b") + "20", color: PAYMENT_DOT[ps] ?? "#64748b" }}>
                              <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: PAYMENT_DOT[ps] ?? "#64748b" }} />
                              {PAYMENT_LBL[ps] ?? ps}
                            </span>
                            {user?.role !== "agent" && (!o.costPrice || o.costPrice === 0) && (
                              <span className="inline-flex items-center gap-0.5 text-[8.5px] font-bold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600">
                                <AlertTriangle className="h-2.5 w-2.5" />HPP
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Price + chevron */}
                        <div className="flex flex-col items-end gap-1.5 shrink-0 ml-1">
                          <p className="text-[12px] font-extrabold text-[#0f1c3f] tabular-nums whitespace-nowrap">{fmtOrderPrice(o.totalPrice, o.currency)}</p>
                          <ChevronRight className="h-4 w-4 text-slate-300" strokeWidth={2} />
                        </div>
                      </motion.button>
                    );
                  })}
              </motion.div>
            )}
          </div>

          {/* bottom padding */}
          <div className="h-2" />
        </div>

        {/* ── BOTTOM NAV BAR ── */}
        <div className="fixed bottom-0 left-0 right-0 z-50" style={{ background: "white", boxShadow: "0 -1px 0 rgba(0,0,0,0.06), 0 -4px 16px rgba(0,0,0,0.08)", paddingBottom: "env(safe-area-inset-bottom)" }}>
          <div className="grid grid-cols-5 h-[60px]">
            {([
              { label: "Home",    path: "/",        icon: (a: boolean) => <svg viewBox="0 0 24 24" className="h-5 w-5" fill={a ? "currentColor" : "none"} stroke="currentColor" strokeWidth={a ? 0 : 1.8}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg> },
              { label: "Order",   path: "/orders",  icon: (a: boolean) => <svg viewBox="0 0 24 24" className="h-5 w-5" fill={a ? "currentColor" : "none"} stroke="currentColor" strokeWidth={a ? 0 : 1.8}><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg> },
              { label: "Klien",   path: "/clients", icon: (a: boolean) => <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
              { label: "Paket",   path: "/packages",icon: (a: boolean) => <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m16.5 9.4-9-5.19M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27,6.96 12,12.01 20.73,6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg> },
              { label: "Lainnya", path: "/settings",icon: (a: boolean) => <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg> },
            ] as const).map(tab => {
              const isActive = tab.path === "/" ? false : location.pathname.startsWith(tab.path);
              const isOrder  = tab.path === "/orders";
              const active   = isOrder || isActive;
              return (
                <button key={tab.path} onClick={() => navigate(tab.path)} className={cn("flex flex-col items-center justify-center gap-1 transition-colors active:opacity-60", active ? "text-[#0066FF]" : "text-slate-400")} style={{ WebkitTapHighlightColor: "transparent" }}>
                  {tab.icon(active)}
                  <span className={cn("text-[9px] font-semibold", active && "font-extrabold")}>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

      </div>

      {/* ══════════════════════════════════════════════════════════
           DESKTOP LAYOUT  (hidden md:flex) — Order Hub Redesign
      ══════════════════════════════════════════════════════════ */}
      <div className="hidden md:flex gap-5 p-5 xl:p-6 max-w-[1440px] mx-auto w-full">

        {/* ─────────────── MAIN COLUMN ─────────────── */}
        <motion.div
          className="flex-1 min-w-0"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* Header */}
          <div className="flex items-start justify-between mb-5">
            <div>
              <h1 className="text-[28px] font-black text-slate-900 leading-tight tracking-tight">Order Hub</h1>
              <p className="text-[13px] text-slate-500 mt-0.5">Kelola, pantau, dan selesaikan semua order dalam satu tempat.</p>
            </div>
            <button
              onClick={() => setAddOpen(true)}
              className="flex items-center gap-2 h-10 pl-4 pr-3 rounded-xl text-white text-[13px] font-bold shadow-md hover:opacity-90 active:scale-95 transition-all"
              style={{ background: "linear-gradient(135deg,#2563eb,#1d4ed8)" }}
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} />
              Order Baru
              <span className="w-px h-5 bg-white/30 mx-0.5" />
              <ChevronDown className="h-3.5 w-3.5 opacity-80" />
            </button>
          </div>

          {/* ── 5 Stat Cards ── */}
          <div className="grid grid-cols-5 gap-3 mb-5">
            {([
              { label: "Total Order", value: orders.length, growth: growTotal,
                icon: <ShoppingBag className="h-5 w-5 shrink-0" style={{ color:"#2563eb" }} strokeWidth={1.8} />, iconBg:"#eff6ff" },
              { label: "Completed",   value: completedCount, growth: growCompleted,
                icon: <CheckCircle   className="h-5 w-5 shrink-0" style={{ color:"#10b981" }} strokeWidth={1.8} />, iconBg:"#ecfdf5" },
              { label: "Confirmed",   value: confirmedCount, growth: growConfirmed,
                icon: <BadgeCheck    className="h-5 w-5 shrink-0" style={{ color:"#3b82f6" }} strokeWidth={1.8} />, iconBg:"#dbeafe" },
              { label: "Pending",     value: pendingCount,   growth: growPending,
                icon: <Clock         className="h-5 w-5 shrink-0" style={{ color:"#f59e0b" }} strokeWidth={1.8} />, iconBg:"#fffbeb" },
              { label: "Total Nilai", value: totalRevenue, growth: growRevenue, isCurrency: true,
                icon: <Wallet        className="h-5 w-5 shrink-0" style={{ color:"#8b5cf6" }} strokeWidth={1.8} />, iconBg:"#f5f3ff" },
            ] as Array<{ label: string; value: number; growth: number; isCurrency?: boolean; icon: React.ReactNode; iconBg: string }>).map((card) => (
              <div key={card.label} className="bg-white rounded-xl border border-slate-200 px-4 py-3.5 shadow-sm">
                <div className="flex items-center justify-between mb-2.5">
                  <div className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: card.iconBg }}>
                    {card.icon}
                  </div>
                  <TrendingUp className="h-3.5 w-3.5 text-slate-300" />
                </div>
                <p className="text-[11px] text-slate-500 font-medium mb-0.5">{card.label}</p>
                <p className={cn("font-black leading-none tabular-nums text-slate-900", card.isCurrency ? "text-[17px]" : "text-[24px]")}>
                  {card.isCurrency
                    ? (card.value >= 1_000_000_000
                        ? `Rp ${(card.value/1_000_000_000).toFixed(2)} M`
                        : card.value >= 1_000_000
                          ? `Rp ${(card.value/1_000_000).toFixed(2)} Jt`
                          : `Rp ${card.value.toLocaleString("id-ID")}`)
                    : card.value.toLocaleString("id-ID")}
                </p>
                <div className="flex items-center gap-1 mt-1.5">
                  <span className={cn("text-[10px] font-bold", card.growth >= 0 ? "text-emerald-600" : "text-red-500")}>
                    {card.growth >= 0 ? "+" : ""}{card.growth}%
                  </span>
                  <span className="text-[10px] text-slate-400">vs bulan lalu</span>
                </div>
              </div>
            ))}
          </div>

          {/* ── Tab Bar ── */}
          <div className="flex items-center border-b border-slate-200 mb-4 overflow-x-auto scrollbar-none">
            {([
              { id: "all",          label: "Semua",         count: orders.length },
              { id: "umrah",        label: "Umrah & Haji",  count: orders.filter(o => o.type === "umrah").length },
              { id: "flight",       label: "Tiket Pesawat", count: orders.filter(o => o.type === "flight").length },
              { id: "visa_voa",     label: "Visa VOA",      count: orders.filter(o => o.type === "visa_voa").length },
              { id: "visa_student", label: "Visa Pelajar",  count: orders.filter(o => o.type === "visa_student").length },
            ] as Array<{ id: string; label: string; count: number }>).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as "all" | OrderType)}
                className={cn(
                  "shrink-0 flex items-center gap-1.5 px-4 py-2.5 text-[12.5px] font-semibold border-b-2 -mb-px transition-colors whitespace-nowrap",
                  activeTab === tab.id
                    ? "border-blue-600 text-blue-700 bg-blue-50/50"
                    : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50",
                )}
              >
                {tab.label}
                <span className={cn(
                  "text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                  activeTab === tab.id ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500",
                )}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* ── Search + Controls ── */}
          <div className="flex items-center gap-2 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Cari judul / klien / status / tanggal…"
                className="w-full h-10 pl-9 pr-4 rounded-xl text-[13px] bg-white border border-slate-200 text-slate-700 placeholder-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
              />
            </div>
            <button className="flex items-center gap-1.5 h-10 px-3.5 rounded-xl bg-white border border-slate-200 text-[12.5px] font-semibold text-slate-600 hover:bg-slate-50 transition-colors shrink-0">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Filter
            </button>
            <div className="flex items-center bg-white border border-slate-200 rounded-xl overflow-hidden shrink-0">
              <button
                onClick={() => setViewMode("list")}
                className={cn("h-10 w-10 flex items-center justify-center transition-colors", viewMode === "list" ? "bg-blue-50 text-blue-600" : "text-slate-400 hover:text-slate-600")}
              >
                <LayoutList className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode("grid")}
                className={cn("h-10 w-10 flex items-center justify-center transition-colors", viewMode === "grid" ? "bg-blue-50 text-blue-600" : "text-slate-400 hover:text-slate-600")}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* ── Order List ── */}
          {loadingOrders && orders.length === 0 ? (
            <div className="space-y-2">
              {[1,2,3,4,5].map(i => (
                <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 animate-pulse flex items-center gap-4">
                  <div className="h-11 w-11 rounded-xl bg-slate-100 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 bg-slate-100 rounded w-2/5" />
                    <div className="h-3 bg-slate-100 rounded w-3/5" />
                  </div>
                  <div className="h-6 w-16 bg-slate-100 rounded-full shrink-0" />
                  <div className="h-4 w-24 bg-slate-100 rounded shrink-0" />
                </div>
              ))}
            </div>
          ) : desktopFiltered.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed border-slate-300 p-14 text-center">
              <div className="h-14 w-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-3">
                <ShoppingBag className="h-6 w-6 text-blue-500" strokeWidth={1.8} />
              </div>
              <p className="text-[14px] font-bold text-slate-700">Belum ada order</p>
              <p className="text-[12px] text-slate-400 mt-1">
                {q ? "Tidak ada hasil untuk pencarian ini." : "Buat order baru untuk memulai."}
              </p>
              {!q && (
                <button
                  onClick={() => setAddOpen(true)}
                  className="mt-4 inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-[12px] font-bold text-white"
                  style={{ background: "linear-gradient(135deg,#2563eb,#1d4ed8)" }}
                >
                  <Plus className="h-3.5 w-3.5" /> Order Baru
                </button>
              )}
            </div>
          ) : viewMode === "grid" ? (
            <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
              {desktopFiltered.map((o) => {
                const ps = derivePaymentStatus(o.paidAmount ?? 0, o.totalPrice, o.paymentStatus);
                const tc = DESKTOP_TYPE_CONFIG[o.type] ?? DESKTOP_TYPE_CONFIG.umrah;
                const clientName = o.clientId ? clientNameById.get(o.clientId) : null;
                const invNum = invNumbers.get(o.id) ?? "INV-…";
                const dateStr = new Intl.DateTimeFormat("id-ID", { day:"numeric", month:"short", year:"numeric" }).format(new Date(o.createdAt));
                const agentLabel = user?.displayName
                  ? `${user.displayName} (${user.role === "owner" ? "Owner" : user.role === "staff" ? "Staff" : "Agen"})`
                  : undefined;
                const isCompleted = ["Done","Paid","Completed"].includes(o.status);
                return (
                  <Link key={o.id} to={`/orders/detail/${o.id}`}
                    className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md hover:border-blue-200 transition-all flex flex-col gap-2.5 group">
                    {/* Top row: icon + both status badges */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: tc.bg }}>
                        <tc.Icon className="h-5 w-5" style={{ color: tc.color }} strokeWidth={1.8} />
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className={cn(
                          "text-[9.5px] font-bold px-2 py-0.5 rounded-full border",
                          isCompleted ? "bg-purple-50 text-purple-700 border-purple-200" :
                          o.status === "Confirmed" ? "bg-amber-50 text-amber-700 border-amber-200" :
                          o.status === "Cancelled" ? "bg-red-50 text-red-600 border-red-200" :
                          "bg-slate-100 text-slate-500 border-slate-200"
                        )}>
                          {isCompleted ? "Completed" : o.status}
                        </span>
                        <span className={cn("text-[9px] font-bold px-2 py-0.5 rounded-full border", PAYMENT_STATUS_STYLE[ps])}>
                          {PAYMENT_STATUS_LABEL[ps]}
                        </span>
                      </div>
                    </div>
                    {/* Title */}
                    <div>
                      <p className="text-[12px] font-extrabold text-slate-800 leading-snug line-clamp-2">
                        {o.title || `${tc.label}${clientName ? ` – ${clientName.toUpperCase()}` : ""}`}
                      </p>
                      <p className="text-[10px] font-mono text-slate-400 mt-0.5">{invNum} · {dateStr}</p>
                    </div>
                    {/* Agent + type label */}
                    {agentLabel && (
                      <div className="flex items-center gap-1 text-[10px] font-semibold text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">
                        <User className="h-3 w-3 shrink-0 text-slate-400" />
                        <span className="truncate">{agentLabel}</span>
                      </div>
                    )}
                    {/* Bottom: price + HPP */}
                    <div className="flex items-center justify-between mt-auto pt-1 border-t border-slate-100">
                      <p className="text-[14px] font-black text-slate-800 tabular-nums">{fmtOrderPrice(o.totalPrice, o.currency)}</p>
                      <div className="flex items-center gap-1">
                        {user?.role !== "agent" && (!o.costPrice || o.costPrice === 0) && (
                          <span className="flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                            <AlertTriangle className="h-2.5 w-2.5" /> HPP
                          </span>
                        )}
                        {o.paidAmount > 0 && o.paidAmount < o.totalPrice && (
                          <span className="text-[9px] text-amber-600 font-bold bg-amber-50 px-1.5 py-0.5 rounded-full">
                            DP
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <motion.div
              className="space-y-1.5"
              initial="hidden"
              animate="visible"
              variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.035, delayChildren: 0.02 } } }}
            >
              {desktopFiltered.map((o) => {
                const ps = derivePaymentStatus(o.paidAmount ?? 0, o.totalPrice, o.paymentStatus);
                const tc = DESKTOP_TYPE_CONFIG[o.type] ?? DESKTOP_TYPE_CONFIG.umrah;
                const clientName = o.clientId ? clientNameById.get(o.clientId) : null;
                const invNum = invNumbers.get(o.id) ?? "INV-…";
                const dateStr = new Intl.DateTimeFormat("id-ID", { day:"numeric", month:"short", year:"numeric" }).format(new Date(o.createdAt));
                const agentLabel = user?.displayName
                  ? `${user.displayName} (${user.role === "owner" ? "Owner" : user.role === "staff" ? "Staff" : "Agen"})`
                  : undefined;
                const isCompleted = ["Done","Paid","Completed"].includes(o.status);
                const hasMissingHPP = user?.role !== "agent" && (!o.costPrice || o.costPrice === 0);
                const isDP = (o.paidAmount ?? 0) > 0 && (o.paidAmount ?? 0) < o.totalPrice;
                return (
                  <motion.div
                    key={o.id}
                    variants={{ hidden:{ opacity:0, y:6 }, visible:{ opacity:1, y:0, transition:{ duration:0.24, ease:[0.16,1,0.3,1] } } }}
                    whileHover={{ y:-1 }}
                  >
                    <Link
                      to={`/orders/detail/${o.id}`}
                      className="flex items-start gap-4 bg-white rounded-xl border border-slate-200 px-4 py-3.5 hover:shadow-md hover:border-blue-200 transition-all group"
                    >
                      {/* Type Icon */}
                      <div className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0 mt-0.5" style={{ backgroundColor: tc.bg }}>
                        <tc.Icon className="h-5 w-5" style={{ color: tc.color }} strokeWidth={1.8} />
                      </div>

                      {/* Main content — 3 rows */}
                      <div className="flex-1 min-w-0">
                        {/* Row 1: title + order status badge */}
                        <div className="flex items-center gap-2">
                          <p className="text-[13.5px] font-extrabold text-slate-800 truncate leading-tight flex-1">
                            {o.title || `${ORDER_TYPE_LABEL[o.type]}${clientName ? ` – ${clientName.toUpperCase()}` : ""}`}
                          </p>
                          <span className={cn(
                            "shrink-0 text-[10px] font-bold px-2.5 py-0.5 rounded-full border",
                            isCompleted ? "bg-purple-50 text-purple-700 border-purple-200" :
                            o.status === "Confirmed" ? "bg-amber-50 text-amber-700 border-amber-200" :
                            o.status === "Cancelled" ? "bg-red-50 text-red-600 border-red-200" :
                            "bg-slate-100 text-slate-500 border-slate-200"
                          )}>
                            {isCompleted ? "Completed" : o.status}
                          </span>
                        </div>

                        {/* Row 2: INV · date · order type */}
                        <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                          <span className="font-mono">{invNum}</span>
                          {" · "}{dateStr}
                          {" · "}<span className="text-slate-400">{tc.label}</span>
                        </p>

                        {/* Row 3: agent badge + HPP warning + DP info + notes */}
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          {agentLabel && (
                            <span className="flex items-center gap-1 text-[10.5px] font-semibold text-slate-600 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-full">
                              <User className="h-3 w-3 shrink-0 text-slate-400" />
                              {agentLabel}
                            </span>
                          )}
                          {hasMissingHPP && (
                            <span className="flex items-center gap-1 text-[9.5px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                              <AlertTriangle className="h-2.5 w-2.5" /> HPP belum diset
                            </span>
                          )}
                          {isDP && (
                            <span className="flex items-center gap-1 text-[9.5px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200">
                              <DollarSign className="h-2.5 w-2.5" /> DP {fmtOrderPrice(o.paidAmount ?? 0, o.currency)}
                            </span>
                          )}
                          {o.notes && (
                            <span className="flex items-center gap-1 text-[9.5px] text-slate-400 font-medium truncate max-w-[180px]">
                              <MessageSquare className="h-2.5 w-2.5 shrink-0" />
                              {o.notes}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Right section: payment status + price */}
                      <div className="flex items-center gap-2.5 shrink-0 self-center">
                        <div className="flex flex-col items-end gap-1">
                          <span className={cn(
                            "flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full",
                            ps === "PAID"   ? "bg-emerald-50 text-emerald-700" :
                            ps === "DP"     ? "bg-amber-50 text-amber-700" :
                            ps === "UNPAID" ? "bg-red-50 text-red-600" :
                                             "bg-gray-100 text-gray-600",
                          )}>
                            <span className={cn(
                              "h-1.5 w-1.5 rounded-full",
                              ps === "PAID" ? "bg-emerald-500" : ps === "DP" ? "bg-amber-400" :
                              ps === "UNPAID" ? "bg-red-500" : "bg-gray-400",
                            )} />
                            {PAYMENT_STATUS_LABEL[ps]}
                          </span>
                          <p className="text-[13.5px] font-black text-slate-800 tabular-nums text-right">
                            {fmtOrderPrice(o.totalPrice, o.currency)}
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-slate-400 transition-colors" />
                      </div>
                    </Link>
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </motion.div>

        {/* ─────────────── RIGHT PANEL ─────────────── */}
        <div className="w-[276px] xl:w-[292px] shrink-0 space-y-4">

          {/* Filter Order */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[13px] font-extrabold text-slate-800">Filter Order</h3>
              <button
                onClick={() => { setFilterStatus("all"); setFilterJenis("all"); setFilterDateFrom(""); setFilterRange("all"); }}
                className="text-[11px] text-blue-600 font-semibold hover:text-blue-700 flex items-center gap-0.5"
              >
                <RotateCcw className="h-3 w-3" /> Reset
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">Status</label>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="w-full h-9 rounded-lg border border-slate-200 text-[12px] text-slate-700 bg-white px-3 pr-8 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all appearance-none cursor-pointer"
                  style={{ backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E")`, backgroundRepeat:"no-repeat", backgroundPosition:"right 8px center", backgroundSize:"16px" }}
                >
                  <option value="all">Semua Status</option>
                  <option value="completed">Selesai / Lunas</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="pending">Draft / Pending</option>
                  <option value="cancelled">Dibatalkan</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">Jenis Order</label>
                <select
                  value={filterJenis}
                  onChange={(e) => setFilterJenis(e.target.value)}
                  className="w-full h-9 rounded-lg border border-slate-200 text-[12px] text-slate-700 bg-white px-3 pr-8 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all appearance-none cursor-pointer"
                  style={{ backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E")`, backgroundRepeat:"no-repeat", backgroundPosition:"right 8px center", backgroundSize:"16px" }}
                >
                  <option value="all">Semua Jenis</option>
                  <option value="umrah">Umrah & Haji</option>
                  <option value="flight">Tiket Pesawat</option>
                  <option value="visa_voa">Visa VOA</option>
                  <option value="visa_student">Visa Pelajar</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">Tanggal Order</label>
                <div className="relative">
                  <CalendarDays className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                  <input
                    type="date"
                    value={filterDateFrom}
                    onChange={(e) => setFilterDateFrom(e.target.value)}
                    className="w-full h-9 rounded-lg border border-slate-200 text-[12px] text-slate-700 bg-white pl-8 pr-2 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">Rentang Nilai</label>
                <select
                  value={filterRange}
                  onChange={(e) => setFilterRange(e.target.value)}
                  className="w-full h-9 rounded-lg border border-slate-200 text-[12px] text-slate-700 bg-white px-3 pr-8 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all appearance-none cursor-pointer"
                  style={{ backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E")`, backgroundRepeat:"no-repeat", backgroundPosition:"right 8px center", backgroundSize:"16px" }}
                >
                  <option value="all">Semua Nilai</option>
                  <option value="under1m">Di bawah Rp 1 Jt</option>
                  <option value="1m5m">Rp 1 Jt – Rp 5 Jt</option>
                  <option value="above5m">Di atas Rp 5 Jt</option>
                </select>
              </div>
              <button
                className="w-full h-9 rounded-xl text-[12.5px] font-bold text-white transition-all hover:opacity-90 active:scale-95"
                style={{ background:"linear-gradient(135deg,#2563eb,#1d4ed8)" }}
              >
                Terapkan Filter
              </button>
            </div>
          </div>

          {/* Statistik Order */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <h3 className="text-[13px] font-extrabold text-slate-800 mb-3">Statistik Order</h3>
            {orders.length > 0 ? (
              <div className="flex items-center gap-3">
                <div className="shrink-0">
                  <PieChart width={116} height={116}>
                    <Pie
                      data={[
                        { value: completedCount || 0.01, color:"#10b981" },
                        { value: confirmedCount || 0,    color:"#3b82f6" },
                        { value: pendingCount   || 0,    color:"#f59e0b" },
                        { value: cancelledCount || 0,    color:"#ef4444" },
                      ]}
                      cx={52} cy={52} innerRadius={30} outerRadius={50}
                      paddingAngle={2} dataKey="value" stroke="none"
                    >
                      {["#10b981","#3b82f6","#f59e0b","#ef4444"].map((color, i) => (
                        <Cell key={i} fill={color} />
                      ))}
                    </Pie>
                  </PieChart>
                </div>
                <div className="flex-1 space-y-2 min-w-0">
                  {[
                    { label:"Completed",  value: completedCount, color:"#10b981" },
                    { label:"Confirmed",  value: confirmedCount, color:"#3b82f6" },
                    { label:"Pending",    value: pendingCount,   color:"#f59e0b" },
                    { label:"Dibatalkan", value: cancelledCount, color:"#ef4444" },
                  ].map((item) => {
                    const pct = orders.length > 0 ? ((item.value / orders.length)*100).toFixed(1) : "0.0";
                    return (
                      <div key={item.label} className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                        <span className="text-[10.5px] text-slate-600 flex-1 truncate">{item.label}</span>
                        <span className="text-[10.5px] font-bold text-slate-700 tabular-nums">{item.value}</span>
                        <span className="text-[9.5px] text-slate-400 w-[38px]">({pct}%)</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="text-[12px] text-slate-400 text-center py-4">Belum ada data</p>
            )}
          </div>

          {/* Aktivitas Terbaru */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[13px] font-extrabold text-slate-800">Aktivitas Terbaru</h3>
              <button onClick={() => navigate("/orders")} className="text-[11px] text-blue-600 font-semibold hover:text-blue-700">
                Lihat Semua
              </button>
            </div>
            {recentActivity.length === 0 ? (
              <p className="text-[12px] text-slate-400 py-2">Belum ada aktivitas.</p>
            ) : (
              <div className="space-y-2">
                {recentActivity.map((o) => {
                  const ps = derivePaymentStatus(o.paidAmount ?? 0, o.totalPrice, o.paymentStatus);
                  const isPaid = ps === "PAID";
                  const invNum = invNumbers.get(o.id) ?? o.id.slice(0,12);
                  const diff = Date.now() - new Date(o.updatedAt ?? o.createdAt).getTime();
                  const mins = Math.floor(diff / 60000);
                  const rel = mins < 1 ? "Baru saja"
                    : mins < 60   ? `${mins} menit yang lalu`
                    : mins < 1440 ? `${Math.floor(mins/60)} jam yang lalu`
                    : `${Math.floor(mins/1440)} hari yang lalu`;
                  return (
                    <Link key={o.id} to={`/orders/detail/${o.id}`}
                      className="flex items-start gap-2.5 hover:bg-slate-50 rounded-lg p-1.5 -mx-1.5 transition-colors">
                      <div className={cn("h-8 w-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5", isPaid ? "bg-emerald-50" : "bg-blue-50")}>
                        {isPaid
                          ? <CreditCard  className="h-3.5 w-3.5 text-emerald-600" strokeWidth={1.8} />
                          : <ShoppingBag className="h-3.5 w-3.5 text-blue-600"    strokeWidth={1.8} />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11.5px] font-bold text-slate-700 leading-tight">
                          {isPaid ? "Pembayaran diterima" : "Order baru dibuat"}
                        </p>
                        <p className="text-[10px] font-mono text-slate-400 mt-0.5">{invNum}</p>
                      </div>
                      <p className="text-[10px] text-slate-400 shrink-0 mt-0.5 whitespace-nowrap">{rel}</p>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Dialog (shared) ── */}
      <NewOrderDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        defaultType={typeFilter ?? "umrah"}
        defaultClientId={clientIdParam}
        onSubmit={async (draft) => {
          const { agentFee, ...rest } = draft;
          // Hanya simpan agentFee di metadata kalau nilainya > 0 (artinya ada agen yg dapat komisi).
          // Owner/staff yg buat order langsung → metadata bersih tanpa agentFee.
          const metadata: Record<string, unknown> = agentFee > 0 ? { agentFee } : {};
          const o = await addOrder({ ...rest, metadata, tripId: null, packageId: null, jamaahId: null, notes: null });
          toast.success("Order dibuat");
          setAddOpen(false);
          navigate(`/orders/detail/${o.id}`);
        }}
      />

    </>
  );
}

const DESKTOP_TYPE_CONFIG: Record<string, { label: string; Icon: React.ComponentType<{ className?: string; style?: React.CSSProperties; strokeWidth?: number }>; bg: string; color: string }> = {
  umrah:        { label: "Umrah & Haji",  Icon: Package,        bg: "#f5f3ff", color: "#8b5cf6" },
  flight:       { label: "Tiket Pesawat", Icon: Plane,           bg: "#eff6ff", color: "#2563eb" },
  visa_voa:     { label: "Visa VOA",      Icon: FileText,        bg: "#ecfdf5", color: "#10b981" },
  visa_student: { label: "Visa Pelajar",  Icon: GraduationCap,  bg: "#fffbeb", color: "#f59e0b" },
};

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-full text-sm font-semibold border transition ${
        active
          ? "bg-primary text-primary-foreground border-transparent"
          : "bg-card text-muted-foreground border-border hover:bg-secondary"
      }`}
    >
      {children}
    </button>
  );
}

function NewOrderDialog({
  open, onOpenChange, defaultType, defaultClientId, onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultType: OrderType;
  defaultClientId?: string;
  onSubmit: (draft: {
    type: OrderType; status: "Draft"; title: string | null;
    totalPrice: number; costPrice: number; currency: string; clientId: string | null;
    agentFee: number;
  }) => Promise<void>;
}) {
  const { clients, addClient, patchClient } = useClientsStore();
  const currentUser = useAuthStore((s) => s.user);
  const isAgent = currentUser?.role === "agent";

  const [type, setType] = useState<OrderType>(defaultType);
  const [title, setTitle] = useState("");
  const [titleEdited, setTitleEdited] = useState(false);
  const [totalPrice, setTotalPrice] = useState<string>("");
  const [costPrice, setCostPrice] = useState<string>("");
  const [clientId, setClientId] = useState<string>(defaultClientId ?? "");
  const [currency, setCurrency] = useState<"IDR" | "EGP">(CURRENCY_BY_TYPE[defaultType]);
  const [currencyEdited, setCurrencyEdited] = useState(false);
  const [agentFee, setAgentFee] = useState<string>("");
  // Track apakah user override fee manual — kalau iya, jangan auto-overwrite.
  const [feeEdited, setFeeEdited] = useState(false);
  const [saving, setSaving] = useState(false);

  const currencySymbol = CURRENCY_SYMBOL[currency];

  useEffect(() => {
    if (open) {
      setType(defaultType);
      setTitle("");
      setTitleEdited(false);
      setTotalPrice("");
      setCostPrice("");
      setClientId(defaultClientId ?? "");
      setCurrency(CURRENCY_BY_TYPE[defaultType]);
      setCurrencyEdited(false);
      setAgentFee("");
      setFeeEdited(false);
    }
  }, [open, defaultType, defaultClientId]);

  // Auto-update currency saat tipe berubah (selama user belum pilih manual).
  useEffect(() => {
    if (!open || currencyEdited) return;
    setCurrency(CURRENCY_BY_TYPE[type]);
  }, [open, type, currencyEdited]);

  // Auto-fill fee komisi dari pengaturan fee per produk (nominal IDR).
  // Hanya untuk user berperan agent — owner/staff tidak dapat komisi.
  // Jalan ulang setiap kali tipe order berubah,
  // KECUALI user sudah override manual.
  useEffect(() => {
    if (!open || feeEdited || !isAgent) return;
    const pc = loadProductCommissions();
    const auto = getCommissionForOrderType(type, pc);
    setAgentFee(auto > 0 ? String(auto) : "");
  }, [open, feeEdited, type, isAgent]);

  // Auto-fill judul: "[Tipe Order] - [Nama Klien]" (atau cuma tipe kalau gak
  // ada klien). Cuma jalan kalau user belum ngetik manual.
  useEffect(() => {
    if (!open || titleEdited) return;
    const typeLabel = ORDER_TYPE_LABEL[type];
    const client = clientId ? clients.find((c) => c.id === clientId) : null;
    const next = client ? `${typeLabel} - ${client.name}` : "";
    setTitle(next);
  }, [open, type, clientId, clients, titleEdited]);

  // Hasil scan paspor → match ke client lama (update field kosong) atau bikin
  // client baru. Selesai → auto-pilih client di dropdown supaya judul auto-fill.
  const handlePassportScanned = async (
    passport: Parameters<React.ComponentProps<typeof PassportScanButton>["onScanned"]>[0],
    photoDataUrl: string,
  ) => {
    const decision = decidePassportSync(clients, passport, { photoDataUrl });
    if (decision.kind === "noop") {
      toast.error("Hasil scan kurang jelas", { description: decision.reason });
      return;
    }
    let target: Client;
    if (decision.kind === "match") {
      target = decision.client;
      // Update field yg masih kosong di client lama (non-destructive).
      if (Object.keys(decision.patch).length > 0) {
        try {
          await patchClient(target.id, decision.patch);
          toast.success(`Klien "${target.name}" diperbarui dari paspor`);
        } catch (e) {
          // Update gagal tapi match tetep valid — lanjut select aja.
          console.warn("[NewOrderDialog] patch client failed:", e);
          toast.success(`Klien "${target.name}" dipilih`);
        }
      } else {
        toast.success(`Klien "${target.name}" dipilih`);
      }
    } else {
      // create
      try {
        target = await addClient(decision.draft);
        toast.success(`Klien baru "${target.name}" dibuat`);
      } catch (e) {
        toast.error("Gagal buat klien baru", {
          description: e instanceof Error ? e.message : "Coba lagi.",
        });
        return;
      }
    }
    setClientId(target.id);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Order Baru</DialogTitle>
          <DialogDescription>Field minimum — detail bisa di-edit setelah dibuat.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Tipe Order</Label>
            <Select value={type} onValueChange={(v) => setType(v as OrderType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ORDER_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {ORDER_TYPE_EMOJI[t]} {ORDER_TYPE_LABEL[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Klien (opsional)</Label>
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <Select value={clientId || "__none"} onValueChange={(v) => setClientId(v === "__none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Pilih klien" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">— Tanpa klien —</SelectItem>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <PassportScanButton
                label="Scan Paspor"
                variant="outline"
                size="sm"
                className="h-9 shrink-0"
                onScanned={handlePassportScanned}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Judul</Label>
            <Input
              value={title}
              onChange={(e) => { setTitle(e.target.value); setTitleEdited(true); }}
              placeholder="mis. Tiket Jakarta-Jeddah Mei"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Harga Modal
              </Label>
              <div className="flex items-center gap-1.5">
                <span className="px-2 h-9 rounded-md border bg-muted/40 text-[11px] font-semibold inline-flex items-center shrink-0">
                  {currencySymbol}
                </span>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={costPrice}
                  onChange={(e) => setCostPrice(e.target.value)}
                  placeholder="0"
                  className="flex-1 min-w-0"
                />
              </div>
              <p className="text-[10px] text-muted-foreground pt-0.5">
                Bayar ke supplier
              </p>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Harga Jual
              </Label>
              <div className="flex items-center gap-1.5">
                <Select
                  value={currency}
                  onValueChange={(v) => { setCurrency(v as "IDR" | "EGP"); setCurrencyEdited(true); }}
                >
                  <SelectTrigger className="w-[68px] shrink-0 px-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="IDR">Rp</SelectItem>
                    <SelectItem value="EGP">EGP</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={totalPrice}
                  onChange={(e) => setTotalPrice(e.target.value)}
                  placeholder="0"
                  className="flex-1 min-w-0"
                />
              </div>
              <p className="text-[10px] text-muted-foreground pt-0.5">
                Tagihan ke klien
              </p>
            </div>
          </div>

          {/* Fee Komisi Agen — hanya tampil untuk user berperan "agent" */}
          {isAgent && (
            <div className="space-y-1">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Fee Komisi Agen
              </Label>
              <div className="flex items-center gap-1.5">
                <span className="px-2 h-9 rounded-md border bg-muted/40 text-[11px] font-semibold inline-flex items-center shrink-0">
                  Rp
                </span>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={agentFee}
                  onChange={(e) => { setAgentFee(e.target.value); setFeeEdited(true); }}
                  placeholder="0"
                  className="flex-1 min-w-0"
                />
                {feeEdited && (
                  <button
                    type="button"
                    className="text-[11px] text-muted-foreground underline shrink-0"
                    onClick={() => setFeeEdited(false)}
                  >
                    Reset
                  </button>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground pt-0.5">
                Auto-isi dari pengaturan fee per produk · bisa diubah manual
              </p>
            </div>
          )}

          {/* Profit preview — fee agen hanya dipotong kalau user berperan agent.
              CATATAN: profit & harga dalam mata uang asli order (EGP atau IDR).
              Fee agen selalu IDR — untuk EGP orders, fee ditampilkan terpisah tanpa dikurangkan. */}
          {(Number(totalPrice) > 0 || Number(costPrice) > 0) && (() => {
            const profit = (Number(totalPrice) || 0) - (Number(costPrice) || 0);
            const feeIDR = isAgent ? (Number(agentFee) || 0) : 0;
            // Hanya kurangkan fee dari profit jika sama-sama IDR
            const fee = (currency === "IDR") ? feeIDR : 0;
            const net = profit - fee;
            const positive = profit >= 0;
            const netPositive = net >= 0;
            return (
              <div className="space-y-1.5">
                <div className={`rounded-xl border px-3 py-2 flex items-center justify-between gap-2 ${
                  positive ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"
                }`}>
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Profit Kotor
                  </span>
                  <span className={`text-[14px] font-extrabold font-mono ${positive ? "text-emerald-700" : "text-red-600"}`}>
                    {positive ? "+" : ""}{currencySymbol} {Math.abs(profit).toLocaleString("id-ID")}
                  </span>
                </div>
                {isAgent && feeIDR > 0 && (
                  <div className={`rounded-xl border px-3 py-2 flex items-center justify-between gap-2 ${
                    netPositive ? "bg-sky-50 border-sky-200" : "bg-red-50 border-red-200"
                  }`}>
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {currency === "IDR" ? `Net (− fee agen)` : `Fee Agen (IDR, terpisah)`}
                    </span>
                    <span className={`text-[14px] font-extrabold font-mono ${currency === "IDR" ? (netPositive ? "text-sky-700" : "text-red-600") : "text-orange-700"}`}>
                      {currency === "IDR"
                        ? `${netPositive ? "+" : ""}${currencySymbol} ${Math.abs(net).toLocaleString("id-ID")}`
                        : `Rp ${feeIDR.toLocaleString("id-ID")}`
                      }
                    </span>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await onSubmit({
                  type,
                  status: "Draft",
                  title: title.trim() || null,
                  totalPrice: Number(totalPrice) || 0,
                  costPrice: Number(costPrice) || 0,
                  currency,
                  clientId: clientId || null,
                  agentFee: isAgent ? (Number(agentFee) || 0) : 0,
                });
              } catch (e) {
                toast.error("Gagal simpan", { description: e instanceof Error ? e.message : "Coba lagi." });
              } finally { setSaving(false); }
            }}
          >
            {saving ? "Menyimpan…" : "Buat Order"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
