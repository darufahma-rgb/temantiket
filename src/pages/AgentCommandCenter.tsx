import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Users, Trophy, Wallet, TrendingUp, ShieldCheck, Edit2, Check, X,
  ChevronDown, ChevronUp, BarChart3, Crown, Zap, RefreshCw, Target,
  FileBarChart, UserPlus, Mail, Lock, Percent, Loader2, Search, Eye,
  ShoppingBag, UserCheck, ChevronRight, ClipboardList,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
  ResponsiveContainer, Legend,
} from "recharts";
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
import { getTierInfo, TIERS } from "@/features/agentPoints/agentTiers";
import { profitIDR, revenueIDR, fmtIDR } from "@/lib/profit";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { MissionCreatorSection } from "@/features/missions/MissionCreatorSection";
import { AgentWalletCard } from "@/components/AgentWalletCard";

const M = { fontFamily: "'Manrope', sans-serif" };

const AGENT_COLORS = [
  "#1a44d4", "#f97316", "#10b981", "#8b5cf6",
  "#ec4899", "#f59e0b", "#14b8a6", "#ef4444",
];

// ── Tier badge ─────────────────────────────────────────────────────────────────
function TierBadge({ points }: { points: number }) {
  const { current } = getTierInfo(points);
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-bold ${current.softBg} ${current.softText}`}>
      {current.emoji} {current.label}
    </span>
  );
}

// ── Stat card ──────────────────────────────────────────────────────────────────
function StatCard({
  label, value, sub, icon: Icon, tone,
}: {
  label: string; value: string | number; sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "sky" | "emerald" | "amber" | "violet";
}) {
  const cs = {
    sky:    "from-sky-50 to-white border-sky-100 text-sky-700",
    emerald:"from-emerald-50 to-white border-emerald-100 text-emerald-700",
    amber:  "from-amber-50 to-white border-amber-100 text-amber-700",
    violet: "from-violet-50 to-white border-violet-100 text-violet-700",
  }[tone];
  return (
    <div className={`rounded-2xl border bg-gradient-to-br p-3 md:p-4 ${cs}`}>
      <div className="flex items-center justify-between">
        <span className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
        <Icon className="h-4 w-4 opacity-60" />
      </div>
      <div className="mt-1.5 text-xl md:text-2xl font-extrabold font-mono">{value}</div>
      {sub && <div className="text-[10.5px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

// ── Add Agent Dialog ───────────────────────────────────────────────────────────
function AddAgentDialog({ open, onClose, onSuccess }: {
  open: boolean; onClose: () => void; onSuccess: () => void;
}) {
  const { inviteMember } = useAuthStore();
  const [name, setName]         = useState("");
  const [email, setEmail]       = useState("");
  const [pass, setPass]         = useState("");
  const [commission, setCommission] = useState<number>(10);
  const [loading, setLoading]   = useState(false);

  function reset() { setName(""); setEmail(""); setPass(""); setCommission(10); }

  async function handleSubmit() {
    if (!name.trim() || !email.trim() || !pass) {
      toast.error("Lengkapi semua field: nama, email, dan password."); return;
    }
    if (pass.length < 8) { toast.error("Password minimal 8 karakter."); return; }
    if (!email.includes("@")) { toast.error("Format email tidak valid."); return; }
    setLoading(true);
    try {
      await inviteMember(email.trim(), pass, name.trim(), "agent");
      toast.success(`Agen "${name.trim()}" berhasil ditambahkan!`, {
        description: `Komisi ${commission}% akan aktif setelah data tersimpan.`,
      });
      reset(); onSuccess(); onClose();
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
          <div className="space-y-1">
            <Label className="text-xs flex items-center gap-1"><Users className="h-3 w-3" /> Nama Lengkap</Label>
            <Input placeholder="cth: Ahmad Fauzi" value={name} onChange={(e) => setName(e.target.value)} className="h-9 text-sm" disabled={loading} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs flex items-center gap-1"><Mail className="h-3 w-3" /> Email Login</Label>
            <Input type="email" placeholder="agen@email.com" value={email} onChange={(e) => setEmail(e.target.value)} className="h-9 text-sm" disabled={loading} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs flex items-center gap-1">
              <Lock className="h-3 w-3" /> Password Awal <span className="text-muted-foreground">(min 8 karakter)</span>
            </Label>
            <Input type="password" placeholder="••••••••" value={pass} onChange={(e) => setPass(e.target.value)} className="h-9 text-sm" disabled={loading} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs flex items-center gap-1"><Percent className="h-3 w-3" /> Komisi per Order (%)</Label>
            <div className="flex items-center gap-2">
              <Input type="number" min={0} max={100} step={0.5} value={commission}
                onChange={(e) => setCommission(Number(e.target.value) || 0)}
                className="h-9 text-sm font-mono w-24" disabled={loading} />
              <span className="text-xs text-muted-foreground flex-1">Dihitung dari profit order yang completed.</span>
            </div>
          </div>
          <div className="rounded-xl bg-sky-50 border border-sky-100 px-3 py-2.5 space-y-1">
            <p className="text-[11px] font-semibold text-sky-700">Yang otomatis terhubung:</p>
            {[
              "Profil agen muncul di Direktori & Leaderboard",
              "Poin gamifikasi terakumulasi tiap order selesai",
              "Wallet komisi terupdate real-time",
              "Bisa diberi misi dari halaman Misi",
              "Marketing Kit & template promo siap diakses",
            ].map((item) => (
              <div key={item} className="flex items-start gap-1.5">
                <div className="h-1.5 w-1.5 rounded-full bg-sky-400 mt-1.5 shrink-0" />
                <span className="text-[10.5px] text-sky-700">{item}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1 h-10" onClick={() => { reset(); onClose(); }} disabled={loading}>Batal</Button>
            <Button className="flex-1 h-10 font-bold bg-sky-600 hover:bg-sky-700 text-white" onClick={handleSubmit} disabled={loading}>
              {loading
                ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Menambahkan…</>
                : <><UserPlus className="h-3.5 w-3.5 mr-1.5" /> Tambah Agen</>}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Agent row type ─────────────────────────────────────────────────────────────
interface AgentRow extends MemberInfo {
  totalPoints: number;
  tierInfo: ReturnType<typeof getTierInfo>;
  totalOrders: number;
  completedOrders: number;
  completedOrdersList: ReturnType<typeof useOrdersStore.getState>["orders"];
  clientCount: number;
  totalRevenue: number;
  totalProfit: number;
  commissionOwed: number;
  color: string;
}

// ── Agent Profile Dialog ───────────────────────────────────────────────────────
function AgentProfileDialog({
  agent, open, onClose, onGoAnalytics, onGoOrders, onGoClients,
}: {
  agent: AgentRow | null; open: boolean; onClose: () => void;
  onGoAnalytics: (agent: AgentRow) => void;
  onGoOrders: () => void;
  onGoClients: () => void;
}) {
  if (!agent) return null;
  const { current, next, ptsToNext, progress } = agent.tierInfo;

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
          <div className="rounded-xl border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <TierBadge points={agent.totalPoints} />
              <span className="text-xs font-mono font-semibold text-muted-foreground">
                {agent.totalPoints.toLocaleString("id-ID")} poin
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-sky-400 to-sky-600 transition-all"
                style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            {next && (
              <p className="text-[10.5px] text-muted-foreground">
                {ptsToNext} poin lagi menuju <strong>{next.label}</strong>
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Total Order",   value: agent.totalOrders,     suffix: "order" },
              { label: "Selesai",       value: agent.completedOrders, suffix: "order" },
              { label: "Total Klien",   value: agent.clientCount,     suffix: "klien" },
              { label: "Total Revenue", value: fmtIDR(agent.totalRevenue), suffix: "" },
            ].map(({ label, value, suffix }) => (
              <div key={label} className="rounded-xl border bg-secondary/30 px-3 py-2">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
                <div className="text-sm font-bold mt-0.5">
                  {value}{suffix && <span className="text-[10px] font-normal ml-1 text-muted-foreground">{suffix}</span>}
                </div>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2.5 flex items-center justify-between">
            <div>
              <div className="text-[10px] text-amber-700 font-semibold uppercase tracking-wide">Komisi Terhutang</div>
              <div className="text-sm font-bold text-amber-800 font-mono">{fmtIDR(agent.commissionOwed)}</div>
            </div>
            <span className="text-xs text-amber-600">{agent.commissionPct ?? 0}% komisi</span>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {[
              { label: "Lihat Order",  icon: ClipboardList, color: "text-sky-600 border-slate-200 hover:border-sky-200", onClick: () => { onClose(); onGoOrders(); } },
              { label: "Lihat Klien", icon: UserCheck,      color: "text-violet-600 border-slate-200 hover:border-violet-200", onClick: () => { onClose(); onGoClients(); } },
              { label: "Lihat Komisi", icon: Target,         color: "text-sky-600 border-sky-200 bg-sky-50 hover:bg-sky-100", onClick: () => { onClose(); onGoAnalytics(agent); } },
            ].map((b) => (
              <button key={b.label} onClick={b.onClick}
                className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 transition-colors text-center ${b.color}`}>
                <b.icon className="h-3.5 w-3.5" />
                <span className="text-[10px] font-semibold text-slate-700">{b.label}</span>
              </button>
            ))}
          </div>
          <div className="flex gap-2 pt-0.5">
            <Button variant="outline" size="sm" className="flex-1" onClick={onClose}>Tutup</Button>
            <Button size="sm" className="flex-1 bg-sky-600 hover:bg-sky-700 text-white"
              onClick={() => { onClose(); onGoAnalytics(agent); }}>
              <BarChart3 className="h-3.5 w-3.5 mr-1" /> Analitik
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Unified Page ──────────────────────────────────────────────────────────
type TabKey = "direktori" | "analytics" | "misi";

export default function AgentCommandCenter() {
  const navigate   = useNavigate();
  const location   = useLocation();
  const user       = useAuthStore((s) => s.user);
  const listMembers       = useAuthStore((s) => s.listMembers);
  const setMemberCommission = useAuthStore((s) => s.setMemberCommission);
  const { orders, fetchOrders } = useOrdersStore();
  const { clients, fetchClients } = useClientsStore();

  const isOwner = user?.role === "owner";
  const isStaff = user?.role === "staff";

  // ── Tab state ──
  const [tab, setTab] = useState<TabKey>("direktori");

  // ── Data ──
  const [members, setMembers]       = useState<MemberInfo[]>([]);
  const [points, setPoints]         = useState<AgentPoint[]>([]);
  const [missionSubs, setMissionSubs] = useState<MissionSubmission[]>([]);
  const [loading, setLoading]       = useState(true);

  // ── Directory state ──
  const [search, setSearch]         = useState("");
  const [selectedAgent, setSelectedAgent] = useState<AgentRow | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [addOpen, setAddOpen]       = useState(false);

  // ── Analytics state ──
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [draftPct, setDraftPct]     = useState<number>(0);
  const [saving, setSaving]         = useState(false);
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  type SortKey = "name" | "points" | "orders" | "commission" | "clients";
  const [sortKey, setSortKey]       = useState<SortKey>("points");
  const [sortDir, setSortDir]       = useState<"asc" | "desc">("desc");

  // Handle incoming location state (e.g. focusAgent from old links)
  useEffect(() => {
    const st = location.state as { focusAgent?: string } | null;
    if (st?.focusAgent) {
      setTab("analytics");
      setExpandedAgent(st.focusAgent);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load ──────────────────────────────────────────────────────────────────────
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

  // ── Derived data ──────────────────────────────────────────────────────────────
  const agentMembers = useMemo(() => members.filter((m) => m.role === "agent"), [members]);

  const pointsByAgent = useMemo(() => {
    const orderPts   = sumPointsByAgent(points);
    const missionPts = sumMissionPointsByAgent(missionSubs);
    const combined   = new Map(orderPts);
    for (const [id, pts] of missionPts) combined.set(id, (combined.get(id) ?? 0) + pts);
    return combined;
  }, [points, missionSubs]);

  const missionPointsByAgent = useMemo(() => sumMissionPointsByAgent(missionSubs), [missionSubs]);

  const clientCountByAgent = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of clients) if (c.createdByAgent) m.set(c.createdByAgent, (m.get(c.createdByAgent) ?? 0) + 1);
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

  const agentRows: AgentRow[] = useMemo(() => agentMembers.map((a, idx) => {
    const totalPoints      = pointsByAgent.get(a.userId) ?? 0;
    const tierInfo         = getTierInfo(totalPoints);
    const agentOrders      = ordersByAgent.get(a.userId) ?? [];
    const completedList    = agentOrders.filter((o) => o.status === "Completed");
    const totalRevenue     = agentOrders.reduce((s, o) => s + revenueIDR(o), 0);
    const totalProfit      = completedList.reduce((s, o) => s + Math.max(0, profitIDR(o)), 0);
    const commissionOwed   = totalProfit * ((a.commissionPct ?? 0) / 100);
    return {
      ...a, totalPoints, tierInfo,
      totalOrders: agentOrders.length,
      completedOrders: completedList.length,
      completedOrdersList: completedList,
      clientCount: clientCountByAgent.get(a.userId) ?? 0,
      totalRevenue, totalProfit, commissionOwed,
      color: AGENT_COLORS[idx % AGENT_COLORS.length],
    };
  }).sort((a, b) => b.totalPoints - a.totalPoints), [agentMembers, pointsByAgent, ordersByAgent, clientCountByAgent]);

  // Filtered for directory search
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return agentRows;
    return agentRows.filter((a) => a.displayName.toLowerCase().includes(q) || a.email.toLowerCase().includes(q));
  }, [agentRows, search]);

  // Sorted for analytics table
  const sortedRows = useMemo(() => {
    const rows = [...agentRows];
    rows.sort((a, b) => {
      let diff = 0;
      if (sortKey === "name")       diff = a.displayName.localeCompare(b.displayName);
      else if (sortKey === "points")     diff = a.totalPoints - b.totalPoints;
      else if (sortKey === "orders")     diff = a.totalOrders - b.totalOrders;
      else if (sortKey === "commission") diff = a.commissionOwed - b.commissionOwed;
      else if (sortKey === "clients")    diff = a.clientCount - b.clientCount;
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

  // Summary totals
  const totalCommissionOwed = useMemo(() => agentRows.reduce((s, a) => s + a.commissionOwed, 0), [agentRows]);
  const totalAgentRevenue   = useMemo(() => agentRows.reduce((s, a) => s + a.totalRevenue, 0), [agentRows]);
  const avgPoints           = useMemo(
    () => agentRows.length > 0 ? Math.round(agentRows.reduce((s, a) => s + a.totalPoints, 0) / agentRows.length) : 0,
    [agentRows],
  );
  const totalDirOrders   = useMemo(() => agentRows.reduce((s, a) => s + a.totalOrders, 0), [agentRows]);
  const totalDirClients  = useMemo(() => agentRows.reduce((s, a) => s + a.clientCount, 0), [agentRows]);

  // Monthly chart
  const chartData = useMemo(() => {
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = subMonths(new Date(), 5 - i);
      return { label: format(startOfMonth(d), "MMM yy", { locale: idLocale }), from: startOfMonth(d), to: endOfMonth(d) };
    });
    return months.map(({ label, from, to }) => {
      const row: Record<string, string | number> = { month: label };
      for (const a of agentRows) {
        row[a.displayName] = (ordersByAgent.get(a.userId) ?? []).filter((o) => {
          const t = new Date(o.createdAt).getTime();
          return t >= from.getTime() && t <= to.getTime();
        }).length;
      }
      return row;
    });
  }, [agentRows, ordersByAgent]);

  // Commission save
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

  function rankOf(idx: number) {
    if (idx === 0) return "🥇";
    if (idx === 1) return "🥈";
    if (idx === 2) return "🥉";
    return `#${idx + 1}`;
  }

  function goToAnalytics(agent: AgentRow) {
    setTab("analytics");
    setExpandedAgent(agent.userId);
  }

  // Access guard
  if (!isOwner && !isStaff) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-muted-foreground">
        <Users className="h-10 w-10 opacity-30" />
        <p className="text-sm font-medium">Akses tidak diizinkan.</p>
      </div>
    );
  }

  const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
    { key: "direktori", label: "Direktori",  icon: Users },
    { key: "analytics", label: "Analytics",  icon: BarChart3 },
    { key: "misi",      label: "Misi & Wallet", icon: Target },
  ];

  return (
    <motion.div
      className="max-w-7xl mx-auto p-4 md:p-6 space-y-5"
      style={M}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <Crown className="h-5 w-5 text-primary" />
            Manajemen Agen
          </h1>
          <p className="text-[12px] text-muted-foreground mt-0.5 flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-blue-600" />
            {agentMembers.length} mitra terdaftar
            {user?.agencyName && <> · {user.agencyName}</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}
            className="rounded-xl border-sky-200 text-sky-700 hover:bg-sky-50">
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          {isOwner && tab === "direktori" && (
            <Button size="sm" className="bg-sky-600 hover:bg-sky-700 text-white font-semibold"
              onClick={() => setAddOpen(true)}>
              <UserPlus className="h-3.5 w-3.5 mr-1.5" /> Tambah Agen
            </Button>
          )}
        </div>
      </div>

      {/* ── Tab Selector ───────────────────────────────────────────────────────── */}
      <div className="flex gap-2 border-b pb-0">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2 text-[12.5px] font-semibold border-b-2 transition-colors -mb-px whitespace-nowrap ${
              tab === key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════════
          TAB: DIREKTORI
      ══════════════════════════════════════════════════════════════════════════ */}
      {tab === "direktori" && (
        <div className="space-y-5">
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Total Agen"   value={agentMembers.length}        sub="terdaftar"         icon={Users}      tone="sky" />
            <StatCard label="Total Order"  value={totalDirOrders}             sub="dari semua agen"   icon={ShoppingBag} tone="emerald" />
            <StatCard label="Total Klien"  value={totalDirClients}            sub="dibawa agen"       icon={UserCheck}  tone="violet" />
            <StatCard label="Total Revenue" value={fmtIDR(totalAgentRevenue)} sub="semua agen"        icon={TrendingUp} tone="amber" />
          </div>

          {/* Search + table */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Trophy className="h-4 w-4 text-amber-500" /> Daftar Agen
              </CardTitle>
              <CardDescription className="text-xs">
                Diurutkan berdasarkan total poin (tertinggi di atas)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
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
                  <Button size="sm" variant="outline" className="h-9 shrink-0 border-sky-200 text-sky-600 hover:bg-sky-50"
                    onClick={() => setAddOpen(true)}>
                    <UserPlus className="h-3.5 w-3.5 mr-1" /> Tambah
                  </Button>
                )}
              </div>

              {loading ? (
                <div className="py-12 text-center text-muted-foreground text-sm flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Memuat data agen…
                </div>
              ) : filteredRows.length === 0 ? (
                <div className="py-12 text-center space-y-3">
                  <Users className="h-10 w-10 text-muted-foreground/30 mx-auto" />
                  <p className="text-sm font-medium text-muted-foreground">
                    {search ? "Tidak ditemukan agen dengan nama tersebut." : "Belum ada agen terdaftar."}
                  </p>
                  {!search && isOwner && (
                    <Button size="sm" className="bg-sky-600 hover:bg-sky-700 text-white" onClick={() => setAddOpen(true)}>
                      <UserPlus className="h-3.5 w-3.5 mr-1.5" /> Tambah Agen Pertama
                    </Button>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto -mx-2">
                  <table className="w-full min-w-[580px] text-sm">
                    <thead>
                      <tr className="border-b">
                        {["#", "Nama Agen", "Level / Rank", "Total Poin", "Order", "Klien", "Komisi", "Aksi"].map((h) => (
                          <th key={h} className={`px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground ${h === "#" ? "text-center w-8" : h === "Aksi" ? "text-center" : h === "Nama Agen" || h === "Level / Rank" ? "text-left" : "text-right"}`}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {filteredRows.map((agent) => {
                        const rank = agentRows.findIndex((a) => a.userId === agent.userId);
                        return (
                          <tr key={agent.userId} className="group hover:bg-secondary/40 transition-colors">
                            <td className="px-3 py-3 text-center text-base">{rankOf(rank)}</td>
                            <td className="px-3 py-3">
                              <div className="flex items-center gap-2.5">
                                <div className="h-8 w-8 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                                  style={{ background: agent.color }}>
                                  {agent.displayName.charAt(0).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <div className="font-semibold text-[13px] truncate max-w-[140px]">{agent.displayName}</div>
                                  <div className="text-[10.5px] text-muted-foreground truncate max-w-[140px]">{agent.email}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-3"><TierBadge points={agent.totalPoints} /></td>
                            <td className="px-3 py-3 text-right">
                              <span className="font-mono font-semibold text-[13px]">{agent.totalPoints.toLocaleString("id-ID")}</span>
                              <span className="text-[10px] text-muted-foreground ml-1">pts</span>
                            </td>
                            <td className="px-3 py-3 text-right">
                              <div className="font-semibold text-[13px]">{agent.totalOrders}</div>
                              {agent.completedOrders > 0 && (
                                <div className="text-[10px] text-emerald-600">{agent.completedOrders} selesai</div>
                              )}
                            </td>
                            <td className="px-3 py-3 text-right font-semibold text-[13px]">{agent.clientCount}</td>
                            <td className="px-3 py-3 text-right">
                              <div className="font-mono text-[11.5px] font-semibold text-amber-700">{fmtIDR(agent.commissionOwed)}</div>
                              <div className="text-[10px] text-muted-foreground">{agent.commissionPct ?? 0}%</div>
                            </td>
                            <td className="px-3 py-3">
                              <div className="flex items-center justify-center gap-1.5">
                                <Button variant="outline" size="sm" className="h-7 px-2.5 text-[11px] gap-1"
                                  onClick={() => { setSelectedAgent(agent); setProfileOpen(true); }}>
                                  <Eye className="h-3 w-3" /> Profil
                                </Button>
                                <Button size="sm" className="h-7 px-2.5 text-[11px] gap-1 bg-sky-600 hover:bg-sky-700 text-white"
                                  onClick={() => goToAnalytics(agent)}>
                                  <BarChart3 className="h-3 w-3" /> Analitik
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

              {!loading && filteredRows.length > 0 && (
                <p className="text-[10.5px] text-muted-foreground text-right pt-1">
                  {filteredRows.length} dari {agentRows.length} agen ·{" "}
                  <button className="font-medium underline hover:text-foreground transition-colors"
                    onClick={() => setTab("analytics")}>
                    Lihat performa di Analytics →
                  </button>
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          TAB: ANALYTICS
      ══════════════════════════════════════════════════════════════════════════ */}
      {tab === "analytics" && (
        <div className="space-y-5">
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Total Mitra"   value={String(agentMembers.length)}
              sub={`${agentRows.filter((a) => a.tierInfo.current.key !== "bronze").length} sudah naik tier`}
              icon={Users} tone="sky" />
            <StatCard label="Komisi Harus Dibayar" value={fmtIDR(totalCommissionOwed)}
              sub="dari order Completed" icon={Wallet} tone="amber" />
            <StatCard label="Total Revenue Mitra" value={fmtIDR(totalAgentRevenue)}
              sub={`${agentRows.reduce((s, a) => s + a.totalOrders, 0)} order total`}
              icon={TrendingUp} tone="emerald" />
            <StatCard label="Rata-rata Poin" value={String(avgPoints)}
              sub="per mitra aktif" icon={Trophy} tone="violet" />
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
                Tambah agen pertama di tab <strong>Direktori</strong>.
              </p>
              <Button size="sm" className="mt-4 bg-sky-600 hover:bg-sky-700 text-white"
                onClick={() => setTab("direktori")}>
                <Users className="h-3.5 w-3.5 mr-1.5" /> Ke Direktori
              </Button>
            </Card>
          )}

          {!loading && agentMembers.length > 0 && (
            <>
              {/* Agent Overview Table */}
              <Card className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-[13px] font-semibold flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5 text-blue-600" /> Agent Overview
                  </h2>
                  <span className="text-[10.5px] text-muted-foreground">{agentMembers.length} mitra · klik header utk sort</span>
                </div>
                <div className="overflow-x-auto -mx-1">
                  <table className="w-full text-[12px] min-w-[700px]">
                    <thead>
                      <tr className="text-muted-foreground border-b">
                        <th className="text-left font-semibold py-2 px-2">#</th>
                        <th className="text-left font-semibold py-2 px-2 cursor-pointer hover:text-foreground" onClick={() => toggleSort("name")}>
                          Nama <SortIcon col="name" />
                        </th>
                        <th className="text-center font-semibold py-2 px-2">Tier</th>
                        <th className="text-right font-semibold py-2 px-2 cursor-pointer hover:text-foreground" onClick={() => toggleSort("clients")}>
                          Klien <SortIcon col="clients" />
                        </th>
                        <th className="text-right font-semibold py-2 px-2 cursor-pointer hover:text-foreground" onClick={() => toggleSort("orders")}>
                          Order <SortIcon col="orders" />
                        </th>
                        <th className="text-right font-semibold py-2 px-2 cursor-pointer hover:text-foreground" onClick={() => toggleSort("points")}>
                          Poin <SortIcon col="points" />
                        </th>
                        <th className="text-right font-semibold py-2 px-2 cursor-pointer hover:text-foreground" onClick={() => toggleSort("commission")}>
                          Komisi % <SortIcon col="commission" />
                        </th>
                        <th className="text-right font-semibold py-2 px-2">Komisi Owed</th>
                        <th className="text-center font-semibold py-2 px-2">Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedRows.map((agent, i) => {
                        const isEditing = editingId === agent.userId;
                        const { current: tier, next, progress } = agent.tierInfo;
                        return (
                          <tr key={agent.userId} className="border-b last:border-b-0 hover:bg-blue-50/30 transition-colors">
                            <td className="py-2.5 px-2 text-muted-foreground font-mono">{i + 1}</td>
                            <td className="py-2.5 px-2">
                              <div className="flex items-center gap-2">
                                <div className="h-7 w-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0"
                                  style={{ background: agent.color }}>
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
                                    <div className="h-full rounded-full" style={{ width: `${progress * 100}%`, background: tier.hex }} />
                                  </div>
                                  <span className="text-[9px] text-muted-foreground">{agent.tierInfo.pointsToNext}pt</span>
                                </div>
                              )}
                            </td>
                            <td className="py-2.5 px-2 text-right font-mono">{agent.clientCount}</td>
                            <td className="py-2.5 px-2 text-right">
                              <span className="font-mono">{agent.totalOrders}</span>
                              <span className="text-[10px] text-muted-foreground ml-1">({agent.completedOrders} done)</span>
                            </td>
                            <td className="py-2.5 px-2 text-right font-mono font-bold text-amber-700">⭐ {agent.totalPoints}</td>
                            <td className="py-2.5 px-2 text-right">
                              {isEditing ? (
                                <input type="number" min={0} max={100} value={draftPct}
                                  onChange={(e) => setDraftPct(Number(e.target.value))}
                                  className="w-16 h-7 rounded-lg border border-blue-300 text-center text-[12px] font-mono focus:outline-none focus:ring-2 focus:ring-blue-300"
                                />
                              ) : (
                                <span className="font-mono font-bold text-orange-700">{agent.commissionPct}%</span>
                              )}
                            </td>
                            <td className="py-2.5 px-2 text-right font-mono font-bold text-rose-700">{fmtIDR(agent.commissionOwed)}</td>
                            <td className="py-2.5 px-2 text-center">
                              <div className="flex items-center justify-center gap-1">
                                {isEditing ? (
                                  <>
                                    <button onClick={() => saveCommission(agent.userId)} disabled={saving}
                                      className="h-6 w-6 rounded-md bg-emerald-100 hover:bg-emerald-200 text-emerald-700 flex items-center justify-center transition-colors">
                                      <Check className="h-3.5 w-3.5" />
                                    </button>
                                    <button onClick={() => setEditingId(null)}
                                      className="h-6 w-6 rounded-md bg-red-50 hover:bg-red-100 text-red-600 flex items-center justify-center transition-colors">
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    {isOwner && (
                                      <button onClick={() => { setEditingId(agent.userId); setDraftPct(agent.commissionPct ?? 0); }}
                                        className="h-6 w-6 rounded-md bg-blue-50 hover:bg-blue-100 text-blue-700 flex items-center justify-center transition-colors" title="Edit Komisi">
                                        <Edit2 className="h-3.5 w-3.5" />
                                      </button>
                                    )}
                                    <button onClick={() => setExpandedAgent(expandedAgent === agent.userId ? null : agent.userId)}
                                      className="h-6 w-6 rounded-md bg-slate-50 hover:bg-slate-100 text-slate-600 flex items-center justify-center transition-colors" title="Commission Tracker">
                                      {expandedAgent === agent.userId ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* Commission Tracker */}
              {expandedAgent && (() => {
                const agent = agentRows.find((a) => a.userId === expandedAgent);
                if (!agent) return null;
                const agentMissionPts = missionPointsByAgent.get(agent.userId) ?? 0;
                const completedList   = agent.completedOrdersList;
                return (
                  <Card className="p-4 border-blue-200 bg-blue-50/30">
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="text-[13px] font-semibold flex items-center gap-1.5">
                        <Wallet className="h-3.5 w-3.5 text-blue-600" />
                        Commission Tracker — <span style={{ color: agent.color }}>{agent.displayName}</span>
                      </h2>
                      <span className="text-[10.5px] text-muted-foreground">{completedList.length} order Completed</span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                      {[
                        { label: "Total Revenue", value: fmtIDR(agent.totalRevenue),   color: "text-sky-700" },
                        { label: "Total Profit",  value: fmtIDR(agent.totalProfit),    color: "text-emerald-700" },
                        { label: `Komisi (${agent.commissionPct}%)`, value: fmtIDR(agent.commissionOwed), color: "text-orange-700" },
                        { label: "Net Agency",    value: fmtIDR(agent.totalProfit - agent.commissionOwed), color: "text-blue-700" },
                      ].map((r) => (
                        <div key={r.label} className="rounded-xl bg-white border p-3">
                          <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">{r.label}</p>
                          <p className={`text-[13px] font-extrabold font-mono mt-0.5 ${r.color}`}>{r.value}</p>
                        </div>
                      ))}
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-[11.5px] min-w-[540px]">
                        <thead>
                          <tr className="text-muted-foreground border-b">
                            {["Order", "Tanggal", "Revenue", "Profit", `Komisi (${agent.commissionPct}%)`].map((h) => (
                              <th key={h} className={`font-semibold py-1.5 px-2 ${h === "Order" ? "text-left" : "text-right"}`}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {completedList.length === 0 ? (
                            <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">Belum ada order Completed.</td></tr>
                          ) : completedList.map((o) => {
                            const rev  = revenueIDR(o);
                            const prof = Math.max(0, profitIDR(o));
                            const com  = prof * ((agent.commissionPct ?? 0) / 100);
                            return (
                              <tr key={o.id} className="border-b last:border-b-0 hover:bg-white/60">
                                <td className="py-1.5 px-2 font-medium max-w-[200px] truncate">{o.title || "—"}</td>
                                <td className="py-1.5 px-2 text-right text-muted-foreground whitespace-nowrap">
                                  {new Date(o.createdAt).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}
                                </td>
                                <td className="py-1.5 px-2 text-right font-mono">{fmtIDR(rev)}</td>
                                <td className={`py-1.5 px-2 text-right font-mono font-semibold ${prof >= 0 ? "text-emerald-700" : "text-red-600"}`}>{fmtIDR(prof)}</td>
                                <td className="py-1.5 px-2 text-right font-mono font-bold text-orange-700">{fmtIDR(com)}</td>
                              </tr>
                            );
                          })}
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
                    {user?.id && (
                      <AgentWalletCard
                        agentId={agent.userId}
                        agentName={agent.displayName}
                        missionPoints={agentMissionPts}
                        reviewedBy={user.id}
                      />
                    )}
                  </Card>
                );
              })()}

              {/* Performance Chart */}
              <Card className="p-4">
                <div className="mb-4">
                  <h2 className="text-[13px] font-semibold flex items-center gap-1.5">
                    <BarChart3 className="h-3.5 w-3.5 text-blue-600" /> Performance Analytics — Order per Bulan
                  </h2>
                  <p className="text-[10.5px] text-muted-foreground mt-0.5">6 bulan terakhir · semua tipe order</p>
                </div>
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <ReTooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} formatter={(v: number) => [`${v} order`]} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      {agentRows.map((a) => (
                        <Bar key={a.userId} dataKey={a.displayName} fill={a.color} radius={[3, 3, 0, 0]} maxBarSize={40} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              {/* Tier Distribution */}
              <Card className="p-4">
                <h2 className="text-[13px] font-semibold flex items-center gap-1.5 mb-4">
                  <Zap className="h-3.5 w-3.5 text-amber-500" /> Distribusi Tier Mitra
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {TIERS.map((tier) => {
                    const count = agentRows.filter((a) => a.tierInfo.current.key === tier.key).length;
                    return (
                      <div key={tier.key} className={`rounded-xl border p-3 ${tier.softBg}`}>
                        <div className="text-[20px]">{tier.emoji}</div>
                        <p className={`text-[12px] font-bold mt-1 ${tier.softText}`}>{tier.label}</p>
                        <p className={`text-[24px] font-extrabold font-mono mt-0.5 ${tier.softText}`}>{count}</p>
                        <p className="text-[10px] text-muted-foreground">mitra · ≥{tier.minPoints}pt</p>
                      </div>
                    );
                  })}
                </div>
              </Card>

              {/* Footer note */}
              <div className="rounded-xl border bg-muted/30 p-3 text-[10.5px] text-muted-foreground leading-relaxed">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <strong className="text-foreground">Catatan:</strong>{" "}
                    Komisi = Profit × Komisi% · hanya dari order <strong>Completed</strong> dengan profit positif.
                    Edit komisi via ikon ✏️ di tabel. Poin misi dihitung dari misi yang disetujui admin.
                  </div>
                  <button onClick={() => navigate("/reports")}
                    className="shrink-0 flex items-center gap-1.5 text-[11px] font-semibold text-blue-600 hover:text-blue-700 hover:underline transition-colors whitespace-nowrap">
                    <FileBarChart className="h-3.5 w-3.5" /> Lihat Laporan →
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          TAB: MISI & WALLET
      ══════════════════════════════════════════════════════════════════════════ */}
      {tab === "misi" && (
        <div className="space-y-5">
          {user?.agencyId && user?.id ? (
            <Card className="p-4">
              <MissionCreatorSection
                agencyId={user.agencyId}
                ownerId={user.id}
                agentNames={new Map(agentMembers.map((a) => [a.userId, a.displayName]))}
                agentCount={agentMembers.length}
              />
            </Card>
          ) : (
            <Card className="p-10 text-center">
              <Target className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="font-semibold">Fitur misi tidak tersedia</p>
              <p className="text-[12px] text-muted-foreground mt-1">Pastikan akun sudah terhubung ke agency.</p>
            </Card>
          )}
        </div>
      )}

      {/* ── Dialogs ─────────────────────────────────────────────────────────────── */}
      <AddAgentDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSuccess={load}
      />
      <AgentProfileDialog
        agent={selectedAgent}
        open={profileOpen}
        onClose={() => { setProfileOpen(false); setSelectedAgent(null); }}
        onGoAnalytics={goToAnalytics}
        onGoOrders={() => navigate("/orders")}
        onGoClients={() => navigate("/clients")}
      />
    </motion.div>
  );
}
