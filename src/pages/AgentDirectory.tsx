import { useEffect, useMemo, useState } from "react";
import {
  Users, RefreshCw, Search, Target, Eye,
  TrendingUp, Trophy, ShoppingBag, UserCheck,
  UserPlus, Mail, Lock, Percent, Loader2,
  ChevronRight, ClipboardList,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useAuthStore, type MemberInfo } from "@/store/authStore";
import { useOrdersStore } from "@/store/ordersStore";
import { useClientsStore } from "@/store/clientsStore";
import { listAgentPoints, sumPointsByAgent, type AgentPoint } from "@/features/agentPoints/agentPointsRepo";
import { listSubmissions, sumMissionPointsByAgent } from "@/features/missions/missionsRepo";
import type { MissionSubmission } from "@/features/missions/types";
import { getTierInfo } from "@/features/agentPoints/agentTiers";
import { fmtIDR, revenueIDR } from "@/lib/profit";

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

// ── Add Agent Dialog ────────────────────────────────────────────────────────────

interface AddAgentDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

function AddAgentDialog({ open, onClose, onSuccess }: AddAgentDialogProps) {
  const { inviteMember } = useAuthStore();
  const [name, setName]       = useState("");
  const [email, setEmail]     = useState("");
  const [pass, setPass]       = useState("");
  const [commission, setCommission] = useState<number>(10);
  const [loading, setLoading] = useState(false);

  function reset() {
    setName(""); setEmail(""); setPass(""); setCommission(10);
  }

  async function handleSubmit() {
    if (!name.trim() || !email.trim() || !pass) {
      toast.error("Lengkapi semua field: nama, email, dan password.");
      return;
    }
    if (pass.length < 8) {
      toast.error("Password minimal 8 karakter.");
      return;
    }
    if (!email.includes("@")) {
      toast.error("Format email tidak valid.");
      return;
    }
    setLoading(true);
    try {
      await inviteMember(email.trim(), pass, name.trim(), "agent");
      toast.success(`Agen "${name.trim()}" berhasil ditambahkan!`, {
        description: `Komisi ${commission}% akan aktif setelah data tersimpan.`,
      });
      reset();
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(`Gagal tambah agen: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <div className="h-8 w-8 rounded-full bg-sky-100 flex items-center justify-center shrink-0">
              <UserPlus className="h-4 w-4 text-sky-600" />
            </div>
            Tambah Agen Baru
          </DialogTitle>
          <DialogDescription className="text-xs">
            Agen bisa langsung login, buat order, dan dapet poin komisi otomatis.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-1">
          {/* Name */}
          <div className="space-y-1">
            <Label className="text-xs flex items-center gap-1">
              <Users className="h-3 w-3" /> Nama Lengkap
            </Label>
            <Input
              placeholder="cth: Ahmad Fauzi"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-9 text-sm"
              disabled={loading}
            />
          </div>

          {/* Email */}
          <div className="space-y-1">
            <Label className="text-xs flex items-center gap-1">
              <Mail className="h-3 w-3" /> Email Login
            </Label>
            <Input
              type="email"
              placeholder="agen@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-9 text-sm"
              disabled={loading}
            />
          </div>

          {/* Password */}
          <div className="space-y-1">
            <Label className="text-xs flex items-center gap-1">
              <Lock className="h-3 w-3" /> Password Awal <span className="text-muted-foreground">(min 8 karakter)</span>
            </Label>
            <Input
              type="password"
              placeholder="••••••••"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              className="h-9 text-sm"
              disabled={loading}
            />
          </div>

          {/* Commission */}
          <div className="space-y-1">
            <Label className="text-xs flex items-center gap-1">
              <Percent className="h-3 w-3" /> Komisi per Order (%)
            </Label>
            <div className="flex items-center gap-2">
              <Input
                type="number" min={0} max={100} step={0.5}
                value={commission}
                onChange={(e) => setCommission(Number(e.target.value) || 0)}
                className="h-9 text-sm font-mono w-24"
                disabled={loading}
              />
              <span className="text-xs text-muted-foreground flex-1">
                Dihitung dari profit order yang completed.
              </span>
            </div>
          </div>

          {/* Info box */}
          <div className="rounded-xl bg-sky-50 border border-sky-100 px-3 py-2.5 space-y-1">
            <p className="text-[11px] font-semibold text-sky-700">Yang otomatis terhubung:</p>
            {[
              "Profil agen muncul di Direktori & Leaderboard",
              "Poin gamifikasi terakumulasi tiap order selesai",
              "Wallet komisi terupdate real-time",
              "Bisa diberi misi dari Agent Command Center",
              "Marketing Kit & template promo siap diakses",
            ].map((item) => (
              <div key={item} className="flex items-start gap-1.5">
                <div className="h-1.5 w-1.5 rounded-full bg-sky-400 mt-1.5 shrink-0" />
                <span className="text-[10.5px] text-sky-700">{item}</span>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              className="flex-1 h-10"
              onClick={() => { reset(); onClose(); }}
              disabled={loading}
            >
              Batal
            </Button>
            <Button
              className="flex-1 h-10 font-bold bg-sky-600 hover:bg-sky-700 text-white"
              onClick={handleSubmit}
              disabled={loading}
            >
              {loading
                ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Menambahkan…</>
                : <><UserPlus className="h-3.5 w-3.5 mr-1.5" /> Tambah Agen</>
              }
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
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
  agent, open, onClose, onGoMission, onGoOrders, onGoClients,
}: {
  agent: AgentRow | null;
  open: boolean;
  onClose: () => void;
  onGoMission: (agent: AgentRow) => void;
  onGoOrders: (agent: AgentRow) => void;
  onGoClients: (agent: AgentRow) => void;
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

          {/* Quick link buttons */}
          <div className="grid grid-cols-3 gap-1.5">
            <button
              onClick={() => { onClose(); onGoOrders(agent); }}
              className="flex flex-col items-center gap-1 rounded-xl border border-slate-200 bg-white px-2 py-2.5 hover:bg-slate-50 hover:border-sky-200 transition-colors text-center"
            >
              <ClipboardList className="h-3.5 w-3.5 text-sky-600" />
              <span className="text-[10px] font-semibold text-slate-700">Lihat Order</span>
            </button>
            <button
              onClick={() => { onClose(); onGoClients(agent); }}
              className="flex flex-col items-center gap-1 rounded-xl border border-slate-200 bg-white px-2 py-2.5 hover:bg-slate-50 hover:border-violet-200 transition-colors text-center"
            >
              <UserCheck className="h-3.5 w-3.5 text-violet-600" />
              <span className="text-[10px] font-semibold text-slate-700">Lihat Klien</span>
            </button>
            <button
              onClick={() => { onClose(); onGoMission(agent); }}
              className="flex flex-col items-center gap-1 rounded-xl border border-sky-200 bg-sky-50 px-2 py-2.5 hover:bg-sky-100 transition-colors text-center"
            >
              <Target className="h-3.5 w-3.5 text-sky-600" />
              <span className="text-[10px] font-semibold text-sky-700">Beri Misi</span>
            </button>
          </div>

          <div className="flex gap-2 pt-0.5">
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
  const { user, listMembers, inviteMember } = useAuthStore();
  const { orders, fetchOrders } = useOrdersStore();
  const { clients, fetchClients } = useClientsStore();

  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [points, setPoints] = useState<AgentPoint[]>([]);
  const [missionSubs, setMissionSubs] = useState<MissionSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Dialogs
  const [selectedAgent, setSelectedAgent] = useState<AgentRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

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

  function goToOrders(agent: AgentRow) {
    navigate("/orders");
  }

  function goToClients(agent: AgentRow) {
    navigate("/clients");
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
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Users className="h-5 w-5 text-sky-600" />
            Direktori Agen
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Pantau seluruh agen aktif, level, poin, dan performa order mereka.
          </p>
        </div>
        <div className="flex items-center gap-2">
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
          {isOwner && (
            <Button
              size="sm"
              className="shrink-0 bg-sky-600 hover:bg-sky-700 text-white font-semibold"
              onClick={() => setAddOpen(true)}
            >
              <UserPlus className="h-3.5 w-3.5 mr-1.5" />
              Tambah Agen
            </Button>
          )}
        </div>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Agen" value={totalAgents} sub="terdaftar" icon={Users} color="sky" />
        <StatCard label="Total Order" value={totalOrders} sub="dari semua agen" icon={ShoppingBag} color="emerald" />
        <StatCard label="Total Klien" value={totalClients} sub="dibawa agen" icon={UserCheck} color="violet" />
        <StatCard label="Total Revenue" value={fmtIDR(totalRevenue)} sub="semua agen" icon={TrendingUp} color="amber" />
      </div>

      {/* ── Quick action links ── */}
      {agentRows.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: "Agent Command Center", desc: "Komisi & grafik performa", path: "/agent-center", icon: Trophy, color: "from-sky-50 border-sky-100 text-sky-700" },
            { label: "Leaderboard", desc: "Ranking & misi agen", path: "/agent-leaderboard", icon: Trophy, color: "from-amber-50 border-amber-100 text-amber-700" },
            { label: "Semua Order", desc: "Filter per agen", path: "/orders", icon: ShoppingBag, color: "from-emerald-50 border-emerald-100 text-emerald-700" },
            { label: "Semua Klien", desc: "Filter per agen", path: "/clients", icon: UserCheck, color: "from-violet-50 border-violet-100 text-violet-700" },
          ].map(({ label, desc, path, icon: Icon, color }) => (
            <button
              key={path}
              onClick={() => navigate(path)}
              className={`flex items-center gap-2.5 rounded-xl border bg-gradient-to-br ${color} px-3 py-2.5 hover:shadow-sm transition-all text-left`}
            >
              <Icon className="h-4 w-4 shrink-0 opacity-70" />
              <div className="min-w-0">
                <div className="text-[11.5px] font-semibold truncate">{label}</div>
                <div className="text-[10px] opacity-60 truncate">{desc}</div>
              </div>
              <ChevronRight className="h-3 w-3 ml-auto shrink-0 opacity-40" />
            </button>
          ))}
        </div>
      )}

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
          {/* Search + add button inline */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Cari nama atau email agen…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-9 text-sm"
              />
            </div>
            {isOwner && (
              <Button
                size="sm"
                variant="outline"
                className="h-9 shrink-0 border-sky-200 text-sky-600 hover:bg-sky-50"
                onClick={() => setAddOpen(true)}
              >
                <UserPlus className="h-3.5 w-3.5 mr-1" />
                Tambah
              </Button>
            )}
          </div>

          {/* Table */}
          {loading ? (
            <div className="py-12 text-center text-muted-foreground text-sm flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Memuat data agen…
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center space-y-3">
              <Users className="h-10 w-10 text-muted-foreground/30 mx-auto" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">
                  {search ? "Tidak ditemukan agen dengan nama tersebut." : "Belum ada agen terdaftar."}
                </p>
                {!search && (
                  <p className="text-xs text-muted-foreground">
                    Tambah agen pertama sekarang — mereka langsung terhubung ke semua fitur.
                  </p>
                )}
              </div>
              {!search && isOwner && (
                <Button
                  size="sm"
                  className="bg-sky-600 hover:bg-sky-700 text-white"
                  onClick={() => setAddOpen(true)}
                >
                  <UserPlus className="h-3.5 w-3.5 mr-1.5" />
                  Tambah Agen Pertama
                </Button>
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
                    <th className="px-3 py-2 text-right text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">Order</th>
                    <th className="px-3 py-2 text-right text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">Klien</th>
                    <th className="px-3 py-2 text-right text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">Komisi</th>
                    <th className="px-3 py-2 text-center text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {filtered.map((agent) => {
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
                            className="text-right hover:text-primary transition-colors group/btn"
                            title="Lihat semua order"
                          >
                            <div className="font-semibold text-[13px] group-hover/btn:underline">{agent.totalOrders}</div>
                            {agent.completedOrders > 0 && (
                              <div className="text-[10px] text-emerald-600">{agent.completedOrders} selesai</div>
                            )}
                          </button>
                        </td>

                        {/* Klien */}
                        <td className="px-3 py-3 text-right">
                          <button
                            onClick={() => navigate("/clients")}
                            className="font-semibold text-[13px] hover:text-primary hover:underline transition-colors"
                            title="Lihat semua klien"
                          >
                            {agent.clientCount}
                          </button>
                        </td>

                        {/* Komisi */}
                        <td className="px-3 py-3 text-right">
                          <div className="font-mono text-[11.5px] font-semibold text-amber-700">
                            {fmtIDR(agent.commissionOwed)}
                          </div>
                          <div className="text-[10px] text-muted-foreground">{agent.commissionPct ?? 0}%</div>
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
              <button
                className="font-medium underline hover:text-foreground transition-colors"
                onClick={() => navigate("/agent-center")}
              >
                Lihat detail performa di Command Center →
              </button>
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Add Agent Dialog ── */}
      <AddAgentDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSuccess={load}
      />

      {/* ── Agent Profile Dialog ── */}
      <AgentProfileDialog
        agent={selectedAgent}
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setSelectedAgent(null); }}
        onGoMission={goToMission}
        onGoOrders={goToOrders}
        onGoClients={goToClients}
      />
    </motion.div>
  );
}
