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
import { revenueIDR, fmtIDR } from "@/lib/profit";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { uploadAvatar, savePhotoUrl } from "@/lib/avatarStorage";
import { supabase } from "@/lib/supabase";

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

type Tab = "overview" | "misi" | "orders" | "informasi";

const TABS: { key: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "overview", label: "Ringkasan", icon: BarChart3 },
  { key: "misi", label: "Misi", icon: Target },
  { key: "orders", label: "Order", icon: ShoppingBag },
  { key: "informasi", label: "Informasi", icon: Users },
];

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AgentProfileOwnerView() {
  const { agentId } = useParams<{ agentId: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const listMembers = useAuthStore((s) => s.listMembers);
  const { orders, fetchOrders } = useOrdersStore();
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
  const [agentPhoneWa, setAgentPhoneWa] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [isSaving, setIsSaving] = useState(false);
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
      } catch (err) {
        console.warn("[AgentProfileOwnerView] load error:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [agentId, agencyId]); // eslint-disable-line react-hooks/exhaustive-deps

  const agentOrders = useMemo(
    () => orders.filter((o) => o.createdByAgent === agentId),
    [orders, agentId],
  );

  const agentClients = useMemo(
    () => clients.filter((c) => c.createdByAgent === agentId),
    [clients, agentId],
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

  const totalRevenue = useMemo(
    () => agentOrders.reduce((s, o) => s + revenueIDR(o), 0),
    [agentOrders],
  );
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
                    <span className="text-2xl font-extrabold">
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
                  <span className="text-2xl font-extrabold">
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
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard
                  icon={ShoppingBag}
                  label="Total Order"
                  value={String(agentOrders.length)}
                  sub={`${agentOrders.filter((o) => o.status === "Completed").length} selesai`}
                  colorCls="text-violet-600"
                  bgCls="bg-violet-50 border-violet-100"
                />
                <StatCard
                  icon={TrendingUp}
                  label="Total Revenue"
                  value={fmtIDR(totalRevenue)}
                  sub="dari semua order"
                  colorCls="text-emerald-600"
                  bgCls="bg-emerald-50 border-emerald-100"
                />
                <StatCard
                  icon={Trophy}
                  label="Total Poin"
                  value={totalPoints.toLocaleString("id-ID")}
                  sub={`Tier ${tier.label}`}
                  colorCls="text-amber-600"
                  bgCls="bg-amber-50 border-amber-100"
                />
                <StatCard
                  icon={Crown}
                  label="Rank"
                  value={rank ? `#${rank}` : "—"}
                  sub="di leaderboard"
                  colorCls="text-sky-600"
                  bgCls="bg-sky-50 border-sky-100"
                />
              </div>

              {/* Summary stats */}
              <div className="rounded-2xl border bg-white overflow-hidden">
                <div className="p-4 grid grid-cols-2 gap-3">
                  {[
                    { label: "Total Klien", value: String(agentClients.length), color: "text-sky-700" },
                    { label: "Misi Selesai", value: String(submissions.filter((s) => s.status === "approved").length), color: "text-purple-700" },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="rounded-xl bg-secondary/30 border px-3 py-2.5">
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
                      <div className={`text-base font-bold font-mono mt-0.5 ${color}`}>{value}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recent orders */}
              {agentOrders.length > 0 && (
                <div className="rounded-2xl border bg-white overflow-hidden">
                  <div className="px-4 py-3 border-b flex items-center justify-between">
                    <p className="text-sm font-semibold">Order Terbaru</p>
                    <button
                      onClick={() => setTab("orders")}
                      className="flex items-center gap-1 text-[11px] text-primary font-semibold hover:underline"
                    >
                      Lihat semua <ChevronRight className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="divide-y">
                    {[...agentOrders]
                      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                      .slice(0, 3)
                      .map((o) => (
                        <div key={o.id} className="flex items-center gap-3 px-4 py-2.5">
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] font-medium truncate">
                              {o.clientName ?? o.type}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {fmtDate(o.createdAt)}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-[12px] font-mono font-semibold">
                              {fmtIDR(revenueIDR(o))}
                            </p>
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                              o.status === "Completed"
                                ? "bg-emerald-100 text-emerald-700"
                                : o.status === "Cancelled"
                                ? "bg-red-100 text-red-600"
                                : "bg-amber-100 text-amber-700"
                            }`}>
                              {o.status}
                            </span>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
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
                <div className="rounded-2xl border bg-white overflow-hidden">
                  <div className="px-4 py-3 border-b flex items-center justify-between">
                    <p className="text-sm font-semibold">
                      Daftar Order ({agentOrders.length})
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[12px]">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          {["Klien / Tipe", "Tanggal", "Status", "Revenue"].map((h) => (
                            <th
                              key={h}
                              className="text-left font-semibold py-2 px-4 text-[11px] text-muted-foreground uppercase tracking-wide whitespace-nowrap"
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {[...agentOrders]
                          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                          .map((o) => (
                            <tr
                              key={o.id}
                              onClick={() => navigate(`/orders/detail/${o.id}`)}
                              className="hover:bg-muted/20 cursor-pointer transition-colors"
                            >
                              <td className="py-2.5 px-4">
                                <p className="font-medium">{o.clientName ?? "—"}</p>
                                <p className="text-[10px] text-muted-foreground capitalize">{o.type}</p>
                              </td>
                              <td className="py-2.5 px-4 text-muted-foreground whitespace-nowrap">
                                {fmtDate(o.createdAt)}
                              </td>
                              <td className="py-2.5 px-4">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                  o.status === "Completed"
                                    ? "bg-emerald-100 text-emerald-700"
                                    : o.status === "Cancelled"
                                    ? "bg-red-100 text-red-600"
                                    : "bg-amber-100 text-amber-700"
                                }`}>
                                  {o.status}
                                </span>
                              </td>
                              <td className="py-2.5 px-4 font-mono font-semibold whitespace-nowrap">
                                {fmtIDR(revenueIDR(o))}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
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
