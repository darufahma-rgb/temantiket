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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getBearer } from "@/lib/authFetch";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Trophy, ShoppingBag, TrendingUp, Users,
  Target, CheckCircle2, XCircle, Clock, Send, Eye,
  Mail, Calendar, AlertCircle, AlertTriangle,
  Crown, BarChart3, MessageCircle, ChevronRight, Loader2,
  Star, Camera, RefreshCw, Pencil, X, Save, Phone,
  Wallet, ArrowDownToLine, Coins, ExternalLink, Trash2,
  Share2, MoreVertical, BadgeCheck, ChevronLeft,
  MapPin, Plus,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
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
import { onAgentPointsChanged } from "@/lib/supabaseRealtime";
import type { DailyMission, MissionSubmission, MissionStatus } from "@/features/missions/types";
import { getTierInfo } from "@/features/agentPoints/agentTiers";
import { sumMissionPointsByAgent } from "@/features/missions/missionsRepo";
import { fmtIDR, agentFeeFromMeta, revenueIDR } from "@/lib/profit";
import { computeFeeBreakdown } from "@/lib/agentFeeBreakdown";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { uploadAvatar, savePhotoUrl } from "@/lib/avatarStorage";
import { uploadCardBack, saveCardBackUrl, loadCardBackUrl } from "@/lib/cardBackStorage";
import { supabase } from "@/lib/supabase";
import {
  pullWalletTxs, addWalletTxAsync, deleteWalletTxById,
  type WalletTransaction, deduplicateTxs,
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
  const { orders, fetchOrders, patchOrder, loaded: ordersLoaded } = useOrdersStore();
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
  const [notes, setNotes] = useState<Array<{ id: string; text: string; createdAt: string }>>([]);
  const [newNote, setNewNote] = useState("");
  const [addingNote, setAddingNote] = useState(false);
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

  const refreshAllPoints = useCallback(async () => {
    const fresh = await listAgentPointsWithOrders();
    setAllPoints(fresh);
  }, []);

  useEffect(() => {
    const unsub = onAgentPointsChanged(() => { void refreshAllPoints(); });
    return unsub;
  }, [refreshAllPoints]);

  // Reusable backfill runner — surfaces errors to admin; used by auto-run & manual button
  const runBackfill = async (silent = false) => {
    if (!agentId) return;
    setSyncingFee(true);
    try {
      const authH = await getBearer();
      // Pass all orders from Supabase so the backend can credit commissions even
      // when local PostgreSQL is empty (Replit env — Supabase is the real data store).
      const res = await fetch("/api/backfill-field-fees", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...authH },
        body: JSON.stringify({ agentId, orders }),
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

  // Auto-backfill field fees on mount (owner only) — runs silently in background.
  // No supabase guard: backfill calls /api/backfill-field-fees (backend PostgreSQL),
  // and the frontend passes orders from Supabase via the request body.
  useEffect(() => {
    if (!agentId || !isOwner) return;
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
  // Deduplication is applied first so stale localStorage duplicates never inflate counts.
  const dedupedWalletTxs = useMemo(() => deduplicateTxs(walletTxs), [walletTxs]);

  const orderBonusTxs = useMemo(
    () => [...dedupedWalletTxs]
      .filter((t) => t.type === "order_bonus")
      .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "")),
    [dedupedWalletTxs],
  );
  /** Semua jenis komisi lapangan: VOA, generic field agent, pelaksana visa, kurir, operasional. */
  const fieldCommTxs = useMemo(
    () => [...dedupedWalletTxs]
      .filter((t) =>
        t.type === "voa_agent_fee"  ||
        t.type === "field_agent_fee" ||
        t.type === "pelaksana_fee"  ||
        t.type === "kurir_fee"      ||
        t.type === "operational_fee"
      )
      .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "")),
    [dedupedWalletTxs],
  );
  const payoutTxs = useMemo(
    () => walletTxs.filter((t) => t.type === "payout"),
    [walletTxs],
  );

  // Unique order counts — a single order can produce multiple fee txs (different roles),
  // so we count distinct orderIds instead of raw tx count for badge display.
  const uniqueBonusOrderCount = useMemo(
    () => new Set(orderBonusTxs.filter((t) => t.orderId).map((t) => t.orderId!)).size,
    [orderBonusTxs],
  );
  const uniqueFieldOrderCount = useMemo(
    () => new Set(fieldCommTxs.filter((t) => t.orderId).map((t) => t.orderId!)).size,
    [fieldCommTxs],
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
        const authH2 = await getBearer();
        const pointsRes = await fetch("/api/award-completion-points", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", ...authH2 },
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

  const { current: tier, next, pointsToNext, progress } = tierInfo;

  // ── Mobile-specific computed values — must stay BEFORE early returns to obey Rules of Hooks ──

  const totalRevenue = useMemo(
    () => agentOrders.reduce((s, o) => s + revenueIDR(o), 0),
    [agentOrders],
  );

  const mobileAchievements = useMemo(() => [
    { id: "order10",  emoji: "📦", label: "10 Order",  unlocked: agentOrders.length >= 10 },
    { id: "order50",  emoji: "🚀", label: "50 Order",  unlocked: agentOrders.length >= 50 },
    { id: "order100", emoji: "💯", label: "100 Order", unlocked: agentOrders.length >= 100 },
    { id: "klien10",  emoji: "👥", label: "10 Klien",  unlocked: agentClients.length >= 10 },
    { id: "platinum", emoji: "💎", label: "Platinum",  unlocked: tier.key === "platinum" },
    { id: "top3",     emoji: "🥇", label: "Top 3",     unlocked: !!(rank && rank <= 3) },
  ], [agentOrders.length, agentClients.length, tier.key, rank]);

  const recentActivities = useMemo(() => {
    type Act = { id: string; icon: string; title: string; ref: string; date: string; amount: string; amtColor: string };
    const acts: Act[] = [];
    [...agentOrders]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 4)
      .forEach((o) => {
        const fee = agentFeeFromMeta(o);
        acts.push({
          id: `order-${o.id}`,
          icon: (ORDER_TYPE_EMOJI as Record<string, string>)[o.type] ?? "📦",
          title: `${ORDER_TYPE_LABEL[o.type]}: ${clientMap.get(o.clientId ?? "")?.name ?? o.title ?? "—"}`,
          ref: `#${o.id.slice(0, 8)} · ${o.status}`,
          date: fmtDate(o.createdAt),
          amount: fee > 0 ? `+${fmtIDR(fee)}` : "",
          amtColor: "text-emerald-600",
        });
      });
    allPoints
      .filter((p) => p.agentId === agentId)
      .slice(0, 3)
      .forEach((p) => {
        acts.push({
          id: `pt-${p.id}`,
          icon: "⭐",
          title: REASON_LABEL[p.reason] ?? p.reason,
          ref: `+${p.points} poin`,
          date: fmtDate(p.awardedAt),
          amount: `+${p.points} pts`,
          amtColor: "text-amber-600",
        });
      });
    [...dedupedWalletTxs]
      .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
      .filter((tx) => tx.type === "payout")
      .slice(0, 2)
      .forEach((tx) => {
        acts.push({
          id: `tx-${tx.id}`,
          icon: "💸",
          title: `Pencairan: ${tx.description}`,
          ref: fmtDate(tx.createdAt),
          date: fmtDate(tx.createdAt),
          amount: `-${fmtIDR(Math.abs(tx.amountIDR))}`,
          amtColor: "text-orange-600",
        });
      });
    return acts.slice(0, 6);
  }, [agentOrders, allPoints, dedupedWalletTxs, agentId, clientMap]);

  const fmtRevCompact = (n: number) => {
    if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}M`;
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}Jt`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
    return fmtIDR(n);
  };

  const PIE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#06b6d4"];

  const monthlyRevenue = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const label = d.toLocaleDateString("id-ID", { month: "short" });
      const fullLabel = d.toLocaleDateString("id-ID", { month: "long", year: "numeric" });
      const revenue = agentOrders
        .filter((o) => {
          const od = new Date(o.createdAt);
          return od.getFullYear() === d.getFullYear() && od.getMonth() === d.getMonth();
        })
        .reduce((s, o) => s + revenueIDR(o, egpRate), 0);
      return { label, fullLabel, revenue };
    });
  }, [agentOrders, egpRate]);

  const revenueByType = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of agentOrders) {
      m.set(o.type, (m.get(o.type) ?? 0) + revenueIDR(o, egpRate));
    }
    const total = Array.from(m.values()).reduce((a, b) => a + b, 0);
    const items = Array.from(m.entries())
      .map(([type, value]) => ({
        type,
        label: ORDER_TYPE_LABEL[type as keyof typeof ORDER_TYPE_LABEL] ?? type,
        value,
        pct: total > 0 ? Math.round((value / total) * 100) : 0,
      }))
      .sort((a, b) => b.value - a.value);
    return { total, items };
  }, [agentOrders, egpRate]);

  const byClientForAgent = useMemo(() => {
    const m = new Map<string, { profit: number; revenue: number; count: number; name: string }>();
    for (const o of agentOrders) {
      const key = o.clientId ?? "__none";
      const name =
        key === "__none"
          ? "Tanpa Klien"
          : clientMap.get(key)?.name ?? `Klien ${key.slice(0, 6)}…`;
      const cur = m.get(key) ?? { profit: 0, revenue: 0, count: 0, name };
      cur.revenue += revenueIDR(o, egpRate);
      cur.profit += agentFeeFromMeta(o);
      cur.count++;
      m.set(key, cur);
    }
    return Array.from(m.entries())
      .map(([clientId, v]) => ({ clientId, ...v }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [agentOrders, clientMap, egpRate]);

  const kpiMonthly = useMemo(() => {
    const now = new Date();
    const curY = now.getFullYear(), curM = now.getMonth();
    const prevY = curM === 0 ? curY - 1 : curY;
    const prevM = curM === 0 ? 11 : curM - 1;
    const inMonth = (o: { createdAt: string }, y: number, mo: number) => {
      const d = new Date(o.createdAt);
      return d.getFullYear() === y && d.getMonth() === mo;
    };
    const cur = agentOrders.filter((o) => inMonth(o, curY, curM));
    const prev = agentOrders.filter((o) => inMonth(o, prevY, prevM));
    const curClientSet = new Set(cur.map((o) => o.clientId).filter(Boolean));
    const prevClientSet = new Set(prev.map((o) => o.clientId).filter(Boolean));
    const sum = (os: typeof agentOrders, fn: (o: (typeof agentOrders)[number]) => number) =>
      os.reduce((s, o) => s + fn(o), 0);
    return {
      cur: {
        orders: cur.length,
        clients: curClientSet.size,
        revenue: sum(cur, (o) => revenueIDR(o, egpRate)),
        komisi: sum(cur, (o) => agentFeeFromMeta(o)),
        profit: sum(cur, (o) => revenueIDR(o, egpRate) - agentFeeFromMeta(o)),
      },
      prev: {
        orders: prev.length,
        clients: prevClientSet.size,
        revenue: sum(prev, (o) => revenueIDR(o, egpRate)),
        komisi: sum(prev, (o) => agentFeeFromMeta(o)),
        profit: sum(prev, (o) => revenueIDR(o, egpRate) - agentFeeFromMeta(o)),
      },
    };
  }, [agentOrders, egpRate]);

  const achievements = useMemo(() => {
    const now = new Date();
    const last30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const recentActive = agentOrders.some((o) => new Date(o.createdAt) >= last30);
    const maxMonthlyCompleted = (() => {
      const m = new Map<string, number>();
      for (const o of agentOrders.filter((x) => x.status === "Completed")) {
        const d = new Date(o.createdAt);
        const k = `${d.getFullYear()}-${d.getMonth()}`;
        m.set(k, (m.get(k) ?? 0) + 1);
      }
      return Math.max(0, ...Array.from(m.values()));
    })();
    const last6Active = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      return agentOrders.some((o) => {
        const od = new Date(o.createdAt);
        return od.getFullYear() === d.getFullYear() && od.getMonth() === d.getMonth();
      });
    }).every(Boolean);
    return [
      {
        id: "top_performer",
        emoji: "⭐",
        label: "Top Performer",
        desc: "Top 3 revenue tertinggi bulan ini",
        unlocked: rank !== null && rank <= 3,
        color: "text-amber-600 bg-amber-50 border-amber-200",
      },
      {
        id: "closing_master",
        emoji: "🔒",
        label: "Closing Master",
        desc: "≥5 order selesai dalam sebulan",
        unlocked: maxMonthlyCompleted >= 5,
        color: "text-blue-600 bg-blue-50 border-blue-200",
      },
      {
        id: "problem_solver",
        emoji: "💪",
        label: "Problem Solver",
        desc: "Aktif tanpa komplain 30 hari",
        unlocked: recentActive,
        color: "text-emerald-600 bg-emerald-50 border-emerald-200",
      },
      {
        id: "customer_favorite",
        emoji: "❤️",
        label: "Customer Favorite",
        desc: "Rating klien rata-rata ≥ 4.8",
        unlocked: agentOrders.filter((o) => o.status === "Completed").length >= 5,
        color: "text-pink-600 bg-pink-50 border-pink-200",
      },
      {
        id: "consistent_seller",
        emoji: "💰",
        label: "Consistent Seller",
        desc: "Aktif 6 bulan berturut-turut",
        unlocked: last6Active,
        color: "text-violet-600 bg-violet-50 border-violet-200",
      },
    ];
  }, [agentOrders, rank]);

  useEffect(() => {
    if (!agentId) return;
    const saved = localStorage.getItem(`agent_notes_${agentId}`);
    if (saved) {
      try { setNotes(JSON.parse(saved) as typeof notes); } catch { /* ignore */ }
    }
  }, [agentId]);

  const handleAddNote = () => {
    if (!newNote.trim() || !agentId) return;
    const note = {
      id: crypto.randomUUID(),
      text: newNote.trim(),
      createdAt: new Intl.DateTimeFormat("id-ID", {
        day: "numeric", month: "long", year: "numeric",
      }).format(new Date()),
    };
    const updated = [note, ...notes];
    setNotes(updated);
    localStorage.setItem(`agent_notes_${agentId}`, JSON.stringify(updated));
    setNewNote("");
    setAddingNote(false);
  };

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

  return (
    <>
      {/* ═══════════════════════════════════════════════════════════════
          MOBILE LAYOUT  (md:hidden)
      ═══════════════════════════════════════════════════════════════ */}
      <div className="md:hidden -mx-4 bg-[#F0F4FB] pb-32 min-h-screen">

        {/* ── 1. Header ──────────────────────────────────────────────── */}
        <div className="bg-white px-4 pt-[68px] pb-4 shadow-sm">
          <div className="flex items-center justify-between">
            <button
              onClick={() => navigate(-1 as unknown as string)}
              className="h-9 w-9 rounded-xl bg-[#F0F4FB] flex items-center justify-center active:opacity-60 transition-opacity"
              style={{ WebkitTapHighlightColor: "transparent" }}
            >
              <ChevronLeft className="h-4 w-4 text-slate-600" />
            </button>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => { if (navigator.share) void navigator.share({ title: agent.displayName, url: window.location.href }); }}
                className="h-9 w-9 rounded-xl bg-[#F0F4FB] flex items-center justify-center active:opacity-60 transition-opacity"
                style={{ WebkitTapHighlightColor: "transparent" }}
              >
                <Share2 className="h-4 w-4 text-slate-600" />
              </button>
              {canEdit && (
                <button
                  onClick={() => { setEditName(agent.displayName); setEditEmail(agent.email); setIsEditMode(true); }}
                  className="h-9 w-9 rounded-xl bg-[#F0F4FB] flex items-center justify-center active:opacity-60 transition-opacity"
                  style={{ WebkitTapHighlightColor: "transparent" }}
                >
                  <MoreVertical className="h-4 w-4 text-slate-600" />
                </button>
              )}
            </div>
          </div>
          <h1 className="text-[22px] font-extrabold text-[#0f1c3f] mt-3 leading-tight">Profile Agent</h1>
          <p className="text-[12px] text-slate-500 mt-0.5">Kelola profil, informasi, dan pencapaian {agent.displayName}.</p>
        </div>

        {/* ── 2. Profile Identity Card ────────────────────────────────── */}
        <div className="px-4 mt-4">
          <div className="bg-white rounded-3xl shadow-sm overflow-hidden">
            <div className={`h-24 bg-gradient-to-r ${tier.gradient}`} />
            <div className="px-5 pb-5 -mt-12">
              <div className="flex items-end justify-between">
                {/* Avatar */}
                <div className="relative">
                  {canEdit ? (
                    <button type="button" onClick={() => photoInputRef.current?.click()} disabled={photoUploading}
                      className="relative group cursor-pointer disabled:cursor-default"
                      style={{ WebkitTapHighlightColor: "transparent" }}
                    >
                      <div className="h-20 w-20 rounded-2xl bg-white border-4 border-white overflow-hidden flex items-center justify-center shadow-md">
                        {agentPhotoUrl ? (
                          <img src={agentPhotoUrl} alt="foto" className="h-full w-full object-cover" />
                        ) : (
                          <div className={`h-full w-full bg-gradient-to-br ${tier.gradient} flex items-center justify-center`}>
                            <span className="text-2xl font-extrabold text-white">{agent.displayName.charAt(0).toUpperCase()}</span>
                          </div>
                        )}
                      </div>
                      {photoUploading ? (
                        <div className="absolute inset-0 rounded-2xl bg-black/50 flex items-center justify-center">
                          <RefreshCw className="h-5 w-5 text-white animate-spin" />
                        </div>
                      ) : (
                        <div className="absolute inset-0 rounded-2xl bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 group-active:opacity-100 transition-opacity">
                          <Camera className="h-5 w-5 text-white" />
                        </div>
                      )}
                    </button>
                  ) : (
                    <div className="h-20 w-20 rounded-2xl bg-white border-4 border-white overflow-hidden flex items-center justify-center shadow-md">
                      {agentPhotoUrl ? (
                        <img src={agentPhotoUrl} alt="foto" className="h-full w-full object-cover" />
                      ) : (
                        <div className={`h-full w-full bg-gradient-to-br ${tier.gradient} flex items-center justify-center`}>
                          <span className="text-2xl font-extrabold text-white">{agent.displayName.charAt(0).toUpperCase()}</span>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-[#0066FF] border-2 border-white flex items-center justify-center shadow-sm">
                    <BadgeCheck className="h-3.5 w-3.5 text-white" />
                  </div>
                </div>
                {/* Badges top-right */}
                <div className="flex flex-col items-end gap-1.5 pb-1">
                  <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700">● Aktif</span>
                  {rank && <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">🏆 #{rank}</span>}
                </div>
              </div>

              {/* Name + info */}
              <div className="mt-3">
                <h2 className="text-[20px] font-extrabold text-[#0f1c3f] leading-tight">{agent.displayName}</h2>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-blue-100 text-[#0066FF]">{tier.emoji} {tier.label}</span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">Mitra Agent</span>
                </div>
                <p className="text-[12px] text-slate-500 mt-2">{agent.email}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">ID: AGT-{agentId?.slice(0, 8).toUpperCase()}</p>
                <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
                  <Calendar className="h-3 w-3 shrink-0" /> Bergabung {fmtDate(agent.createdAt)}
                </p>
              </div>

              {/* Edit form (mobile) */}
              {isEditMode && (
                <div className="mt-4 p-4 rounded-2xl bg-[#F0F4FB] space-y-3">
                  <p className="text-[12px] font-bold text-[#0f1c3f]">Edit Profil</p>
                  <div>
                    <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Nama Lengkap</label>
                    <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white text-[13px] font-semibold text-[#0f1c3f] px-3 py-2.5 focus:outline-none focus:border-[#0066FF] focus:ring-2 focus:ring-blue-100 transition-all"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Email</label>
                    <input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white text-[13px] text-[#0f1c3f] px-3 py-2.5 focus:outline-none focus:border-[#0066FF] focus:ring-2 focus:ring-blue-100 transition-all"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => void handleSaveProfile()} disabled={isSaving}
                      className="flex-1 h-10 rounded-xl bg-[#0066FF] text-white text-[12px] font-bold active:opacity-80 disabled:opacity-60 flex items-center justify-center gap-1.5 transition-opacity"
                      style={{ WebkitTapHighlightColor: "transparent" }}
                    >
                      {isSaving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Simpan
                    </button>
                    <button onClick={() => { setIsEditMode(false); setEditName(agent.displayName); setEditEmail(agent.email); }} disabled={isSaving}
                      className="flex-1 h-10 rounded-xl border border-slate-200 bg-white text-[12px] font-semibold text-slate-600 active:opacity-70 flex items-center justify-center gap-1.5 transition-opacity"
                      style={{ WebkitTapHighlightColor: "transparent" }}
                    >
                      <X className="h-3.5 w-3.5" /> Batal
                    </button>
                  </div>
                </div>
              )}

              {/* Contact buttons */}
              {!isEditMode && (
                <div className="flex gap-2 mt-4 flex-wrap">
                  {agentPhoneWa && (
                    <a href={`https://wa.me/${agentPhoneWa.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-emerald-500 text-white text-[11px] font-bold active:opacity-80 shadow-sm transition-opacity"
                      style={{ WebkitTapHighlightColor: "transparent" }}
                    >
                      💬 WA
                    </a>
                  )}
                  {agentPhoneWa && (
                    <a href={`tel:${agentPhoneWa}`}
                      className="flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-[#F0F4FB] border border-slate-200 text-slate-700 text-[11px] font-bold active:opacity-80 transition-opacity"
                      style={{ WebkitTapHighlightColor: "transparent" }}
                    >
                      <Phone className="h-3.5 w-3.5" /> Telepon
                    </a>
                  )}
                  <a href={`mailto:${agent.email}`}
                    className="flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-[#F0F4FB] border border-slate-200 text-slate-700 text-[11px] font-bold active:opacity-80 transition-opacity"
                    style={{ WebkitTapHighlightColor: "transparent" }}
                  >
                    <Mail className="h-3.5 w-3.5" /> Email
                  </a>
                  {canEdit && (
                    <button onClick={() => { setEditName(agent.displayName); setEditEmail(agent.email); setIsEditMode(true); }}
                      className="flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-[#0066FF] text-white text-[11px] font-bold active:opacity-80 shadow-sm transition-opacity"
                      style={{ WebkitTapHighlightColor: "transparent" }}
                    >
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── 3. Level Agent Hero Card ────────────────────────────────── */}
        <div className="px-4 mt-3">
          <motion.div
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
            className={`rounded-3xl p-5 bg-gradient-to-br ${tier.gradient} shadow-lg`}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-[11px] font-bold text-white/70 uppercase tracking-wide mb-0.5">Level Agent</p>
                <p className="text-[24px] font-extrabold text-white leading-tight">{tier.emoji} {tier.label}</p>
              </div>
              <div className="h-12 w-12 rounded-2xl bg-white/20 border border-white/30 flex items-center justify-center shrink-0">
                <Trophy className="h-6 w-6 text-white" />
              </div>
            </div>
            {next ? (
              <>
                <div className="flex justify-between text-[10px] text-white/75 mb-1.5">
                  <span className="font-semibold">{totalPoints.toLocaleString("id-ID")} poin</span>
                  <span>{pointsToNext} lagi → {next.emoji} {next.label}</span>
                </div>
                <div className="h-2.5 rounded-full bg-white/25 overflow-hidden">
                  <motion.div className="h-full rounded-full bg-white" initial={{ width: 0 }} animate={{ width: `${Math.round(progress * 100)}%` }} transition={{ duration: 0.8, ease: "easeOut" }} />
                </div>
              </>
            ) : (
              <p className="text-[13px] text-white font-semibold mb-2">🎉 Anda sudah di level tertinggi — Platinum!</p>
            )}
            <div className="flex flex-wrap gap-1.5 mt-3">
              {tier.perks.map((p) => (
                <span key={p} className="text-[10px] px-2 py-0.5 rounded-full bg-white/20 text-white font-medium">✓ {p}</span>
              ))}
            </div>
            <button
              onClick={() => navigate("/agent/leaderboard")}
              className="mt-3 w-full h-9 rounded-xl bg-white/20 border border-white/30 text-white text-[12px] font-bold active:opacity-80 flex items-center justify-center gap-1.5 transition-opacity"
              style={{ WebkitTapHighlightColor: "transparent" }}
            >
              <BarChart3 className="h-3.5 w-3.5" /> Lihat Leaderboard
            </button>
          </motion.div>
        </div>

        {/* ── 4. Ringkasan Performa ───────────────────────────────────── */}
        <div className="px-4 mt-3">
          <div className="bg-white rounded-3xl shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[15px] font-extrabold text-[#0f1c3f]">Ringkasan Performa</h3>
              <button onClick={() => setTab("orders")} className="text-[11px] font-semibold text-[#0066FF] active:opacity-70 flex items-center gap-0.5" style={{ WebkitTapHighlightColor: "transparent" }}>
                Lihat Detail <ChevronRight className="h-3 w-3" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {([
                { label: "Total Order",     value: String(agentOrders.length),                                          sub: `${agentOrders.filter((o) => o.status === "Completed").length} selesai`, icon: "📦", color: "#8b5cf6", bg: "#ede9fe" },
                { label: "Total Penjualan", value: fmtRevCompact(totalRevenue),                                         sub: "total pendapatan",   icon: "💰", color: "#10b981", bg: "#d1fae5" },
                { label: "Rating",          value: "4.8 ★",                                                             sub: "performa agent",     icon: "⭐", color: "#f59e0b", bg: "#fef3c7" },
                { label: "Total Klien",     value: String(agentClients.length),                                         sub: "klien terdaftar",    icon: "👥", color: "#0066FF", bg: "#dbeafe" },
              ] as const).map((s) => (
                <div key={s.label} className="rounded-2xl p-4" style={{ backgroundColor: s.bg }}>
                  <div className="text-xl mb-2">{s.icon}</div>
                  <p className="text-[20px] font-extrabold leading-none tabular-nums" style={{ color: s.color }}>{s.value}</p>
                  <p className="text-[10px] font-bold uppercase tracking-wide mt-1 opacity-80" style={{ color: s.color }}>{s.label}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{s.sub}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── 5. Pencapaian ───────────────────────────────────────────── */}
        <div className="px-4 mt-3">
          <div className="bg-white rounded-3xl shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[15px] font-extrabold text-[#0f1c3f]">Pencapaian</h3>
              <span className="text-[10px] font-semibold text-slate-400">{mobileAchievements.filter((a) => a.unlocked).length}/{mobileAchievements.length} unlock</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {mobileAchievements.map((a) => (
                <div key={a.id} className={`rounded-2xl p-3 flex flex-col items-center gap-1.5 ${a.unlocked ? "bg-gradient-to-b from-blue-50 to-indigo-50 border border-blue-100" : "bg-slate-50 border border-slate-100 opacity-50"}`}>
                  <span className={`text-2xl ${!a.unlocked ? "grayscale" : ""}`}>{a.emoji}</span>
                  <p className="text-[10px] font-bold text-center text-slate-700 leading-tight">{a.label}</p>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${a.unlocked ? "bg-[#0066FF] text-white" : "bg-slate-200 text-slate-500"}`}>
                    {a.unlocked ? "✓ Unlock" : "Terkunci"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── 6. Layanan Terlaris ─────────────────────────────────────── */}
        <div className="px-4 mt-3">
          <div className="bg-white rounded-3xl shadow-sm p-5">
            <h3 className="text-[15px] font-extrabold text-[#0f1c3f] mb-4">Layanan Terlaris</h3>
            <div className="grid grid-cols-2 gap-3">
              {portfolio.map(({ type, count }) => {
                const typeEmoji = (ORDER_TYPE_EMOJI as Record<string, string>)[type] ?? "📦";
                const typeLabel = ORDER_TYPE_LABEL[type as keyof typeof ORDER_TYPE_LABEL] ?? type;
                const typeRev = agentOrders.filter((o) => o.type === type).reduce((s, o) => s + revenueIDR(o), 0);
                const colMap: Record<string, { color: string; bg: string }> = {
                  umrah:        { color: "#0066FF", bg: "#dbeafe" },
                  flight:       { color: "#8b5cf6", bg: "#ede9fe" },
                  visa_voa:     { color: "#10b981", bg: "#d1fae5" },
                  visa_student: { color: "#f59e0b", bg: "#fef3c7" },
                };
                const c = colMap[type] ?? { color: "#64748b", bg: "#f1f5f9" };
                return (
                  <div key={type} className="rounded-2xl p-4" style={{ backgroundColor: c.bg }}>
                    <div className="text-xl mb-2">{typeEmoji}</div>
                    <p className="text-[11px] font-bold" style={{ color: c.color }}>{typeLabel}</p>
                    <p className="text-[18px] font-extrabold font-mono tabular-nums" style={{ color: c.color }}>{count}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{fmtRevCompact(typeRev)}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── 7. Riwayat Aktivitas ────────────────────────────────────── */}
        <div className="px-4 mt-3">
          <div className="bg-white rounded-3xl shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <h3 className="text-[15px] font-extrabold text-[#0f1c3f]">Riwayat Aktivitas</h3>
              <button onClick={() => setTab("orders")} className="text-[11px] font-semibold text-[#0066FF] active:opacity-70" style={{ WebkitTapHighlightColor: "transparent" }}>Lihat Semua</button>
            </div>
            {recentActivities.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 px-4 text-center">
                <ShoppingBag className="h-8 w-8 text-slate-200" />
                <p className="text-[12px] text-slate-400">Belum ada aktivitas</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {recentActivities.map((act) => (
                  <div key={act.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="h-9 w-9 rounded-xl bg-[#F0F4FB] flex items-center justify-center text-base shrink-0">{act.icon}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-semibold text-[#0f1c3f] truncate">{act.title}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5 truncate">{act.ref} · {act.date}</p>
                    </div>
                    {act.amount && (
                      <div className="shrink-0 flex items-center gap-1">
                        <span className={`text-[12px] font-extrabold font-mono ${act.amtColor}`}>{act.amount}</span>
                        <ChevronRight className="h-3.5 w-3.5 text-slate-300" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── 8. Detail Tabs ──────────────────────────────────────────── */}
        <div className="px-4 mt-4">
          <h3 className="text-[15px] font-extrabold text-[#0f1c3f] mb-3">Detail Lengkap</h3>
          <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
            {TABS.map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`shrink-0 flex items-center gap-1.5 h-9 px-4 rounded-full text-[12px] font-semibold transition-all active:scale-95 ${tab === t.key ? "bg-[#0066FF] text-white shadow-md shadow-blue-200" : "bg-white text-slate-600 border border-slate-200"}`}
                style={{ WebkitTapHighlightColor: "transparent" }}
              >
                <t.icon className="h-3.5 w-3.5" />
                {t.label}
                {t.key === "misi" && pendingCount > 0 && <span className="bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{pendingCount}</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Mobile tab content */}
        <div className="px-4 mt-3">
          <AnimatePresence mode="wait">
            <motion.div key={`mob-${tab}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>

              {/* Overview: compact extras */}
              {tab === "overview" && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white rounded-2xl shadow-sm p-4">
                      <div className="flex items-center justify-between mb-2"><span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Rank</span><Crown className="h-4 w-4 text-amber-500" /></div>
                      <p className="text-[22px] font-extrabold font-mono text-amber-600">{rank ? `#${rank}` : "—"}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">di leaderboard</p>
                    </div>
                    <div className="bg-white rounded-2xl shadow-sm p-4">
                      <div className="flex items-center justify-between mb-2"><span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Misi Selesai</span><Target className="h-4 w-4 text-purple-500" /></div>
                      <p className="text-[22px] font-extrabold font-mono text-purple-600">{submissions.filter((s) => s.status === "approved").length}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">misi disetujui</p>
                    </div>
                  </div>
                  <div className="bg-white rounded-2xl shadow-sm p-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-[13px] font-extrabold text-[#0f1c3f]">Ringkasan Komisi</p>
                      <button onClick={() => setTab("komisi")} className="text-[11px] font-semibold text-[#0066FF]" style={{ WebkitTapHighlightColor: "transparent" }}>Detail</button>
                    </div>
                    <div className="space-y-2">
                      {[
                        { label: "Komisi Sales",   value: bd.salesCommission, color: "text-emerald-700" },
                        { label: "Fee Lapangan",   value: bd.fieldAgentFee + bd.pelaksanaFee + bd.kurirFee, color: "text-indigo-700" },
                        { label: "Total Komisi",   value: bd.totalCredit, color: "text-[#0f1c3f]" },
                        { label: "Saldo Wallet",   value: bd.netBalance, color: bd.netBalance >= 0 ? "text-sky-700" : "text-red-700" },
                      ].map((row) => (
                        <div key={row.label} className="flex items-center justify-between">
                          <span className="text-[12px] text-slate-500">{row.label}</span>
                          <span className={`text-[13px] font-extrabold font-mono ${row.color}`}>{fmtIDR(row.value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-100"><p className="text-[13px] font-extrabold text-[#0f1c3f]">Kartu Agen Digital</p></div>
                    <div className="p-4 flex flex-col items-center gap-3">
                      <AgentCard displayName={agent.displayName} agentId={agentId ?? ""} since={agent.createdAt} backImageUrl={cardBackUrl} />
                      <input ref={cardBackInputRef} type="file" accept="image/*" className="hidden"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleCardBackFile(f); e.target.value = ""; }}
                      />
                      <button onClick={() => cardBackInputRef.current?.click()} disabled={cardBackUploading}
                        className="w-full flex items-center justify-center gap-2 h-9 rounded-xl border-2 border-dashed border-blue-200 bg-blue-50 text-blue-600 text-[12px] font-semibold disabled:opacity-60"
                        style={{ WebkitTapHighlightColor: "transparent" }}
                      >
                        {cardBackUploading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Mengupload…</> : <><Camera className="h-3.5 w-3.5" />{cardBackUrl ? "Ganti Belakang Kartu" : "Upload Belakang Kartu"}</>}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Misi tab */}
              {tab === "misi" && (
                <div className="space-y-3">
                  <div className="flex gap-1.5 flex-wrap">
                    {([
                      { key: "all" as const,      label: "Semua" },
                      { key: "pending" as const,   label: `Menunggu${pendingCount > 0 ? ` (${pendingCount})` : ""}` },
                      { key: "approved" as const,  label: "Disetujui" },
                      { key: "none" as const,      label: "Belum dikerjakan" },
                    ]).map((f) => (
                      <button key={f.key} onClick={() => setMissionFilter(f.key)}
                        className={`text-[11px] font-semibold px-3 py-1.5 rounded-full border transition-all ${missionFilter === f.key ? "bg-[#0066FF] text-white border-[#0066FF]" : "bg-white text-slate-500 border-slate-200"}`}
                        style={{ WebkitTapHighlightColor: "transparent" }}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                  {filteredMissions.length === 0 ? (
                    <EmptyState icon={Target} title="Tidak ada misi" desc="Belum ada misi yang sesuai filter." />
                  ) : (
                    <div className="space-y-3">
                      {filteredMissions.map((m) => (
                        <MissionRow key={m.id} mission={m} submission={subMap.get(m.id)} onReview={handleReview} reviewing={reviewing} />
                      ))}
                    </div>
                  )}
                  <p className="text-[10px] text-slate-400 text-center pt-1">
                    Buat misi baru di <button onClick={() => navigate("/agent-center")} className="text-[#0066FF] font-semibold" style={{ WebkitTapHighlightColor: "transparent" }}>Agent Center</button>
                  </p>
                </div>
              )}

              {/* Orders tab */}
              {tab === "orders" && (
                <div className="space-y-3">
                  {agentOrders.length === 0 ? (
                    <EmptyState icon={ShoppingBag} title="Belum ada order" desc="Agen ini belum membuat order apapun." />
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between px-1">
                        <p className="text-[13px] font-extrabold text-[#0f1c3f]">Daftar Order ({agentOrders.length})</p>
                        <span className="text-[11px] text-slate-400">{agentOrders.filter((o) => o.status === "Completed").length} selesai</span>
                      </div>
                      {[...agentOrders].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((o) => {
                        const clientName = clientMap.get(o.clientId ?? "")?.name;
                        const isCompleting = completingOrderId === o.id;
                        const canComplete = isOwner && o.status !== "Completed" && o.status !== "Cancelled";
                        return (
                          <div key={o.id} className={`bg-white rounded-2xl border p-4 space-y-3 ${o.status === "Completed" ? "border-emerald-100" : "border-slate-100"}`}>
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0 cursor-pointer" onClick={() => navigate(`/orders/detail/${o.id}`)}>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="text-[13px] font-semibold text-[#0f1c3f] leading-tight">{clientName ?? o.title ?? "—"}</p>
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${o.status === "Completed" ? "bg-emerald-100 text-emerald-700" : o.status === "Cancelled" ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-700"}`}>{o.status}</span>
                                </div>
                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                  <span className="text-[11px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{ORDER_TYPE_LABEL[o.type]}</span>
                                  <span className="text-[11px] text-slate-400">{fmtDate(o.createdAt)}</span>
                                </div>
                              </div>
                              <p className="text-[13px] font-extrabold font-mono text-orange-700 shrink-0">+{fmtIDR(agentFeeFromMeta(o))}</p>
                            </div>
                            {canComplete && (
                              <div className="pt-1 border-t border-slate-100">
                                <Button size="sm" className="w-full h-8 text-[12px] bg-emerald-600 hover:bg-emerald-700 text-white" disabled={isCompleting} onClick={() => void handleMarkComplete(o.id)}>
                                  {isCompleting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />}
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

              {/* Komisi tab */}
              {tab === "komisi" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: "Komisi Sales",   value: bd.salesCommission, color: "text-emerald-800", bg: "bg-emerald-50 border-emerald-100",                         sub: `${uniqueBonusOrderCount || orderBonusTxs.length} order selesai` },
                      { label: "Fee Lapangan",   value: bd.fieldAgentFee + bd.pelaksanaFee + bd.kurirFee, color: "text-indigo-800", bg: "bg-indigo-50 border-indigo-100", sub: "VOA · Pelaksana · Kurir" },
                      { label: "Bonus / Manual", value: bd.bonusManual,     color: "text-violet-800",  bg: "bg-violet-50 border-violet-100",                          sub: "konversi poin · koreksi" },
                      { label: "Saldo Wallet",   value: bd.netBalance,      color: bd.netBalance >= 0 ? "text-sky-800" : "text-red-700", bg: bd.netBalance >= 0 ? "bg-sky-50 border-sky-100" : "bg-red-50 border-red-100", sub: `Cair ${fmtIDR(bd.totalPaidOut)}` },
                    ].map((s) => (
                      <div key={s.label} className={`rounded-2xl border p-3 ${s.bg}`}>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1">{s.label}</p>
                        <p className={`text-[15px] font-extrabold font-mono ${s.color}`}>{fmtIDR(s.value)}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{s.sub}</p>
                      </div>
                    ))}
                  </div>
                  {isOwner && (
                    <div className="flex items-center justify-between rounded-2xl border border-blue-100 bg-blue-50 px-4 py-2.5">
                      <p className="text-[11px] text-blue-700 font-medium flex-1">Fee lapangan belum muncul? Sinkronkan sekarang.</p>
                      <Button size="sm" variant="outline" className="h-7 text-[11px] border-blue-200 text-blue-700 hover:bg-blue-100 shrink-0 ml-2" disabled={syncingFee} onClick={() => void runBackfill(false)}>
                        {syncingFee ? <><Loader2 className="h-3 w-3 animate-spin mr-1" />Sinkron…</> : <><RefreshCw className="h-3 w-3 mr-1" />Sinkronkan</>}
                      </Button>
                    </div>
                  )}
                  <div className="bg-white rounded-2xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                      <p className="text-[13px] font-extrabold text-[#0f1c3f]">Audit Komisi Per Order</p>
                      {orderBonusTxs.length > 0 && <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-emerald-100 text-emerald-700">{orderBonusTxs.length} entri</span>}
                    </div>
                    {orderBonusTxs.length === 0 ? (
                      <div className="py-10 text-center"><Coins className="h-8 w-8 mx-auto text-slate-200 mb-2" /><p className="text-[12px] text-slate-400">Belum ada komisi tercatat</p></div>
                    ) : (
                      <div className="divide-y divide-slate-50">
                        {orderBonusTxs.map((tx) => {
                          const idMatch = tx.description.match(/#([a-f0-9]{8})/i);
                          const shortId = idMatch?.[1] ?? null;
                          const linkedOrder = shortId ? agentOrders.find((o) => o.id.startsWith(shortId)) : null;
                          const linkedClientName = linkedOrder ? clientMap.get(linkedOrder.clientId ?? "")?.name : null;
                          const isOrphan = ordersLoaded && shortId !== null && linkedOrder === null;
                          return (
                            <div key={tx.id} className={`flex items-center gap-3 px-4 py-3 ${isOrphan ? "opacity-70" : ""}`}>
                              <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${isOrphan ? "bg-orange-50 border border-orange-100" : "bg-emerald-50 border border-emerald-100"}`}>
                                {isOrphan ? <AlertTriangle className="h-4 w-4 text-orange-500" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                {linkedClientName && <p className="text-[12px] font-bold text-[#0f1c3f] truncate">{linkedClientName}</p>}
                                <p className="text-[11px] text-slate-400 truncate">{tx.description}</p>
                                <p className="text-[10px] text-slate-400 mt-0.5">{fmtDateTime(tx.createdAt)}</p>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {isOwner && (
                                  <button onClick={(e) => { e.stopPropagation(); setDeletingTx(tx); }} className="h-7 w-7 rounded-lg flex items-center justify-center text-slate-300 hover:text-red-600 hover:bg-red-50 transition-colors" title="Hapus">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                                <p className="text-[13px] font-extrabold font-mono text-emerald-700">+{fmtIDR(tx.amountIDR)}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  {fieldCommTxs.length > 0 && (
                    <div className="bg-white rounded-2xl overflow-hidden">
                      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                        <p className="text-[13px] font-extrabold text-[#0f1c3f]">Komisi Lapangan</p>
                        <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-purple-100 text-purple-700">{fieldCommTxs.length} penugasan</span>
                      </div>
                      <div className="divide-y divide-slate-50">
                        {fieldCommTxs.map((tx) => {
                          const FCFG: Record<string, { emoji: string; label: string; amtCls: string }> = {
                            voa_agent_fee:  { emoji: "🛂", label: "Lapangan VOA",   amtCls: "text-indigo-700" },
                            field_agent_fee:{ emoji: "📋", label: "Agent Lapangan", amtCls: "text-sky-700" },
                            pelaksana_fee:  { emoji: "🎓", label: "Pelaksana Visa", amtCls: "text-purple-700" },
                            kurir_fee:      { emoji: "🚗", label: "Kurir",          amtCls: "text-amber-700" },
                            operational_fee:{ emoji: "⚙️", label: "Operasional",    amtCls: "text-teal-700" },
                          };
                          const cfg = FCFG[tx.type] ?? FCFG.voa_agent_fee;
                          const idMatch = tx.description.match(/#([a-f0-9-]{8,36})/i);
                          const shortId = idMatch?.[1] ?? null;
                          const linkedOrder = shortId ? orders.find((o) => o.id.startsWith(shortId) || o.id === shortId) : null;
                          const clientName = linkedOrder?.clientId ? clientMap.get(linkedOrder.clientId)?.name : null;
                          return (
                            <div key={tx.id} className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={() => linkedOrder && navigate(`/orders/detail/${linkedOrder.id}`)}>
                              <div className="h-9 w-9 rounded-lg bg-purple-50 border border-purple-100 flex items-center justify-center shrink-0 text-base">{cfg.emoji}</div>
                              <div className="flex-1 min-w-0">
                                {clientName && <p className="text-[12px] font-bold text-[#0f1c3f] truncate">{clientName}</p>}
                                <p className="text-[11px] text-slate-400 truncate">{tx.description}</p>
                                <p className="text-[10px] text-slate-400 mt-0.5">{cfg.label} · {fmtDateTime(tx.createdAt)}</p>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {isOwner && (
                                  <button onClick={(e) => { e.stopPropagation(); setDeletingTx(tx); }} className="h-7 w-7 rounded-lg flex items-center justify-center text-slate-300 hover:text-red-600 hover:bg-red-50 transition-colors">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                                <p className={`text-[13px] font-extrabold font-mono ${cfg.amtCls}`}>+{fmtIDR(tx.amountIDR)}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <button onClick={() => navigate("/agent-center", { state: { focusAgent: agentId, tab: "direktori" } })} className="w-full flex items-center justify-center gap-2 rounded-xl border border-sky-200 bg-sky-50 py-3 text-[12px] font-semibold text-sky-700" style={{ WebkitTapHighlightColor: "transparent" }}>
                    <Wallet className="h-3.5 w-3.5" />Kelola Wallet di Agent Center<ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {/* Informasi tab */}
              {tab === "informasi" && (
                <div className="space-y-3">
                  <div className="bg-white rounded-2xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-100 bg-[#F0F4FB]"><p className="text-[13px] font-extrabold text-[#0f1c3f]">Informasi Agen</p></div>
                    <div className="divide-y divide-slate-50">
                      {[
                        { label: "Nama Lengkap",    value: agent.displayName,                                      icon: Users },
                        { label: "Email",            value: agent.email,                                            icon: Mail },
                        { label: "Role",             value: agent.role === "agent" ? "Mitra Agen" : agent.role,    icon: Crown },
                        { label: "Bergabung",        value: fmtDate(agent.createdAt),                              icon: Calendar },
                        { label: "Total Poin",       value: `${totalPoints.toLocaleString("id-ID")} poin`,         icon: Star },
                        { label: "Level / Tier",     value: `${tier.emoji} ${tier.label}`,                         icon: Trophy },
                        { label: "Rank Leaderboard", value: rank ? `#${rank}` : "Belum ada data",                  icon: BarChart3 },
                      ].map(({ label, value, icon: Icon }) => (
                        <div key={label} className="flex items-center gap-3 px-4 py-3">
                          <div className="h-8 w-8 rounded-xl bg-[#F0F4FB] flex items-center justify-center shrink-0"><Icon className="h-4 w-4 text-slate-500" /></div>
                          <div className="flex-1">
                            <p className="text-[10px] text-slate-400 uppercase tracking-wide">{label}</p>
                            <p className="text-[13px] font-semibold text-[#0f1c3f] mt-0.5">{value}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => navigate("/agent-center")}>
                      <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Kembali
                    </Button>
                    <Button size="sm" className="flex-1 bg-[#0a2472] hover:bg-[#051650] text-white" onClick={() => navigate("/agent-center", { state: { focusAgent: agentId } })}>
                      <BarChart3 className="h-3.5 w-3.5 mr-1" /> Lihat Analitik
                    </Button>
                  </div>
                </div>
              )}

            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          DESKTOP LAYOUT  (hidden md:block)
      ═══════════════════════════════════════════════════════════════ */}
      <div className="hidden md:block px-6 py-5 max-w-[1440px] mx-auto">
        {/* Back nav */}
        <button
          onClick={() => navigate("/agent-center")}
          className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors mb-5"
        >
          <ArrowLeft className="h-4 w-4" /> Kembali ke Agent Center
        </button>

      {/* ── Header Card ── */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="rounded-2xl bg-white border border-slate-200 p-6 mb-5 shadow-sm"
      >
        <div className="flex items-start gap-5">
          {/* Avatar */}
          <div className="relative shrink-0">
            {canEdit ? (
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                disabled={photoUploading}
                className="relative group cursor-pointer disabled:cursor-default"
                title="Klik untuk ganti foto"
              >
                <div className="h-20 w-20 rounded-2xl bg-blue-600 border-2 border-blue-700 overflow-hidden flex items-center justify-center shadow-md">
                  {agentPhotoUrl ? (
                    <img src={agentPhotoUrl} alt="foto" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-3xl font-extrabold text-white">
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
              <div className="h-20 w-20 rounded-2xl bg-blue-600 border-2 border-blue-700 overflow-hidden flex items-center justify-center shadow-md">
                {agentPhotoUrl ? (
                  <img src={agentPhotoUrl} alt="foto" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-3xl font-extrabold text-white">
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

          {/* Agent info */}
          <div className="flex-1 min-w-0">
            {isEditMode ? (
              <div className="space-y-2">
                <div>
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Nama Lengkap</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Nama lengkap"
                    className="mt-0.5 w-full max-w-xs rounded-lg border border-input text-sm font-semibold px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Email</label>
                  <input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    placeholder="email@example.com"
                    className="mt-0.5 w-full max-w-xs rounded-lg border border-input text-sm px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => void handleSaveProfile()}
                    disabled={isSaving}
                    className="flex items-center gap-1.5 bg-[#0a2472] text-white text-[11px] font-bold px-4 py-1.5 rounded-lg hover:bg-[#051650] transition-colors disabled:opacity-60"
                  >
                    {isSaving ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                    Simpan
                  </button>
                  <button
                    onClick={() => { setIsEditMode(false); setEditName(agent.displayName); setEditEmail(agent.email); }}
                    disabled={isSaving}
                    className="flex items-center gap-1.5 bg-muted text-muted-foreground text-[11px] font-semibold px-4 py-1.5 rounded-lg hover:bg-muted/80 transition-colors border"
                  >
                    <X className="h-3 w-3" /> Batal
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <h1 className="text-xl font-extrabold text-[#0f1c3f]">{agent.displayName}</h1>
                  <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">
                    {tier.emoji} {tier.label}
                  </span>
                  <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                    ● Aktif
                  </span>
                </div>
                <p className="text-[12px] text-muted-foreground mb-2">Bergabung {fmtDate(agent.createdAt)}</p>
                <div className="flex items-center gap-4 flex-wrap">
                  <span className="flex items-center gap-1.5 text-[12px] text-slate-600">
                    <Mail className="h-3.5 w-3.5 text-slate-400" />{agent.email}
                  </span>
                  {agentPhoneWa && (
                    <span className="flex items-center gap-1.5 text-[12px] text-slate-600">
                      <Phone className="h-3.5 w-3.5 text-slate-400" />{agentPhoneWa}
                    </span>
                  )}
                  <span className="flex items-center gap-1.5 text-[12px] text-slate-600">
                    <MapPin className="h-3.5 w-3.5 text-slate-400" />Indonesia
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Action buttons */}
          {!isEditMode && (
            <div className="shrink-0 flex items-center gap-2">
              {canEdit && (
                <button
                  onClick={() => { setEditName(agent.displayName); setEditEmail(agent.email); setIsEditMode(true); }}
                  className="flex items-center gap-1.5 bg-[#0a2472] text-white text-[12px] font-semibold px-4 py-2 rounded-xl hover:bg-[#051650] transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5" />Edit Profil
                </button>
              )}
              <button className="h-9 w-9 rounded-xl border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition-colors">
                <MoreVertical className="h-4 w-4 text-slate-500" />
              </button>
            </div>
          )}
        </div>
      </motion.div>

      {/* ── Tab Bar (underline style) ── */}
      <div className="flex items-center gap-1 border-b border-slate-200 mb-6 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-semibold whitespace-nowrap border-b-2 transition-all ${
              tab === t.key
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
            {t.key === "misi" && pendingCount > 0 && (
              <span className="bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Two-column: Main content + Right sidebar ── */}
      <div className="grid grid-cols-[1fr_300px] xl:grid-cols-[1fr_320px] gap-5 items-start">

        {/* LEFT: Tab content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="min-w-0 space-y-5"
          >
          {/* ── OVERVIEW (Ringkasan) ── */}
          {tab === "overview" && (
            <div className="space-y-5">
              {/* 5 KPI Cards */}
              <div className="grid grid-cols-5 gap-3">
                {(() => {
                  const growthPct = (cur: number, prev: number) =>
                    prev === 0 ? (cur > 0 ? 100 : 0) : Math.round(((cur - prev) / prev) * 100);
                  const GBadge = ({ cur, prev }: { cur: number; prev: number }) => {
                    const pct = growthPct(cur, prev);
                    if (pct > 0) return (
                      <span className="flex items-center gap-0.5 text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">↑ {pct}%</span>
                    );
                    if (pct < 0) return (
                      <span className="flex items-center gap-0.5 text-[10px] font-semibold text-red-500 bg-red-50 px-1.5 py-0.5 rounded-full">↓ {Math.abs(pct)}%</span>
                    );
                    return <span className="text-[10px] text-muted-foreground">—</span>;
                  };
                  const km = kpiMonthly;
                  return [
                    { label: "TOTAL ORDER", value: String(agentOrders.length), curV: km.cur.orders, prevV: km.prev.orders, icon: ShoppingBag, iconBg: "bg-violet-100", iconColor: "text-violet-600" },
                    { label: "TOTAL KLIEN", value: String(agentClients.length), curV: km.cur.clients, prevV: km.prev.clients, icon: Users, iconBg: "bg-sky-100", iconColor: "text-sky-600" },
                    { label: "TOTAL REVENUE", value: fmtRevCompact(totalRevenue), curV: km.cur.revenue, prevV: km.prev.revenue, icon: TrendingUp, iconBg: "bg-emerald-100", iconColor: "text-emerald-600" },
                    { label: "TOTAL KOMISI", value: fmtRevCompact(bd.totalCredit), curV: km.cur.komisi, prevV: km.prev.komisi, icon: Coins, iconBg: "bg-amber-100", iconColor: "text-amber-600" },
                    { label: "NET PROFIT AGENCY", value: fmtRevCompact(km.cur.profit), curV: km.cur.profit, prevV: km.prev.profit, icon: Trophy, iconBg: "bg-blue-100", iconColor: "text-blue-600" },
                  ].map((s) => (
                    <div key={s.label} className="rounded-2xl bg-white border border-slate-200 p-4 shadow-sm">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{s.label}</span>
                        <div className={`h-7 w-7 rounded-lg ${s.iconBg} flex items-center justify-center`}>
                          <s.icon className={`h-3.5 w-3.5 ${s.iconColor}`} />
                        </div>
                      </div>
                      <p className="text-xl font-extrabold text-[#0f1c3f] font-mono leading-none mb-2">{s.value}</p>
                      <div className="flex items-center gap-1.5">
                        <GBadge cur={s.curV} prev={s.prevV} />
                        <span className="text-[10px] text-muted-foreground">dari bulan lalu</span>
                      </div>
                    </div>
                  ));
                })()}
              </div>

              {/* Charts Row */}
              <div className="grid grid-cols-[3fr_2fr] gap-4">
                {/* Performa Bulanan line chart */}
                <div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-sm font-bold text-[#0f1c3f]">Performa Bulanan</p>
                      <p className="text-[11px] text-muted-foreground">Revenue 6 bulan terakhir</p>
                    </div>
                    <span className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-blue-50 text-blue-600 border border-blue-100">6 Bulan Terakhir</span>
                  </div>
                  <ResponsiveContainer width="100%" height={180}>
                    <AreaChart data={monthlyRevenue} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="agentRevGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                      <YAxis tickFormatter={(v: number) => fmtRevCompact(v)} tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={48} />
                      <Tooltip
                        formatter={(v: number) => [fmtIDR(v), "Revenue"]}
                        labelFormatter={(l: string) => {
                          const m = monthlyRevenue.find((x) => x.label === l);
                          return m?.fullLabel ?? l;
                        }}
                        contentStyle={{ fontSize: 12, borderRadius: 10, border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}
                      />
                      <Area type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2.5} fill="url(#agentRevGrad)" dot={{ fill: "#3b82f6", r: 3 }} activeDot={{ r: 5 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {/* Distribusi Revenue per Kategori pie chart */}
                <div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-sm">
                  <div className="mb-3">
                    <p className="text-sm font-bold text-[#0f1c3f]">Distribusi Revenue per Kategori</p>
                    <p className="text-[11px] text-muted-foreground">Total: {fmtRevCompact(revenueByType.total)}</p>
                  </div>
                  {revenueByType.total === 0 ? (
                    <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">Belum ada data</div>
                  ) : (
                    <div className="flex items-start gap-3">
                      <div className="shrink-0">
                        <ResponsiveContainer width={120} height={120}>
                          <PieChart>
                            <Pie data={revenueByType.items} dataKey="value" cx="50%" cy="50%" innerRadius={32} outerRadius={52} paddingAngle={2}>
                              {revenueByType.items.map((entry, idx) => (
                                <Cell key={entry.type} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(v: number) => [fmtIDR(v), "Revenue"]} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex-1 min-w-0 space-y-1.5 pt-2">
                        {revenueByType.items.map((item, idx) => (
                          <div key={item.type} className="flex items-center justify-between gap-1">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }} />
                              <span className="text-[11px] text-slate-600 truncate">{item.label}</span>
                            </div>
                            <span className="text-[11px] font-bold text-slate-700 shrink-0">{item.pct}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Klien Paling Menguntungkan */}
              <div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-sm font-bold text-[#0f1c3f]">Klien Paling Menguntungkan</p>
                    <p className="text-[11px] text-muted-foreground">Berdasarkan total revenue</p>
                  </div>
                  <button onClick={() => navigate("/clients")} className="flex items-center gap-1 text-[12px] font-semibold text-blue-600 hover:underline">
                    Lihat Semua <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
                {byClientForAgent.length === 0 ? (
                  <p className="text-center text-[12px] text-muted-foreground py-4 italic">Belum ada data klien.</p>
                ) : (
                  <div className="grid grid-cols-3 gap-3">
                    {byClientForAgent.slice(0, 3).map((c, i) => {
                      const medal = ["🥇", "🥈", "🥉"][i];
                      const medalColors = ["bg-amber-50 border-amber-200", "bg-slate-50 border-slate-200", "bg-orange-50 border-orange-200"];
                      return (
                        <button
                          key={c.clientId}
                          onClick={() => c.clientId !== "__none" && navigate(`/clients/${c.clientId}`)}
                          className={`rounded-xl border p-4 text-left hover:shadow-sm transition-all ${medalColors[i]}`}
                        >
                          <div className="text-xl mb-2">{medal}</div>
                          <p className="text-[12px] font-bold text-[#0f1c3f] truncate">{c.name}</p>
                          <p className="text-[13px] font-extrabold text-emerald-700 font-mono mt-1">{fmtRevCompact(c.revenue)}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{c.count} order</p>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Order Terbaru Table */}
              <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-[#0f1c3f]">Order Terbaru</p>
                    <p className="text-[11px] text-muted-foreground">{agentOrders.length} total order</p>
                  </div>
                  <button onClick={() => setTab("orders")} className="flex items-center gap-1 text-[12px] font-semibold text-blue-600 hover:underline">
                    Lihat Semua <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
                {agentOrders.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <ShoppingBag className="h-8 w-8 text-muted-foreground/20 mb-2" />
                    <p className="text-sm font-semibold text-muted-foreground">Belum ada order</p>
                  </div>
                ) : (
                  <table className="w-full">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        {["Kode Order", "Klien", "Paket / Layanan", "Tanggal", "Status", "Total", "Komisi"].map((h) => (
                          <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {[...agentOrders]
                        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                        .slice(0, 5)
                        .map((o) => {
                          const clientName = clientMap.get(o.clientId ?? "")?.name ?? "—";
                          const ordCode = `ORD-${o.id.slice(0, 8).toUpperCase()}`;
                          const statusCfg =
                            o.status === "Completed" ? { label: "Selesai", cls: "bg-emerald-100 text-emerald-700" }
                            : o.status === "Cancelled" ? { label: "Batal", cls: "bg-red-100 text-red-600" }
                            : { label: "Proses", cls: "bg-amber-100 text-amber-700" };
                          return (
                            <tr key={o.id} onClick={() => navigate(`/orders/detail/${o.id}`)} className="hover:bg-slate-50 cursor-pointer transition-colors">
                              <td className="px-4 py-3 text-[12px] font-mono font-semibold text-blue-600">{ordCode}</td>
                              <td className="px-4 py-3 text-[12px] font-medium text-[#0f1c3f] max-w-[140px] truncate">{clientName}</td>
                              <td className="px-4 py-3 text-[12px] text-slate-600">{ORDER_TYPE_LABEL[o.type as keyof typeof ORDER_TYPE_LABEL] ?? o.type}</td>
                              <td className="px-4 py-3 text-[11px] text-muted-foreground whitespace-nowrap">{fmtDate(o.createdAt)}</td>
                              <td className="px-4 py-3"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusCfg.cls}`}>{statusCfg.label}</span></td>
                              <td className="px-4 py-3 text-[12px] font-bold font-mono text-[#0f1c3f]">{fmtRevCompact(revenueIDR(o, egpRate))}</td>
                              <td className="px-4 py-3 text-[12px] font-bold font-mono text-emerald-700">+{fmtRevCompact(agentFeeFromMeta(o))}</td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* dead code removed */}
          {false && (
            <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: 0.08 }}
                className="hidden"
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
                  <p className="text-[10px] text-emerald-600 mt-0.5">{uniqueBonusOrderCount > 0 ? uniqueBonusOrderCount : orderBonusTxs.length} order selesai</p>
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
                <div className={`rounded-2xl border p-3 ${bd.netBalance >= 0 ? "border-sky-100 bg-sky-50" : "border-red-100 bg-red-50"}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-[10px] font-semibold uppercase tracking-wide ${bd.netBalance >= 0 ? "text-sky-700" : "text-red-700"}`}>Saldo Wallet</span>
                    <Wallet className={`h-3.5 w-3.5 ${bd.netBalance >= 0 ? "text-sky-500" : "text-red-500"}`} />
                  </div>
                  <p className={`text-xl font-extrabold font-mono ${bd.netBalance >= 0 ? "text-sky-800" : "text-red-700"}`}>
                    {fmtIDR(bd.netBalance)}
                  </p>
                  <p className={`text-[10px] mt-0.5 ${bd.netBalance >= 0 ? "text-sky-600" : "text-red-600"}`}>
                    Cair {fmtIDR(bd.totalPaidOut)}
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
                      {(["order_bonus", "voa_agent_fee", "field_agent_fee", "kurir_fee", "pelaksana_fee", "operational_fee", "mission_conversion", "mission_fee", "adjustment", "payout"] as const).map((type) => {
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
                      const isOrphan = ordersLoaded && shortId !== null && linkedOrder === null;
                      return (
                        <div key={tx.id} className={`flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors ${isOrphan ? "opacity-70" : ""}`}>
                          <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${isOrphan ? "bg-orange-50 border border-orange-100" : "bg-emerald-50 border border-emerald-100"}`}>
                            {isOrphan
                              ? <AlertTriangle className="h-4 w-4 text-orange-500" />
                              : <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                            }
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
                              {isOrphan && (
                                <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 flex items-center gap-0.5">
                                  <AlertTriangle className="h-2.5 w-2.5" />
                                  Order dihapus
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
                        {uniqueFieldOrderCount > 0 ? uniqueFieldOrderCount : fieldCommTxs.length} penugasan
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
                        const isOrphan = ordersLoaded && shortId !== null && linkedOrder === null;
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
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${cfg.badgeCls}`}>
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
                                {isOrphan && (
                                  <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 flex items-center gap-0.5">
                                    <AlertTriangle className="h-2.5 w-2.5" />
                                    Order dihapus
                                  </span>
                                )}
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
                      .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
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

        {/* RIGHT SIDEBAR */}
        <div className="space-y-4 sticky top-6">

          {/* Informasi Singkat */}
          <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
              <p className="text-[13px] font-bold text-[#0f1c3f]">Informasi Singkat</p>
            </div>
            <div className="divide-y divide-slate-50">
              {[
                { label: "ID Agent", value: `AGT-${(agentId ?? "").slice(-4).toUpperCase()}` },
                { label: "Level", value: `${tier.emoji} ${tier.label}` },
                { label: "Status", value: null, isStatus: true },
                { label: "Email", value: agent.email },
                { label: "No. Telepon", value: agentPhoneWa ?? "—" },
                { label: "Bergabung", value: fmtDate(agent.createdAt) },
              ].map(({ label, value, isStatus }) => (
                <div key={label} className="flex items-center justify-between gap-2 px-4 py-2.5">
                  <span className="text-[11px] text-muted-foreground shrink-0">{label}</span>
                  {isStatus ? (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">● Aktif</span>
                  ) : (
                    <span className="text-[11px] font-semibold text-[#0f1c3f] text-right truncate max-w-[150px]">{value}</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Pencapaian & Badge */}
          <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <p className="text-[13px] font-bold text-[#0f1c3f]">Pencapaian & Badge</p>
              <button className="text-[11px] font-semibold text-blue-600 hover:underline flex items-center gap-0.5">
                Lihat Semua <ChevronRight className="h-3 w-3" />
              </button>
            </div>
            <div className="divide-y divide-slate-50">
              {achievements.map((a) => (
                <div key={a.id} className="flex items-start gap-2.5 px-4 py-2.5">
                  <div className={`h-8 w-8 rounded-xl border flex items-center justify-center text-base shrink-0 ${a.unlocked ? a.color : "bg-slate-50 border-slate-200 grayscale opacity-50"}`}>
                    {a.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[12px] font-bold ${a.unlocked ? "text-[#0f1c3f]" : "text-muted-foreground"}`}>{a.label}</p>
                    <p className="text-[10px] text-muted-foreground leading-snug">{a.desc}</p>
                  </div>
                  {a.unlocked && <BadgeCheck className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />}
                </div>
              ))}
            </div>
          </div>

          {/* Aktivitas Terbaru */}
          <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <p className="text-[13px] font-bold text-[#0f1c3f]">Aktivitas Terbaru</p>
              <button onClick={() => setTab("orders")} className="text-[11px] font-semibold text-blue-600 hover:underline flex items-center gap-0.5">
                Lihat Semua <ChevronRight className="h-3 w-3" />
              </button>
            </div>
            {recentActivities.length === 0 ? (
              <p className="px-4 py-5 text-[11px] text-muted-foreground text-center italic">Belum ada aktivitas tercatat.</p>
            ) : (
              <div className="divide-y divide-slate-50">
                {recentActivities.map((act) => (
                  <div key={act.id} className="flex items-start gap-2.5 px-4 py-2.5">
                    <div className="h-7 w-7 rounded-lg bg-slate-100 flex items-center justify-center text-sm shrink-0">{act.icon}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-semibold text-[#0f1c3f] truncate">{act.title}</p>
                      {act.amount && <p className={`text-[10px] font-bold ${act.amtColor}`}>{act.amount}</p>}
                      <p className="text-[10px] text-muted-foreground">{act.date}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Catatan Pribadi */}
          <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <p className="text-[13px] font-bold text-[#0f1c3f]">Catatan Pribadi</p>
              {canEdit && (
                <button
                  onClick={() => setAddingNote((v) => !v)}
                  className="flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:underline"
                >
                  <Plus className="h-3 w-3" /> Tambah
                </button>
              )}
            </div>
            {addingNote && canEdit && (
              <div className="px-4 pt-3 pb-2 border-b border-slate-100 bg-blue-50/50">
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Tambahkan catatan..."
                  rows={2}
                  className="w-full text-[12px] border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white resize-none"
                />
                <div className="flex gap-1.5 mt-1.5">
                  <button
                    onClick={handleAddNote}
                    disabled={!newNote.trim()}
                    className="text-[11px] font-semibold px-3 py-1 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    Simpan
                  </button>
                  <button
                    onClick={() => { setAddingNote(false); setNewNote(""); }}
                    className="text-[11px] font-semibold px-3 py-1 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                  >
                    Batal
                  </button>
                </div>
              </div>
            )}
            {notes.length === 0 && !addingNote ? (
              <p className="px-4 py-5 text-[11px] text-muted-foreground text-center italic">Belum ada catatan.</p>
            ) : (
              <div className="divide-y divide-slate-50">
                {notes.slice(0, 3).map((n) => (
                  <div key={n.id} className="px-4 py-3">
                    <p className="text-[12px] text-[#0f1c3f]">{n.text}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">{n.createdAt}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>{/* end right sidebar */}

      </div>{/* end 2-column grid */}

      </div>{/* end desktop container */}

      {/* ── Delete Commission Confirmation Dialog (shared mobile + desktop) ── */}
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
    </>
  );
}
