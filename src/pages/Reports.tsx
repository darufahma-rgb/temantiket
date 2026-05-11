import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  TrendingUp, TrendingDown, Wallet, Receipt, ShieldCheck, Filter,
  Crown, ArrowDown, Users, Trophy, Handshake, Building2,
  BarChart3, ArrowUpDown, ChevronUp, ChevronDown, Search, FileDown, Info,
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
} from "@/lib/paymentStatus";
import { useRatesStore } from "@/store/ratesStore";
import { listAgentPoints, sumPointsByAgent, type AgentPoint } from "@/features/agentPoints/agentPointsRepo";
import { buildLedgerEntries, ledgerSummary } from "@/lib/ledgerSync";
import { loadProductCommissions, pullProductCommissions, type ProductCommissions } from "@/lib/productCommissions";

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
  const [activeTab, setActiveTab] = useState<"summary" | "ledger" | "piutang">("summary");
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

  /**
   * Profit bersih agency per order — RUMUS TUNGGAL yang dipakai di semua section.
   *
   * = Gross Profit − Fee Agen Penjual − Fee Pelaksana − Biaya VOA − Biaya Kurir
   *
   * Fee Agen: dibaca dari meta.agentFee (per-order actual, bukan rate global).
   * Divalidasi: hanya dipotong jika createdByAgent mengarah ke member role "agent".
   * Direct order (owner/staff closing ref) → agentFee = 0.
   *
   * Fee Pelaksana: dibaca dari meta.pelaksanaFee (visa_student + pelaksanaId).
   */
  const agencyProfit = useCallback(
    (o: Order): number => {
      const gross = profitIDR(o, egpRate);
      // Validasi: agentFee hanya dipotong jika createdByAgent adalah member role "agent"
      const member = o.createdByAgent ? memberById.get(o.createdByAgent) : undefined;
      const agentFee = (member?.role === "agent") ? agentFeeFromMeta(o) : 0;
      const pelFee = pelaksanaFeeFromMeta(o);
      const opex = voaOpCost(o) + kurirOpCost(o);
      return gross - agentFee - pelFee - opex;
    },
    [egpRate, memberById],
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
  //
  // KONSISTENSI: agentFee dibaca dari meta.agentFee (per-order actual),
  // bukan dari getCommissionForOrderType (rate global). pelaksanaFee ikut
  // diperhitungkan di kedua bucket.
  const split = useMemo(() => {
    let directNetProfit = 0;
    let directRevenue = 0;
    let directCount = 0;
    let agentGrossProfit = 0;    // gross profit (revenue - modal) dari order via agent
    let agentModal = 0;           // total modal HPP dari order via agent
    let agentRevenue = 0;
    let agentCount = 0;
    let totalCommission = 0;     // meta.agentFee — komisi agen penjual
    // Opex dipecah agar tidak ada biaya tersembunyi di breakdown card:
    let totalFieldFee = 0;       // fee lapangan: voaAgentFee (field agent) + pelaksanaFee (visa_student)
    let totalTransportOpex = 0;  // biaya transport/ops: (voaTransportFee + voaOtherFee) + kurirOpCost

    for (const o of filtered) {
      const gross = profitIDR(o, egpRate);
      const r = revenueIDR(o, egpRate);
      const c = costIDR(o, egpRate);
      const meta = (o.metadata ?? {}) as Record<string, unknown>;
      // Pisahkan voaOpCost: voaAgentFee (fee ke orang) vs transport/other (non-personal)
      const voaFieldFeeAmt  = o.type === "visa_voa" ? Number(meta.voaAgentFee ?? 0) : 0;
      const voaTransportAmt = voaOpCost(o) - voaFieldFeeAmt;  // voaTransportFee + voaOtherFee
      const kurirAmt        = kurirOpCost(o);
      const pelFee          = pelaksanaFeeFromMeta(o);
      // Cek apakah createdByAgent mengarah ke member berole "agent".
      // Owner/staff yang di-set sebagai "Closing Ref" TIDAK dihitung Via Agent.
      const member = o.createdByAgent ? memberById.get(o.createdByAgent) : undefined;
      const isAgentOrder = o.createdByAgent != null && member?.role === "agent";
      if (isAgentOrder) {
        agentGrossProfit   += gross;
        agentRevenue       += r;
        agentModal         += c;
        agentCount         += 1;
        totalCommission    += agentFeeFromMeta(o);         // komisi agen penjual
        totalFieldFee      += voaFieldFeeAmt + pelFee;    // fee lapangan + pelaksana
        totalTransportOpex += voaTransportAmt + kurirAmt; // transport + kurir
      } else {
        // Direct order: net = gross - semua opex (agentFee selalu 0)
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

  // ── Piutang: ringkasan pembayaran klien (seluruh waktu, tidak filtered date) ──
  const piutang = useMemo(() => {
    // Build name lookup inline so this memo doesn't depend on byClient ordering
    const nameById = new Map<string, string>();
    for (const c of clients) nameById.set(c.id, c.name);

    let totalTagihan   = 0; // sum totalPrice (IDR) semua non-Cancelled
    let totalCair      = 0; // sum paidAmount (IDR) semua non-Cancelled
    let totalPiutang   = 0; // sisa tagihan UNPAID + DP
    let piutangCount   = 0;
    const piutangOrders: Array<{
      order: Order;
      remaining: number;
      clientName: string;
    }> = [];

    for (const o of orders) {
      if (o.status === "Cancelled") continue;
      totalTagihan += revenueIDR(o, egpRate);
      totalCair    += paidAmountIDR(o, egpRate);
      if (isReceivable(o.paymentStatus)) {
        const rem = receivableIDR(o, egpRate);
        if (rem > 0) {
          totalPiutang += rem;
          piutangCount += 1;
          const cId = o.clientId ?? "__none";
          piutangOrders.push({
            order: o,
            remaining: rem,
            clientName: cId === "__none" ? "— Tanpa klien —" : (nameById.get(cId) ?? `Klien ${cId.slice(0, 6)}…`),
          });
        }
      }
    }

    piutangOrders.sort((a, b) => b.remaining - a.remaining);

    return { totalTagihan, totalCair, totalPiutang, piutangCount, piutangOrders };
  }, [orders, clients, egpRate]);

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
      // Profit bersih = gross profit - semua biaya (konsisten dengan agencyProfit)
      cur.profit += agencyProfit(o);
      cur.revenue += revenueIDR(o, egpRate);
      cur.orders += 1;
      // Komisi aktual dari metadata order (bukan rate global)
      cur.commission += agentFeeFromMeta(o);
      m.set(o.createdByAgent, cur);
    }
    // Tambahkan fee lapangan VOA: agen yg bertugas sebagai voaFieldAgentId pada order visa_voa
    for (const o of filtered) {
      if (o.type !== "visa_voa") continue;
      const meta = (o.metadata ?? {}) as Record<string, unknown>;
      const fieldAgentId = meta.voaFieldAgentId as string | undefined;
      if (!fieldAgentId) continue;
      const fieldMember = memberById.get(fieldAgentId);
      if (!fieldMember || fieldMember.role !== "agent") continue;
      const voaFee = Number(meta.voaAgentFee ?? 0);
      if (voaFee <= 0) continue;
      const cur = m.get(fieldAgentId) ?? { profit: 0, orders: 0, revenue: 0, commission: 0 };
      cur.commission += voaFee;
      m.set(fieldAgentId, cur);
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
  }, [filtered, agentMembers, memberById, points, egpRate, agencyProfit]);

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
      const cost    = costIDR(o, egpRate);

      // Biaya internal dari "Jadikan Order" (sudah termasuk di costPrice, dipindah ke opex)
      const meta = o.metadata as Record<string, unknown> | null;
      const ip = (meta?.internalProfit ?? null) as { opexIDR?: number } | null;
      const internalOpex = ip?.opexIDR ? Number(ip.opexIDR) : 0;

      // Komponen opex/fee — masing-masing dihitung terpisah untuk tooltip
      const voaOpexIDR = voaOpCost(o);
      const kurirIDR   = kurirOpCost(o);
      const pelFee     = pelaksanaFeeFromMeta(o);

      // Fee agen: hanya dipotong jika createdByAgent mengarah ke member berole "agent"
      // (sama persis dengan agencyProfit callback — agar angka sinkron)
      const member   = o.createdByAgent ? memberById.get(o.createdByAgent) : undefined;
      const agentFee = (member?.role === "agent") ? agentFeeFromMeta(o) : 0;

      // modal = modal murni (costPrice dikurangi internalOpex yg dipindah ke biaya)
      const modal = Math.max(0, cost - internalOpex);

      // biaya = SEMUA deductions selain modal → Revenue − Modal − Biaya = Profit ✓
      const biaya = internalOpex + voaOpexIDR + kurirIDR + agentFee + pelFee;

      // profit = agencyProfit (canonical net profit)
      const profit = agencyProfit(o);

      // Gross = revenue - cost (sebelum fee/opex) — untuk tooltip saja
      const grossProfit = profitBreakdown(o, egpRate, agentFee).gross;

      const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
      return {
        id: o.id,
        title: o.title || "—",
        date: o.createdAt,
        type: o.type,
        revenue,
        modal,
        biaya,       // total deductions (renamed from opex)
        profit,
        margin,
        // Per-komponen untuk tooltip breakdown
        grossProfit,
        agentFee,
        pelFee,
        voaOpexIDR,
        kurirIDR,
        internalOpex,
        agentName: agentFee > 0 ? (member?.displayName ?? "Agen") : null,
      };
    });
  }, [filtered, egpRate, agencyProfit, memberById]);

  const byOrderFiltered = useMemo(() => {
    const q = pkgSearch.trim().toLowerCase();
    const rows = q ? byOrder.filter((r) => r.title.toLowerCase().includes(q)) : byOrder;
    return [...rows].sort((a, b) => {
      let diff = 0;
      if (sortCol === "date") diff = new Date(a.date).getTime() - new Date(b.date).getTime();
      else if (sortCol === "revenue") diff = a.revenue - b.revenue;
      else if (sortCol === "modal") diff = a.modal - b.modal;
      else if (sortCol === "opex") diff = a.biaya - b.biaya;
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
    <div className="max-w-[1400px] mx-auto pb-8 md:py-6 md:px-6 md:space-y-5">

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
        <div className="flex gap-1 p-1 rounded-2xl bg-[hsl(var(--secondary))]">
          {(["summary", "ledger", "piutang"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 h-9 rounded-xl text-[11px] font-bold transition-all ${
                activeTab === tab
                  ? "bg-white text-[hsl(var(--foreground))] shadow-sm"
                  : "text-[hsl(var(--muted-foreground))]"
              }`}
            >
              {tab === "summary" ? "📊 Ringkasan" : tab === "ledger" ? "📒 Buku Besar" : "💳 Piutang"}
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
          {(["summary", "ledger", "piutang"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-[12px] font-semibold rounded-t-xl border border-b-0 transition-colors -mb-px ${
                activeTab === tab
                  ? "bg-background border-border text-foreground"
                  : "bg-muted/30 border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab === "summary" ? "📊 Ringkasan" : tab === "ledger" ? "📒 Buku Besar" : "💳 Piutang"}
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
          label="Net Profit Agency"
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
          profit={split.agentNetForAgency}
          revenue={split.agentRevenue}
          count={split.agentCount}
          extra={
            <div className="space-y-0.5 mt-1.5 pt-1.5 border-t border-orange-200 text-[10.5px]">
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Revenue</span>
                <span className="font-mono">{fmtIDR(split.agentRevenue)}</span>
              </div>
              <div className="flex items-center justify-between text-rose-700">
                <span>− Modal (HPP)</span>
                <span className="font-mono">{fmtIDR(split.agentModal)}</span>
              </div>
              <div className="flex items-center justify-between font-semibold text-slate-700 border-b border-orange-100 pb-0.5 mb-0.5">
                <span>= Gross Profit</span>
                <span className="font-mono">{fmtIDR(split.agentGrossProfit)}</span>
              </div>
              {split.totalCommission > 0 && (
                <div className="flex items-center justify-between text-orange-700">
                  <span>− Komisi Agent</span>
                  <span className="font-mono">{fmtIDR(split.totalCommission)}</span>
                </div>
              )}
              {split.totalFieldFee > 0 && (
                <div className="flex items-center justify-between text-purple-700">
                  <span>− Fee Lapangan/Pelaksana</span>
                  <span className="font-mono">{fmtIDR(split.totalFieldFee)}</span>
                </div>
              )}
              {split.totalTransportOpex > 0 && (
                <div className="flex items-center justify-between text-amber-700">
                  <span>− Biaya Transport/Ops</span>
                  <span className="font-mono">{fmtIDR(split.totalTransportOpex)}</span>
                </div>
              )}
              <div className="flex items-center justify-between font-bold text-emerald-700 border-t border-orange-200 pt-0.5">
                <span>= Net Profit Agency</span>
                <span className="font-mono">{fmtIDR(split.agentNetForAgency)}</span>
              </div>
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
              = Net Direct + Net Via Mitra
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
              <h2 className="text-[13px] font-semibold">Net Profit Agency per Kategori</h2>
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
                    <th className="text-right font-semibold py-2 px-1">Net Profit</th>
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
                  <th className="text-right font-semibold py-2 px-1">Profit Bersih</th>
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

        {/* Legend biaya */}
        <div className="flex flex-wrap gap-2 mb-3 text-[10.5px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-rose-400" />Modal = HPP murni</span>
          <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-amber-400" />Biaya = semua deductions (fee agen + pelaksana + VOA + kurir)</span>
          <span className="flex items-center gap-1"><Info className="h-3 w-3 text-blue-500" />Hover kolom Profit untuk detail</span>
        </div>

        <div className="overflow-x-auto -mx-1" style={{ overflowY: "visible" }}>
          <table className="w-full text-[12px] min-w-[700px]" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
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
                  Biaya <SortIcon col="opex" />
                </th>
                <th
                  className="text-right font-semibold py-2 px-2 cursor-pointer select-none hover:text-foreground transition-colors"
                  onClick={() => toggleSort("profit")}
                >
                  Profit Bersih <SortIcon col="profit" />
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
                  const hasDeductions = row.agentFee > 0 || row.pelFee > 0 || row.voaOpexIDR > 0 || row.kurirIDR > 0 || row.internalOpex > 0;
                  return (
                    <tr
                      key={row.id}
                      className="border-b last:border-b-0 hover:bg-blue-50/60 cursor-pointer transition-colors"
                      onClick={() => navigate(`/orders/detail/${row.id}`)}
                      title="Buka detail order"
                    >
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
                      <td className="py-2 px-2 text-right font-mono text-rose-700">
                        {row.modal > 0 ? fmtIDR(row.modal) : <span className="text-muted-foreground">—</span>}
                      </td>
                      {/* Biaya column — tooltip on hover shows breakdown */}
                      <td
                        className="py-2 px-2 text-right font-mono text-amber-700"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {row.biaya > 0 ? (
                          <span className="relative group/biaya inline-block">
                            {fmtIDR(row.biaya)}
                            {/* Breakdown tooltip */}
                            <span className="pointer-events-none absolute right-0 bottom-full mb-1.5 z-50 hidden group-hover/biaya:flex flex-col w-52 rounded-xl border border-amber-200 bg-white shadow-2xl p-2.5 text-[10.5px] text-left gap-0.5" style={{ whiteSpace: "nowrap" }}>
                              <span className="font-bold text-foreground mb-1 border-b pb-1 text-[11px]">Rincian Biaya</span>
                              {row.internalOpex > 0 && (
                                <span className="flex justify-between gap-3 text-slate-600">
                                  <span>Biaya Internal</span>
                                  <span className="font-mono">{fmtIDR(row.internalOpex)}</span>
                                </span>
                              )}
                              {row.agentFee > 0 && (
                                <span className="flex justify-between gap-3 text-orange-700">
                                  <span>💸 Fee Agen{row.agentName ? ` (${row.agentName})` : ""}</span>
                                  <span className="font-mono">{fmtIDR(row.agentFee)}</span>
                                </span>
                              )}
                              {row.pelFee > 0 && (
                                <span className="flex justify-between gap-3 text-violet-700">
                                  <span>📋 Fee Pelaksana</span>
                                  <span className="font-mono">{fmtIDR(row.pelFee)}</span>
                                </span>
                              )}
                              {row.voaOpexIDR > 0 && (
                                <span className="flex justify-between gap-3 text-purple-700">
                                  <span>🛂 Biaya VOA</span>
                                  <span className="font-mono">{fmtIDR(row.voaOpexIDR)}</span>
                                </span>
                              )}
                              {row.kurirIDR > 0 && (
                                <span className="flex justify-between gap-3 text-amber-700">
                                  <span>🚴 Biaya Kurir</span>
                                  <span className="font-mono">{fmtIDR(row.kurirIDR)}</span>
                                </span>
                              )}
                              <span className="flex justify-between gap-3 font-bold text-amber-800 border-t pt-1 mt-0.5">
                                <span>Total Biaya</span>
                                <span className="font-mono">{fmtIDR(row.biaya)}</span>
                              </span>
                            </span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      {/* Profit Bersih — tooltip shows full P&L breakdown */}
                      <td
                        className={`py-2 px-2 text-right font-mono font-bold ${profitColor}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span className="relative group/profit inline-block">
                          <span className="flex items-center justify-end gap-1">
                            {row.profit >= 0 ? "+" : ""}{fmtIDR(row.profit)}
                            {hasDeductions && (
                              <Info className="h-3 w-3 opacity-40 group-hover/profit:opacity-100 transition-opacity shrink-0" />
                            )}
                          </span>
                          {/* Full P&L breakdown tooltip */}
                          <span className="pointer-events-none absolute right-0 bottom-full mb-1.5 z-50 hidden group-hover/profit:flex flex-col w-56 rounded-xl border border-blue-200 bg-white shadow-2xl p-2.5 text-[10.5px] text-left gap-0.5" style={{ whiteSpace: "nowrap" }}>
                            <span className="font-bold text-foreground mb-1 border-b pb-1 text-[11px]">Breakdown Profit Bersih</span>
                            <span className="flex justify-between gap-3 text-sky-700">
                              <span>Revenue</span>
                              <span className="font-mono">{fmtIDR(row.revenue)}</span>
                            </span>
                            <span className="flex justify-between gap-3 text-rose-700">
                              <span>− Modal (HPP)</span>
                              <span className="font-mono">{fmtIDR(row.modal)}</span>
                            </span>
                            {row.internalOpex > 0 && (
                              <span className="flex justify-between gap-3 text-slate-600">
                                <span>− Biaya Internal</span>
                                <span className="font-mono">{fmtIDR(row.internalOpex)}</span>
                              </span>
                            )}
                            <span className="flex justify-between gap-3 font-semibold text-slate-700 border-t pt-1 mt-0.5">
                              <span>= Gross Profit</span>
                              <span className="font-mono">{fmtIDR(row.grossProfit)}</span>
                            </span>
                            {row.agentFee > 0 && (
                              <span className="flex justify-between gap-3 text-orange-700">
                                <span>− Fee Agen{row.agentName ? ` (${row.agentName})` : ""}</span>
                                <span className="font-mono">{fmtIDR(row.agentFee)}</span>
                              </span>
                            )}
                            {row.pelFee > 0 && (
                              <span className="flex justify-between gap-3 text-violet-700">
                                <span>− Fee Pelaksana</span>
                                <span className="font-mono">{fmtIDR(row.pelFee)}</span>
                              </span>
                            )}
                            {row.voaOpexIDR > 0 && (
                              <span className="flex justify-between gap-3 text-purple-700">
                                <span>− Biaya VOA</span>
                                <span className="font-mono">{fmtIDR(row.voaOpexIDR)}</span>
                              </span>
                            )}
                            {row.kurirIDR > 0 && (
                              <span className="flex justify-between gap-3 text-amber-700">
                                <span>− Biaya Kurir</span>
                                <span className="font-mono">{fmtIDR(row.kurirIDR)}</span>
                              </span>
                            )}
                            <span className={`flex justify-between gap-3 font-bold border-t pt-1 mt-0.5 ${row.profit >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                              <span>= Profit Bersih</span>
                              <span className="font-mono">{fmtIDR(row.profit)}</span>
                            </span>
                          </span>
                        </span>
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
                    {fmtIDR(byOrderFiltered.reduce((s, r) => s + r.biaya, 0))}
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
              { label: "Fee & Biaya Ops",  value: `−${fmtIDR(ledgerStats.totalCommission + ledgerStats.totalVoaOpex + ledgerStats.totalKurirOpex + ledgerStats.totalPelaksana)}`, tone: "orange",  sub: `Net: ${fmtIDR(ledgerStats.netProfit)}` },
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
                      if (e.isPelaksanaFee) {
                        // Baris debit fee pelaksana visa student — styling violet
                        const balColor = e.runningBalance >= 0 ? "text-emerald-700 font-bold" : "text-red-600 font-bold";
                        return (
                          <tr key={e.orderId} className="border-b last:border-b-0 bg-violet-50/60 hover:bg-violet-100 cursor-pointer transition-colors" onClick={() => navigate(`/orders/detail/${e.orderId.replace("pelaksana_fee_", "")}`)} title="Buka detail order">
                            <td className="py-1.5 px-2 text-muted-foreground">—</td>
                            <td className="py-1.5 px-2 whitespace-nowrap text-muted-foreground">{fmtDate(e.paidAt)}</td>
                            <td className="py-1.5 px-2 max-w-[120px] truncate text-violet-700/70" title={e.clientName}>{e.clientName}</td>
                            <td className="py-1.5 px-2 max-w-[200px] truncate text-violet-700 font-semibold" title={e.orderTitle}>
                              <span className="mr-1">📋</span>
                              {e.orderTitle}
                            </td>
                            <td className="py-1.5 px-2 text-right font-mono text-muted-foreground">—</td>
                            <td className="py-1.5 px-2 text-right font-mono text-violet-700 font-semibold">−{fmtIDR(e.costIDR)}</td>
                            <td className="py-1.5 px-2 text-right font-mono font-semibold text-violet-700">
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
                      // Count only non-debit entries for the # column
                      const orderCount = ledgerEntries.slice(i).filter((x) => !x.isCommission && !x.isVoaOpex && !x.isKurirOpex && !x.isPelaksanaFee).length;
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
                        {ledgerEntries.filter(e => e.isPelaksanaFee).length > 0 && ` · ${ledgerEntries.filter(e => e.isPelaksanaFee).length} pelaksana 📋`}
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
                Baris 💸 = fee komisi agen penjual (dibaca dari data order, bukan rate global).
                Baris 🛂 = biaya operasional VOA (fee agent lapangan + transport + lainnya).
                Baris 🚴 = biaya kurir setoran uang tunai (fee kurir + ongkos transport + lainnya).
                Baris 📋 = fee pelaksana visa student (dibaca dari data order).
              </p>
            </Card>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
           PIUTANG TAB
      ══════════════════════════════════════════════════════ */}
      {activeTab === "piutang" && (
        <div className="space-y-5">
          {/* Header */}
          <div className="flex items-center gap-2">
            <span className="text-2xl">💳</span>
            <div>
              <h2 className="text-base font-bold">Ringkasan Piutang Klien</h2>
              <p className="text-[11px] text-muted-foreground">
                Mencakup seluruh order aktif (semua waktu, bukan filter periode).
              </p>
            </div>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50 to-white p-4">
              <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground">Total Tagihan</div>
              <div className="text-xl font-extrabold font-mono mt-1">{fmtIDR(piutang.totalTagihan)}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">Semua order non-Cancelled</div>
            </div>
            <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-4">
              <div className="text-[10.5px] uppercase tracking-wide text-emerald-700">Kas Sudah Masuk</div>
              <div className="text-xl font-extrabold font-mono mt-1 text-emerald-700">{fmtIDR(piutang.totalCair)}</div>
              <div className="text-[10px] text-emerald-600 mt-0.5">
                {piutang.totalTagihan > 0
                  ? `${Math.round((piutang.totalCair / piutang.totalTagihan) * 100)}% dari total tagihan`
                  : "—"}
              </div>
            </div>
            <div className="rounded-2xl border border-red-100 bg-gradient-to-br from-red-50 to-white p-4">
              <div className="text-[10.5px] uppercase tracking-wide text-red-700">Piutang Aktif</div>
              <div className="text-xl font-extrabold font-mono mt-1 text-red-700">{fmtIDR(piutang.totalPiutang)}</div>
              <div className="text-[10px] text-red-500 mt-0.5">{piutang.piutangCount} order belum lunas</div>
            </div>
          </div>

          {/* Progress bar: cash collected vs outstanding */}
          {piutang.totalTagihan > 0 && (
            <Card className="p-4 space-y-2">
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>Progres Koleksi Pembayaran</span>
                <span className="font-mono font-bold">
                  {fmtIDRShort(piutang.totalCair)} / {fmtIDRShort(piutang.totalTagihan)}
                </span>
              </div>
              <div className="h-3 rounded-full bg-gray-100 overflow-hidden flex">
                <div
                  className="h-full bg-emerald-500 rounded-l-full transition-all"
                  style={{ width: `${Math.min(100, (piutang.totalCair / piutang.totalTagihan) * 100)}%` }}
                />
                <div
                  className="h-full bg-red-300 transition-all"
                  style={{ width: `${Math.min(100, (piutang.totalPiutang / piutang.totalTagihan) * 100)}%` }}
                />
              </div>
              <div className="flex gap-4 text-[10.5px]">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />Sudah cair</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-300 inline-block" />Piutang</span>
              </div>
            </Card>
          )}

          {/* Piutang order list */}
          {piutang.piutangOrders.length === 0 ? (
            <Card className="p-10 text-center">
              <span className="text-4xl">🟢</span>
              <p className="font-semibold mt-3">Semua order sudah lunas!</p>
              <p className="text-[12px] text-muted-foreground mt-1">Tidak ada piutang aktif saat ini.</p>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <h3 className="text-[13px] font-semibold">Order Belum Lunas</h3>
                <span className="text-[10.5px] text-muted-foreground">{piutang.piutangCount} order</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left py-2 px-3 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">Klien / Order</th>
                      <th className="text-right py-2 px-3 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">Total</th>
                      <th className="text-right py-2 px-3 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">Dibayar</th>
                      <th className="text-right py-2 px-3 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">Sisa</th>
                      <th className="text-center py-2 px-3 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {piutang.piutangOrders.map(({ order: o, remaining, clientName }) => {
                      const totalIDR = revenueIDR(o, egpRate);
                      const paidIDR  = paidAmountIDR(o, egpRate);
                      const ps = o.paymentStatus;
                      return (
                        <tr key={o.id} className="hover:bg-muted/20 transition-colors">
                          <td className="py-2.5 px-3">
                            <div className="font-medium text-[12px] truncate max-w-[200px]">
                              {ORDER_TYPE_EMOJI[o.type]} {o.title || ORDER_TYPE_LABEL[o.type]}
                            </div>
                            <div className="text-[10.5px] text-muted-foreground">{clientName}</div>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-[12px]">{fmtIDR(totalIDR)}</td>
                          <td className="py-2.5 px-3 text-right font-mono text-[12px] text-emerald-700">{fmtIDR(paidIDR)}</td>
                          <td className="py-2.5 px-3 text-right font-mono text-[12px] font-bold text-red-600">{fmtIDR(remaining)}</td>
                          <td className="py-2.5 px-3 text-center">
                            <span className={`text-[9.5px] font-bold px-2 py-0.5 rounded-full border ${PAYMENT_STATUS_STYLE[ps]}`}>
                              {PAYMENT_STATUS_EMOJI[ps]} {PAYMENT_STATUS_LABEL[ps]}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border bg-muted/20 font-bold">
                      <td className="py-2.5 px-3 text-[11px]">TOTAL PIUTANG</td>
                      <td className="py-2.5 px-3 text-right font-mono text-[12px]">{fmtIDR(piutang.totalTagihan)}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-[12px] text-emerald-700">{fmtIDR(piutang.totalCair)}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-[12px] text-red-600">{fmtIDR(piutang.totalPiutang)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Footer note */}
      <div className="rounded-xl border bg-muted/30 p-3 text-[10.5px] text-muted-foreground leading-relaxed">
        <strong className="text-foreground">Catatan:</strong>{" "}
        Profit Bersih = Harga Jual − Modal − Fee Agen Penjual − Fee Pelaksana − Biaya Operasional VOA − Biaya Kurir.
        Semua fee dibaca dari data order masing-masing (bukan rate global) agar angka konsisten di semua halaman.
        Order EGP (visa Mesir) di-konversi ke IDR pakai kurs <span className="font-mono">1 EGP ≈ Rp {egpRate}</span>.
        Poin di-award otomatis: +10 poin saat order Completed; +20 poin bonus jika order via agen (total +30 poin dengan komisi).
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
