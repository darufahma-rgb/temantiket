import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Users, ShoppingBag, Trophy, TrendingUp, Sparkles, Plus, Target,
  Megaphone, Crown, ChevronRight, Wallet, UserCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
  Draft: "bg-slate-100 text-slate-700",
  Confirmed: "bg-blue-100 text-blue-700",
  Paid: "bg-amber-100 text-amber-700",
  Completed: "bg-emerald-100 text-emerald-700",
  Cancelled: "bg-red-100 text-red-700",
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

  // Filter: orders & clients yg di-bikin sama agent ini.
  // RLS udah ngebatasin di server, tapi defense-in-depth client-side juga.
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

  // Stats
  const stats = useMemo(() => {
    const completed = myOrders.filter((o) => o.status === "Completed");
    let totalRevenue = 0;
    let totalGrossProfit = 0;
    for (const o of completed) {
      totalRevenue += revenueIDR(o);
      totalGrossProfit += profitIDR(o);
    }
    const commission = (user?.commissionPct ?? 0) / 100;
    const myEarnings = Math.round(totalGrossProfit * commission);
    return {
      totalClients: myClients.length,
      totalOrders: myOrders.length,
      completedOrders: completed.length,
      totalRevenue,
      myEarnings,
      commissionPct: user?.commissionPct ?? 0,
    };
  }, [myOrders, myClients, user?.commissionPct]);

  // Riwayat order — sorted desc by createdAt, max 12.
  const recent = useMemo(
    () => [...myOrders].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 12),
    [myOrders],
  );

  // Fee komisi akumulasi
  const feeStats = useMemo(() => {
    const total = myOrders.reduce(
      (s, o) => s + (Number((o.metadata as Record<string, unknown>).agentFee) || 0), 0,
    );
    const paid = myOrders
      .filter((o) => o.status === "Paid" || o.status === "Completed")
      .reduce((s, o) => s + (Number((o.metadata as Record<string, unknown>).agentFee) || 0), 0);
    return { total, paid, pending: total - paid };
  }, [myOrders]);

  // Portofolio produk
  const portfolio = useMemo(() => {
    const types = ["umrah", "flight", "visa_voa", "visa_student"] as const;
    const counts: Record<string, number> = Object.fromEntries(types.map((t) => [t, 0]));
    for (const o of myOrders) if (counts[o.type] !== undefined) counts[o.type]++;
    const max = Math.max(1, ...Object.values(counts));
    return types.map((t) => ({ type: t, count: counts[t], pct: counts[t] / max }));
  }, [myOrders]);

  // Rank user dibanding agent lain (basic — by total points).
  const rank = useMemo(() => {
    if (!user?.id) return { position: null as number | null, total: 0 };
    const m = sumPointsByAgent(points);
    const ranked = Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
    const idx = ranked.findIndex(([id]) => id === user.id);
    return { position: idx >= 0 ? idx + 1 : null, total: ranked.length };
  }, [points, user?.id]);

  return (
    <div className="pb-4 md:p-6 max-w-6xl md:mx-auto space-y-2.5 md:space-y-5">
      {/* Header — mitra branding */}
      <div className="rounded-xl md:rounded-3xl bg-gradient-to-br from-orange-500 via-orange-400 to-amber-400 p-2 md:p-6 text-white shadow-lg">
        <div className="flex items-start justify-between gap-2 md:flex-col md:gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[8.5px] md:text-[11px] font-semibold uppercase tracking-widest opacity-90">
              Mitra Dashboard
            </div>
            <h1 className="text-[13px] md:text-2xl font-extrabold leading-tight">
              Halo, {user?.displayName ?? "Mitra"} 👋
            </h1>
            <p className="hidden md:block text-[12.5px] opacity-90 mt-1 leading-snug">
              Pantau perkembangan klien & poin reward lo di sini.
              {stats.commissionPct > 0 && (
                <> Komisi lo: <span className="font-bold">{stats.commissionPct}%</span> per order.</>
              )}
            </p>
            {stats.commissionPct > 0 && (
              <p className="md:hidden text-[9.5px] opacity-90">Komisi: <span className="font-bold">{stats.commissionPct}%</span></p>
            )}
          </div>
          {/* Desktop buttons in flex-wrap */}
          <div className="hidden md:flex flex-wrap gap-2 shrink-0">
            <Button variant="secondary" className="bg-white/20 hover:bg-white/30 text-white border border-white/30 backdrop-blur" onClick={() => navigate("/agent/profile")}>
              <UserCircle className="h-4 w-4 mr-1" /> Profil Saya
            </Button>
            <Button variant="secondary" className="bg-white/20 hover:bg-white/30 text-white border border-white/30 backdrop-blur" onClick={() => navigate("/agent/marketing")}>
              <Megaphone className="h-4 w-4 mr-1" /> Marketing Kit
            </Button>
            <Button variant="secondary" className="bg-white/20 hover:bg-white/30 text-white border border-white/30 backdrop-blur" onClick={() => navigate("/agent/leaderboard")}>
              <Crown className="h-4 w-4 mr-1" /> Leaderboard
            </Button>
            <Button variant="secondary" className="bg-white text-orange-600 hover:bg-white/90" onClick={() => navigate("/orders")}>
              <Plus className="h-4 w-4 mr-1" /> Order Baru
            </Button>
          </div>
        </div>
        {/* Mobile: compact icon-button row */}
        <div className="md:hidden flex gap-1 mt-1.5 overflow-x-auto scrollbar-none -mx-0.5 pb-0.5">
          {[
            { icon: UserCircle, label: "Profil", path: "/agent/profile" },
            { icon: Megaphone, label: "Marketing", path: "/agent/marketing" },
            { icon: Crown, label: "Leaderboard", path: "/agent/leaderboard" },
            { icon: Plus, label: "Order Baru", path: "/orders", primary: true },
          ].map((btn) => (
            <button
              key={btn.path}
              onClick={() => navigate(btn.path)}
              className={`shrink-0 flex items-center gap-1 h-7 px-2.5 rounded-full text-[10.5px] font-semibold transition-all active:scale-95 ${
                btn.primary
                  ? "bg-white text-orange-600"
                  : "bg-white/20 text-white border border-white/25 backdrop-blur"
              }`}
            >
              <btn.icon className="h-3 w-3" />
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      {/* Hero stats — 4 cards */}
      <motion.div
        className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3"
        initial="hidden"
        animate="visible"
        variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.07, delayChildren: 0.1 } } }}
      >
        {([
          { icon: Trophy,     label: "Total Poin",   value: loadingPoints ? "…" : myPoints.toString(), accent: "from-amber-100 to-white text-amber-700 border-amber-200",   big: true,  sub: rank.position ? `Peringkat #${rank.position} dari ${rank.total} mitra` : undefined },
          { icon: Users,      label: "Total Klien",  value: stats.totalClients.toString(),              accent: "from-sky-100 to-white text-sky-700 border-sky-200" },
          { icon: ShoppingBag,label: "Total Order",  value: stats.totalOrders.toString(),               accent: "from-violet-100 to-white text-violet-700 border-violet-200", sub: `${stats.completedOrders} selesai` },
          { icon: TrendingUp, label: "Komisi Lo",    value: fmtIDR(stats.myEarnings),                   accent: "from-emerald-100 to-white text-emerald-700 border-emerald-200", sub: stats.commissionPct > 0 ? `${stats.commissionPct}% dari profit` : "Belum diatur" },
        ] as const).map((card) => (
          <motion.div
            key={card.label}
            variants={{ hidden: { opacity: 0, y: 12, scale: 0.96 }, visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] } } }}
          >
            <StatCard {...card} />
          </motion.div>
        ))}
      </motion.div>

      {/* ── Fee Komisi + Portofolio Produk ── */}
      <div className="grid grid-cols-2 md:grid-cols-2 gap-2 md:gap-4">
        {/* Fee Komisi Akumulasi */}
        <div className="rounded-xl md:rounded-2xl border border-orange-100 bg-white overflow-hidden">
          <div className="px-3 py-2 md:px-4 md:py-3 border-b border-orange-100 bg-orange-50 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Wallet className="h-3.5 w-3.5 md:h-4 md:w-4 text-orange-500" />
              <p className="text-[11.5px] md:text-[13px] font-semibold">Fee Komisi</p>
            </div>
            <button onClick={() => navigate("/agent/profile")} className="text-[9.5px] md:text-[10px] font-semibold text-orange-600 hover:underline">Detail →</button>
          </div>
          <div className="p-2.5 md:p-4 space-y-1.5 md:space-y-2">
            <div className="text-center pb-0.5">
              <div className="text-[17px] md:text-2xl font-extrabold font-mono leading-tight">{fmtIDR(feeStats.total)}</div>
              <div className="text-[9px] md:text-[10px] text-muted-foreground">total akumulasi</div>
            </div>
            <div className="grid grid-cols-2 gap-1.5 md:gap-2">
              <div className="rounded-lg md:rounded-xl bg-emerald-50 border border-emerald-100 px-2 md:px-3 py-1.5 md:py-2">
                <div className="text-[8px] md:text-[9px] text-emerald-700 font-bold uppercase tracking-wide">Terbayar</div>
                <div className="text-[11px] md:text-[13px] font-bold font-mono text-emerald-700 mt-0.5 leading-tight">{fmtIDR(feeStats.paid)}</div>
              </div>
              <div className="rounded-lg md:rounded-xl bg-amber-50 border border-amber-100 px-2 md:px-3 py-1.5 md:py-2">
                <div className="text-[8px] md:text-[9px] text-amber-700 font-bold uppercase tracking-wide">Belum Cair</div>
                <div className="text-[11px] md:text-[13px] font-bold font-mono text-amber-700 mt-0.5 leading-tight">{fmtIDR(feeStats.pending)}</div>
              </div>
            </div>
            {feeStats.total === 0 && (
              <p className="text-[9px] md:text-[10px] text-muted-foreground text-center italic">Buat order dengan fee dulu.</p>
            )}
          </div>
        </div>

        {/* Portofolio Produk */}
        <div className="rounded-xl md:rounded-2xl border bg-white overflow-hidden">
          <div className="px-3 py-2 md:px-4 md:py-3 border-b flex items-center justify-between">
            <p className="text-[11.5px] md:text-[13px] font-semibold">Portofolio</p>
            <button onClick={() => navigate("/agent/profile")} className="text-[9.5px] md:text-[10px] font-semibold text-primary hover:underline">Detail →</button>
          </div>
          <div className="p-2.5 md:p-4 space-y-2 md:space-y-2.5">
            {myOrders.length === 0 ? (
              <p className="text-[10px] md:text-[11px] text-muted-foreground text-center py-2 md:py-3 italic">Belum ada order.</p>
            ) : (
              portfolio.map(({ type, count, pct }) => (
                <div key={type}>
                  <div className="flex items-center justify-between text-[9.5px] md:text-[11px] mb-0.5 md:mb-1">
                    <span className="font-medium truncate">{ORDER_TYPE_EMOJI[type]} <span className="hidden sm:inline">{ORDER_TYPE_LABEL[type]}</span></span>
                    <span className="font-mono text-muted-foreground shrink-0 ml-1">{count}</span>
                  </div>
                  <div className="h-1 md:h-1.5 rounded-full bg-muted/40 overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-orange-400 to-amber-500 transition-all duration-700" style={{ width: `${Math.round(pct * 100)}%` }} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ── Mission Widget ── */}
      {user?.agencyId && user?.id && (
        <AgentMissionWidget agencyId={user.agencyId} agentId={user.id} />
      )}

      {/* ── Progress to Next Level + Reward Catalog ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 md:gap-4">
        <AgentTierProgress totalPoints={myPoints} />
        <RewardCatalog totalPoints={myPoints} />
      </div>

      {/* Quick CTA Marketing Kit */}
      <button
        onClick={() => navigate("/agent/marketing")}
        className="w-full text-left rounded-xl md:rounded-2xl border bg-gradient-to-r from-fuchsia-500 via-pink-500 to-rose-500 p-3 md:p-4 text-white shadow-sm hover:shadow-md transition-all active:scale-[0.99] flex items-center justify-between gap-2 md:gap-3"
      >
        <div className="flex items-center gap-2 md:gap-3">
          <div className="h-8 w-8 md:h-10 md:w-10 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur shrink-0">
            <Megaphone className="h-4 w-4 md:h-5 md:w-5" />
          </div>
          <div>
            <p className="text-[9px] md:text-[10.5px] font-semibold uppercase tracking-widest opacity-90">
              Materi Promosi Siap Pakai
            </p>
            <p className="text-[12.5px] md:text-[14px] font-extrabold leading-tight">
              Buat poster promo & download →
            </p>
            <p className="hidden md:block text-[11px] opacity-90 mt-0.5">
              Tinggal download, langsung upload ke status WA / IG / FB.
            </p>
          </div>
        </div>
        <ChevronRight className="h-4 w-4 md:h-5 md:w-5 shrink-0" />
      </button>

      {/* Riwayat Order */}
      <Card className="p-3 md:p-4">
        <div className="flex items-center justify-between mb-2.5">
          <h2 className="text-[12.5px] md:text-[13px] font-semibold flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            Riwayat Order Lo
          </h2>
          {myOrders.length > 12 && (
            <button
              className="text-[10.5px] text-primary font-semibold hover:underline"
              onClick={() => navigate("/orders")}
            >
              Semua ({myOrders.length}) →
            </button>
          )}
        </div>

        {recent.length === 0 ? (
          <div className="py-6 text-center">
            <Target className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-[12px] font-semibold">Belum ada order</p>
            <p className="text-[10.5px] text-muted-foreground mt-0.5">
              Mulai daftar klien & input order pertama lo.
            </p>
            <div className="flex justify-center gap-2 mt-3">
              <Button variant="outline" size="sm" className="h-8 text-[11px]" onClick={() => navigate("/clients")}>+ Klien</Button>
              <Button size="sm" className="h-8 text-[11px]" onClick={() => navigate("/orders")}>+ Order</Button>
            </div>
          </div>
        ) : (
          <>
            {/* Mobile: compact card-rows */}
            <div className="md:hidden divide-y">
              {recent.map((o) => {
                const earned = o.status === "Completed";
                return (
                  <button
                    key={o.id}
                    className="w-full flex items-center gap-2 py-2 text-left hover:bg-muted/30 active:bg-muted/50 transition-colors -mx-1 px-1 rounded-lg"
                    onClick={() => navigate(`/orders/detail/${o.id}`)}
                  >
                    <span className="text-base shrink-0">{ORDER_TYPE_EMOJI[o.type]}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11.5px] font-medium truncate">{o.title || ORDER_TYPE_LABEL[o.type]}</div>
                      <div className="text-[9.5px] text-muted-foreground">{new Date(o.createdAt).toLocaleDateString("id-ID", { day: "2-digit", month: "short" })}</div>
                    </div>
                    <span className={`shrink-0 px-1.5 py-0.5 rounded-full text-[9.5px] font-bold ${STATUS_COLOR[o.status]}`}>{o.status}</span>
                    <div className="text-right shrink-0 min-w-[56px]">
                      <div className="text-[10.5px] font-mono font-semibold">{fmtIDR(revenueIDR(o))}</div>
                      <div className={`text-[9.5px] font-mono ${earned ? "text-amber-600 font-bold" : "text-muted-foreground"}`}>{earned ? "+10 poin" : "—"}</div>
                    </div>
                  </button>
                );
              })}
            </div>
            {/* Desktop: table */}
            <div className="hidden md:block overflow-x-auto -mx-1">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-muted-foreground border-b">
                    <th className="text-left font-semibold py-2 px-1">Order</th>
                    <th className="text-left font-semibold py-2 px-1">Status</th>
                    <th className="text-right font-semibold py-2 px-1">Harga</th>
                    <th className="text-right font-semibold py-2 px-1">Poin</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((o) => {
                    const earned = ORDER_STATUSES.indexOf(o.status) >= 0 && o.status === "Completed";
                    return (
                      <tr key={o.id} className="border-b last:border-b-0 hover:bg-muted/40 cursor-pointer" onClick={() => navigate(`/orders/detail/${o.id}`)}>
                        <td className="py-2 px-1">
                          <div className="font-medium truncate max-w-[260px]">{ORDER_TYPE_EMOJI[o.type]} {o.title || ORDER_TYPE_LABEL[o.type]}</div>
                          <div className="text-[10.5px] text-muted-foreground">{new Date(o.createdAt).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}</div>
                        </td>
                        <td className="py-2 px-1"><span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_COLOR[o.status]}`}>{o.status}</span></td>
                        <td className="py-2 px-1 text-right font-mono">{fmtIDR(revenueIDR(o))}</td>
                        <td className={`py-2 px-1 text-right font-mono ${earned ? "text-amber-700 font-bold" : "text-muted-foreground"}`}>{earned ? "+10" : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      {/* Footer note — desktop only */}
      <div className="hidden md:block rounded-xl border bg-muted/30 p-3 text-[10.5px] text-muted-foreground leading-relaxed">
        <strong className="text-foreground">Cara dapet poin:</strong> Setiap order yang lo input dan
        statusnya berubah ke <strong>Completed</strong>, lo otomatis dapet <strong>+10 poin</strong>.
        Poin dipake buat ranking leaderboard dan reward bulanan dari admin.
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon, label, value, sub, accent, big = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  accent: string;
  big?: boolean;
}) {
  return (
    <div className={`rounded-xl md:rounded-2xl border bg-gradient-to-br p-2.5 md:p-4 ${accent}`}>
      <div className="flex items-center justify-between">
        <span className="text-[9.5px] md:text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground leading-tight">
          {label}
        </span>
        <Icon className="h-3.5 w-3.5 md:h-4 md:w-4 opacity-70 shrink-0" />
      </div>
      <div className={`mt-1 font-extrabold font-mono text-foreground ${big ? "text-xl md:text-3xl" : "text-[15px] md:text-lg"}`}>
        {value}
      </div>
      {sub && <div className="text-[9px] md:text-[10.5px] text-muted-foreground mt-0.5 leading-tight truncate">{sub}</div>}
    </div>
  );
}
