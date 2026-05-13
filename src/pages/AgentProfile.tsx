import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft, Trophy, Users, ShoppingBag, TrendingUp,
  Wallet, CheckCircle, Clock, UserCircle, ExternalLink,
  Camera, RefreshCw, Loader2, Zap, Star,
  MapPin, Truck, GraduationCap, Activity, Calendar,
  Banknote, ClipboardList, CheckCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/authStore";
import { useOrdersStore } from "@/store/ordersStore";
import { useClientsStore } from "@/store/clientsStore";
import {
  listAgentPointsWithOrders, sumPointsByAgent, type AgentPoint, REASON_LABEL,
} from "@/features/agentPoints/agentPointsRepo";
import { listMySubmissions, sumMissionPointsByAgent } from "@/features/missions/missionsRepo";
import { onMissionsChanged } from "@/lib/supabaseRealtime";
import type { MissionSubmission } from "@/features/missions/types";
import { getTierInfo } from "@/features/agentPoints/agentTiers";
import { ORDER_TYPE_EMOJI, ORDER_TYPE_LABEL, type OrderType } from "@/features/orders/ordersRepo";
import { fmtIDR, agentFeeFromMeta } from "@/lib/profit";
import { computeFeeBreakdown } from "@/lib/agentFeeBreakdown";
import { pullWalletTxs, type WalletTransaction, extractFieldAgents } from "@/lib/agentWallet";
import { uploadAvatar, savePhotoUrl, loadPhotoUrl } from "@/lib/avatarStorage";
import { uploadCardBack, saveCardBackUrl, loadCardBackUrl } from "@/lib/cardBackStorage";
import { supabase } from "@/lib/supabase";
import { AgentCard } from "@/components/AgentCard";
import { cn } from "@/lib/utils";

// ── Field task type config ────────────────────────────────────────────────────
type FieldTaskType = "voa" | "pelaksana" | "kurir" | "fieldAgent" | "operational" | "executor";

interface FieldTask {
  orderId:    string;
  orderTitle: string;
  orderType:  string;
  taskType:   FieldTaskType;
  fee:        number;
  credited:   boolean;
  clientName: string;
  date:       string;
}

const FIELD_CFG: Record<FieldTaskType, {
  emoji: string; label: string; shortLabel: string;
  badgeCls: string; amtCls: string; iconCls: string; bgCls: string;
}> = {
  voa:         { emoji: "🛂", label: "Agent Lapangan VOA",   shortLabel: "VOA",         badgeCls: "bg-indigo-100 text-indigo-700", amtCls: "text-indigo-700", iconCls: "text-indigo-500", bgCls: "bg-indigo-50 border-indigo-100" },
  pelaksana:   { emoji: "🎓", label: "Pelaksana Visa",       shortLabel: "Pelaksana",   badgeCls: "bg-purple-100 text-purple-700", amtCls: "text-purple-700", iconCls: "text-purple-500", bgCls: "bg-purple-50 border-purple-100" },
  kurir:       { emoji: "🚗", label: "Kurir Setoran",        shortLabel: "Kurir",       badgeCls: "bg-amber-100 text-amber-700",   amtCls: "text-amber-700",  iconCls: "text-amber-500",  bgCls: "bg-amber-50 border-amber-100"   },
  fieldAgent:  { emoji: "📋", label: "Agent Lapangan",       shortLabel: "Lapangan",    badgeCls: "bg-sky-100 text-sky-700",       amtCls: "text-sky-700",    iconCls: "text-sky-500",    bgCls: "bg-sky-50 border-sky-100"       },
  operational: { emoji: "⚙️", label: "Agent Operasional",    shortLabel: "Operasional", badgeCls: "bg-teal-100 text-teal-700",     amtCls: "text-teal-700",   iconCls: "text-teal-500",   bgCls: "bg-teal-50 border-teal-100"     },
  executor:    { emoji: "📑", label: "Pelaksana Visa (Exec)", shortLabel: "Executor",   badgeCls: "bg-violet-100 text-violet-700", amtCls: "text-violet-700", iconCls: "text-violet-500", bgCls: "bg-violet-50 border-violet-100" },
};

export default function AgentProfile() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { orders, fetchOrders, loaded: ordersLoaded } = useOrdersStore();
  const { clients, fetchClients, loaded: clientsLoaded } = useClientsStore();
  const photoInputRef    = useRef<HTMLInputElement>(null);
  const cardBackInputRef = useRef<HTMLInputElement>(null);
  const [photoUrl,          setPhotoUrl]          = useState<string | null>(null);
  const [photoUploading,    setPhotoUploading]    = useState(false);
  const [cardBackUrl,       setCardBackUrl]       = useState<string | null>(null);
  const [cardBackUploading, setCardBackUploading] = useState(false);
  const [joinedAt,          setJoinedAt]          = useState<string | null>(null);

  const [points,      setPoints]      = useState<AgentPoint[]>([]);
  const [missionSubs, setMissionSubs] = useState<MissionSubmission[]>([]);
  const [walletTxs,   setWalletTxs]   = useState<WalletTransaction[]>([]);
  const [loading,     setLoading]     = useState(true);

  const refreshMissions = useCallback(async () => {
    if (!user?.agencyId || !user?.id) return;
    const ms = await listMySubmissions(user.agencyId, user.id);
    setMissionSubs(ms);
  }, [user?.agencyId, user?.id]);

  useEffect(() => {
    if (!ordersLoaded) void fetchOrders();
    if (!clientsLoaded) void fetchClients();
    void (async () => {
      setLoading(true);
      const [p, txs] = await Promise.all([
        listAgentPointsWithOrders(),
        user?.id ? pullWalletTxs(user.id) : Promise.resolve([]),
      ]);
      setPoints(p);
      setWalletTxs(txs);
      await refreshMissions();
      setLoading(false);
    })();
    if (user?.id && user?.agencyId && supabase) {
      void supabase
        .from("agency_members")
        .select("created_at")
        .eq("user_id", user.id)
        .eq("agency_id", user.agencyId)
        .maybeSingle()
        .then(({ data }) => {
          if (data?.created_at) setJoinedAt(data.created_at as string);
        });
    }
  }, [ordersLoaded, clientsLoaded, fetchOrders, fetchClients, user?.agencyId, user?.id, refreshMissions]);

  useEffect(() => {
    const unsub = onMissionsChanged(() => { void refreshMissions(); });
    return unsub;
  }, [refreshMissions]);

  useEffect(() => {
    if (!user?.id) return;
    const localKey = `igh.profile.photo.${user.id}`;
    try {
      const local = localStorage.getItem(localKey);
      if (local) setPhotoUrl(local);
    } catch { /* ignore */ }
    void loadPhotoUrl(user.id).then((url) => { if (url) setPhotoUrl(url); });
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || !user?.agencyId) return;
    void loadCardBackUrl(user.id, user.agencyId, "agent").then((url) => { if (url) setCardBackUrl(url); });
  }, [user?.id, user?.agencyId]);

  const handleCardBackFile = async (file: File) => {
    if (!user?.id || !user?.agencyId || !file.type.startsWith("image/")) return;
    setCardBackUploading(true);
    try {
      const url = await uploadCardBack(user.id, file, user.agencyId, "agent");
      await saveCardBackUrl(user.id, user.agencyId, url);
      setCardBackUrl(url);
      const { toast } = await import("sonner");
      toast.success("Gambar belakang kartu diperbarui!");
    } catch (e: unknown) {
      const { toast } = await import("sonner");
      toast.error(`Gagal upload: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setCardBackUploading(false);
    }
  };

  const handlePhotoFile = async (file: File) => {
    if (!user?.id || !file.type.startsWith("image/")) return;
    setPhotoUploading(true);
    try {
      const url = await uploadAvatar(user.id, file);
      await savePhotoUrl(user.id, url);
      setPhotoUrl(url);
      try { localStorage.setItem(`igh.profile.photo.${user.id}`, url); } catch { /* ignore */ }
      const { toast } = await import("sonner");
      toast.success("Foto profil diperbarui!");
    } catch (e: unknown) {
      const { toast } = await import("sonner");
      toast.error(`Gagal upload foto: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setPhotoUploading(false);
    }
  };

  // ── Sales orders (created by this agent) ─────────────────────────────────
  const myOrders = useMemo(
    () => orders.filter((o) => o.createdByAgent === user?.id),
    [orders, user?.id],
  );
  const myClients = useMemo(
    () => clients.filter((c) => c.createdByAgent === user?.id),
    [clients, user?.id],
  );
  const clientMap = useMemo(
    () => new Map(clients.map((c) => [c.id, c])),
    [clients],
  );

  // ── Field task orders: orders where agent is assigned as field worker ────
  // Uses extractFieldAgents() as canonical resolver — covers ALL metadata key
  // naming conventions (voaFieldAgentId, fieldAgentId, pelaksanaId,
  // kurirAgentId, assignedOperationalAgentId, visaExecutorId).
  // Each role is a SEPARATE entry (no else-if exclusions): if agent fills
  // two roles on the same order, both appear independently.
  const fieldTaskOrders = useMemo((): FieldTask[] => {
    if (!user?.id) return [];
    const uid = user.id;
    const result: FieldTask[] = [];

    // Map from extractFieldAgents fieldKey → FieldTaskType display config
    const ROLE_TO_TASK_TYPE: Record<string, FieldTaskType> = {
      voaFieldAgentId:            "voa",
      fieldAgentId:               "fieldAgent",
      pelaksanaId:                "pelaksana",
      kurirAgentId:               "kurir",
      assignedOperationalAgentId: "operational",
      visaExecutorId:             "executor",
    };
    const ROLE_TO_TITLE: Record<string, string> = {
      voaFieldAgentId:            "Order VOA",
      fieldAgentId:               "Tugas Lapangan",
      pelaksanaId:                "Visa Pelajar",
      kurirAgentId:               "Kurir Setoran",
      assignedOperationalAgentId: "Tugas Operasional",
      visaExecutorId:             "Visa (Executor)",
    };

    for (const o of orders) {
      const meta = (o.metadata ?? {}) as Record<string, unknown>;
      const clientName =
        clientMap.get((o as Record<string, unknown>).clientId as string ?? "")?.name
        ?? (meta.clientName as string | undefined)
        ?? "—";

      // extractFieldAgents returns all roles for this agent in this order
      const roles = extractFieldAgents(o.id, meta, uid);
      for (const role of roles) {
        const taskType = ROLE_TO_TASK_TYPE[role.fieldKey] ?? "voa";
        result.push({
          orderId:    o.id,
          orderTitle: o.title ?? ROLE_TO_TITLE[role.fieldKey] ?? "Penugasan Lapangan",
          orderType:  o.type,
          taskType,
          fee:        role.feeAmount,
          credited:   role.creditedFlag,
          clientName,
          date:       String(o.createdAt ?? ""),
        });
      }
    }

    return result.sort((a, b) => b.date.localeCompare(a.date));
  }, [orders, user?.id, clientMap]);

  // ── Field stats: aggregated breakdown of field task earnings ──────────────
  const fieldStats = useMemo(() => {
    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear  = now.getFullYear();

    let totalFee     = 0;
    let pendingFee   = 0;
    let monthlyFee   = 0;
    let voaCount     = 0;
    let pelaksanaCount = 0;
    let kurirCount   = 0;
    let otherCount   = 0;
    let lastTaskDate: string | null = null;

    for (const t of fieldTaskOrders) {
      totalFee += t.fee;
      if (!t.credited) pendingFee += t.fee;

      const d = new Date(t.date);
      if (!isNaN(d.getTime()) && d.getFullYear() === thisYear && d.getMonth() === thisMonth) {
        monthlyFee += t.fee;
      }

      if (!lastTaskDate || t.date > lastTaskDate) lastTaskDate = t.date;
      if (t.taskType === "voa")            voaCount++;
      else if (t.taskType === "pelaksana") pelaksanaCount++;
      else if (t.taskType === "kurir")     kurirCount++;
      else                                 otherCount++;
    }

    return {
      totalFee, pendingFee, monthlyFee,
      paidFee: totalFee - pendingFee,
      totalTasks: fieldTaskOrders.length,
      voaCount, pelaksanaCount, kurirCount, otherCount,
      lastTaskDate,
    };
  }, [fieldTaskOrders]);

  const myPoints = useMemo(() => {
    const orderPts   = user?.id ? (sumPointsByAgent(points).get(user.id)          ?? 0) : 0;
    const missionPts = user?.id ? (sumMissionPointsByAgent(missionSubs).get(user.id) ?? 0) : 0;
    return orderPts + missionPts;
  }, [points, missionSubs, user?.id]);

  const { current: tier, next, pointsToNext, progress } = useMemo(
    () => getTierInfo(myPoints),
    [myPoints],
  );

  const completedOrders = useMemo(
    () => myOrders.filter((o) => o.status === "Completed"),
    [myOrders],
  );

  // ── Fee breakdown: wallet-based (what has actually been credited) ──────────
  const bd = useMemo(() => computeFeeBreakdown(walletTxs), [walletTxs]);


  const payoutTxs = useMemo(
    () => walletTxs.filter((t) => t.type === "payout"),
    [walletTxs],
  );

  // fieldCommTxs: wallet-based history (for payout correlation)
  // Covers all field fee types: voa_agent_fee, field_agent_fee, pelaksana_fee,
  // kurir_fee, operational_fee — matches all types written by backfill + OrderDetail
  const fieldCommTxs = useMemo(
    () => [...walletTxs]
      .filter((t) =>
        t.type === "voa_agent_fee"  ||
        t.type === "field_agent_fee" ||
        t.type === "pelaksana_fee"  ||
        t.type === "kurir_fee"      ||
        t.type === "operational_fee"
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [walletTxs],
  );

  // ── Debug panel: ID diagnosis for field-agent fee mismatch debugging ────────
  // Only renders in development builds (import.meta.env.DEV).
  // Shows userId, agency, total field assignments found, wallet tx count.
  const debugInfo = useMemo(() => {
    if (!user?.id) return null;
    const uid = user.id;
    const allAssignedOrders = orders.filter((o) => {
      const meta = (o.metadata ?? {}) as Record<string, unknown>;
      return extractFieldAgents(o.id, meta, uid).length > 0;
    });
    const walletFieldTxs = walletTxs.filter((t) =>
      t.type === "voa_agent_fee"  ||
      t.type === "field_agent_fee" ||
      t.type === "pelaksana_fee"  ||
      t.type === "kurir_fee"      ||
      t.type === "operational_fee"
    );
    const unmatchedAssignments = allAssignedOrders.filter((o) => {
      const meta = (o.metadata ?? {}) as Record<string, unknown>;
      const roles = extractFieldAgents(o.id, meta, uid);
      return roles.some((r) => r.feeAmount > 0 && !r.creditedFlag);
    });
    return {
      userId:             uid,
      agencyId:           user.agencyId ?? "—",
      assignedOrderCount: allAssignedOrders.length,
      walletTxCount:      walletFieldTxs.length,
      walletTxTotal:      walletFieldTxs.reduce((s, t) => s + t.amountIDR, 0),
      unmatchedCount:     unmatchedAssignments.length,
      unmatchedOrderIds:  unmatchedAssignments.map((o) => o.id.slice(0, 8)),
    };
  }, [user?.id, user?.agencyId, orders, walletTxs]);

  const portfolio = useMemo(() => {
    const types: OrderType[] = ["umrah", "flight", "visa_voa", "visa_student"];
    const counts: Record<string, number> = Object.fromEntries(types.map((t) => [t, 0]));
    for (const o of myOrders) if (counts[o.type] !== undefined) counts[o.type]++;
    const max = Math.max(1, ...Object.values(counts));
    return types.map((t) => ({ type: t, count: counts[t], pct: counts[t] / max }));
  }, [myOrders]);

  const monthly = useMemo(() => {
    const now = new Date();
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      return { label: d.toLocaleDateString("id-ID", { month: "short" }), year: d.getFullYear(), month: d.getMonth(), count: 0 };
    });
    for (const o of myOrders) {
      const d = new Date(o.createdAt);
      const m = months.find((x) => x.year === d.getFullYear() && x.month === d.getMonth());
      if (m) m.count++;
    }
    const max = Math.max(1, ...months.map((m) => m.count));
    return months.map((m) => ({ ...m, pct: m.count / max }));
  }, [myOrders]);

  // Helpers
  const fmtDate = (iso: string) => {
    try {
      return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(iso));
    } catch { return iso.slice(0, 10); }
  };
  const fmtMonthYear = (iso: string) => {
    try {
      return new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(new Date(iso));
    } catch { return iso.slice(0, 7); }
  };

  const hasAnyActivity = myOrders.length > 0 || fieldTaskOrders.length > 0 || fieldCommTxs.length > 0;
  const hasFieldActivity = fieldTaskOrders.length > 0 || fieldCommTxs.length > 0;

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-5">
      <button
        onClick={() => navigate("/agent")}
        className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Kembali ke Dashboard
      </button>

      {/* ── Profile Header ── */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className={`rounded-3xl bg-gradient-to-br ${tier.gradient} p-5 md:p-6 text-white shadow-lg`}
      >
        <div className="flex items-start gap-4">
          <button
            type="button"
            onClick={() => photoInputRef.current?.click()}
            disabled={photoUploading}
            className="relative group shrink-0 cursor-pointer disabled:cursor-default"
            title="Klik untuk ganti foto"
          >
            <div className="h-16 w-16 rounded-2xl bg-white/20 border-2 border-white/40 overflow-hidden flex items-center justify-center backdrop-blur">
              {photoUrl ? (
                <img src={photoUrl} alt="foto" className="h-full w-full object-cover" />
              ) : (
                <span className="text-lg font-extrabold">
                  {(user?.displayName ?? "?").charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            {photoUploading ? (
              <div className="absolute inset-0 rounded-2xl bg-black/50 flex items-center justify-center">
                <RefreshCw className="h-5 w-5 text-white animate-spin" />
              </div>
            ) : (
              <div className="absolute inset-0 rounded-2xl bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Camera className="h-5 w-5 text-white" />
              </div>
            )}
          </button>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handlePhotoFile(f);
              e.target.value = "";
            }}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-white/20 backdrop-blur">
                {tier.emoji} {tier.label}
              </span>
              <span className="text-[11px] opacity-80">
                {loading ? "…" : myPoints.toLocaleString("id-ID")} poin
              </span>
              {hasFieldActivity && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-white/15 backdrop-blur flex items-center gap-1">
                  <MapPin className="h-2.5 w-2.5" /> Agent Lapangan
                </span>
              )}
            </div>
            <h1 className="text-xl font-extrabold mt-1 leading-tight">{user?.displayName ?? "Mitra"}</h1>
            <p className="text-[12px] opacity-90 truncate">{user?.email}</p>
            {user?.agencyName && (
              <p className="text-[11px] opacity-75 mt-0.5">{user.agencyName}</p>
            )}
          </div>
        </div>

        {next && (
          <div className="mt-4">
            <div className="flex justify-between text-[10px] opacity-80 mb-1">
              <span>{tier.label}</span>
              <span>{pointsToNext} poin lagi → {next.emoji} {next.label}</span>
            </div>
            <div className="h-2 rounded-full bg-white/20 overflow-hidden">
              <div
                className="h-full rounded-full bg-white transition-all duration-700"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-1.5">
          {tier.perks.map((p) => (
            <span key={p} className="text-[10px] px-2 py-0.5 rounded-full bg-white/15 backdrop-blur">
              ✓ {p}
            </span>
          ))}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            onClick={() => navigate("/settings")}
            className="flex items-center justify-center gap-2 h-10 rounded-xl bg-white/15 hover:bg-white/25 border border-white/20 text-white text-[12px] font-semibold transition-all active:scale-[0.97]"
          >
            <UserCircle className="h-4 w-4 shrink-0" />
            Edit Profil
          </button>
          <button
            onClick={() => navigate("/agent/leaderboard")}
            className="flex items-center justify-center gap-2 h-10 rounded-xl bg-white/15 hover:bg-white/25 border border-white/20 text-white text-[12px] font-semibold transition-all active:scale-[0.97]"
          >
            <Trophy className="h-4 w-4 shrink-0" />
            Leaderboard
          </button>
        </div>
      </motion.div>

      {/* ── Stats Grid (4 cards) ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          {
            icon: ShoppingBag, label: "Total Order",
            value: String(myOrders.length),
            sub: `${completedOrders.length} selesai`,
            color: "text-violet-600", bg: "bg-violet-50 border-violet-100",
          },
          {
            icon: Users, label: "Total Klien",
            value: String(myClients.length),
            sub: "klien aktif",
            color: "text-sky-600", bg: "bg-sky-50 border-sky-100",
          },
          {
            icon: TrendingUp, label: "Total Komisi",
            value: fmtIDR(bd.totalCredit),
            sub: "sales + lapangan",
            color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-100",
          },
          {
            icon: Trophy, label: "Total Poin",
            value: loading ? "…" : String(myPoints),
            sub: `Tier ${tier.label}`,
            color: "text-amber-600", bg: "bg-amber-50 border-amber-100",
          },
        ].map((s) => (
          <div key={s.label} className={`rounded-2xl border p-3 ${s.bg}`}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{s.label}</span>
              <s.icon className={`h-3.5 w-3.5 ${s.color}`} />
            </div>
            <div className={`text-base font-extrabold font-mono ${s.color}`}>{s.value}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Pendapatan Lapangan — summary cards (shown when agent has field activity) ── */}
      {hasFieldActivity && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
          className="rounded-2xl border border-indigo-100 bg-white overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-indigo-100 bg-indigo-50 flex items-center gap-2">
            <MapPin className="h-4 w-4 text-indigo-500 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-indigo-900">Pendapatan Lapangan</p>
              <p className="text-[11px] text-indigo-600/70">Fee dari tugas VOA · Pelaksana Visa · Kurir Setoran</p>
            </div>
          </div>

          {/* 2×2 summary card grid */}
          <div className="grid grid-cols-2 gap-px bg-slate-100">
            {[
              {
                icon: Banknote,
                label: "Total Fee Lapangan",
                value: fmtIDR(fieldStats.totalFee),
                sub: `${fieldStats.totalTasks} penugasan`,
                cls: "text-indigo-700",
              },
              {
                icon: ClipboardList,
                label: "Tugas Selesai",
                value: String(fieldTaskOrders.filter((t) => t.credited).length),
                sub: `dari ${fieldStats.totalTasks} total`,
                cls: "text-emerald-600",
              },
              {
                icon: Calendar,
                label: "Penghasilan Bulan Ini",
                value: fmtIDR(fieldStats.monthlyFee),
                sub: fieldStats.lastTaskDate ? fmtMonthYear(new Date().toISOString()) : "—",
                cls: "text-sky-700",
              },
              {
                icon: Activity,
                label: "Terakhir Bertugas",
                value: fieldStats.lastTaskDate ? fmtDate(fieldStats.lastTaskDate) : "—",
                sub: fieldStats.lastTaskDate ? "tugas terbaru" : "belum ada",
                cls: "text-slate-700",
              },
            ].map((card) => (
              <div key={card.label} className="bg-white p-3 flex items-start gap-2">
                <card.icon className={cn("h-4 w-4 shrink-0 mt-0.5", card.cls)} />
                <div className="min-w-0">
                  <div className="text-[10px] text-muted-foreground font-medium leading-tight">{card.label}</div>
                  <div className={cn("text-sm font-extrabold font-mono mt-0.5", card.cls)}>{card.value}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{card.sub}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Breakdown by type */}
          <div className="px-4 py-3 border-t border-indigo-100 grid grid-cols-3 gap-2">
            {([
              { key: "voa",       count: fieldStats.voaCount,       Icon: MapPin,       label: "VOA",       cls: "text-indigo-600 bg-indigo-50" },
              { key: "pelaksana", count: fieldStats.pelaksanaCount, Icon: GraduationCap, label: "Pelaksana", cls: "text-purple-600 bg-purple-50" },
              { key: "kurir",     count: fieldStats.kurirCount,     Icon: Truck,         label: "Kurir",     cls: "text-amber-600 bg-amber-50"   },
            ] as const).map(({ key, count, Icon, label, cls }) => (
              <div key={key} className={cn("rounded-xl p-2.5 flex items-center gap-2 border", cls, "border-transparent")}>
                <Icon className={cn("h-3.5 w-3.5 shrink-0", cls.split(" ")[0])} />
                <div>
                  <div className="text-[11px] font-extrabold font-mono">{count}</div>
                  <div className="text-[9px] text-muted-foreground">{label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Pending fee alert */}
          {fieldStats.pendingFee > 0 && (
            <div className="px-4 py-2.5 border-t border-amber-100 bg-amber-50 flex items-center gap-2">
              <Clock className="h-3.5 w-3.5 text-amber-600 shrink-0" />
              <p className="text-[11px] text-amber-700">
                <span className="font-semibold">{fmtIDR(fieldStats.pendingFee)}</span> fee lapangan belum dikreditkan ke wallet — akan cair saat admin selesaikan order.
              </p>
            </div>
          )}
        </motion.div>
      )}

      {/* ── Agent Card ── */}
      {user?.id && (
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.08 }}
          className="rounded-2xl border border-slate-100 bg-white overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-sm font-semibold text-slate-800">Kartu Agen Digital</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">ID card resmi lo sebagai Mitra Temantiket</p>
          </div>
          <div className="p-5 flex flex-col items-center gap-4">
            <AgentCard
              displayName={user.displayName}
              agentId={user.id}
              since={joinedAt}
              agencyName={user.agencyName}
              backImageUrl={cardBackUrl}
            />
            <div className="w-full max-w-[320px]">
              <input
                ref={cardBackInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleCardBackFile(f);
                  e.target.value = "";
                }}
              />
              <button
                onClick={() => cardBackInputRef.current?.click()}
                disabled={cardBackUploading}
                className="w-full flex items-center justify-center gap-2 h-9 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-500 text-[12px] font-semibold transition-all disabled:opacity-60 active:scale-[0.98]"
              >
                {cardBackUploading ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" />Mengupload…</>
                ) : (
                  <><Camera className="h-3.5 w-3.5" />{cardBackUrl ? "Ganti Gambar Belakang Kartu" : "Upload Gambar Belakang Kartu"}</>
                )}
              </button>
              {cardBackUrl && (
                <p className="text-center text-[10px] text-slate-400 mt-1.5">
                  Klik kartu → "Lihat Belakang" untuk pratinjau
                </p>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {/* ── Ringkasan Komisi — 5-kategori breakdown dari wallet ── */}
      <div className="rounded-2xl border border-blue-100 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-blue-100 bg-blue-50 flex items-center gap-2">
          <Wallet className="h-4 w-4 text-blue-500" />
          <div>
            <p className="text-sm font-semibold">Ringkasan Komisi</p>
            <p className="text-[11px] text-muted-foreground">Breakdown lengkap semua pendapatan yang sudah dikreditkan</p>
          </div>
        </div>
        <div className="p-4 space-y-2">
          {/* 5-row breakdown */}
          {[
            { label: "Komisi Sales",       value: bd.salesCommission, color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-100", sub: "dari order yang dibuat" },
            { label: "Fee Agent Lapangan", value: bd.fieldAgentFee,   color: "text-indigo-700",  bg: "bg-indigo-50 border-indigo-100",   sub: "penugasan VOA / bandara" },
            { label: "Fee Kurir",          value: bd.kurirFee,        color: "text-amber-700",   bg: "bg-amber-50 border-amber-100",     sub: "kurir setoran uang" },
            { label: "Fee Pelaksana",      value: bd.pelaksanaFee,    color: "text-purple-700",  bg: "bg-purple-50 border-purple-100",   sub: "pelaksana visa pelajar" },
            { label: "Bonus / Manual",     value: bd.bonusManual,     color: "text-violet-700",  bg: "bg-violet-50 border-violet-100",   sub: "konversi poin · koreksi" },
          ].map((row) => (
            <div key={row.label} className={`flex items-center justify-between rounded-xl border px-3 py-2.5 ${row.bg}`}>
              <span className={`text-[12px] font-semibold ${row.color}`}>{row.label}</span>
              <div className="text-right">
                <div className={`text-sm font-extrabold font-mono ${row.color}`}>{fmtIDR(row.value)}</div>
                <div className="text-[10px] text-muted-foreground">{row.sub}</div>
              </div>
            </div>
          ))}

          {/* Total separator */}
          <div className="border-t pt-2.5 flex items-center justify-between">
            <span className="text-sm font-bold text-foreground">Total Komisi</span>
            <span className="text-lg font-extrabold font-mono text-emerald-700">{fmtIDR(bd.totalCredit)}</span>
          </div>
          {bd.totalPaidOut > 0 && (
            <>
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-muted-foreground">Sudah Dicairkan</span>
                <span className="font-mono text-orange-600">−{fmtIDR(bd.totalPaidOut)}</span>
              </div>
              <div className="flex items-center justify-between text-sm font-bold border-t pt-2">
                <span>Saldo Wallet</span>
                <span className={`font-mono ${bd.netBalance >= 0 ? "text-sky-700" : "text-red-600"}`}>{fmtIDR(bd.netBalance)}</span>
              </div>
            </>
          )}

          {bd.totalCredit === 0 && (
            <div className="flex items-start gap-2 rounded-xl bg-muted/30 p-3 mt-1">
              <Zap className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Belum ada fee dikreditkan. Komisi otomatis masuk saat order selesai atau saat admin menugaskan sebagai agent lapangan.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Aktivitas Lapangan — order-based field task history ─────────────── */}
      {fieldTaskOrders.length > 0 && (
        <div className="rounded-2xl border bg-white overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-indigo-500" />
              <div>
                <p className="text-sm font-semibold">Aktivitas Lapangan</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Riwayat penugasan lapangan — VOA · Pelaksana Visa · Kurir
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-indigo-100 text-indigo-700">
                {fieldTaskOrders.length} tugas
              </span>
              {fieldStats.pendingFee > 0 && (
                <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-amber-100 text-amber-700">
                  {fieldTaskOrders.filter((t) => !t.credited).length} pending
                </span>
              )}
            </div>
          </div>
          <div className="divide-y">
            {fieldTaskOrders.map((task) => {
              const cfg = FIELD_CFG[task.taskType];
              const isPaidOut = payoutTxs.some((pt) => pt.createdAt > task.date);
              return (
                <div key={`${task.orderId}-${task.taskType}`} className="flex items-start gap-3 px-4 py-3">
                  <div className={cn(
                    "h-10 w-10 rounded-xl border flex items-center justify-center text-base shrink-0 mt-0.5",
                    cfg.bgCls,
                  )}>
                    {cfg.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold truncate text-foreground">
                      {task.clientName !== "—" ? task.clientName : task.orderTitle}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded-full", cfg.badgeCls)}>
                        {cfg.label}
                      </span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">
                        {ORDER_TYPE_EMOJI[task.orderType as OrderType] ?? "📦"} {ORDER_TYPE_LABEL[task.orderType as OrderType] ?? task.orderType}
                      </span>
                      <span className={cn(
                        "text-[9px] font-semibold px-1.5 py-0.5 rounded-full",
                        task.credited
                          ? (isPaidOut ? "bg-orange-100 text-orange-700" : "bg-emerald-100 text-emerald-700")
                          : "bg-slate-100 text-slate-500",
                      )}>
                        {task.credited ? (isPaidOut ? "Sudah Dicairkan" : "✓ Dikreditkan") : "Belum Dikreditkan"}
                      </span>
                      <span className="text-[10px] text-muted-foreground">{fmtDate(task.date)}</span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={cn("text-[13px] font-extrabold font-mono", cfg.amtCls)}>
                      +{fmtIDR(task.fee)}
                    </p>
                    {!task.credited && (
                      <p className="text-[9px] text-muted-foreground mt-0.5">pending</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Komisi Lapangan (wallet-based) — hanya tampil jika ada wallet tx ── */}
      {fieldCommTxs.length > 0 && fieldTaskOrders.length === 0 && (
        <div className="rounded-2xl border bg-white overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-base">🗂️</span>
              <div>
                <p className="text-sm font-semibold">Komisi Lapangan (Wallet)</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Riwayat kredit wallet dari penugasan lapangan
                </p>
              </div>
            </div>
            <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-purple-100 text-purple-700">
              {fieldCommTxs.length} kredit
            </span>
          </div>
          <div className="divide-y">
            {fieldCommTxs.map((tx) => {
              const typeMap: Record<string, FieldTaskType> = {
                voa_agent_fee:  "voa",
                pelaksana_fee:  "pelaksana",
                kurir_fee:      "kurir",
              };
              const taskType = typeMap[tx.type] ?? "voa";
              const cfg = FIELD_CFG[taskType];
              const isPaidOut = payoutTxs.some((pt) => pt.createdAt > tx.createdAt);
              return (
                <div key={tx.id} className="flex items-center gap-3 px-4 py-3">
                  <div className={cn("h-9 w-9 rounded-xl border flex items-center justify-center text-base shrink-0", cfg.bgCls)}>
                    {cfg.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold truncate text-foreground">{tx.description}</p>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded-full", cfg.badgeCls)}>
                        {cfg.label}
                      </span>
                      <span className={cn("text-[9px] font-semibold px-1.5 py-0.5 rounded-full", isPaidOut ? "bg-orange-100 text-orange-700" : "bg-emerald-100 text-emerald-700")}>
                        {isPaidOut ? "Sudah Dicairkan" : "✓ Dikreditkan"}
                      </span>
                      <span className="text-[10px] text-muted-foreground">{fmtDate(tx.createdAt)}</span>
                    </div>
                  </div>
                  <p className={cn("text-[13px] font-extrabold font-mono shrink-0", cfg.amtCls)}>
                    +{fmtIDR(tx.amountIDR)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Portofolio Produk ── */}
      {myOrders.length > 0 && (
        <div className="rounded-2xl border bg-white overflow-hidden">
          <div className="px-4 py-3 border-b">
            <p className="text-sm font-semibold">Portofolio Produk</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Distribusi order lo berdasarkan tipe produk</p>
          </div>
          <div className="p-4 space-y-3">
            {portfolio.map(({ type, count, pct }) => (
              <div key={type}>
                <div className="flex items-center justify-between text-[12px] mb-1">
                  <span className="font-medium">{ORDER_TYPE_EMOJI[type]} {ORDER_TYPE_LABEL[type]}</span>
                  <span className="font-mono font-semibold text-muted-foreground">{count} order</span>
                </div>
                <div className="h-2 rounded-full bg-muted/40 overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-blue-400 to-blue-600"
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.round(pct * 100)}%` }}
                    transition={{ duration: 0.7, ease: "easeOut" }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Performa 6 Bulan ── */}
      {myOrders.length > 0 && (
        <div className="rounded-2xl border bg-white overflow-hidden">
          <div className="px-4 py-3 border-b">
            <p className="text-sm font-semibold">Performa 6 Bulan Terakhir</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Jumlah order yang dibuat per bulan</p>
          </div>
          <div className="p-4">
            <div className="flex items-end gap-2" style={{ height: "96px" }}>
              {monthly.map((m) => (
                <div key={`${m.year}-${m.month}`} className="flex-1 flex flex-col items-center gap-1 h-full">
                  <div className="flex-1 w-full flex items-end">
                    <motion.div
                      className="w-full rounded-t-md bg-gradient-to-t from-blue-600 to-blue-400"
                      initial={{ height: 0 }}
                      animate={{ height: `${Math.max(4, Math.round(m.pct * 100))}%` }}
                      transition={{ duration: 0.6, ease: "easeOut", delay: 0.05 }}
                      title={`${m.count} order`}
                    />
                  </div>
                  {m.count > 0 && (
                    <span className="text-[9px] font-mono font-bold text-blue-600">{m.count}</span>
                  )}
                  <span className="text-[10px] text-muted-foreground leading-none">{m.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Riwayat Poin ── */}
      {(() => {
        const myPointHistory = points
          .filter((p) => p.agentId === user?.id)
          .slice(0, 20);
        return (
          <div className="rounded-2xl border bg-white overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Star className="h-4 w-4 text-amber-500" />
                <div>
                  <p className="text-sm font-semibold">Riwayat Poin</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Poin diperoleh dari order &amp; misi yang selesai
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-100 rounded-full px-3 py-1">
                <Star className="h-3 w-3 text-amber-400" />
                <span className="text-[12px] font-extrabold text-amber-700 font-mono">
                  {loading ? "…" : myPoints}
                </span>
                <span className="text-[10px] text-amber-500">poin total</span>
              </div>
            </div>

            {myPointHistory.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 px-4 text-center">
                <Star className="h-8 w-8 text-muted-foreground/20 stroke-[1.25]" />
                <p className="text-[11px] text-muted-foreground italic">
                  Belum ada poin tercatat. Buat order dan tunggu owner selesaikan, atau selesaikan misi — otomatis dapat poin!
                </p>
              </div>
            ) : (
              <div className="divide-y">
                {myPointHistory.map((pt) => {
                  const typeEmoji = pt.orderType
                    ? ({ umrah: "🕌", flight: "✈️", visa_voa: "🛂", visa_student: "🎓" }[pt.orderType] ?? "📦")
                    : "⭐";
                  const reasonText = REASON_LABEL[pt.reason] ?? pt.reason;
                  const dateStr = (() => {
                    try {
                      return new Intl.DateTimeFormat("id-ID", {
                        day: "numeric", month: "short", year: "numeric",
                      }).format(new Date(pt.awardedAt));
                    } catch { return pt.awardedAt.slice(0, 10); }
                  })();
                  return (
                    <div key={pt.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="h-9 w-9 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-base shrink-0">
                        {typeEmoji}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] font-semibold truncate">
                          {pt.orderTitle ?? reasonText}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {reasonText} · {dateStr}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <span className="inline-flex items-center gap-0.5 bg-amber-50 border border-amber-200 text-amber-700 rounded-full px-2 py-0.5 text-[11px] font-extrabold font-mono">
                          +{pt.points}
                        </span>
                      </div>
                    </div>
                  );
                })}
                {points.filter((p) => p.agentId === user?.id).length > 20 && (
                  <div className="px-4 py-2 text-center text-[10px] text-muted-foreground italic">
                    Menampilkan 20 riwayat terbaru
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Klien Terbaru ── */}
      {myClients.length > 0 && (
        <div className="rounded-2xl border bg-white overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <p className="text-sm font-semibold">Klien Terbaru</p>
            <button
              onClick={() => navigate("/clients")}
              className="flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
            >
              Lihat semua <ExternalLink className="h-3 w-3" />
            </button>
          </div>
          <div className="divide-y">
            {[...myClients]
              .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
              .slice(0, 5)
              .map((c) => (
                <button
                  key={c.id}
                  onClick={() => navigate(`/clients/${c.id}`)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 text-left transition-colors"
                >
                  <div className="h-7 w-7 rounded-full bg-sky-100 flex items-center justify-center text-sky-700 text-[11px] font-bold shrink-0">
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-medium truncate">{c.name}</p>
                    <p className="text-[10px] text-muted-foreground">{c.phone ?? "—"}</p>
                  </div>
                </button>
              ))}
          </div>
        </div>
      )}

      {/* ── Field-only agent: no sales but has field activity ── */}
      {!hasAnyActivity && !loading && (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
          <CheckCheck className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-[13px] font-semibold text-slate-600">Profil aktif & siap bertugas</p>
          <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
            Belum ada aktivitas tercatat. Fee akan muncul saat admin assign lo ke penugasan lapangan atau saat order penjualan selesai.
          </p>
        </div>
      )}

      {/* ── Debug Panel — dev only ── */}
      {import.meta.env.DEV && debugInfo && (
        <details className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 overflow-hidden">
          <summary className="px-4 py-2 cursor-pointer text-[11px] font-semibold text-slate-500 select-none">
            🔧 Debug: Field-Agent Fee Diagnosis
          </summary>
          <div className="px-4 pb-4 pt-2 space-y-1 font-mono text-[10px] text-slate-600">
            <p><span className="font-semibold">User ID:</span> {debugInfo.userId}</p>
            <p><span className="font-semibold">Agency ID:</span> {debugInfo.agencyId}</p>
            <p><span className="font-semibold">Penugasan lapangan ditemukan:</span> {debugInfo.assignedOrderCount} order</p>
            <p><span className="font-semibold">Wallet tx lapangan:</span> {debugInfo.walletTxCount} transaksi ({fmtIDR(debugInfo.walletTxTotal)})</p>
            <p className={debugInfo.unmatchedCount > 0 ? "text-red-600 font-semibold" : "text-emerald-600 font-semibold"}>
              Penugasan belum dikreditkan: {debugInfo.unmatchedCount}
              {debugInfo.unmatchedCount > 0 && ` — order IDs: ${debugInfo.unmatchedOrderIds.join(", ")}`}
            </p>
            <p className="text-[9px] text-slate-400 mt-1">
              Panel ini hanya muncul di mode development. Untuk perbaiki fee yang belum dikreditkan, minta owner buka profil kamu dan klik "Sinkronisasi Fee Lapangan".
            </p>
          </div>
        </details>
      )}

      {/* ── Quick Actions ── */}
      <div className="grid grid-cols-2 gap-3 pb-4">
        <Button variant="outline" onClick={() => navigate("/settings")} className="h-10">
          Edit Profil
        </Button>
        <Button
          onClick={() => navigate("/agent")}
          className="h-10 bg-blue-600 hover:bg-blue-700 text-white"
        >
          Ke Dashboard
        </Button>
      </div>
    </div>
  );
}
