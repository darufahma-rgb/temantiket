import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Trophy, ChevronLeft, ChevronRight, TrendingUp, Share2,
  Users, BarChart3, Loader2, UserCheck, ShoppingBag, ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOrdersStore } from "@/store/ordersStore";
import { useClientsStore } from "@/store/clientsStore";
import { useAuthStore, type MemberInfo } from "@/store/authStore";
import {
  listAgentPoints, sumPointsByAgent, type AgentPoint,
} from "@/features/agentPoints/agentPointsRepo";
import { onAgentPointsChanged } from "@/lib/supabaseRealtime";
import { getTierInfo } from "@/features/agentPoints/agentTiers";
import type { AgentTier } from "@/features/agentPoints/agentTiers";
import { revenueIDR, fmtIDR, agentFeeFromMeta } from "@/lib/profit";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/* ── Types ──────────────────────────────────────────────────────── */
type RangeKey = "last_30_days" | "this_month" | "last_month" | "this_year" | "all";

const RANGE_LABEL: Record<RangeKey, string> = {
  last_30_days: "30 Hari Terakhir",
  this_month:   "Bulan Ini",
  last_month:   "Bulan Lalu",
  this_year:    "Tahun Ini",
  all:          "Sepanjang Masa",
};

type LeaderboardRow = {
  agentId:        string;
  name:           string;
  email:          string;
  photoUrl?:      string;
  isMe:           boolean;
  orders:         number;
  revenue:        number;
  commission:     number;
  periodPoints:   number;
  lifetimePoints: number;
  tier:           AgentTier;
  clientCount:    number;
};

/* ── Helpers ─────────────────────────────────────────────────────── */
function rangeBounds(key: RangeKey): { from: number; to: number } | null {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (key) {
    case "last_30_days": return { from: now.getTime() - 30 * 86_400_000, to: now.getTime() };
    case "this_month":   return { from: new Date(y, m, 1).getTime(),     to: new Date(y, m + 1, 1).getTime() };
    case "last_month":   return { from: new Date(y, m - 1, 1).getTime(), to: new Date(y, m, 1).getTime() };
    case "this_year":    return { from: new Date(y, 0, 1).getTime(),     to: new Date(y + 1, 0, 1).getTime() };
    default:             return null;
  }
}

function prevBounds(key: RangeKey): { from: number; to: number } | null {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (key) {
    case "last_30_days": {
      const to = now.getTime() - 30 * 86_400_000;
      return { from: to - 30 * 86_400_000, to };
    }
    case "this_month":  return { from: new Date(y, m - 1, 1).getTime(), to: new Date(y, m, 1).getTime() };
    case "last_month":  return { from: new Date(y, m - 2, 1).getTime(), to: new Date(y, m - 1, 1).getTime() };
    case "this_year":   return { from: new Date(y - 1, 0, 1).getTime(), to: new Date(y, 0, 1).getTime() };
    default:            return null;
  }
}

const AVATAR_COLORS = [
  "#6366f1","#8b5cf6","#ec4899","#14b8a6","#f59e0b",
  "#10b981","#3b82f6","#ef4444","#06b6d4","#84cc16",
];

function avatarBg(name: string): string {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)  return "baru saja";
  if (mins < 60) return `${mins} menit lalu`;
  const h = Math.floor(mins / 60);
  if (h < 24)    return `${h} jam lalu`;
  return `${Math.floor(h / 24)} hari lalu`;
}

function growthPct(curr: number, prev: number): number | null {
  if (prev <= 0) return null;
  return Math.round(((curr - prev) / prev) * 100);
}

const PAGE_SIZES = [10, 25, 50];

/* ── Component ───────────────────────────────────────────────────── */
export default function AgentLeaderboard() {
  const navigate    = useNavigate();
  const me          = useAuthStore((s) => s.user);
  const listMembers = useAuthStore((s) => s.listMembers);
  const { orders, fetchOrders, loaded: ordersLoaded } = useOrdersStore();
  const { clients, fetchClients } = useClientsStore();

  const [range,       setRange]       = useState<RangeKey>("last_30_days");
  const [members,     setMembers]     = useState<MemberInfo[]>([]);
  const [points,      setPoints]      = useState<AgentPoint[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize,    setPageSize]    = useState(10);

  const refreshPoints = useCallback(async () => {
    try { setPoints(await listAgentPoints()); }
    catch (e) { console.warn("[Leaderboard] refresh err:", e); }
  }, []);

  useEffect(() => {
    if (!ordersLoaded) void fetchOrders();
    void fetchClients();
    void (async () => {
      try {
        const [m, p] = await Promise.all([listMembers(), listAgentPoints()]);
        setMembers(m); setPoints(p);
      } catch (e) { console.warn("[Leaderboard] fetch err:", e); }
      finally { setLoading(false); }
    })();
    const unsub = onAgentPointsChanged(() => { void refreshPoints(); });
    return unsub;
  }, [ordersLoaded, fetchOrders, fetchClients, listMembers, refreshPoints]);

  useEffect(() => { setCurrentPage(1); }, [range, pageSize]);

  /* ── Derived data ──────────────────────────────────────────────── */
  const agentMembers = useMemo(() => members.filter((m) => m.role === "agent"), [members]);
  const memberById   = useMemo(() => new Map(members.map((m) => [m.userId, m])), [members]);
  const bounds       = useMemo(() => rangeBounds(range), [range]);
  const prevB        = useMemo(() => prevBounds(range), [range]);

  const clientCountByAgent = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of clients) {
      const aid = c.createdByAgent;
      if (aid) map.set(aid, (map.get(aid) ?? 0) + 1);
    }
    return map;
  }, [clients]);

  const filterOrders = useCallback((b: { from: number; to: number } | null) => {
    if (!b) return orders;
    return orders.filter((o) => {
      const t = new Date(o.createdAt).getTime();
      return t >= b.from && t < b.to;
    });
  }, [orders]);

  const periodOrders = useMemo(() => filterOrders(bounds), [filterOrders, bounds]);
  const prevOrders   = useMemo(() => filterOrders(prevB),  [filterOrders, prevB]);

  const periodPoints = useMemo(() => {
    if (!bounds) return points;
    return points.filter((p) => {
      const t = new Date(p.awardedAt).getTime();
      return t >= bounds.from && t < bounds.to;
    });
  }, [points, bounds]);

  function buildStats(ordArr: typeof orders) {
    const agentIds = new Set(agentMembers.map((a) => a.userId));
    const stats    = new Map<string, { revenue: number; orders: number; commission: number }>();
    for (const o of ordArr) {
      if (!o.createdByAgent || !agentIds.has(o.createdByAgent)) continue;
      const cur = stats.get(o.createdByAgent) ?? { revenue: 0, orders: 0, commission: 0 };
      cur.revenue += revenueIDR(o);
      cur.orders  += 1;
      if (o.status === "Completed") cur.commission += agentFeeFromMeta(o);
      stats.set(o.createdByAgent, cur);
    }
    for (const a of agentMembers) {
      if (!stats.has(a.userId)) stats.set(a.userId, { revenue: 0, orders: 0, commission: 0 });
    }
    return stats;
  }

  const rows = useMemo<LeaderboardRow[]>(() => {
    const lifetime = sumPointsByAgent(points);
    const periodic = sumPointsByAgent(periodPoints);
    const stats    = buildStats(periodOrders);
    return Array.from(stats.entries())
      .map(([agentId, v]) => {
        const member = memberById.get(agentId);
        return {
          agentId,
          name:           member?.displayName ?? `Agent ${agentId.slice(0, 6)}…`,
          email:          member?.email ?? "—",
          photoUrl:       member?.photoUrl,
          isMe:           agentId === me?.id,
          orders:         v.orders,
          revenue:        v.revenue,
          commission:     v.commission,
          periodPoints:   periodic.get(agentId) ?? 0,
          lifetimePoints: lifetime.get(agentId) ?? 0,
          tier:           getTierInfo(lifetime.get(agentId) ?? 0).current.key as AgentTier,
          clientCount:    clientCountByAgent.get(agentId) ?? 0,
        };
      })
      .sort((a, b) => {
        if (b.periodPoints   !== a.periodPoints)   return b.periodPoints   - a.periodPoints;
        if (b.orders         !== a.orders)         return b.orders         - a.orders;
        if (b.lifetimePoints !== a.lifetimePoints) return b.lifetimePoints - a.lifetimePoints;
        return a.name.localeCompare(b.name, "id");
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodOrders, periodPoints, points, agentMembers, memberById, me?.id, clientCountByAgent]);

  /* Previous period totals for growth */
  const prevTotals = useMemo(() => {
    const stats = buildStats(prevOrders);
    return {
      orders:  Array.from(stats.values()).reduce((s, v) => s + v.orders, 0),
      revenue: Array.from(stats.values()).reduce((s, v) => s + v.revenue, 0),
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prevOrders, agentMembers]);

  /* Summary stats */
  const totalOrders  = useMemo(() => rows.reduce((s, r) => s + r.orders, 0), [rows]);
  const totalRevenue = useMemo(() => rows.reduce((s, r) => s + r.revenue, 0), [rows]);
  const totalClients = useMemo(() => rows.reduce((s, r) => s + r.clientCount, 0), [rows]);
  const totalAgents  = agentMembers.length;
  const orderGrowth   = growthPct(totalOrders, prevTotals.orders);
  const revenueGrowth = growthPct(totalRevenue, prevTotals.revenue);

  /* Podium */
  const top3         = rows.slice(0, 3);
  const podiumOrder: (LeaderboardRow | null)[] = [top3[1] ?? null, top3[0] ?? null, top3[2] ?? null];
  const podiumRanks: (1 | 2 | 3)[]            = [2, 1, 3];

  /* Table pagination */
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const pagedRows  = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  /* Recent activities */
  const recentActivities = useMemo(() =>
    orders
      .filter((o) => o.createdByAgent)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 6)
      .map((o) => {
        const agent = memberById.get(o.createdByAgent!);
        return {
          agentId:   o.createdByAgent!,
          agentName: agent?.displayName ?? "Agen",
          orderId:   o.id?.toString().slice(0, 14) ?? "—",
          time:      o.createdAt,
        };
      }),
  [orders, memberById]);

  const isOwner = me?.role === "owner";
  const myRank  = useMemo(() => {
    const i = rows.findIndex((r) => r.agentId === me?.id);
    return i >= 0 ? i + 1 : null;
  }, [rows, me?.id]);

  /* ── Pagination helper ─────────────────────────────────────────── */
  function pageNums(): (number | "…")[] {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages: (number | "…")[] = [1];
    if (currentPage > 3)  pages.push("…");
    for (let p = Math.max(2, currentPage - 1); p <= Math.min(totalPages - 1, currentPage + 1); p++) pages.push(p);
    if (currentPage < totalPages - 2) pages.push("…");
    pages.push(totalPages);
    return pages;
  }

  /* ═══════════════════════════════════════════════════════════════
     RENDER
  ═══════════════════════════════════════════════════════════════ */
  return (
    <div className="max-w-[1400px] mx-auto p-4 md:p-6 space-y-6">

      {/* ── Page header ────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="h-14 w-14 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center shrink-0 shadow-sm">
            <Trophy className="h-7 w-7 text-amber-500" strokeWidth={1.8} />
          </div>
          <div>
            <h1 className="text-[26px] font-black text-slate-900 leading-tight tracking-tight">Leaderboard</h1>
            <p className="text-[13px] text-slate-500 mt-0.5">Peringkat agen berdasarkan performa dan pencapaian</p>
            {myRank && (
              <span className="inline-block mt-1.5 text-[11px] font-bold bg-amber-50 border border-amber-200 text-amber-700 px-2 py-0.5 rounded-full">
                🏆 Kamu #{myRank}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="relative">
            <select
              value={range}
              onChange={(e) => setRange(e.target.value as RangeKey)}
              className="h-9 pl-3 pr-8 rounded-lg text-[12.5px] font-semibold border border-slate-200 bg-white text-slate-700 outline-none focus:border-blue-400 cursor-pointer appearance-none shadow-sm"
            >
              {(Object.entries(RANGE_LABEL) as [RangeKey, string][]).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
          </div>

          <Button
            variant="outline"
            size="sm"
            className="h-9 rounded-lg border-slate-200 text-slate-600 gap-1.5 shadow-sm"
            onClick={() => {
              void navigator.clipboard.writeText(window.location.href);
              toast.success("Link disalin!");
            }}
          >
            <Share2 className="h-3.5 w-3.5" />
            Bagikan
          </Button>
        </div>
      </div>

      {/* ── Two-column layout ──────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-5 items-start">

        {/* ════════════════════════════════════════════════════════
            MAIN CONTENT
        ════════════════════════════════════════════════════════ */}
        <div className="space-y-5 min-w-0">

          {/* ── Podium ─────────────────────────────────────────── */}
          {loading ? (
            <div className="grid grid-cols-3 gap-3">
              {[180, 220, 180].map((h, i) => (
                <div key={i} className="bg-white rounded-2xl border border-slate-100 animate-pulse" style={{ height: h }} />
              ))}
            </div>
          ) : top3.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-100 py-16 flex items-center justify-center">
              <div className="text-center">
                <Trophy className="h-10 w-10 text-slate-200 mx-auto mb-2" />
                <p className="text-[13px] font-semibold text-slate-400">Belum ada mitra di periode ini</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3 items-end">
              {podiumOrder.map((row, idx) => (
                <PodiumCard
                  key={podiumRanks[idx]}
                  row={row}
                  rank={podiumRanks[idx]}
                  isMe={row?.agentId === me?.id}
                  elevated={podiumRanks[idx] === 1}
                  onView={() => row && navigate(row.isMe && !isOwner ? "/agent/profile" : `/agents/${row.agentId}`)}
                />
              ))}
            </div>
          )}

          {/* ── 4 Stat Cards ──────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Total Agen",    value: String(totalAgents),        growth: null,         icon: Users,       iconBg: "#dbeafe", iconColor: "#2563eb" },
              { label: "Total Order",   value: String(totalOrders),        growth: orderGrowth,  icon: ShoppingBag, iconBg: "#fef3c7", iconColor: "#d97706" },
              { label: "Total Klien",   value: String(totalClients),       growth: null,         icon: UserCheck,   iconBg: "#ede9fe", iconColor: "#7c3aed" },
              { label: "Total Revenue", value: fmtIDR(totalRevenue),       growth: revenueGrowth,icon: TrendingUp,  iconBg: "#dcfce7", iconColor: "#16a34a", small: true },
            ].map((s, i) => (
              <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex items-start gap-3">
                <div
                  className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: s.iconBg, color: s.iconColor }}
                >
                  <s.icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10.5px] font-semibold text-slate-500 uppercase tracking-wide leading-none">{s.label}</p>
                  <p className={cn("font-black text-slate-900 leading-tight mt-1 tabular-nums", s.small ? "text-[16px]" : "text-[22px]")}>
                    {s.value}
                  </p>
                  {s.growth !== null && s.growth !== undefined ? (
                    <p className="text-[10px] text-emerald-600 mt-1 flex items-center gap-0.5 font-semibold">
                      <TrendingUp className="h-3 w-3" />
                      ↑ {s.growth}% dari periode lalu
                    </p>
                  ) : (
                    <p className="text-[10px] text-slate-400 mt-1">dari periode lalu</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* ── Peringkat Agen table ───────────────────────────── */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="text-[15px] font-extrabold text-slate-900">Peringkat Agen</h2>
            </div>

            {loading ? (
              <div className="py-16 text-center">
                <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-slate-300" />
                <p className="text-[12px] text-slate-400">Memuat data…</p>
              </div>
            ) : rows.length === 0 ? (
              <div className="py-16 text-center">
                <Trophy className="h-10 w-10 mx-auto mb-3 text-slate-200" />
                <p className="text-[13px] font-semibold text-slate-400">Belum ada data untuk periode ini</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px]">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/70">
                        <th className="pl-5 pr-2 py-3 text-left text-[10.5px] font-bold uppercase tracking-wider text-slate-400 w-12">#</th>
                        <th className="px-3 py-3 text-left text-[10.5px] font-bold uppercase tracking-wider text-slate-400">Agen</th>
                        <th className="px-3 py-3 text-left text-[10.5px] font-bold uppercase tracking-wider text-slate-400">Level</th>
                        <th className="px-3 py-3 text-right text-[10.5px] font-bold uppercase tracking-wider text-slate-400">Total Point</th>
                        <th className="px-3 py-3 text-right text-[10.5px] font-bold uppercase tracking-wider text-slate-400">Order</th>
                        <th className="px-3 py-3 text-right text-[10.5px] font-bold uppercase tracking-wider text-slate-400">Klien</th>
                        <th className="px-3 py-3 text-right text-[10.5px] font-bold uppercase tracking-wider text-slate-400">Revenue</th>
                        <th className="px-3 pr-5 py-3 text-center text-[10.5px] font-bold uppercase tracking-wider text-slate-400">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {pagedRows.map((row, idx) => {
                        const rank     = (currentPage - 1) * pageSize + idx + 1;
                        const tierInfo = getTierInfo(row.lifetimePoints).current;
                        return (
                          <tr
                            key={row.agentId}
                            className={cn(
                              "transition-colors",
                              row.isMe ? "bg-amber-50/40" : "hover:bg-slate-50/70",
                            )}
                          >
                            {/* # */}
                            <td className="pl-5 pr-2 py-3.5">
                              {rank === 1 ? (
                                <span className="text-[18px] leading-none">🏆</span>
                              ) : rank === 2 ? (
                                <span className="text-[18px] leading-none">🥈</span>
                              ) : rank === 3 ? (
                                <span className="text-[18px] leading-none">🥉</span>
                              ) : (
                                <span className="text-[12px] font-bold text-slate-400 tabular-nums">{rank}</span>
                              )}
                            </td>

                            {/* Agen */}
                            <td className="px-3 py-3">
                              <div className="flex items-center gap-2.5">
                                <div
                                  className="h-9 w-9 rounded-full flex items-center justify-center text-white text-[13px] font-extrabold shrink-0 overflow-hidden"
                                  style={{ background: row.photoUrl ? "transparent" : avatarBg(row.name) }}
                                >
                                  {row.photoUrl
                                    ? <img src={row.photoUrl} alt={row.name} className="h-full w-full object-cover" />
                                    : row.name.charAt(0).toUpperCase()
                                  }
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[13px] font-bold text-slate-900 truncate max-w-[160px] leading-tight">
                                      {row.name}
                                    </span>
                                    {row.isMe && (
                                      <span className="text-[9px] font-black uppercase bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full shrink-0">
                                        Saya
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[10.5px] text-slate-400 truncate max-w-[160px]">{row.email}</p>
                                </div>
                              </div>
                            </td>

                            {/* Level */}
                            <td className="px-3 py-3">
                              <span className={cn(
                                "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10.5px] font-bold whitespace-nowrap",
                                tierInfo.softBg, tierInfo.softText,
                              )}>
                                {tierInfo.emoji} {tierInfo.label}
                              </span>
                            </td>

                            {/* Total Point */}
                            <td className="px-3 py-3 text-right">
                              <span className="font-bold text-[13px] text-slate-800 tabular-nums">
                                {row.periodPoints.toLocaleString("id-ID")}
                              </span>
                              <span className="text-[10px] text-slate-400 ml-1">pts</span>
                            </td>

                            {/* Order */}
                            <td className="px-3 py-3 text-right font-bold text-[13px] text-slate-800 tabular-nums">
                              {row.orders}
                            </td>

                            {/* Klien */}
                            <td className="px-3 py-3 text-right font-bold text-[13px] text-slate-800 tabular-nums">
                              {row.clientCount}
                            </td>

                            {/* Revenue */}
                            <td className="px-3 py-3 text-right font-mono font-bold text-[12px] text-slate-800 tabular-nums">
                              {fmtIDR(row.revenue)}
                            </td>

                            {/* Aksi */}
                            <td className="px-3 pr-5 py-3">
                              <div className="flex items-center justify-center gap-1.5">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 px-2.5 text-[11.5px] border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-600 rounded-lg"
                                  onClick={() => navigate(row.isMe && !isOwner ? "/agent/profile" : `/agents/${row.agentId}`)}
                                >
                                  Profil
                                </Button>
                                <button
                                  className="h-7 w-7 rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 hover:text-blue-600 hover:border-blue-300 transition-colors"
                                  onClick={() => navigate(`/agents/${row.agentId}`)}
                                >
                                  <BarChart3 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                <div className="px-5 py-3.5 border-t border-slate-100 flex items-center justify-between flex-wrap gap-3 bg-slate-50/40">
                  <p className="text-[11.5px] text-slate-500">
                    Menampilkan{" "}
                    <span className="font-semibold text-slate-700">
                      {((currentPage - 1) * pageSize) + 1}–{Math.min(currentPage * pageSize, rows.length)}
                    </span>{" "}
                    dari <span className="font-semibold text-slate-700">{rows.length}</span> agen
                  </p>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="h-8 w-8 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-500 hover:text-slate-700 hover:border-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>

                    {pageNums().map((p, i) =>
                      p === "…" ? (
                        <span key={`ell-${i}`} className="text-slate-400 text-[12px] w-6 text-center">…</span>
                      ) : (
                        <button
                          key={p}
                          onClick={() => setCurrentPage(p as number)}
                          className={cn(
                            "h-8 w-8 rounded-lg text-[12px] font-semibold transition-colors",
                            p === currentPage
                              ? "bg-blue-600 text-white border border-blue-600"
                              : "border border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-600",
                          )}
                        >
                          {p}
                        </button>
                      )
                    )}

                    <button
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="h-8 w-8 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-500 hover:text-slate-700 hover:border-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>

                    <div className="relative ml-1">
                      <select
                        value={pageSize}
                        onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                        className="h-8 pl-2.5 pr-7 rounded-lg border border-slate-200 bg-white text-[11.5px] font-medium text-slate-600 outline-none cursor-pointer appearance-none hover:border-slate-300"
                      >
                        {PAGE_SIZES.map((s) => (
                          <option key={s} value={s}>{s} / halaman</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ════════════════════════════════════════════════════════
            RIGHT SIDEBAR
        ════════════════════════════════════════════════════════ */}
        <div className="space-y-4 xl:sticky xl:top-6">

          {/* Aktivitas Terbaru */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3.5 border-b border-slate-100">
              <h3 className="text-[13.5px] font-extrabold text-slate-900">Aktivitas Terbaru</h3>
            </div>

            {recentActivities.length === 0 ? (
              <div className="px-4 py-6 text-center text-[12px] text-slate-400">
                Belum ada aktivitas
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {recentActivities.map((act, i) => (
                  <div key={i} className="px-4 py-3 flex items-start gap-2.5">
                    <div
                      className="h-8 w-8 rounded-full flex items-center justify-center text-white text-[12px] font-bold shrink-0"
                      style={{ background: avatarBg(act.agentName) }}
                    >
                      {act.agentName.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-bold text-slate-800 leading-tight truncate">{act.agentName}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-tight">
                        Menyelesaikan order{" "}
                        <span className="font-semibold text-slate-700">{act.orderId}</span>
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{timeAgo(act.time)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="px-4 py-3 border-t border-slate-100">
              <button
                onClick={() => navigate("/agent-center")}
                className="w-full h-8 rounded-lg border border-slate-200 text-[12px] font-semibold text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors"
              >
                Lihat Semua Aktivitas
              </button>
            </div>
          </div>

          {/* Cara Mendapat Poin */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3.5 border-b border-slate-100">
              <h3 className="text-[13.5px] font-extrabold text-slate-900">Cara Mendapat Poin</h3>
            </div>

            <div className="p-4 space-y-3">
              {[
                { icon: "🏆", label: "Closing Order",             pts: "10 poin",        ptsBg: "#dcfce7", ptsColor: "#15803d" },
                { icon: "🛵", label: "Tugas Kurir / Agt. Lapangan", pts: "5 poin",        ptsBg: "#dbeafe", ptsColor: "#1d4ed8" },
                { icon: "✅", label: "Selesaikan Misi",            pts: "1 poin",         ptsBg: "#fef3c7", ptsColor: "#92400e" },
                { icon: "🎯", label: "Misi Event (Khusus)",        pts: "Sesuai misi",    ptsBg: "#ede9fe", ptsColor: "#6d28d9" },
              ].map((item, i) => (
                <div key={i} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className="h-8 w-8 rounded-lg flex items-center justify-center text-[15px] shrink-0"
                      style={{ backgroundColor: item.ptsBg }}
                    >
                      {item.icon}
                    </div>
                    <span className="text-[12px] font-semibold text-slate-700 truncate">{item.label}</span>
                  </div>
                  <span
                    className="text-[11px] font-bold shrink-0 px-2 py-0.5 rounded-md"
                    style={{ backgroundColor: item.ptsBg, color: item.ptsColor }}
                  >
                    {item.pts}
                  </span>
                </div>
              ))}
            </div>

            <div className="px-4 pb-4">
              <button
                onClick={() => navigate("/agent-center?tab=ketentuan")}
                className="w-full h-8 rounded-lg border border-slate-200 text-[12px] font-semibold text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors"
              >
                Lihat Detail Sistem Poin
              </button>
            </div>
          </div>

          {/* Jadilah yang Terbaik! */}
          <div className="bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 rounded-xl border border-amber-100 shadow-sm p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-[13.5px] font-extrabold text-amber-900">Jadilah yang Terbaik!</h3>
                <p className="text-[11.5px] text-amber-700/80 mt-1.5 leading-relaxed">
                  Tingkatkan performa dan raih posisi teratas untuk mendapatkan reward menarik setiap bulannya.
                </p>
              </div>
              <div className="text-[38px] leading-none shrink-0 mt-1">🏆</div>
            </div>
            <button
              onClick={() => navigate("/agent-center?tab=ketentuan")}
              className="mt-3.5 w-full h-9 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-[12.5px] font-bold transition-colors shadow-sm"
            >
              Lihat Hadiah
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   PodiumCard
═══════════════════════════════════════════════════════════════ */
function PodiumCard({
  row, rank, isMe, elevated, onView,
}: {
  row:      LeaderboardRow | null;
  rank:     1 | 2 | 3;
  isMe:     boolean;
  elevated: boolean;
  onView:   () => void;
}) {
  const tierInfo = row ? getTierInfo(row.lifetimePoints).current : null;

  if (!row) {
    return (
      <div
        className={cn(
          "bg-white rounded-2xl border-2 border-dashed border-slate-100 flex items-center justify-center text-[12px] text-slate-300 font-semibold",
          elevated ? "min-h-[240px]" : "min-h-[200px]",
        )}
      >
        #{rank}
      </div>
    );
  }

  const cfg = {
    1: { cardBg: "from-amber-50/80 to-white", border: "border-amber-200", ptColor: "text-amber-600", rankBg: "bg-amber-100 text-amber-700" },
    2: { cardBg: "from-slate-50 to-white",    border: "border-slate-200", ptColor: "text-slate-700", rankBg: "bg-slate-100 text-slate-600" },
    3: { cardBg: "from-orange-50 to-white",   border: "border-orange-200",ptColor: "text-orange-600",rankBg: "bg-orange-100 text-orange-600" },
  }[rank];

  return (
    <div
      className={cn(
        "bg-gradient-to-b rounded-2xl border flex flex-col overflow-hidden cursor-pointer",
        "transition-all duration-200 hover:shadow-md",
        cfg.cardBg, cfg.border,
        elevated ? "shadow-md" : "shadow-sm",
      )}
      onClick={onView}
    >
      {/* Top: rank badge + crown */}
      <div className="flex items-center justify-between px-3.5 pt-3.5 pb-1">
        <span className={cn("h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-black", cfg.rankBg)}>
          {rank}
        </span>
        {rank === 1 && <span className="text-[18px] leading-none">👑</span>}
      </div>

      {/* Avatar */}
      <div className="flex flex-col items-center px-3.5 pb-3 pt-1">
        <div
          className={cn(
            "rounded-full flex items-center justify-center text-white font-extrabold shadow overflow-hidden",
            elevated ? "h-[60px] w-[60px] text-[22px]" : "h-[44px] w-[44px] text-[16px]",
          )}
          style={{ background: row.photoUrl ? "transparent" : avatarBg(row.name) }}
        >
          {row.photoUrl
            ? <img src={row.photoUrl} alt={row.name} className="h-full w-full object-cover" />
            : row.name.charAt(0).toUpperCase()
          }
        </div>

        <p className={cn(
          "font-bold text-slate-900 text-center truncate w-full mt-2 leading-tight px-1",
          elevated ? "text-[13px]" : "text-[11.5px]",
        )}>
          {row.name}
        </p>

        {isMe && (
          <span className="mt-1 text-[9px] font-black uppercase tracking-wide bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
            Saya
          </span>
        )}

        {tierInfo && (
          <span className={cn(
            "mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold",
            tierInfo.softBg, tierInfo.softText,
          )}>
            {tierInfo.emoji} {tierInfo.label}
          </span>
        )}
      </div>

      {/* Points */}
      <div className="mx-3 mb-2.5 py-2 px-2 rounded-xl bg-white/70 border border-white/90 text-center">
        <span className={cn("font-black font-mono leading-none", cfg.ptColor, elevated ? "text-[26px]" : "text-[20px]")}>
          {row.periodPoints.toLocaleString("id-ID")}
        </span>
        <span className="text-[11px] text-slate-400 ml-1 font-semibold">pts</span>
      </div>

      {/* Stats row */}
      <div className="mx-3 mb-3 grid grid-cols-3 gap-1 text-center">
        {[
          { label: "Order",   val: String(row.orders) },
          { label: "Klien",   val: String(row.clientCount) },
          { label: "Revenue", val: fmtIDR(row.revenue) },
        ].map((s) => (
          <div key={s.label} className="bg-white/60 rounded-lg py-1.5 px-1 border border-white/80">
            <p className="text-[8px] text-slate-400 font-semibold uppercase tracking-wide leading-none">{s.label}</p>
            <p className="text-[10px] font-bold text-slate-700 font-mono leading-tight mt-0.5 truncate">{s.val}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
