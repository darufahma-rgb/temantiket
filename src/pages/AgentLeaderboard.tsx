import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  Trophy, ChevronLeft, Sparkles, Calendar, Star,
  TrendingUp, Flame, ChevronRight, Crown,
  Search, SlidersHorizontal, Users, Wallet,
  UserPlus, BarChart3, Settings2, History,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useOrdersStore } from "@/store/ordersStore";
import { useAuthStore, type MemberInfo } from "@/store/authStore";
import {
  listAgentPoints, sumPointsByAgent, type AgentPoint,
} from "@/features/agentPoints/agentPointsRepo";
import { onAgentPointsChanged } from "@/lib/supabaseRealtime";
import { getTierInfo } from "@/features/agentPoints/agentTiers";
import { AgentTierBadge } from "@/components/AgentTierProgress";
import type { AgentTier } from "@/features/agentPoints/agentTiers";
import { revenueIDR, fmtIDR, agentFeeFromMeta } from "@/lib/profit";
import { cn } from "@/lib/utils";

type RangeKey = "this_month" | "last_month" | "this_year" | "all";

const RANGE_LABEL: Record<RangeKey, string> = {
  this_month: "Bulan Ini",
  last_month: "Bulan Lalu",
  this_year:  "Tahun Ini",
  all:        "Sepanjang Masa",
};

function rangeBounds(key: RangeKey): { from: number; to: number } | null {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (key) {
    case "this_month":  return { from: new Date(y, m, 1).getTime(),     to: new Date(y, m + 1, 1).getTime() };
    case "last_month":  return { from: new Date(y, m - 1, 1).getTime(), to: new Date(y, m, 1).getTime() };
    case "this_year":   return { from: new Date(y, 0, 1).getTime(),     to: new Date(y + 1, 0, 1).getTime() };
    default:            return null;
  }
}

function avatarGradient(name: string): string {
  const gradients = [
    "from-violet-500 to-purple-700",
    "from-sky-500 to-blue-700",
    "from-emerald-500 to-green-700",
    "from-rose-500 to-pink-700",
    "from-fuchsia-500 to-purple-700",
    "from-teal-500 to-cyan-700",
    "from-indigo-500 to-indigo-700",
    "from-orange-500 to-red-700",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff;
  return gradients[Math.abs(hash) % gradients.length];
}

const PODIUM_CFG = {
  1: {
    border:      "border-amber-200",
    bg:          "bg-gradient-to-b from-amber-50 to-white",
    accentColor: "text-amber-600",
    pillBg:      "bg-amber-50 border border-amber-200",
    pillText:    "text-amber-700",
    avatarRing:  "ring-2 ring-amber-300",
    shadow:      "shadow-amber-100",
    crown:       true,
  },
  2: {
    border:      "border-slate-200",
    bg:          "bg-gradient-to-b from-slate-50 to-white",
    accentColor: "text-slate-500",
    pillBg:      "bg-slate-50 border border-slate-200",
    pillText:    "text-slate-600",
    avatarRing:  "ring-2 ring-slate-200",
    shadow:      "shadow-slate-100",
    crown:       false,
  },
  3: {
    border:      "border-orange-200",
    bg:          "bg-gradient-to-b from-orange-50 to-white",
    accentColor: "text-orange-500",
    pillBg:      "bg-orange-50 border border-orange-200",
    pillText:    "text-orange-700",
    avatarRing:  "ring-2 ring-orange-200",
    shadow:      "shadow-orange-100",
    crown:       false,
  },
} as const;

const RANK_MEDAL = ["🥇", "🥈", "🥉"];

type LeaderboardRow = {
  agentId:        string;
  name:           string;
  isMe:           boolean;
  orders:         number;
  revenue:        number;
  commission:     number;
  periodPoints:   number;
  lifetimePoints: number;
  tier:           AgentTier;
};

type MobileTab = "all" | "poin" | "komisi" | "closing" | "performa";
const MOBILE_TABS: { key: MobileTab; label: string }[] = [
  { key: "all",      label: "Semua" },
  { key: "poin",     label: "Top Poin" },
  { key: "komisi",   label: "Top Komisi" },
  { key: "closing",  label: "Top Closing" },
  { key: "performa", label: "Top Performa" },
];

const PAGE_SIZE = 8;

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: (i = 0) => ({
    opacity: 1, y: 0,
    transition: { duration: 0.38, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

function fmtCompact(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(0) + "K";
  return String(n);
}

export default function AgentLeaderboard() {
  const navigate    = useNavigate();
  const me          = useAuthStore((s) => s.user);
  const listMembers = useAuthStore((s) => s.listMembers);
  const { orders, fetchOrders, loaded: ordersLoaded } = useOrdersStore();

  const [range,        setRange]        = useState<RangeKey>("this_month");
  const [members,      setMembers]      = useState<MemberInfo[]>([]);
  const [points,       setPoints]       = useState<AgentPoint[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [scrolled,     setScrolled]     = useState(false);

  // Mobile-specific state
  const [mobileSearch, setMobileSearch] = useState("");
  const [mobileTab,    setMobileTab]    = useState<MobileTab>("all");
  const [mobilePage,   setMobilePage]   = useState(1);

  const refreshPoints = useCallback(async () => {
    try { setPoints(await listAgentPoints()); }
    catch (e) { console.warn("[Leaderboard] refresh err:", e); }
  }, []);

  useEffect(() => {
    if (!ordersLoaded) void fetchOrders();
    void (async () => {
      try {
        const [m, p] = await Promise.all([listMembers(), listAgentPoints()]);
        setMembers(m); setPoints(p);
      } catch (e) { console.warn("[Leaderboard] fetch err:", e); }
      finally { setLoading(false); }
    })();
    const unsub = onAgentPointsChanged(() => { void refreshPoints(); });
    return unsub;
  }, [ordersLoaded, fetchOrders, listMembers, refreshPoints]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 6);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const agentMembers = useMemo(() => members.filter((m) => m.role === "agent"), [members]);
  const memberById   = useMemo(() => new Map(members.map((m) => [m.userId, m])), [members]);
  const bounds       = useMemo(() => rangeBounds(range), [range]);

  const periodOrders = useMemo(() => {
    if (!bounds) return orders;
    return orders.filter((o) => {
      const t = new Date(o.createdAt).getTime();
      return t >= bounds.from && t < bounds.to;
    });
  }, [orders, bounds]);

  const periodPoints = useMemo(() => {
    if (!bounds) return points;
    return points.filter((p) => {
      const t = new Date(p.awardedAt).getTime();
      return t >= bounds.from && t < bounds.to;
    });
  }, [points, bounds]);

  const rows = useMemo<LeaderboardRow[]>(() => {
    const lifetime = sumPointsByAgent(points);
    const periodic = sumPointsByAgent(periodPoints);
    const agentIds = new Set(agentMembers.map((a) => a.userId));
    const stats    = new Map<string, { revenue: number; orders: number; commission: number }>();

    for (const o of periodOrders) {
      if (!o.createdByAgent || !agentIds.has(o.createdByAgent)) continue;
      const cur = stats.get(o.createdByAgent) ?? { revenue: 0, orders: 0, commission: 0 };
      cur.revenue += revenueIDR(o);
      cur.orders  += 1;
      if (o.status === "Completed") cur.commission += agentFeeFromMeta(o);
      stats.set(o.createdByAgent, cur);
    }
    for (const o of periodOrders) {
      if (o.status !== "Completed") continue;
      const meta = (o.metadata ?? {}) as Record<string, unknown>;

      if (o.type === "visa_voa") {
        const fieldAgentId = meta.voaFieldAgentId as string | undefined;
        if (fieldAgentId && agentIds.has(fieldAgentId)) {
          const voaFee = Number(meta.voaAgentFee ?? 0);
          if (voaFee > 0) {
            const cur = stats.get(fieldAgentId) ?? { revenue: 0, orders: 0, commission: 0 };
            cur.commission += voaFee;
            stats.set(fieldAgentId, cur);
          }
        }
      }

      if (o.type === "visa_student") {
        const pelaksanaId = meta.pelaksanaId as string | undefined;
        if (pelaksanaId && agentIds.has(pelaksanaId)) {
          const pelFee = Number(meta.pelaksanaFee ?? 200_000);
          if (pelFee > 0) {
            const cur = stats.get(pelaksanaId) ?? { revenue: 0, orders: 0, commission: 0 };
            cur.commission += pelFee;
            stats.set(pelaksanaId, cur);
          }
        }
      }

      const kurirAgentId = meta.kurirAgentId as string | undefined;
      if (kurirAgentId && agentIds.has(kurirAgentId)) {
        const kurirFee = Number(meta.kurirFee ?? 0);
        if (kurirFee > 0) {
          const cur = stats.get(kurirAgentId) ?? { revenue: 0, orders: 0, commission: 0 };
          cur.commission += kurirFee;
          stats.set(kurirAgentId, cur);
        }
      }
    }
    for (const a of agentMembers) {
      if (!stats.has(a.userId)) stats.set(a.userId, { revenue: 0, orders: 0, commission: 0 });
    }

    return Array.from(stats.entries())
      .map(([agentId, v]) => {
        const member = memberById.get(agentId);
        return {
          agentId,
          name:           member?.displayName ?? `Agent ${agentId.slice(0, 6)}…`,
          isMe:           agentId === me?.id,
          orders:         v.orders,
          revenue:        v.revenue,
          commission:     v.commission,
          periodPoints:   periodic.get(agentId) ?? 0,
          lifetimePoints: lifetime.get(agentId) ?? 0,
          tier:           getTierInfo(lifetime.get(agentId) ?? 0).current.key as AgentTier,
        };
      })
      .sort((a, b) => {
        if (b.periodPoints    !== a.periodPoints)    return b.periodPoints    - a.periodPoints;
        if (b.orders          !== a.orders)          return b.orders          - a.orders;
        if (b.lifetimePoints  !== a.lifetimePoints)  return b.lifetimePoints  - a.lifetimePoints;
        return a.name.localeCompare(b.name, "id");
      });
  }, [periodOrders, periodPoints, points, agentMembers, memberById, me?.id]);

  const myRank     = useMemo(() => { const i = rows.findIndex((r) => r.agentId === me?.id); return i >= 0 ? i + 1 : null; }, [rows, me?.id]);
  const mostActive = useMemo(() => [...rows].sort((a, b) => b.orders      - a.orders)[0]      ?? null, [rows]);
  const topKomisi  = useMemo(() => [...rows].sort((a, b) => b.commission  - a.commission)[0]  ?? null, [rows]);
  const topPoin    = useMemo(() => rows[0] ?? null, [rows]);

  const top3   = rows.slice(0, 3);
  const podium: (LeaderboardRow | null)[] = [top3[1] ?? null, top3[0] ?? null, top3[2] ?? null];
  const podiumRanks: (1 | 2 | 3)[]       = [2, 1, 3];

  // ── Mobile computed ────────────────────────────────────────────────────────
  const isOwner = me?.role === "owner";

  const totalPeriodPoints = useMemo(() => rows.reduce((s, r) => s + r.periodPoints, 0), [rows]);
  const totalCommission   = useMemo(() => rows.reduce((s, r) => s + r.commission, 0), [rows]);
  const activeAgents      = useMemo(() => rows.filter((r) => r.orders > 0).length, [rows]);

  const mobileTabRows = useMemo<LeaderboardRow[]>(() => {
    switch (mobileTab) {
      case "poin":     return [...rows].sort((a, b) => b.periodPoints   - a.periodPoints);
      case "komisi":   return [...rows].sort((a, b) => b.commission     - a.commission);
      case "closing":  return [...rows].sort((a, b) => b.orders         - a.orders);
      case "performa": return [...rows].sort((a, b) => b.lifetimePoints - a.lifetimePoints);
      default:         return rows;
    }
  }, [rows, mobileTab]);

  const searchedMobileRows = useMemo(() => {
    if (!mobileSearch.trim()) return mobileTabRows;
    const q = mobileSearch.toLowerCase();
    return mobileTabRows.filter((r) => {
      const member = memberById.get(r.agentId);
      return (
        r.name.toLowerCase().includes(q) ||
        (member?.email ?? "").toLowerCase().includes(q)
      );
    });
  }, [mobileTabRows, mobileSearch, memberById]);

  const totalMobilePages = Math.max(1, Math.ceil(searchedMobileRows.length / PAGE_SIZE));
  const paginatedMobileRows = useMemo(
    () => searchedMobileRows.slice((mobilePage - 1) * PAGE_SIZE, mobilePage * PAGE_SIZE),
    [searchedMobileRows, mobilePage],
  );

  // Reset page when search/tab changes
  useEffect(() => { setMobilePage(1); }, [mobileSearch, mobileTab, range]);

  return (
    <div className="min-h-screen bg-slate-50">

      {/* ══════════════════════════════════════════════════════════════
          DESKTOP LAYOUT  (hidden on mobile)
      ══════════════════════════════════════════════════════════════ */}

      {/* ── Sticky header (desktop only) ── */}
      <header
        className={cn(
          "hidden md:flex sticky top-0 z-20 bg-white/90 backdrop-blur-md transition-all duration-200",
          scrolled ? "shadow-md" : "border-b border-slate-100",
        )}
      >
        <div className="flex items-center gap-3 px-4 py-3 max-w-[1400px] mx-auto w-full">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/agent")}
            className="h-8 w-8 p-0 shrink-0 text-slate-500 hover:text-slate-800"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <Trophy className="h-4 w-4 text-amber-500 shrink-0" />
              <h1 className="text-[15px] font-black text-slate-900 tracking-[-0.02em] leading-none">
                Leaderboard Mitra
              </h1>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5 leading-none">
              {RANGE_LABEL[range]}
              {myRank && (
                <> · <span className="font-semibold text-amber-600">Kamu #{myRank}</span></>
              )}
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <Calendar className="h-3.5 w-3.5 text-slate-400" />
            <Select value={range} onValueChange={(v) => setRange(v as RangeKey)}>
              <SelectTrigger className="h-8 w-[130px] text-[12px] border-slate-200 rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(RANGE_LABEL) as RangeKey[]).map((k) => (
                  <SelectItem key={k} value={k} className="text-[12px]">
                    {RANGE_LABEL[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </header>

      {/* ── Desktop content ── */}
      <div className="hidden md:block max-w-[1400px] mx-auto px-4 pb-16 space-y-5 pt-5">

        {/* Podium */}
        {loading ? (
          <PodiumSkeleton />
        ) : top3.length > 0 ? (
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden"
          >
            <div className="flex items-center justify-between px-5 pt-5 pb-4">
              <div>
                <h2 className="text-[13px] font-black text-slate-900 tracking-[-0.02em] flex items-center gap-1.5">
                  <Crown className="h-4 w-4 text-amber-500" />
                  Top 3 Champions
                </h2>
                <p className="text-[11px] text-slate-400 mt-0.5">{RANGE_LABEL[range]}</p>
              </div>
              {myRank && myRank <= 3 && (
                <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700">
                  🏆 Kamu #{myRank}
                </span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2 sm:gap-4 px-3 pb-5 items-end">
              {podium.map((row, idx) => (
                <PodiumCard
                  key={podiumRanks[idx]}
                  row={row}
                  rank={podiumRanks[idx]}
                  isMe={row?.agentId === me?.id}
                  elevated={podiumRanks[idx] === 1}
                  onProfile={() => navigate("/agent/profile")}
                />
              ))}
            </div>
          </motion.section>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm py-14 flex items-center justify-center">
            <div className="text-center">
              <Trophy className="h-8 w-8 text-slate-200 mx-auto mb-2" />
              <p className="text-[12.5px] text-slate-400">Belum ada mitra di periode ini</p>
            </div>
          </div>
        )}

        {/* Insight mini cards */}
        {!loading && rows.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {mostActive && (
              <InsightCard
                icon={<Flame className="h-4 w-4 text-amber-500" />}
                iconBg="bg-amber-50"
                label="Most Active"
                sub="Terbanyak order"
                name={mostActive.name}
                value={`${mostActive.orders} order`}
                valueColor="text-amber-600"
                isMe={mostActive.isMe}
                delay={0}
              />
            )}
            {topKomisi && (
              <InsightCard
                icon={<span className="text-[15px] leading-none">💰</span>}
                iconBg="bg-emerald-50"
                label="Top Komisi"
                sub="Komisi sales tertinggi"
                name={topKomisi.name}
                value={topKomisi.isMe ? fmtIDR(topKomisi.commission) : "🔒 Private"}
                valueColor="text-emerald-600"
                isMe={topKomisi.isMe}
                delay={0.05}
              />
            )}
            {topPoin && (
              <InsightCard
                icon={<Star className="h-4 w-4 text-violet-500" />}
                iconBg="bg-violet-50"
                label="Top Poin"
                sub={`Poin ${RANGE_LABEL[range].toLowerCase()}`}
                name={topPoin.name}
                value={`${topPoin.periodPoints} poin`}
                valueColor="text-violet-600"
                isMe={topPoin.isMe}
                delay={0.1}
              />
            )}
          </div>
        )}

        {/* Full ranking */}
        {!loading && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.1 }}
            className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-blue-50 flex items-center justify-center">
                  <Sparkles className="h-3.5 w-3.5 text-blue-500" />
                </div>
                <div>
                  <p className="text-[13px] font-bold text-slate-800">Full Ranking</p>
                  <p className="text-[11px] text-slate-400">
                    {rows.length} mitra · {RANGE_LABEL[range]}
                  </p>
                </div>
              </div>
              {myRank && (
                <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-blue-50 text-blue-600 border border-blue-100">
                  Kamu #{myRank}
                </span>
              )}
            </div>

            {rows.length === 0 ? (
              <div className="py-14 text-center">
                <Trophy className="h-8 w-8 mx-auto text-slate-200 mb-2" />
                <p className="text-[12.5px] font-medium text-slate-400">Belum ada mitra terdaftar</p>
              </div>
            ) : (
              <AnimatePresence mode="wait">
                <div className="divide-y divide-slate-50">
                  {rows.map((r, i) => {
                    const rank   = i + 1;
                    const isTop3 = rank <= 3;
                    return (
                      <motion.div
                        key={r.agentId}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.2, delay: Math.min(i * 0.03, 0.4) }}
                        className={cn(
                          "flex items-center gap-3 px-4 py-3 transition-colors",
                          r.isMe
                            ? "bg-amber-50/60 border-l-[3px] border-amber-400"
                            : "hover:bg-slate-50/80",
                        )}
                      >
                        <div className={cn(
                          "h-7 w-7 rounded-lg flex items-center justify-center shrink-0 text-[11px] font-extrabold leading-none",
                          isTop3
                            ? rank === 1 ? "bg-amber-50 text-amber-600 border border-amber-200"
                              : rank === 2 ? "bg-slate-100 text-slate-500 border border-slate-200"
                              : "bg-orange-50 text-orange-500 border border-orange-200"
                            : "bg-slate-50 text-slate-400 border border-slate-100 font-mono text-[10px]",
                        )}>
                          {isTop3 ? RANK_MEDAL[rank - 1] : rank}
                        </div>

                        <div className={cn(
                          "h-9 w-9 rounded-full bg-gradient-to-br flex items-center justify-center",
                          "text-white font-extrabold text-[13px] shrink-0 ring-2 ring-white shadow-sm",
                          avatarGradient(r.name),
                        )}>
                          {r.name.charAt(0).toUpperCase()}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className={cn(
                              "text-[13px] font-semibold truncate",
                              r.isMe ? "text-amber-800" : "text-slate-800",
                            )}>
                              {r.name}
                            </span>
                            {r.isMe && (
                              <span className="text-[10px] font-bold uppercase tracking-wide bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full shrink-0">
                                Kamu
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <AgentTierBadge tier={r.tier} size="xs" />
                            <span className="text-[10px] text-slate-400">{r.orders} order</span>
                          </div>
                        </div>

                        <div className="hidden sm:flex items-center gap-5 shrink-0">
                          <div className="text-right">
                            <div className="text-[10px] text-slate-400 font-medium">Poin</div>
                            <div className="text-[13px] font-extrabold text-blue-600 font-mono">{r.periodPoints}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-[10px] text-slate-400 font-medium">Lifetime</div>
                            <div className="text-[13px] font-extrabold text-amber-600 font-mono">{r.lifetimePoints}</div>
                          </div>
                          {r.isMe && (
                            <div className="text-right">
                              <div className="text-[10px] text-slate-400 font-medium">Komisi</div>
                              <div className="text-[12px] font-bold text-emerald-600 font-mono">{fmtIDR(r.commission)}</div>
                            </div>
                          )}
                        </div>

                        <div className="flex sm:hidden flex-col items-end shrink-0 gap-0.5">
                          <span className="text-[12px] font-extrabold text-blue-600 font-mono">{r.periodPoints} poin</span>
                          <span className="text-[10px] text-slate-400">{r.orders} order</span>
                        </div>

                        {r.isMe && (
                          <button
                            onClick={() => navigate("/agent/profile")}
                            className="shrink-0 h-7 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-[11px] font-semibold text-slate-600 transition-colors flex items-center gap-1"
                          >
                            <span className="hidden sm:inline">Profil</span>
                            <ChevronRight className="h-3 w-3" />
                          </button>
                        )}
                      </motion.div>
                    );
                  })}
                </div>
              </AnimatePresence>
            )}
          </motion.div>
        )}

        {/* Loading skeleton for ranking */}
        {loading && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <div className="h-4 w-32 bg-slate-100 rounded-lg animate-pulse" />
            </div>
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-slate-50">
                <div className="h-7 w-7 bg-slate-100 rounded-lg animate-pulse" />
                <div className="h-9 w-9 bg-slate-100 rounded-full animate-pulse" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-28 bg-slate-100 rounded animate-pulse" />
                  <div className="h-2.5 w-16 bg-slate-100 rounded animate-pulse" />
                </div>
                <div className="h-4 w-12 bg-slate-100 rounded animate-pulse" />
              </div>
            ))}
          </div>
        )}

        {/* Tip strip */}
        {!loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-4 flex items-start gap-3"
          >
            <div className="h-8 w-8 rounded-xl bg-blue-50 flex items-center justify-center shrink-0 mt-0.5">
              <TrendingUp className="h-4 w-4 text-blue-500" />
            </div>
            <div>
              <p className="text-[12px] font-semibold text-slate-700 mb-0.5">Cara naik ranking</p>
              <p className="text-[11.5px] text-slate-500 leading-relaxed">
                Daftarkan klien baru, bantu mereka order, dan pastikan order naik ke status{" "}
                <span className="font-semibold text-slate-700">Completed</span>.
                Tiap order Completed = <span className="font-semibold text-slate-700">+10 poin</span>;
                jika ada komisi sales, dapat bonus <span className="font-semibold text-slate-700">+20 poin</span> —
                total <span className="font-semibold text-slate-700">+30 poin</span> sekaligus.
                Top performer dapat reward bulanan dari admin.
              </p>
            </div>
          </motion.div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════
          MOBILE LAYOUT  (hidden on desktop)
      ══════════════════════════════════════════════════════════════ */}
      <div className="md:hidden -mx-4 bg-[#F0F4FB] min-h-screen pb-32 overflow-x-hidden">

        {/* ── Section 1: Header ────────────────────────────────────── */}
        <div className="bg-white px-5 pt-[72px] pb-5 shadow-sm">
          {/* Back + title row */}
          <div className="flex items-start gap-3 mb-3">
            <button
              onClick={() => navigate(-1 as unknown as string)}
              className="h-9 w-9 rounded-xl bg-[#F0F4FB] flex items-center justify-center shrink-0 active:opacity-60 transition-opacity mt-0.5"
              style={{ WebkitTapHighlightColor: "transparent" }}
            >
              <ChevronLeft className="h-4 w-4 text-slate-600" />
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <Trophy className="h-5 w-5 text-amber-500 shrink-0" />
                <h1 className="text-[22px] font-extrabold text-[#0f1c3f] leading-tight">
                  Leaderboard Agent
                </h1>
              </div>
              <p className="text-[12px] text-slate-500 leading-snug">
                Pantau ranking, poin, komisi, dan performa agent dalam satu tempat.
              </p>
            </div>
          </div>

          {/* My rank + period */}
          <div className="flex items-center gap-2 flex-wrap mb-3">
            {myRank && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700">
                🏆 Kamu #{myRank}
              </span>
            )}
            <span className="text-[11px] text-slate-400 font-medium">{RANGE_LABEL[range]}</span>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate("/agent-center")}
              className="flex items-center gap-1.5 h-9 px-3.5 rounded-xl border border-slate-200 bg-white text-[12px] font-semibold text-slate-600 active:opacity-70 transition-opacity"
              style={{ WebkitTapHighlightColor: "transparent" }}
            >
              <History className="h-3.5 w-3.5" />
              Riwayat
            </button>
            <button
              onClick={() => navigate("/agent-center")}
              className="flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-[#0066FF] text-white text-[12px] font-semibold active:opacity-80 transition-opacity shadow-md shadow-blue-200"
              style={{ WebkitTapHighlightColor: "transparent" }}
            >
              <UserPlus className="h-3.5 w-3.5" />
              Tambah Agent
            </button>
            <div className="ml-auto">
              <Select value={range} onValueChange={(v) => setRange(v as RangeKey)}>
                <SelectTrigger className="h-9 w-[110px] text-[11px] border-slate-200 rounded-xl">
                  <Calendar className="h-3 w-3 mr-1 text-slate-400" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(RANGE_LABEL) as RangeKey[]).map((k) => (
                    <SelectItem key={k} value={k} className="text-[12px]">
                      {RANGE_LABEL[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* ── Section 2: Stats Cards ────────────────────────────────── */}
        <div className="px-4 mt-4">
          {loading ? (
            <div className="grid grid-cols-2 gap-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="bg-white rounded-2xl p-4 shadow-sm animate-pulse">
                  <div className="h-9 w-9 bg-slate-100 rounded-xl mb-3" />
                  <div className="h-6 w-16 bg-slate-100 rounded mb-1.5" />
                  <div className="h-3 w-20 bg-slate-100 rounded" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {[
                {
                  label: "Total Agent",
                  value: fmtCompact(agentMembers.length),
                  sub: `${activeAgents} aktif periode ini`,
                  icon: <Users className="h-5 w-5" strokeWidth={1.8} />,
                  color: "#0066FF", bg: "#dbeafe",
                },
                {
                  label: "Total Poin",
                  value: fmtCompact(totalPeriodPoints),
                  sub: RANGE_LABEL[range],
                  icon: <Star className="h-5 w-5" strokeWidth={1.8} />,
                  color: "#8b5cf6", bg: "#ede9fe",
                },
                {
                  label: "Total Komisi",
                  value: isOwner ? (totalCommission >= 1_000_000 ? `Rp${(totalCommission/1_000_000).toFixed(1)}Jt` : fmtIDR(totalCommission)) : "🔒 Private",
                  sub: "seluruh agent",
                  icon: <Wallet className="h-5 w-5" strokeWidth={1.8} />,
                  color: "#10b981", bg: "#d1fae5",
                },
                {
                  label: "Performa Terbaik",
                  value: mostActive?.name.split(" ")[0] ?? "—",
                  sub: mostActive ? `${mostActive.orders} order` : "belum ada data",
                  icon: <Flame className="h-5 w-5" strokeWidth={1.8} />,
                  color: "#f59e0b", bg: "#fef3c7",
                },
              ].map((stat, i) => (
                <motion.div
                  key={stat.label}
                  variants={fadeUp}
                  initial="hidden"
                  animate="show"
                  custom={i}
                  className="bg-white rounded-2xl p-4 shadow-sm"
                >
                  <div
                    className="h-10 w-10 rounded-xl flex items-center justify-center mb-3"
                    style={{ backgroundColor: stat.bg, color: stat.color }}
                  >
                    {stat.icon}
                  </div>
                  <p className="text-[20px] font-extrabold text-[#0f1c3f] tabular-nums leading-none mb-0.5 truncate">
                    {stat.value}
                  </p>
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide truncate">
                    {stat.label}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5 truncate">{stat.sub}</p>
                </motion.div>
              ))}
            </div>
          )}
        </div>

        {/* ── Section 3: Search + Filter ───────────────────────────── */}
        <div className="px-4 mt-4 space-y-2">
          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={mobileSearch}
              onChange={(e) => setMobileSearch(e.target.value)}
              placeholder="Cari nama agent, email…"
              className="w-full h-11 pl-10 pr-4 bg-white rounded-xl border border-slate-200 text-[13px] text-slate-800 placeholder:text-slate-400 outline-none focus:border-[#0066FF] focus:ring-2 focus:ring-blue-100 transition-all"
            />
          </div>
          {/* Sort row */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 flex-1 bg-white rounded-xl border border-slate-200 h-9 px-3">
              <SlidersHorizontal className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <span className="text-[11px] text-slate-500 font-medium">Urutkan:</span>
              <span className="text-[11px] font-bold text-[#0066FF]">
                {MOBILE_TABS.find((t) => t.key === mobileTab)?.label ?? "Semua"}
              </span>
            </div>
            <div className="text-[11px] text-slate-400 font-medium shrink-0 bg-white rounded-xl border border-slate-200 h-9 px-3 flex items-center">
              {searchedMobileRows.length} agent
            </div>
          </div>
        </div>

        {/* ── Section 4: Ranking Tabs ──────────────────────────────── */}
        <div className="px-4 mt-3">
          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            {MOBILE_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setMobileTab(tab.key)}
                className={cn(
                  "shrink-0 h-8 px-4 rounded-full text-[12px] font-semibold transition-all active:scale-95",
                  mobileTab === tab.key
                    ? "bg-[#0066FF] text-white shadow-md shadow-blue-200"
                    : "bg-white text-slate-600 border border-slate-200",
                )}
                style={{ WebkitTapHighlightColor: "transparent" }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Section 5: Podium Top 3 ──────────────────────────────── */}
        <div className="px-4 mt-4">
          {loading ? (
            <PodiumSkeleton />
          ) : top3.length > 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden"
            >
              <div className="flex items-center justify-between px-4 pt-4 pb-3">
                <div className="flex items-center gap-2">
                  <Crown className="h-4 w-4 text-amber-500" />
                  <span className="text-[13px] font-extrabold text-[#0f1c3f]">Top 3 Champions</span>
                </div>
                <span className="text-[10px] text-slate-400 font-medium">{RANGE_LABEL[range]}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 px-3 pb-4 items-end">
                {podium.map((row, idx) => (
                  <PodiumCard
                    key={podiumRanks[idx]}
                    row={row}
                    rank={podiumRanks[idx]}
                    isMe={row?.agentId === me?.id}
                    elevated={podiumRanks[idx] === 1}
                    onProfile={() =>
                      isOwner && row
                        ? navigate(`/agents/${row.agentId}`)
                        : navigate("/agent/profile")
                    }
                  />
                ))}
              </div>
            </motion.div>
          ) : !loading && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm py-10 text-center">
              <Trophy className="h-8 w-8 text-slate-200 mx-auto mb-2" />
              <p className="text-[12px] text-slate-400">Belum ada agent di periode ini</p>
            </div>
          )}
        </div>

        {/* ── Section 6: Ranking List ──────────────────────────────── */}
        <div className="px-4 mt-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[15px] font-extrabold text-[#0f1c3f]">Ranking Agent</h3>
            {myRank && (
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-[#0066FF] border border-blue-100">
                Kamu #{myRank}
              </span>
            )}
          </div>

          {loading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="bg-white rounded-2xl p-4 shadow-sm animate-pulse flex items-center gap-3">
                  <div className="h-8 w-8 bg-slate-100 rounded-xl shrink-0" />
                  <div className="h-10 w-10 bg-slate-100 rounded-full shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 w-28 bg-slate-100 rounded" />
                    <div className="h-2.5 w-20 bg-slate-100 rounded" />
                  </div>
                  <div className="h-6 w-14 bg-slate-100 rounded" />
                </div>
              ))}
            </div>
          ) : searchedMobileRows.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm py-12 text-center">
              <Search className="h-8 w-8 text-slate-200 mx-auto mb-2" />
              <p className="text-[12.5px] font-medium text-slate-400">Tidak ada hasil ditemukan</p>
              <p className="text-[11px] text-slate-300 mt-0.5">Coba kata kunci lain</p>
            </div>
          ) : (
            <AnimatePresence mode="wait">
              <div className="space-y-2">
                {paginatedMobileRows.map((r, i) => {
                  const globalRank = searchedMobileRows.indexOf(r) + 1;
                  const isTop3     = globalRank <= 3 && mobileSearch === "" && mobileTab === "all";
                  const member     = memberById.get(r.agentId);
                  const showComm   = isOwner || r.isMe;

                  return (
                    <motion.div
                      key={r.agentId}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.22, delay: Math.min(i * 0.04, 0.3) }}
                      className={cn(
                        "bg-white rounded-2xl shadow-sm overflow-hidden",
                        r.isMe && "ring-2 ring-amber-300",
                      )}
                    >
                      <div className="flex items-center gap-3 px-4 py-3.5">
                        {/* Rank badge */}
                        <div className={cn(
                          "h-8 w-8 rounded-xl flex items-center justify-center shrink-0 text-[12px] font-extrabold",
                          isTop3
                            ? globalRank === 1 ? "bg-amber-50 text-amber-600 border border-amber-200"
                              : globalRank === 2 ? "bg-slate-100 text-slate-500 border border-slate-200"
                              : "bg-orange-50 text-orange-500 border border-orange-200"
                            : "bg-[#F0F4FB] text-slate-500 font-mono text-[11px]",
                        )}>
                          {isTop3 ? RANK_MEDAL[globalRank - 1] : globalRank}
                        </div>

                        {/* Avatar */}
                        <div className="relative shrink-0">
                          <div className={cn(
                            "h-11 w-11 rounded-full bg-gradient-to-br flex items-center justify-center",
                            "text-white font-extrabold text-[15px] shadow-sm",
                            avatarGradient(r.name),
                          )}>
                            {r.name.charAt(0).toUpperCase()}
                          </div>
                          <span className={cn(
                            "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white",
                            r.orders > 0 ? "bg-emerald-400" : "bg-slate-300",
                          )} />
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className={cn(
                              "text-[13px] font-bold truncate leading-tight",
                              r.isMe ? "text-amber-800" : "text-[#0f1c3f]",
                            )}>
                              {r.name}
                            </span>
                            {r.isMe && (
                              <span className="text-[10px] font-extrabold uppercase tracking-wide bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full shrink-0">
                                Kamu
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] font-semibold bg-blue-50 text-[#0066FF] px-1.5 py-0.5 rounded-full border border-blue-100">
                              AGENT
                            </span>
                            <AgentTierBadge tier={r.tier} size="xs" />
                            {member?.email && (
                              <span className="text-[10px] text-slate-400 truncate max-w-[80px]">
                                {member.email}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Stats */}
                        <div className="flex flex-col items-end shrink-0 gap-0.5">
                          <span className="text-[13px] font-extrabold text-[#0066FF] font-mono tabular-nums">
                            {r.periodPoints} poin
                          </span>
                          <span className="text-[10px] text-slate-400">{r.orders} order</span>
                        </div>
                      </div>

                      {/* Bottom row: komisi + actions */}
                      <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-50 bg-slate-50/50">
                        <div className="flex items-center gap-3">
                          <div>
                            <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">Lifetime</span>
                            <div className="text-[11px] font-bold text-amber-600 font-mono">{r.lifetimePoints} pts</div>
                          </div>
                          {showComm && (
                            <div>
                              <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">Komisi</span>
                              <div className="text-[11px] font-bold text-emerald-600 font-mono">
                                {r.commission >= 1_000_000
                                  ? `Rp${(r.commission / 1_000_000).toFixed(1)}Jt`
                                  : fmtIDR(r.commission)}
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          {(isOwner || r.isMe) && (
                            <button
                              onClick={() =>
                                r.isMe && !isOwner
                                  ? navigate("/agent/profile")
                                  : navigate(`/agents/${r.agentId}`)
                              }
                              className="h-7 px-3 rounded-lg bg-[#0066FF] text-white text-[11px] font-semibold active:opacity-80 transition-opacity"
                              style={{ WebkitTapHighlightColor: "transparent" }}
                            >
                              {r.isMe && !isOwner ? "Profilku" : "Detail"}
                            </button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </AnimatePresence>
          )}

          {/* Pagination */}
          {!loading && totalMobilePages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <button
                onClick={() => setMobilePage((p) => Math.max(1, p - 1))}
                disabled={mobilePage === 1}
                className="h-9 w-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center active:opacity-60 disabled:opacity-30 transition-opacity shadow-sm"
                style={{ WebkitTapHighlightColor: "transparent" }}
              >
                <ChevronLeft className="h-4 w-4 text-slate-600" />
              </button>

              {Array.from({ length: totalMobilePages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalMobilePages || Math.abs(p - mobilePage) <= 1)
                .reduce<(number | "…")[]>((acc, p, idx, arr) => {
                  if (idx > 0 && typeof arr[idx - 1] === "number" && (p as number) - (arr[idx - 1] as number) > 1) {
                    acc.push("…");
                  }
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, i) =>
                  p === "…" ? (
                    <span key={`ellipsis-${i}`} className="text-slate-400 text-[12px] px-1">…</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setMobilePage(p as number)}
                      className={cn(
                        "h-9 w-9 rounded-xl text-[12px] font-bold transition-all active:scale-95 shadow-sm",
                        mobilePage === p
                          ? "bg-[#0066FF] text-white shadow-blue-200"
                          : "bg-white border border-slate-200 text-slate-600",
                      )}
                      style={{ WebkitTapHighlightColor: "transparent" }}
                    >
                      {p}
                    </button>
                  )
                )}

              <button
                onClick={() => setMobilePage((p) => Math.min(totalMobilePages, p + 1))}
                disabled={mobilePage === totalMobilePages}
                className="h-9 w-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center active:opacity-60 disabled:opacity-30 transition-opacity shadow-sm"
                style={{ WebkitTapHighlightColor: "transparent" }}
              >
                <ChevronRight className="h-4 w-4 text-slate-600" />
              </button>
            </div>
          )}
        </div>

        {/* ── Section 7: Quick Actions ─────────────────────────────── */}
        <div className="px-4 mt-6">
          <h3 className="text-[15px] font-extrabold text-[#0f1c3f] mb-3">Aksi Cepat</h3>
          <div className="grid grid-cols-2 gap-3">
            {[
              {
                icon: <UserPlus className="h-5 w-5" strokeWidth={1.8} />,
                label: "Tambah Agent",
                sub: "Daftarkan agent baru",
                color: "#0066FF", bg: "#dbeafe",
                path: "/agent-center",
              },
              {
                icon: <Users className="h-5 w-5" strokeWidth={1.8} />,
                label: "Undang Agent",
                sub: "Kirim link undangan",
                color: "#8b5cf6", bg: "#ede9fe",
                path: "/agent-center",
              },
              {
                icon: <Settings2 className="h-5 w-5" strokeWidth={1.8} />,
                label: "Kelola Role",
                sub: "Atur hak akses agent",
                color: "#f59e0b", bg: "#fef3c7",
                path: "/settings",
              },
              {
                icon: <BarChart3 className="h-5 w-5" strokeWidth={1.8} />,
                label: "Laporan Performa",
                sub: "Lihat statistik detail",
                color: "#10b981", bg: "#d1fae5",
                path: "/reports",
              },
            ].map((item, i) => (
              <motion.button
                key={item.label}
                variants={fadeUp}
                initial="hidden"
                animate="show"
                custom={i}
                onClick={() => navigate(item.path)}
                className="bg-white rounded-2xl p-4 shadow-sm flex items-start gap-3 text-left active:opacity-80 transition-opacity"
                style={{ WebkitTapHighlightColor: "transparent" }}
              >
                <div
                  className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: item.bg, color: item.color }}
                >
                  {item.icon}
                </div>
                <div className="min-w-0">
                  <p className="text-[12.5px] font-bold text-[#0f1c3f] leading-tight">{item.label}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{item.sub}</p>
                </div>
              </motion.button>
            ))}
          </div>
        </div>

        {/* Cara naik ranking tip */}
        {!loading && (
          <div className="px-4 mt-4 mb-4">
            <div className="bg-white rounded-2xl shadow-sm p-4 flex items-start gap-3">
              <div className="h-9 w-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0 mt-0.5">
                <TrendingUp className="h-4 w-4 text-[#0066FF]" />
              </div>
              <div>
                <p className="text-[12px] font-bold text-[#0f1c3f] mb-1">Cara naik ranking</p>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Order Completed = <span className="font-semibold text-slate-700">+10 poin</span>.
                  Jika ada komisi sales, bonus <span className="font-semibold text-slate-700">+20 poin</span> — total{" "}
                  <span className="font-semibold text-slate-700">+30 poin</span> sekaligus.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── PodiumSkeleton ──────────────────────────────────────────────── */
function PodiumSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
      <div className="h-4 w-36 bg-slate-100 rounded-lg animate-pulse mb-5" />
      <div className="grid grid-cols-3 gap-3 items-end">
        {[220, 260, 220].map((h, i) => (
          <div
            key={i}
            className="rounded-xl bg-slate-50 border border-slate-100 animate-pulse"
            style={{ height: h }}
          />
        ))}
      </div>
    </div>
  );
}

/* ── PodiumCard ──────────────────────────────────────────────────── */
function PodiumCard({
  row, rank, isMe, elevated, onProfile,
}: {
  row:      LeaderboardRow | null;
  rank:     1 | 2 | 3;
  isMe:     boolean;
  elevated: boolean;
  onProfile: () => void;
}) {
  const cfg = PODIUM_CFG[rank];

  if (!row) {
    return (
      <div
        className={cn(
          "rounded-xl border-2 border-dashed border-slate-100 flex items-center justify-center text-[11px] text-slate-300",
          elevated ? "min-h-[260px]" : "min-h-[200px]",
        )}
      >
        #{rank}
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: elevated ? -16 : 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: rank === 1 ? 0 : rank === 2 ? 0.1 : 0.17 }}
      className={cn(
        "rounded-xl border flex flex-col overflow-hidden shadow-sm hover:shadow-md transition-shadow",
        cfg.bg, cfg.border,
        elevated && "shadow-md",
      )}
    >
      <div className="flex items-center justify-between px-3 pt-3">
        <span className={cn("text-[10px] font-bold tracking-wider uppercase", cfg.accentColor)}>
          #{rank}
        </span>
        {rank === 1 && (
          <Crown className="h-3.5 w-3.5 text-amber-500" />
        )}
      </div>

      <div className="flex flex-col items-center pt-2 pb-2 px-3">
        <div className="relative">
          {rank === 1 && (
            <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-base select-none">
              👑
            </span>
          )}
          <div className={cn(
            "rounded-full bg-gradient-to-br flex items-center justify-center text-white font-extrabold shadow",
            avatarGradient(row.name),
            cfg.avatarRing,
            elevated
              ? "h-14 w-14 text-xl mt-4"
              : "h-10 w-10 text-base mt-2",
          )}>
            {row.name.charAt(0).toUpperCase()}
          </div>
        </div>

        <p className={cn(
          "font-bold text-slate-800 text-center truncate w-full px-1 mt-2 leading-tight",
          elevated ? "text-[12px]" : "text-[11px]",
        )}>
          {row.name}
        </p>

        {isMe && (
          <span className="mt-1 text-[10px] font-bold uppercase tracking-wide bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
            Kamu
          </span>
        )}
      </div>

      <div className="px-2.5 pb-3 flex flex-col gap-1.5 flex-1">
        <div className={cn("rounded-lg px-2 py-2 text-center", cfg.pillBg)}>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">
            Poin
          </div>
          <div className={cn(
            "font-extrabold font-mono leading-none",
            cfg.pillText,
            elevated ? "text-2xl" : "text-xl",
          )}>
            {row.periodPoints}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1">
          <div className="rounded-lg bg-white/80 border border-slate-100 px-1.5 py-1.5 text-center">
            <div className="text-[7.5px] text-slate-400 font-medium">Order</div>
            <div className="text-[12px] font-bold text-slate-700 font-mono">{row.orders}</div>
          </div>
          <div className="rounded-lg bg-white/80 border border-slate-100 px-1.5 py-1.5 text-center">
            <div className="text-[7.5px] text-slate-400 font-medium">Lifetime</div>
            <div className="text-[12px] font-bold text-slate-700 font-mono">{row.lifetimePoints}</div>
          </div>
        </div>

        <div className="flex justify-center">
          <AgentTierBadge tier={row.tier} size="xs" />
        </div>

        {isMe ? (
          <button
            onClick={onProfile}
            className="w-full h-8 mt-0.5 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-[11px] font-semibold text-slate-700 transition-all shadow-sm"
          >
            Profil Saya
          </button>
        ) : (
          <div className="h-7 mt-0.5 rounded-lg bg-white/50 border border-slate-100 flex items-center justify-center">
            <span className="text-[8.5px] text-slate-400 font-medium">Mitra Temantiket</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}

/* ── InsightCard ─────────────────────────────────────────────────── */
function InsightCard({
  icon, iconBg, label, sub, name, value, valueColor, isMe, delay,
}: {
  icon:       ReactNode;
  iconBg:     string;
  label:      string;
  sub:        string;
  name:       string;
  value:      string;
  valueColor: string;
  isMe:       boolean;
  delay:      number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
      className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex items-start gap-3 hover:shadow-md transition-shadow"
    >
      <div className={cn("h-9 w-9 rounded-xl flex items-center justify-center shrink-0", iconBg)}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">{label}</span>
          {isMe && (
            <span className="text-[7.5px] font-bold px-1 py-0.5 rounded bg-amber-50 text-amber-600 border border-amber-100">
              Kamu!
            </span>
          )}
        </div>
        <p className="text-[10px] text-slate-400 leading-none mb-1.5">{sub}</p>
        <p className="text-[12.5px] font-semibold text-slate-800 truncate">{name}</p>
        <p className={cn("text-[11.5px] font-bold font-mono mt-0.5", valueColor)}>{value}</p>
      </div>
    </motion.div>
  );
}
