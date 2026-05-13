import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams, Link } from "react-router-dom";
import { ShoppingBag, Plus, Search, ArrowLeft, ChevronRight, TrendingUp, Wallet, AlertTriangle, Plane, FileText, Package, SlidersHorizontal, X, CheckCircle, Clock, XCircle } from "lucide-react";
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
  const [mobileCat, setMobileCat] = useState<"all" | "flight" | "visa" | "paket">("all");
  const [showSearch, setShowSearch] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [mobileStatus, setMobileStatus] = useState<string>("all");

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
    else if (mobileCat === "visa") out = out.filter(o => ["visa_voa", "visa_student"].includes(o.type));
    else if (mobileCat === "paket") out = out.filter(o => o.type === "umrah");
    if (mobileStatus !== "all") {
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

  return (
    <>
      {/* ══════════════════════════════════════════════════════════
           MOBILE LAYOUT  (md:hidden) — Native App Style
      ══════════════════════════════════════════════════════════ */}
      <div className="md:hidden min-h-screen bg-[#F0F4FB] pb-28">

        {/* ── TOP HEADER ── */}
        <div className="bg-white px-4 pt-12 pb-4 shadow-sm">
          <div className="flex items-start justify-between gap-3 mb-1">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate(-1)}
                className="h-9 w-9 rounded-2xl bg-[#F0F4FB] flex items-center justify-center active:opacity-60 transition-opacity shrink-0"
                style={{ WebkitTapHighlightColor: "transparent" }}
              >
                <ArrowLeft className="h-4 w-4 text-[#0f1c3f]" strokeWidth={2} />
              </button>
              <div>
                <h1 className="text-[22px] font-extrabold text-[#0f1c3f] leading-tight">Order Hub</h1>
                <p className="text-[11px] text-slate-400 font-medium mt-0.5">Kelola semua pesanan dalam satu tempat</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 mt-1">
              <button
                onClick={() => { setShowSearch((s) => !s); if (showSearch) setQ(""); }}
                className="h-9 w-9 rounded-2xl bg-[#F0F4FB] flex items-center justify-center active:opacity-60 transition-opacity"
                style={{ WebkitTapHighlightColor: "transparent" }}
              >
                {showSearch ? <X className="h-4 w-4 text-[#0f1c3f]" strokeWidth={2} /> : <Search className="h-4 w-4 text-[#0f1c3f]" strokeWidth={2} />}
              </button>
              <button
                onClick={() => setShowFilter((s) => !s)}
                className={cn(
                  "h-9 px-3 rounded-2xl flex items-center gap-1.5 text-[11px] font-bold active:opacity-60 transition-all",
                  showFilter || mobileStatus !== "all" ? "bg-[#0066FF] text-white" : "bg-[#F0F4FB] text-[#0f1c3f]"
                )}
                style={{ WebkitTapHighlightColor: "transparent" }}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={2} />
                Filter
                {mobileStatus !== "all" && <span className="h-4 w-4 rounded-full bg-white text-[#0066FF] text-[9px] font-black flex items-center justify-center">1</span>}
              </button>
              <button
                onClick={() => setAddOpen(true)}
                className="h-9 w-9 rounded-2xl flex items-center justify-center text-white shadow-sm active:opacity-80 transition-opacity"
                style={{ background: "linear-gradient(135deg,#0066FF,#0038B8)", WebkitTapHighlightColor: "transparent" }}
              >
                <Plus className="h-4 w-4" strokeWidth={2.5} />
              </button>
            </div>
          </div>

          {/* Search input (animated) */}
          <AnimatePresence>
            {showSearch && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.22 }}
                className="overflow-hidden"
              >
                <div className="relative mt-3">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    autoFocus
                    type="text"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Cari judul, klien, status…"
                    className="w-full h-11 pl-10 pr-10 rounded-2xl text-[13px] outline-none bg-[#F0F4FB] border border-transparent text-[#0f1c3f] placeholder-slate-400 focus:border-sky-300 focus:ring-2 focus:ring-sky-100 transition-all"
                  />
                  {q && (
                    <button onClick={() => setQ("")} className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 rounded-full bg-slate-300/40 flex items-center justify-center active:opacity-60">
                      <X className="h-3 w-3 text-slate-500" />
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Filter bottom sheet */}
          <AnimatePresence>
            {showFilter && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.22 }}
                className="overflow-hidden"
              >
                <div className="mt-3 pt-3 border-t border-slate-100">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Status Order</p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { id: "all", label: "Semua", count: orders.length },
                      { id: "diproses", label: "Diproses", count: mDiproses },
                      { id: "selesai", label: "Selesai", count: mSelesai },
                      { id: "dibatalkan", label: "Dibatalkan", count: mDibatalkan },
                    ].map((f) => (
                      <button
                        key={f.id}
                        onClick={() => setMobileStatus(f.id)}
                        className={cn(
                          "h-8 px-3 rounded-full text-[11px] font-bold border transition-all active:scale-95",
                          mobileStatus === f.id ? "bg-[#0066FF] text-white border-transparent" : "bg-white text-slate-600 border-slate-200"
                        )}
                        style={{ WebkitTapHighlightColor: "transparent" }}
                      >
                        {f.label} <span className="opacity-70">({f.count})</span>
                      </button>
                    ))}
                  </div>
                  {mobileStatus !== "all" && (
                    <button
                      onClick={() => setMobileStatus("all")}
                      className="mt-2 text-[11px] text-[#0066FF] font-semibold active:opacity-60"
                    >
                      Reset Filter
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── CATEGORY TABS ── */}
        <div className="bg-white mt-px px-4 pb-3 shadow-sm">
          <div className="flex gap-2 overflow-x-auto scrollbar-none pt-3">
            {([
              { id: "all",    label: "Semua Order",     count: orders.length },
              { id: "flight", label: "Tiket Pesawat",   count: orders.filter(o => o.type === "flight").length },
              { id: "visa",   label: "Visa & Dokumen",  count: orders.filter(o => ["visa_voa","visa_student"].includes(o.type)).length },
              { id: "paket",  label: "Paket & Lainnya", count: orders.filter(o => o.type === "umrah").length },
            ] as const).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setMobileCat(tab.id)}
                className={cn(
                  "shrink-0 h-9 px-4 rounded-full text-[12px] font-bold flex items-center gap-1.5 whitespace-nowrap transition-all active:scale-95",
                  mobileCat === tab.id
                    ? "text-white shadow-md"
                    : "bg-[#F0F4FB] text-slate-500"
                )}
                style={mobileCat === tab.id ? { background: "linear-gradient(135deg,#0066FF,#0038B8)", WebkitTapHighlightColor: "transparent" } : { WebkitTapHighlightColor: "transparent" }}
              >
                {tab.label}
                <span className={cn(
                  "text-[9px] font-extrabold px-1.5 py-0.5 rounded-full",
                  mobileCat === tab.id ? "bg-white/25 text-white" : "bg-slate-200 text-slate-500"
                )}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="px-4 pt-5 space-y-5">

          {/* ── CLIENT FILTER BADGE ── */}
          {clientIdParam && clientNameById.get(clientIdParam) && (
            <div className="flex items-center gap-2.5 bg-white border border-sky-200 rounded-2xl px-4 py-3 shadow-sm">
              <div className="h-8 w-8 rounded-xl bg-[#dbeafe] flex items-center justify-center text-[#0066FF] text-[12px] font-extrabold shrink-0">
                {clientNameById.get(clientIdParam)!.charAt(0).toUpperCase()}
              </div>
              <p className="text-[12px] text-[#0f1c3f] font-semibold flex-1 truncate">
                Klien: <span className="font-bold">{clientNameById.get(clientIdParam)}</span>
              </p>
              <button onClick={() => navigate("/orders")} className="text-[11px] text-[#0066FF] font-bold active:opacity-70 shrink-0 flex items-center gap-1">
                <X className="h-3.5 w-3.5" /> Hapus
              </button>
            </div>
          )}

          {/* ── RINGKASAN ORDER CARD ── */}
          <div className="bg-white rounded-3xl px-5 py-4 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[15px] font-extrabold text-[#0f1c3f]">Ringkasan Order</h3>
              <span className="text-[11px] text-slate-400 font-medium">
                {new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" }).format(new Date())}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: "Total",      value: orders.length,  icon: <ShoppingBag className="h-4 w-4" style={{ color: "#0066FF" }} strokeWidth={1.8} />, iconBg: "#dbeafe", onClick: () => setMobileCat("all")       },
                { label: "Selesai",    value: mSelesai,       icon: <CheckCircle  className="h-4 w-4" style={{ color: "#10b981" }} strokeWidth={1.8} />, iconBg: "#d1fae5", onClick: () => setMobileStatus("selesai")    },
                { label: "Diproses",   value: mDiproses,      icon: <Clock        className="h-4 w-4" style={{ color: "#f59e0b" }} strokeWidth={1.8} />, iconBg: "#fef3c7", onClick: () => setMobileStatus("diproses")   },
                { label: "Dibatalkan", value: mDibatalkan,    icon: <XCircle      className="h-4 w-4" style={{ color: "#ef4444" }} strokeWidth={1.8} />, iconBg: "#fee2e2", onClick: () => setMobileStatus("dibatalkan") },
              ].map((stat) => (
                <button
                  key={stat.label}
                  onClick={stat.onClick}
                  className="flex flex-col items-center gap-1.5 active:opacity-70 transition-opacity"
                  style={{ WebkitTapHighlightColor: "transparent" }}
                >
                  <div className="h-9 w-9 rounded-2xl flex items-center justify-center" style={{ backgroundColor: stat.iconBg }}>
                    {stat.icon}
                  </div>
                  <p className="text-[22px] font-black text-[#0f1c3f] tabular-nums leading-none">{stat.value}</p>
                  <p className="text-[9px] font-semibold text-slate-400 text-center leading-tight uppercase tracking-wide">{stat.label}</p>
                  <div className="flex items-center gap-0.5">
                    <TrendingUp className="h-2.5 w-2.5 text-emerald-400" strokeWidth={2.5} />
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* ── DAFTAR ORDER ── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[15px] font-extrabold text-[#0f1c3f]">Daftar Order</h3>
              <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-400">
                Urutkan: Terbaru <ChevronRight className="h-3.5 w-3.5" />
              </div>
            </div>

            {loadingOrders && orders.length === 0 ? (
              <div className="space-y-3">
                {[1,2,3].map((i) => (
                  <div key={i} className="bg-white rounded-3xl p-4 animate-pulse flex items-center gap-3">
                    <div className="h-12 w-12 rounded-2xl bg-slate-100 shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 bg-slate-100 rounded-full w-3/4" />
                      <div className="h-2.5 bg-slate-100 rounded-full w-1/2" />
                      <div className="h-2 bg-slate-100 rounded-full w-1/3" />
                    </div>
                    <div className="space-y-2 shrink-0">
                      <div className="h-6 w-16 bg-slate-100 rounded-full" />
                      <div className="h-3 bg-slate-100 rounded-full w-12" />
                    </div>
                  </div>
                ))}
              </div>
            ) : mobileFiltered.length === 0 ? (
              <div className="bg-white rounded-3xl px-4 py-12 text-center flex flex-col items-center shadow-sm">
                <div className="h-14 w-14 rounded-2xl bg-[#dbeafe] flex items-center justify-center mb-3">
                  <ShoppingBag className="h-6 w-6 text-[#0066FF]" strokeWidth={1.8} />
                </div>
                <p className="text-[14px] font-bold text-[#0f1c3f]">Belum ada order</p>
                <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                  {q ? "Tidak ada hasil untuk pencarian ini." : "Buat order baru untuk memulai."}
                </p>
                {!q && (
                  <button
                    onClick={() => setAddOpen(true)}
                    className="mt-4 inline-flex items-center gap-1.5 h-10 px-5 rounded-2xl text-[12px] font-bold text-white shadow-sm active:opacity-80 transition-opacity"
                    style={{ background: "linear-gradient(135deg,#0066FF,#0038B8)" }}
                  >
                    <Plus className="h-3.5 w-3.5" /> Order Baru
                  </button>
                )}
              </div>
            ) : (
              <motion.div
                className="space-y-3"
                initial="hidden"
                animate="visible"
                variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.05, delayChildren: 0.03 } } }}
              >
                {[...mobileFiltered]
                  .sort((a, b) => new Date(b.createdAt ?? "").getTime() - new Date(a.createdAt ?? "").getTime())
                  .map((o) => {
                  const clientName = o.clientId ? clientNameById.get(o.clientId) : null;
                  const ps = derivePaymentStatus(o.paidAmount ?? 0, o.totalPrice, o.paymentStatus);

                  // Type style
                  const TYPE_CONFIG: Record<string, { label: string; icon: React.ReactNode; iconBg: string; labelColor: string }> = {
                    flight: {
                      label: "TIKET PESAWAT",
                      icon: <Plane className="h-5 w-5 text-[#0066FF]" strokeWidth={1.8} />,
                      iconBg: "#dbeafe",
                      labelColor: "text-[#0066FF]",
                    },
                    visa_voa: {
                      label: "VISA VOA",
                      icon: <FileText className="h-5 w-5 text-[#10b981]" strokeWidth={1.8} />,
                      iconBg: "#d1fae5",
                      labelColor: "text-[#10b981]",
                    },
                    visa_student: {
                      label: "VISA PELAJAR",
                      icon: <FileText className="h-5 w-5 text-[#f59e0b]" strokeWidth={1.8} />,
                      iconBg: "#fef3c7",
                      labelColor: "text-[#f59e0b]",
                    },
                    umrah: {
                      label: "PAKET & TRIP",
                      icon: <Package className="h-5 w-5 text-[#8b5cf6]" strokeWidth={1.8} />,
                      iconBg: "#ede9fe",
                      labelColor: "text-[#8b5cf6]",
                    },
                  };
                  const tc = TYPE_CONFIG[o.type] ?? {
                    label: ORDER_TYPE_LABEL[o.type]?.toUpperCase() ?? "ORDER",
                    icon: <ShoppingBag className="h-5 w-5 text-slate-500" strokeWidth={1.8} />,
                    iconBg: "#f1f5f9",
                    labelColor: "text-slate-500",
                  };

                  const STATUS_BADGE: Record<string, string> = {
                    Draft:      "bg-slate-100 text-slate-600",
                    Confirmed:  "bg-amber-100 text-amber-700",
                    Processing: "bg-blue-100 text-blue-700",
                    Done:       "bg-emerald-100 text-emerald-700",
                    Paid:       "bg-emerald-100 text-emerald-700",
                    Completed:  "bg-emerald-100 text-emerald-700",
                    Cancelled:  "bg-red-100 text-red-600",
                  };
                  const STATUS_LABEL_MAP: Record<string, string> = {
                    Draft: "DRAFT", Confirmed: "CONFIRMED", Processing: "DIPROSES",
                    Done: "SELESAI", Paid: "DIBAYAR", Completed: "SELESAI", Cancelled: "DIBATALKAN",
                  };

                  return (
                    <motion.button
                      key={o.id}
                      variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] } } }}
                      whileTap={{ scale: 0.985 }}
                      onClick={() => navigate(`/orders/detail/${o.id}`)}
                      className="w-full bg-white rounded-3xl p-4 shadow-sm text-left flex items-start gap-3.5 active:opacity-80 transition-opacity"
                      style={{ WebkitTapHighlightColor: "transparent" }}
                    >
                      {/* Icon */}
                      <div className="h-12 w-12 rounded-2xl flex items-center justify-center shrink-0" style={{ backgroundColor: tc.iconBg }}>
                        {tc.icon}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <p className={cn("text-[9px] font-extrabold uppercase tracking-wider mb-0.5", tc.labelColor)}>
                          {tc.label}
                        </p>
                        <p className="text-[13px] font-extrabold text-[#0f1c3f] leading-snug truncate">
                          {o.title || ORDER_TYPE_LABEL[o.type]}
                        </p>
                        {clientName && (
                          <p className="text-[11px] text-slate-400 mt-0.5 truncate font-medium">{clientName}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          <span className={cn("text-[9.5px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap", STATUS_BADGE[o.status] ?? "bg-slate-100 text-slate-600")}>
                            {STATUS_LABEL_MAP[o.status] ?? o.status}
                          </span>
                          <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded-full border whitespace-nowrap", PAYMENT_STATUS_STYLE[ps])}>
                            {PAYMENT_STATUS_EMOJI[ps]} {PAYMENT_STATUS_LABEL[ps]}
                          </span>
                          {user?.role !== "agent" && (!o.costPrice || o.costPrice === 0) && (
                            <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 whitespace-nowrap">
                              <AlertTriangle className="h-2.5 w-2.5" />HPP
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Price + chevron */}
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <p className="text-[13px] font-extrabold text-[#0f1c3f] tabular-nums">
                          {fmtOrderPrice(o.totalPrice, o.currency)}
                        </p>
                        <ChevronRight className="h-4 w-4 text-slate-300 mt-auto" />
                      </div>
                    </motion.button>
                  );
                })}
              </motion.div>
            )}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
           DESKTOP LAYOUT  (hidden md:block)
      ══════════════════════════════════════════════════════════ */}
      <motion.div
        className="hidden md:block p-4 md:p-6 max-w-[1400px] mx-auto space-y-5"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {(typeFilter || clientIdParam) && (
              <Button variant="ghost" size="sm" onClick={() => navigate("/orders")} className="h-8 px-2">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <div>
              <h1 className="text-2xl md:text-[30px] font-bold flex items-center gap-2 leading-tight">
                {typeFilter ? <span className="text-3xl">{ORDER_TYPE_EMOJI[typeFilter]}</span> : <ShoppingBag className="h-7 w-7" />}
                {heading}
              </h1>
              {clientIdParam && clientNameById.get(clientIdParam) && (
                <p className="text-[12px] text-muted-foreground mt-0.5">
                  Filter: klien <span className="font-semibold">{clientNameById.get(clientIdParam)}</span>
                </p>
              )}
            </div>
          </div>
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> Order Baru
          </Button>
        </div>

        {/* Type filter chips */}
        <div className="flex flex-wrap gap-2">
          <FilterChip active={!typeFilter} onClick={() => navigate(clientIdParam ? `/orders?clientId=${clientIdParam}` : "/orders")}>
            Semua
          </FilterChip>
          {ORDER_TYPES.map((t) => (
            <FilterChip key={t} active={typeFilter === t} onClick={() => navigate(`/orders/${t}${clientIdParam ? `?clientId=${clientIdParam}` : ""}`)}>
              <span className="mr-1">{ORDER_TYPE_EMOJI[t]}</span>{ORDER_TYPE_LABEL[t]}
            </FilterChip>
          ))}
        </div>

        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari judul / klien / status…" className="pl-10 h-11 text-sm" />
        </div>

        {loadingOrders && orders.length === 0 ? (
          <div className="text-sm text-muted-foreground">Memuat…</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center">
            <ShoppingBag className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">Belum ada order. Buat order baru untuk memulai.</p>
            <Button className="mt-4" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" /> Order Baru
            </Button>
          </div>
        ) : (
          <motion.div
            className="space-y-2"
            initial="hidden"
            animate="visible"
            variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.042, delayChildren: 0.04 } } }}
          >
            {filtered.map((o) => (
              <motion.div
                key={o.id}
                variants={{
                  hidden: { opacity: 0, y: 8 },
                  visible: { opacity: 1, y: 0, transition: { duration: 0.26, ease: [0.16, 1, 0.3, 1] } },
                }}
                whileHover={{ y: -2, boxShadow: "0 8px 20px -6px rgba(0,0,0,0.09)" }}
                whileTap={{ scale: 0.985 }}
              >
                <Link to={`/orders/detail/${o.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-white p-3 hover:bg-secondary/40 hover:border-primary/20 transition-colors">
                  <div className="min-w-0 flex items-center gap-3">
                    <span className="text-2xl">{ORDER_TYPE_EMOJI[o.type]}</span>
                    <div className="min-w-0">
                      <div className="font-semibold text-sm truncate">{o.title || ORDER_TYPE_LABEL[o.type]}</div>
                      <div className="text-[11.5px] text-muted-foreground truncate">
                        {ORDER_TYPE_LABEL[o.type]}
                        {o.clientId && clientNameById.get(o.clientId) && (
                          <>
                            {" · "}
                            <span
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(`/clients/${o.clientId}`); }}
                              className="hover:underline hover:text-primary cursor-pointer"
                            >
                              {clientNameById.get(o.clientId)}
                            </span>
                          </>
                        )}
                        {" · "}{o.status}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {(() => {
                      const ps = derivePaymentStatus(o.paidAmount ?? 0, o.totalPrice, o.paymentStatus);
                      return (
                        <span className={cn("text-[9.5px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap", PAYMENT_STATUS_STYLE[ps])}>
                          {PAYMENT_STATUS_EMOJI[ps]} {PAYMENT_STATUS_LABEL[ps]}
                        </span>
                      );
                    })()}
                    {user?.role !== "agent" && (!o.costPrice || o.costPrice === 0) && (
                      <span className="inline-flex items-center gap-0.5 text-[9.5px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 whitespace-nowrap">
                        <AlertTriangle className="h-3 w-3" />HPP belum diisi
                      </span>
                    )}
                    <span className="text-sm font-mono font-semibold">{fmtOrderPrice(o.totalPrice, o.currency)}</span>
                  </div>
                </Link>
              </motion.div>
            ))}
          </motion.div>
        )}
      </motion.div>

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

      <MobileFAB onClick={() => setAddOpen(true)} label="Order Baru" />
    </>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-full text-sm font-semibold border transition ${
        active
          ? "bg-primary text-primary-foreground border-transparent"
          : "bg-white text-muted-foreground border-border hover:bg-secondary"
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
