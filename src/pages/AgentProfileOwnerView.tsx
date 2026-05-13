/**
 * AgentProfileOwnerView — /agents/:agentId
 *
 * Halaman profil agen yang bisa diakses owner untuk melihat profil lengkap
 * agen tertentu: statistik, misi, daftar order, dan informasi kontak.
 *
 * BERBEDA dari /agent/profile (AgentProfile.tsx) yang merupakan self-view agen.
 *
 * Schema yang digunakan (sudah ada di Supabase):
 *   - agency_members (user_id, role, commission_pct, created_at)
 *   - profiles (id, full_name, email)
 *   - agent_points (agency_id, agent_id, order_id, points, awarded_at)
 *   - daily_missions (agency_id, title, description, reward_points, deadline)
 *   - mission_submissions (agency_id, mission_id, agent_id, status, proof_image_url, notes, reward_points)
 *   - orders (via ordersStore) filtered by createdByAgent
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Trophy, ShoppingBag, TrendingUp, Users,
  Target, CheckCircle2, XCircle, Clock, Send, Eye,
  Mail, Calendar, AlertCircle,
  Crown, BarChart3, MessageCircle, ChevronRight, Loader2,
  Star, Camera, RefreshCw, Pencil, X, Save, Phone,
  Wallet, ArrowDownToLine, Coins, ExternalLink, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useAuthStore, type MemberInfo } from "@/store/authStore";
import { useOrdersStore } from "@/store/ordersStore";
import { useClientsStore } from "@/store/clientsStore";
import {
  listAgentPointsWithOrders, sumPointsByAgent, type AgentPoint, REASON_LABEL,
} from "@/features/agentPoints/agentPointsRepo";
import {
  listMissions, listMySubmissions, reviewSubmission,
} from "@/features/missions/missionsRepo";
import type { DailyMission, MissionSubmission, MissionStatus } from "@/features/missions/types";
import { getTierInfo } from "@/features/agentPoints/agentTiers";
import { sumMissionPointsByAgent } from "@/features/missions/missionsRepo";
import { fmtIDR, agentFeeFromMeta } from "@/lib/profit";
import { computeFeeBreakdown } from "@/lib/agentFeeBreakdown";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { uploadAvatar, savePhotoUrl } from "@/lib/avatarStorage";
import { uploadCardBack, saveCardBackUrl, loadCardBackUrl } from "@/lib/cardBackStorage";
import { supabase } from "@/lib/supabase";
import {
  pullWalletTxs, walletBalance, addWalletTxAsync, deleteWalletTxById,
  type WalletTransaction,
} from "@/lib/agentWallet";
import { ORDER_TYPE_LABEL, ORDER_TYPE_EMOJI, type OrderType } from "@/features/orders/ordersRepo";
import { AgentCard } from "@/components/AgentCard";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  try {
    return format(new Date(iso), "d MMM yyyy", { locale: idLocale });
  } catch {
    return iso;
  }
}

function fmtDateTime(iso: string) {
  try {
    return format(new Date(iso), "d MMM yyyy, HH:mm", { locale: idLocale });
  } catch {
    return iso;
  }
}

const STATUS_CFG: Record<
  MissionStatus,
  { label: string; badge: string; icon: React.ReactNode }
> = {
  pending: {
    label: "Menunggu Validasi",
    badge: "bg-amber-100 text-amber-700 border-amber-200",
    icon: <Clock className="w-3 h-3" />,
  },
  approved: {
    label: "Disetujui ✓",
    badge: "bg-emerald-100 text-emerald-700 border-emerald-200",
    icon: <CheckCircle2 className="w-3 h-3" />,
  },
  rejected: {
    label: "Ditolak",
    badge: "bg-red-100 text-red-600 border-red-200",
    icon: <XCircle className="w-3 h-3" />,
  },
};

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon, label, value, sub, colorCls, bgCls,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  colorCls: string;
  bgCls: string;
}) {
  return (
    <div className={`rounded-2xl border p-3 ${bgCls}`}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <Icon className={`h-3.5 w-3.5 ${colorCls}`} />
      </div>
      <div className={`text-base font-extrabold font-mono ${colorCls}`}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function EmptyState({ icon: Icon, title, desc }: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
      <div className="h-14 w-14 rounded-2xl bg-muted/40 flex items-center justify-center">
        <Icon className="h-7 w-7 text-muted-foreground/50" />
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
      </div>
    </div>
  );
}

// ── MissionRow ────────────────────────────────────────────────────────────────

function MissionRow({
  mission,
  submission,
  onReview,
  reviewing,
}: {
  mission: DailyMission;
  submission: MissionSubmission | undefined;
  onReview: (submissionId: string, action: "approved" | "rejected") => Promise<void>;
  reviewing: string | null;
}) {
  const expired = new Date(mission.deadline) < new Date();
  const status = submission?.status;

  return (
    <div className={`rounded-xl border p-4 transition-colors ${
      status === "approved"
        ? "border-emerald-200 bg-emerald-50/40"
        : status === "rejected"
        ? "border-red-100 bg-red-50/30"
        : status === "pending"
        ? "border-amber-200 bg-amber-50/30"
        : "border-border bg-white"
    }`}>
      <div className="flex items-start gap-3">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm ${
          status === "approved"
            ? "bg-emerald-100 text-emerald-700"
            : status === "pending"
            ? "bg-amber-100 text-amber-700"
            : status === "rejected"
            ? "bg-red-100 text-red-600"
            : "bg-sky-100 text-sky-700"
        }`}>
          <Target className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <p className="text-sm font-semibold leading-tight">{mission.title}</p>
              {mission.description && (
                <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                  {mission.description}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="flex items-center gap-0.5 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">
                <Star className="w-2.5 h-2.5" />{mission.rewardPoints} poin
              </span>
              {status ? (
                <span className={`flex items-center gap-0.5 text-[10px] font-semibold border px-1.5 py-0.5 rounded-full ${STATUS_CFG[status].badge}`}>
                  {STATUS_CFG[status].icon}
                  {STATUS_CFG[status].label}
                </span>
              ) : (
                <span className={`text-[10px] font-semibold border px-1.5 py-0.5 rounded-full ${
                  expired
                    ? "bg-red-50 text-red-500 border-red-200"
                    : "bg-slate-100 text-slate-500 border-slate-200"
                }`}>
                  {expired ? "Kadaluarsa" : "Belum dikerjakan"}
                </span>
              )}
            </div>
          </div>

          <div className="mt-2 flex items-center gap-3 flex-wrap">
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Deadline: {fmtDateTime(mission.deadline)}
            </span>
            {submission?.submittedAt && (
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Send className="w-3 h-3" />
                Submit: {fmtDateTime(submission.submittedAt)}
              </span>
            )}
          </div>

          {submission?.notes && (
            <div className="mt-2 rounded-lg bg-white border px-3 py-2">
              <p className="text-[10px] text-muted-foreground font-medium mb-0.5">Catatan agen:</p>
              <p className="text-[11px]">{submission.notes}</p>
            </div>
          )}

          {submission?.proofImageUrl && (
            <a
              href={submission.proofImageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 flex items-center gap-1 text-[11px] text-sky-600 hover:underline font-medium"
            >
              <Eye className="w-3.5 h-3.5" /> Lihat Bukti Foto
            </a>
          )}

          {status === "pending" && submission && (
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                className="h-7 text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={reviewing === submission.id}
                onClick={() => onReview(submission.id, "approved")}
              >
                {reviewing === submission.id ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : (
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                )}
                Setujui
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[11px] border-red-200 text-red-600 hover:bg-red-50"
                disabled={reviewing === submission.id}
                onClick={() => onReview(submission.id, "rejected")}
              >
                <XCircle className="h-3 w-3 mr-1" />
                Tolak
              </Button>
            </div>
          )}

          {submission?.reviewedAt && (
            <p className="mt-2 text-[10px] text-muted-foreground">
              Divalidasi: {fmtDateTime(submission.reviewedAt)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

type Tab = "overview" | "misi" | "orders" | "komisi" | "informasi";

const TABS: { key: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "overview",  label: "Ringkasan", icon: BarChart3  },
  { key: "misi",      label: "Misi",      icon: Target     },
  { key: "orders",    label: "Order",     icon: ShoppingBag },
  { key: "komisi",    label: "Komisi",    icon: Wallet     },
  { key: "informasi", label: "Informasi", icon: Users      },
];

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AgentProfileOwnerView() {
  const { agentId } = useParams<{ agentId: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const listMembers = useAuthStore((s) => s.listMembers);
  const { orders, fetchOrders, patchOrder } = useOrdersStore();
  const { clients, fetchClients } = useClientsStore();

  const [tab, setTab] = useState<Tab>("overview");
  const [agent, setAgent] = useState<MemberInfo | null>(null);
  const [allPoints, setAllPoints] = useState<AgentPoint[]>([]);
  const [missions, setMissions] = useState<DailyMission[]>([]);
  const [submissions, setSubmissions] = useState<MissionSubmission[]>([]);
  const [allSubs, setAllSubs] = useState<MissionSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [missionFilter, setMissionFilter] = useState<"all" | "pending" | "approved" | "none">("all");
  const [agentPhotoUrl, setAgentPhotoUrl] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [cardBackUrl, setCardBackUrl] = useState<string | null>(null);
  const [cardBackUploading, setCardBackUploading] = useState(false);
  const cardBackInputRef = useRef<HTMLInputElement>(null);
  const [agentPhoneWa, setAgentPhoneWa] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [walletTxs, setWalletTxs] = useState<WalletTransaction[]>([]);
  const [deletingTx, setDeletingTx] = useState<WalletTransaction | null>(null);
  const [completingOrderId, setCompletingOrderId] = useState<string | null>(null);
  const [syncingFee, setSyncingFee] = useState(false);
  const [lastBackfillDebug, setLastBackfillDebug] = useState<{
    credited: number; errors: number; errorSample?: string | null;
  } | null>(null);
  const isOwner = user?.role === "owner";
  const canEdit = isOwner || user?.id === agentId;

  const agencyId = user?.agencyId ?? "";
  const ownerId = user?.id ?? "";

  useEffect(() => {
    if (!agentId || !agencyId) return;
    void (async () => {
      setLoading(true);
      try {
        const [members, pts, ms, subs, allS] = await Promise.all([
          listMembers(),
          listAgentPointsWithOrders(),
          listMissions(agencyId),
          listMySubmissions(agencyId, agentId),
          fetchOrders().then(() => null),
        ]);
        void fetchClients();

        const found = members.find((m) => m.userId === agentId) ?? null;
        setAgent(found);
        if (found?.photoUrl) setAgentPhotoUrl(found.photoUrl);
        setAllPoints(pts);
        setMissions(ms);
        setSubmissions(subs);

        const { listSubmissions } = await import("@/features/missions/missionsRepo");
        const all = await listSubmissions(agencyId);
        setAllSubs(all);

        // Fetch phone_wa from profiles for the Hubungi button
        if (supabase && agentId) {
          try {
            const { data: prof } = await supabase
              .from("profiles")
              .select("phone_wa")
              .eq("id", agentId)
              .maybeSingle();
            if (prof && (prof as { phone_wa?: string | null }).phone_wa) {
              setAgentPhoneWa((prof as { phone_wa: string }).phone_wa);
            }
          } catch { /* phone_wa column may not exist — ignore gracefully */ }
        }

        // Pre-fill edit form fields
        if (found) {
          setEditName(found.displayName);
          setEditEmail(found.email);
        }

        // Pull agent wallet transactions for commission audit panel
        void pullWalletTxs(agentId).then(setWalletTxs);
      } catch (err) {
        console.warn("[AgentProfileOwnerView] load error:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [agentId, agencyId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load card back image for this agent
  useEffect(() => {
    if (!agentId || !agencyId) return;
    void loadCardBackUrl(agentId, agencyId, "agent").then((url) => {
      if (url) setCardBackUrl(url);
    });
  }, [agentId, agencyId]);

  // Reusable backfill runner — surfaces errors to admin; used by auto-run & manual button
  const runBackfill = async (silent = false) => {
    if (!agentId || !supabase) return;
    setSyncingFee(true);
    try {
      const { data: sess } = await supabase!.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) {
        if (!silent) toast.error("Sesi tidak valid — login ulang dulu.");
        return;
      }
      const res = await fetch("/api/backfill-field-fees", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ agentId }),
      });
      const json = await res.json().catch(() => ({})) as {
        credited?: number;
        errors?: number;
        errorSample?: string;
        error?: string;
      };
      // Always refresh wallet — picks up newly credited txs
      const fresh = await pullWalletTxs(agentId!);
      setWalletTxs(fresh);
      if (!res.ok) {
        const msg = json.error ?? `Server error ${res.status}`;
        console.error("[AgentProfileOwnerView] backfill failed:", msg);
        setLastBackfillDebug({ credited: 0, errors: 1, errorSample: msg });
        if (!silent) {
          toast.error("Sinkronisasi fee gagal", {
            description: msg,
            duration: 10000,
          });
        }
      } else {
        setLastBackfillDebug({
          credited: json.credited ?? 0,
          errors: json.errors ?? 0,
          errorSample: json.errorSample,
        });
        if ((json.errors ?? 0) > 0 && json.errorSample) {
          console.error("[AgentProfileOwnerView] backfill partial errors:", json.errorSample);
          toast.warning(`Sebagian fee gagal disinkronkan`, {
            description: json.errorSample,
            duration: 12000,
          });
        } else if ((json.credited ?? 0) > 0) {
          toast.success(`${json.credited} fee berhasil disinkronkan ke wallet.`, { duration: 5000 });
        } else if (!silent) {
          toast.info("Tidak ada fee baru yang perlu disinkronkan.", { duration: 3000 });
        }
      }
    } catch (e) {
      console.error("[AgentProfileOwnerView] backfill exception:", e);
      if (!silent) toast.error("Gagal menghubungi server untuk sinkronisasi fee.");
    } finally {
      setSyncingFee(false);
    }
  };

  // Auto-backfill field fees on mount (owner only) — runs silently in background
  useEffect(() => {
    if (!agentId || !isOwner || !supabase) return;
    void runBackfill(true);
  }, [agentId, isOwner]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCardBackFile = async (file: File) => {
    if (!agentId || !agencyId || !file.type.startsWith("image/")) return;
    setCardBackUploading(true);
    try {
      const url = await uploadCardBack(agentId, file, agencyId, "agent");
      await saveCardBackUrl(agentId, agencyId, url);
      setCardBackUrl(url);
      toast.success(`Gambar belakang kartu ${agent?.displayName ?? "agen"} diperbarui!`);
    } catch (e: unknown) {
      toast.error(`Gagal upload: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setCardBackUploading(false);
    }
  };

  const agentOrders = useMemo(
    () => orders.filter((o) => o.createdByAgent === agentId),
    [orders, agentId],
  );

  const agentClients = useMemo(
    () => clients.filter((c) => c.createdByAgent === agentId),
    [clients, agentId],
  );

  const clientMap = useMemo(
    () => new Map(clients.map((c) => [c.id, c])),
    [clients],
  );

  const orderPts = useMemo(
    () => sumPointsByAgent(allPoints).get(agentId ?? "") ?? 0,
    [allPoints, agentId],
  );
  const missionPts = useMemo(
    () => sumMissionPointsByAgent(submissions).get(agentId ?? "") ?? 0,
    [submissions, agentId],
  );
  const totalPoints = orderPts + missionPts;

  const tierInfo = useMemo(() => getTierInfo(totalPoints), [totalPoints]);

  const allAgentsPts = useMemo(() => {
    const orderMap = sumPointsByAgent(allPoints);
    const msnMap = sumMissionPointsByAgent(allSubs);
    const combined = new Map(orderMap);
    for (const [id, p] of msnMap) combined.set(id, (combined.get(id) ?? 0) + p);
    return combined;
  }, [allPoints, allSubs]);

  const rank = useMemo(() => {
    const sorted = [...allAgentsPts.entries()]
      .sort(([, a], [, b]) => b - a)
      .map(([id]) => id);
    const idx = sorted.indexOf(agentId ?? "");
    return idx >= 0 ? idx + 1 : null;
  }, [allAgentsPts, agentId]);

  const bd = useMemo(() => computeFeeBreakdown(walletTxs), [walletTxs]);

  const orderAssignmentCount = useMemo(() => {
    if (!agentId) return 0;
    return orders.filter((o) => {
      const meta = (o.metadata ?? {}) as Record<string, unknown>;
      return (
        o.createdByAgent === agentId ||
        meta.voaFieldAgentId === agentId ||
        meta.fieldAgentId === agentId ||
        meta.visaExecutorId === agentId ||
        meta.assignedOperationalAgentId === agentId ||
        meta.pelaksanaId === agentId ||
        meta.kurirAgentId === agentId ||
        meta.salesAgentId === agentId ||
        meta.assignedAgentId === agentId ||
        meta.handlerAgentId === agentId ||
        meta.courierAgentId === agentId
      );
    }).length;
  }, [orders, agentId]);

  const portfolio = useMemo(() => {
    const types: OrderType[] = ["umrah", "flight", "visa_voa", "visa_student"];
    const counts: Record<string, number> = Object.fromEntries(types.map((t) => [t, 0]));
    for (const o of agentOrders) if (counts[o.type] !== undefined) counts[o.type]++;
    const max = Math.max(1, ...Object.values(counts));
    return types.map((t) => ({ type: t, count: counts[t], pct: counts[t] / max }));
  }, [agentOrders]);

  const monthly = useMemo(() => {
    const now = new Date();
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      return { label: d.toLocaleDateString("id-ID", { month: "short" }), year: d.getFullYear(), month: d.getMonth(), count: 0 };
    });
    for (const o of agentOrders) {
      const d = new Date(o.createdAt);
      const m = months.find((x) => x.year === d.getFullYear() && x.month === d.getMonth());
      if (m) m.count++;
    }
    const max = Math.max(1, ...months.map((m) => m.count));
    return months.map((m) => ({ ...m, pct: m.count / max }));
  }, [agentOrders]);

  const subMap = useMemo(
    () => new Map(submissions.map((s) => [s.missionId, s])),
    [submissions],
  );

  const filteredMissions = useMemo(() => {
    return missions.filter((m) => {
      if (missionFilter === "all") return true;
      const sub = subMap.get(m.id);
      if (missionFilter === "none") return !sub;
      return sub?.status === missionFilter;
    });
  }, [missions, subMap, missionFilter]);

  const pendingCount = useMemo(
    () => submissions.filter((s) => s.status === "pending").length,
    [submissions],
  );

  // ── Commission audit derived values ───────────────────────────────────────
  const orderBonusTxs = useMemo(
    () => [...walletTxs]
      .filter((t) => t.type === "order_bonus")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [walletTxs],
  );
  /** Semua jenis komisi lapangan: VOA, generic field agent, pelaksana visa, kurir, operasional. */
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
  const walletBal = useMemo(() => walletBalance(walletTxs), [walletTxs]);
  const payoutTxs = useMemo(
    () => walletTxs.filter((t) => t.type === "payout"),
    [walletTxs],
  );

  const handleDeleteTx = async () => {
    if (!deletingTx || !agentId) return;
    const tx = deletingTx;
    setDeletingTx(null);
    // Optimistic: remove from UI immediately
    setWalletTxs((prev) => prev.filter((t) => t.id !== tx.id));
    const { success, error } = await deleteWalletTxById(agentId, tx.id);
    if (success) {
      toast.success("Transaksi komisi dihapus.", { description: tx.description, duration: 4000 });
      // Refresh from server to sync balance and breakdown
      const fresh = await pullWalletTxs(agentId);
      setWalletTxs(fresh);
    } else {
      // Rollback: re-fetch from server
      toast.error(`Gagal hapus komisi: ${error ?? "Coba lagi"}`, { duration: 6000 });
      const fresh = await pullWalletTxs(agentId);
      setWalletTxs(fresh);
    }
  };

  const handlePhotoFile = async (file: File) => {
    if (!agentId) return;
    if (!file.type.startsWith("image/")) return;
    setPhotoUploading(true);
    try {
      const url = await uploadAvatar(agentId, file);
      await savePhotoUrl(agentId, url);
      setAgentPhotoUrl(url);
      toast.success("Foto agen diperbarui!");
    } catch (e: unknown) {
      toast.error(`Gagal upload foto: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setPhotoUploading(false);
    }
  };

  async function handleSaveProfile() {
    if (!agentId || !supabase) return;
    const trimName = editName.trim();
    const trimEmail = editEmail.trim();
    if (!trimName) { toast.error("Nama tidak boleh kosong."); return; }
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .upsert({ id: agentId, full_name: trimName, email: trimEmail }, { onConflict: "id" });
      if (error) throw error;

      // If editing self, update Supabase auth metadata too so displayName refreshes
      if (user?.id === agentId) {
        await supabase.auth.updateUser({
          data: { full_name: trimName, display_name: trimName },
        });
      }

      // Update local agent state so banner reflects immediately
      setAgent((prev) =>
        prev ? { ...prev, displayName: trimName, email: trimEmail } : prev,
      );
      setIsEditMode(false);
      toast.success("Profil berhasil diperbarui!");
    } catch (e: unknown) {
      toast.error(`Gagal menyimpan: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setIsSaving(false);
    }
  }


  async function handleReview(submissionId: string, action: "approved" | "rejected") {
    setReviewing(submissionId);
    const ok = await reviewSubmission(submissionId, action, ownerId);
    if (ok) {
      toast.success(action === "approved" ? "Misi disetujui! Poin dihitung." : "Misi ditolak.");
      const updated = await listMySubmissions(agencyId, agentId ?? "");
      setSubmissions(updated);
    } else {
      toast.error("Gagal memperbarui status misi. Coba lagi.");
    }
    setReviewing(null);
  }

  async function handleMarkComplete(orderId: string) {
    if (!agentId) return;
    setCompletingOrderId(orderId);
    try {
      const order = agentOrders.find((o) => o.id === orderId);
      if (!order) return;
      const meta = (order.metadata ?? {}) as Record<string, unknown>;
      const orderId8 = order.id.slice(0, 8);

      await patchOrder(orderId, { status: "Completed" });

      const flagsPatch: Record<string, unknown> = {};
      let totalCredited = 0;

      // ── 1. Sales agent commission (order_bonus) ──────────────────────────────
      const salesFee = agentFeeFromMeta(order);
      if (salesFee > 0 && !meta.agentFeeCredited) {
        const orderLabel = ORDER_TYPE_LABEL[order.type];
        const clientName = clientMap.get(order.clientId ?? "")?.name;
        const { persisted, error: walletErr } = await addWalletTxAsync(
          agentId,
          {
            agentId,
            type: "order_bonus",
            pointsDelta: 0,
            amountIDR: salesFee,
            description: `Komisi order ${orderLabel} #${orderId8}${clientName ? ` — ${clientName}` : order.title ? ` — ${order.title}` : ""}`,
            createdBy: ownerId,
            orderId: order.id,
          },
          `agent-${order.id}`,
        );
        if (persisted) {
          flagsPatch.agentFeeCredited = true;
          totalCredited += salesFee;
        } else {
          console.warn("[AgentProfileOwnerView] sales commission credit gagal:", walletErr);
        }
      }

      // ── 2. VOA field agent fee ────────────────────────────────────────────────
      const voaAgentId = meta.voaFieldAgentId as string | undefined;
      const voaFee = Number(meta.voaAgentFee ?? 0);
      if (voaAgentId && voaFee > 0 && !meta.voaFeeCredited) {
        const { persisted, error: walletErr } = await addWalletTxAsync(
          voaAgentId,
          {
            agentId: voaAgentId,
            type: "voa_agent_fee",
            pointsDelta: 0,
            amountIDR: voaFee,
            description: `Fee Agent Lapangan VOA #${orderId8}${order.title ? ` — ${order.title}` : ""}`,
            createdBy: ownerId,
            orderId: order.id,
          },
          `voa-${order.id}`,
        );
        if (persisted) {
          flagsPatch.voaFeeCredited = true;
          if (voaAgentId === agentId) totalCredited += voaFee;
        } else {
          console.error("[AgentProfileOwnerView] VOA fee credit gagal:", walletErr);
          toast.error(`Gagal catat fee VOA ke wallet agent lapangan`, { description: walletErr ?? "Coba lagi.", duration: 8000 });
        }
      }

      // ── 3. Generic field agent fee ────────────────────────────────────────────
      const fieldAgentId = meta.fieldAgentId as string | undefined;
      const fieldFee = Number(meta.fieldAgentFee ?? 0);
      if (fieldAgentId && fieldFee > 0 && !meta.fieldFeeCredited) {
        const { persisted, error: walletErr } = await addWalletTxAsync(
          fieldAgentId,
          {
            agentId: fieldAgentId,
            type: "voa_agent_fee",
            pointsDelta: 0,
            amountIDR: fieldFee,
            description: `Fee Agent Lapangan #${orderId8}${order.title ? ` — ${order.title}` : ""}`,
            createdBy: ownerId,
            orderId: order.id,
          },
          `field-${order.id}`,
        );
        if (persisted) {
          flagsPatch.fieldFeeCredited = true;
          if (fieldAgentId === agentId) totalCredited += fieldFee;
        } else {
          console.error("[AgentProfileOwnerView] field agent fee credit gagal:", walletErr);
        }
      }

      // ── 4. Kurir fee ──────────────────────────────────────────────────────────
      const kurirAgentId = meta.kurirAgentId as string | undefined;
      const kurirFeeAmt = Number(meta.kurirFee ?? 0);
      if (kurirAgentId && kurirFeeAmt > 0 && !meta.kurirFeeCredited) {
        const { persisted, error: walletErr } = await addWalletTxAsync(
          kurirAgentId,
          {
            agentId: kurirAgentId,
            type: "kurir_fee",
            pointsDelta: 0,
            amountIDR: kurirFeeAmt,
            description: `Fee Kurir Setoran #${orderId8}${order.title ? ` — ${order.title}` : ""}`,
            createdBy: ownerId,
            orderId: order.id,
          },
          `kurir-${order.id}`,
        );
        if (persisted) {
          flagsPatch.kurirFeeCredited = true;
          if (kurirAgentId === agentId) totalCredited += kurirFeeAmt;
        } else {
          console.error("[AgentProfileOwnerView] kurir fee credit gagal:", walletErr);
          toast.error(`Gagal catat fee kurir`, { description: walletErr ?? "Coba lagi.", duration: 8000 });
        }
      }

      // ── 5. Pelaksana fee (visa_student) ───────────────────────────────────────
      const pelaksanaId = meta.pelaksanaId as string | undefined;
      const pelFee = Number(meta.pelaksanaFee ?? (order.type === "visa_student" && pelaksanaId ? 200_000 : 0));
      if (order.type === "visa_student" && pelaksanaId && pelFee > 0 && !meta.pelaksanaFeeCredited) {
        const { persisted, error: walletErr } = await addWalletTxAsync(
          pelaksanaId,
          {
            agentId: pelaksanaId,
            type: "pelaksana_fee",
            pointsDelta: 0,
            amountIDR: pelFee,
            description: `Fee Pelaksana Visa Student #${orderId8}${order.title ? ` — ${order.title}` : ""}`,
            createdBy: ownerId,
            orderId: order.id,
          },
          `pelaksana-${order.id}`,
        );
        if (persisted) {
          flagsPatch.pelaksanaFeeCredited = true;
          if (pelaksanaId === agentId) totalCredited += pelFee;
        } else {
          console.error("[AgentProfileOwnerView] pelaksana fee credit gagal:", walletErr);
          toast.error(`Gagal catat fee pelaksana`, { description: walletErr ?? "Coba lagi.", duration: 8000 });
        }
      }

      // ── 6. Operational agent fee ──────────────────────────────────────────────
      const opAgentId = meta.assignedOperationalAgentId as string | undefined;
      const opFee = Number(meta.operationalAgentFee ?? 0);
      if (opAgentId && opFee > 0 && !meta.operationalFeeCredited) {
        const { persisted } = await addWalletTxAsync(
          opAgentId,
          {
            agentId: opAgentId,
            type: "voa_agent_fee",
            pointsDelta: 0,
            amountIDR: opFee,
            description: `Fee Agent Operasional #${orderId8}${order.title ? ` — ${order.title}` : ""}`,
            createdBy: ownerId,
            orderId: order.id,
          },
          `op-${order.id}`,
        );
        if (persisted) {
          flagsPatch.operationalFeeCredited = true;
          if (opAgentId === agentId) totalCredited += opFee;
        }
      }

      // ── Stamp credited flags in order metadata ────────────────────────────────
      if (Object.keys(flagsPatch).length > 0) {
        await patchOrder(orderId, { metadata: { ...meta, ...flagsPatch } });
      }

      // ── Award 20 poin ke agen penjual via server ──────────────────────────────
      try {
        const { data: sess } = await supabase!.auth.getSession();
        const token = sess?.session?.access_token;
        const pointsRes = await fetch("/api/award-completion-points", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ orderId, agentId }),
        });
        if (pointsRes.ok) {
          const fresh = await listAgentPointsWithOrders();
          setAllPoints(fresh);
        }
      } catch {
        // non-critical — points can be re-awarded via backfill
      }

      const summary = totalCredited > 0
        ? `Order selesai! Total fee dikreditkan: ${fmtIDR(totalCredited)}`
        : "Order ditandai Selesai.";
      toast.success(summary, { description: "+20 poin diberikan ke agen 🎉", duration: 5000 });

      // Refresh wallet display
      const freshTxs = await pullWalletTxs(agentId);
      setWalletTxs(freshTxs);
    } catch (e) {
      toast.error("Gagal memperbarui order.", { description: e instanceof Error ? e.message : "Coba lagi." });
    } finally {
      setCompletingOrderId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] gap-3 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Memuat profil agen…</span>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center p-6">
        <div className="h-14 w-14 rounded-2xl bg-red-50 flex items-center justify-center">
          <AlertCircle className="h-7 w-7 text-red-400" />
        </div>
        <div>
          <p className="font-semibold text-foreground">Agen Tidak Ditemukan</p>
          <p className="text-xs text-muted-foreground mt-1">
            Profil agen ini tidak tersedia atau sudah dihapus.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate("/agent-center")}>
          <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Kembali ke Agent Center
        </Button>
      </div>
    );
  }

  const { current: tier, next, pointsToNext, progress } = tierInfo;

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-5">
      {/* Back nav */}
      <button
        onClick={() => navigate("/agent-center")}
        className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Kembali ke Agent Center
      </button>

      {/* ── Header Card ── */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className={`rounded-3xl bg-gradient-to-br ${tier.gradient} p-5 md:p-6 text-white shadow-lg`}
      >
        <div className="flex items-start gap-4">
          {/* Avatar — clickable to upload if canEdit */}
          <div className="relative shrink-0">
            {canEdit ? (
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                disabled={photoUploading}
                className="relative group cursor-pointer disabled:cursor-default"
                title="Klik untuk ganti foto"
              >
                <div className="h-16 w-16 rounded-2xl bg-white/20 border-2 border-white/40 overflow-hidden flex items-center justify-center backdrop-blur">
                  {agentPhotoUrl ? (
                    <img src={agentPhotoUrl} alt="foto" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-lg font-extrabold">
                      {agent.displayName.charAt(0).toUpperCase()}
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
            ) : (
              <div className="h-16 w-16 rounded-2xl bg-white/20 border-2 border-white/40 overflow-hidden flex items-center justify-center backdrop-blur">
                {agentPhotoUrl ? (
                  <img src={agentPhotoUrl} alt="foto" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-lg font-extrabold">
                    {agent.displayName.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
            )}
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
          </div>

          {/* Info — view mode or edit mode */}
          <div className="flex-1 min-w-0">
            {isEditMode ? (
              /* ── EDIT FORM ── */
              <div className="space-y-2">
                <div>
                  <label className="text-[10px] font-semibold text-white/70 uppercase tracking-wide">Nama Lengkap</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Nama lengkap"
                    className="mt-0.5 w-full rounded-lg bg-white/20 border border-white/30 text-white placeholder:text-white/50 text-sm font-semibold px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-white/50 backdrop-blur"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-white/70 uppercase tracking-wide">Email</label>
                  <input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    placeholder="email@example.com"
                    className="mt-0.5 w-full rounded-lg bg-white/20 border border-white/30 text-white placeholder:text-white/50 text-sm px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-white/50 backdrop-blur"
                  />
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => void handleSaveProfile()}
                    disabled={isSaving}
                    className="flex items-center gap-1.5 bg-white text-gray-800 text-[11px] font-bold px-3 py-1.5 rounded-lg hover:bg-white/90 transition-colors disabled:opacity-60"
                  >
                    {isSaving ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                    Simpan
                  </button>
                  <button
                    onClick={() => {
                      setIsEditMode(false);
                      setEditName(agent.displayName);
                      setEditEmail(agent.email);
                    }}
                    disabled={isSaving}
                    className="flex items-center gap-1.5 bg-white/20 text-white text-[11px] font-semibold px-3 py-1.5 rounded-lg hover:bg-white/30 transition-colors border border-white/30"
                  >
                    <X className="h-3 w-3" /> Batal
                  </button>
                </div>
              </div>
            ) : (
              /* ── VIEW MODE ── */
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-white/20 backdrop-blur">
                    {tier.emoji} {tier.label}
                  </span>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-400/30 text-white font-semibold">
                    ● Aktif
                  </span>
                </div>
                <h1 className="text-xl font-extrabold mt-1 leading-tight">{agent.displayName}</h1>
                <p className="text-[12px] opacity-90 truncate">{agent.email}</p>
                <p className="text-[11px] opacity-75 mt-0.5">
                  Bergabung: {fmtDate(agent.createdAt)}
                </p>
              </>
            )}
          </div>

          {/* Right-side action buttons */}
          <div className="shrink-0 flex flex-col items-end gap-2">
            {/* Hubungi button — WhatsApp if phone available, email fallback */}
            {agentPhoneWa ? (
              <a
                href={`https://wa.me/${agentPhoneWa.replace(/\D/g, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 border border-white/30 backdrop-blur text-white text-[11px] font-semibold px-3 py-1.5 rounded-xl transition-colors"
                title={`Hubungi via WhatsApp: ${agentPhoneWa}`}
              >
                <Phone className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Hubungi</span>
              </a>
            ) : (
              <a
                href={`mailto:${agent.email}`}
                className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 border border-white/30 backdrop-blur text-white text-[11px] font-semibold px-3 py-1.5 rounded-xl transition-colors"
                title="Hubungi via Email"
              >
                <Mail className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Hubungi</span>
              </a>
            )}

            {/* Edit button — only for owner or the agent themselves */}
            {canEdit && !isEditMode && (
              <button
                onClick={() => {
                  setEditName(agent.displayName);
                  setEditEmail(agent.email);
                  setIsEditMode(true);
                }}
                className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 border border-white/20 backdrop-blur text-white text-[11px] font-semibold px-3 py-1.5 rounded-xl transition-colors"
                title="Edit profil"
              >
                <Pencil className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Edit</span>
              </button>
            )}
          </div>
        </div>

        {/* Tier Progress */}
        {next && (
          <div className="mt-4">
            <div className="flex justify-between text-[10px] opacity-80 mb-1">
              <span>{tier.label}</span>
              <span>{pointsToNext} poin lagi → {next.emoji} {next.label}</span>
            </div>
            <div className="h-2 rounded-full bg-white/20 overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-white"
                initial={{ width: 0 }}
                animate={{ width: `${Math.round(progress * 100)}%` }}
                transition={{ duration: 0.7, ease: "easeOut" }}
              />
            </div>
          </div>
        )}

        {/* Perks */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {tier.perks.map((p) => (
            <span key={p} className="text-[10px] px-2 py-0.5 rounded-full bg-white/15 backdrop-blur">
              ✓ {p}
            </span>
          ))}
        </div>
      </motion.div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 p-1 bg-muted/40 rounded-xl border overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-semibold transition-all whitespace-nowrap ${
              tab === t.key
                ? "bg-white shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
            {t.key === "misi" && pendingCount > 0 && (
              <span className="bg-amber-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Tab Content ── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
        >
          {/* ── OVERVIEW ── */}
          {tab === "overview" && (
            <div className="space-y-4">
              {/* Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { icon: ShoppingBag, label: "Total Order",  value: String(agentOrders.length),            sub: `${agentOrders.filter((o) => o.status === "Completed").length} selesai`, color: "text-violet-600", bg: "bg-violet-50 border-violet-100" },
                  { icon: Users,       label: "Total Klien",  value: String(agentClients.length),           sub: "klien aktif",                        color: "text-sky-600",    bg: "bg-sky-50 border-sky-100" },
                  { icon: TrendingUp,  label: "Total Komisi", value: fmtIDR(bd.totalCredit), sub: "komisi sales + lapangan",                  color: "text-emerald-600",bg: "bg-emerald-50 border-emerald-100" },
                  { icon: Trophy,      label: "Total Poin",   value: totalPoints.toLocaleString("id-ID"),   sub: `Tier ${tier.label}`,                  color: "text-amber-600",  bg: "bg-amber-50 border-amber-100" },
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

              {/* Agent Card Digital */}
              <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: 0.08 }}
                className="rounded-2xl border border-slate-100 bg-white overflow-hidden"
              >
                <div className="px-4 py-3 border-b border-slate-100">
                  <p className="text-sm font-semibold text-slate-800">Kartu Agen Digital</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    ID card resmi {agent.displayName} sebagai Mitra Temantiket
                  </p>
                </div>
                <div className="p-5 flex flex-col items-center gap-4">
                  <AgentCard
                    displayName={agent.displayName}
                    agentId={agentId ?? ""}
                    since={agent.createdAt}
                    backImageUrl={cardBackUrl}
                  />
                  {/* Upload gambar belakang kartu (owner only) */}
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
                      className="w-full flex items-center justify-center gap-2 h-9 rounded-xl border-2 border-dashed border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-600 text-[12px] font-semibold transition-all disabled:opacity-60 active:scale-[0.98]"
                    >
                      {cardBackUploading ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Mengupload…
                        </>
                      ) : (
                        <>
                          <Camera className="h-3.5 w-3.5" />
                          {cardBackUrl ? "Ganti Gambar Belakang Kartu" : "Upload Gambar Belakang Kartu"}
                        </>
                      )}
                    </button>
                    {cardBackUrl && (
                      <p className="text-center text-[10px] text-slate-400 mt-1.5">
                        Klik "Lihat Belakang" pada kartu untuk pratinjau
                      </p>
                    )}
                  </div>
                </div>
              </motion.div>

              {/* Ringkasan Komisi — 5-kategori breakdown dari wallet */}
              <div className="rounded-2xl border border-blue-100 bg-white overflow-hidden">
                <div className="px-4 py-3 border-b border-blue-100 bg-blue-50 flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-blue-500" />
                  <div>
                    <p className="text-sm font-semibold">Ringkasan Komisi</p>
                    <p className="text-[11px] text-muted-foreground">Breakdown lengkap semua pendapatan yang dikreditkan ke wallet</p>
                  </div>
                </div>
                <div className="p-4 space-y-2">
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
                    <p className="text-center text-[11px] text-muted-foreground italic py-1">
                      Belum ada fee dikreditkan. Agen belum memiliki order Completed dengan fee komisi.
                    </p>
                  )}
                </div>
              </div>

              {/* Portofolio Produk */}
              <div className="rounded-2xl border bg-white overflow-hidden">
                <div className="px-4 py-3 border-b">
                  <p className="text-sm font-semibold">Portofolio Produk</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Distribusi order berdasarkan tipe produk</p>
                </div>
                <div className="p-4 space-y-3">
                  {agentOrders.length === 0 ? (
                    <p className="text-center text-[11px] text-muted-foreground py-4 italic">Belum ada order.</p>
                  ) : (
                    portfolio.map(({ type, count, pct }) => (
                      <div key={type}>
                        <div className="flex items-center justify-between text-[12px] mb-1">
                          <span className="font-medium">
                            {ORDER_TYPE_EMOJI[type as keyof typeof ORDER_TYPE_EMOJI]}{" "}
                            {ORDER_TYPE_LABEL[type as keyof typeof ORDER_TYPE_LABEL]}
                          </span>
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
                    ))
                  )}
                </div>
              </div>

              {/* Performa 6 Bulan Terakhir */}
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

              {/* Riwayat Poin Agent */}
              {(() => {
                const agentPtHistory = allPoints
                  .filter((p) => p.agentId === agentId)
                  .slice(0, 15);
                return (
                  <div className="rounded-2xl border bg-white overflow-hidden">
                    <div className="px-4 py-3 border-b flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Star className="h-4 w-4 text-amber-500" />
                        <div>
                          <p className="text-sm font-semibold">Riwayat Poin</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            Log poin dari setiap order selesai
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-100 rounded-full px-3 py-1">
                        <Star className="h-3 w-3 text-amber-400" />
                        <span className="text-[12px] font-extrabold text-amber-700 font-mono">
                          {totalPoints.toLocaleString("id-ID")}
                        </span>
                        <span className="text-[10px] text-amber-500">poin</span>
                      </div>
                    </div>
                    {agentPtHistory.length === 0 ? (
                      <div className="flex flex-col items-center gap-2 py-8 px-4 text-center">
                        <Star className="h-8 w-8 text-muted-foreground/20 stroke-[1.25]" />
                        <p className="text-[11px] text-muted-foreground italic">
                          Belum ada poin. Selesaikan order agen ini untuk memberikan 20 poin pertama.
                        </p>
                      </div>
                    ) : (
                      <div className="divide-y">
                        {agentPtHistory.map((pt) => {
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
                            <div key={pt.id} className="flex items-center gap-3 px-4 py-2.5">
                              <div className="h-8 w-8 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-sm shrink-0">
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
                              <span className="shrink-0 bg-amber-50 border border-amber-200 text-amber-700 rounded-full px-2 py-0.5 text-[11px] font-extrabold font-mono">
                                +{pt.points}
                              </span>
                            </div>
                          );
                        })}
                        {allPoints.filter((p) => p.agentId === agentId).length > 15 && (
                          <div className="px-4 py-2 text-center text-[10px] text-muted-foreground italic">
                            Menampilkan 15 riwayat terbaru
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Klien Terbaru */}
              {agentClients.length > 0 && (
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
                    {[...agentClients]
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

              {/* Rank & Misi summary row */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border bg-sky-50 border-sky-100 p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Rank</span>
                    <Crown className="h-3.5 w-3.5 text-sky-600" />
                  </div>
                  <div className="text-base font-extrabold font-mono text-sky-600">{rank ? `#${rank}` : "—"}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">di leaderboard</div>
                </div>
                <div className="rounded-2xl border bg-purple-50 border-purple-100 p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Misi Selesai</span>
                    <Target className="h-3.5 w-3.5 text-purple-600" />
                  </div>
                  <div className="text-base font-extrabold font-mono text-purple-600">
                    {submissions.filter((s) => s.status === "approved").length}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">misi disetujui</div>
                </div>
              </div>
            </div>
          )}

          {/* ── MISI ── */}
          {tab === "misi" && (
            <div className="space-y-3">
              {/* Filter */}
              <div className="flex gap-1.5 flex-wrap">
                {[
                  { key: "all" as const, label: "Semua" },
                  { key: "pending" as const, label: `Menunggu${pendingCount > 0 ? ` (${pendingCount})` : ""}` },
                  { key: "approved" as const, label: "Disetujui" },
                  { key: "none" as const, label: "Belum dikerjakan" },
                ].map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setMissionFilter(f.key)}
                    className={`text-[11px] font-semibold px-3 py-1.5 rounded-full border transition-all ${
                      missionFilter === f.key
                        ? "bg-primary text-white border-primary"
                        : "bg-white text-muted-foreground hover:border-primary/50"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {filteredMissions.length === 0 ? (
                <EmptyState
                  icon={Target}
                  title="Tidak ada misi"
                  desc="Belum ada misi yang sesuai filter, atau belum ada misi yang dibuat."
                />
              ) : (
                <div className="space-y-3">
                  {filteredMissions.map((m) => (
                    <MissionRow
                      key={m.id}
                      mission={m}
                      submission={subMap.get(m.id)}
                      onReview={handleReview}
                      reviewing={reviewing}
                    />
                  ))}
                </div>
              )}

              <p className="text-[10px] text-muted-foreground text-center pt-1">
                Untuk membuat misi baru, kunjungi tab Misi di{" "}
                <button
                  onClick={() => navigate("/agent-center")}
                  className="text-primary font-semibold hover:underline"
                >
                  Agent Center
                </button>
              </p>
            </div>
          )}

          {/* ── ORDERS ── */}
          {tab === "orders" && (
            <div className="space-y-3">
              {agentOrders.length === 0 ? (
                <EmptyState
                  icon={ShoppingBag}
                  title="Belum ada order"
                  desc="Agen ini belum membuat order apapun."
                />
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <p className="text-sm font-semibold text-foreground">
                      Daftar Order ({agentOrders.length})
                    </p>
                    <span className="text-[11px] text-muted-foreground">
                      {agentOrders.filter((o) => o.status === "Completed").length} selesai
                    </span>
                  </div>
                  {[...agentOrders]
                    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                    .map((o) => {
                      const clientName = clientMap.get(o.clientId ?? "")?.name;
                      const isCompleting = completingOrderId === o.id;
                      const canComplete = isOwner && o.status !== "Completed" && o.status !== "Cancelled";
                      return (
                        <div
                          key={o.id}
                          className={`rounded-2xl border bg-white p-4 space-y-3 transition-colors ${
                            o.status === "Completed" ? "border-emerald-100" : "border-border"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div
                              className="flex-1 min-w-0 cursor-pointer"
                              onClick={() => navigate(`/orders/detail/${o.id}`)}
                            >
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-[13px] font-semibold leading-tight">
                                  {clientName ?? o.title ?? "—"}
                                </p>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                                  o.status === "Completed"
                                    ? "bg-emerald-100 text-emerald-700"
                                    : o.status === "Cancelled"
                                    ? "bg-red-100 text-red-600"
                                    : "bg-amber-100 text-amber-700"
                                }`}>
                                  {o.status}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                <span className="text-[11px] text-muted-foreground capitalize bg-muted/50 px-1.5 py-0.5 rounded">
                                  {ORDER_TYPE_LABEL[o.type]}
                                </span>
                                <span className="text-[11px] text-muted-foreground">
                                  {fmtDate(o.createdAt)}
                                </span>
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-[13px] font-extrabold font-mono text-orange-700">
                                +{fmtIDR(agentFeeFromMeta(o))}
                              </p>
                            </div>
                          </div>

                          {canComplete && (
                            <div className="pt-1 border-t">
                              <Button
                                size="sm"
                                className="w-full h-8 text-[12px] bg-emerald-600 hover:bg-emerald-700 text-white"
                                disabled={isCompleting}
                                onClick={() => void handleMarkComplete(o.id)}
                              >
                                {isCompleting ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                                ) : (
                                  <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                                )}
                                Sudah Selesai
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          )}

          {/* ── KOMISI ── */}
          {tab === "komisi" && (
            <div className="space-y-4">

              {/* Summary strip — 4 kartu komisi + saldo */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">Komisi Sales</span>
                    <Coins className="h-3.5 w-3.5 text-emerald-500" />
                  </div>
                  <p className="text-base font-extrabold font-mono text-emerald-800">{fmtIDR(bd.salesCommission)}</p>
                  <p className="text-[10px] text-emerald-600 mt-0.5">{orderBonusTxs.length} order selesai</p>
                </div>
                <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-indigo-700">Fee Lapangan</span>
                    <span className="text-sm">🗂️</span>
                  </div>
                  <p className="text-base font-extrabold font-mono text-indigo-800">{fmtIDR(bd.fieldAgentFee + bd.pelaksanaFee + bd.kurirFee)}</p>
                  <p className="text-[10px] text-indigo-600 mt-0.5">VOA · Pelaksana · Kurir</p>
                </div>
                <div className="rounded-2xl border border-violet-100 bg-violet-50 p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-violet-700">Bonus / Manual</span>
                    <Coins className="h-3.5 w-3.5 text-violet-500" />
                  </div>
                  <p className="text-base font-extrabold font-mono text-violet-800">{fmtIDR(bd.bonusManual)}</p>
                  <p className="text-[10px] text-violet-600 mt-0.5">konversi poin · koreksi</p>
                </div>
                <div className={`rounded-2xl border p-3 ${walletBal.netIDR >= 0 ? "border-sky-100 bg-sky-50" : "border-red-100 bg-red-50"}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-[10px] font-semibold uppercase tracking-wide ${walletBal.netIDR >= 0 ? "text-sky-700" : "text-red-700"}`}>Saldo Wallet</span>
                    <Wallet className={`h-3.5 w-3.5 ${walletBal.netIDR >= 0 ? "text-sky-500" : "text-red-500"}`} />
                  </div>
                  <p className={`text-xl font-extrabold font-mono ${walletBal.netIDR >= 0 ? "text-sky-800" : "text-red-700"}`}>
                    {fmtIDR(walletBal.netIDR)}
                  </p>
                  <p className={`text-[10px] mt-0.5 ${walletBal.netIDR >= 0 ? "text-sky-600" : "text-red-600"}`}>
                    Cair {fmtIDR(walletBal.totalDebitIDR)}
                  </p>
                </div>
              </div>

              {/* Manual sync button — visible to owner */}
              {isOwner && (
                <div className="flex items-center justify-between rounded-2xl border border-blue-100 bg-blue-50 px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <RefreshCw className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                    <p className="text-[11px] text-blue-700 font-medium">
                      Jika fee lapangan belum muncul, klik Sinkronkan untuk memuat ulang dari database.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[11px] border-blue-200 text-blue-700 hover:bg-blue-100 shrink-0 ml-2"
                    disabled={syncingFee}
                    onClick={() => void runBackfill(false)}
                  >
                    {syncingFee ? (
                      <><Loader2 className="h-3 w-3 animate-spin mr-1" />Menyinkronkan…</>
                    ) : (
                      <><RefreshCw className="h-3 w-3 mr-1" />Sinkronkan Fee</>
                    )}
                  </Button>
                </div>
              )}

              {/* Debug Panel — owner only */}
              {isOwner && (
                <details className="rounded-2xl border border-slate-200 bg-slate-50 overflow-hidden">
                  <summary className="flex items-center gap-2 px-4 py-2.5 cursor-pointer text-[11px] font-semibold text-slate-600 hover:bg-slate-100 transition-colors select-none">
                    <AlertCircle className="h-3.5 w-3.5 text-slate-400" />
                    Debug Info — Kenapa Angka Rp0?
                  </summary>
                  <div className="px-4 pb-4 pt-2 space-y-2 font-mono text-[10px]">
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: "Agent ID (URL)", value: agentId ?? "—" },
                        { label: "Ledger entries (wallet)", value: String(walletTxs.length) },
                        { label: "Order assignments (semua peran)", value: String(orderAssignmentCount) },
                        { label: "Sales orders (createdByAgent)", value: String(agentOrders.length) },
                      ].map((row) => (
                        <div key={row.label} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                          <p className="text-muted-foreground uppercase tracking-wide text-[9px] font-semibold">{row.label}</p>
                          <p className="text-slate-800 font-bold mt-0.5 break-all">{row.value}</p>
                        </div>
                      ))}
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 space-y-1">
                      <p className="text-muted-foreground uppercase tracking-wide text-[9px] font-semibold mb-1">Breakdown Ledger per Tipe</p>
                      {(["order_bonus", "voa_agent_fee", "kurir_fee", "pelaksana_fee", "mission_conversion", "mission_fee", "adjustment", "payout"] as const).map((type) => {
                        const count = walletTxs.filter((t) => t.type === type).length;
                        const total = walletTxs.filter((t) => t.type === type).reduce((s, t) => s + t.amountIDR, 0);
                        return count > 0 ? (
                          <div key={type} className="flex justify-between gap-2">
                            <span className="text-slate-500">{type}</span>
                            <span className="text-slate-800 font-semibold">{count}× · {fmtIDR(total)}</span>
                          </div>
                        ) : null;
                      })}
                      {walletTxs.length === 0 && (
                        <p className="text-red-500 font-semibold">⚠ Tidak ada ledger entry — klik Sinkronkan Fee</p>
                      )}
                    </div>
                    {lastBackfillDebug !== null && (
                      <div className={`rounded-lg border px-3 py-2 ${lastBackfillDebug.errors > 0 ? "border-red-200 bg-red-50" : "border-emerald-200 bg-emerald-50"}`}>
                        <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500 mb-1">Hasil Sinkronisasi Terakhir</p>
                        <p className={lastBackfillDebug.errors > 0 ? "text-red-700" : "text-emerald-700"}>
                          credited={lastBackfillDebug.credited} errors={lastBackfillDebug.errors}
                          {lastBackfillDebug.errorSample ? ` — ${lastBackfillDebug.errorSample}` : ""}
                        </p>
                      </div>
                    )}
                    <p className="text-muted-foreground text-[9px] italic pt-1">
                      Jika ledger=0 & assignment &gt; 0: tekan Sinkronkan. Jika assignment=0: cek apakah ID agen cocok dengan field voaFieldAgentId / fieldAgentId / kurirAgentId di metadata order.
                    </p>
                  </div>
                </details>
              )}

              {/* Per-order commission audit list */}
              <div className="rounded-2xl border bg-white overflow-hidden">
                <div className="px-4 py-3 border-b flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-lg bg-emerald-100 flex items-center justify-center">
                      <Coins className="h-3.5 w-3.5 text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">Audit Komisi Per Order</p>
                      <p className="text-[10px] text-muted-foreground">Setiap order yang selesai & menghasilkan komisi</p>
                    </div>
                  </div>
                  {orderBonusTxs.length > 0 && (
                    <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-emerald-100 text-emerald-700">
                      {orderBonusTxs.length} entri
                    </span>
                  )}
                </div>

                {orderBonusTxs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                    <div className="h-14 w-14 rounded-2xl bg-muted/30 flex items-center justify-center">
                      <Coins className="h-7 w-7 text-muted-foreground/40" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">Belum ada komisi tercatat</p>
                      <p className="text-xs text-muted-foreground mt-1 max-w-[240px]">
                        Komisi akan otomatis muncul saat owner menandai order agen ini sebagai <strong>Selesai</strong>.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="divide-y">
                    {orderBonusTxs.map((tx) => {
                      const idMatch = tx.description.match(/#([a-f0-9]{8})/i);
                      const shortId = idMatch?.[1] ?? null;
                      const linkedOrder = shortId
                        ? agentOrders.find((o) => o.id.startsWith(shortId))
                        : null;
                      const linkedClientName = linkedOrder
                        ? clientMap.get(linkedOrder.clientId ?? "")?.name
                        : null;
                      return (
                        <div key={tx.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors">
                          <div className="h-8 w-8 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0">
                            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            {linkedClientName && (
                              <p className="text-[12px] font-bold text-foreground truncate">
                                {linkedClientName}
                              </p>
                            )}
                            <p className="text-[11px] text-muted-foreground truncate">{tx.description}</p>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              <span className="text-[10px] text-muted-foreground">
                                {fmtDateTime(tx.createdAt)}
                              </span>
                              {shortId && (
                                <span className="text-[9px] font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                                  #{shortId}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {isOwner && (
                              <button
                                onClick={(e) => { e.stopPropagation(); setDeletingTx(tx); }}
                                className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors"
                                title="Hapus komisi ini"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                            <div className="text-right">
                              <p className="text-[13px] font-extrabold font-mono text-emerald-700">
                                +{fmtIDR(tx.amountIDR)}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* ── Komisi Lapangan — unified section (VOA + Pelaksana + Kurir) ── */}
              {fieldCommTxs.length > 0 && (() => {
                const FIELD_CFG: Record<string, { emoji: string; label: string; badgeCls: string; rowHover: string; amtCls: string }> = {
                  voa_agent_fee:  { emoji: "🛂", label: "Agent Lapangan VOA",   badgeCls: "bg-indigo-100 text-indigo-700",  rowHover: "hover:bg-indigo-50/40",  amtCls: "text-indigo-700" },
                  field_agent_fee:{ emoji: "📋", label: "Agent Lapangan",        badgeCls: "bg-sky-100 text-sky-700",        rowHover: "hover:bg-sky-50/40",     amtCls: "text-sky-700" },
                  pelaksana_fee:  { emoji: "🎓", label: "Pelaksana Visa",        badgeCls: "bg-purple-100 text-purple-700",  rowHover: "hover:bg-purple-50/40",  amtCls: "text-purple-700" },
                  kurir_fee:      { emoji: "🚗", label: "Kurir Setoran",         badgeCls: "bg-amber-100 text-amber-700",    rowHover: "hover:bg-amber-50/40",   amtCls: "text-amber-700" },
                  operational_fee:{ emoji: "⚙️", label: "Fee Operasional",       badgeCls: "bg-teal-100 text-teal-700",      rowHover: "hover:bg-teal-50/40",    amtCls: "text-teal-700" },
                };
                const statusCfg: Record<string, { cls: string; label: string }> = {
                  Completed:  { cls: "bg-emerald-100 text-emerald-700", label: "Selesai" },
                  Paid:       { cls: "bg-sky-100 text-sky-700",         label: "Lunas" },
                  Pending:    { cls: "bg-amber-100 text-amber-700",     label: "Proses" },
                  Cancelled:  { cls: "bg-red-100 text-red-600",         label: "Batal" },
                };
                return (
                  <div className="rounded-2xl border bg-white overflow-hidden">
                    <div className="px-4 py-3 border-b flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-lg bg-purple-100 flex items-center justify-center text-sm shrink-0">
                          🗂️
                        </div>
                        <div>
                          <p className="text-sm font-semibold">Komisi Lapangan</p>
                          <p className="text-[10px] text-muted-foreground">
                            Riwayat tugas lapangan: VOA · Pelaksana Visa · Kurir
                          </p>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-purple-100 text-purple-700">
                        {fieldCommTxs.length} penugasan
                      </span>
                    </div>
                    <div className="divide-y">
                      {fieldCommTxs.map((tx) => {
                        const cfg = FIELD_CFG[tx.type] ?? FIELD_CFG.voa_agent_fee;
                        const idMatch = tx.description.match(/#([a-f0-9-]{8,36})/i);
                        const shortId = idMatch?.[1] ?? null;
                        const linkedOrder = shortId
                          ? orders.find((o) => o.id.startsWith(shortId) || o.id === shortId)
                          : null;
                        const clientName = linkedOrder?.clientId
                          ? clientMap.get(linkedOrder.clientId)?.name
                          : null;
                        const orderStatus = linkedOrder?.status ?? null;
                        const statusStyle = orderStatus ? (statusCfg[orderStatus] ?? { cls: "bg-muted text-muted-foreground", label: orderStatus }) : null;
                        const isPaidOut = payoutTxs.some(
                          (pt) => pt.createdAt > tx.createdAt
                        );
                        return (
                          <div
                            key={tx.id}
                            className={`flex items-center gap-3 px-4 py-3 transition-colors ${cfg.rowHover} cursor-pointer`}
                            onClick={() => linkedOrder && navigate(`/orders/detail/${linkedOrder.id}`)}
                            title={linkedOrder ? `Buka detail order #${linkedOrder.id.slice(0, 8)}` : undefined}
                          >
                            <div className="h-9 w-9 rounded-lg bg-purple-50 border border-purple-100 flex items-center justify-center shrink-0 text-base">
                              {cfg.emoji}
                            </div>
                            <div className="flex-1 min-w-0">
                              {clientName && (
                                <p className="text-[12px] font-bold text-foreground truncate">{clientName}</p>
                              )}
                              <p className="text-[11px] text-muted-foreground truncate">{tx.description}</p>
                              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${cfg.badgeCls}`}>
                                  {cfg.label}
                                </span>
                                {statusStyle && (
                                  <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${statusStyle.cls}`}>
                                    {statusStyle.label}
                                  </span>
                                )}
                                <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${isPaidOut ? "bg-orange-100 text-orange-700" : "bg-slate-100 text-slate-500"}`}>
                                  {isPaidOut ? "Sudah Dicairkan" : "Belum Dicairkan"}
                                </span>
                                <span className="text-[10px] text-muted-foreground">{fmtDateTime(tx.createdAt)}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {isOwner && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); setDeletingTx(tx); }}
                                  className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors"
                                  title="Hapus komisi lapangan ini"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                              <div className="text-right">
                              <p className={`text-[13px] font-extrabold font-mono ${cfg.amtCls}`}>
                                +{fmtIDR(tx.amountIDR)}
                              </p>
                              {shortId && (
                                <span className="text-[9px] font-mono text-muted-foreground">
                                  #{shortId}
                                </span>
                              )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* Payout history (secondary) */}
              {payoutTxs.length > 0 && (
                <div className="rounded-2xl border bg-white overflow-hidden">
                  <div className="px-4 py-3 border-b flex items-center gap-2">
                    <div className="h-7 w-7 rounded-lg bg-orange-100 flex items-center justify-center">
                      <ArrowDownToLine className="h-3.5 w-3.5 text-orange-600" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">Riwayat Pencairan</p>
                      <p className="text-[10px] text-muted-foreground">Komisi yang sudah dicairkan ke agen</p>
                    </div>
                  </div>
                  <div className="divide-y">
                    {payoutTxs
                      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                      .map((tx) => (
                        <div key={tx.id} className="flex items-center gap-3 px-4 py-3">
                          <div className="h-8 w-8 rounded-lg bg-orange-50 border border-orange-100 flex items-center justify-center shrink-0">
                            <ArrowDownToLine className="h-4 w-4 text-orange-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] font-semibold truncate">{tx.description}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">{fmtDateTime(tx.createdAt)}</p>
                          </div>
                          <p className="text-[13px] font-extrabold font-mono text-orange-600 shrink-0">
                            −{fmtIDR(Math.abs(tx.amountIDR))}
                          </p>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Fee auto-credit info note */}
              <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 flex items-start gap-2.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Fee lapangan (VOA · Kurir · Pelaksana) otomatis tercatat saat order <strong>Completed</strong>.
                  Data lama disinkronkan otomatis saat halaman ini dibuka.
                </p>
              </div>

              {/* Navigate to Agent Center wallet button */}
              <button
                onClick={() => navigate("/agent-center", { state: { focusAgent: agentId, tab: "direktori" } })}
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-sky-200 bg-sky-50 hover:bg-sky-100 transition-colors py-3 text-[12px] font-semibold text-sky-700"
              >
                <Wallet className="h-3.5 w-3.5" />
                Kelola Wallet di Agent Center
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* ── INFORMASI ── */}
          {tab === "informasi" && (
            <div className="space-y-3">
              <div className="rounded-2xl border bg-white overflow-hidden">
                <div className="px-4 py-3 border-b bg-muted/20">
                  <p className="text-sm font-semibold">Informasi Agen</p>
                </div>
                <div className="divide-y">
                  {[
                    { label: "Nama Lengkap", value: agent.displayName, icon: Users },
                    { label: "Email", value: agent.email, icon: Mail },
                    { label: "Role", value: agent.role === "agent" ? "Mitra Agen" : agent.role, icon: Crown },
                    { label: "Bergabung", value: fmtDate(agent.createdAt), icon: Calendar },
                    { label: "Total Poin", value: `${totalPoints.toLocaleString("id-ID")} poin`, icon: Star },
                    { label: "Level / Tier", value: `${tier.emoji} ${tier.label}`, icon: Trophy },
                    { label: "Rank Leaderboard", value: rank ? `#${rank}` : "Belum ada data", icon: BarChart3 },
                  ].map(({ label, value, icon: Icon }) => (
                    <div key={label} className="flex items-center gap-3 px-4 py-3">
                      <div className="h-7 w-7 rounded-lg bg-muted/40 flex items-center justify-center shrink-0">
                        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      <div className="flex-1">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                          {label}
                        </p>
                        <p className="text-sm font-semibold mt-0.5">{value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-sky-100 bg-sky-50 px-4 py-3">
                <p className="text-[11px] text-sky-700 font-semibold flex items-center gap-1.5">
                  <MessageCircle className="h-3.5 w-3.5" />
                  Nomor WhatsApp belum tersimpan
                </p>
                <p className="text-[10px] text-sky-600 mt-0.5">
                  Minta agen update nomor WA di halaman Pengaturan mereka,
                  atau hubungi via email di atas.
                </p>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => navigate("/agent-center")}
                >
                  <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Kembali
                </Button>
                <Button
                  size="sm"
                  className="flex-1 bg-[#0a2472] hover:bg-[#051650] text-white"
                  onClick={() =>
                    navigate("/agent-center", {
                      state: { focusAgent: agentId },
                    })
                  }
                >
                  <BarChart3 className="h-3.5 w-3.5 mr-1" /> Lihat Analitik
                </Button>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* ── Delete Commission Confirmation Dialog ── */}
      <AlertDialog open={!!deletingTx} onOpenChange={(open) => { if (!open) setDeletingTx(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Transaksi Komisi?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>Transaksi berikut akan dihapus permanen dari wallet agen:</p>
                {deletingTx && (
                  <div className="rounded-lg border bg-muted/40 px-3 py-2 text-[12px]">
                    <p className="font-medium text-foreground">{deletingTx.description}</p>
                    <p className="mt-0.5">
                      <span className="font-mono font-bold text-emerald-700">+{fmtIDR(deletingTx.amountIDR)}</span>
                      <span className="text-muted-foreground ml-2">{fmtDateTime(deletingTx.createdAt)}</span>
                    </p>
                  </div>
                )}
                <p className="text-[12px] text-amber-700 font-semibold">
                  ⚠ Saldo agen akan berkurang sebesar {deletingTx ? fmtIDR(deletingTx.amountIDR) : "—"}.
                  Tindakan ini tidak bisa dibatalkan.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteTx}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Ya, Hapus Komisi
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
