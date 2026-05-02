import { useEffect, useState } from "react";
import {
  Target, Plus, Trash2, CheckCircle2, XCircle, Clock, ChevronDown,
  ChevronUp, Upload, Star,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { format, isPast } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import {
  listMissions, createMission, deleteMission,
  listSubmissions, reviewSubmission,
} from "./missionsRepo";
import type { DailyMission, MissionSubmission } from "./types";

interface Props {
  agencyId: string;
  ownerId: string;
  agentNames: Map<string, string>;
}

const STATUS_LABEL: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
  pending:  { label: "Menunggu",  cls: "bg-amber-100 text-amber-700",   icon: <Clock className="w-3 h-3" /> },
  approved: { label: "Disetujui", cls: "bg-emerald-100 text-emerald-700", icon: <CheckCircle2 className="w-3 h-3" /> },
  rejected: { label: "Ditolak",   cls: "bg-red-100 text-red-600",       icon: <XCircle className="w-3 h-3" /> },
};

function deadlineDefault() {
  const d = new Date();
  d.setHours(23, 59, 0, 0);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 16);
}

export function MissionCreatorSection({ agencyId, ownerId, agentNames }: Props) {
  const [missions, setMissions] = useState<DailyMission[]>([]);
  const [submissions, setSubmissions] = useState<MissionSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedMission, setExpandedMission] = useState<string | null>(null);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [rewardPoints, setRewardPoints] = useState("20");
  const [deadline, setDeadline] = useState(deadlineDefault());
  const [saving, setSaving] = useState(false);

  async function reload() {
    setLoading(true);
    const [m, s] = await Promise.all([
      listMissions(agencyId),
      listSubmissions(agencyId),
    ]);
    setMissions(m);
    setSubmissions(s);
    setLoading(false);
  }

  useEffect(() => { void reload(); }, [agencyId]);

  async function handleCreate() {
    if (!title.trim()) { toast.error("Judul misi wajib diisi"); return; }
    if (!deadline) { toast.error("Deadline wajib diisi"); return; }
    const pts = parseInt(rewardPoints, 10);
    if (isNaN(pts) || pts < 1) { toast.error("Reward poin minimal 1"); return; }
    setSaving(true);
    const result = await createMission(
      agencyId,
      { title: title.trim(), description: description.trim(), rewardPoints: pts, deadline: new Date(deadline).toISOString() },
      ownerId,
    );
    setSaving(false);
    if (result) {
      toast.success("Misi berhasil dibuat!");
      setTitle(""); setDescription(""); setRewardPoints("20"); setDeadline(deadlineDefault());
      setShowForm(false);
      void reload();
    } else {
      toast.error("Gagal membuat misi. Cek SQL migration sudah dijalankan.");
    }
  }

  async function handleDelete(missionId: string) {
    if (!confirm("Hapus misi ini?")) return;
    const ok = await deleteMission(missionId);
    if (ok) { toast.success("Misi dihapus"); void reload(); }
    else toast.error("Gagal hapus misi");
  }

  async function handleReview(subId: string, status: "approved" | "rejected") {
    const ok = await reviewSubmission(subId, status, ownerId);
    if (ok) {
      toast.success(status === "approved" ? "Disetujui! Poin ditambahkan." : "Ditolak.");
      void reload();
    } else {
      toast.error("Gagal memperbarui status.");
    }
  }

  const missionSubs = (missionId: string) =>
    submissions.filter((s) => s.missionId === missionId);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="w-5 h-5 text-sky-600" />
          <h2 className="font-bold text-slate-800 text-lg">Misi Harian</h2>
          <span className="text-xs bg-sky-100 text-sky-700 px-2 py-0.5 rounded-full font-semibold">
            {missions.length} misi
          </span>
        </div>
        <Button
          size="sm"
          className="gap-1.5 bg-sky-600 hover:bg-sky-700 text-white"
          onClick={() => setShowForm((v) => !v)}
        >
          <Plus className="w-4 h-4" />
          Buat Misi
        </Button>
      </div>

      {/* Create form */}
      {showForm && (
        <Card className="p-4 border-sky-200 bg-sky-50/40 space-y-3">
          <p className="text-sm font-semibold text-sky-700">Buat Misi Baru</p>
          <div className="space-y-2">
            <Input
              placeholder="Judul Misi (contoh: Bagikan 3 Promo ke WA)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="bg-white"
            />
            <Textarea
              placeholder="Deskripsi / instruksi misi (opsional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="bg-white text-sm"
            />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Reward Poin</label>
                <div className="relative">
                  <Star className="absolute left-2.5 top-2.5 w-4 h-4 text-amber-400" />
                  <Input
                    type="number"
                    min={1}
                    value={rewardPoints}
                    onChange={(e) => setRewardPoints(e.target.value)}
                    className="pl-8 bg-white"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Deadline</label>
                <Input
                  type="datetime-local"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className="bg-white text-sm"
                />
              </div>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>Batal</Button>
            <Button
              size="sm"
              className="bg-sky-600 hover:bg-sky-700 text-white"
              disabled={saving}
              onClick={handleCreate}
            >
              {saving ? "Menyimpan…" : "Apply to All Agents"}
            </Button>
          </div>
        </Card>
      )}

      {/* Mission list */}
      {loading ? (
        <p className="text-sm text-slate-400 py-4 text-center">Memuat misi…</p>
      ) : missions.length === 0 ? (
        <Card className="p-6 text-center text-slate-400 text-sm border-dashed">
          Belum ada misi. Buat misi pertama untuk agen kamu!
        </Card>
      ) : (
        <div className="space-y-3">
          {missions.map((m) => {
            const subs = missionSubs(m.id);
            const isExpanded = expandedMission === m.id;
            const expired = isPast(new Date(m.deadline));
            const pending = subs.filter((s) => s.status === "pending").length;

            return (
              <Card key={m.id} className="overflow-hidden">
                {/* Mission header */}
                <div
                  className="flex items-start gap-3 p-4 cursor-pointer hover:bg-slate-50 transition-colors"
                  onClick={() => setExpandedMission(isExpanded ? null : m.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-800 text-sm">{m.title}</span>
                      {expired ? (
                        <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-medium">Kedaluwarsa</span>
                      ) : (
                        <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-semibold">Aktif</span>
                      )}
                      {pending > 0 && (
                        <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-semibold">
                          {pending} menunggu review
                        </span>
                      )}
                    </div>
                    {m.description && (
                      <p className="text-xs text-slate-500 mt-0.5 truncate">{m.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-400">
                      <span className="flex items-center gap-1">
                        <Star className="w-3 h-3 text-amber-400" />
                        {m.rewardPoints} poin
                      </span>
                      <span>
                        Deadline:{" "}
                        {format(new Date(m.deadline), "d MMM yyyy, HH:mm", { locale: idLocale })}
                      </span>
                      <span>{subs.length} submission</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-red-400 hover:bg-red-50 hover:text-red-600"
                      onClick={(e) => { e.stopPropagation(); void handleDelete(m.id); }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                  </div>
                </div>

                {/* Submissions */}
                {isExpanded && (
                  <div className="border-t bg-slate-50/60 p-4 space-y-3">
                    {subs.length === 0 ? (
                      <p className="text-sm text-slate-400 text-center py-2">Belum ada agen yang submit bukti.</p>
                    ) : (
                      subs.map((s) => {
                        const sts = STATUS_LABEL[s.status] ?? STATUS_LABEL.pending;
                        const agentName = agentNames.get(s.agentId) ?? s.agentId.slice(0, 8);
                        return (
                          <div key={s.id} className="bg-white rounded-lg border p-3 flex items-start gap-3">
                            {/* Proof thumbnail */}
                            {s.proofImageUrl ? (
                              <a href={s.proofImageUrl} target="_blank" rel="noopener noreferrer">
                                <img
                                  src={s.proofImageUrl}
                                  alt="bukti"
                                  className="w-14 h-14 rounded object-cover border hover:opacity-80 transition-opacity"
                                />
                              </a>
                            ) : (
                              <div className="w-14 h-14 rounded bg-slate-100 flex items-center justify-center text-slate-300 border">
                                <Upload className="w-5 h-5" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-sm text-slate-800">{agentName}</span>
                                <span className={`inline-flex items-center gap-1 text-[10.5px] px-1.5 py-0.5 rounded-full font-semibold ${sts.cls}`}>
                                  {sts.icon} {sts.label}
                                </span>
                              </div>
                              {s.notes && <p className="text-xs text-slate-500 mt-0.5 italic">"{s.notes}"</p>}
                              <p className="text-[10.5px] text-slate-400 mt-0.5">
                                {format(new Date(s.submittedAt), "d MMM yyyy, HH:mm", { locale: idLocale })}
                              </p>
                            </div>
                            {s.status === "pending" && (
                              <div className="flex gap-1.5 shrink-0">
                                <Button
                                  size="sm"
                                  className="h-7 bg-emerald-500 hover:bg-emerald-600 text-white text-xs px-2.5"
                                  onClick={() => void handleReview(s.id, "approved")}
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-red-500 border-red-200 hover:bg-red-50 text-xs px-2.5"
                                  onClick={() => void handleReview(s.id, "rejected")}
                                >
                                  <XCircle className="w-3.5 h-3.5 mr-1" /> Tolak
                                </Button>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
