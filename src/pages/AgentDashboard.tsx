import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Users, ShoppingBag, Trophy, TrendingUp, Plus,
  Megaphone, Crown, ChevronRight, Wallet, UserCircle,
  Zap, BarChart2, Package, Target, ArrowUpRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/authStore";
import { useOrdersStore } from "@/store/ordersStore";
import { useClientsStore } from "@/store/clientsStore";
import { listAgentPoints, sumPointsByAgent, type AgentPoint } from "@/features/agentPoints/agentPointsRepo";
import { ORDER_TYPE_EMOJI, ORDER_TYPE_LABEL, ORDER_STATUSES, type OrderStatus } from "@/features/orders/ordersRepo";
import { revenueIDR, profitIDR, fmtIDR } from "@/lib/profit";
import { AgentTierProgress } from "@/components/AgentTierProgress";
import { RewardCatalog } from "@/components/RewardCatalog";
import { AgentMissionWidget } from "@/features/missions/AgentMissionWidget";
import { listMySubmissions, sumMissionPointsByAgent } from "@/features/missions/missionsRepo";
import type { MissionSubmission } from "@/features/missions/types";

const STATUS_COLOR: Record<OrderStatus, string> = {
  Draft:     "bg-slate-100 text-slate-600 border border-slate-200",
  Confirmed: "bg-blue-50 text-blue-700 border border-blue-200",
  Paid:      "bg-sky-50 text-sky-700 border border-sky-200",
  Completed: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  Cancelled: "bg-red-50 text-red-600 border border-red-200",
};

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1], delay: i * 0.07 },
  }),
};

export default function AgentDashboard() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { orders, fetchOrders } = useOrdersStore();
  const { clients, fetchClients } = useClientsStore();

  const [points, setPoints] = useState<AgentPoint[]>([]);
  const [missionSubs, setMissionSubs] = useState<MissionSubmission[]>([]);
  const [loadingPoints, setLoadingPoints] = useState(true);

  useEffect(() => {
    void fetchOrders();
    if (clients.length === 0) void fetchClients();
    void (async () => {
      setLoadingPoints(true);
      const p = await listAgentPoints();
      setPoints(p);
      if (user?.agencyId && user?.id) {
        const ms = await listMySubmissions(user.agencyId, user.id);
        setMissionSubs(ms);
      }
      setLoadingPoints(false);
    })();
  }, [fetchOrders, fetchClients, clients.length, user?.agencyId, user?.id]);

  const myOrders = useMemo(
    () => orders.filter((o) => o.createdByAgent === user?.id),
    [orders, user?.id],
  );
  const myClients = useMemo(
    () => clients.filter((c) => c.createdByAgent === user?.id),
    [clients, user?.id],
  );

  const myPoints = useMemo(() => {
    const orderPts = user?.id ? (sumPointsByAgent(points).get(user.id) ?? 0) : 0;
    const missionPts = user?.id ? (sumMissionPointsByAgent(missionSubs).get(user.id) ?? 0) : 0;
    return orderPts + missionPts;
  }, [points, missionSubs, user?.id]);

  const stats = useMemo(() => {
    const completed = myOrders.filter((o) => o.status === "Completed");
    let totalGrossProfit = 0;
    for (const o of completed) totalGrossProfit += profitIDR(o);
    const commission = (user?.commissionPct ?? 0) / 100;
    return {
      totalClients: myClients.length,
      totalOrders: myOrders.length,
      completedOrders: completed.length,
      myEarnings: Math.round(totalGrossProfit * commission),
      commissionPct: user?.commissionPct ?? 0,
    };
  }, [myOrders, myClients, user?.commissionPct]);

  const recent = useMemo(
    () => [...myOrders].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 12),
    [myOrders],
  );

  const feeStats = useMemo(() => {
    const total = myOrders.reduce(
      (s, o) => s + (Number((o.metadata as Record<string, unknown>).agentFee) || 0), 0,
    );
    const paid = myOrders
      .filter((o) => o.status === "Paid" || o.status === "Completed")
      .reduce((s, o) => s + (Number((o.metadata as Record<string, unknown>).agentFee) || 0), 0);
    return { total, paid, pending: total - paid };
  }, [myOrders]);

  const portfolio = useMemo(() => {
    const types = ["umrah", "flight", "visa_voa", "visa_student"] as const;
    const counts: Record<string, number> = Object.fromEntries(types.map((t) => [t, 0]));
    for (const o of myOrders) if (counts[o.type] !== undefined) counts[o.type]++;
    const max = Math.max(1, ...Object.values(counts));
    return types.map((t) => ({ type: t, count: counts[t], pct: counts[t] / max }));
  }, [myOrders]);

  const rank = useMemo(() => {
    if (!user?.id) return { position: null as number | null, total: 0 };
    const m = sumPointsByAgent(points);
    const ranked = Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
    const idx = ranked.findIndex(([id]) => id === user.id);
    return { position: idx >= 0 ? idx + 1 : null, total: ranked.length };
  }, [points, user?.id]);

  const navButtons = [
    { icon: UserCircle, label: "Profil Saya",   path: "/agent/profile" },
    { icon: Megaphone,  label: "Marketing Kit", path: "/agent/marketing" },
    { icon: Crown,      label: "Leaderboard",   path: "/agent/leaderboard" },
  ];

  return (
    <div className="pb-8 md:p-6 max-w-6xl md:mx-auto space-y-4 md:space-y-5">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="rounded-2xl md:rounded-3xl bg-gradient-to-br from-blue-600 via-blue-700 to-blue-900 p-4 md:p-7 text-white shadow-xl shadow-blue-900/20 relative overflow-hidden"
      >
        {/* Subtle geometric accent */}
        <div className="absolute top-0 right-0 w-56 h-56 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/4 pointer-events-none" />
        <div className="absolute bottom-0 left-20 w-32 h-32 bg-white/5 rounded-full translate-y-1/2 pointer-events-none" />

        <div className="relative">
          <p className="text-[10px] md:text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-200 mb-1">
            Mitra Dashboard
          </p>
          <h1 className="text-[18px] md:text-[28px] font-extrabold leading-tight">
            Halo, {user?.displayName ?? "Mitra"} 👋
          </h1>
          <p className="hidden md:block text-[13px] text-blue-200 mt-1.5">
            Pantau perkembangan klien &amp; poin reward lo di sini.
          </p>

          {/* Desktop nav buttons */}
          <div className="hidden md:flex flex-wrap gap-2 mt-5">
            {navButtons.map((btn) => (
              <button
                key={btn.path}
                onClick={() => navigate(btn.path)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-[12.5px] font-semibold bg-white/10 hover:bg-white/20 border border-white/20 backdrop-blur transition-all"
              >
                <btn.icon className="h-4 w-4 stroke-[1.5]" />
                {btn.label}
              </button>
            ))}
            <button
              onClick={() => navigate("/orders")}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-[12.5px] font-semibold bg-white text-blue-700 hover:bg-blue-50 transition-all"
            >
              <Plus className="h-4 w-4 stroke-[2]" />
              Order Baru
            </button>
          </div>

          {/* Mobile nav row */}
          <div className="md:hidden flex gap-1.5 mt-3 overflow-x-auto scrollbar-none pb-0.5">
            {navButtons.map((btn) => (
              <button
                key={btn.path}
                onClick={() => navigate(btn.path)}
                className="shrink-0 flex items-center gap-1.5 h-7 px-3 rounded-full text-[10.5px] font-semibold bg-white/15 text-white border border-white/25 transition-all active:scale-95"
              >
                <btn.icon className="h-3 w-3 stroke-[1.5]" />
                {btn.label}
              </button>
            ))}
            <button
              onClick={() => navigate("/orders")}
              className="shrink-0 flex items-center gap-1.5 h-7 px-3 rounded-full text-[10.5px] font-semibold bg-white text-blue-700 transition-all active:scale-95"
            >
              <Plus className="h-3 w-3 stroke-[2]" />
              Order Baru
            </button>
          </div>
        </div>
      </motion.div>

      {/* ── Stats Grid ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 md:gap-3">
        {([
          {
            icon: Trophy,
            label: "Total Poin",
            value: loadingPoints ? "…" : myPoints.toString(),
            sub: rank.position ? `Peringkat #${rank.position} dari ${rank.total}` : "Mulai kumpulkan poin",
            accent: "text-blue-600",
            ring: "ring-blue-100",
          },
          {
            icon: Users,
            label: "Total Klien",
            value: stats.totalClients.toString(),
            sub: "Klien aktif lo",
            accent: "text-blue-500",
            ring: "ring-blue-100",
          },
          {
            icon: ShoppingBag,
            label: "Total Order",
            value: stats.totalOrders.toString(),
            sub: `${stats.completedOrders} selesai`,
            accent: "text-blue-600",
            ring: "ring-blue-100",
          },
          {
            icon: TrendingUp,
            label: "Total Komisi",
            value: fmtIDR(feeStats.total),
            sub: "akumulasi fee komisi",
            accent: "text-blue-700",
            ring: "ring-blue-100",
          },
        ]).map((card, i) => (
          <motion.div
            key={card.label}
            custom={i}
            variants={fadeUp}
            initial="hidden"
            animate="visible"
          >
            <div className={`rounded-2xl border border-slate-100 bg-white p-3.5 md:p-5 shadow-sm hover:shadow-md transition-shadow ring-4 ${card.ring} ring-opacity-0 hover:ring-opacity-100`}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] md:text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                  {card.label}
                </p>
                <div className={`h-7 w-7 md:h-8 md:w-8 rounded-xl bg-blue-50 flex items-center justify-center ${card.accent}`}>
                  <card.icon className="h-3.5 w-3.5 md:h-4 md:w-4 stroke-[1.75]" />
                </div>
              </div>
              <p className="text-[18px] md:text-[22px] font-extrabold text-slate-800 leading-none font-mono">
                {card.value}
              </p>
              {card.sub && (
                <p className="text-[9.5px] md:text-[10.5px] text-slate-400 mt-1.5 leading-tight">{card.sub}</p>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      {/* ── Fee Komisi + Portfolio ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">

        {/* Fee Komisi */}
        <motion.div custom={4} variants={fadeUp} initial="hidden" animate="visible">
          <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-xl bg-blue-50 flex items-center justify-center">
                  <Wallet className="h-3.5 w-3.5 text-blue-600 stroke-[1.75]" />
                </div>
                <p className="text-[12.5px] font-bold text-slate-700">Fee Komisi</p>
              </div>
              <button
                onClick={() => navigate("/agent/profile")}
                className="flex items-center gap-0.5 text-[10.5px] font-semibold text-blue-600 hover:text-blue-800 transition-colors"
              >
                Detail <ArrowUpRight className="h-3 w-3 stroke-[2]" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div className="text-center py-1">
                <div className="text-[22px] md:text-[28px] font-extrabold font-mono text-slate-800 leading-tight">
                  {fmtIDR(feeStats.total)}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">total akumulasi</div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-2.5">
                  <div className="text-[9px] text-emerald-600 font-bold uppercase tracking-wide">Terbayar</div>
                  <div className="text-[13px] font-extrabold font-mono text-emerald-700 mt-0.5">{fmtIDR(feeStats.paid)}</div>
                </div>
                <div className="rounded-xl bg-blue-50 border border-blue-100 px-3 py-2.5">
                  <div className="text-[9px] text-blue-600 font-bold uppercase tracking-wide">Belum Cair</div>
                  <div className="text-[13px] font-extrabold font-mono text-blue-700 mt-0.5">{fmtIDR(feeStats.pending)}</div>
                </div>
              </div>
              {feeStats.total === 0 && (
                <p className="text-[10px] text-slate-400 text-center italic">Buat order dengan fee dulu.</p>
              )}
            </div>
          </div>
        </motion.div>

        {/* Portfolio */}
        <motion.div custom={5} variants={fadeUp} initial="hidden" animate="visible">
          <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-xl bg-blue-50 flex items-center justify-center">
                  <BarChart2 className="h-3.5 w-3.5 text-blue-600 stroke-[1.75]" />
                </div>
                <p className="text-[12.5px] font-bold text-slate-700">Portofolio</p>
              </div>
              <button
                onClick={() => navigate("/agent/profile")}
                className="flex items-center gap-0.5 text-[10.5px] font-semibold text-blue-600 hover:text-blue-800 transition-colors"
              >
                Detail <ArrowUpRight className="h-3 w-3 stroke-[2]" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              {myOrders.length === 0 ? (
                <div className="py-4 text-center">
                  <Package className="h-8 w-8 text-slate-200 mx-auto mb-2 stroke-[1.25]" />
                  <p className="text-[11px] text-slate-400 italic">Belum ada order.</p>
                </div>
              ) : (
                portfolio.map(({ type, count, pct }) => (
                  <div key={type}>
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="font-medium text-slate-600 truncate">
                        {ORDER_TYPE_EMOJI[type]}{" "}
                        <span className="hidden sm:inline">{ORDER_TYPE_LABEL[type]}</span>
                      </span>
                      <span className="font-mono font-bold text-blue-700 shrink-0 ml-2">{count}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <motion.div
                        className="h-full rounded-full bg-gradient-to-r from-blue-400 to-blue-600"
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.round(pct * 100)}%` }}
                        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </motion.div>
      </div>

      {/* ── Mission Widget ──────────────────────────────────────────────── */}
      {user?.agencyId && user?.id && (
        <AgentMissionWidget agencyId={user.agencyId} agentId={user.id} />
      )}

      {/* ── Tier + Reward Catalog ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">
        <AgentTierProgress totalPoints={myPoints} />
        <RewardCatalog totalPoints={myPoints} completedOrders={stats.completedOrders} />
      </div>

      {/* ── Marketing Kit CTA ───────────────────────────────────────────── */}
      <motion.button
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.35 }}
        onClick={() => navigate("/agent/marketing")}
        className="w-full text-left rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-600 to-blue-800 p-4 md:p-5 text-white shadow-lg shadow-blue-800/15 hover:shadow-xl hover:shadow-blue-800/20 transition-all active:scale-[0.99] flex items-center justify-between gap-3 group"
      >
        <div className="flex items-center gap-3 md:gap-4">
          <div className="h-10 w-10 md:h-12 md:w-12 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center shrink-0 backdrop-blur group-hover:bg-white/20 transition-colors">
            <Megaphone className="h-5 w-5 md:h-6 md:w-6 stroke-[1.5]" />
          </div>
          <div>
            <p className="text-[9.5px] md:text-[10.5px] font-bold uppercase tracking-[0.15em] text-blue-200 mb-0.5">
              Materi Promosi Siap Pakai
            </p>
            <p className="text-[13.5px] md:text-[15px] font-extrabold leading-snug">
              Buat poster promo &amp; download →
            </p>
            <p className="hidden md:block text-[11.5px] text-blue-200 mt-0.5">
              Tinggal download, langsung upload ke status WA / IG / FB.
            </p>
          </div>
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-blue-200 group-hover:translate-x-1 transition-transform stroke-[1.75]" />
      </motion.button>

      {/* ── Riwayat Order ───────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.42 }}
        className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden"
      >
        <div className="px-4 py-3.5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-xl bg-blue-50 flex items-center justify-center">
              <Zap className="h-3.5 w-3.5 text-blue-600 stroke-[1.75]" />
            </div>
            <h2 className="text-[12.5px] font-bold text-slate-700">Riwayat Order Lo</h2>
          </div>
          {myOrders.length > 12 && (
            <button
              className="flex items-center gap-0.5 text-[10.5px] text-blue-600 font-semibold hover:text-blue-800 transition-colors"
              onClick={() => navigate("/orders")}
            >
              Semua ({myOrders.length}) <ArrowUpRight className="h-3 w-3 stroke-[2]" />
            </button>
          )}
        </div>

        <div className="p-4">
          {recent.length === 0 ? (
            <div className="py-8 text-center">
              <div className="h-14 w-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-3">
                <Target className="h-7 w-7 text-blue-300 stroke-[1.25]" />
              </div>
              <p className="text-[12.5px] font-bold text-slate-600">Belum ada order</p>
              <p className="text-[11px] text-slate-400 mt-1">
                Mulai daftar klien &amp; input order pertama lo.
              </p>
              <div className="flex justify-center gap-2 mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-[11px] rounded-xl border-blue-200 text-blue-700 hover:bg-blue-50"
                  onClick={() => navigate("/clients")}
                >
                  + Klien
                </Button>
                <Button
                  size="sm"
                  className="h-8 text-[11px] rounded-xl bg-blue-600 hover:bg-blue-700"
                  onClick={() => navigate("/orders")}
                >
                  + Order
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* Mobile: compact list */}
              <div className="md:hidden divide-y divide-slate-50">
                {recent.map((o) => (
                  <button
                    key={o.id}
                    className="w-full flex items-center gap-2.5 py-2.5 text-left hover:bg-slate-50 active:bg-slate-100 transition-colors -mx-1 px-1 rounded-xl"
                    onClick={() => navigate(`/orders/detail/${o.id}`)}
                  >
                    <span className="text-[15px] shrink-0">{ORDER_TYPE_EMOJI[o.type]}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11.5px] font-semibold text-slate-700 truncate">
                        {o.title || ORDER_TYPE_LABEL[o.type]}
                      </div>
                      <div className="text-[9.5px] text-slate-400">
                        {new Date(o.createdAt).toLocaleDateString("id-ID", { day: "2-digit", month: "short" })}
                      </div>
                    </div>
                    <span className={`shrink-0 px-2 py-0.5 rounded-full text-[9px] font-bold ${STATUS_COLOR[o.status]}`}>
                      {o.status}
                    </span>
                    <div className="text-right shrink-0 min-w-[60px]">
                      <div className="text-[10.5px] font-mono font-bold text-slate-700">{fmtIDR(revenueIDR(o))}</div>
                      <div className={`text-[9px] font-mono ${o.status === "Completed" ? "text-blue-600 font-bold" : "text-slate-300"}`}>
                        {o.status === "Completed" ? "+10 pts" : "—"}
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {/* Desktop: clean table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-slate-400 border-b border-slate-100">
                      <th className="text-left font-semibold py-2.5 px-1 uppercase tracking-wide text-[10px]">Order</th>
                      <th className="text-left font-semibold py-2.5 px-1 uppercase tracking-wide text-[10px]">Status</th>
                      <th className="text-right font-semibold py-2.5 px-1 uppercase tracking-wide text-[10px]">Harga</th>
                      <th className="text-right font-semibold py-2.5 px-1 uppercase tracking-wide text-[10px]">Poin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map((o) => {
                      const earned = o.status === "Completed";
                      return (
                        <tr
                          key={o.id}
                          className="border-b border-slate-50 last:border-0 hover:bg-blue-50/40 cursor-pointer transition-colors"
                          onClick={() => navigate(`/orders/detail/${o.id}`)}
                        >
                          <td className="py-3 px-1">
                            <div className="font-semibold text-slate-700 truncate max-w-[260px]">
                              {ORDER_TYPE_EMOJI[o.type]} {o.title || ORDER_TYPE_LABEL[o.type]}
                            </div>
                            <div className="text-[10.5px] text-slate-400 mt-0.5">
                              {new Date(o.createdAt).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}
                            </div>
                          </td>
                          <td className="py-3 px-1">
                            <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${STATUS_COLOR[o.status]}`}>
                              {o.status}
                            </span>
                          </td>
                          <td className="py-3 px-1 text-right font-mono font-semibold text-slate-700">
                            {fmtIDR(revenueIDR(o))}
                          </td>
                          <td className={`py-3 px-1 text-right font-mono font-bold ${earned ? "text-blue-600" : "text-slate-200"}`}>
                            {earned ? "+10" : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </motion.div>

      {/* ── Footer tip ──────────────────────────────────────────────────── */}
      <div className="hidden md:flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50/60 p-4 text-[11px] text-slate-500 leading-relaxed">
        <div className="h-6 w-6 rounded-lg bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
          <Zap className="h-3.5 w-3.5 text-blue-500 stroke-[1.75]" />
        </div>
        <p>
          <strong className="text-slate-700">Cara dapet poin:</strong>{" "}
          Setiap order yang lo input dan statusnya berubah ke{" "}
          <strong className="text-emerald-600">Completed</strong>, lo otomatis dapet{" "}
          <strong className="text-blue-700">+10 poin</strong>.
          Poin dipake buat ranking leaderboard dan reward bulanan dari admin.
        </p>
      </div>

    </div>
  );
}
