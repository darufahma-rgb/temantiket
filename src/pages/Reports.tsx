import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  TrendingUp, TrendingDown, Wallet, Receipt, ShieldCheck, Filter,
  Crown, ArrowDown, Users, Trophy, Handshake, Building2,
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
  profitIDR, revenueIDR, costIDR, fmtIDR, EGP_TO_IDR,
} from "@/lib/profit";
import { listAgentPoints, sumPointsByAgent, type AgentPoint } from "@/features/agentPoints/agentPointsRepo";

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
  umrah: "#0ea5e9",
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

  const [range, setRange] = useState<RangeKey>("this_month");
  const [agentFilter, setAgentFilter] = useState<AgentFilter>("all");
  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [points, setPoints] = useState<AgentPoint[]>([]);

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

  // Filter orders by date range + agent attribution.
  const filtered = useMemo(() => {
    return orders.filter((o) => {
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

  // Total aggregations
  const totals = useMemo(() => {
    let revenue = 0;
    let cost = 0;
    let profit = 0;
    for (const o of filtered) {
      revenue += revenueIDR(o);
      cost += costIDR(o);
      profit += profitIDR(o);
    }
    return { revenue, cost, profit, count: filtered.length };
  }, [filtered]);

  // Direct vs Agent split (always computed from filtered set,
  // even when agentFilter aktif — supaya angka konsisten dgn yg dilihat).
  const split = useMemo(() => {
    let directProfit = 0;
    let directRevenue = 0;
    let directCount = 0;
    let agentProfit = 0;     // gross profit dari order via agent
    let agentRevenue = 0;
    let agentCount = 0;
    let totalCommission = 0; // total komisi yg dikeluarin agency

    for (const o of filtered) {
      const p = profitIDR(o);
      const r = revenueIDR(o);
      if (o.createdByAgent) {
        agentProfit += p;
        agentRevenue += r;
        agentCount += 1;
        const member = memberById.get(o.createdByAgent);
        const pct = (member?.commissionPct ?? 0) / 100;
        // Komisi dihitung dari profit (bukan revenue) — sesuai konvensi
        // travel agency lokal. Kalau profit negatif, komisi 0 (agent gak
        // dapet komisi atas kerugian).
        if (p > 0) totalCommission += p * pct;
      } else {
        directProfit += p;
        directRevenue += r;
        directCount += 1;
      }
    }
    const agentNetForAgency = agentProfit - totalCommission;
    const netAgencyProfit = directProfit + agentNetForAgency;
    return {
      directProfit, directRevenue, directCount,
      agentProfit, agentRevenue, agentCount,
      totalCommission, agentNetForAgency, netAgencyProfit,
    };
  }, [filtered, memberById]);

  // Profit per type (utk pie chart).
  const byType = useMemo(() => {
    const m = new Map<OrderType, { profit: number; revenue: number; count: number }>();
    for (const o of filtered) {
      const cur = m.get(o.type) ?? { profit: 0, revenue: 0, count: 0 };
      cur.profit += profitIDR(o);
      cur.revenue += revenueIDR(o);
      cur.count += 1;
      m.set(o.type, cur);
    }
    return Array.from(m.entries()).map(([type, v]) => ({
      type,
      label: ORDER_TYPE_LABEL[type],
      emoji: ORDER_TYPE_EMOJI[type],
      ...v,
    }));
  }, [filtered]);

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
      cur.profit += profitIDR(o);
      cur.revenue += revenueIDR(o);
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
  }, [filtered, clientNameById]);

  // ── Agent Leaderboard ──
  // Built from `filtered` (so date-range applies). Ranked by total profit
  // generated dlm periode + jumlah order. Points pakai dari agent_points
  // (tabel terpisah, lifetime).
  const leaderboard = useMemo(() => {
    const lifetimePoints = sumPointsByAgent(points);
    const m = new Map<string, { profit: number; orders: number; revenue: number }>();
    for (const o of filtered) {
      if (!o.createdByAgent) continue;
      const cur = m.get(o.createdByAgent) ?? { profit: 0, orders: 0, revenue: 0 };
      cur.profit += profitIDR(o);
      cur.revenue += revenueIDR(o);
      cur.orders += 1;
      m.set(o.createdByAgent, cur);
    }
    // Pastikan semua agent muncul (walau gak ada order di periode).
    for (const a of agentMembers) {
      if (!m.has(a.userId)) m.set(a.userId, { profit: 0, orders: 0, revenue: 0 });
    }
    return Array.from(m.entries()).map(([agentId, v]) => {
      const member = memberById.get(agentId);
      const pct = (member?.commissionPct ?? 0) / 100;
      const commission = v.profit > 0 ? v.profit * pct : 0;
      return {
        agentId,
        name: member?.displayName ?? `Agent ${agentId.slice(0, 6)}…`,
        commissionPct: member?.commissionPct ?? 0,
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
  }, [filtered, agentMembers, memberById, points]);

  const pieData = byType
    .filter((x) => x.profit > 0)
    .map((x) => ({ name: x.label, value: x.profit, type: x.type }));

  const top3 = byClient.slice(0, 3);

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            Laporan Keuangan
          </h1>
          <p className="text-[12px] text-muted-foreground mt-0.5 flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            Owner only · Periode: <span className="font-semibold">{RANGE_LABEL[range]}</span>
            {user?.agencyName && <> · {user.agencyName}</>}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={range} onValueChange={(v) => setRange(v as RangeKey)}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
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
                <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                  Per Mitra
                </div>
              )}
              {agentMembers.map((a) => (
                <SelectItem key={a.userId} value={a.userId}>
                  {a.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard
          label="Total Profit"
          value={fmtIDR(totals.profit)}
          icon={totals.profit >= 0 ? TrendingUp : TrendingDown}
          tone={totals.profit >= 0 ? "emerald" : "red"}
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
      </div>

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
          profit={split.agentProfit}
          revenue={split.agentRevenue}
          count={split.agentCount}
          extra={
            <div className="text-[10.5px] text-muted-foreground mt-1">
              Komisi dibayar: <span className="font-mono font-semibold text-orange-700">−{fmtIDR(split.totalCommission)}</span>
              <br />
              Net buat agency: <span className="font-mono font-bold text-emerald-700">{fmtIDR(split.agentNetForAgency)}</span>
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
              = Direct + (Agent Profit − Komisi)
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
              <h2 className="text-[13px] font-semibold">Profit per Kategori</h2>
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
                    <th className="text-right font-semibold py-2 px-1">Profit</th>
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
                  <th className="text-right font-semibold py-2 px-1">Gross Profit</th>
                  <th className="text-right font-semibold py-2 px-1">Komisi (%)</th>
                  <th className="text-right font-semibold py-2 px-1">Komisi Diterima</th>
                  <th className="text-right font-semibold py-2 px-1">⭐ Poin</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((row, i) => {
                  const medals = ["🥇", "🥈", "🥉"];
                  return (
                    <tr key={row.agentId} className="border-b last:border-b-0 hover:bg-muted/40">
                      <td className="py-2 px-1 text-muted-foreground">
                        {i < 3 ? medals[i] : i + 1}
                      </td>
                      <td className="py-2 px-1 font-medium truncate max-w-[180px]">
                        {row.name}
                      </td>
                      <td className="py-2 px-1 text-right">{row.orders}</td>
                      <td className="py-2 px-1 text-right font-mono">{fmtIDR(row.revenue)}</td>
                      <td className={`py-2 px-1 text-right font-mono font-semibold ${row.profit >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                        {fmtIDR(row.profit)}
                      </td>
                      <td className="py-2 px-1 text-right font-mono text-muted-foreground">
                        {row.commissionPct}%
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
                    <td colSpan={8} className="py-6 text-center text-muted-foreground text-[11.5px]">
                      Belum ada mitra terdaftar.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Footer note */}
      <div className="rounded-xl border bg-muted/30 p-3 text-[10.5px] text-muted-foreground leading-relaxed">
        <strong className="text-foreground">Catatan:</strong> Profit = Harga Jual − Harga Modal.
        Order EGP (visa Mesir) di-konversi ke IDR pakai kurs <span className="font-mono">1 EGP ≈ Rp {EGP_TO_IDR}</span>.
        Komisi mitra dihitung dari <em>profit</em> (bukan revenue), hanya kalau profit positif.
        Atur komisi per-mitra di <strong>Pengaturan → Tim</strong>. Poin di-award otomatis 10 poin
        per order yg statusnya berubah ke <strong>Completed</strong>.
      </div>
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
    <div className={`rounded-2xl border bg-gradient-to-br p-3 md:p-4 ${toneClass}`}>
      <div className="flex items-center justify-between">
        <span className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <Icon className="h-4 w-4 opacity-70" />
      </div>
      <div className={`mt-1.5 font-extrabold font-mono ${big ? "text-xl md:text-2xl" : "text-base md:text-lg"} text-foreground`}>
        {value}
      </div>
    </div>
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
    <div className={`rounded-2xl border bg-gradient-to-br p-3 md:p-4 ${accent} ${highlight ? "ring-2 ring-emerald-300" : ""}`}>
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
    </div>
  );
}
