import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Trophy, Crown, ChevronLeft, Sparkles, Calendar } from "lucide-react";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
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
import { revenueIDR } from "@/lib/profit";
import { cn } from "@/lib/utils";

type RangeKey = "this_month" | "last_month" | "this_year" | "all";

const RANGE_LABEL: Record<RangeKey, string> = {
  this_month: "Bulan ini",
  last_month: "Bulan lalu",
  this_year: "Tahun ini",
  all: "Sepanjang masa",
};

function rangeBounds(key: RangeKey): { from: number; to: number } | null {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (key) {
    case "this_month":
      return { from: new Date(y, m, 1).getTime(), to: new Date(y, m + 1, 1).getTime() };
    case "last_month":
      return { from: new Date(y, m - 1, 1).getTime(), to: new Date(y, m, 1).getTime() };
    case "this_year":
      return { from: new Date(y, 0, 1).getTime(), to: new Date(y + 1, 0, 1).getTime() };
    case "all":
    default:
      return null;
  }
}

/**
 * AgentLeaderboard — halaman publik utk semua mitra (role=agent).
 * Tujuan: gamification — mitra bisa lihat ranking sendiri, kompetisi sehat.
 *
 * Yang ditampilkan:
 *   - Podium 3 besar (visual yg gede + bling)
 *   - Tabel full ranking dgn tier badge, profit, order, poin
 *   - Highlight row mitra yg lagi login
 *   - Filter periode (bulan ini, bulan lalu, tahun ini, all-time)
 *
 * Catat: angka komisi & detail finansial agen lain DISEMBUNYIKAN — privacy.
 * Yg dipublikasiin: jumlah order, poin, dan ranking. Profit cuma utk diri sendiri.
 */
export default function AgentLeaderboard() {
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.user);
  const listMembers = useAuthStore((s) => s.listMembers);
  const { orders, fetchOrders } = useOrdersStore();

  const [range, setRange] = useState<RangeKey>("this_month");
  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [points, setPoints] = useState<AgentPoint[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshPoints = useCallback(async () => {
    try {
      const p = await listAgentPoints();
      setPoints(p);
    } catch (err) {
      console.warn("[AgentLeaderboard] refresh points gagal:", err);
    }
  }, []);

  useEffect(() => {
    void fetchOrders();
    void (async () => {
      try {
        const [m, p] = await Promise.all([listMembers(), listAgentPoints()]);
        setMembers(m);
        setPoints(p);
      } catch (err) {
        console.warn("[AgentLeaderboard] fetch gagal:", err);
      } finally {
        setLoading(false);
      }
    })();

    // Real-time: refresh points whenever agent_points tabel berubah
    const unsub = onAgentPointsChanged(() => { void refreshPoints(); });
    return unsub;
  }, [fetchOrders, listMembers, refreshPoints]);

  const agentMembers = useMemo(
    () => members.filter((m) => m.role === "agent"),
    [members],
  );
  const memberById = useMemo(
    () => new Map(members.map((m) => [m.userId, m])),
    [members],
  );

  const bounds = useMemo(() => rangeBounds(range), [range]);

  // Filter orders by range
  const periodOrders = useMemo(() => {
    if (!bounds) return orders;
    return orders.filter((o) => {
      const t = new Date(o.createdAt).getTime();
      return t >= bounds.from && t < bounds.to;
    });
  }, [orders, bounds]);

  // Filter points by range juga (utk poin periodik)
  const periodPoints = useMemo(() => {
    if (!bounds) return points;
    return points.filter((p) => {
      const t = new Date(p.awardedAt).getTime();
      return t >= bounds.from && t < bounds.to;
    });
  }, [points, bounds]);

  // Build leaderboard rows
  const rows = useMemo(() => {
    const lifetime = sumPointsByAgent(points);
    const periodic = sumPointsByAgent(periodPoints);
    const agentIds = new Set(agentMembers.map((a) => a.userId));
    const stats = new Map<string, { revenue: number; orders: number }>();
    for (const o of periodOrders) {
      if (!o.createdByAgent) continue;
      if (!agentIds.has(o.createdByAgent)) continue;
      const cur = stats.get(o.createdByAgent) ?? { revenue: 0, orders: 0 };
      // Gunakan revenueIDR (total penjualan), bukan profitIDR, agar tidak
      // bergantung pada HPP/costPrice yang mungkin belum diisi
      cur.revenue += revenueIDR(o);
      cur.orders += 1;
      stats.set(o.createdByAgent, cur);
    }
    // Pastiin semua agent muncul, walau tidak ada order/poin di periode
    for (const a of agentMembers) {
      if (!stats.has(a.userId)) stats.set(a.userId, { revenue: 0, orders: 0 });
    }

    return Array.from(stats.entries())
      .map(([agentId, v]) => {
        const member = memberById.get(agentId);
        return {
          agentId,
          name: member?.displayName ?? `Agent ${agentId.slice(0, 6)}…`,
          isMe: agentId === me?.id,
          orders: v.orders,
          // revenue ditampilin hanya utk row sendiri (privacy)
          revenue: v.revenue,
          periodPoints: periodic.get(agentId) ?? 0,
          lifetimePoints: lifetime.get(agentId) ?? 0,
          tier: getTierInfo(lifetime.get(agentId) ?? 0).current.key,
        };
      })
      .sort((a, b) => {
        // Sort by period points desc, then orders desc, then lifetime points desc
        if (b.periodPoints !== a.periodPoints) return b.periodPoints - a.periodPoints;
        if (b.orders !== a.orders) return b.orders - a.orders;
        return b.lifetimePoints - a.lifetimePoints;
      });
  }, [periodOrders, periodPoints, points, agentMembers, memberById, me?.id]);

  const myRank = useMemo(() => {
    const idx = rows.findIndex((r) => r.agentId === me?.id);
    return idx >= 0 ? idx + 1 : null;
  }, [rows, me?.id]);

  const top3 = rows.slice(0, 3);
  const rest = rows.slice(3);

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/agent")}
            className="h-8 w-8 p-0"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl md:text-2xl font-extrabold flex items-center gap-2">
              <Trophy className="h-5 w-5 text-amber-500" />
              Leaderboard Mitra
            </h1>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              Ranking mitra paling aktif · {RANGE_LABEL[range]}
              {myRank && (
                <> · <span className="font-bold text-amber-700">Lo di posisi #{myRank}</span></>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <Select value={range} onValueChange={(v) => setRange(v as RangeKey)}>
            <SelectTrigger className="w-[170px] h-9 text-[12.5px]">
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

      {/* Podium 3 besar */}
      {top3.length > 0 && (
        <div className="grid grid-cols-3 gap-2 md:gap-3">
          {/* Position 2 */}
          <PodiumCard
            row={top3[1] ?? null}
            position={2}
            heightCls="h-32 md:h-40"
            medal="🥈"
            accent="from-slate-300 to-slate-500"
          />
          {/* Position 1 (tallest, center) */}
          <PodiumCard
            row={top3[0] ?? null}
            position={1}
            heightCls="h-40 md:h-52"
            medal="🥇"
            accent="from-yellow-400 to-amber-600"
            crown
          />
          {/* Position 3 */}
          <PodiumCard
            row={top3[2] ?? null}
            position={3}
            heightCls="h-28 md:h-36"
            medal="🥉"
            accent="from-orange-400 to-amber-700"
          />
        </div>
      )}

      {/* Full ranking table */}
      <Card className="p-3 md:p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[13px] font-bold flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-fuchsia-500" />
            Full Ranking
          </h2>
          <span className="text-[10.5px] text-muted-foreground">
            {rows.length} mitra · poin {RANGE_LABEL[range].toLowerCase()}
          </span>
        </div>

        {loading ? (
          <div className="py-10 text-center text-[12px] text-muted-foreground italic">
            Memuat data leaderboard…
          </div>
        ) : rows.length === 0 ? (
          <div className="py-10 text-center">
            <Trophy className="h-9 w-9 mx-auto text-muted-foreground mb-2" />
            <p className="text-[12.5px] font-semibold">Belum ada mitra terdaftar</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Hubungi admin agency lo untuk daftar jadi mitra.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-muted-foreground border-b">
                  <th className="text-left font-semibold py-2 px-1 w-10">#</th>
                  <th className="text-left font-semibold py-2 px-1">Mitra</th>
                  <th className="text-right font-semibold py-2 px-1">Order</th>
                  <th className="text-right font-semibold py-2 px-1">⭐ Periode</th>
                  <th className="text-right font-semibold py-2 px-1">⭐ Lifetime</th>
                </tr>
              </thead>
              <tbody>
                {rest.map((r, i) => (
                  <tr
                    key={r.agentId}
                    className={cn(
                      "border-b last:border-b-0 transition-colors",
                      r.isMe
                        ? "bg-amber-50/60 hover:bg-amber-50"
                        : "hover:bg-muted/40",
                    )}
                  >
                    <td className="py-2 px-1 text-muted-foreground font-mono text-[11px]">
                      {i + 4}
                    </td>
                    <td className="py-2 px-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={cn(
                          "font-semibold truncate max-w-[180px]",
                          r.isMe && "text-amber-800",
                        )}>
                          {r.name}
                          {r.isMe && (
                            <span className="ml-1.5 text-[9.5px] font-bold uppercase tracking-wide bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                              Lo
                            </span>
                          )}
                        </span>
                        <AgentTierBadge tier={r.tier} size="xs" />
                      </div>
                    </td>
                    <td className="py-2 px-1 text-right font-mono">{r.orders}</td>
                    <td className="py-2 px-1 text-right font-mono font-bold text-fuchsia-700">
                      {r.periodPoints}
                    </td>
                    <td className="py-2 px-1 text-right font-mono font-bold text-amber-700">
                      {r.lifetimePoints}
                    </td>
                  </tr>
                ))}
                {rest.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-muted-foreground text-[11.5px] italic">
                      Cuma top-3 yg ada di periode ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Footer note */}
      <div className="rounded-xl border bg-muted/30 p-3 text-[10.5px] text-muted-foreground leading-relaxed">
        <strong className="text-foreground">Cara naik ranking:</strong> Daftarkan klien baru,
        bantu mereka order, dan pastiin order naik ke status <strong>Completed</strong>. Tiap
        order Completed = +10 poin; +20 poin bonus jika dapat komisi. Top performer dapet reward bulanan dari admin.
      </div>
    </div>
  );
}

interface PodiumRow {
  name: string;
  isMe: boolean;
  orders: number;
  periodPoints: number;
  lifetimePoints: number;
  tier: ReturnType<typeof getTierInfo>["current"]["key"];
}

function PodiumCard({
  row,
  position,
  heightCls,
  medal,
  accent,
  crown = false,
}: {
  row: PodiumRow | null;
  position: number;
  heightCls: string;
  medal: string;
  accent: string;
  crown?: boolean;
}) {
  if (!row) {
    return (
      <div className="flex flex-col items-center justify-end">
        <div className={cn(
          "w-full rounded-2xl border-2 border-dashed border-muted bg-muted/20 flex items-center justify-center",
          heightCls,
        )}>
          <span className="text-[10.5px] text-muted-foreground italic">#{position}</span>
        </div>
      </div>
    );
  }
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: position * 0.07 }}
      className="flex flex-col items-center justify-end"
    >
      <div className="text-center mb-2 px-1">
        {crown && <Crown className="h-4 w-4 text-amber-500 mx-auto mb-0.5" />}
        <p className={cn(
          "font-extrabold truncate max-w-[140px] mx-auto",
          crown ? "text-[13.5px]" : "text-[12px]",
        )}>
          {row.name}
        </p>
        <div className="flex items-center justify-center gap-1 mt-0.5">
          <AgentTierBadge tier={row.tier} size="xs" />
          {row.isMe && (
            <span className="text-[9.5px] font-bold uppercase tracking-wide bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
              Lo
            </span>
          )}
        </div>
      </div>
      <div
        className={cn(
          "w-full rounded-t-2xl bg-gradient-to-b text-white p-2.5 flex flex-col items-center justify-end shadow-md",
          accent,
          heightCls,
        )}
      >
        <div className={cn("leading-none", crown ? "text-4xl md:text-5xl" : "text-3xl md:text-4xl")}>
          {medal}
        </div>
        <div className="text-center mt-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide opacity-90">
            ⭐ Poin
          </p>
          <p className={cn("font-extrabold font-mono leading-none", crown ? "text-2xl md:text-3xl" : "text-xl md:text-2xl")}>
            {row.periodPoints}
          </p>
          <p className="text-[10px] mt-1 opacity-90">{row.orders} order</p>
        </div>
      </div>
    </motion.div>
  );
}
