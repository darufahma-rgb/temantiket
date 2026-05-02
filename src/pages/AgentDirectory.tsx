import { useEffect, useMemo, useState } from "react";
import {
  Users, RefreshCw, Search, Target, Eye,
  TrendingUp, Trophy, ShoppingBag, UserCheck,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { useAuthStore, type MemberInfo } from "@/store/authStore";
import { useOrdersStore } from "@/store/ordersStore";
import { useClientsStore } from "@/store/clientsStore";
import { listAgentPoints, sumPointsByAgent, type AgentPoint } from "@/features/agentPoints/agentPointsRepo";
import { listSubmissions, sumMissionPointsByAgent } from "@/features/missions/missionsRepo";
import type { MissionSubmission } from "@/features/missions/types";
import { getTierInfo } from "@/features/agentPoints/agentTiers";
import { fmtIDR, revenueIDR } from "@/lib/profit";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";

// ── Tier badge ─────────────────────────────────────────────────────────────────

function TierBadge({ points }: { points: number }) {
  const { current } = getTierInfo(points);
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${current.softBg} ${current.softText}`}
    >
      {current.emoji} {current.label}
    </span>
  );
}

// ── Summary stat card ──────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, icon: Icon, color,
}: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType;
  color: "sky" | "emerald" | "amber" | "violet";
}) {
  const cs = {
    sky:    "bg-sky-50    border-sky-100   text-sky-700",
    emerald:"bg-emerald-50 border-emerald-100 text-emerald-700",
    amber:  "bg-amber-50  border-amber-100  text-amber-700",
    violet: "bg-violet-50 border-violet-100 text-violet-700",
  }[color];
  return (
    <div className={`rounded-2xl border p-4 ${cs}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10.5px] font-semibold uppercase tracking-wide opacity-70">{label}</span>
        <Icon className="h-4 w-4 opacity-50" />
      </div>
      <div className="text-2xl font-extrabold font-mono">{value}</div>
      {sub && <div className="text-[10.5px] mt-0.5 opacity-60">{sub}</div>}
    </div>
  );
}

// ── Agent profile dialog ────────────────────────────────────────────────────────

interface AgentRow extends MemberInfo {
  totalPoints: number;
  totalOrders: number;
  completedOrders: number;
  clientCount: number;
  totalRevenue: number;
  commissionOwed: number;
}

function AgentProfileDialog({
  agent, open, onClose, onGoMission,
}: {
  agent: AgentRow | null;
  open: boolean;
  onClose: () => void;
  onGoMission: (agent: AgentRow) => void;
}) {
  if (!agent) return null;
  const { current, next, ptsToNext, progress } = getTierInfo(agent.totalPoints);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <div className="h-8 w-8 rounded-full bg-sky-100 flex items-center justify-center text-sky-700 font-bold text-sm shrink-0">
              {agent.displayName.charAt(0).toUpperCase()}
            </div>
            {agent.displayName}
          </DialogTitle>
          <DialogDescription className="text-xs">{agent.email}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-1">
          {/* Tier progress */}
          <div className="rounded-xl border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <TierBadge points={agent.totalPoints} />
              <span className="text-xs font-mono font-semibold text-muted-foreground">
                {agent.totalPoints.toLocaleString("id-ID")} poin
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-sky-400 to-sky-600 transition-all"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
            {next && (
              <p className="text-[10.5px] text-muted-foreground">
                {ptsToNext} poin lagi menuju <strong>{next.label}</strong>
              </p>
            )}
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Total Order",    value: agent.totalOrders,     suffix: "order" },
              { label: "Selesai",        value: agent.completedOrders, suffix: "order" },
              { label: "Total Klien",    value: agent.clientCount,     suffix: "klien" },
              { label: "Total Revenue",  value: fmtIDR(agent.totalRevenue), suffix: "" },
            ].map(({ label, value, suffix }) => (
              <div key={label} className="rounded-xl border bg-secondary/30 px-3 py-2">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
                <div className="text-sm font-bold mt-0.5">
                  {value}{suffix && <span className="text-[10px] font-normal ml-1 text-muted-foreground">{suffix}</span>}
                </div>
              </div>
            ))}
          </div>

          {/* Komisi */}
          <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2.5 flex items-center justify-between">
            <div>
              <div className="text-[10px] text-amber-700 font-semibold uppercase tracking-wide">Komisi Terhutang</div>
              <div className="text-sm font-bold text-amber-800 font-mono">{fmtIDR(agent.commissionOwed)}</div>
            </div>
            <span className="text-xs text-amber-600">{agent.commissionPct ?? 0}% komisi</span>
          </div>

          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={onClose}
            >
              Tutup
            </Button>
            <Button
              size="sm"
              className="flex-1 bg-sky-600 hover:bg-sky-700 text-white"
              onClick={() => { onClose(); onGoMission(agent); }}
            >
              <Target className="h-3.5 w-3.5 mr-1" />
              Beri Misi
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function AgentDirectory() {
  const navigate = useNavigate();
  const { user, listMembers } = useAuthStore();
  const { orders, fetchOrders } = useOrdersStore();
  const { clients, fetchClients } = useClientsStore();

  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [points, setPoints] = useState<AgentPoint[]>([]);
  const [missionSubs, setMissionSubs] = useState<MissionSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Profile dialog
  const [selectedAgent, setSelectedAgent] = useState<AgentRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Role guard
  const isOwner = user?.role === "owner";
  const isStaff = user?.role === "staff";
  if (!isOwner && !isStaff) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-muted-foreground">
        <Users className="h-10 w-10 opacity-30" />
        <p className="text-sm font-medium">Akses tidak diizinkan.</p>
      </div>
    );
  }

  // ── Data loading ─────────────────────────────────────────────────────────────
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
      console.warn("[agent-directory] load failed:", err);
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

  const clientCountByAgent = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of clients) {
      if (c.createdByAgent) m.set(c.createdByAgent, (m.get(c.createdByAgent) ?? 0) + 1);
    }
    return m;
  }, [clients]);

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

  const agentRows: AgentRow[] = useMemo(() => {
    return agentMembers.map((a) => {
      const totalPoints = pointsByAgent.get(a.userId) ?? 0;
      const agentOrders = ordersByAgent.get(a.userId) ?? [];
      const completedOrders = agentOrders.filter((o) => o.status === "Completed");
      const totalRevenue = agentOrders.reduce((s, o) => s + revenueIDR(o), 0);
      const totalProfit = completedOrders.reduce((s, o) => {
        const rev = revenueIDR(o);
        return s + Math.max(0, rev);
      }, 0);
      const commissionOwed = totalProfit * ((a.commissionPct ?? 0) / 100);
      return {
        ...a,
        totalPoints,
        totalOrders: agentOrders.length,
        completedOrders: completedOrders.length,
        clientCount: clientCountByAgent.get(a.userId) ?? 0,
        totalRevenue,
        commissionOwed,
      };
    }).sort((a, b) => b.totalPoints - a.totalPoints);
  }, [agentMembers, pointsByAgent, ordersByAgent, clientCountByAgent]);

  // ── Search filter ─────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return agentRows;
    return agentRows.filter(
      (a) => a.displayName.toLowerCase().includes(q) || a.email.toLowerCase().includes(q),
    );
  }, [agentRows, search]);

  // ── Summary stats ─────────────────────────────────────────────────────────────
  const totalAgents    = agentRows.length;
  const totalOrders    = agentRows.reduce((s, a) => s + a.totalOrders, 0);
  const totalClients   = agentRows.reduce((s, a) => s + a.clientCount, 0);
  const totalRevenue   = agentRows.reduce((s, a) => s + a.totalRevenue, 0);

  // ── Handlers ──────────────────────────────────────────────────────────────────
  function openProfile(agent: AgentRow) {
    setSelectedAgent(agent);
    setDialogOpen(true);
  }

  function goToMission(agent: AgentRow) {
    navigate("/agent-center", { state: { focusAgent: agent.userId } });
  }

  // ── Rank suffix ────────────────────────────────────────────────────────────────
  function rankOf(idx: number) {
    if (idx === 0) return "🥇";
    if (idx === 1) return "🥈";
    if (idx === 2) return "🥉";
    return `#${idx + 1}`;
  }

  return (
    <motion.div
      className="max-w-5xl mx-auto py-6 px-4 space-y-6"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Users className="h-5 w-5 text-sky-600" />
            Direktori Agen
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Pantau seluruh agen aktif, level, poin, dan performa order mereka.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={load}
          disabled={loading}
          className="shrink-0"
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Agen" value={totalAgents} sub="terdaftar" icon={Users} color="sky" />
        <StatCard label="Total Order" value={totalOrders} sub="dari semua agen" icon={ShoppingBag} color="emerald" />
        <StatCard label="Total Klien" value={totalClients} sub="dibawa agen" icon={UserCheck} color="violet" />
        <StatCard label="Total Revenue" value={fmtIDR(totalRevenue)} sub="semua agen" icon={TrendingUp} color="amber" />
      </div>

      {/* ── Search + table ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber-500" />
            Daftar Agen
          </CardTitle>
          <CardDescription className="text-xs">
            Diurutkan berdasarkan total poin (tertinggi di atas)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Cari nama atau email agen…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9 text-sm"
            />
          </div>

          {/* Table */}
          {loading ? (
            <div className="py-12 text-center text-muted-foreground text-sm animate-pulse">
              Memuat data agen…
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <Users className="h-8 w-8 text-muted-foreground/30 mx-auto" />
              <p className="text-sm text-muted-foreground">
                {search ? "Tidak ditemukan agen dengan nama tersebut." : "Belum ada agen terdaftar."}
              </p>
              {!search && (
                <p className="text-xs text-muted-foreground">
                  Undang agen melalui menu <strong>Pengaturan → Kelola Tim</strong>.
                </p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto -mx-2">
              <table className="w-full min-w-[580px] text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="px-3 py-2 text-left text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground w-8">#</th>
                    <th className="px-3 py-2 text-left text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">Nama Agen</th>
                    <th className="px-3 py-2 text-left text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">Level / Rank</th>
                    <th className="px-3 py-2 text-right text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">Total Poin</th>
                    <th className="px-3 py-2 text-right text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">Jumlah Order</th>
                    <th className="px-3 py-2 text-right text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">Klien</th>
                    <th className="px-3 py-2 text-center text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {filtered.map((agent, idx) => {
                    const { current } = getTierInfo(agent.totalPoints);
                    const rank = agentRows.findIndex((a) => a.userId === agent.userId);
                    return (
                      <tr
                        key={agent.userId}
                        className="group hover:bg-secondary/40 transition-colors"
                      >
                        {/* Rank */}
                        <td className="px-3 py-3 text-center text-base">
                          {rankOf(rank)}
                        </td>

                        {/* Nama + email */}
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="h-8 w-8 rounded-full bg-sky-100 flex items-center justify-center text-sky-700 text-sm font-bold shrink-0">
                              {agent.displayName.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="font-semibold text-[13px] truncate max-w-[140px]">{agent.displayName}</div>
                              <div className="text-[10.5px] text-muted-foreground truncate max-w-[140px]">{agent.email}</div>
                            </div>
                          </div>
                        </td>

                        {/* Level / Rank */}
                        <td className="px-3 py-3">
                          <TierBadge points={agent.totalPoints} />
                        </td>

                        {/* Total Poin */}
                        <td className="px-3 py-3 text-right">
                          <span className="font-mono font-semibold text-[13px]">
                            {agent.totalPoints.toLocaleString("id-ID")}
                          </span>
                          <span className="text-[10px] text-muted-foreground ml-1">pts</span>
                        </td>

                        {/* Jumlah Order */}
                        <td className="px-3 py-3 text-right">
                          <button
                            onClick={() => navigate("/orders")}
                            className="text-right hover:text-primary transition-colors group"
                            title="Lihat semua order"
                          >
                            <div className="font-semibold text-[13px] group-hover:underline">{agent.totalOrders}</div>
                            {agent.completedOrders > 0 && (
                              <div className="text-[10px] text-emerald-600">{agent.completedOrders} selesai</div>
                            )}
                          </button>
                        </td>

                        {/* Klien */}
                        <td className="px-3 py-3 text-right">
                          <span className="font-semibold text-[13px]">{agent.clientCount}</span>
                        </td>

                        {/* Quick Actions */}
                        <td className="px-3 py-3">
                          <div className="flex items-center justify-center gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2.5 text-[11px] gap-1"
                              onClick={() => openProfile(agent)}
                            >
                              <Eye className="h-3 w-3" />
                              Profil
                            </Button>
                            <Button
                              size="sm"
                              className="h-7 px-2.5 text-[11px] gap-1 bg-sky-600 hover:bg-sky-700 text-white"
                              onClick={() => goToMission(agent)}
                            >
                              <Target className="h-3 w-3" />
                              Misi
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Footer note */}
          {!loading && filtered.length > 0 && (
            <p className="text-[10.5px] text-muted-foreground text-right pt-1">
              {filtered.length} dari {agentRows.length} agen •{" "}
              <span className="font-medium">
                Data Fase 25 (Bronze/Silver/Gold) langsung muncul di sini setelah di-seed.
              </span>
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Agent Profile Dialog ── */}
      <AgentProfileDialog
        agent={selectedAgent}
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setSelectedAgent(null); }}
        onGoMission={(agent) => goToMission(agent)}
      />
    </motion.div>
  );
}
