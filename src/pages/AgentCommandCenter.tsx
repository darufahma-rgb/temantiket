import { useEffect, useMemo, useState } from "react";
import {
  Users, Trophy, Wallet, TrendingUp, ShieldCheck, Edit2, Check, X,
  ChevronDown, ChevronUp, BarChart3, Crown, Zap, RefreshCw, Target,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useAuthStore, type MemberInfo } from "@/store/authStore";
import { useOrdersStore } from "@/store/ordersStore";
import { useClientsStore } from "@/store/clientsStore";
import { listAgentPoints, sumPointsByAgent, type AgentPoint } from "@/features/agentPoints/agentPointsRepo";
import { listSubmissions, sumMissionPointsByAgent } from "@/features/missions/missionsRepo";
import type { MissionSubmission } from "@/features/missions/types";
import { getTierInfo, TIERS } from "@/features/agentPoints/agentTiers";
import { profitIDR, revenueIDR, fmtIDR } from "@/lib/profit";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { MissionCreatorSection } from "@/features/missions/MissionCreatorSection";

const M = { fontFamily: "'Manrope', sans-serif" };

// ── Color palette per agent (cycling) ──
const AGENT_COLORS = [
  "#0ea5e9", "#f97316", "#10b981", "#8b5cf6",
  "#ec4899", "#f59e0b", "#14b8a6", "#ef4444",
];

// ── Helper ─────────────────────────────────────────────────────────────────────
function TierBadge({ points }: { points: number }) {
  const { current } = getTierInfo(points);
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-bold ${current.softBg} ${current.softText}`}
    >
      {current.emoji} {current.label}
    </span>
  );
}

function SummaryCard({
  label, value, sub, icon: Icon, tone,
}: {
  label: string; value: string; sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "blue" | "emerald" | "amber" | "violet";
}) {
  const toneMap = {
    blue: "from-sky-50 to-white border-sky-100 text-sky-700",
    emerald: "from-emerald-50 to-white border-emerald-100 text-emerald-700",
    amber: "from-amber-50 to-white border-amber-100 text-amber-700",
    violet: "from-violet-50 to-white border-violet-100 text-violet-700",
  }[tone];
  return (
    <div className={`rounded-2xl border bg-gradient-to-br p-3 md:p-4 ${toneMap}`} style={M}>
      <div className="flex items-center justify-between">
        <span className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
        <Icon className="h-4 w-4 opacity-60" />
      </div>
      <div className="mt-1.5 text-xl md:text-2xl font-extrabold font-mono">{value}</div>
      {sub && <div className="text-[10.5px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function AgentCommandCenter() {
  const user = useAuthStore((s) => s.user);
  const listMembers = useAuthStore((s) => s.listMembers);
  const setMemberCommission = useAuthStore((s) => s.setMemberCommission);
  const { orders, fetchOrders } = useOrdersStore();
  const { clients, fetchClients } = useClientsStore();

  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [points, setPoints] = useState<AgentPoint[]>([]);
  const [missionSubs, setMissionSubs] = useState<MissionSubmission[]>([]);
  const [loading, setLoading] = useState(true);

  // Edit commission state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftPct, setDraftPct] = useState<number>(0);
  const [saving, setSaving] = useState(false);

  // Commission tracker expanded agent
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

  // Agent sort
  type SortKey = "name" | "points" | "orders" | "commission" | "clients";
  const [sortKey, setSortKey] = useState<SortKey>("points");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // ── Data loading ────────────────────────────────────────────────────────────
  const load = async () => {
    setLoading(true);
    try {
      const agencyId = user?.agencyId;
      const [m, p, ms] = await Promise.all([
        listMembers(),
        listAgentPoints(),
        agencyId ? listSubmissions(agencyId) : Promise.resolve([]),
      ]);
      setMembers(m);
      setPoints(p);
      setMissionSubs(ms);
      await Promise.all([fetchOrders(), fetchClients()]);
    } catch (err) {
      console.warn("[agent-center] load failed:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived data ─────────────────────────────────────────────────────────────
  const agentMembers = useMemo(() => members.filter((m) => m.role === "agent"), [members]);

  const pointsByAgent = useMemo(() => {
    const orderPts = sumPointsByAgent(points);
    const missionPts = sumMissionPointsByAgent(missionSubs);
    const combined = new Map(orderPts);
    for (const [agentId, pts] of missionPts) {
      combined.set(agentId, (combined.get(agentId) ?? 0) + pts);
    }
    return combined;
  }, [points, missionSubs]);

  // Client count per agent
  const clientCountByAgent = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of clients) {
      if (c.createdByAgent) m.set(c.createdByAgent, (m.get(c.createdByAgent) ?? 0) + 1);
    }
    return m;
  }, [clients]);

  // All orders per agent
  const ordersByAgent = useMemo(() => {
    const m = new Map<string, typeof orders>();
    for (const o of orders) {
      if (!o.createdByAgent) continue;
      const cur = m.get(o.createdByAgent) ?? [];
      cur.push(o);
      m.set(o.createdByAgent, cur);
    }
    return m;
  }, [orders]);

  // Full agent rows
  const agentRows = useMemo(() => {
    return agentMembers.map((a, idx) => {
      const totalPoints = pointsByAgent.get(a.userId) ?? 0;
      const tierInfo = getTierInfo(totalPoints);
      const agentOrders = ordersByAgent.get(a.userId) ?? [];
      const completedOrders = agentOrders.filter((o) => o.status === "Completed");
      const totalRevenue = agentOrders.reduce((s, o) => s + revenueIDR(o), 0);
      const totalProfit = completedOrders.reduce((s, o) => {
        const p = profitIDR(o);
        return s + Math.max(0, p);
      }, 0);
      const commissionOwed = totalProfit * ((a.commissionPct ?? 0) / 100);
      return {
        ...a,
        totalPoints,
        tierInfo,
        clientCount: clientCountByAgent.get(a.userId) ?? 0,
        totalOrders: agentOrders.length,
        completedOrders: completedOrders.length,
        totalRevenue,
        totalProfit,
        commissionOwed,
        color: AGENT_COLORS[idx % AGENT_COLORS.length],
        completedOrdersList: completedOrders,
      };
    });
  }, [agentMembers, pointsByAgent, ordersByAgent, clientCountByAgent]);

  // Sort agent rows
  const sortedAgentRows = useMemo(() => {
    const rows = [...agentRows];
    rows.sort((a, b) => {
      let diff = 0;
      if (sortKey === "name") diff = a.displayName.localeCompare(b.displayName);
      else if (sortKey === "points") diff = a.totalPoints - b.totalPoints;
      else if (sortKey === "orders") diff = a.totalOrders - b.totalOrders;
      else if (sortKey === "commission") diff = a.commissionOwed - b.commissionOwed;
      else if (sortKey === "clients") diff = a.clientCount - b.clientCount;
      return sortDir === "desc" ? -diff : diff;
    });
    return rows;
  }, [agentRows, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortKey(key); setSortDir("desc"); }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <span className="opacity-30 ml-0.5 text-[10px]">↕</span>;
    return <span className="ml-0.5 text-[10px] text-blue-600">{sortDir === "desc" ? "↓" : "↑"}</span>;
  }

  // ── Summary totals ──────────────────────────────────────────────────────────
  const totalCommissionOwed = useMemo(
    () => agentRows.reduce((s, a) => s + a.commissionOwed, 0),
    [agentRows],
  );
  const totalAgentRevenue = useMemo(
    () => agentRows.reduce((s, a) => s + a.totalRevenue, 0),
    [agentRows],
  );
  const avgPoints = useMemo(
    () => agentRows.length > 0 ? Math.round(agentRows.reduce((s, a) => s + a.totalPoints, 0) / agentRows.length) : 0,
    [agentRows],
  );

  // ── Monthly performance chart data (last 6 months) ─────────────────────────
  const chartData = useMemo(() => {
    const months: { label: string; from: Date; to: Date }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(new Date(), i);
      months.push({
        label: format(startOfMonth(d), "MMM yy", { locale: idLocale }),
        from: startOfMonth(d),
        to: endOfMonth(d),
      });
    }
    return months.map(({ label, from, to }) => {
      const row: Record<string, string | number> = { month: label };
      for (const a of agentRows) {
        const count = (ordersByAgent.get(a.userId) ?? []).filter((o) => {
          const t = new Date(o.createdAt).getTime();
          return t >= from.getTime() && t <= to.getTime();
        }).length;
        row[a.displayName] = count;
      }
      return row;
    });
  }, [agentRows, ordersByAgent]);

  // ── Commission save ─────────────────────────────────────────────────────────
  async function saveCommission(agentId: string) {
    setSaving(true);
    try {
      await setMemberCommission(agentId, Math.max(0, Math.min(100, draftPct)));
      setMembers((prev) => prev.map((m) => m.userId === agentId ? { ...m, commissionPct: draftPct } : m));
      toast.success("Komisi diperbarui!");
      setEditingId(null);
    } catch {
      toast.error("Gagal simpan komisi. Coba lagi.");
    } finally {
      setSaving(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5" style={M}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <Crown className="h-5 w-5 text-primary" />
            Agent Command Center
          </h1>
          <p className="text-[12px] text-muted-foreground mt-0.5 flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-blue-600" />
            Owner only · {agentMembers.length} mitra terdaftar
            {user?.agencyName && <> · {user.agencyName}</>}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => load()}
          disabled={loading}
          className="rounded-xl border-sky-200 text-sky-700 hover:bg-sky-50 self-start md:self-auto"
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* ── Summary Cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard
          label="Total Mitra"
          value={String(agentMembers.length)}
          sub={`${agentRows.filter((a) => a.tierInfo.current.key !== "bronze").length} sudah naik tier`}
          icon={Users}
          tone="blue"
        />
        <SummaryCard
          label="Komisi Harus Dibayar"
          value={fmtIDR(totalCommissionOwed)}
          sub="dari order Completed"
          icon={Wallet}
          tone="amber"
        />
        <SummaryCard
          label="Total Revenue Mitra"
          value={fmtIDR(totalAgentRevenue)}
          sub={`${agentRows.reduce((s, a) => s + a.totalOrders, 0)} order total`}
          icon={TrendingUp}
          tone="emerald"
        />
        <SummaryCard
          label="Rata-rata Poin"
          value={String(avgPoints)}
          sub="per mitra aktif"
          icon={Trophy}
          tone="violet"
        />
      </div>

      {loading && (
        <Card className="p-10 text-center">
          <RefreshCw className="h-8 w-8 mx-auto text-muted-foreground animate-spin mb-3" />
          <p className="text-[12px] text-muted-foreground">Memuat data mitra…</p>
        </Card>
      )}

      {!loading && agentMembers.length === 0 && (
        <Card className="p-10 text-center">
          <Users className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-semibold">Belum ada mitra terdaftar</p>
          <p className="text-[12px] text-muted-foreground mt-1">
            Undang mitra via halaman <strong>Pengaturan → Tim</strong>.
          </p>
        </Card>
      )}

      {!loading && agentMembers.length > 0 && (
        <>
          {/* ── Agent Overview Table ─────────────────────────────────────── */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[13px] font-semibold flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-blue-600" />
                Agent Overview
              </h2>
              <span className="text-[10.5px] text-muted-foreground">{agentMembers.length} mitra · klik header utk sort</span>
            </div>
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-[12px] min-w-[700px]">
                <thead>
                  <tr className="text-muted-foreground border-b">
                    <th className="text-left font-semibold py-2 px-2">#</th>
                    <th
                      className="text-left font-semibold py-2 px-2 cursor-pointer hover:text-foreground"
                      onClick={() => toggleSort("name")}
                    >
                      Nama <SortIcon col="name" />
                    </th>
                    <th className="text-center font-semibold py-2 px-2">Tier</th>
                    <th
                      className="text-right font-semibold py-2 px-2 cursor-pointer hover:text-foreground"
                      onClick={() => toggleSort("clients")}
                    >
                      Klien <SortIcon col="clients" />
                    </th>
                    <th
                      className="text-right font-semibold py-2 px-2 cursor-pointer hover:text-foreground"
                      onClick={() => toggleSort("orders")}
                    >
                      Order <SortIcon col="orders" />
                    </th>
                    <th
                      className="text-right font-semibold py-2 px-2 cursor-pointer hover:text-foreground"
                      onClick={() => toggleSort("points")}
                    >
                      Poin <SortIcon col="points" />
                    </th>
                    <th
                      className="text-right font-semibold py-2 px-2 cursor-pointer hover:text-foreground"
                      onClick={() => toggleSort("commission")}
                    >
                      Komisi % <SortIcon col="commission" />
                    </th>
                    <th className="text-right font-semibold py-2 px-2">Komisi Owed</th>
                    <th className="text-center font-semibold py-2 px-2">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedAgentRows.map((agent, i) => {
                    const isEditing = editingId === agent.userId;
                    const { current: tier, next, progress } = agent.tierInfo;
                    return (
                      <tr key={agent.userId} className="border-b last:border-b-0 hover:bg-blue-50/30 transition-colors">
                        <td className="py-2.5 px-2 text-muted-foreground font-mono">{i + 1}</td>
                        <td className="py-2.5 px-2">
                          <div className="flex items-center gap-2">
                            <div
                              className="h-7 w-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0"
                              style={{ background: agent.color }}
                            >
                              {agent.displayName.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-semibold text-[12.5px] leading-tight">{agent.displayName}</p>
                              <p className="text-[10px] text-muted-foreground">{agent.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          <TierBadge points={agent.totalPoints} />
                          {next && (
                            <div className="mt-1 flex items-center gap-1">
                              <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                                <div
                                  className="h-full rounded-full"
                                  style={{ width: `${progress * 100}%`, background: tier.hex }}
                                />
                              </div>
                              <span className="text-[9px] text-muted-foreground whitespace-nowrap">
                                {agent.tierInfo.pointsToNext}pt
                              </span>
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono">{agent.clientCount}</td>
                        <td className="py-2.5 px-2 text-right">
                          <span className="font-mono">{agent.totalOrders}</span>
                          <span className="text-[10px] text-muted-foreground ml-1">({agent.completedOrders} done)</span>
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono font-bold text-amber-700">
                          ⭐ {agent.totalPoints}
                        </td>
                        <td className="py-2.5 px-2 text-right">
                          {isEditing ? (
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={draftPct}
                              onChange={(e) => setDraftPct(Number(e.target.value))}
                              className="w-16 h-7 rounded-lg border border-blue-300 text-center text-[12px] font-mono focus:outline-none focus:ring-2 focus:ring-blue-300"
                            />
                          ) : (
                            <span className="font-mono font-bold text-orange-700">{agent.commissionPct}%</span>
                          )}
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono font-bold text-rose-700">
                          {fmtIDR(agent.commissionOwed)}
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {isEditing ? (
                              <>
                                <button
                                  onClick={() => saveCommission(agent.userId)}
                                  disabled={saving}
                                  className="h-6 w-6 rounded-md bg-emerald-100 hover:bg-emerald-200 text-emerald-700 flex items-center justify-center transition-colors"
                                  title="Simpan"
                                >
                                  <Check className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => setEditingId(null)}
                                  className="h-6 w-6 rounded-md bg-red-50 hover:bg-red-100 text-red-600 flex items-center justify-center transition-colors"
                                  title="Batal"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => { setEditingId(agent.userId); setDraftPct(agent.commissionPct); }}
                                className="h-6 w-6 rounded-md bg-blue-50 hover:bg-blue-100 text-blue-700 flex items-center justify-center transition-colors"
                                title="Edit Komisi"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                            <button
                              onClick={() => setExpandedAgent(expandedAgent === agent.userId ? null : agent.userId)}
                              className="h-6 w-6 rounded-md bg-slate-50 hover:bg-slate-100 text-slate-600 flex items-center justify-center transition-colors"
                              title="Lihat detail komisi"
                            >
                              {expandedAgent === agent.userId
                                ? <ChevronUp className="h-3.5 w-3.5" />
                                : <ChevronDown className="h-3.5 w-3.5" />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* ── Commission Tracker ───────────────────────────────────────── */}
          {expandedAgent && (() => {
            const agent = agentRows.find((a) => a.userId === expandedAgent);
            if (!agent) return null;
            const completedList = agent.completedOrdersList;
            return (
              <Card className="p-4 border-blue-200 bg-blue-50/30">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-[13px] font-semibold flex items-center gap-1.5">
                    <Wallet className="h-3.5 w-3.5 text-blue-600" />
                    Commission Tracker —{" "}
                    <span style={{ color: agent.color }}>{agent.displayName}</span>
                  </h2>
                  <span className="text-[10.5px] text-muted-foreground">
                    {completedList.length} order Completed
                  </span>
                </div>

                {/* Summary row */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                  {[
                    { label: "Total Revenue", value: fmtIDR(agent.totalRevenue), color: "text-sky-700" },
                    { label: "Total Profit", value: fmtIDR(agent.totalProfit), color: "text-emerald-700" },
                    { label: `Komisi (${agent.commissionPct}%)`, value: fmtIDR(agent.commissionOwed), color: "text-orange-700" },
                    { label: "Net Buat Agency", value: fmtIDR(agent.totalProfit - agent.commissionOwed), color: "text-blue-700" },
                  ].map((r) => (
                    <div key={r.label} className="rounded-xl bg-white border p-3">
                      <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">{r.label}</p>
                      <p className={`text-[13px] font-extrabold font-mono mt-0.5 ${r.color}`}>{r.value}</p>
                    </div>
                  ))}
                </div>

                {/* Order list */}
                <div className="overflow-x-auto">
                  <table className="w-full text-[11.5px] min-w-[540px]">
                    <thead>
                      <tr className="text-muted-foreground border-b">
                        <th className="text-left font-semibold py-1.5 px-2">Order</th>
                        <th className="text-right font-semibold py-1.5 px-2">Tanggal</th>
                        <th className="text-right font-semibold py-1.5 px-2">Revenue</th>
                        <th className="text-right font-semibold py-1.5 px-2">Profit</th>
                        <th className="text-right font-semibold py-1.5 px-2">Komisi ({agent.commissionPct}%)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {completedList.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-6 text-center text-muted-foreground">
                            Belum ada order Completed dari mitra ini.
                          </td>
                        </tr>
                      ) : (
                        completedList.map((o) => {
                          const rev = revenueIDR(o);
                          const prof = Math.max(0, profitIDR(o));
                          const com = prof * (agent.commissionPct / 100);
                          return (
                            <tr key={o.id} className="border-b last:border-b-0 hover:bg-white/60">
                              <td className="py-1.5 px-2 font-medium max-w-[200px] truncate">{o.title || "—"}</td>
                              <td className="py-1.5 px-2 text-right text-muted-foreground whitespace-nowrap">
                                {new Date(o.createdAt).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}
                              </td>
                              <td className="py-1.5 px-2 text-right font-mono">{fmtIDR(rev)}</td>
                              <td className={`py-1.5 px-2 text-right font-mono font-semibold ${prof >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                                {fmtIDR(prof)}
                              </td>
                              <td className="py-1.5 px-2 text-right font-mono font-bold text-orange-700">
                                {fmtIDR(com)}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                    {completedList.length > 0 && (
                      <tfoot>
                        <tr className="border-t-2 border-blue-200 bg-blue-50 font-bold">
                          <td colSpan={2} className="py-2 px-2 text-blue-800 text-[12px]">Total ({completedList.length} order)</td>
                          <td className="py-2 px-2 text-right font-mono text-sky-700">{fmtIDR(agent.totalRevenue)}</td>
                          <td className="py-2 px-2 text-right font-mono text-emerald-700">{fmtIDR(agent.totalProfit)}</td>
                          <td className="py-2 px-2 text-right font-mono text-orange-700">{fmtIDR(agent.commissionOwed)}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </Card>
            );
          })()}

          {/* ── Performance Analytics Chart ──────────────────────────────── */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-[13px] font-semibold flex items-center gap-1.5">
                  <BarChart3 className="h-3.5 w-3.5 text-blue-600" />
                  Performance Analytics — Order per Bulan
                </h2>
                <p className="text-[10.5px] text-muted-foreground mt-0.5">6 bulan terakhir · semua tipe order</p>
              </div>
            </div>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <ReTooltip
                    contentStyle={{ fontSize: 11, borderRadius: 8 }}
                    formatter={(v: number) => [`${v} order`]}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {agentRows.map((a) => (
                    <Bar
                      key={a.userId}
                      dataKey={a.displayName}
                      fill={a.color}
                      radius={[3, 3, 0, 0]}
                      maxBarSize={40}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* ── Tier Distribution ───────────────────────────────────────── */}
          <Card className="p-4">
            <h2 className="text-[13px] font-semibold flex items-center gap-1.5 mb-4">
              <Zap className="h-3.5 w-3.5 text-amber-500" />
              Distribusi Tier Mitra
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {TIERS.map((tier) => {
                const count = agentRows.filter((a) => a.tierInfo.current.key === tier.key).length;
                return (
                  <div
                    key={tier.key}
                    className={`rounded-xl border p-3 ${tier.softBg}`}
                  >
                    <div className={`text-[20px]`}>{tier.emoji}</div>
                    <p className={`text-[12px] font-bold mt-1 ${tier.softText}`}>{tier.label}</p>
                    <p className={`text-[24px] font-extrabold font-mono mt-0.5 ${tier.softText}`}>{count}</p>
                    <p className="text-[10px] text-muted-foreground">mitra · ≥{tier.minPoints}pt</p>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* ── Mission Creator ────────────────────────────────────────── */}
          {user?.agencyId && user?.id && (
            <Card className="p-4">
              <MissionCreatorSection
                agencyId={user.agencyId}
                ownerId={user.id}
                agentNames={new Map(agentMembers.map((a) => [a.userId, a.displayName]))}
              />
            </Card>
          )}

          {/* ── Footer note ─────────────────────────────────────────────── */}
          <div className="rounded-xl border bg-muted/30 p-3 text-[10.5px] text-muted-foreground leading-relaxed">
            <strong className="text-foreground">Catatan:</strong>{" "}
            Komisi = Profit × Komisi% · hanya dihitung dari order berstatus <strong>Completed</strong> dengan profit positif.
            Poin lifetime dihitung dari trigger otomatis DB (10pt per Completed order) dan tidak bisa di-reset manual dari UI —
            hubungi admin database jika diperlukan. Edit komisi langsung di baris tabel dengan ikon ✏️.
            Poin misi dihitung dari misi yang disetujui admin dan diakumulasi ke total poin agen.
          </div>
        </>
      )}
    </div>
  );
}
