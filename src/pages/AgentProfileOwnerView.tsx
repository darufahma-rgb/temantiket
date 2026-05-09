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
  Wallet, ArrowDownToLine, Coins, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useAuthStore, type MemberInfo } from "@/store/authStore";
import { useOrdersStore } from "@/store/ordersStore";
import { useClientsStore } from "@/store/clientsStore";
import {
  listAgentPoints, sumPointsByAgent, type AgentPoint,
} from "@/features/agentPoints/agentPointsRepo";
import {
  listMissions, listMySubmissions, reviewSubmission,
} from "@/features/missions/missionsRepo";
import type { DailyMission, MissionSubmission, MissionStatus } from "@/features/missions/types";
import { getTierInfo } from "@/features/agentPoints/agentTiers";
import { sumMissionPointsByAgent } from "@/features/missions/missionsRepo";
import { fmtIDR } from "@/lib/profit";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { uploadAvatar, savePhotoUrl } from "@/lib/avatarStorage";
import { uploadCardBack, saveCardBackUrl, loadCardBackUrl } from "@/lib/cardBackStorage";
import { supabase } from "@/lib/supabase";
import {
  pullWalletTxs, walletBalance, addWalletTx, type WalletTransaction,
} from "@/lib/agentWallet";
import { getCommissionForOrderType } from "@/lib/productCommissions";
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
  const [completingOrderId, setCompletingOrderId] = useState<string | null>(null);
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
          listAgentPoints(),
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
    void loadCardBackUrl(agentId, agencyId).then((url) => {
      if (url) setCardBackUrl(url);
    });
  }, [agentId, agencyId]);

  const handleCardBackFile = async (file: File) => {
    if (!agentId || !agencyId || !file.type.startsWith("image/")) return;
    setCardBackUploading(true);
    try {
      const url = await uploadCardBack(agentId, file);
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

  const totalKomisi = useMemo(
    () => agentOrders.reduce((s, o) => s + getCommissionForOrderType(
      o.type as "umrah" | "flight" | "visa_voa" | "visa_student",
    ), 0),
    [agentOrders],
  );

  const feeStats = useMemo(() => {
    const total = agentOrders.reduce(
      (s, o) => s + (Number((o.metadata as Record<string, unknown>).agentFee) || 0), 0,
    );
    const paid = agentOrders
      .filter((o) => o.status === "Paid" || o.status === "Completed")
      .reduce((s, o) => s + (Number((o.metadata as Record<string, unknown>).agentFee) || 0), 0);
    return { total, paid, pending: total - paid };
  }, [agentOrders]);

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
  const walletBal = useMemo(() => walletBalance(walletTxs), [walletTxs]);
  const totalCommissionCredited = useMemo(
    () => orderBonusTxs.reduce((s, t) => s + t.amountIDR, 0),
    [orderBonusTxs],
  );
  const payoutTxs = useMemo(
    () => walletTxs.filter((t) => t.type === "payout"),
    [walletTxs],
  );
  const totalPaidOut = useMemo(
    () => payoutTxs.reduce((s, t) => s + Math.abs(t.amountIDR), 0),
    [payoutTxs],
  );

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
      await patchOrder(orderId, { status: "Completed" });

      const feeAmount =
        Number((order.metadata as Record<string, unknown>).agentFee ?? 0) ||
        getCommissionForOrderType(order.type);

      if (feeAmount > 0) {
        const orderLabel = ORDER_TYPE_LABEL[order.type];
        const orderId8 = order.id.slice(0, 8);
        const clientName = clientMap.get(order.clientId ?? "")?.name;
        addWalletTx(agentId, {
          agentId,
          type: "order_bonus",
          pointsDelta: 0,
          amountIDR: feeAmount,
          description: `Komisi order ${orderLabel} #${orderId8}${clientName ? ` — ${clientName}` : order.title ? ` — ${order.title}` : ""}`,
          createdBy: ownerId,
        });
      }

      // Award 20 poin ke agen via server endpoint (perlu service role key)
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
          // Refresh points display
          const fresh = await listAgentPoints();
          setAllPoints(fresh);
          toast.success(feeAmount > 0 ? `Order selesai! Komisi dicatat: ${fmtIDR(feeAmount)}` : "Order ditandai Selesai.", {
            description: `+20 poin diberikan ke agen 🎉`,
            duration: 5000,
          });
        } else {
          if (feeAmount > 0) {
            toast.success(`Order selesai! Komisi dicatat: ${fmtIDR(feeAmount)}`, {
              description: "Wallet agen diperbarui.",
              duration: 4500,
            });
          } else {
            toast.success("Order ditandai Selesai.");
          }
        }
      } catch {
        if (feeAmount > 0) {
          toast.success(`Order selesai! Komisi dicatat: ${fmtIDR(feeAmount)}`, {
            description: "Wallet agen diperbarui.",
            duration: 4500,
          });
        } else {
          toast.success("Order ditandai Selesai.");
        }
      }

      void pullWalletTxs(agentId).then(setWalletTxs);
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
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-5">
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
                  { icon: TrendingUp,  label: "Total Komisi", value: fmtIDR(feeStats.total || totalKomisi), sub: "akumulasi fee agen",                  color: "text-emerald-600",bg: "bg-emerald-50 border-emerald-100" },
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

              {/* Fee Komisi Akumulasi */}
              <div className="rounded-2xl border border-blue-100 bg-white overflow-hidden">
                <div className="px-4 py-3 border-b border-blue-100 bg-blue-50 flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-blue-500" />
                  <div>
                    <p className="text-sm font-semibold">Akumulasi Fee Komisi</p>
                    <p className="text-[11px] text-muted-foreground">Total fee yang dikumpulkan dari semua order</p>
                  </div>
                </div>
                <div className="p-4 space-y-3">
                  <div className="text-center py-1">
                    <div className="text-xl md:text-3xl font-extrabold font-mono">{fmtIDR(feeStats.total || totalKomisi)}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">total akumulasi fee</div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3 flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <div className="text-[10px] text-emerald-700 font-semibold uppercase tracking-wide">Terbayar</div>
                        <div className="text-sm font-bold font-mono text-emerald-700">{fmtIDR(feeStats.paid)}</div>
                        <div className="text-[10px] text-muted-foreground">order Paid/Completed</div>
                      </div>
                    </div>
                    <div className="rounded-xl bg-amber-50 border border-amber-100 p-3 flex items-start gap-2">
                      <Clock className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <div className="text-[10px] text-amber-700 font-semibold uppercase tracking-wide">Belum Cair</div>
                        <div className="text-sm font-bold font-mono text-amber-700">{fmtIDR(feeStats.pending)}</div>
                        <div className="text-[10px] text-muted-foreground">order belum selesai</div>
                      </div>
                    </div>
                  </div>
                  {(feeStats.total === 0 && totalKomisi === 0) && (
                    <p className="text-center text-[11px] text-muted-foreground italic py-1">
                      Belum ada fee. Agen belum memiliki order dengan fee komisi.
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
                                +{fmtIDR(getCommissionForOrderType(o.type as "umrah" | "flight" | "visa_voa" | "visa_student"))}
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

              {/* Summary strip */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">Total Dikreditkan</span>
                    <Coins className="h-3.5 w-3.5 text-emerald-500" />
                  </div>
                  <p className="text-base font-extrabold font-mono text-emerald-800">{fmtIDR(totalCommissionCredited)}</p>
                  <p className="text-[10px] text-emerald-600 mt-0.5">{orderBonusTxs.length} order selesai</p>
                </div>
                <div className="rounded-2xl border border-orange-100 bg-orange-50 p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-orange-700">Total Dicairkan</span>
                    <ArrowDownToLine className="h-3.5 w-3.5 text-orange-500" />
                  </div>
                  <p className="text-base font-extrabold font-mono text-orange-800">{fmtIDR(totalPaidOut)}</p>
                  <p className="text-[10px] text-orange-600 mt-0.5">{payoutTxs.length} pencairan</p>
                </div>
                <div className={`rounded-2xl border p-3 col-span-2 md:col-span-2 ${walletBal.netIDR >= 0 ? "border-sky-100 bg-sky-50" : "border-red-100 bg-red-50"}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-[10px] font-semibold uppercase tracking-wide ${walletBal.netIDR >= 0 ? "text-sky-700" : "text-red-700"}`}>Saldo Wallet Saat Ini</span>
                    <Wallet className={`h-3.5 w-3.5 ${walletBal.netIDR >= 0 ? "text-sky-500" : "text-red-500"}`} />
                  </div>
                  <p className={`text-xl font-extrabold font-mono ${walletBal.netIDR >= 0 ? "text-sky-800" : "text-red-700"}`}>
                    {fmtIDR(walletBal.netIDR)}
                  </p>
                  <p className={`text-[10px] mt-0.5 ${walletBal.netIDR >= 0 ? "text-sky-600" : "text-red-600"}`}>
                    Kredit {fmtIDR(walletBal.totalCreditIDR)} − Cair {fmtIDR(walletBal.totalDebitIDR)}
                  </p>
                </div>
              </div>

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
                          <div className="text-right shrink-0">
                            <p className="text-[13px] font-extrabold font-mono text-emerald-700">
                              +{fmtIDR(tx.amountIDR)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

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
    </div>
  );
}
