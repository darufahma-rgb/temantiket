import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Trophy, ChevronRight, Handshake } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useOrdersStore } from "@/store/ordersStore";
import { useAuthStore, type MemberInfo } from "@/store/authStore";
import {
  listAgentPoints,
  sumPointsByAgent,
  type AgentPoint,
} from "@/features/agentPoints/agentPointsRepo";
import { revenueIDR, fmtIDR, agentFeeFromMeta } from "@/lib/profit";

/**
 * MitraLeaderboardCard — Top-3 mitra preview untuk Admin Dashboard.
 * Owner-only. Dihitung dari profit bulan ini (Asia/Jakarta) + lifetime points.
 * Klik → navigate ke /reports utk full leaderboard.
 */
export function MitraLeaderboardCard() {
  const navigate = useNavigate();
  const orders = useOrdersStore((s) => s.orders);
  const fetchOrders = useOrdersStore((s) => s.fetchOrders);
  const listMembers = useAuthStore((s) => s.listMembers);

  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [points, setPoints] = useState<AgentPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetchOrders();
    let alive = true;
    void (async () => {
      try {
        const [m, p] = await Promise.all([listMembers(), listAgentPoints()]);
        if (!alive) return;
        setMembers(m);
        setPoints(p);
      } catch (err) {
        console.warn("[MitraLeaderboardCard] fetch gagal:", err);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [fetchOrders, listMembers]);

  const agentMembers = useMemo(
    () => members.filter((m) => m.role === "agent"),
    [members],
  );

  // Bulan ini (local timezone — sama kayak Reports default)
  const monthBounds = useMemo(() => {
    const now = new Date();
    return {
      from: new Date(now.getFullYear(), now.getMonth(), 1).getTime(),
      to: new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime(),
    };
  }, []);

  const top3 = useMemo(() => {
    const lifetimePoints = sumPointsByAgent(points);
    const memberById = new Map(members.map((m) => [m.userId, m]));
    const agentIds = new Set(agentMembers.map((a) => a.userId));
    const stats = new Map<
      string,
      { revenue: number; commission: number; orders: number }
    >();

    for (const o of orders) {
      if (!o.createdByAgent) continue;
      if (!agentIds.has(o.createdByAgent)) continue;
      const t = new Date(o.createdAt).getTime();
      if (t < monthBounds.from || t >= monthBounds.to) continue;
      const cur = stats.get(o.createdByAgent) ?? { revenue: 0, commission: 0, orders: 0 };
      // Gunakan revenueIDR (total penjualan) — tidak bergantung pada HPP/costPrice
      cur.revenue += revenueIDR(o);
      cur.commission += agentFeeFromMeta(o);
      cur.orders += 1;
      stats.set(o.createdByAgent, cur);
    }
    // Pastikan semua agent muncul (walau gak ada order bulan ini)
    for (const a of agentMembers) {
      if (!stats.has(a.userId)) stats.set(a.userId, { revenue: 0, commission: 0, orders: 0 });
    }

    return Array.from(stats.entries())
      .map(([agentId, v]) => {
        const member = memberById.get(agentId);
        return {
          agentId,
          name: member?.displayName ?? `Agent ${agentId.slice(0, 6)}…`,
          photoUrl: member?.photoUrl,
          revenue: v.revenue,
          orders: v.orders,
          commission: v.commission,
          lifetimePoints: lifetimePoints.get(agentId) ?? 0,
        };
      })
      .sort((a, b) => {
        if (b.revenue !== a.revenue) return b.revenue - a.revenue;
        return b.lifetimePoints - a.lifetimePoints;
      })
      .slice(0, 3);
  }, [orders, agentMembers, members, points, monthBounds]);

  // Owner yang belum punya mitra — kasih CTA invite
  if (!loading && agentMembers.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="rounded-2xl border border-dashed border-orange-200 bg-gradient-to-br from-orange-50/60 to-white p-3.5 cursor-pointer hover:border-orange-300 hover:shadow-sm transition-all"
        onClick={() => navigate("/settings?tab=agents")}
      >
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center shrink-0">
            <Handshake className="h-4.5 w-4.5" strokeWidth={2} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12.5px] font-bold text-orange-900">
              Undang Mitra (Agent) pertama lo
            </p>
            <p className="text-[10.5px] text-orange-700/80 mt-0.5 leading-snug">
              Kasih komisi per order, lacak performa, kasih reward bulanan via Leaderboard.
            </p>
          </div>
          <ChevronRight className="h-4 w-4 text-orange-400 shrink-0" />
        </div>
      </motion.div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-2xl border bg-muted/30 p-3.5 h-[88px] animate-pulse" />
    );
  }

  const medals = ["🥇", "🥈", "🥉"];
  const monthLabel = new Intl.DateTimeFormat("id-ID", {
    month: "long",
  }).format(new Date());

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-xl md:rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50/70 via-orange-50/40 to-white overflow-hidden"
    >
      <button
        type="button"
        onClick={() => navigate("/reports")}
        className="w-full px-3 pt-2 pb-1 flex items-center justify-between hover:bg-amber-50/40 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-6 w-6 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
            <Trophy className="h-3 w-3" strokeWidth={2.2} />
          </div>
          <div className="min-w-0 text-left">
            <p className="text-[11.5px] font-bold text-amber-900 leading-tight">
              Leaderboard Mitra · {monthLabel}
            </p>
            <p className="text-[9.5px] text-amber-700/70 leading-tight mt-0.5">
              {agentMembers.length} mitra · tap utk full report
            </p>
          </div>
        </div>
        <ChevronRight className="h-3.5 w-3.5 text-amber-500 shrink-0" />
      </button>

      <div className="px-2 pb-2 pt-0.5 grid grid-cols-3 gap-1.5">
        {top3.map((row, i) => (
          <div
            key={row.agentId}
            className={cn(
              "rounded-xl border p-2 bg-white/70 backdrop-blur",
              i === 0
                ? "border-amber-200"
                : i === 1
                  ? "border-slate-200"
                  : "border-orange-200",
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                {row.photoUrl ? (
                  <div className="h-5 w-5 rounded-full overflow-hidden shrink-0">
                    <img src={row.photoUrl} alt={row.name} className="h-full w-full object-cover" />
                  </div>
                ) : (
                  <span className="text-[14px] leading-none">{medals[i]}</span>
                )}
              </div>
              <span className="text-[9.5px] font-mono font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-full">
                ⭐ {row.lifetimePoints}
              </span>
            </div>
            <p className="text-[11px] font-bold text-foreground mt-1 truncate">
              {row.name}
            </p>
            <p className="text-[11px] font-mono font-extrabold mt-0.5 truncate text-emerald-700">
              {fmtIDR(row.revenue)}
            </p>
            <p className="text-[9.5px] text-muted-foreground mt-0.5">
              {row.orders} order · komisi {fmtIDR(row.commission)}
            </p>
          </div>
        ))}
        {top3.length === 0 && (
          <div className="col-span-3 py-3 text-center text-[10.5px] text-muted-foreground">
            Belum ada order via mitra bulan ini.
          </div>
        )}
      </div>
    </motion.div>
  );
}
