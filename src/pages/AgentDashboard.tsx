import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Users, ShoppingBag, Trophy, TrendingUp, Sparkles, Plus, Target,
  Megaphone, Crown, ChevronRight,
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

  // Rank user dibanding agent lain (basic — by total points).
  const rank = useMemo(() => {
    if (!user?.id) return { position: null as number | null, total: 0 };
    const m = sumPointsByAgent(points);
    const ranked = Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
    const idx = ranked.findIndex(([id]) => id === user.id);
    return { position: idx >= 0 ? idx + 1 : null, total: ranked.length };
  }, [points, user?.id]);

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-5">
      {/* Header — mitra branding */}
      <div className="rounded-3xl bg-gradient-to-br from-orange-500 via-orange-400 to-amber-400 p-5 md:p-6 text-white shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-widest opacity-90">
              Mitra Dashboard
            </div>
            <h1 className="text-xl md:text-2xl font-extrabold mt-0.5">
              Halo, {user?.displayName ?? "Mitra"} 👋
            </h1>
            <p className="text-[12.5px] opacity-90 mt-1 leading-snug">
              Pantau perkembangan klien & poin reward lo di sini.
              {stats.commissionPct > 0 && (
                <> Komisi lo: <span className="font-bold">{stats.commissionPct}%</span> per order.</>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Button
              variant="secondary"
              className="bg-white/20 hover:bg-white/30 text-white border border-white/30 backdrop-blur"
              onClick={() => navigate("/agent/marketing")}
            >
              <Megaphone className="h-4 w-4 mr-1" /> Marketing Kit
            </Button>
            <Button
              variant="secondary"
              className="bg-white/20 hover:bg-white/30 text-white border border-white/30 backdrop-blur"
              onClick={() => navigate("/agent/leaderboard")}
            >
              <Crown className="h-4 w-4 mr-1" /> Leaderboard
            </Button>
            <Button
              variant="secondary"
              className="bg-white text-orange-600 hover:bg-white/90"
              onClick={() => navigate("/orders")}
            >
              <Plus className="h-4 w-4 mr-1" /> Order Baru
            </Button>
          </div>
        </div>
      </div>

      {/* Hero stats — 4 cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon={Trophy}
          label="Total Poin"
          value={loadingPoints ? "…" : myPoints.toString()}
          accent="from-amber-100 to-white text-amber-700 border-amber-200"
          big
          sub={rank.position ? `Peringkat #${rank.position} dari ${rank.total} mitra` : undefined}
        />
        <StatCard
          icon={Users}
          label="Total Klien"
          value={stats.totalClients.toString()}
          accent="from-sky-100 to-white text-sky-700 border-sky-200"
        />
        <StatCard
          icon={ShoppingBag}
          label="Total Order"
          value={stats.totalOrders.toString()}
          sub={`${stats.completedOrders} selesai`}
          accent="from-violet-100 to-white text-violet-700 border-violet-200"
        />
        <StatCard
          icon={TrendingUp}
          label="Komisi Lo"
          value={fmtIDR(stats.myEarnings)}
          sub={stats.commissionPct > 0 ? `${stats.commissionPct}% dari profit` : "Belum diatur"}
          accent="from-emerald-100 to-white text-emerald-700 border-emerald-200"
        />
      </div>

      {/* ── Mission Widget ── */}
      {user?.agencyId && user?.id && (
        <AgentMissionWidget agencyId={user.agencyId} agentId={user.id} />
      )}

      {/* ── Progress to Next Level + Reward Catalog ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <AgentTierProgress totalPoints={myPoints} />
        <RewardCatalog totalPoints={myPoints} />
      </div>

      {/* Quick CTA Marketing Kit */}
      <button
        onClick={() => navigate("/agent/marketing")}
        className="w-full text-left rounded-2xl border bg-gradient-to-r from-fuchsia-500 via-pink-500 to-rose-500 p-4 text-white shadow-sm hover:shadow-md transition-all hover:scale-[1.005] flex items-center justify-between gap-3"
      >
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur shrink-0">
            <Megaphone className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-widest opacity-90">
              Materi Promosi Siap Pakai
            </p>
            <p className="text-[14px] font-extrabold leading-tight">
              Buat poster promo dengan nama & WA lo →
            </p>
            <p className="text-[11px] opacity-90 mt-0.5">
              Tinggal download, langsung upload ke status WA / IG / FB.
            </p>
          </div>
        </div>
        <ChevronRight className="h-5 w-5 shrink-0" />
      </button>

      {/* Riwayat Order */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[13px] font-semibold flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            Riwayat Order Lo
          </h2>
          {myOrders.length > 12 && (
            <button
              className="text-[11px] text-primary font-semibold hover:underline"
              onClick={() => navigate("/orders")}
            >
              Lihat semua ({myOrders.length}) →
            </button>
          )}
        </div>

        {recent.length === 0 ? (
          <div className="py-8 text-center">
            <Target className="h-9 w-9 mx-auto text-muted-foreground mb-2" />
            <p className="text-[13px] font-semibold">Belum ada order</p>
            <p className="text-[11.5px] text-muted-foreground mt-0.5">
              Mulai daftar klien & input order pertama lo di sini.
            </p>
            <div className="flex justify-center gap-2 mt-3">
              <Button variant="outline" size="sm" onClick={() => navigate("/clients")}>
                + Klien
              </Button>
              <Button size="sm" onClick={() => navigate("/orders")}>
                + Order
              </Button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-1">
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
                    <tr
                      key={o.id}
                      className="border-b last:border-b-0 hover:bg-muted/40 cursor-pointer"
                      onClick={() => navigate(`/orders/detail/${o.id}`)}
                    >
                      <td className="py-2 px-1">
                        <div className="font-medium truncate max-w-[260px]">
                          {ORDER_TYPE_EMOJI[o.type]} {o.title || ORDER_TYPE_LABEL[o.type]}
                        </div>
                        <div className="text-[10.5px] text-muted-foreground">
                          {new Date(o.createdAt).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}
                        </div>
                      </td>
                      <td className="py-2 px-1">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_COLOR[o.status]}`}>
                          {o.status}
                        </span>
                      </td>
                      <td className="py-2 px-1 text-right font-mono">{fmtIDR(revenueIDR(o))}</td>
                      <td className={`py-2 px-1 text-right font-mono ${earned ? "text-amber-700 font-bold" : "text-muted-foreground"}`}>
                        {earned ? "+10" : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Footer note */}
      <div className="rounded-xl border bg-muted/30 p-3 text-[10.5px] text-muted-foreground leading-relaxed">
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
    <div className={`rounded-2xl border bg-gradient-to-br p-3 md:p-4 ${accent}`}>
      <div className="flex items-center justify-between">
        <span className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <Icon className="h-4 w-4 opacity-70" />
      </div>
      <div className={`mt-1.5 font-extrabold font-mono text-foreground ${big ? "text-2xl md:text-3xl" : "text-base md:text-lg"}`}>
        {value}
      </div>
      {sub && <div className="text-[10.5px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}
