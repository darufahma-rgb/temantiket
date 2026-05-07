import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Target, Clock, CheckCircle2, XCircle, Upload, Star, Send, Zap, History, Trophy, Wallet,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { format, isPast, formatDistanceToNow } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { MissionConfetti } from "@/components/MissionConfetti";
import {
  listMissions, listMySubmissions, submitMission, uploadProofImage,
} from "./missionsRepo";
import type { DailyMission, MissionSubmission } from "./types";
import { onMissionsChanged } from "@/lib/supabaseRealtime";
import { pullMissionMeta, type MissionMetaMap } from "@/lib/missionMeta";

const fmtIDR = (v: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(v);

interface Props {
  agencyId: string;
  agentId: string;
}

type ActiveTab = "active" | "log";

type MissionState = "none" | "pending" | "approved" | "rejected";

const STATUS_CONFIG: Record<MissionState, {
  label: string; icon: React.ReactNode; cardCls: string; badge: string;
}> = {
  none:     { label: "Belum Selesai",     icon: <Clock className="w-4 h-4" />,        cardCls: "border-slate-200 bg-white",           badge: "bg-slate-100 text-slate-600" },
  pending:  { label: "Menunggu Validasi", icon: <Clock className="w-4 h-4" />,        cardCls: "border-amber-200 bg-amber-50/40",     badge: "bg-amber-100 text-amber-700" },
  approved: { label: "Selesai ✓",         icon: <CheckCircle2 className="w-4 h-4" />, cardCls: "border-emerald-200 bg-emerald-50/40", badge: "bg-emerald-100 text-emerald-700" },
  rejected: { label: "Ditolak",           icon: <XCircle className="w-4 h-4" />,      cardCls: "border-red-200 bg-red-50/30",         badge: "bg-red-100 text-red-600" },
};

// ── MissionCard ───────────────────────────────────────────────────────────────
interface MissionCardProps {
  mission: DailyMission;
  submission: MissionSubmission | undefined;
  agencyId: string;
  agentId: string;
  feeIDR: number;
  onSubmitDone: () => void;
  onNewApproval: () => void;
}

function MissionCard({ mission, submission, agencyId, agentId, feeIDR, onSubmitDone, onNewApproval }: MissionCardProps) {
  const state: MissionState = submission?.status ?? "none";
  const cfg = STATUS_CONFIG[state];
  const expired = isPast(new Date(mission.deadline));

  const [showForm, setShowForm] = useState(false);
  const [notes, setNotes] = useState("");
  const [imgFile, setImgFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const wasApproved = useRef(false);
  useEffect(() => {
    if (state === "approved" && !wasApproved.current) {
      wasApproved.current = true;
      onNewApproval();
    }
  }, [state, onNewApproval]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { toast.error("Ukuran file max 5MB"); return; }
    setImgFile(f);
    setPreview(URL.createObjectURL(f));
  }

  async function handleSubmit() {
    setUploading(true);
    let proofUrl: string | null = null;
    if (imgFile) {
      proofUrl = await uploadProofImage(agencyId, agentId, mission.id, imgFile);
      if (!proofUrl) toast.warning("Upload gambar gagal, submit tanpa bukti gambar.");
    }
    const result = await submitMission(agencyId, mission.id, agentId, mission.rewardPoints, proofUrl, notes);
    setUploading(false);
    if (result) {
      toast.success("Bukti misi dikirim! Tunggu validasi admin.");
      setShowForm(false); setNotes(""); setImgFile(null); setPreview(null);
      onSubmitDone();
    } else {
      toast.error("Gagal submit. Coba lagi.");
    }
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl border p-4 transition-colors ${cfg.cardCls}`}
    >
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
          state === "approved" ? "bg-emerald-100 text-emerald-600"
          : state === "pending" ? "bg-amber-100 text-amber-600"
          : "bg-sky-100 text-sky-600"
        }`}>
          <Target className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-slate-800 text-sm">{mission.title}</span>
            <span className={`inline-flex items-center gap-1 text-[10.5px] px-1.5 py-0.5 rounded-full font-semibold ${cfg.badge}`}>
              {cfg.icon} {cfg.label}
            </span>
            {feeIDR > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded-full font-semibold">
                <Wallet className="w-2.5 h-2.5" /> Fee {fmtIDR(feeIDR)}
              </span>
            )}
          </div>
          {mission.description && <p className="text-xs text-slate-500 mt-0.5">{mission.description}</p>}
          <div className="flex items-center gap-3 mt-1 text-xs text-slate-400 flex-wrap">
            <span className="flex items-center gap-1">
              <Star className="w-3 h-3 text-amber-400" />{mission.rewardPoints} poin
            </span>
            <span>{expired ? "Kedaluwarsa" : `Sisa ${formatDistanceToNow(new Date(mission.deadline), { locale: idLocale })}`}</span>
          </div>
        </div>
        {!expired && state === "none" && (
          <Button size="sm" className="shrink-0 h-8 bg-sky-600 hover:bg-sky-700 text-white text-xs px-3" onClick={() => setShowForm((v) => !v)}>
            <Send className="w-3.5 h-3.5 mr-1" /> Submit
          </Button>
        )}
        {!expired && state === "rejected" && (
          <Button size="sm" variant="outline" className="shrink-0 h-8 border-sky-300 text-sky-700 text-xs px-3" onClick={() => setShowForm((v) => !v)}>
            <Send className="w-3.5 h-3.5 mr-1" /> Coba Lagi
          </Button>
        )}
        {state === "approved" && (
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 15 }}
            className="shrink-0 flex flex-col items-end gap-1"
          >
            <span className="flex items-center gap-1 bg-emerald-500 text-white text-xs font-bold px-2.5 py-1 rounded-full">
              <Zap className="w-3 h-3" /> +{mission.rewardPoints} poin
            </span>
            {feeIDR > 0 && (
              <span className="flex items-center gap-1 bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
                <Wallet className="w-2.5 h-2.5" /> +{fmtIDR(feeIDR)}
              </span>
            )}
          </motion.div>
        )}
      </div>
      {state === "approved" && submission?.proofImageUrl && (
        <div className="mt-3">
          <img src={submission.proofImageUrl} alt="bukti" className="rounded-lg h-24 object-cover border border-emerald-200" />
        </div>
      )}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden mt-3 pt-3 border-t border-dashed space-y-2.5"
          >
            <div>
              <label className="text-xs text-slate-500 mb-1.5 block font-medium">Upload Bukti Gambar (opsional)</label>
              <div
                className="border-2 border-dashed border-slate-200 rounded-lg p-3 flex flex-col items-center gap-2 cursor-pointer hover:border-sky-300 hover:bg-sky-50/30 transition-colors"
                onClick={() => fileRef.current?.click()}
              >
                {preview
                  ? <img src={preview} alt="preview" className="h-28 rounded object-cover" />
                  : <><Upload className="w-6 h-6 text-slate-300" /><span className="text-xs text-slate-400">Klik untuk pilih foto bukti (max 5MB)</span></>
                }
              </div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
            </div>
            <Textarea
              placeholder="Catatan (opsional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="text-sm"
            />
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => { setShowForm(false); setNotes(""); setImgFile(null); setPreview(null); }}>Batal</Button>
              <Button size="sm" className="bg-sky-600 hover:bg-sky-700 text-white" disabled={uploading} onClick={handleSubmit}>
                {uploading ? "Mengirim…" : "Kirim Bukti"}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── MissionLog ───────────────────────────────────────────────────────────────
interface LogProps {
  allMissions: DailyMission[];
  submissions: MissionSubmission[];
  missionMeta: MissionMetaMap;
}

function MissionLog({ allMissions, submissions, missionMeta }: LogProps) {
  const history = useMemo(() => {
    return submissions
      .map((s) => {
        const m = allMissions.find((x) => x.id === s.missionId);
        return m ? { ...s, missionTitle: m.title, deadline: m.deadline } : null;
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b!.submittedAt).getTime() - new Date(a!.submittedAt).getTime()) as Array<MissionSubmission & { missionTitle: string; deadline: string }>;
  }, [allMissions, submissions]);

  const totalEarned = useMemo(
    () => submissions.filter((s) => s.status === "approved").reduce((sum, s) => sum + s.rewardPoints, 0),
    [submissions],
  );

  const totalFeeEarned = useMemo(
    () => submissions
      .filter((s) => s.status === "approved")
      .reduce((sum, s) => sum + (missionMeta[s.missionId]?.feeIDR ?? 0), 0),
    [submissions, missionMeta],
  );

  const STATUS_ROW: Record<string, { label: string; cls: string }> = {
    pending:  { label: "Menunggu",  cls: "bg-amber-100 text-amber-700" },
    approved: { label: "Disetujui", cls: "bg-emerald-100 text-emerald-700" },
    rejected: { label: "Ditolak",   cls: "bg-red-100 text-red-600" },
  };

  if (history.length === 0) {
    return (
      <div className="py-8 text-center text-slate-400 text-sm">
        Belum ada riwayat misi. Selesaikan misi aktif untuk mendapatkan poin!
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="flex-1 flex items-center gap-3 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2.5">
          <Trophy className="w-4 h-4 text-emerald-600 shrink-0" />
          <div>
            <p className="text-xs font-bold text-emerald-800">
              <span className="font-mono">{totalEarned}</span> poin earned
            </p>
            <p className="text-[10px] text-emerald-600">{history.filter((h) => h.status === "approved").length} misi selesai</p>
          </div>
        </div>
        {totalFeeEarned > 0 && (
          <div className="flex-1 flex items-center gap-3 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2.5">
            <Wallet className="w-4 h-4 text-emerald-600 shrink-0" />
            <div>
              <p className="text-xs font-bold text-emerald-800">{fmtIDR(totalFeeEarned)}</p>
              <p className="text-[10px] text-emerald-600">Total fee IDR</p>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-2">
        {history.map((h) => {
          const sts = STATUS_ROW[h.status] ?? STATUS_ROW.pending;
          const fee = missionMeta[h.missionId]?.feeIDR ?? 0;
          return (
            <div key={h.id} className="flex items-start gap-3 bg-white border rounded-xl p-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                h.status === "approved" ? "bg-emerald-100 text-emerald-600"
                : h.status === "pending" ? "bg-amber-100 text-amber-600"
                : "bg-red-100 text-red-500"
              }`}>
                <Target className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 leading-tight">{h.missionTitle}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {format(new Date(h.submittedAt), "d MMM yyyy, HH:mm", { locale: idLocale })}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1.5 shrink-0">
                <span className={`text-[10.5px] px-1.5 py-0.5 rounded-full font-semibold ${sts.cls}`}>
                  {sts.label}
                </span>
                {h.status === "approved" && (
                  <span className="flex items-center gap-0.5 text-[11px] font-bold text-emerald-700">
                    <Zap className="w-3 h-3" /> +{h.rewardPoints}
                  </span>
                )}
                {h.status === "approved" && fee > 0 && (
                  <span className="flex items-center gap-0.5 text-[10px] font-bold text-emerald-600">
                    <Wallet className="w-2.5 h-2.5" /> +{fmtIDR(fee)}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Widget ───────────────────────────────────────────────────────────────
export function AgentMissionWidget({ agencyId, agentId }: Props) {
  const [allMissions, setAllMissions] = useState<DailyMission[]>([]);
  const [submissions, setSubmissions] = useState<MissionSubmission[]>([]);
  const [missionMeta, setMissionMeta] = useState<MissionMetaMap>({});
  const [loading, setLoading] = useState(true);
  const [showConfetti, setShowConfetti] = useState(false);
  const [tab, setTab] = useState<ActiveTab>("active");
  const [isLive, setIsLive] = useState(false);

  const prevSubStatusRef = useRef<Map<string, string>>(new Map());

  const reload = useCallback(async (fromRealtime = false) => {
    const [m, s, meta] = await Promise.all([
      listMissions(agencyId),
      listMySubmissions(agencyId, agentId),
      pullMissionMeta(),
    ]);
    setAllMissions(m);
    setSubmissions(s);
    setMissionMeta(meta);
    setLoading(false);

    if (fromRealtime) {
      for (const sub of s) {
        const prev = prevSubStatusRef.current.get(sub.missionId);
        if (prev && prev !== sub.status) {
          const mission = m.find((x) => x.id === sub.missionId);
          const title = mission?.title ?? "Misi";
          if (sub.status === "approved") {
            const fee = meta[sub.missionId]?.feeIDR ?? 0;
            const feeLabel = fee > 0 ? ` + fee ${fmtIDR(fee)}` : "";
            toast.success(`🎉 "${title}" disetujui! +${sub.rewardPoints} poin${feeLabel}`, {
              duration: 5000,
            });
            setShowConfetti(true);
          } else if (sub.status === "rejected") {
            toast.error(`❌ "${title}" ditolak. Kamu bisa coba lagi.`, {
              duration: 5000,
            });
          }
        }
      }
    }

    const nextMap = new Map<string, string>();
    for (const sub of s) nextMap.set(sub.missionId, sub.status);
    prevSubStatusRef.current = nextMap;
  }, [agencyId, agentId]);

  useEffect(() => {
    if (!agencyId || !agentId) return;
    void reload(false);
  }, [agencyId, agentId, reload]);

  useEffect(() => {
    if (!agencyId || !agentId) return;
    setIsLive(true);
    const unsub = onMissionsChanged(() => { void reload(true); });
    return () => {
      unsub();
      setIsLive(false);
    };
  }, [agencyId, agentId, reload]);

  const activeMissions = useMemo(
    () => allMissions.filter((m) => {
      const notExpiredOrHasSub = !isPast(new Date(m.deadline)) || submissions.some((s) => s.missionId === m.id);
      if (!notExpiredOrHasSub) return false;
      const meta = missionMeta[m.id];
      if (!meta || meta.targetAgentIds === "all") return true;
      return (meta.targetAgentIds as string[]).includes(agentId);
    }),
    [allMissions, submissions, missionMeta, agentId],
  );

  const totalReward = submissions.filter((s) => s.status === "approved").reduce((sum, s) => sum + s.rewardPoints, 0);
  const pendingCount = submissions.filter((s) => s.status === "pending").length;
  const doneCount = submissions.filter((s) => s.status === "approved").length;
  const historyCount = submissions.length;

  if (loading) {
    return (
      <Card className="p-4 animate-pulse">
        <div className="h-5 bg-slate-100 rounded w-40 mb-3" />
        <div className="h-16 bg-slate-50 rounded" />
      </Card>
    );
  }

  if (allMissions.length === 0 && submissions.length === 0) return null;

  return (
    <>
      <MissionConfetti show={showConfetti} onDone={() => setShowConfetti(false)} />

      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-sky-100 rounded-lg flex items-center justify-center">
              <Target className="w-4 h-4 text-sky-600" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <p className="font-bold text-slate-800 text-sm leading-tight">Side Job Mission</p>
                {isLive && (
                  <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                    </span>
                    Live
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400">
                {activeMissions.filter((m) => !isPast(new Date(m.deadline))).length} misi aktif untukmu
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {doneCount > 0 && (
              <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}
                className="flex items-center gap-1 text-xs font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full"
              >
                <Zap className="w-3 h-3" /> +{totalReward} poin
              </motion.span>
            )}
            {pendingCount > 0 && (
              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">
                {pendingCount} menunggu
              </span>
            )}
          </div>
        </div>

        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
          {([
            { id: "active" as ActiveTab, label: "Misi Aktif", icon: <Target className="w-3.5 h-3.5" />, count: activeMissions.filter((m) => !isPast(new Date(m.deadline))).length },
            { id: "log"    as ActiveTab, label: "Riwayat",    icon: <History className="w-3.5 h-3.5" />, count: historyCount },
          ] as const).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-semibold transition-all ${
                tab === t.id ? "bg-white text-sky-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {t.icon} {t.label}
              <span className={`text-[10px] px-1 py-0.5 rounded-full font-bold ${tab === t.id ? "bg-sky-100 text-sky-700" : "bg-slate-200 text-slate-600"}`}>
                {t.count}
              </span>
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {tab === "active" && (
            <motion.div key="active" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
              {activeMissions.filter((m) => !isPast(new Date(m.deadline))).length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">Tidak ada misi aktif untukmu saat ini.</p>
              ) : (
                activeMissions
                  .filter((m) => !isPast(new Date(m.deadline)))
                  .map((m) => (
                    <MissionCard
                      key={m.id}
                      mission={m}
                      submission={submissions.find((s) => s.missionId === m.id)}
                      agencyId={agencyId}
                      agentId={agentId}
                      feeIDR={missionMeta[m.id]?.feeIDR ?? 0}
                      onSubmitDone={() => void reload(false)}
                      onNewApproval={() => setShowConfetti(true)}
                    />
                  ))
              )}
              {activeMissions.some((m) => submissions.some((s) => s.missionId === m.id && isPast(new Date(m.deadline)))) && (
                <p className="text-[10.5px] text-slate-400 text-center">Misi kedaluwarsa tersembunyi. Lihat di Riwayat.</p>
              )}
              <p className="text-[10.5px] text-slate-400 text-center">
                Selesaikan side job untuk poin ekstra + fee IDR!
              </p>
            </motion.div>
          )}

          {tab === "log" && (
            <motion.div key="log" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <MissionLog allMissions={allMissions} submissions={submissions} missionMeta={missionMeta} />
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </>
  );
}
