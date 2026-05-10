/**
 * StaffPerformanceCenter — /staff-performance
 * Owner-only dashboard untuk memantau performa seluruh staff internal Temantiket.
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, RefreshCw, Users, TrendingUp, CheckCircle2,
  Clock, AlertTriangle, Star, Award, Zap, Target,
  Filter, ChevronDown, ChevronUp, ExternalLink,
  BarChart3, Activity, Briefcase, CircleDot,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthStore, type MemberInfo } from "@/store/authStore";
import { useOrdersStore, type Order } from "@/store/ordersStore";
import { useClientsStore } from "@/store/clientsStore";
import { usePresenceStore } from "@/store/presenceStore";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ── helpers ─────────────────────────────────────────────────────────────────

const fmtIDR = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

const fmtDate = (iso: string) => {
  try {
    return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(iso));
  } catch { return iso.slice(0, 10); }
};

const fmtRelative = (iso: string) => {
  if (!iso) return "—";
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60_000);
    if (m < 2) return "baru saja";
    if (m < 60) return `${m} menit lalu`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} jam lalu`;
    const d = Math.floor(h / 24);
    if (d < 30) return `${d} hari lalu`;
    return fmtDate(iso);
  } catch { return "—"; }
};

type Period = "all" | "today" | "week" | "month";

function periodStart(p: Period): number {
  const now = new Date();
  if (p === "today") { now.setHours(0, 0, 0, 0); return now.getTime(); }
  if (p === "week") { now.setDate(now.getDate() - 7); return now.getTime(); }
  if (p === "month") { now.setDate(now.getDate() - 30); return now.getTime(); }
  return 0;
}

// ── types ────────────────────────────────────────────────────────────────────

interface StaffMetrics {
  staff: MemberInfo;
  total: number;
  completed: number;
  active: number;
  cancelled: number;
  totalFee: number;
  feeCredited: number;
  feePending: number;
  profitContribution: number;
  completionRate: number;
  lastActive: string;
  recentOrders: Order[];
  byType: Record<string, number>;
  alerts: string[];
  badge: string | null;
}

// ── derive metrics ───────────────────────────────────────────────────────────

function buildMetrics(staff: MemberInfo, orders: Order[], cutoff: number): StaffMetrics {
  const sid = staff.userId;

  const allOrders = orders.filter((o) => {
    const m = o.metadata as Record<string, unknown>;
    return m.pelaksanaId === sid || m.voaFieldAgentId === sid || m.kurirAgentId === sid;
  });

  const filtered = cutoff > 0
    ? allOrders.filter((o) => new Date(o.updatedAt).getTime() >= cutoff)
    : allOrders;

  const completed  = filtered.filter((o) => o.status === "Completed");
  const active     = filtered.filter((o) => ["Confirmed", "Paid", "Pending"].includes(o.status));
  const cancelled  = filtered.filter((o) => o.status === "Cancelled");

  let totalFee = 0;
  let feeCredited = 0;

  for (const o of filtered) {
    const m = o.metadata as Record<string, unknown>;
    if (m.pelaksanaId === sid) {
      const f = Number(m.pelaksanaFee ?? 200_000);
      totalFee += f;
      if (m.pelaksanaFeeCredited) feeCredited += f;
    }
    if (m.voaFieldAgentId === sid) {
      const f = Number(m.voaAgentFee ?? 0);
      totalFee += f;
      if (m.voaFeeCredited) feeCredited += f;
    }
    if (m.kurirAgentId === sid) {
      const f = Number(m.kurirFee ?? 0);
      totalFee += f;
      if (m.kurirFeeCredited) feeCredited += f;
    }
  }

  const profitContribution = completed.reduce((sum, o) => {
    const profit = (o.totalPrice || 0) - (o.costPrice || 0);
    return sum + Math.max(0, profit);
  }, 0);

  const completionRate = filtered.length > 0 ? (completed.length / filtered.length) * 100 : 0;

  const lastActive = allOrders.reduce((latest, o) =>
    o.updatedAt > latest ? o.updatedAt : latest, "");

  const recentOrders = [...allOrders]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 5);

  const byType: Record<string, number> = {};
  for (const o of filtered) {
    byType[o.type] = (byType[o.type] ?? 0) + 1;
  }

  // Alerts
  const alerts: string[] = [];
  const stuckOrders = active.filter((o) => {
    const age = Date.now() - new Date(o.updatedAt).getTime();
    return age > 7 * 24 * 3600_000;
  });
  if (stuckOrders.length > 0) alerts.push(`${stuckOrders.length} order aktif > 7 hari tanpa update`);
  if (active.length >= 8) alerts.push(`Beban kerja tinggi: ${active.length} order aktif`);
  if (!lastActive && filtered.length === 0) alerts.push("Belum ada penugasan");
  if (lastActive) {
    const daysSince = (Date.now() - new Date(lastActive).getTime()) / 86_400_000;
    if (daysSince > 14) alerts.push("Tidak aktif > 14 hari");
  }

  // Badge
  let badge: string | null = null;
  if (completionRate >= 90 && completed.length >= 5) badge = "⚡ Top Executor";
  else if (completed.length >= 10) badge = "🏆 Closing Terbanyak";
  else if (active.length > 0 && stuckOrders.length === 0) badge = "🎯 Problem Solver";
  else if (completionRate >= 80) badge = "⭐ Andalan";

  return {
    staff, total: filtered.length, completed: completed.length,
    active: active.length, cancelled: cancelled.length,
    totalFee, feeCredited, feePending: totalFee - feeCredited,
    profitContribution, completionRate, lastActive,
    recentOrders, byType, alerts, badge,
  };
}

// ── ORDER TYPE LABEL ─────────────────────────────────────────────────────────

const TYPE_LABEL: Record<string, string> = {
  visa_student: "Visa Pelajar",
  visa_voa: "Visa VOA",
  umrah: "Umrah",
  flight: "Tiket",
};

const STATUS_CFG: Record<string, { cls: string; label: string }> = {
  Completed: { cls: "bg-emerald-100 text-emerald-700", label: "Selesai" },
  Paid:      { cls: "bg-sky-100 text-sky-700",         label: "Lunas" },
  Confirmed: { cls: "bg-blue-100 text-blue-700",       label: "Confirmed" },
  Pending:   { cls: "bg-amber-100 text-amber-700",     label: "Proses" },
  Draft:     { cls: "bg-slate-100 text-slate-500",     label: "Draft" },
  Cancelled: { cls: "bg-red-100 text-red-600",         label: "Batal" },
};

// ── COMPONENT ────────────────────────────────────────────────────────────────

export default function StaffPerformanceCenter() {
  const navigate = useNavigate();
  const listMembers = useAuthStore((s) => s.listMembers);
  const user = useAuthStore((s) => s.user);
  const { orders, fetchOrders } = useOrdersStore();
  const { clients, fetchClients } = useClientsStore();
  const isOnline = usePresenceStore((s) => s.isOnline);

  const [staffMembers, setStaffMembers] = useState<MemberInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState<Period>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"name" | "completed" | "fee" | "active">("completed");

  // Owner guard
  if (user && user.role !== "owner") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertTriangle className="h-10 w-10 text-amber-400" />
        <p className="text-sm font-semibold text-muted-foreground">Halaman ini hanya untuk owner.</p>
        <Button size="sm" onClick={() => navigate(-1)}>Kembali</Button>
      </div>
    );
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const [members] = await Promise.all([listMembers(), fetchOrders(), fetchClients()]);
        if (!cancelled) {
          setStaffMembers(members.filter((m) => m.role === "staff"));
        }
      } catch (e) {
        toast.error("Gagal memuat data: " + (e instanceof Error ? e.message : String(e)));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const [members] = await Promise.all([listMembers(), fetchOrders()]);
      setStaffMembers(members.filter((m) => m.role === "staff"));
      toast.success("Data diperbarui.");
    } catch { toast.error("Gagal refresh."); }
    finally { setRefreshing(false); }
  };

  const clientMap = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);

  const cutoff = useMemo(() => periodStart(period), [period]);

  const allMetrics = useMemo(() =>
    staffMembers.map((s) => buildMetrics(s, orders, cutoff)),
    [staffMembers, orders, cutoff],
  );

  const sorted = useMemo(() => {
    return [...allMetrics].sort((a, b) => {
      if (sortBy === "completed") return b.completed - a.completed;
      if (sortBy === "fee") return b.totalFee - a.totalFee;
      if (sortBy === "active") return b.active - a.active;
      return a.staff.displayName.localeCompare(b.staff.displayName, "id");
    });
  }, [allMetrics, sortBy]);

  // ── Summary stats ──────────────────────────────────────────────────────────
  const summary = useMemo(() => {
    const total      = allMetrics.reduce((s, m) => s + m.total, 0);
    const completed  = allMetrics.reduce((s, m) => s + m.completed, 0);
    const active     = allMetrics.reduce((s, m) => s + m.active, 0);
    const totalFee   = allMetrics.reduce((s, m) => s + m.totalFee, 0);
    const alertCount = allMetrics.reduce((s, m) => s + m.alerts.length, 0);
    return { total, completed, active, totalFee, alertCount };
  }, [allMetrics]);

  const PERIOD_OPTIONS: { id: Period; label: string }[] = [
    { id: "today", label: "Hari Ini" },
    { id: "week",  label: "7 Hari" },
    { id: "month", label: "30 Hari" },
    { id: "all",   label: "Semua" },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <RefreshCw className="h-6 w-6 animate-spin text-sky-400" />
          <p className="text-sm">Memuat data performa staff…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-1 pb-12 space-y-5">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 pt-1">
        <div className="flex items-center gap-2.5">
          <button onClick={() => navigate(-1)} className="p-1.5 rounded-xl hover:bg-slate-100 transition-colors text-muted-foreground">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Activity className="h-5 w-5 text-sky-500" strokeWidth={1.8} />
              Pantau Kinerja Staff
            </h1>
            <p className="text-[11px] text-muted-foreground">{staffMembers.length} staff internal · data realtime</p>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void handleRefresh()}
          disabled={refreshing}
          className="h-8 gap-1.5 text-[12px]"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* ── Period filter + sort ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center rounded-xl border border-slate-200 overflow-hidden bg-white shrink-0">
          {PERIOD_OPTIONS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              className={cn(
                "px-3 py-1.5 text-[11px] font-semibold transition-colors border-r border-slate-200 last:border-r-0",
                period === p.id ? "bg-sky-500 text-white" : "text-slate-500 hover:bg-slate-50",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Filter className="h-3 w-3" />
          Urutkan:
        </div>
        {([
          { id: "completed" as const, label: "Selesai" },
          { id: "fee" as const, label: "Fee" },
          { id: "active" as const, label: "Aktif" },
          { id: "name" as const, label: "Nama" },
        ]).map((s) => (
          <button
            key={s.id}
            onClick={() => setSortBy(s.id)}
            className={cn(
              "px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors",
              sortBy === s.id ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* ── Summary KPI strip ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Penugasan", value: summary.total, icon: Briefcase, color: "text-sky-600", bg: "bg-sky-50" },
          { label: "Order Selesai",   value: summary.completed, icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50" },
          { label: "Order Aktif",     value: summary.active, icon: CircleDot, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Total Fee Staff", value: fmtIDR(summary.totalFee), icon: TrendingUp, color: "text-purple-600", bg: "bg-purple-50" },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-2xl border bg-white p-4 flex items-center gap-3">
            <div className={cn("h-9 w-9 rounded-xl flex items-center justify-center shrink-0", kpi.bg)}>
              <kpi.icon className={cn("h-4.5 w-4.5", kpi.color)} strokeWidth={1.8} />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground font-medium">{kpi.label}</p>
              <p className="text-[16px] font-extrabold font-mono">{kpi.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Alert strip ── */}
      {summary.alertCount > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-center gap-3">
          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
          <p className="text-[12px] font-semibold text-amber-700">
            {summary.alertCount} alert aktif — cek detail staff di bawah.
          </p>
        </div>
      )}

      {/* ── Empty state ── */}
      {staffMembers.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
          <Users className="h-10 w-10 opacity-30" />
          <p className="text-sm font-medium">Belum ada staff internal.</p>
          <p className="text-[11px]">Undang staff dari halaman Pengaturan.</p>
        </div>
      )}

      {/* ── Staff cards ── */}
      <div className="space-y-3">
        <AnimatePresence initial={false}>
          {sorted.map((m, idx) => {
            const online = isOnline(m.staff.userId);
            const isExpanded = expandedId === m.staff.userId;

            return (
              <motion.div
                key={m.staff.userId}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.04 }}
                className="rounded-2xl border bg-white overflow-hidden shadow-sm"
              >
                {/* ── Card header ── */}
                <div
                  className="flex items-center gap-3 px-4 py-3.5 cursor-pointer hover:bg-slate-50/60 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : m.staff.userId)}
                >
                  {/* Avatar */}
                  <div className="relative shrink-0">
                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center text-white font-bold text-[14px]">
                      {(m.staff.displayName || m.staff.email).slice(0, 1).toUpperCase()}
                    </div>
                    <span className={cn(
                      "absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white",
                      online ? "bg-emerald-500" : "bg-slate-300",
                    )} />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[13px] font-bold truncate">{m.staff.displayName || m.staff.email}</p>
                      {online && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold shrink-0">
                          online
                        </span>
                      )}
                      {m.badge && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-700 font-bold shrink-0">
                          {m.badge}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {m.staff.email} · aktif {fmtRelative(m.lastActive)}
                    </p>
                    {/* Alert badges */}
                    {m.alerts.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {m.alerts.map((a, i) => (
                          <span key={i} className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold flex items-center gap-0.5">
                            <AlertTriangle className="h-2.5 w-2.5" /> {a}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Stats chips */}
                  <div className="hidden sm:flex items-center gap-2 shrink-0">
                    <div className="text-right">
                      <p className="text-[10px] text-muted-foreground">Selesai</p>
                      <p className="text-[15px] font-extrabold text-emerald-600">{m.completed}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-muted-foreground">Aktif</p>
                      <p className="text-[15px] font-extrabold text-sky-600">{m.active}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-muted-foreground">Fee</p>
                      <p className="text-[12px] font-bold text-purple-600 font-mono">{fmtIDR(m.totalFee)}</p>
                    </div>
                  </div>

                  {/* Expand toggle */}
                  <div className="shrink-0 text-muted-foreground">
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </div>
                </div>

                {/* ── Expanded detail ── */}
                <AnimatePresence initial={false}>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.22 }}
                      className="overflow-hidden"
                    >
                      <div className="border-t divide-y">

                        {/* ── KPI row ── */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-slate-100">
                          {[
                            { label: "Total Penugasan", value: m.total, color: "text-foreground" },
                            { label: "Selesai", value: m.completed, color: "text-emerald-600" },
                            { label: "Aktif",   value: m.active,    color: "text-sky-600" },
                            { label: "Batal",   value: m.cancelled, color: "text-red-500" },
                          ].map((k) => (
                            <div key={k.label} className="bg-white px-4 py-3 text-center">
                              <p className="text-[10px] text-muted-foreground">{k.label}</p>
                              <p className={cn("text-[18px] font-extrabold", k.color)}>{k.value}</p>
                            </div>
                          ))}
                        </div>

                        {/* ── Fee breakdown ── */}
                        <div className="px-4 py-3 grid grid-cols-3 gap-3">
                          <div className="rounded-xl bg-purple-50 border border-purple-100 p-3">
                            <p className="text-[10px] text-purple-600 font-semibold uppercase tracking-wide">Total Fee</p>
                            <p className="text-[13px] font-extrabold font-mono text-purple-700 mt-0.5">{fmtIDR(m.totalFee)}</p>
                          </div>
                          <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3">
                            <p className="text-[10px] text-emerald-600 font-semibold uppercase tracking-wide">Sudah Cair</p>
                            <p className="text-[13px] font-extrabold font-mono text-emerald-700 mt-0.5">{fmtIDR(m.feeCredited)}</p>
                          </div>
                          <div className="rounded-xl bg-amber-50 border border-amber-100 p-3">
                            <p className="text-[10px] text-amber-600 font-semibold uppercase tracking-wide">Belum Cair</p>
                            <p className="text-[13px] font-extrabold font-mono text-amber-700 mt-0.5">{fmtIDR(m.feePending)}</p>
                          </div>
                        </div>

                        {/* ── Progress bar & stats ── */}
                        <div className="px-4 py-3 space-y-2">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-semibold text-muted-foreground">Tingkat Penyelesaian</span>
                            <span className="font-bold text-emerald-600">{Math.round(m.completionRate)}%</span>
                          </div>
                          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${m.completionRate}%` }}
                              transition={{ duration: 0.6, ease: "easeOut" }}
                              className={cn(
                                "h-full rounded-full",
                                m.completionRate >= 80 ? "bg-emerald-400"
                                  : m.completionRate >= 50 ? "bg-amber-400"
                                  : "bg-red-400",
                              )}
                            />
                          </div>
                          <div className="flex items-center gap-3 flex-wrap pt-1">
                            <span className="text-[10px] text-muted-foreground">Kontribusi profit: <strong className="text-foreground">{fmtIDR(m.profitContribution)}</strong></span>
                            {Object.entries(m.byType).map(([type, count]) => (
                              <span key={type} className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-semibold">
                                {TYPE_LABEL[type] ?? type}: {count}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* ── Recent orders ── */}
                        {m.recentOrders.length > 0 && (
                          <div className="px-4 py-3">
                            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                              <Clock className="h-3 w-3" /> Riwayat Penugasan Terbaru
                            </p>
                            <div className="space-y-1.5">
                              {m.recentOrders.map((o) => {
                                const client = o.clientId ? clientMap.get(o.clientId) : null;
                                const sc = STATUS_CFG[o.status] ?? { cls: "bg-slate-100 text-slate-500", label: o.status };
                                return (
                                  <div
                                    key={o.id}
                                    className="flex items-center gap-2.5 rounded-xl bg-slate-50 border border-slate-100 px-3 py-2 cursor-pointer hover:bg-sky-50 hover:border-sky-100 transition-colors group"
                                    onClick={() => navigate(`/orders/detail/${o.id}`)}
                                  >
                                    <div className="flex-1 min-w-0">
                                      <p className="text-[12px] font-semibold truncate">
                                        {client?.name ?? o.title ?? `Order #${o.id.slice(0, 8)}`}
                                      </p>
                                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                        <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded font-medium">
                                          {TYPE_LABEL[o.type] ?? o.type}
                                        </span>
                                        <span className={cn("text-[9px] px-1.5 py-0.5 rounded-full font-semibold", sc.cls)}>
                                          {sc.label}
                                        </span>
                                        <span className="text-[10px] text-muted-foreground">{fmtRelative(o.updatedAt)}</span>
                                      </div>
                                    </div>
                                    <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* ── Footer actions ── */}
                        <div className="px-4 py-3 bg-slate-50/60 flex items-center justify-between gap-2 flex-wrap">
                          <p className="text-[10px] text-muted-foreground">
                            Bergabung {fmtDate(m.staff.createdAt)} · {m.total} total penugasan
                          </p>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2.5 text-[11px] border-blue-200 text-blue-700 hover:bg-blue-50"
                            onClick={() => navigate(`/staff/${m.staff.userId}`)}
                          >
                            🪪 Kartu Staff
                          </Button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* ── Leaderboard strip ── */}
      {sorted.length >= 2 && (
        <div className="rounded-2xl border bg-white overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center gap-2">
            <Award className="h-4 w-4 text-amber-500" />
            <p className="text-sm font-semibold">Leaderboard Internal</p>
          </div>
          <div className="divide-y">
            {sorted.slice(0, 5).map((m, i) => (
              <div key={m.staff.userId} className="flex items-center gap-3 px-4 py-2.5">
                <span className={cn(
                  "text-[13px] font-black w-6 shrink-0 text-center",
                  i === 0 ? "text-amber-500" : i === 1 ? "text-slate-400" : i === 2 ? "text-amber-700" : "text-slate-300",
                )}>
                  {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-bold truncate">{m.staff.displayName || m.staff.email}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0 text-right">
                  <div>
                    <p className="text-[10px] text-muted-foreground">Selesai</p>
                    <p className="text-[13px] font-extrabold text-emerald-600">{m.completed}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Rate</p>
                    <p className="text-[13px] font-extrabold">{Math.round(m.completionRate)}%</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Internal badges legend ── */}
      <div className="rounded-2xl border bg-gradient-to-br from-sky-50 to-purple-50 p-4">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5">
          <Star className="h-3.5 w-3.5 text-amber-500" /> Badge Internal Temantiket
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { badge: "⚡ Top Executor",       desc: "≥90% rate & ≥5 selesai" },
            { badge: "🏆 Closing Terbanyak",  desc: "≥10 order selesai" },
            { badge: "🎯 Problem Solver",     desc: "Aktif tanpa order terbengkalai" },
            { badge: "⭐ Andalan",            desc: "≥80% completion rate" },
          ].map((b) => (
            <div key={b.badge} className="rounded-xl bg-white border p-2.5">
              <p className="text-[12px] font-bold">{b.badge}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{b.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
