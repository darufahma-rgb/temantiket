import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  Trophy, ChevronLeft, Sparkles, Calendar, Star,
  TrendingUp, Flame, ChevronRight,
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

const PODIUM = {
  1: {
    rankLabel: "1st",
    superscript: "st",
    cardBg: "bg-gradient-to-br from-amber-50 via-yellow-50 to-amber-100/80",
    border: "border-amber-200/60",
    shadow: "shadow-amber-200/40",
    avatarRing: "ring-amber-300",
    avatarGrad: "from-amber-400 to-yellow-600",
    rankNumColor: "text-amber-500",
    badgeBg: "bg-amber-400 text-white",
    pointsBg: "bg-amber-100 text-amber-800",
    statColor: "text-amber-700",
    glow: "before:bg-amber-400/20",
  },
  2: {
    rankLabel: "2nd",
    superscript: "nd",
    cardBg: "bg-gradient-to-br from-slate-50 via-sky-50/60 to-slate-100/80",
    border: "border-slate-200/60",
    shadow: "shadow-slate-200/40",
    avatarRing: "ring-slate-300",
    avatarGrad: "from-slate-400 to-slate-600",
    rankNumColor: "text-slate-500",
    badgeBg: "bg-slate-500 text-white",
    pointsBg: "bg-slate-100 text-slate-800",
    statColor: "text-slate-700",
    glow: "before:bg-slate-400/10",
  },
  3: {
    rankLabel: "3rd",
    superscript: "rd",
    cardBg: "bg-gradient-to-br from-orange-50 via-amber-50/60 to-orange-100/80",
    border: "border-orange-200/60",
    shadow: "shadow-orange-200/40",
    avatarRing: "ring-orange-300",
    avatarGrad: "from-orange-400 to-amber-600",
    rankNumColor: "text-orange-500",
    badgeBg: "bg-orange-400 text-white",
    pointsBg: "bg-orange-100 text-orange-800",
    statColor: "text-orange-700",
    glow: "before:bg-orange-400/20",
  },
} as const;

type LeaderboardRow = {
  agentId: string;
  name: string;
  isMe: boolean;
  orders: number;
  revenue: number;
  commission: number;
  periodPoints: number;
  lifetimePoints: number;
  tier: AgentTier;
};

export default function AgentLeaderboard() {
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.user);
  const listMembers = useAuthStore((s) => s.listMembers);
  const { orders, fetchOrders } = useOrdersStore();

  const [range, setRange]     = useState<RangeKey>("this_month");
  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [points, setPoints]   = useState<AgentPoint[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshPoints = useCallback(async () => {
    try { setPoints(await listAgentPoints()); }
    catch (e) { console.warn("[Leaderboard] refresh err:", e); }
  }, []);

  useEffect(() => {
    void fetchOrders();
    void (async () => {
      try {
        const [m, p] = await Promise.all([listMembers(), listAgentPoints()]);
        setMembers(m); setPoints(p);
      } catch (e) { console.warn("[Leaderboard] fetch err:", e); }
      finally { setLoading(false); }
    })();
    const unsub = onAgentPointsChanged(() => { void refreshPoints(); });
    return unsub;
  }, [fetchOrders, listMembers, refreshPoints]);

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
    const stats = new Map<string, { revenue: number; orders: number; commission: number }>();

    for (const o of periodOrders) {
      if (!o.createdByAgent || !agentIds.has(o.createdByAgent)) continue;
      const cur = stats.get(o.createdByAgent) ?? { revenue: 0, orders: 0, commission: 0 };
      cur.revenue += revenueIDR(o);
      cur.orders  += 1;
      cur.commission += agentFeeFromMeta(o);
      stats.set(o.createdByAgent, cur);
    }
    // Tambahkan fee lapangan VOA: agen yg bertugas sebagai voaFieldAgentId pada order visa_voa
    for (const o of periodOrders) {
      if (o.type !== "visa_voa") continue;
      const meta = (o.metadata ?? {}) as Record<string, unknown>;
      const fieldAgentId = meta.voaFieldAgentId as string | undefined;
      if (!fieldAgentId || !agentIds.has(fieldAgentId)) continue;
      const voaFee = Number(meta.voaAgentFee ?? 0);
      if (voaFee <= 0) continue;
      const cur = stats.get(fieldAgentId) ?? { revenue: 0, orders: 0, commission: 0 };
      cur.commission += voaFee;
      stats.set(fieldAgentId, cur);
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
        if (b.periodPoints !== a.periodPoints) return b.periodPoints - a.periodPoints;
        if (b.orders       !== a.orders)       return b.orders       - a.orders;
        if (b.lifetimePoints !== a.lifetimePoints) return b.lifetimePoints - a.lifetimePoints;
        return a.name.localeCompare(b.name, "id");
      });
  }, [periodOrders, periodPoints, points, agentMembers, memberById, me?.id]);

  const myRank     = useMemo(() => { const i = rows.findIndex((r) => r.agentId === me?.id); return i >= 0 ? i + 1 : null; }, [rows, me?.id]);
  const mostActive = useMemo(() => [...rows].sort((a, b) => b.orders - a.orders)[0] ?? null, [rows]);
  const topKomisi  = useMemo(() => [...rows].sort((a, b) => b.commission - a.commission)[0] ?? null, [rows]);
  const topPoin    = useMemo(() => rows[0] ?? null, [rows]);

  // Podium order: left=2nd, center=1st, right=3rd
  const top3  = rows.slice(0, 3);
  const podium: (LeaderboardRow | null)[] = [top3[1] ?? null, top3[0] ?? null, top3[2] ?? null];
  const podiumRanks: (1 | 2 | 3)[]       = [2, 1, 3];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5 pb-12">

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/agent")} className="h-8 w-8 p-0 mt-0.5 shrink-0">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-xl md:text-2xl font-extrabold flex items-center gap-2">
                <Trophy className="h-5 w-5 text-amber-500" />
                Leaderboard Mitra
              </h1>
              <p className="text-[12px] text-muted-foreground mt-0.5">
                {RANGE_LABEL[range]}
                {myRank && (
                  <> · <span className="font-bold text-amber-700">Lo di posisi #{myRank}</span></>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <Select value={range} onValueChange={(v) => setRange(v as RangeKey)}>
              <SelectTrigger className="w-[148px] h-9 text-[12.5px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(RANGE_LABEL) as RangeKey[]).map((k) => (
                  <SelectItem key={k} value={k}>{RANGE_LABEL[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* ── Champions Hero ── */}
        {loading ? (
          <div className="rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 h-64 flex flex-col items-center justify-center gap-3">
            <Trophy className="h-10 w-10 text-amber-400/50 animate-pulse" />
            <p className="text-[12px] text-white/40">Memuat leaderboard…</p>
          </div>
        ) : top3.length > 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-5 md:p-8 shadow-2xl"
          >
            {/* "Champions" watermark */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden">
              <span className="text-[8rem] sm:text-[11rem] md:text-[15rem] font-black text-white/[0.035] leading-none tracking-tighter whitespace-nowrap">
                Champions
              </span>
            </div>

            {/* Decorative ambient blobs */}
            <div className="absolute top-[-40px] left-[15%] w-72 h-72 rounded-full bg-amber-400/[0.08] blur-3xl pointer-events-none" />
            <div className="absolute bottom-[-40px] right-[15%] w-72 h-72 rounded-full bg-violet-500/[0.08] blur-3xl pointer-events-none" />
            <div className="absolute top-[20%] left-[-20px] w-40 h-40 rounded-full bg-sky-400/[0.06] blur-2xl pointer-events-none" />

            {/* Podium grid: 2nd | 1st | 3rd */}
            <div className="relative grid grid-cols-3 gap-2 md:gap-4 items-end">
              {podium.map((row, idx) => (
                <ChampionCard
                  key={podiumRanks[idx]}
                  row={row}
                  rank={podiumRanks[idx]}
                  isMe={row?.agentId === me?.id}
                  elevated={podiumRanks[idx] === 1}
                  onProfile={() => navigate("/agent/profile")}
                />
              ))}
            </div>
          </motion.div>
        ) : (
          <div className="rounded-3xl border-2 border-dashed border-muted bg-muted/20 h-48 flex items-center justify-center">
            <p className="text-[12px] text-muted-foreground italic">Belum ada mitra di periode ini</p>
          </div>
        )}

        {/* ── Summary Mini Cards ── */}
        {!loading && rows.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {mostActive && (
              <SummaryCard
                icon={<Flame className="h-4 w-4 text-amber-600" />}
                iconBg="bg-amber-100"
                label="Most Active"
                sub="Terbanyak order"
                name={mostActive.name}
                value={`${mostActive.orders} order`}
                valueColor="text-amber-700"
                isMe={mostActive.isMe}
              />
            )}
            {topKomisi && (
              <SummaryCard
                icon={<span className="text-base leading-none">💰</span>}
                iconBg="bg-emerald-100"
                label="Top Komisi"
                sub="Komisi sales tertinggi"
                name={topKomisi.name}
                value={topKomisi.isMe ? fmtIDR(topKomisi.commission) : "🔒 Private"}
                valueColor="text-emerald-700"
                isMe={topKomisi.isMe}
              />
            )}
            {topPoin && (
              <SummaryCard
                icon={<Star className="h-4 w-4 text-violet-600" />}
                iconBg="bg-violet-100"
                label="Top Poin"
                sub={`Poin ${RANGE_LABEL[range].toLowerCase()}`}
                name={topPoin.name}
                value={`${topPoin.periodPoints} poin`}
                valueColor="text-violet-700"
                isMe={topPoin.isMe}
              />
            )}
          </div>
        )}

        {/* ── Full Ranking ── */}
        {!loading && (
          <div className="rounded-2xl border bg-white overflow-hidden shadow-sm">
            {/* Table header */}
            <div className="px-4 py-3 border-b bg-slate-50/80 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-amber-100 flex items-center justify-center">
                  <Sparkles className="h-3.5 w-3.5 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Full Ranking</p>
                  <p className="text-[10px] text-muted-foreground">
                    {rows.length} mitra · {RANGE_LABEL[range].toLowerCase()}
                  </p>
                </div>
              </div>
              {myRank && (
                <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">
                  Lo #{myRank}
                </span>
              )}
            </div>

            {rows.length === 0 ? (
              <div className="py-14 text-center">
                <Trophy className="h-9 w-9 mx-auto text-muted-foreground/20 mb-2" />
                <p className="text-[12.5px] font-semibold text-muted-foreground">Belum ada mitra terdaftar</p>
              </div>
            ) : (
              <AnimatePresence mode="wait">
                <div className="divide-y">
                  {rows.map((r, i) => {
                    const rank   = i + 1;
                    const isTop3 = rank <= 3;
                    const medals = ["🥇", "🥈", "🥉"];
                    const top3RankBg: Record<number, string> = {
                      1: "bg-amber-50  text-amber-600  border-amber-200",
                      2: "bg-slate-100 text-slate-600  border-slate-200",
                      3: "bg-orange-50 text-orange-600 border-orange-200",
                    };
                    return (
                      <motion.div
                        key={r.agentId}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.22, delay: Math.min(i * 0.035, 0.5) }}
                        className={cn(
                          "flex items-center gap-3 px-4 py-3 transition-colors",
                          r.isMe
                            ? "bg-amber-50/70 border-l-2 border-amber-400 hover:bg-amber-50"
                            : "hover:bg-slate-50/60",
                        )}
                      >
                        {/* Rank badge */}
                        <div className={cn(
                          "h-7 w-7 rounded-lg border flex items-center justify-center shrink-0 text-[11px] font-extrabold",
                          isTop3
                            ? top3RankBg[rank]
                            : "bg-muted/30 text-muted-foreground border-transparent font-mono",
                        )}>
                          {isTop3 ? medals[rank - 1] : rank}
                        </div>

                        {/* Avatar */}
                        <div className={cn(
                          "h-9 w-9 rounded-full bg-gradient-to-br flex items-center justify-center",
                          "text-white font-extrabold text-[13px] shrink-0 ring-2 ring-white shadow-sm",
                          avatarGradient(r.name),
                        )}>
                          {r.name.charAt(0).toUpperCase()}
                        </div>

                        {/* Name + tier */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={cn(
                              "text-[13px] font-semibold truncate",
                              r.isMe && "text-amber-800",
                            )}>
                              {r.name}
                            </span>
                            {r.isMe && (
                              <span className="text-[8.5px] font-bold uppercase tracking-wide bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded-full shrink-0">
                                Lo
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <AgentTierBadge tier={r.tier} size="xs" />
                            <span className="text-[10px] text-muted-foreground">{r.orders} order</span>
                          </div>
                        </div>

                        {/* Desktop stats */}
                        <div className="hidden sm:flex items-center gap-5 shrink-0">
                          <div className="text-right">
                            <div className="text-[9.5px] text-muted-foreground font-medium uppercase tracking-wide">Poin</div>
                            <div className="text-[13px] font-extrabold font-mono text-fuchsia-700">{r.periodPoints}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-[9.5px] text-muted-foreground font-medium uppercase tracking-wide">Lifetime</div>
                            <div className="text-[13px] font-extrabold font-mono text-amber-700">{r.lifetimePoints}</div>
                          </div>
                          {r.isMe && (
                            <div className="text-right">
                              <div className="text-[9.5px] text-muted-foreground font-medium uppercase tracking-wide">Komisi</div>
                              <div className="text-[12px] font-bold font-mono text-emerald-700">{fmtIDR(r.commission)}</div>
                            </div>
                          )}
                        </div>

                        {/* Mobile stats */}
                        <div className="flex sm:hidden flex-col items-end shrink-0">
                          <span className="text-[12px] font-extrabold font-mono text-fuchsia-700">{r.periodPoints}⭐</span>
                          <span className="text-[10px] text-muted-foreground">{r.orders} order</span>
                        </div>

                        {/* Profile button (self only) */}
                        {r.isMe && (
                          <button
                            onClick={() => navigate("/agent/profile")}
                            className="shrink-0 h-7 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-[11px] font-semibold text-slate-700 transition-colors flex items-center gap-1"
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
          </div>
        )}

        {/* ── Tip strip ── */}
        <div className="rounded-2xl border border-muted bg-muted/20 px-4 py-3 flex items-start gap-3">
          <TrendingUp className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            <strong className="text-foreground">Cara naik ranking:</strong> Daftarkan klien baru, bantu mereka order, dan pastikan order naik ke status{" "}
            <strong className="text-foreground">Completed</strong>. Tiap order Completed = +10 poin; +20 poin bonus jika ada komisi. Top performer dapet reward bulanan dari admin.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ── ChampionCard ─────────────────────────────────────────────────── */
function ChampionCard({
  row, rank, isMe, elevated, onProfile,
}: {
  row: LeaderboardRow | null;
  rank: 1 | 2 | 3;
  isMe: boolean;
  elevated: boolean;
  onProfile: () => void;
}) {
  const cfg = PODIUM[rank];

  if (!row) {
    return (
      <div className={cn(
        "rounded-2xl border-2 border-dashed border-white/10 flex items-center justify-center text-white/20 text-[11px]",
        elevated ? "min-h-[280px] md:min-h-[320px]" : "min-h-[220px] md:min-h-[260px]",
      )}>
        #{rank}
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: elevated ? -20 : 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: (rank === 1 ? 0 : rank === 2 ? 0.1 : 0.18) }}
      className={cn(
        "rounded-2xl border backdrop-blur-sm flex flex-col overflow-hidden shadow-xl",
        cfg.cardBg, cfg.border,
        elevated && "md:scale-[1.04] z-10",
      )}
    >
      {/* Top bar: rank label */}
      <div className="flex items-center justify-between px-3 pt-3 pb-0">
        <span className={cn("text-[9px] font-bold uppercase tracking-widest", cfg.rankNumColor)}>
          #{rank}
        </span>
        <span className={cn("text-[11px] font-extrabold px-2 py-0.5 rounded-full shadow-sm", cfg.badgeBg)}>
          {cfg.rankLabel}
        </span>
      </div>

      {/* Avatar */}
      <div className="flex flex-col items-center pt-2 pb-1 px-3">
        <div className="relative">
          {rank === 1 && (
            <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-xl select-none">👑</div>
          )}
          <div className={cn(
            "rounded-full bg-gradient-to-br flex items-center justify-center text-white font-extrabold shadow-lg ring-2",
            cfg.avatarGrad, cfg.avatarRing,
            elevated
              ? "h-14 w-14 md:h-16 md:w-16 text-xl mt-3"
              : "h-10 w-10 md:h-12 md:w-12 text-base mt-2",
          )}>
            {row.name.charAt(0).toUpperCase()}
          </div>
        </div>

        <p className={cn(
          "font-extrabold text-slate-800 text-center leading-tight truncate w-full px-1 mt-2",
          elevated ? "text-[13px] md:text-[14px]" : "text-[11px] md:text-[12px]",
        )}>
          {row.name}
        </p>

        {isMe && (
          <span className="mt-0.5 text-[8px] font-bold uppercase tracking-wide bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded-full">
            Lo
          </span>
        )}
      </div>

      {/* Stats */}
      <div className="px-2.5 pb-3 flex flex-col gap-1.5 flex-1">
        {/* Points pill */}
        <div className={cn("rounded-xl px-2 py-1.5 text-center", cfg.pointsBg)}>
          <div className="text-[8px] font-semibold uppercase tracking-widest opacity-60">Poin Periode</div>
          <div className={cn(
            "font-extrabold font-mono leading-tight",
            elevated ? "text-xl md:text-2xl" : "text-lg md:text-xl",
          )}>
            {row.periodPoints}
          </div>
        </div>

        {/* Order + Lifetime */}
        <div className="grid grid-cols-2 gap-1">
          <div className="rounded-lg bg-white/60 border border-white/50 px-1.5 py-1.5 text-center">
            <div className="text-[8px] text-muted-foreground font-semibold">Order</div>
            <div className="text-[13px] font-bold font-mono text-slate-700">{row.orders}</div>
          </div>
          <div className="rounded-lg bg-white/60 border border-white/50 px-1.5 py-1.5 text-center">
            <div className="text-[8px] text-muted-foreground font-semibold">Lifetime</div>
            <div className="text-[13px] font-bold font-mono text-slate-700">{row.lifetimePoints}</div>
          </div>
        </div>

        {/* Tier badge */}
        <div className="flex justify-center">
          <AgentTierBadge tier={row.tier} size="xs" />
        </div>

        {/* Profile button */}
        {isMe ? (
          <button
            onClick={onProfile}
            className="w-full h-8 mt-0.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200/80 text-[11px] font-semibold text-slate-700 transition-all shadow-sm"
          >
            Profil Saya
          </button>
        ) : (
          <div className="h-8 mt-0.5 rounded-xl bg-white/40 border border-white/30 flex items-center justify-center">
            <span className="text-[9px] text-muted-foreground/70 font-medium tracking-wide">Mitra Temantiket</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}

/* ── SummaryCard ──────────────────────────────────────────────────── */
function SummaryCard({
  icon, iconBg, label, sub, name, value, valueColor, isMe,
}: {
  icon: ReactNode;
  iconBg: string;
  label: string;
  sub: string;
  name: string;
  value: string;
  valueColor: string;
  isMe: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="rounded-2xl border bg-white p-3.5 flex items-center gap-3 shadow-sm hover:shadow-md transition-shadow"
    >
      <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0", iconBg)}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</span>
          {isMe && (
            <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-amber-100 text-amber-700">Lo!</span>
          )}
        </div>
        <div className="text-[10px] text-muted-foreground">{sub}</div>
        <div className="text-[12px] font-bold text-slate-800 truncate mt-0.5">{name}</div>
        <div className={cn("text-[11px] font-bold font-mono", valueColor)}>{value}</div>
      </div>
    </motion.div>
  );
}
