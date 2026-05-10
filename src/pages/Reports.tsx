import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  TrendingUp, TrendingDown, Wallet, Receipt, ShieldCheck, Filter,
  Crown, ArrowDown, Users, Trophy, Handshake, Building2,
  BarChart3, ArrowUpDown, ChevronUp, ChevronDown, Search, FileDown,
} from "lucide-react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip as ReTooltip, Legend,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
} from "@/lib/profit";
import { useRatesStore } from "@/store/ratesStore";
import { listAgentPoints, sumPointsByAgent, type AgentPoint } from "@/features/agentPoints/agentPointsRepo";
import { buildLedgerEntries, ledgerSummary } from "@/lib/ledgerSync";
import { loadProductCommissions, pullProductCommissions, getCommissionForOrderType, type ProductCommissions } from "@/lib/productCommissions";

type RangeKey = "this_month" | "last_month" | "this_year" | "all";
type AgentFilter = "all" | "direct" | string; // string = agent userId

const RANGE_LABEL: Record<RangeKey, string> = {
  this_month: "Bulan ini",
  last_month: "Bulan lalu",
  this_year: "Tahun ini",
  all: "Semua waktu",
};

function rangeBounds(key: RangeKey): { from: Date | null; to: Date | null } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (key) {
    case "this_month":
      return { from: new Date(y, m, 1), to: new Date(y, m + 1, 1) };
    case "last_month":
      return { from: new Date(y, m - 1, 1), to: new Date(y, m, 1) };
    case "this_year":
      return { from: new Date(y, 0, 1), to: new Date(y + 1, 0, 1) };
    case "all":
    default:
      return { from: null, to: null };
  }
}

const TYPE_COLOR: Record<OrderType, string> = {
  umrah: "#1a44d4",
  flight: "#f97316",
  visa_voa: "#a855f7",
  visa_student: "#10b981",
};

export default function Reports() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const listMembers = useAuthStore((s) => s.listMembers);
  const { orders, fetchOrders } = useOrdersStore();
  const { clients, fetchClients } = useClientsStore();
  const egpRate = useRatesStore((s) => s.rates.EGP);

  const [range, setRange] = useState<RangeKey>("this_month");
  const [agentFilter, setAgentFilter] = useState<AgentFilter>("all");
  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [points, setPoints] = useState<AgentPoint[]>([]);
  const [activeTab, setActiveTab] = useState<"summary" | "ledger">("summary");
  const [productCommissions, setProductCommissions] = useState<ProductCommissions>(() => loadProductCommissions());

  useEffect(() => {
    void fetchOrders();
    if (clients.length === 0) void fetchClients();
    void (async () => {
      try {
        const [m, p] = await Promise.all([listMembers(), listAgentPoints()]);
        setMembers(m);
        setPoints(p);
      } catch (err) {
        console.warn("[reports] fetch members/points gagal:", err);
      }
    })();
    void pullProductCommissions().then((v) => { if (v) setProductCommissions(v); });
  }, [fetchOrders, fetchClients, clients.length, listMembers]);

  const { from, to } = rangeBounds(range);

  // Map agentId → MemberInfo (utk nama + commission_pct)
  const memberById = useMemo(() => {
    const m = new Map<string, MemberInfo>();
    for (const x of members) m.set(x.userId, x);
    return m;
  }, [members]);

  const agentMembers = useMemo(
    () => members.filter((m) => m.role === "agent"),
    [members],
  );

  // ── Ledger: client name lookup ──────────────────────────────────────────────
  const ledgerClientNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of clients) m.set(c.id, c.name);
    return m;
  }, [clients]);

  // Ledger: build from ALL orders (not date-filtered — ledger is full history).
  // Sertakan memberById agar entri komisi agen otomatis ditambahkan.
  const ledgerEntries = useMemo(
    () => buildLedgerEntries(orders, ledgerClientNameById, egpRate, undefined, memberById, productCommissions),
    [orders, ledgerClientNameById, egpRate, memberById, productCommissions],
  );
  const ledgerStats = useMemo(() => ledgerSummary(ledgerEntries), [ledgerEntries]);

  // Filter orders by date range + agent attribution.
  // Order Cancelled selalu dikeluarkan dari kalkulasi finansial.
  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (o.status === "Cancelled") return false;
      const t = new Date(o.createdAt).getTime();
      if (from && t < from.getTime()) return false;
      if (to && t >= to.getTime()) return false;
      // Agent filter
      if (agentFilter === "direct") {
        if (o.createdByAgent != null) return false;
      } else if (agentFilter !== "all") {
        if (o.createdByAgent !== agentFilter) return false;
      }
      return true;
    });
  }, [orders, from, to, agentFilter]);

  // Helper: gross profit dikurangi komisi agen + biaya VOA + biaya kurir → profit bersih agency.
  const agencyProfit = useCallback(
    (o: Order): number => {
      const gross = profitIDR(o, egpRate);
      const member = o.createdByAgent ? memberById.get(o.createdByAgent) : undefined;
      const salesComm = (member && member.role === "agent")
        ? getCommissionForOrderType(o.type as "umrah" | "flight" | "visa_voa" | "visa_student", productCommissions)
        : 0;
      const opex = voaOpCost(o) + kurirOpCost(o);
      return gross - salesComm - opex;
    },
    [egpRate, memberById, productCommissions],
  );

  // Total aggregations
  const totals = useMemo(() => {
    let revenue = 0;
    let cost = 0;
    let profit = 0;
    for (const o of filtered) {
      revenue += revenueIDR(o, egpRate);
      cost += costIDR(o, egpRate);
      profit += agencyProfit(o);
    }
    return { revenue, cost, profit, count: filtered.length };
  }, [filtered, egpRate, agencyProfit]);

  // Direct vs Agent split (always computed from filtered set,
  // even when agentFilter aktif — supaya angka konsisten dgn yg dilihat).
  // Penting: createdByAgent bisa berisi userId owner/staff (dari field
  // "Closing/Referensi Dari" di form klien) — hanya hitung sebagai "Via Agent"
  // jika member tersebut benar-benar berperan agent (role === "agent").
  const split = useMemo(() => {
    let directProfit = 0;
    let directRevenue = 0;
    let directCount = 0;
    let agentProfit = 0;     // gross profit dari order via agent
    let agentRevenue = 0;
    let agentCount = 0;
    let totalCommission = 0; // total komisi yg dikeluarin agency

    for (const o of filtered) {
      const p = profitIDR(o, egpRate);
      const r = revenueIDR(o, egpRate);
      const opex = voaOpCost(o as Parameters<typeof voaOpCost>[0]) + kurirOpCost(o);
      // Cek apakah createdByAgent mengarah ke member berole "agent".
      // Owner/staff yang di-set sebagai "Closing Ref" TIDAK dihitung Via Agent.
      const member = o.createdByAgent ? memberById.get(o.createdByAgent) : undefined;
      const isAgentOrder = o.createdByAgent != null && member?.role === "agent";
      if (isAgentOrder) {
        agentProfit += p - opex;
        agentRevenue += r;
        agentCount += 1;
        // Komisi = nominal flat per jenis produk (bukan % dari profit).
        totalCommission += getCommissionForOrderType(
          o.type as "umrah" | "flight" | "visa_voa" | "visa_student",
          productCommissions,
        );
      } else {
        directProfit += p - opex;
        directRevenue += r;
        directCount += 1;
      }
    }
    const agentNetForAgency = agentProfit - totalCommission;
    const netAgencyProfit = directProfit + agentNetForAgency;
    return {
      directProfit, directRevenue, directCount,
      agentProfit, agentRevenue, agentCount,
      totalCommission, agentNetForAgency, netAgencyProfit,
    };
  }, [filtered, memberById, egpRate, productCommissions]);

  // Profit per type (utk pie chart) — pakai agency profit (sudah dikurangi komisi agen).
  const byType = useMemo(() => {
    const m = new Map<OrderType, { profit: number; revenue: number; count: number }>();
    for (const o of filtered) {
      const cur = m.get(o.type) ?? { profit: 0, revenue: 0, count: 0 };
      cur.profit += agencyProfit(o);
      cur.revenue += revenueIDR(o, egpRate);
      cur.count += 1;
      m.set(o.type, cur);
    }
    return Array.from(m.entries()).map(([type, v]) => ({
      type,
      label: ORDER_TYPE_LABEL[type],
      emoji: ORDER_TYPE_EMOJI[type],
      ...v,
    }));
  }, [filtered, egpRate, agencyProfit]);

  // Profit per client.
  const clientNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of clients) m.set(c.id, c.name);
    return m;
  }, [clients]);

  const byClient = useMemo(() => {
    const m = new Map<string, { profit: number; revenue: number; count: number; orders: Order[] }>();
    for (const o of filtered) {
      const key = o.clientId ?? "__none";
      const cur = m.get(key) ?? { profit: 0, revenue: 0, count: 0, orders: [] };
      cur.profit += agencyProfit(o);
      cur.revenue += revenueIDR(o, egpRate);
      cur.count += 1;
      cur.orders.push(o);
      m.set(key, cur);
    }
    return Array.from(m.entries())
      .map(([clientId, v]) => ({
        clientId,
        name: clientId === "__none" ? "— Tanpa klien —" : (clientNameById.get(clientId) ?? `Klien ${clientId.slice(0, 6)}…`),
        ...v,
      }))
      .sort((a, b) => b.profit - a.profit);
  }, [filtered, clientNameById, egpRate, agencyProfit]);

  // ── Agent Leaderboard ──
  // Built from `filtered` (so date-range applies). Ranked by total profit
  // generated dlm periode + jumlah order. Points pakai dari agent_points
  // (tabel terpisah, lifetime).
  const leaderboard = useMemo(() => {
    const lifetimePoints = sumPointsByAgent(points);
    const m = new Map<string, { profit: number; orders: number; revenue: number; commission: number }>();
    for (const o of filtered) {
      if (!o.createdByAgent) continue;
      const member = memberById.get(o.createdByAgent);
      if (!member || member.role !== "agent") continue;
      const cur = m.get(o.createdByAgent) ?? { profit: 0, orders: 0, revenue: 0, commission: 0 };
      cur.profit += profitIDR(o, egpRate);
      cur.revenue += revenueIDR(o, egpRate);
      cur.orders += 1;
      // Komisi = nominal flat per jenis produk (bukan % dari profit).
      cur.commission += getCommissionForOrderType(
        o.type as "umrah" | "flight" | "visa_voa" | "visa_student",
        productCommissions,
      );
      m.set(o.createdByAgent, cur);
    }
    // Pastikan semua agent muncul (walau gak ada order di periode).
    for (const a of agentMembers) {
      if (!m.has(a.userId)) m.set(a.userId, { profit: 0, orders: 0, revenue: 0, commission: 0 });
    }
    return Array.from(m.entries()).map(([agentId, v]) => {
      const member = memberById.get(agentId);
      const commission = v.commission;
      return {
        agentId,
        name: member?.displayName ?? `Agent ${agentId.slice(0, 6)}…`,
        commissionPct: 0,
        revenue: v.revenue,
        profit: v.profit,
        orders: v.orders,
        commission,
        lifetimePoints: lifetimePoints.get(agentId) ?? 0,
      };
    }).sort((a, b) => {
      // Sort: profit desc, lalu lifetime points desc.
      if (b.profit !== a.profit) return b.profit - a.profit;
      return b.lifetimePoints - a.lifetimePoints;
    });
  }, [filtered, agentMembers, memberById, points, egpRate, productCommissions]);

  const pieData = byType
    .filter((x) => x.profit > 0)
    .map((x) => ({ name: x.label, value: x.profit, type: x.type }));

  const top3 = byClient.slice(0, 3);

  // ── Profit Breakdown per Paket ─────────────────────────────────────────────
  type SortCol = "date" | "revenue" | "modal" | "opex" | "profit" | "margin";
  type SortDir = "asc" | "desc";
  const [sortCol, setSortCol] = useState<SortCol>("profit");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [pkgSearch, setPkgSearch] = useState("");

  const byOrder = useMemo(() => {
    return filtered.map((o) => {
      const revenue = revenueIDR(o, egpRate);
      const cost = costIDR(o, egpRate);
      // Coba ambil opex dari metadata.internalProfit (order baru via "Jadikan Order")
      const meta = o.metadata as Record<string, unknown> | null;
      const ip = (meta?.internalProfit ?? null) as { opexIDR?: number } | null;
      const internalOpex = ip?.opexIDR ? Number(ip.opexIDR) : 0;
      // Untuk VOA: tambahkan biaya operasional lapangan ke opex
      // Untuk semua order: tambahkan biaya kurir setoran ke opex
      const voaOpexIDR = voaOpCost(o);
      const kurirIDR   = kurirOpCost(o);
      const opex = internalOpex + voaOpexIDR + kurirIDR;
      const modal = Math.max(0, cost - internalOpex);
      const profit = agencyProfit(o);
      const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
      return {
        id: o.id,
        title: o.title || "—",
        date: o.createdAt,
        type: o.type,
        revenue,
        modal,
        opex,
        profit,
        margin,
      };
    });
  }, [filtered, egpRate, agencyProfit]);

  const byOrderFiltered = useMemo(() => {
    const q = pkgSearch.trim().toLowerCase();
    const rows = q ? byOrder.filter((r) => r.title.toLowerCase().includes(q)) : byOrder;
    return [...rows].sort((a, b) => {
      let diff = 0;
      if (sortCol === "date") diff = new Date(a.date).getTime() - new Date(b.date).getTime();
      else if (sortCol === "revenue") diff = a.revenue - b.revenue;
      else if (sortCol === "modal") diff = a.modal - b.modal;
      else if (sortCol === "opex") diff = a.opex - b.opex;
      else if (sortCol === "profit") diff = a.profit - b.profit;
      else if (sortCol === "margin") diff = a.margin - b.margin;
      return sortDir === "desc" ? -diff : diff;
    });
  }, [byOrder, pkgSearch, sortCol, sortDir]);

  function toggleSort(col: SortCol) {
    if (sortCol === col) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortCol(col); setSortDir("desc"); }
  }

  function SortIcon({ col }: { col: SortCol }) {
    if (sortCol !== col) return <ArrowUpDown className="h-3 w-3 opacity-40 ml-0.5 inline" />;
    return sortDir === "desc"
      ? <ChevronDown className="h-3 w-3 ml-0.5 inline text-blue-600" />
      : <ChevronUp className="h-3 w-3 ml-0.5 inline text-blue-600" />;
  }

  const fmtDate = (iso: string) => {
    try { return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(iso)); }
    catch { return iso; }
  };

  const agentFilterLabel = agentFilter === "all"
    ? "Semua sumber"
    : agentFilter === "direct"
    ? "Direct"
    : (members.find(m => m.userId === agentFilter)?.displayName ?? "Mitra");

  return (
    <div className="max-w-6xl mx-auto pb-8 md:py-6 md:px-6 md:space-y-5">

      {/* ══════════════════════════════════════════════════════
           MOBILE LAYOUT
      ══════════════════════════════════════════════════════ */}
      <div className="md:hidden px-3 space-y-4">

        {/* ── Header row ── */}
        <div className="flex items-center gap-2.5">
          <Wallet className="h-5 w-5 shrink-0 text-blue-600" />
          <div className="min-w-0 flex-1">
            <p className="text-[8px] font-semibold uppercase tracking-widest text-muted-foreground leading-none">Keuangan</p>
            <h1 className="text-[14px] font-extrabold text-foreground leading-tight mt-0.5">Laporan Keuangan</h1>
          </div>
          <button
            onClick={() => navigate("/exports")}
            className="h-9 px-3 rounded-xl text-[11px] font-bold border border-[hsl(var(--border))] bg-white flex items-center gap-1.5 active:scale-95 transition-transform shrink-0"
          >
            <FileDown className="h-3.5 w-3.5 text-blue-600" />
            Export
          </button>
        </div>

        {/* ── Hero banner ── */}
        <div
          className="rounded-2xl px-4 py-3.5 text-white relative overflow-hidden"
          style={{ background: "linear-gradient(135deg,#00072d 0%,#0a2472 55%,#1a44d4 100%)" }}
        >
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="absolute -top-10 -right-10 h-44 w-44 rounded-full" style={{ background: "radial-gradient(circle, rgba(255,255,255,0.07) 0%, transparent 65%)" }} />
            <div className="absolute -bottom-8 left-0 right-0 h-24" style={{ background: "radial-gradient(ellipse at 50% 100%, rgba(26,68,212,0.3) 0%, transparent 70%)" }} />
            <div className="absolute inset-0 opacity-[0.025]" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "20px 20px" }} />
          </div>
          <div className="relative flex items-start justify-between gap-3 mb-3">
            <div>
              <p className="text-[8px] font-semibold uppercase tracking-widest text-sky-400/70 mb-0.5">Net Profit</p>
              <p className={`text-[28px] font-black leading-none tabular-nums ${totals.profit < 0 ? "text-red-300" : "text-white"}`}>
                {fmtIDR(totals.profit)}
              </p>
            </div>
            <div className="h-9 w-9 rounded-xl bg-white/20 border border-white/30 flex items-center justify-center shrink-0 mt-0.5 backdrop-blur-sm">
              <TrendingUp className="h-5 w-5 text-white" />
            </div>
          </div>
          <div className="relative flex items-center pt-3 border-t border-white/10">
            {[
              { label: "Revenue",   value: fmtIDR(totals.revenue) },
              { label: "Modal",     value: fmtIDR(totals.cost)    },
              { label: "Orders",    value: String(totals.count)   },
            ].map((s, i) => (
              <div key={s.label} className={`flex-1 text-center ${i > 0 ? "border-l border-white/10" : ""}`}>
                <p className="text-[11px] font-black text-white tabular-nums leading-none truncate px-1">{s.value}</p>
                <p className="text-[7.5px] text-sky-300/60 uppercase tracking-wide mt-1 font-semibold">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Filter pills ── */}
        <div className="space-y-2">
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-none">
            {(Object.keys(RANGE_LABEL) as RangeKey[]).map((k) => (
              <button
                key={k}
                onClick={() => setRange(k)}
                className={`h-8 px-3.5 rounded-full text-[11.5px] font-bold whitespace-nowrap shrink-0 transition-all active:scale-95 ${
                  range === k
                    ? "text-white shadow-sm"
                    : "bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))] border border-[hsl(var(--border))]"
                }`}
                style={range === k ? { background: "linear-gradient(135deg,#1a44d4,#0a2472)" } : undefined}
              >
                {RANGE_LABEL[k]}
              </button>
            ))}
          </div>
          <Select value={agentFilter} onValueChange={(v) => setAgentFilter(v as AgentFilter)}>
            <SelectTrigger className="h-9 rounded-xl text-[12px] font-semibold border-[hsl(var(--border))]">
              <div className="flex items-center gap-1.5">
                <Filter className="h-3.5 w-3.5 text-[hsl(var(--muted-foreground))]" />
                <SelectValue placeholder="Semua sumber">{agentFilterLabel}</SelectValue>
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua sumber</SelectItem>
              <SelectItem value="direct">Direct (owner/staff)</SelectItem>
              {agentMembers.length > 0 && (
                <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">Per Mitra</div>
              )}
              {agentMembers.map((a) => (
                <SelectItem key={a.userId} value={a.userId}>{a.displayName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* ── Tab pills (mobile) ── */}
        <div className="flex gap-2 p-1 rounded-2xl bg-[hsl(var(--secondary))]">
          {(["summary", "ledger"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 h-9 rounded-xl text-[12px] font-bold transition-all ${
                activeTab === tab
                  ? "bg-white text-[hsl(var(--foreground))] shadow-sm"
                  : "text-[hsl(var(--muted-foreground))]"
              }`}
            >
              {tab === "summary" ? "📊 Ringkasan" : "📒 Buku Besar"}
            </button>
          ))}
        </div>

      </div>{/* end md:hidden */}

      {/* ══════════════════════════════════════════════════════
           DESKTOP LAYOUT
      ══════════════════════════════════════════════════════ */}
      <div className="hidden md:block space-y-5 px-0">

        {/* ── Desktop header ── */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2.5">
              <Wallet className="h-6 w-6 text-blue-600" />
              Laporan Keuangan
            </h1>
            <p className="text-[12px] text-muted-foreground mt-0.5 flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              Owner only · Periode: <span className="font-semibold">{RANGE_LABEL[range]}</span>
              {user?.agencyName && <> · {user.agencyName}</>}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline" size="sm"
              className="h-8 text-xs gap-1.5 border-blue-200 text-blue-700 hover:bg-blue-50"
              onClick={() => navigate("/exports")}
            >
              <FileDown className="h-3.5 w-3.5" /> Export Data
            </Button>
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={range} onValueChange={(v) => setRange(v as RangeKey)}>
              <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(RANGE_LABEL) as RangeKey[]).map((k) => (
                  <SelectItem key={k} value={k}>{RANGE_LABEL[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={agentFilter} onValueChange={(v) => setAgentFilter(v as AgentFilter)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Sumber order" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua sumber</SelectItem>
                <SelectItem value="direct">Direct (owner/staff)</SelectItem>
                {agentMembers.length > 0 && (
                  <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">Per Mitra</div>
                )}
                {agentMembers.map((a) => (
                  <SelectItem key={a.userId} value={a.userId}>{a.displayName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* ── Desktop tab bar ── */}
        <div className="flex gap-1 border-b border-border pb-0">
          {(["summary", "ledger"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-[12px] font-semibold rounded-t-xl border border-b-0 transition-colors -mb-px ${
                activeTab === tab
                  ? "bg-background border-border text-foreground"
                  : "bg-muted/30 border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab === "summary" ? "📊 Ringkasan" : "📒 Buku Besar"}
            </button>
          ))}
        </div>

      </div>{/* end hidden md:block */}

      {/* ══════════════════════════════════════════════════════
           SHARED CONTENT (both mobile + desktop)
      ══════════════════════════════════════════════════════ */}
      <div className="px-3 md:px-0 space-y-4 md:space-y-5">

      {/* ── Summary tab ──────────────────────────────────────────────────── */}
      {activeTab === "summary" && <>

      {/* Summary cards */}
      <motion.div
        className="grid grid-cols-2 md:grid-cols-4 gap-3"
        initial="hidden"
        animate="visible"
        variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } } }}
      >
        <SummaryCard
          label="Total Profit"
          value={fmtIDR(split.netAgencyProfit)}
          icon={split.netAgencyProfit >= 0 ? TrendingUp : TrendingDown}
          tone={split.netAgencyProfit >= 0 ? "emerald" : "red"}
          big
        />
        <SummaryCard
          label="Total Revenue"
          value={fmtIDR(totals.revenue)}
          icon={Receipt}
          tone="sky"
        />
        <SummaryCard
          label="Total Modal"
          value={fmtIDR(totals.cost)}
          icon={ArrowDown}
          tone="amber"
        />
        <SummaryCard
          label="Jumlah Order"
          value={String(totals.count)}
          icon={Users}
          tone="violet"
        />
      </motion.div>

      {/* Direct vs Agent split */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <SplitCard
          icon={Building2}
          label="Direct (owner/staff)"
          accent="from-sky-50 to-white border-sky-100"
          profit={split.directProfit}
          revenue={split.directRevenue}
          count={split.directCount}
          extra={null}
        />
        <SplitCard
          icon={Handshake}
          label="Via Mitra (agent)"
          accent="from-orange-50 to-white border-orange-100"
          profit={split.agentProfit}
          revenue={split.agentRevenue}
          count={split.agentCount}
          extra={
            <div className="text-[10.5px] text-muted-foreground mt-1">
              Komisi dibayar: <span className="font-mono font-semibold text-orange-700">−{fmtIDR(split.totalCommission)}</span>
              <br />
              Net buat agency: <span className="font-mono font-bold text-emerald-700">{fmtIDR(split.agentNetForAgency)}</span>
            </div>
          }
        />
        <SplitCard
          icon={Wallet}
          label="Net Profit Agency"
          accent="from-emerald-50 to-white border-emerald-100"
          profit={split.netAgencyProfit}
          revenue={totals.revenue}
          count={totals.count}
          extra={
            <div className="text-[10.5px] text-muted-foreground mt-1">
              = Direct + (Agent Profit − Komisi)
            </div>
          }
          highlight
        />
      </div>

      {totals.count === 0 ? (
        <Card className="p-10 text-center">
          <Wallet className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-semibold">Belum ada order di periode ini</p>
          <p className="text-[12px] text-muted-foreground mt-1">
            Coba ganti filter rentang tanggal atau buat order baru.
          </p>
          <Button variant="outline" className="mt-4" onClick={() => navigate("/orders")}>
            Buka halaman Orders
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Pie chart: profit by type */}
          <Card className="p-4 lg:col-span-1">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-[13px] font-semibold">Profit per Kategori</h2>
              <span className="text-[10.5px] text-muted-foreground">IDR</span>
            </div>
            {pieData.length === 0 ? (
              <div className="h-[240px] flex items-center justify-center text-[12px] text-muted-foreground">
                Belum ada profit positif di periode ini.
              </div>
            ) : (
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={75}
                      innerRadius={40}
                      paddingAngle={2}
                    >
                      {pieData.map((entry) => (
                        <Cell key={entry.type} fill={TYPE_COLOR[entry.type as OrderType]} />
                      ))}
                    </Pie>
                    <ReTooltip
                      formatter={(value: number) => fmtIDR(value)}
                      contentStyle={{ fontSize: 11, borderRadius: 8 }}
                    />
                    <Legend
                      verticalAlign="bottom"
                      iconSize={10}
                      wrapperStyle={{ fontSize: 11 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="mt-3 space-y-1.5">
              {byType.map((t) => (
                <div key={t.type} className="flex items-center justify-between text-[12px]">
                  <span className="flex items-center gap-1.5">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ background: TYPE_COLOR[t.type] }}
                    />
                    <span>{t.emoji} {t.label}</span>
                    <span className="text-muted-foreground">· {t.count}</span>
                  </span>
                  <span className={`font-mono font-semibold ${t.profit >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                    {fmtIDR(t.profit)}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          {/* Client profit table */}
          <Card className="p-4 lg:col-span-2">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[13px] font-semibold flex items-center gap-1.5">
                <Crown className="h-3.5 w-3.5 text-amber-500" />
                Klien Paling Menguntungkan
              </h2>
              <span className="text-[10.5px] text-muted-foreground">{byClient.length} klien</span>
            </div>

            {top3.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mb-4">
                {top3.map((c, i) => {
                  const medals = ["🥇", "🥈", "🥉"];
                  return (
                    <div
                      key={c.clientId}
                      className="rounded-xl border bg-gradient-to-br from-amber-50 to-white p-2.5"
                    >
                      <div className="text-[14px]">{medals[i]}</div>
                      <div className="text-[11.5px] font-semibold truncate">{c.name}</div>
                      <div className="text-[12.5px] font-mono font-extrabold text-emerald-700 mt-0.5">
                        {fmtIDR(c.profit)}
                      </div>
                      <div className="text-[10px] text-muted-foreground">{c.count} order</div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-muted-foreground border-b">
                    <th className="text-left font-semibold py-2 px-1">#</th>
                    <th className="text-left font-semibold py-2 px-1">Klien</th>
                    <th className="text-right font-semibold py-2 px-1">Order</th>
                    <th className="text-right font-semibold py-2 px-1">Revenue</th>
                    <th className="text-right font-semibold py-2 px-1">Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {byClient.map((c, i) => (
                    <tr
                      key={c.clientId}
                      className="border-b last:border-b-0 hover:bg-muted/40 cursor-pointer"
                      onClick={() => c.clientId !== "__none" && navigate(`/clients/${c.clientId}`)}
                    >
                      <td className="py-2 px-1 text-muted-foreground">{i + 1}</td>
                      <td className="py-2 px-1 font-medium truncate max-w-[200px]">{c.name}</td>
                      <td className="py-2 px-1 text-right">{c.count}</td>
                      <td className="py-2 px-1 text-right font-mono">{fmtIDR(c.revenue)}</td>
                      <td className={`py-2 px-1 text-right font-mono font-bold ${c.profit >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                        {fmtIDR(c.profit)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* Agent Leaderboard */}
      {agentMembers.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[13px] font-semibold flex items-center gap-1.5">
              <Trophy className="h-3.5 w-3.5 text-amber-500" />
              Leaderboard Mitra (Agent)
            </h2>
            <span className="text-[10.5px] text-muted-foreground">
              {agentMembers.length} mitra · poin lifetime
            </span>
          </div>
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-muted-foreground border-b">
                  <th className="text-left font-semibold py-2 px-1">#</th>
                  <th className="text-left font-semibold py-2 px-1">Mitra</th>
                  <th className="text-right font-semibold py-2 px-1">Order</th>
                  <th className="text-right font-semibold py-2 px-1">Revenue</th>
                  <th className="text-right font-semibold py-2 px-1">Gross Profit</th>
                  <th className="text-right font-semibold py-2 px-1">Komisi</th>
                  <th className="text-right font-semibold py-2 px-1">⭐ Poin</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((row, i) => {
                  const medals = ["🥇", "🥈", "🥉"];
                  return (
                    <tr key={row.agentId} className="border-b last:border-b-0 hover:bg-sky-50/60 cursor-pointer transition-colors" onClick={() => navigate(`/agents/${row.agentId}`)} title="Buka profil mitra">
                      <td className="py-2 px-1 text-muted-foreground">
                        {i < 3 ? medals[i] : i + 1}
                      </td>
                      <td className="py-2 px-1 font-medium truncate max-w-[180px] text-sky-700 hover:underline">
                        {row.name}
                      </td>
                      <td className="py-2 px-1 text-right">{row.orders}</td>
                      <td className="py-2 px-1 text-right font-mono">{fmtIDR(row.revenue)}</td>
                      <td className={`py-2 px-1 text-right font-mono font-semibold ${row.profit >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                        {fmtIDR(row.profit)}
                      </td>
                      <td className="py-2 px-1 text-right font-mono font-bold text-orange-700">
                        {fmtIDR(row.commission)}
                      </td>
                      <td className="py-2 px-1 text-right font-mono font-bold text-amber-700">
                        {row.lifetimePoints}
                      </td>
                    </tr>
                  );
                })}
                {leaderboard.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-muted-foreground text-[11.5px]">
                      Belum ada mitra terdaftar.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── Profit Breakdown per Paket ──────────────────────────────────────── */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-[13px] font-semibold flex items-center gap-1.5">
              <BarChart3 className="h-3.5 w-3.5 text-blue-600" />
              Breakdown Profit per Paket
            </h2>
            <p className="text-[10.5px] text-muted-foreground mt-0.5">
              {byOrderFiltered.length} order · Klik header kolom untuk sort
            </p>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={pkgSearch}
              onChange={(e) => setPkgSearch(e.target.value)}
              placeholder="Cari nama paket…"
              className="pl-8 pr-3 h-8 w-[200px] rounded-lg border text-[12px] focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
        </div>

        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-[12px] min-w-[680px]">
            <thead>
              <tr className="text-muted-foreground border-b">
                <th className="text-left font-semibold py-2 px-2">#</th>
                <th className="text-left font-semibold py-2 px-2">Paket / Order</th>
                <th
                  className="text-right font-semibold py-2 px-2 cursor-pointer select-none hover:text-foreground transition-colors"
                  onClick={() => toggleSort("date")}
                >
                  Tanggal <SortIcon col="date" />
                </th>
                <th className="text-center font-semibold py-2 px-2">Tipe</th>
                <th
                  className="text-right font-semibold py-2 px-2 cursor-pointer select-none hover:text-foreground transition-colors"
                  onClick={() => toggleSort("revenue")}
                >
                  Revenue <SortIcon col="revenue" />
                </th>
                <th
                  className="text-right font-semibold py-2 px-2 cursor-pointer select-none hover:text-foreground transition-colors"
                  onClick={() => toggleSort("modal")}
                >
                  Modal <SortIcon col="modal" />
                </th>
                <th
                  className="text-right font-semibold py-2 px-2 cursor-pointer select-none hover:text-foreground transition-colors"
                  onClick={() => toggleSort("opex")}
                >
                  Opex <SortIcon col="opex" />
                </th>
                <th
                  className="text-right font-semibold py-2 px-2 cursor-pointer select-none hover:text-foreground transition-colors"
                  onClick={() => toggleSort("profit")}
                >
                  Profit <SortIcon col="profit" />
                </th>
                <th
                  className="text-right font-semibold py-2 px-2 cursor-pointer select-none hover:text-foreground transition-colors"
                  onClick={() => toggleSort("margin")}
                >
                  Margin % <SortIcon col="margin" />
                </th>
              </tr>
            </thead>
            <tbody>
              {byOrderFiltered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-muted-foreground text-[11.5px]">
                    {pkgSearch ? "Tidak ada paket yang cocok." : "Belum ada order di periode ini."}
                  </td>
                </tr>
              ) : (
                byOrderFiltered.map((row, i) => {
                  const marginColor =
                    row.margin >= 20 ? "text-emerald-700"
                    : row.margin >= 10 ? "text-sky-700"
                    : row.margin >= 0 ? "text-amber-700"
                    : "text-red-600";
                  const profitColor = row.profit >= 0 ? "text-emerald-700" : "text-red-600";
                  return (
                    <tr key={row.id} className="border-b last:border-b-0 hover:bg-blue-50/60 cursor-pointer transition-colors" onClick={() => navigate(`/orders/detail/${row.id}`)} title="Buka detail order">
                      <td className="py-2 px-2 text-muted-foreground font-mono">{i + 1}</td>
                      <td className="py-2 px-2 font-semibold max-w-[180px] truncate text-sky-700" title={row.title}>
                        {row.title}
                      </td>
                      <td className="py-2 px-2 text-right text-muted-foreground whitespace-nowrap">
                        {new Date(row.date).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}
                      </td>
                      <td className="py-2 px-2 text-center">
                        <span
                          className="inline-block px-1.5 py-0.5 rounded-md text-[10px] font-semibold"
                          style={{
                            background: `${TYPE_COLOR[row.type]}22`,
                            color: TYPE_COLOR[row.type],
                          }}
                        >
                          {ORDER_TYPE_EMOJI[row.type]} {ORDER_TYPE_LABEL[row.type]}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-right font-mono">{fmtIDR(row.revenue)}</td>
                      <td className="py-2 px-2 text-right font-mono text-rose-700">{row.modal > 0 ? fmtIDR(row.modal) : <span className="text-muted-foreground">—</span>}</td>
                      <td className="py-2 px-2 text-right font-mono text-amber-700">{row.opex > 0 ? fmtIDR(row.opex) : <span className="text-muted-foreground">—</span>}</td>
                      <td className={`py-2 px-2 text-right font-mono font-bold ${profitColor}`}>
                        {row.profit >= 0 ? "+" : ""}{fmtIDR(row.profit)}
                      </td>
                      <td className={`py-2 px-2 text-right font-bold ${marginColor}`}>
                        {row.margin !== 0 ? (
                          <span className="flex items-center justify-end gap-1">
                            {row.margin.toFixed(1)}%
                            <span
                              className="inline-block h-1.5 rounded-full"
                              style={{
                                width: `${Math.min(Math.abs(row.margin), 50) * 1.2}px`,
                                background: row.margin >= 0 ? "#10b981" : "#ef4444",
                                opacity: 0.7,
                              }}
                            />
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
                  <td colSpan={4} className="py-2.5 px-2 text-blue-800">Total ({byOrderFiltered.length} order)</td>
                  <td className="py-2.5 px-2 text-right font-mono text-sky-700">
                    {fmtIDR(byOrderFiltered.reduce((s, r) => s + r.revenue, 0))}
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono text-rose-700">
                    {fmtIDR(byOrderFiltered.reduce((s, r) => s + r.modal, 0))}
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono text-amber-700">
                    {fmtIDR(byOrderFiltered.reduce((s, r) => s + r.opex, 0))}
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono text-emerald-700">
                    {(() => {
                      const t = byOrderFiltered.reduce((s, r) => s + r.profit, 0);
                      return `${t >= 0 ? "+" : ""}${fmtIDR(t)}`;
                    })()}
                  </td>
                  <td className="py-2.5 px-2 text-right text-blue-700">
                    {(() => {
                      const rev = byOrderFiltered.reduce((s, r) => s + r.revenue, 0);
                      const prof = byOrderFiltered.reduce((s, r) => s + r.profit, 0);
                      return rev > 0 ? `${((prof / rev) * 100).toFixed(1)}%` : "—";
                    })()}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>

      </>}

      {/* ── Buku Besar (Ledger) tab ──────────────────────────────────────── */}
      {activeTab === "ledger" && (
        <div className="space-y-4">
          {/* Ledger summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Total Revenue",    value: fmtIDR(ledgerStats.totalRevenue),    tone: "sky",     sub: null },
              { label: "Total Modal",      value: fmtIDR(ledgerStats.totalCost),       tone: "amber",   sub: null },
              { label: "Gross Profit",     value: fmtIDR(ledgerStats.totalProfit),     tone: ledgerStats.totalProfit >= 0 ? "emerald" : "red", sub: `${ledgerStats.count} transaksi lunas` },
              { label: "Fee Komisi Agen",  value: `−${fmtIDR(ledgerStats.totalCommission)}`, tone: "orange",  sub: `Net: ${fmtIDR(ledgerStats.netProfit)}` },
            ].map((r) => (
              <div key={r.label} className={`rounded-2xl border bg-gradient-to-br p-3 md:p-4 ${
                r.tone === "sky"     ? "from-sky-50 to-white border-sky-100 text-sky-700" :
                r.tone === "amber"  ? "from-amber-50 to-white border-amber-100 text-amber-700" :
                r.tone === "emerald"? "from-emerald-50 to-white border-emerald-100 text-emerald-700" :
                r.tone === "red"    ? "from-red-50 to-white border-red-100 text-red-600" :
                r.tone === "orange" ? "from-orange-50 to-white border-orange-100 text-orange-700" :
                "from-violet-50 to-white border-violet-100 text-violet-700"
              }`}>
                <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">{r.label}</p>
                <p className="text-base md:text-lg font-extrabold font-mono mt-1">{r.value}</p>
                {r.sub && <p className="text-[10px] text-muted-foreground">{r.sub}</p>}
              </div>
            ))}
          </div>

          {ledgerEntries.length === 0 ? (
            <Card className="p-10 text-center">
              <p className="font-semibold text-muted-foreground">Belum ada order berstatus Paid atau Completed.</p>
              <p className="text-[12px] text-muted-foreground mt-1">Ubah status order ke Paid untuk mulai mengisi Buku Besar.</p>
            </Card>
          ) : (
            <Card className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[13px] font-semibold flex items-center gap-1.5">
                  📒 Buku Besar — Transaksi Lunas
                </h2>
                <span className="text-[10.5px] text-muted-foreground">{ledgerEntries.length} entri · semua waktu</span>
              </div>
              <div className="overflow-x-auto -mx-1">
                <table className="w-full text-[12px] min-w-[720px]">
                  <thead>
                    <tr className="text-muted-foreground border-b">
                      <th className="text-left font-semibold py-2 px-2">#</th>
                      <th className="text-left font-semibold py-2 px-2">Tanggal</th>
                      <th className="text-left font-semibold py-2 px-2">Klien</th>
                      <th className="text-left font-semibold py-2 px-2">Keterangan</th>
                      <th className="text-right font-semibold py-2 px-2">Revenue</th>
                      <th className="text-right font-semibold py-2 px-2">Modal/Fee</th>
                      <th className="text-right font-semibold py-2 px-2">Profit</th>
                      <th className="text-right font-semibold py-2 px-2">Margin</th>
                      <th className="text-right font-semibold py-2 px-2">Saldo Kumulatif</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerEntries.map((e, i) => {
                      if (e.isCommission) {
                        // Baris debit komisi agen — styling orange/amber
                        const balColor = e.runningBalance >= 0 ? "text-emerald-700 font-bold" : "text-red-600 font-bold";
                        return (
                          <tr key={e.orderId} className="border-b last:border-b-0 bg-orange-50/60 hover:bg-orange-100 cursor-pointer transition-colors" onClick={() => navigate(`/orders/detail/${e.orderId}`)} title="Buka detail order">
                            <td className="py-1.5 px-2 text-muted-foreground">—</td>
                            <td className="py-1.5 px-2 whitespace-nowrap text-muted-foreground">{fmtDate(e.paidAt)}</td>
                            <td className="py-1.5 px-2 max-w-[120px] truncate text-orange-700/70" title={e.clientName}>{e.clientName}</td>
                            <td className="py-1.5 px-2 max-w-[200px] truncate text-orange-700 font-semibold" title={e.orderTitle}>
                              <span className="mr-1">💸</span>
                              {e.orderTitle}
                            </td>
                            <td className="py-1.5 px-2 text-right font-mono text-muted-foreground">—</td>
                            <td className="py-1.5 px-2 text-right font-mono text-orange-700 font-semibold">−{fmtIDR(e.costIDR)}</td>
                            <td className="py-1.5 px-2 text-right font-mono font-semibold text-orange-700">
                              −{fmtIDR(Math.abs(e.profitIDR))}
                            </td>
                            <td className="py-1.5 px-2 text-right text-muted-foreground">—</td>
                            <td className={`py-1.5 px-2 text-right font-mono ${balColor}`}>
                              {fmtIDR(e.runningBalance)}
                            </td>
                          </tr>
                        );
                      }
                      if (e.isVoaOpex) {
                        // Baris debit biaya operasional VOA — styling ungu
                        const balColor = e.runningBalance >= 0 ? "text-emerald-700 font-bold" : "text-red-600 font-bold";
                        return (
                          <tr key={e.orderId} className="border-b last:border-b-0 bg-purple-50/60 hover:bg-purple-100 cursor-pointer transition-colors" onClick={() => navigate(`/orders/detail/${e.orderId.replace("voa_opex_", "")}`)} title="Buka detail order">
                            <td className="py-1.5 px-2 text-muted-foreground">—</td>
                            <td className="py-1.5 px-2 whitespace-nowrap text-muted-foreground">{fmtDate(e.paidAt)}</td>
                            <td className="py-1.5 px-2 max-w-[120px] truncate text-purple-700/70" title={e.clientName}>{e.clientName}</td>
                            <td className="py-1.5 px-2 max-w-[200px] truncate text-purple-700 font-semibold" title={e.orderTitle}>
                              <span className="mr-1">🛂</span>
                              {e.orderTitle}
                            </td>
                            <td className="py-1.5 px-2 text-right font-mono text-muted-foreground">—</td>
                            <td className="py-1.5 px-2 text-right font-mono text-purple-700 font-semibold">−{fmtIDR(e.costIDR)}</td>
                            <td className="py-1.5 px-2 text-right font-mono font-semibold text-purple-700">
                              −{fmtIDR(Math.abs(e.profitIDR))}
                            </td>
                            <td className="py-1.5 px-2 text-right text-muted-foreground">—</td>
                            <td className={`py-1.5 px-2 text-right font-mono ${balColor}`}>
                              {fmtIDR(e.runningBalance)}
                            </td>
                          </tr>
                        );
                      }
                      if (e.isKurirOpex) {
                        // Baris debit biaya kurir setoran uang — styling amber/coklat
                        const balColor = e.runningBalance >= 0 ? "text-emerald-700 font-bold" : "text-red-600 font-bold";
                        return (
                          <tr key={e.orderId} className="border-b last:border-b-0 bg-amber-50/60 hover:bg-amber-100 cursor-pointer transition-colors" onClick={() => navigate(`/orders/detail/${e.orderId.replace("kurir_opex_", "")}`)} title="Buka detail order">
                            <td className="py-1.5 px-2 text-muted-foreground">—</td>
                            <td className="py-1.5 px-2 whitespace-nowrap text-muted-foreground">{fmtDate(e.paidAt)}</td>
                            <td className="py-1.5 px-2 max-w-[120px] truncate text-amber-800/70" title={e.clientName}>{e.clientName}</td>
                            <td className="py-1.5 px-2 max-w-[200px] truncate text-amber-800 font-semibold" title={e.orderTitle}>
                              <span className="mr-1">🚴</span>
                              {e.orderTitle}
                            </td>
                            <td className="py-1.5 px-2 text-right font-mono text-muted-foreground">—</td>
                            <td className="py-1.5 px-2 text-right font-mono text-amber-700 font-semibold">−{fmtIDR(e.costIDR)}</td>
                            <td className="py-1.5 px-2 text-right font-mono font-semibold text-amber-700">
                              −{fmtIDR(Math.abs(e.profitIDR))}
                            </td>
                            <td className="py-1.5 px-2 text-right text-muted-foreground">—</td>
                            <td className={`py-1.5 px-2 text-right font-mono ${balColor}`}>
                              {fmtIDR(e.runningBalance)}
                            </td>
                          </tr>
                        );
                      }
                      const profitColor = e.profitIDR >= 0 ? "text-emerald-700" : "text-red-600";
                      const balColor    = e.runningBalance >= 0 ? "text-emerald-700 font-bold" : "text-red-600 font-bold";
                      const marginColor = e.marginPct >= 20 ? "text-emerald-700" : e.marginPct >= 10 ? "text-sky-700" : e.marginPct >= 0 ? "text-amber-700" : "text-red-600";
                      // Count only non-commission, non-voaOpex, non-kurirOpex entries for the # column
                      const orderCount = ledgerEntries.slice(i).filter((x) => !x.isCommission && !x.isVoaOpex && !x.isKurirOpex).length;
                      return (
                        <tr key={e.orderId} className="border-b last:border-b-0 hover:bg-blue-50/50 cursor-pointer transition-colors" onClick={() => navigate(`/orders/detail/${e.orderId}`)} title="Buka detail order">
                          <td className="py-2 px-2 text-muted-foreground">{orderCount}</td>
                          <td className="py-2 px-2 whitespace-nowrap text-muted-foreground">{fmtDate(e.paidAt)}</td>
                          <td className="py-2 px-2 max-w-[120px] truncate" title={e.clientName}>{e.clientName}</td>
                          <td className="py-2 px-2 max-w-[160px] truncate font-medium" title={e.orderTitle}>
                            <span className="mr-1">{ORDER_TYPE_EMOJI[e.orderType as keyof typeof ORDER_TYPE_EMOJI] ?? "📦"}</span>
                            {e.orderTitle}
                          </td>
                          <td className="py-2 px-2 text-right font-mono">{fmtIDR(e.revenueIDR)}</td>
                          <td className="py-2 px-2 text-right font-mono text-rose-700">{fmtIDR(e.costIDR)}</td>
                          <td className={`py-2 px-2 text-right font-mono font-semibold ${profitColor}`}>
                            {e.profitIDR >= 0 ? "+" : ""}{fmtIDR(e.profitIDR)}
                          </td>
                          <td className={`py-2 px-2 text-right font-semibold ${marginColor}`}>
                            {e.marginPct.toFixed(1)}%
                          </td>
                          <td className={`py-2 px-2 text-right font-mono ${balColor}`}>
                            {fmtIDR(e.runningBalance)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-emerald-200 bg-emerald-50/50 font-bold text-[12px]">
                      <td colSpan={4} className="py-2.5 px-2 text-emerald-800">
                        Total ({ledgerStats.count} order
                        {ledgerEntries.filter(e => e.isCommission).length > 0 && ` · ${ledgerEntries.filter(e => e.isCommission).length} komisi 💸`}
                        {ledgerEntries.filter(e => e.isVoaOpex).length > 0 && ` · ${ledgerEntries.filter(e => e.isVoaOpex).length} opex VOA 🛂`}
                        {ledgerEntries.filter(e => e.isKurirOpex).length > 0 && ` · ${ledgerEntries.filter(e => e.isKurirOpex).length} kurir 🚴`}
                        )
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono text-sky-700">{fmtIDR(ledgerStats.totalRevenue)}</td>
                      <td className="py-2.5 px-2 text-right font-mono text-rose-700">{fmtIDR(ledgerStats.totalCost)}</td>
                      <td className={`py-2.5 px-2 text-right font-mono ${ledgerStats.totalProfit >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                        {ledgerStats.totalProfit >= 0 ? "+" : ""}{fmtIDR(ledgerStats.totalProfit)}
                      </td>
                      <td className="py-2.5 px-2 text-right text-emerald-700">
                        {ledgerStats.avgMargin.toFixed(1)}%
                      </td>
                      <td className={`py-2.5 px-2 text-right font-mono ${ledgerStats.netProfit >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                        {fmtIDR(ledgerStats.netProfit)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="mt-3 text-[10.5px] text-muted-foreground">
                * Revenue & profit di-konversi ke IDR menggunakan kurs yang di-snapshot saat order pertama kali berstatus Paid.
                Order lama yang belum punya snapshot menggunakan kurs live saat ini (1 EGP ≈ Rp {egpRate}).
                Baris 💸 = pengeluaran fee komisi agen (otomatis dari Pengaturan → Tim).
                Baris 🛂 = biaya operasional VOA (fee agent lapangan + transport + lainnya), diinput di detail order VOA.
                Baris 🚴 = biaya kurir setoran uang tunai (fee kurir + ongkos transport + lainnya), diinput di panel Biaya Kurir pada detail order manapun.
              </p>
            </Card>
          )}
        </div>
      )}

      {/* Footer note */}
      <div className="rounded-xl border bg-muted/30 p-3 text-[10.5px] text-muted-foreground leading-relaxed">
        <strong className="text-foreground">Catatan:</strong> Profit = Harga Jual − Harga Modal.
        Order EGP (visa Mesir) di-konversi ke IDR pakai kurs <span className="font-mono">1 EGP ≈ Rp {egpRate}</span>.
        Fee komisi mitra dihitung berdasarkan <em>fee flat per jenis produk</em> (bukan persentase profit).
        Atur nominal fee per produk di <strong>Pengaturan → Fee Produk</strong>. Poin di-award otomatis: 10 poin saat Completed, +20 poin bonus jika dapat komisi
        per order yg statusnya berubah ke <strong>Completed</strong>.
      </div>

      </div>{/* end shared content */}
    </div>
  );
}

function SummaryCard({
  label, value, icon: Icon, tone, big = false,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "emerald" | "red" | "sky" | "amber" | "violet";
  big?: boolean;
}) {
  const toneClass = {
    emerald: "from-emerald-50 to-white border-emerald-100 text-emerald-700",
    red: "from-red-50 to-white border-red-100 text-red-600",
    sky: "from-sky-50 to-white border-sky-100 text-sky-700",
    amber: "from-amber-50 to-white border-amber-100 text-amber-700",
    violet: "from-violet-50 to-white border-violet-100 text-violet-700",
  }[tone];
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 12 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] } },
      }}
      whileHover={{ y: -3, boxShadow: "0 10px 24px -6px rgba(0,0,0,0.10)" }}
      whileTap={{ scale: 0.98 }}
      className={`rounded-2xl border bg-gradient-to-br p-3 md:p-4 cursor-default ${toneClass}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <Icon className="h-4 w-4 opacity-70" />
      </div>
      <div className={`mt-1.5 font-extrabold font-mono ${big ? "text-xl md:text-2xl" : "text-base md:text-lg"} text-foreground`}>
        {value}
      </div>
    </motion.div>
  );
}

function SplitCard({
  icon: Icon, label, accent, profit, revenue, count, extra, highlight = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  accent: string;
  profit: number;
  revenue: number;
  count: number;
  extra: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -2, boxShadow: "0 8px 20px -6px rgba(0,0,0,0.09)" }}
      whileTap={{ scale: 0.98 }}
      className={`rounded-2xl border bg-gradient-to-br p-3 md:p-4 cursor-default ${accent} ${highlight ? "ring-2 ring-emerald-300" : ""}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
          <Icon className="h-3.5 w-3.5" />
          {label}
        </span>
        <span className="text-[10.5px] text-muted-foreground">{count} order</span>
      </div>
      <div className={`mt-1.5 font-extrabold font-mono text-lg md:text-xl ${profit >= 0 ? "text-emerald-700" : "text-red-600"}`}>
        {fmtIDR(profit)}
      </div>
      <div className="text-[10.5px] text-muted-foreground">
        Revenue: <span className="font-mono">{fmtIDR(revenue)}</span>
      </div>
      {extra}
    </motion.div>
  );
}
