import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  TrendingUp, TrendingDown, Wallet, ShieldCheck, Filter,
  Trophy, BarChart3, ArrowUpDown, ChevronUp, ChevronDown, Search, FileDown,
  Info, AlertTriangle, Clock, CalendarDays, ChevronRight, Users,
  ArrowUp, ArrowDown, DollarSign, Banknote, Receipt, PieChart as PieChartIcon,
} from "lucide-react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip as ReTooltip,
  AreaChart, Area, XAxis, YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { useOrdersStore } from "@/store/ordersStore";
import { useClientsStore } from "@/store/clientsStore";
import { useAuthStore, type MemberInfo } from "@/store/authStore";
import {
  ORDER_TYPE_LABEL, ORDER_TYPE_EMOJI, type Order, type OrderType,
} from "@/features/orders/ordersRepo";
import {
  profitIDR, revenueIDR, costIDR, fmtIDR, voaOpCost, kurirOpCost,
  agentFeeFromMeta, pelaksanaFeeFromMeta, profitBreakdown,
  paidAmountIDR, receivableIDR,
} from "@/lib/profit";
import {
  type PaymentStatus,
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_STYLE,
  PAYMENT_STATUS_EMOJI,
  isReceivable,
  fmtIDRShort,
  derivePaymentStatus,
} from "@/lib/paymentStatus";
import { useRatesStore } from "@/store/ratesStore";
import { listAgentPoints, sumPointsByAgent, type AgentPoint } from "@/features/agentPoints/agentPointsRepo";
import { buildLedgerEntries, ledgerSummary } from "@/lib/ledgerSync";
import { loadProductCommissions, pullProductCommissions, type ProductCommissions } from "@/lib/productCommissions";
import { cn } from "@/lib/utils";

type RangeKey = "this_month" | "last_month" | "this_year" | "all";
type AgentFilter = "all" | "direct" | string;
type ActiveTab = "ringkasan" | "arus_kas" | "piutang" | "agen_komisi";

const RANGE_LABEL: Record<RangeKey, string> = {
  this_month: "Bulan ini",
  last_month: "Bulan lalu",
  this_year: "Tahun ini",
  all: "Semua waktu",
};

const PREV_LABEL: Record<RangeKey, string> = {
  this_month: "Apr",
  last_month: "2 bln lalu",
  this_year: "thn lalu",
  all: "",
};

function rangeBounds(key: RangeKey): { from: Date | null; to: Date | null } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (key) {
    case "this_month":  return { from: new Date(y, m, 1),     to: new Date(y, m + 1, 1) };
    case "last_month":  return { from: new Date(y, m - 1, 1), to: new Date(y, m, 1)     };
    case "this_year":   return { from: new Date(y, 0, 1),     to: new Date(y + 1, 0, 1) };
    default:            return { from: null, to: null };
  }
}

function prevRangeBounds(key: RangeKey): { from: Date | null; to: Date | null } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (key) {
    case "this_month":  return { from: new Date(y, m - 1, 1),  to: new Date(y, m, 1)      };
    case "last_month":  return { from: new Date(y, m - 2, 1),  to: new Date(y, m - 1, 1)  };
    case "this_year":   return { from: new Date(y - 1, 0, 1),  to: new Date(y, 0, 1)      };
    default:            return { from: null, to: null };
  }
}

const TYPE_COLOR: Record<string, string> = {
  umrah:        "#0866FF",
  flight:       "#f97316",
  visa_voa:     "#a855f7",
  visa_student: "#10b981",
};

const TYPE_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  umrah:        { bg: "bg-blue-100",   text: "text-blue-700",   label: "Umrah" },
  flight:       { bg: "bg-orange-100", text: "text-orange-700", label: "Tiket Pesawat" },
  visa_voa:     { bg: "bg-purple-100", text: "text-purple-700", label: "Visa VOA" },
  visa_student: { bg: "bg-emerald-100",text: "text-emerald-700",label: "Visa Pelajar" },
};

function growthPct(cur: number, prev: number): number | null {
  if (prev === 0) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

function GrowthBadge({ pct, label }: { pct: number | null; label?: string }) {
  if (pct === null) return <span className="text-[10px] text-muted-foreground">—</span>;
  const pos = pct >= 0;
  return (
    <span className={cn("flex items-center gap-0.5 text-[11px] font-semibold", pos ? "text-emerald-600" : "text-red-500")}>
      {pos ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {Math.abs(pct).toFixed(1)}%
      {label && <span className="text-[10px] font-normal text-muted-foreground ml-0.5">dari {label}</span>}
    </span>
  );
}

export default function Reports() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const listMembers = useAuthStore((s) => s.listMembers);
  const { orders, fetchOrders } = useOrdersStore();
  const { clients, fetchClients } = useClientsStore();
  const egpRate = useRatesStore((s) => s.rates.EGP);

  const [range, setRange]             = useState<RangeKey>("this_month");
  const [agentFilter, setAgentFilter] = useState<AgentFilter>("all");
  const [dateFilterMode, setDateFilterMode] = useState<"createdAt" | "paidAt">("createdAt");
  const [members, setMembers]         = useState<MemberInfo[]>([]);
  const [points, setPoints]           = useState<AgentPoint[]>([]);
  const [activeTab, setActiveTab]     = useState<ActiveTab>("ringkasan");
  const [productCommissions, setProductCommissions] = useState<ProductCommissions>(() => loadProductCommissions());
  const [sortCol, setSortCol]         = useState<"date"|"revenue"|"modal"|"opex"|"profit"|"margin">("profit");
  const [sortDir, setSortDir]         = useState<"asc"|"desc">("desc");
  const [pkgSearch, setPkgSearch]     = useState("");

  useEffect(() => {
    void fetchOrders();
    if (clients.length === 0) void fetchClients();
    void (async () => {
      try {
        const [m, p] = await Promise.all([listMembers(), listAgentPoints()]);
        setMembers(m);
        setPoints(p);
      } catch { /* ignore */ }
    })();
    void pullProductCommissions().then((v) => { if (v) setProductCommissions(v); });
  }, [fetchOrders, fetchClients, clients.length, listMembers]);

  const { from, to }             = rangeBounds(range);
  const { from: pFrom, to: pTo } = prevRangeBounds(range);

  const memberById = useMemo(() => {
    const m = new Map<string, MemberInfo>();
    for (const x of members) m.set(x.userId, x);
    return m;
  }, [members]);

  const agentMembers = useMemo(() => members.filter((m) => m.role === "agent"), [members]);

  const clientNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of clients) m.set(c.id, c.name);
    return m;
  }, [clients]);

  const ledgerEntries = useMemo(
    () => buildLedgerEntries(orders, clientNameById, egpRate, undefined, memberById, productCommissions),
    [orders, clientNameById, egpRate, memberById, productCommissions],
  );
  const ledgerStats = useMemo(() => ledgerSummary(ledgerEntries), [ledgerEntries]);

  const agencyProfit = useCallback(
    (o: Order): number => {
      const gross  = profitIDR(o, egpRate);
      const member = o.createdByAgent ? memberById.get(o.createdByAgent) : undefined;
      const agentFee = member?.role === "agent" ? agentFeeFromMeta(o) : 0;
      return gross - agentFee - pelaksanaFeeFromMeta(o) - voaOpCost(o) - kurirOpCost(o);
    },
    [egpRate, memberById],
  );

  const filterOrders = useCallback(
    (os: Order[], f: Date | null, t: Date | null) =>
      os.filter((o) => {
        if (o.status === "Cancelled") return false;
        const orderDate = dateFilterMode === "paidAt"
          ? (o.meta?.paidAt ?? o.updatedAt ?? o.createdAt)
          : o.createdAt;
        const ts = new Date(orderDate).getTime();
        if (f && ts < f.getTime()) return false;
        if (t && ts >= t.getTime()) return false;
        if (agentFilter === "direct" && o.createdByAgent != null) return false;
        if (agentFilter !== "all" && agentFilter !== "direct" && o.createdByAgent !== agentFilter) return false;
        return true;
      }),
    [agentFilter, dateFilterMode],
  );

  const filtered = useMemo(() => filterOrders(orders, from, to), [orders, from, to, filterOrders]);
  const prevFiltered = useMemo(() => (pFrom ? filterOrders(orders, pFrom, pTo) : []), [orders, pFrom, pTo, filterOrders]);

  // ── KPI totals ─────────────────────────────────────────────────────────────
  const totals = useMemo(() => {
    let revenue = 0, cost = 0;
    for (const o of filtered) { revenue += revenueIDR(o, egpRate); cost += costIDR(o, egpRate); }
    return { revenue, cost, count: filtered.length };
  }, [filtered, egpRate]);

  const cashflow = useMemo(() => {
    let cashReceived = 0, netProfitReal = 0, profitPending = 0, paidCount = 0, dpCount = 0, unpaidCount = 0;
    for (const o of filtered) {
      const ps = derivePaymentStatus(Number(o.paidAmount ?? 0), Number(o.totalPrice ?? 0), o.paymentStatus);
      cashReceived += paidAmountIDR(o, egpRate);
      if (ps === "PAID")        { netProfitReal += agencyProfit(o); paidCount++; }
      else if (ps === "DP")     { profitPending += agencyProfit(o); dpCount++; }
      else if (ps === "UNPAID") { profitPending += agencyProfit(o); unpaidCount++; }
    }
    return { cashReceived, netProfitReal, profitPending, paidCount, dpCount, unpaidCount };
  }, [filtered, egpRate, agencyProfit]);

  const prevCashflow = useMemo(() => {
    let cashReceived = 0, netProfitReal = 0, profitPending = 0;
    let cost = 0;
    for (const o of prevFiltered) {
      cashReceived += paidAmountIDR(o, egpRate);
      cost += costIDR(o, egpRate);
      const ps = derivePaymentStatus(Number(o.paidAmount ?? 0), Number(o.totalPrice ?? 0), o.paymentStatus);
      if (ps === "PAID")        netProfitReal += agencyProfit(o);
      else                      profitPending += agencyProfit(o);
    }
    return { cashReceived, netProfitReal, profitPending, cost };
  }, [prevFiltered, egpRate, agencyProfit]);

  // ── Split: Direct vs Agent ──────────────────────────────────────────────────
  const split = useMemo(() => {
    let directNetProfit = 0, directRevenue = 0, directCount = 0;
    let agentGrossProfit = 0, agentModal = 0, agentRevenue = 0, agentCount = 0;
    let totalCommission = 0, totalFieldFee = 0, totalTransportOpex = 0;

    for (const o of filtered) {
      const gross = profitIDR(o, egpRate);
      const r = revenueIDR(o, egpRate);
      const c = costIDR(o, egpRate);
      const meta = (o.metadata ?? {}) as Record<string, unknown>;
      const voaFieldFeeAmt  = o.type === "visa_voa" ? Number(meta.voaAgentFee ?? 0) : 0;
      const voaTransportAmt = voaOpCost(o) - voaFieldFeeAmt;
      const kurirAmt        = kurirOpCost(o);
      const pelFee          = pelaksanaFeeFromMeta(o);
      const member          = o.createdByAgent ? memberById.get(o.createdByAgent) : undefined;
      const isAgentOrder    = o.createdByAgent != null && member?.role === "agent";

      if (isAgentOrder) {
        agentGrossProfit   += gross;
        agentRevenue       += r;
        agentModal         += c;
        agentCount         += 1;
        totalCommission    += agentFeeFromMeta(o);
        totalFieldFee      += voaFieldFeeAmt + pelFee;
        totalTransportOpex += voaTransportAmt + kurirAmt;
      } else {
        directNetProfit += gross - pelFee - voaFieldFeeAmt - voaTransportAmt - kurirAmt;
        directRevenue   += r;
        directCount     += 1;
      }
    }
    const agentNetForAgency = agentGrossProfit - totalCommission - totalFieldFee - totalTransportOpex;
    const netAgencyProfit   = directNetProfit + agentNetForAgency;
    return {
      directProfit: directNetProfit, directRevenue, directCount,
      agentGrossProfit, agentRevenue, agentModal, agentCount,
      totalCommission, totalFieldFee, totalTransportOpex, agentNetForAgency, netAgencyProfit,
    };
  }, [filtered, memberById, egpRate]);

  // ── Piutang ─────────────────────────────────────────────────────────────────
  const piutang = useMemo(() => {
    let totalTagihan = 0, totalCair = 0, totalPiutang = 0, piutangCount = 0;
    const piutangOrders: Array<{ order: Order; remaining: number; clientName: string }> = [];
    for (const o of orders) {
      if (o.status === "Cancelled") continue;
      totalTagihan += revenueIDR(o, egpRate);
      totalCair    += paidAmountIDR(o, egpRate);
      if (isReceivable(o.paymentStatus)) {
        const rem = receivableIDR(o, egpRate);
        if (rem > 0) {
          totalPiutang += rem;
          piutangCount++;
          piutangOrders.push({
            order: o,
            remaining: rem,
            clientName: o.clientId
              ? (clientNameById.get(o.clientId) ?? `Klien ${o.clientId.slice(0,6)}…`)
              : "— Tanpa klien —",
          });
        }
      }
    }
    piutangOrders.sort((a, b) => b.remaining - a.remaining);
    return { totalTagihan, totalCair, totalPiutang, piutangCount, piutangOrders };
  }, [orders, clients, egpRate, clientNameById]);

  // ── Per-type breakdown for pie + sumber dana ────────────────────────────────
  const byType = useMemo(() => {
    const m = new Map<OrderType, { profit: number; revenue: number; cash: number; count: number }>();
    for (const o of filtered) {
      const cur = m.get(o.type) ?? { profit: 0, revenue: 0, cash: 0, count: 0 };
      cur.profit  += agencyProfit(o);
      cur.revenue += revenueIDR(o, egpRate);
      cur.cash    += paidAmountIDR(o, egpRate);
      cur.count   += 1;
      m.set(o.type, cur);
    }
    return Array.from(m.entries()).map(([type, v]) => ({
      type, label: ORDER_TYPE_LABEL[type], emoji: ORDER_TYPE_EMOJI[type], ...v,
    }));
  }, [filtered, egpRate, agencyProfit]);

  // ── Sumber dana (cash by type) ──────────────────────────────────────────────
  const sumberDana = useMemo(() => {
    const total = byType.reduce((s, t) => s + t.cash, 0);
    const LABEL: Record<string, string> = {
      flight: "Penjualan Tiket", umrah: "Pembayaran Klien",
      visa_voa: "Visa VOA", visa_student: "Visa Pelajar",
    };
    const ICON: Record<string, string> = {
      flight: "✈️", umrah: "🕋", visa_voa: "🛂", visa_student: "📋",
    };
    return {
      total,
      items: byType
        .filter((t) => t.cash > 0)
        .sort((a, b) => b.cash - a.cash)
        .map((t) => ({
          label: LABEL[t.type] ?? ORDER_TYPE_LABEL[t.type],
          icon:  ICON[t.type] ?? "📦",
          amount: t.cash,
          pct: total > 0 ? Math.round((t.cash / total) * 100) : 0,
        })),
    };
  }, [byType]);

  // ── Top clients ──────────────────────────────────────────────────────────────
  const byClient = useMemo(() => {
    const m = new Map<string, { profit: number; revenue: number; count: number }>();
    for (const o of filtered) {
      const key = o.clientId ?? "__none";
      const cur = m.get(key) ?? { profit: 0, revenue: 0, count: 0 };
      cur.profit  += agencyProfit(o);
      cur.revenue += revenueIDR(o, egpRate);
      cur.count   += 1;
      m.set(key, cur);
    }
    return Array.from(m.entries())
      .map(([clientId, v]) => ({
        clientId,
        name: clientId === "__none" ? "— Tanpa klien —" : (clientNameById.get(clientId) ?? `Klien ${clientId.slice(0,6)}…`),
        ...v,
      }))
      .sort((a, b) => b.profit - a.profit);
  }, [filtered, clientNameById, egpRate, agencyProfit]);

  // ── Leaderboard ──────────────────────────────────────────────────────────────
  const leaderboard = useMemo(() => {
    const lifetimePoints = sumPointsByAgent(points);
    const m = new Map<string, { profit: number; orders: number; revenue: number; commission: number }>();
    for (const o of filtered) {
      if (!o.createdByAgent) continue;
      const member = memberById.get(o.createdByAgent);
      if (!member || member.role !== "agent") continue;
      const cur = m.get(o.createdByAgent) ?? { profit: 0, orders: 0, revenue: 0, commission: 0 };
      cur.profit     += agencyProfit(o);
      cur.revenue    += revenueIDR(o, egpRate);
      cur.orders     += 1;
      cur.commission += agentFeeFromMeta(o);
      m.set(o.createdByAgent, cur);
    }
    for (const a of agentMembers) {
      if (!m.has(a.userId)) m.set(a.userId, { profit: 0, orders: 0, revenue: 0, commission: 0 });
    }
    return Array.from(m.entries()).map(([agentId, v]) => ({
      agentId, name: memberById.get(agentId)?.displayName ?? `Agent ${agentId.slice(0,6)}…`,
      ...v, lifetimePoints: lifetimePoints.get(agentId) ?? 0,
    })).sort((a, b) => b.profit !== a.profit ? b.profit - a.profit : b.lifetimePoints - a.lifetimePoints);
  }, [filtered, agentMembers, memberById, points, egpRate, agencyProfit]);

  // ── Sparkline data (net profit by day in current period) ────────────────────
  const sparklineData = useMemo(() => {
    if (filtered.length === 0) return [];
    const byDay = new Map<string, number>();
    for (const o of filtered) {
      const d = new Date(o.createdAt).toISOString().slice(0, 10);
      byDay.set(d, (byDay.get(d) ?? 0) + agencyProfit(o));
    }
    return Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([d, v]) => ({ d: d.slice(5), v }));
  }, [filtered, agencyProfit]);

  // ── Profit breakdown per order ───────────────────────────────────────────────
  const byOrder = useMemo(() => {
    return filtered.map((o) => {
      const revenue    = revenueIDR(o, egpRate);
      const cost       = costIDR(o, egpRate);
      const meta       = (o.metadata ?? {}) as Record<string, unknown>;
      const ip         = (meta?.internalProfit ?? null) as { opexIDR?: number } | null;
      const internalOpex = ip?.opexIDR ? Number(ip.opexIDR) : 0;
      const voaOpexIDR = voaOpCost(o);
      const kurirIDR   = kurirOpCost(o);
      const pelFee     = pelaksanaFeeFromMeta(o);
      const rawMeta    = meta;
      const voaAgentFeeAmt     = voaOpexIDR > 0 ? Number(rawMeta.voaAgentFee     ?? 0) : 0;
      const voaTransportFeeAmt = voaOpexIDR > 0 ? Number(rawMeta.voaTransportFee ?? 0) : 0;
      const voaOtherFeeAmt     = voaOpexIDR > 0 ? Number(rawMeta.voaOtherFee     ?? 0) : 0;
      const voaFieldAgentId    = rawMeta.voaFieldAgentId as string | undefined;
      const kurirFeeAmt          = kurirIDR > 0 ? Number(rawMeta.kurirFee          ?? 0) : 0;
      const kurirTransportFeeAmt = kurirIDR > 0 ? Number(rawMeta.kurirTransportFee ?? 0) : 0;
      const kurirOtherFeeAmt     = kurirIDR > 0 ? Number(rawMeta.kurirOtherFee     ?? 0) : 0;
      const member   = o.createdByAgent ? memberById.get(o.createdByAgent) : undefined;
      const agentFee = member?.role === "agent" ? agentFeeFromMeta(o) : 0;
      const modal  = Math.max(0, cost - internalOpex);
      const biaya  = internalOpex + voaOpexIDR + kurirIDR + agentFee + pelFee;
      const profit = agencyProfit(o);
      const grossProfit = profitBreakdown(o, egpRate, agentFee).gross;
      const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
      return {
        id: o.id, title: o.title || "—", date: o.createdAt, type: o.type,
        revenue, modal, biaya, profit, margin, grossProfit,
        agentFee, pelFee, voaOpexIDR, voaAgentFeeAmt, voaTransportFeeAmt, voaOtherFeeAmt,
        voaFieldAgentName: voaFieldAgentId ? (memberById.get(voaFieldAgentId)?.displayName ?? null) : null,
        kurirIDR, kurirFeeAmt, kurirTransportFeeAmt, kurirOtherFeeAmt,
        internalOpex, agentName: agentFee > 0 ? (member?.displayName ?? "Agen") : null,
        paymentStatus: (o.paymentStatus ?? "UNPAID") as PaymentStatus,
        paidAmountRow: paidAmountIDR(o, egpRate),
      };
    });
  }, [filtered, egpRate, agencyProfit, memberById]);

  const byOrderFiltered = useMemo(() => {
    const q = pkgSearch.trim().toLowerCase();
    const rows = q ? byOrder.filter((r) => r.title.toLowerCase().includes(q)) : byOrder;
    return [...rows].sort((a, b) => {
      let diff = 0;
      if      (sortCol === "date")    diff = new Date(a.date).getTime() - new Date(b.date).getTime();
      else if (sortCol === "revenue") diff = a.revenue - b.revenue;
      else if (sortCol === "modal")   diff = a.modal - b.modal;
      else if (sortCol === "opex")    diff = a.biaya - b.biaya;
      else if (sortCol === "profit")  diff = a.profit - b.profit;
      else if (sortCol === "margin")  diff = a.margin - b.margin;
      return sortDir === "desc" ? -diff : diff;
    });
  }, [byOrder, pkgSearch, sortCol, sortDir]);

  function toggleSort(col: typeof sortCol) {
    if (sortCol === col) setSortDir((d) => d === "desc" ? "asc" : "desc");
    else { setSortCol(col); setSortDir("desc"); }
  }

  function SortIcon({ col }: { col: typeof sortCol }) {
    if (sortCol !== col) return <ArrowUpDown className="h-3 w-3 opacity-40 ml-0.5 inline" />;
    return sortDir === "desc"
      ? <ChevronDown className="h-3 w-3 ml-0.5 inline text-blue-600" />
      : <ChevronUp   className="h-3 w-3 ml-0.5 inline text-blue-600" />;
  }

  const fmtDate = (iso: string) => {
    try { return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(iso)); }
    catch { return iso; }
  };

  const dateRangeDisplay = useMemo(() => {
    if (!from || !to) return "Semua Waktu";
    const fmt = (d: Date) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" }).format(d);
    const toDisplay = new Date(to.getTime() - 1);
    return `${fmt(from)} – ${fmt(toDisplay)}`;
  }, [from, to]);

  const pieData = byType.filter((x) => x.profit > 0).map((x) => ({ name: x.label, value: x.profit, type: x.type }));
  const top3    = byClient.slice(0, 3);

  const TABS: { key: ActiveTab; label: string }[] = [
    { key: "ringkasan",    label: "Ringkasan"   },
    { key: "arus_kas",     label: "Arus Kas"    },
    { key: "piutang",      label: "Piutang"     },
    { key: "agen_komisi",  label: "Agen & Komisi" },
  ];

  const prevLabel = PREV_LABEL[range];

  return (
    <div className="max-w-[1400px] mx-auto pb-16 md:pb-10 space-y-0">

      {/* ── HEADER ── */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b border-[hsl(var(--border))]">
        <div className="px-4 md:px-6 pt-4 pb-0 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            {/* Left */}
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "linear-gradient(135deg,#0866FF,#0654D6)" }}>
                <Wallet className="h-4 w-4 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-[17px] font-bold text-foreground leading-tight">Laporan Keuangan</h1>
                <p className="text-[10.5px] text-muted-foreground hidden sm:block">
                  Ringkasan performa keuangan & profitabilitas bisnis Anda
                </p>
              </div>
            </div>
            {/* Right — desktop */}
            <div className="hidden sm:flex items-center gap-2 shrink-0">
              <Button
                variant="outline" size="sm"
                className="h-8 text-[12px] gap-1.5 border-[hsl(var(--border))] font-semibold"
                onClick={() => navigate("/exports")}
              >
                <FileDown className="h-3.5 w-3.5 text-blue-600" /> Export Data
              </Button>
              <div className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-[hsl(var(--border))] bg-white text-[12px] font-medium text-foreground cursor-pointer">
                <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                <Select value={range} onValueChange={(v) => setRange(v as RangeKey)}>
                  <SelectTrigger className="border-0 shadow-none h-auto p-0 text-[12px] font-medium focus:ring-0 w-auto">
                    <SelectValue>{dateRangeDisplay}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(RANGE_LABEL) as RangeKey[]).map((k) => (
                      <SelectItem key={k} value={k}>{RANGE_LABEL[k]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Select value={agentFilter} onValueChange={(v) => setAgentFilter(v as AgentFilter)}>
                <SelectTrigger className="h-8 w-[140px] text-[12px] font-medium">
                  <div className="flex items-center gap-1.5">
                    <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <SelectValue placeholder="Semua Sumber" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Sumber</SelectItem>
                  <SelectItem value="direct">Direct</SelectItem>
                  {agentMembers.map((a) => (
                    <SelectItem key={a.userId} value={a.userId}>{a.displayName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-1 p-1 rounded-lg bg-muted">
                <button
                  onClick={() => setDateFilterMode("createdAt")}
                  className={cn("text-xs px-3 py-1 rounded-md transition-colors",
                    dateFilterMode === "createdAt" ? "bg-background shadow-sm font-medium" : "text-muted-foreground")}
                >
                  Tgl Dibuat
                </button>
                <button
                  onClick={() => setDateFilterMode("paidAt")}
                  className={cn("text-xs px-3 py-1 rounded-md transition-colors",
                    dateFilterMode === "paidAt" ? "bg-background shadow-sm font-medium" : "text-muted-foreground")}
                >
                  Tgl Dibayar
                </button>
              </div>
            </div>
            {/* Right — mobile icon buttons */}
            <div className="flex sm:hidden items-center gap-1.5 shrink-0">
              <button
                onClick={() => navigate("/exports")}
                className="h-8 w-8 flex items-center justify-center rounded-lg border border-[hsl(var(--border))] bg-white"
              >
                <FileDown className="h-4 w-4 text-blue-600" />
              </button>
            </div>
          </div>

          {/* Mobile filter row */}
          <div className="flex sm:hidden items-center gap-2 pb-1 overflow-x-auto scrollbar-none">
            <div className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-[hsl(var(--border))] bg-white text-[12px] font-medium text-foreground shrink-0">
              <CalendarDays className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <Select value={range} onValueChange={(v) => setRange(v as RangeKey)}>
                <SelectTrigger className="border-0 shadow-none h-auto p-0 text-[12px] font-medium focus:ring-0 w-auto">
                  <SelectValue>{RANGE_LABEL[range]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(RANGE_LABEL) as RangeKey[]).map((k) => (
                    <SelectItem key={k} value={k}>{RANGE_LABEL[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Select value={agentFilter} onValueChange={(v) => setAgentFilter(v as AgentFilter)}>
              <SelectTrigger className="h-8 w-auto min-w-[120px] text-[12px] font-medium shrink-0">
                <div className="flex items-center gap-1.5">
                  <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <SelectValue placeholder="Semua Sumber" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Sumber</SelectItem>
                <SelectItem value="direct">Direct</SelectItem>
                {agentMembers.map((a) => (
                  <SelectItem key={a.userId} value={a.userId}>{a.displayName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1 p-1 rounded-lg bg-muted shrink-0">
              <button
                onClick={() => setDateFilterMode("createdAt")}
                className={cn("text-xs px-3 py-1 rounded-md transition-colors",
                  dateFilterMode === "createdAt" ? "bg-background shadow-sm font-medium" : "text-muted-foreground")}
              >
                Tgl Dibuat
              </button>
              <button
                onClick={() => setDateFilterMode("paidAt")}
                className={cn("text-xs px-3 py-1 rounded-md transition-colors",
                  dateFilterMode === "paidAt" ? "bg-background shadow-sm font-medium" : "text-muted-foreground")}
              >
                Tgl Dibayar
              </button>
            </div>
          </div>

          {/* ── Tab bar ── */}
          <div className="flex items-center gap-0 overflow-x-auto scrollbar-none -mx-4 md:-mx-6 px-4 md:px-6">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "px-4 py-2.5 text-[12.5px] font-semibold transition-all border-b-2 -mb-px whitespace-nowrap shrink-0",
                  activeTab === tab.key
                    ? "border-blue-600 text-blue-700"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
              </button>
            ))}
            <div className="flex-1 border-b border-[hsl(var(--border))] -mb-px" />
          </div>
        </div>
      </div>

      {/* ════════════════════ RINGKASAN TAB ════════════════════ */}
      {activeTab === "ringkasan" && (
        <div className="px-4 md:px-6 space-y-4 pt-4">

          {/* ── 4 KPI Cards ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              {
                label: "Keuntungan Bersih",
                value: cashflow.netProfitReal,
                prev:  prevCashflow.netProfitReal,
                icon:  TrendingUp,
                iconBg: "bg-blue-600",
                sub: `dari ${cashflow.paidCount} order sudah lunas`,
              },
              {
                label: "Uang Masuk",
                value: cashflow.cashReceived,
                prev:  prevCashflow.cashReceived,
                icon:  Banknote,
                iconBg: "bg-emerald-500",
                sub: "kas yang sudah diterima",
              },
              {
                label: "Total Modal Keluar",
                value: totals.cost,
                prev:  prevCashflow.cost,
                icon:  Receipt,
                iconBg: "bg-orange-500",
                sub: `biaya & modal dari ${totals.count} order`,
              },
              {
                label: "Potensi Keuntungan",
                value: cashflow.profitPending,
                prev:  prevCashflow.profitPending,
                icon:  Clock,
                iconBg: "bg-violet-500",
                sub: `dari ${cashflow.dpCount + cashflow.unpaidCount} order belum lunas`,
              },
            ].map((card) => {
              const growth = growthPct(card.value, card.prev);
              return (
                <div key={card.label} className="rounded-2xl border border-[hsl(var(--border))] bg-white p-4 flex flex-col gap-2">
                  <div className="flex items-start justify-between">
                    <p className="text-[9.5px] font-bold uppercase tracking-widest text-muted-foreground leading-tight">
                      {card.label}
                    </p>
                    <div className={cn("h-8 w-8 rounded-xl flex items-center justify-center shrink-0", card.iconBg)}>
                      <card.icon className="h-4 w-4 text-white" />
                    </div>
                  </div>
                  <div>
                    <p className="text-[20px] font-black font-mono tabular-nums leading-none text-foreground">
                      {fmtIDR(card.value)}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{card.sub}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <GrowthBadge pct={growth} label={prevLabel || undefined} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Alert Banner ── */}
          {(cashflow.dpCount > 0 || cashflow.unpaidCount > 0) && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-[11.5px] font-semibold text-amber-800 leading-snug">
                    Komisi mitra sudah masuk sebagai biaya operasional.
                  </p>
                  <p className="text-[11px] text-amber-700 mt-0.5">
                    {cashflow.unpaidCount > 0 && <><strong>{cashflow.unpaidCount}</strong> order belum bayar · </>}
                    {cashflow.dpCount > 0     && <><strong>{cashflow.dpCount}</strong> baru DP · </>}
                    Piutang aktif: <span className="tabular-nums font-bold">{fmtIDR(piutang.totalPiutang)}</span>
                  </p>
                </div>
              </div>
              <div className="mt-2 pt-2 border-t border-amber-200 flex items-center justify-between">
                <span className="text-[11px] text-amber-700">Estimasi profit bersih</span>
                <span className="tabular-nums font-bold text-[12px] text-foreground">{fmtIDR(split.netAgencyProfit)}</span>
              </div>
            </div>
          )}

          {/* ── 3 Split Cards ── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">

            {/* Card 1: Direct Commission */}
            <div className="rounded-2xl border border-[hsl(var(--border))] bg-white overflow-hidden">
              <div className="px-4 pt-4 pb-3 border-b border-[hsl(var(--border))]">
                <p className="text-[9.5px] font-bold uppercase tracking-widest text-sky-600">Profit Langsung</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">order tanpa mitra</p>
                <p className="text-[22px] font-black font-mono tabular-nums text-foreground mt-1 leading-none">
                  {fmtIDR(split.directProfit)}
                </p>
                {prevLabel && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Total pengeluaran:{" "}
                    <span className="tabular-nums font-semibold text-foreground">
                      {fmtIDR(split.directRevenue - split.directProfit)}
                    </span>
                  </p>
                )}
              </div>
              <div className="px-4 py-3">
                <table className="w-full text-[11.5px]">
                  <tbody>
                    {[
                      { label: "Revenue Langsung", value: split.directRevenue },
                      { label: "Biaya & Modal",    value: split.directRevenue - split.directProfit },
                      { label: "Profit Menunggu",  value: cashflow.profitPending },
                    ].map((row) => (
                      <tr key={row.label} className="border-b border-[hsl(var(--border))] last:border-0">
                        <td className="py-2 text-muted-foreground">{row.label}</td>
                        <td className="py-2 text-right tabular-nums font-semibold text-foreground">
                          {fmtIDR(row.value)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Card 2: Via Mitra */}
            <div className="rounded-2xl border border-[hsl(var(--border))] bg-white overflow-hidden">
              <div className="px-4 pt-4 pb-3 border-b border-[hsl(var(--border))]">
                <p className="text-[9.5px] font-bold uppercase tracking-widest text-orange-600">Lewat Mitra</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">bersih setelah semua fee mitra</p>
                <p className="text-[22px] font-black font-mono tabular-nums text-foreground mt-1 leading-none">
                  {fmtIDR(split.agentNetForAgency)}
                </p>
                {prevLabel && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Total fee mitra:{" "}
                    <span className="tabular-nums font-semibold text-foreground">
                      {fmtIDR(split.totalCommission + split.totalFieldFee + split.totalTransportOpex)}
                    </span>
                  </p>
                )}
              </div>
              <div className="px-4 py-3">
                <table className="w-full text-[11.5px]">
                  <tbody>
                    {[
                      { label: "Profit Kotor Order Mitra", value: split.agentGrossProfit,  color: "" },
                      { label: "Komisi Mitra",             value: split.totalCommission,   color: "text-orange-600" },
                      { label: "Biaya Lapangan",           value: split.totalFieldFee,     color: "text-violet-600" },
                      { label: "Biaya Transportasi",       value: split.totalTransportOpex,color: "text-amber-600" },
                      { label: "Bersih ke Agensi",         value: split.agentNetForAgency, color: "text-emerald-700 font-bold" },
                    ].map((row) => (
                      <tr key={row.label} className="border-b border-[hsl(var(--border))] last:border-0">
                        <td className="py-1.5 text-muted-foreground">{row.label}</td>
                        <td className={cn("py-1.5 text-right tabular-nums font-semibold", row.color || "text-foreground")}>
                          {row.color.includes("orange") || row.color.includes("violet") || row.color.includes("amber")
                            ? `−${fmtIDR(row.value)}`
                            : fmtIDR(row.value)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {agentMembers.length > 0 && (
                  <button
                    onClick={() => setActiveTab("agen_komisi")}
                    className="mt-3 w-full flex items-center justify-center gap-1 text-[11.5px] font-semibold text-blue-600 hover:underline"
                  >
                    Lihat Detail <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Card 3: Net Profit Agency (with sparkline) */}
            <div className="rounded-2xl border border-[hsl(var(--border))] bg-white overflow-hidden">
              <div className="px-4 pt-4 pb-3">
                <p className="text-[9.5px] font-bold uppercase tracking-widest text-emerald-600">Profit Bersih Agensi</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">langsung + lewat mitra</p>
                <p className="text-[22px] font-black font-mono tabular-nums text-foreground mt-1 leading-none">
                  {fmtIDR(split.netAgencyProfit)}
                </p>
                {prevLabel && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Total biaya:{" "}
                    <span className="tabular-nums font-semibold text-foreground">
                      {fmtIDR(totals.cost + split.totalCommission + split.totalFieldFee + split.totalTransportOpex)}
                    </span>
                  </p>
                )}
              </div>
              {/* Sparkline */}
              {sparklineData.length > 1 && (
                <div className="px-2 h-[80px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={sparklineData} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                      <defs>
                        <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%"   stopColor="#0866FF" stopOpacity={0.25} />
                          <stop offset="100%" stopColor="#0866FF" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="d" hide />
                      <YAxis hide />
                      <Area type="monotone" dataKey="v" stroke="#0866FF" strokeWidth={2} fill="url(#profitGrad)" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
              <div className="px-4 pb-3">
                {prevLabel && (
                  <div className="flex items-center gap-1.5 mt-2">
                    <GrowthBadge
                      pct={growthPct(split.netAgencyProfit, prevCashflow.netProfitReal)}
                      label={prevLabel}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Bottom grid: Pie + Top Clients + Sumber Dana ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">

            {/* Pie chart */}
            <div className="rounded-2xl border border-[hsl(var(--border))] bg-white p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[13px] font-bold text-foreground">Distribusi Profit per Kategori</h2>
              </div>
              {pieData.length === 0 ? (
                <div className="h-[180px] flex items-center justify-center text-[12px] text-muted-foreground">
                  Belum ada profit di periode ini.
                </div>
              ) : (
                <div className="h-[180px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} dataKey="value" cx="50%" cy="50%" outerRadius={72} innerRadius={38} paddingAngle={2}>
                        {pieData.map((entry) => (
                          <Cell key={entry.type} fill={TYPE_COLOR[entry.type as OrderType] ?? "#94a3b8"} />
                        ))}
                      </Pie>
                      <ReTooltip formatter={(v: number) => fmtIDR(v)} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
              <div className="mt-2 space-y-1.5">
                {byType.map((t) => {
                  const total = byType.reduce((s, x) => s + Math.max(0, x.profit), 0);
                  const pct   = total > 0 ? Math.round((Math.max(0, t.profit) / total) * 100) : 0;
                  return (
                    <div key={t.type} className="flex items-center justify-between text-[11.5px]">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: TYPE_COLOR[t.type] ?? "#94a3b8" }} />
                        <span>{t.emoji} {t.label} ({pct}%)</span>
                      </div>
                      <span className="tabular-nums font-semibold text-emerald-700">{fmtIDR(t.profit)}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Top Clients */}
            <div className="rounded-2xl border border-[hsl(var(--border))] bg-white p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[13px] font-bold text-foreground">Klien Paling Menguntungkan</h2>
              </div>
              {/* Top 3 spotlight */}
              {top3.length > 0 && (
                <div className="flex gap-2 mb-3">
                  {top3.map((c, i) => {
                    const medals = ["🥇", "🥈", "🥉"];
                    const bgs    = ["bg-amber-50 border-amber-200", "bg-slate-50 border-slate-200", "bg-orange-50 border-orange-200"];
                    return (
                      <div
                        key={c.clientId}
                        className={cn("flex-1 rounded-xl border p-2.5 cursor-pointer hover:brightness-95 transition-all", bgs[i])}
                        onClick={() => c.clientId !== "__none" && navigate(`/clients/${c.clientId}`)}
                      >
                        <div className="text-base">{medals[i]}</div>
                        <div className="text-[11px] font-semibold truncate mt-0.5">{c.name}</div>
                        <div className="text-[12px] font-black font-mono tabular-nums text-emerald-700 mt-0.5">{fmtIDRShort(c.profit)}</div>
                        <div className="text-[9.5px] text-muted-foreground">{c.count} order</div>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-[11.5px]">
                  <thead>
                    <tr className="border-b border-[hsl(var(--border))] text-muted-foreground">
                      <th className="text-left font-semibold py-1.5 px-1">#</th>
                      <th className="text-left font-semibold py-1.5 px-1">Klien</th>
                      <th className="text-right font-semibold py-1.5 px-1">Order</th>
                      <th className="text-right font-semibold py-1.5 px-1">Revenue</th>
                      <th className="text-right font-semibold py-1.5 px-1">Net Profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byClient.slice(0, 5).map((c, i) => (
                      <tr
                        key={c.clientId}
                        className="border-b border-[hsl(var(--border))] last:border-0 hover:bg-muted/40 cursor-pointer"
                        onClick={() => c.clientId !== "__none" && navigate(`/clients/${c.clientId}`)}
                      >
                        <td className="py-1.5 px-1 text-muted-foreground">{i + 1}</td>
                        <td className="py-1.5 px-1 font-medium truncate max-w-[130px]">{c.name}</td>
                        <td className="py-1.5 px-1 text-right">{c.count}</td>
                        <td className="py-1.5 px-1 text-right tabular-nums">{fmtIDRShort(c.revenue)}</td>
                        <td className={cn("py-1.5 px-1 text-right tabular-nums font-bold", c.profit >= 0 ? "text-emerald-700" : "text-red-600")}>
                          {fmtIDRShort(c.profit)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {byClient.length > 5 && (
                <button
                  onClick={() => setActiveTab("agen_komisi")}
                  className="mt-3 w-full flex items-center justify-center gap-1 text-[11.5px] font-semibold text-blue-600 hover:underline"
                >
                  Lihat Semua Klien <ChevronRight className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Ringkasan Sumber Dana */}
            <div className="rounded-2xl border border-[hsl(var(--border))] bg-white p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[13px] font-bold text-foreground">Ringkasan Sumber Dana</h2>
              </div>
              <div className="space-y-3">
                {sumberDana.items.map((item) => (
                  <div key={item.label} className="space-y-1">
                    <div className="flex items-center justify-between text-[11.5px]">
                      <span className="flex items-center gap-1.5">
                        <span>{item.icon}</span>
                        <span className="font-medium text-foreground">{item.label}</span>
                      </span>
                      <span className="tabular-nums font-semibold text-foreground">{fmtIDR(item.amount)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-[hsl(var(--secondary))] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${item.pct}%`,
                            background: "linear-gradient(90deg,#0866FF,#4f74e8)",
                          }}
                        />
                      </div>
                      <span className="text-[10.5px] font-semibold text-muted-foreground w-8 text-right">{item.pct}%</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-3 border-t border-[hsl(var(--border))] flex items-center justify-between">
                <span className="text-[12px] font-bold text-foreground">Total Cash Masuk</span>
                <span className="text-[14px] font-black font-mono tabular-nums text-foreground">{fmtIDR(sumberDana.total)}</span>
              </div>
              <button
                onClick={() => setActiveTab("arus_kas")}
                className="mt-3 w-full flex items-center justify-center gap-1 text-[11.5px] font-semibold text-blue-600 hover:underline"
              >
                Lihat Semua <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* ── Breakdown Profit per Paket ── */}
          <div className="rounded-2xl border border-[hsl(var(--border))] bg-white overflow-hidden">
            <div className="px-4 py-3 border-b border-[hsl(var(--border))] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-[13px] font-bold text-foreground">Breakdown Profit per Paket</h2>
                <p className="text-[10.5px] text-muted-foreground mt-0.5">
                  Memperlihatkan performa top paket secara detail
                </p>
              </div>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <input
                  type="text" value={pkgSearch} onChange={(e) => setPkgSearch(e.target.value)}
                  placeholder="Cari nama paket…"
                  className="pl-8 pr-3 h-8 w-full sm:w-[180px] rounded-lg border border-[hsl(var(--border))] text-[12px] focus:outline-none focus:ring-1 focus:ring-blue-300 bg-white"
                />
              </div>
            </div>

            {/* Mobile card list */}
            <div className="md:hidden divide-y divide-[hsl(var(--border))]">
              {byOrderFiltered.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground text-[12px]">
                  {pkgSearch ? "Tidak ada paket yang cocok." : "Belum ada order di periode ini."}
                </div>
              ) : (
                byOrderFiltered.map((row) => {
                  const profitColor = row.profit >= 0 ? "text-emerald-700" : "text-red-600";
                  const badge = TYPE_BADGE[row.type] ?? { bg: "bg-slate-100", text: "text-slate-700", label: ORDER_TYPE_LABEL[row.type as OrderType] ?? row.type };
                  const marginColor = row.margin >= 20 ? "text-emerald-700" : row.margin >= 10 ? "text-sky-700" : row.margin >= 0 ? "text-amber-700" : "text-red-600";
                  return (
                    <div
                      key={row.id}
                      className="px-4 py-3 active:bg-blue-50/60 cursor-pointer"
                      onClick={() => navigate(`/orders/detail/${row.id}`)}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold text-sky-700 truncate">{row.title}</p>
                          <p className="text-[10.5px] text-muted-foreground mt-0.5">{fmtDate(row.date)}</p>
                        </div>
                        <span className={cn("inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0", badge.bg, badge.text)}>
                          {badge.label}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <p className="text-[9.5px] text-muted-foreground uppercase tracking-wide">Revenue</p>
                          <p className="text-[12px] font-semibold tabular-nums text-foreground">{fmtIDRShort(row.revenue)}</p>
                        </div>
                        <div>
                          <p className="text-[9.5px] text-muted-foreground uppercase tracking-wide">Biaya</p>
                          <p className="text-[12px] font-semibold tabular-nums text-amber-700">{row.biaya > 0 ? fmtIDRShort(row.biaya) : "—"}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[9.5px] text-muted-foreground uppercase tracking-wide">Profit</p>
                          <p className={cn("text-[13px] font-bold tabular-nums", profitColor)}>
                            {row.profit >= 0 ? "+" : ""}{fmtIDRShort(row.profit)}
                            <span className={cn("text-[10px] font-semibold ml-1", marginColor)}>{row.margin !== 0 ? `${row.margin.toFixed(0)}%` : ""}</span>
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              {byOrderFiltered.length > 0 && (
                <div className="px-4 py-3 bg-blue-50/50 flex items-center justify-between">
                  <span className="text-[11.5px] font-bold text-blue-800">Total ({byOrderFiltered.length} order)</span>
                  <span className={cn("text-[13px] font-black font-mono tabular-nums", byOrderFiltered.reduce((s,r)=>s+r.profit,0) >= 0 ? "text-emerald-700" : "text-red-600")}>
                    {(() => { const t = byOrderFiltered.reduce((s, r) => s + r.profit, 0); return `${t >= 0 ? "+" : ""}${fmtIDRShort(t)}`; })()}
                  </span>
                </div>
              )}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-[12px] min-w-[780px]" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
                <thead>
                  <tr className="text-muted-foreground border-b border-[hsl(var(--border))] bg-[hsl(var(--secondary)/0.5)]">
                    {[
                      { label: "Paket / Order", col: null,      align: "left"  },
                      { label: "Tanggal",        col: "date",    align: "right" },
                      { label: "Tipe",           col: null,      align: "center"},
                      { label: "Revenue",        col: "revenue", align: "right" },
                      { label: "Modal (HPP)",    col: "modal",   align: "right" },
                      { label: "Biaya",          col: "opex",    align: "right" },
                      { label: "Profit Bersih",  col: "profit",  align: "right" },
                      { label: "Margin",         col: "margin",  align: "right" },
                    ].map(({ label, col, align }) => (
                      <th
                        key={label}
                        className={cn(
                          "font-semibold py-2.5 px-3 text-[10.5px] uppercase tracking-wide",
                          align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left",
                          col ? "cursor-pointer select-none hover:text-foreground transition-colors" : "",
                        )}
                        onClick={col ? () => toggleSort(col as typeof sortCol) : undefined}
                      >
                        {label}{col && <SortIcon col={col as typeof sortCol} />}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {byOrderFiltered.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-muted-foreground text-[12px]">
                        {pkgSearch ? "Tidak ada paket yang cocok." : "Belum ada order di periode ini."}
                      </td>
                    </tr>
                  ) : (
                    byOrderFiltered.map((row) => {
                      const marginColor = row.margin >= 20 ? "text-emerald-700" : row.margin >= 10 ? "text-sky-700" : row.margin >= 0 ? "text-amber-700" : "text-red-600";
                      const profitColor = row.profit >= 0 ? "text-emerald-700" : "text-red-600";
                      const badge       = TYPE_BADGE[row.type] ?? { bg: "bg-slate-100", text: "text-slate-700", label: ORDER_TYPE_LABEL[row.type as OrderType] ?? row.type };
                      const hasDeductions = row.agentFee > 0 || row.pelFee > 0 || row.voaOpexIDR > 0 || row.kurirIDR > 0;
                      return (
                        <tr
                          key={row.id}
                          className="border-b border-[hsl(var(--border))] last:border-0 hover:bg-blue-50/50 cursor-pointer transition-colors"
                          onClick={() => navigate(`/orders/detail/${row.id}`)}
                        >
                          <td className="py-2.5 px-3 font-semibold text-sky-700 max-w-[180px] truncate" title={row.title}>
                            {row.title}
                          </td>
                          <td className="py-2.5 px-3 text-right text-muted-foreground whitespace-nowrap text-[11.5px]">
                            {fmtDate(row.date)}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className={cn("inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold", badge.bg, badge.text)}>
                              {badge.label}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right tabular-nums">{fmtIDR(row.revenue)}</td>
                          <td className="py-2.5 px-3 text-right tabular-nums text-rose-700">
                            {row.modal > 0 ? fmtIDR(row.modal) : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="py-2.5 px-3 text-right tabular-nums text-amber-700" onClick={(e) => e.stopPropagation()}>
                            {row.biaya > 0 ? (
                              <span className="relative group/biaya inline-block">
                                {fmtIDR(row.biaya)}
                                <span className="pointer-events-none absolute right-0 bottom-full mb-2 z-50 hidden group-hover/biaya:flex flex-col w-60 rounded-xl border border-amber-200 bg-white shadow-2xl p-2.5 text-[10.5px] text-left gap-0.5">
                                  <span className="font-bold text-foreground mb-1 border-b pb-1">Rincian Biaya</span>
                                  {row.agentFee > 0   && <span className="flex justify-between gap-2 text-orange-700"><span>Fee Agen{row.agentName ? ` (${row.agentName})` : ""}</span><span className="tabular-nums">{fmtIDR(row.agentFee)}</span></span>}
                                  {row.pelFee > 0     && <span className="flex justify-between gap-2 text-violet-700"><span>Fee Pelaksana</span><span className="tabular-nums">{fmtIDR(row.pelFee)}</span></span>}
                                  {row.voaAgentFeeAmt > 0 && <span className="flex justify-between gap-2 text-purple-700"><span>Fee Agent Lapangan</span><span className="tabular-nums">{fmtIDR(row.voaAgentFeeAmt)}</span></span>}
                                  {row.kurirFeeAmt > 0    && <span className="flex justify-between gap-2 text-amber-700"><span>Fee Kurir</span><span className="tabular-nums">{fmtIDR(row.kurirFeeAmt)}</span></span>}
                                  {row.internalOpex > 0   && <span className="flex justify-between gap-2 text-slate-600"><span>Biaya Internal</span><span className="tabular-nums">{fmtIDR(row.internalOpex)}</span></span>}
                                  <span className="flex justify-between gap-2 font-bold text-amber-800 border-t pt-1 mt-0.5"><span>Total</span><span className="tabular-nums">{fmtIDR(row.biaya)}</span></span>
                                </span>
                              </span>
                            ) : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className={cn("py-2.5 px-3 text-right tabular-nums font-bold", profitColor)} onClick={(e) => e.stopPropagation()}>
                            <span className="relative group/profit inline-block">
                              <span className="flex items-center justify-end gap-1">
                                {row.profit >= 0 ? "+" : ""}{fmtIDR(row.profit)}
                                {hasDeductions && <Info className="h-3 w-3 opacity-40 group-hover/profit:opacity-100 transition-opacity shrink-0" />}
                              </span>
                              <span className="pointer-events-none absolute right-0 bottom-full mb-2 z-50 hidden group-hover/profit:flex flex-col w-60 rounded-xl border border-blue-200 bg-white shadow-2xl p-2.5 text-[10.5px] text-left gap-0.5">
                                <span className="font-bold text-foreground mb-1 border-b pb-1">Breakdown Profit Bersih</span>
                                <span className="flex justify-between gap-2 text-sky-700"><span>Revenue</span><span className="tabular-nums">{fmtIDR(row.revenue)}</span></span>
                                <span className="flex justify-between gap-2 text-rose-700"><span>− Modal</span><span className="tabular-nums">{fmtIDR(row.modal)}</span></span>
                                <span className="flex justify-between gap-2 font-semibold text-slate-700 border-t pt-1 mt-0.5"><span>= Gross</span><span className="tabular-nums">{fmtIDR(row.grossProfit)}</span></span>
                                {row.agentFee > 0 && <span className="flex justify-between gap-2 text-orange-700"><span>− Fee Agen</span><span className="tabular-nums">{fmtIDR(row.agentFee)}</span></span>}
                                {row.pelFee > 0   && <span className="flex justify-between gap-2 text-violet-700"><span>− Fee Pelaksana</span><span className="tabular-nums">{fmtIDR(row.pelFee)}</span></span>}
                                {row.voaOpexIDR>0  && <span className="flex justify-between gap-2 text-purple-700"><span>− Biaya VOA</span><span className="tabular-nums">{fmtIDR(row.voaOpexIDR)}</span></span>}
                                {row.kurirIDR>0    && <span className="flex justify-between gap-2 text-amber-700"><span>− Biaya Kurir</span><span className="tabular-nums">{fmtIDR(row.kurirIDR)}</span></span>}
                                <span className={cn("flex justify-between gap-2 font-bold border-t pt-1 mt-0.5", row.profit >= 0 ? "text-emerald-700" : "text-red-600")}>
                                  <span>= Profit Bersih</span><span className="tabular-nums">{fmtIDR(row.profit)}</span>
                                </span>
                              </span>
                            </span>
                          </td>
                          <td className={cn("py-2.5 px-3 text-right font-bold", marginColor)}>
                            {row.margin !== 0 ? (
                              <span className="flex items-center justify-end gap-1.5">
                                {row.margin.toFixed(1)}%
                                <span className="inline-block h-1.5 rounded-full" style={{ width: `${Math.min(Math.abs(row.margin), 50) * 1.2}px`, background: row.margin >= 0 ? "#10b981" : "#ef4444", opacity: 0.7 }} />
                              </span>
                            ) : <span className="text-muted-foreground">—</span>}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                {byOrderFiltered.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-blue-200 bg-blue-50/50 font-bold text-[12px]">
                      <td colSpan={3} className="py-2.5 px-3 text-blue-800">Total ({byOrderFiltered.length} order)</td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-sky-700">{fmtIDR(byOrderFiltered.reduce((s, r) => s + r.revenue, 0))}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-rose-700">{fmtIDR(byOrderFiltered.reduce((s, r) => s + r.modal, 0))}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-amber-700">{fmtIDR(byOrderFiltered.reduce((s, r) => s + r.biaya, 0))}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-emerald-700">
                        {(() => { const t = byOrderFiltered.reduce((s, r) => s + r.profit, 0); return `${t >= 0 ? "+" : ""}${fmtIDR(t)}`; })()}
                      </td>
                      <td className="py-2.5 px-3 text-right text-blue-700">
                        {(() => { const rev = byOrderFiltered.reduce((s, r) => s + r.revenue, 0); const prof = byOrderFiltered.reduce((s, r) => s + r.profit, 0); return rev > 0 ? `${((prof / rev) * 100).toFixed(1)}%` : "—"; })()}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

        </div>
      )}

      {/* ════════════════════ ARUS KAS TAB ════════════════════ */}
      {activeTab === "arus_kas" && (
        <div className="px-4 md:px-6 space-y-4 pt-4">
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Total Revenue",   value: fmtIDR(ledgerStats.totalRevenue),  tone: "sky",     sub: null },
              { label: "Total Modal",     value: fmtIDR(ledgerStats.totalCost),     tone: "amber",   sub: null },
              { label: "Gross Profit",    value: fmtIDR(ledgerStats.totalProfit),   tone: ledgerStats.totalProfit >= 0 ? "emerald" : "red", sub: `${ledgerStats.count} transaksi lunas` },
              { label: "Fee & Biaya Ops", value: `−${fmtIDR(ledgerStats.totalCommission + ledgerStats.totalVoaOpex + ledgerStats.totalKurirOpex + ledgerStats.totalPelaksana)}`, tone: "orange", sub: `Net: ${fmtIDR(ledgerStats.netProfit)}` },
            ].map((r) => (
              <div key={r.label} className={cn("rounded-2xl border bg-gradient-to-br p-4",
                r.tone === "sky"     ? "from-sky-50 to-white border-sky-100 text-sky-700"     :
                r.tone === "amber"   ? "from-amber-50 to-white border-amber-100 text-amber-700" :
                r.tone === "emerald" ? "from-emerald-50 to-white border-emerald-100 text-emerald-700" :
                r.tone === "red"     ? "from-red-50 to-white border-red-100 text-red-600"     :
                "from-orange-50 to-white border-orange-100 text-orange-700"
              )}>
                <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">{r.label}</p>
                <p className="text-lg font-extrabold tabular-nums mt-1">{r.value}</p>
                {r.sub && <p className="text-[10px] text-muted-foreground mt-0.5">{r.sub}</p>}
              </div>
            ))}
          </div>
          {ledgerEntries.length === 0 ? (
            <div className="rounded-2xl border border-[hsl(var(--border))] bg-white p-10 text-center">
              <Wallet className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="font-semibold text-muted-foreground">Belum ada order berstatus Paid atau Completed.</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-[hsl(var(--border))] bg-white overflow-hidden">
              <div className="px-4 py-3 border-b border-[hsl(var(--border))] flex items-center justify-between">
                <h2 className="text-[13px] font-bold">📒 Buku Besar — Transaksi Lunas</h2>
                <span className="text-[10.5px] text-muted-foreground">{ledgerEntries.length} entri · semua waktu</span>
              </div>

              {/* Mobile card list */}
              <div className="md:hidden divide-y divide-[hsl(var(--border))]">
                {ledgerEntries.map((e) => {
                  const isDebit = e.isCommission || e.isVoaOpex || e.isKurirOpex || e.isPelaksanaFee;
                  const textColor = e.isCommission ? "text-orange-700" : e.isVoaOpex ? "text-purple-700" : e.isKurirOpex ? "text-amber-800" : e.isPelaksanaFee ? "text-violet-700" : "";
                  const cardBg = e.isCommission ? "bg-orange-50/40" : e.isVoaOpex ? "bg-purple-50/40" : e.isKurirOpex ? "bg-amber-50/40" : e.isPelaksanaFee ? "bg-violet-50/40" : "";
                  const profitColor = e.profitIDR >= 0 ? "text-emerald-700" : "text-red-600";
                  const balColor = e.runningBalance >= 0 ? "text-emerald-700" : "text-red-600";
                  return (
                    <div
                      key={e.orderId}
                      className={cn("px-4 py-3 cursor-pointer active:brightness-95", cardBg)}
                      onClick={() => navigate(`/orders/detail/${e.orderId.replace(/^(voa_opex_|kurir_opex_|commission_|pelaksana_fee_)/, "")}`)}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="flex-1 min-w-0">
                          <p className={cn("text-[12.5px] font-semibold truncate", isDebit ? textColor : "text-foreground")}>{e.orderTitle}</p>
                          <p className="text-[10.5px] text-muted-foreground">{e.clientName} · {fmtDate(e.paidAt)}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={cn("text-[13px] font-bold tabular-nums", isDebit ? textColor : profitColor)}>
                            {isDebit ? `−${fmtIDRShort(Math.abs(e.profitIDR))}` : `${e.profitIDR >= 0 ? "+" : ""}${fmtIDRShort(e.profitIDR)}`}
                          </p>
                          <p className={cn("text-[10px] tabular-nums font-semibold", balColor)}>Saldo {fmtIDRShort(e.runningBalance)}</p>
                        </div>
                      </div>
                      {!isDebit && (
                        <div className="flex items-center gap-3 text-[10.5px] text-muted-foreground">
                          <span>Rev <span className="tabular-nums text-foreground font-medium">{fmtIDRShort(e.revenueIDR)}</span></span>
                          <span>·</span>
                          <span>Modal <span className="tabular-nums text-rose-700 font-medium">{fmtIDRShort(e.costIDR)}</span></span>
                          <span>·</span>
                          <span>Margin <span className={cn("font-semibold", e.marginPct >= 20 ? "text-emerald-700" : e.marginPct >= 10 ? "text-sky-700" : "text-amber-700")}>{e.marginPct.toFixed(1)}%</span></span>
                        </div>
                      )}
                    </div>
                  );
                })}
                <div className="px-4 py-3 bg-emerald-50/50 flex items-center justify-between">
                  <span className="text-[11.5px] font-bold text-emerald-800">Total ({ledgerStats.count} order)</span>
                  <span className={cn("text-[13px] font-black font-mono tabular-nums", ledgerStats.netProfit >= 0 ? "text-emerald-700" : "text-red-600")}>
                    {fmtIDRShort(ledgerStats.netProfit)}
                  </span>
                </div>
              </div>

              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-[12px] min-w-[720px]">
                  <thead>
                    <tr className="text-muted-foreground border-b border-[hsl(var(--border))] bg-[hsl(var(--secondary)/0.4)]">
                      {["#", "Tanggal", "Klien", "Keterangan", "Revenue", "Modal/Fee", "Profit", "Margin", "Saldo"].map((h) => (
                        <th key={h} className={cn("font-semibold py-2 px-2 text-[10.5px] uppercase tracking-wide", h === "#" || h === "Tanggal" || h === "Klien" || h === "Keterangan" ? "text-left" : "text-right")}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerEntries.map((e, i) => {
                      const isDebit = e.isCommission || e.isVoaOpex || e.isKurirOpex || e.isPelaksanaFee;
                      const rowBg   = e.isCommission ? "bg-orange-50/60" : e.isVoaOpex ? "bg-purple-50/60" : e.isKurirOpex ? "bg-amber-50/60" : e.isPelaksanaFee ? "bg-violet-50/60" : "";
                      const textColor = e.isCommission ? "text-orange-700" : e.isVoaOpex ? "text-purple-700" : e.isKurirOpex ? "text-amber-800" : e.isPelaksanaFee ? "text-violet-700" : "";
                      const balColor = e.runningBalance >= 0 ? "text-emerald-700 font-bold" : "text-red-600 font-bold";
                      const profitColor = e.profitIDR >= 0 ? "text-emerald-700" : "text-red-600";
                      const orderCount = !isDebit ? ledgerEntries.slice(i).filter((x) => !x.isCommission && !x.isVoaOpex && !x.isKurirOpex && !x.isPelaksanaFee).length : null;
                      return (
                        <tr key={e.orderId} className={cn("border-b border-[hsl(var(--border))] last:border-0 hover:brightness-95 cursor-pointer transition-colors", rowBg)}
                          onClick={() => navigate(`/orders/detail/${e.orderId.replace(/^(voa_opex_|kurir_opex_|commission_|pelaksana_fee_)/, "")}`)}
                        >
                          <td className="py-2 px-2 text-muted-foreground">{orderCount ?? "—"}</td>
                          <td className="py-2 px-2 whitespace-nowrap text-muted-foreground">{fmtDate(e.paidAt)}</td>
                          <td className={cn("py-2 px-2 max-w-[100px] truncate", isDebit ? `${textColor}/70` : "")} title={e.clientName}>{e.clientName}</td>
                          <td className={cn("py-2 px-2 max-w-[180px] truncate font-medium", textColor)} title={e.orderTitle}>{e.orderTitle}</td>
                          <td className="py-2 px-2 text-right tabular-nums">{isDebit ? "—" : fmtIDR(e.revenueIDR)}</td>
                          <td className={cn("py-2 px-2 text-right tabular-nums", isDebit ? `${textColor} font-semibold` : "text-rose-700")}>{isDebit ? `−${fmtIDR(e.costIDR)}` : fmtIDR(e.costIDR)}</td>
                          <td className={cn("py-2 px-2 text-right tabular-nums font-semibold", isDebit ? textColor : profitColor)}>
                            {isDebit ? `−${fmtIDR(Math.abs(e.profitIDR))}` : `${e.profitIDR >= 0 ? "+" : ""}${fmtIDR(e.profitIDR)}`}
                          </td>
                          <td className={cn("py-2 px-2 text-right", isDebit ? "text-muted-foreground" : (e.marginPct >= 20 ? "text-emerald-700" : e.marginPct >= 10 ? "text-sky-700" : "text-amber-700"))}>
                            {isDebit ? "—" : `${e.marginPct.toFixed(1)}%`}
                          </td>
                          <td className={cn("py-2 px-2 text-right tabular-nums", balColor)}>{fmtIDR(e.runningBalance)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-emerald-200 bg-emerald-50/50 font-bold text-[12px]">
                      <td colSpan={4} className="py-2.5 px-2 text-emerald-800">Total ({ledgerStats.count} order)</td>
                      <td className="py-2.5 px-2 text-right tabular-nums text-sky-700">{fmtIDR(ledgerStats.totalRevenue)}</td>
                      <td className="py-2.5 px-2 text-right tabular-nums text-rose-700">{fmtIDR(ledgerStats.totalCost)}</td>
                      <td className={cn("py-2.5 px-2 text-right tabular-nums", ledgerStats.totalProfit >= 0 ? "text-emerald-700" : "text-red-600")}>
                        {ledgerStats.totalProfit >= 0 ? "+" : ""}{fmtIDR(ledgerStats.totalProfit)}
                      </td>
                      <td className="py-2.5 px-2 text-right text-emerald-700">{ledgerStats.avgMargin.toFixed(1)}%</td>
                      <td className={cn("py-2.5 px-2 text-right tabular-nums", ledgerStats.netProfit >= 0 ? "text-emerald-700" : "text-red-600")}>
                        {fmtIDR(ledgerStats.netProfit)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════ PIUTANG TAB ════════════════════ */}
      {activeTab === "piutang" && (
        <div className="px-4 md:px-6 space-y-4 pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { label: "Total Tagihan",   value: fmtIDR(piutang.totalTagihan), tone: "sky",     sub: "Semua order aktif" },
              { label: "Kas Masuk",       value: fmtIDR(piutang.totalCair),    tone: "emerald", sub: piutang.totalTagihan > 0 ? `${Math.round((piutang.totalCair / piutang.totalTagihan) * 100)}% dari tagihan` : "—" },
              { label: "Piutang Aktif",   value: fmtIDR(piutang.totalPiutang), tone: "red",     sub: `${piutang.piutangCount} order belum lunas` },
            ].map((r) => (
              <div key={r.label} className={cn("rounded-2xl border bg-gradient-to-br p-4",
                r.tone === "sky"     ? "from-sky-50 to-white border-sky-100 text-sky-700"         :
                r.tone === "emerald" ? "from-emerald-50 to-white border-emerald-100 text-emerald-700" :
                "from-red-50 to-white border-red-100 text-red-600"
              )}>
                <p className="text-[10.5px] uppercase tracking-wide font-semibold text-muted-foreground">{r.label}</p>
                <p className="text-xl font-extrabold tabular-nums mt-1">{r.value}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{r.sub}</p>
              </div>
            ))}
          </div>
          {piutang.totalTagihan > 0 && (
            <div className="rounded-2xl border border-[hsl(var(--border))] bg-white p-4 space-y-2">
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>Progres Koleksi Pembayaran</span>
                <span className="tabular-nums font-bold">{fmtIDRShort(piutang.totalCair)} / {fmtIDRShort(piutang.totalTagihan)}</span>
              </div>
              <div className="h-3 rounded-full bg-gray-100 overflow-hidden flex">
                <div className="h-full bg-emerald-500 rounded-l-full transition-all" style={{ width: `${Math.min(100, (piutang.totalCair / piutang.totalTagihan) * 100)}%` }} />
                <div className="h-full bg-red-300 transition-all" style={{ width: `${Math.min(100, (piutang.totalPiutang / piutang.totalTagihan) * 100)}%` }} />
              </div>
            </div>
          )}
          {piutang.piutangOrders.length === 0 ? (
            <div className="rounded-2xl border border-[hsl(var(--border))] bg-white p-10 text-center">
              <span className="text-4xl">🟢</span>
              <p className="font-semibold mt-3">Semua order sudah lunas!</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-[hsl(var(--border))] bg-white overflow-hidden">
              <div className="px-4 py-3 border-b border-[hsl(var(--border))] flex items-center justify-between">
                <h3 className="text-[13px] font-bold">Order Belum Lunas</h3>
                <span className="text-[10.5px] text-muted-foreground">{piutang.piutangCount} order</span>
              </div>

              {/* Mobile card list */}
              <div className="md:hidden divide-y divide-[hsl(var(--border))]">
                {piutang.piutangOrders.map(({ order: o, remaining, clientName }) => {
                  const ps = derivePaymentStatus(Number(o.paidAmount ?? 0), Number(o.totalPrice ?? 0), o.paymentStatus);
                  const paid = paidAmountIDR(o, egpRate);
                  const total = revenueIDR(o, egpRate);
                  const pctPaid = total > 0 ? Math.round((paid / total) * 100) : 0;
                  return (
                    <div
                      key={o.id}
                      className="px-4 py-3 cursor-pointer active:bg-muted/30"
                      onClick={() => navigate(`/orders/detail/${o.id}`)}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold text-foreground truncate">{clientName}</p>
                          <p className="text-[10.5px] text-muted-foreground truncate">{o.title || o.type}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className={cn("inline-block text-[10px] font-bold px-2 py-0.5 rounded-full border", PAYMENT_STATUS_STYLE[ps])}>
                            {PAYMENT_STATUS_EMOJI[ps]} {PAYMENT_STATUS_LABEL[ps]}
                          </span>
                          <span className="text-[12px] font-black font-mono tabular-nums text-red-600">{fmtIDRShort(remaining)}</span>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10.5px] text-muted-foreground">
                          <span>Dibayar <span className="tabular-nums text-emerald-700 font-medium">{fmtIDRShort(paid)}</span></span>
                          <span>Total <span className="tabular-nums text-foreground font-medium">{fmtIDRShort(total)}</span></span>
                        </div>
                        <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pctPaid}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-[hsl(var(--border))] bg-[hsl(var(--secondary)/0.4)] text-muted-foreground">
                      {["Klien / Order", "Status", "Total", "Dibayar", "Sisa Tagihan"].map((h) => (
                        <th key={h} className={cn("py-2 px-3 text-[10.5px] font-semibold uppercase tracking-wide", h === "Klien / Order" ? "text-left" : "text-right")}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {piutang.piutangOrders.map(({ order: o, remaining, clientName }) => (
                      <tr key={o.id} className="border-b border-[hsl(var(--border))] last:border-0 hover:bg-muted/40 cursor-pointer"
                        onClick={() => navigate(`/orders/detail/${o.id}`)}>
                        <td className="py-2.5 px-3">
                          <div className="font-medium truncate max-w-[200px]">{clientName}</div>
                          <div className="text-[10.5px] text-muted-foreground truncate max-w-[200px]">{o.title || o.type}</div>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <span className={cn("inline-block text-[10px] font-bold px-2 py-0.5 rounded-full border", PAYMENT_STATUS_STYLE[derivePaymentStatus(Number(o.paidAmount ?? 0), Number(o.totalPrice ?? 0), o.paymentStatus)])}>
                            {PAYMENT_STATUS_LABEL[derivePaymentStatus(Number(o.paidAmount ?? 0), Number(o.totalPrice ?? 0), o.paymentStatus)]}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums">{fmtIDR(revenueIDR(o, egpRate))}</td>
                        <td className="py-2.5 px-3 text-right tabular-nums text-emerald-700">{fmtIDR(paidAmountIDR(o, egpRate))}</td>
                        <td className="py-2.5 px-3 text-right tabular-nums font-bold text-red-600">{fmtIDR(remaining)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════ AGEN & KOMISI TAB ════════════════════ */}
      {activeTab === "agen_komisi" && (
        <div className="px-4 md:px-6 space-y-4 pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { label: "Total Mitra Aktif", value: String(agentMembers.length), tone: "sky", sub: "terdaftar" },
              { label: "Total Komisi Dibayar", value: fmtIDR(split.totalCommission), tone: "orange", sub: `${split.agentCount} order via mitra` },
              { label: "Net Profit via Mitra", value: fmtIDR(split.agentNetForAgency), tone: "emerald", sub: "setelah semua fee" },
            ].map((r) => (
              <div key={r.label} className={cn("rounded-2xl border bg-gradient-to-br p-4",
                r.tone === "sky"     ? "from-sky-50 to-white border-sky-100 text-sky-700"         :
                r.tone === "orange"  ? "from-orange-50 to-white border-orange-100 text-orange-700" :
                "from-emerald-50 to-white border-emerald-100 text-emerald-700"
              )}>
                <p className="text-[10.5px] uppercase tracking-wide font-semibold text-muted-foreground">{r.label}</p>
                <p className="text-xl font-extrabold tabular-nums mt-1">{r.value}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{r.sub}</p>
              </div>
            ))}
          </div>
          <div className="rounded-2xl border border-[hsl(var(--border))] bg-white overflow-hidden">
            <div className="px-4 py-3 border-b border-[hsl(var(--border))] flex items-center justify-between">
              <h2 className="text-[13px] font-bold flex items-center gap-1.5">
                <Trophy className="h-3.5 w-3.5 text-amber-500" />
                Leaderboard Mitra · {RANGE_LABEL[range]}
              </h2>
              <span className="text-[10.5px] text-muted-foreground">{agentMembers.length} mitra</span>
            </div>

            {/* Mobile card list */}
            <div className="md:hidden divide-y divide-[hsl(var(--border))]">
              {leaderboard.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground text-[11.5px]">Belum ada mitra terdaftar.</div>
              ) : (
                leaderboard.map((row, i) => {
                  const medals = ["🥇", "🥈", "🥉"];
                  const badge = i < 3 ? medals[i] : `#${i + 1}`;
                  return (
                    <div
                      key={row.agentId}
                      className="px-4 py-3 cursor-pointer active:bg-sky-50/50"
                      onClick={() => navigate(`/agents/${row.agentId}`)}
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-xl w-8 text-center shrink-0">{badge}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold text-sky-700 truncate">{row.name}</p>
                          <p className="text-[10.5px] text-muted-foreground">{row.orders} order · ⭐ {row.lifetimePoints} poin</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={cn("text-[13px] font-bold tabular-nums", row.profit >= 0 ? "text-emerald-700" : "text-red-600")}>
                            {fmtIDRShort(row.profit)}
                          </p>
                          <p className="text-[10px] text-muted-foreground">net profit</p>
                        </div>
                      </div>
                      <div className="flex gap-4 pl-11 text-[10.5px] text-muted-foreground">
                        <span>Revenue <span className="tabular-nums text-foreground font-medium">{fmtIDRShort(row.revenue)}</span></span>
                        <span>Komisi <span className="tabular-nums text-orange-700 font-medium">{fmtIDRShort(row.commission)}</span></span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-[12px] min-w-[640px]">
                <thead>
                  <tr className="text-muted-foreground border-b border-[hsl(var(--border))] bg-[hsl(var(--secondary)/0.4)]">
                    {["#", "Mitra", "Order", "Revenue", "Profit Bersih", "Komisi", "⭐ Poin"].map((h) => (
                      <th key={h} className={cn("font-semibold py-2 px-2 text-[10.5px] uppercase tracking-wide", h === "#" || h === "Mitra" ? "text-left" : "text-right")}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((row, i) => {
                    const medals = ["🥇", "🥈", "🥉"];
                    return (
                      <tr key={row.agentId} className="border-b border-[hsl(var(--border))] last:border-0 hover:bg-sky-50/60 cursor-pointer transition-colors"
                        onClick={() => navigate(`/agents/${row.agentId}`)}>
                        <td className="py-2 px-2 text-muted-foreground">{i < 3 ? medals[i] : i + 1}</td>
                        <td className="py-2 px-2 font-medium text-sky-700 hover:underline truncate max-w-[180px]">{row.name}</td>
                        <td className="py-2 px-2 text-right">{row.orders}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{fmtIDR(row.revenue)}</td>
                        <td className={cn("py-2 px-2 text-right tabular-nums font-semibold", row.profit >= 0 ? "text-emerald-700" : "text-red-600")}>{fmtIDR(row.profit)}</td>
                        <td className="py-2 px-2 text-right tabular-nums font-bold text-orange-700">{fmtIDR(row.commission)}</td>
                        <td className="py-2 px-2 text-right tabular-nums font-bold text-amber-700">{row.lifetimePoints}</td>
                      </tr>
                    );
                  })}
                  {leaderboard.length === 0 && (
                    <tr><td colSpan={7} className="py-8 text-center text-muted-foreground text-[11.5px]">Belum ada mitra terdaftar.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
