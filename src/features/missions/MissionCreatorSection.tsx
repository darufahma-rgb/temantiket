import { useEffect, useState, useMemo } from "react";
import {
  Target, Plus, Trash2, CheckCircle2, XCircle, Clock, ChevronDown,
  ChevronUp, Upload, Star, BookOpen, Zap, BarChart3, Send, RefreshCw,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { format, isPast } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import {
  listMissions, createMission, deleteMission,
  listSubmissions, reviewSubmission,
  listTemplates, createTemplate, deleteTemplate,
} from "./missionsRepo";
import type { DailyMission, MissionSubmission, MissionTemplate } from "./types";

interface Props {
  agencyId: string;
  ownerId: string;
  agentNames: Map<string, string>;
  agentCount: number;
}

type Tab = "templates" | "active" | "create";

const STATUS_LABEL: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
  pending:  { label: "Menunggu",  cls: "bg-amber-100 text-amber-700",    icon: <Clock className="w-3 h-3" /> },
  approved: { label: "Disetujui", cls: "bg-emerald-100 text-emerald-700", icon: <CheckCircle2 className="w-3 h-3" /> },
  rejected: { label: "Ditolak",   cls: "bg-red-100 text-red-600",        icon: <XCircle className="w-3 h-3" /> },
};

function deadlineDefault() {
  const d = new Date();
  d.setHours(23, 59, 0, 0);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 16);
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface DeployFormProps {
  initialTitle: string;
  initialDescription: string;
  initialPoints: number;
  onDeploy: (title: string, description: string, points: number, deadline: string) => Promise<void>;
  onCancel: () => void;
  deploying: boolean;
}

function DeployForm({ initialTitle, initialDescription, initialPoints, onDeploy, onCancel, deploying }: DeployFormProps) {
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [pts, setPts] = useState(String(initialPoints));
  const [deadline, setDeadline] = useState(deadlineDefault());

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden"
    >
      <div className="mt-3 pt-3 border-t border-sky-200 space-y-2.5">
        <p className="text-xs font-semibold text-sky-700">Sesuaikan sebelum deploy:</p>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Judul misi"
          className="bg-white text-sm"
        />
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Deskripsi (opsional)"
          rows={2}
          className="bg-white text-sm"
        />
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[11px] text-slate-500 mb-1 block">Reward Poin</label>
            <div className="relative">
              <Star className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-amber-400" />
              <Input
                type="number" min={1} value={pts} onChange={(e) => setPts(e.target.value)}
                className="pl-7 bg-white text-sm"
              />
            </div>
          </div>
          <div>
            <label className="text-[11px] text-slate-500 mb-1 block">Deadline</label>
            <Input
              type="datetime-local" value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="bg-white text-sm"
            />
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={onCancel}>Batal</Button>
          <Button
            size="sm"
            className="bg-sky-600 hover:bg-sky-700 text-white gap-1.5"
            disabled={deploying}
            onClick={() => void onDeploy(title, description, parseInt(pts, 10) || initialPoints, deadline)}
          >
            <Send className="w-3.5 h-3.5" />
            {deploying ? "Deploying…" : "Deploy ke Semua Agen"}
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

interface SubmissionRowProps {
  sub: MissionSubmission;
  agentNames: Map<string, string>;
  onReview: (id: string, status: "approved" | "rejected") => void;
}

function SubmissionRow({ sub, agentNames, onReview }: SubmissionRowProps) {
  const sts = STATUS_LABEL[sub.status] ?? STATUS_LABEL.pending;
  const agentName = agentNames.get(sub.agentId) ?? sub.agentId.slice(0, 8);
  return (
    <div className="bg-white rounded-lg border p-3 flex items-start gap-3">
      {sub.proofImageUrl ? (
        <a href={sub.proofImageUrl} target="_blank" rel="noopener noreferrer">
          <img src={sub.proofImageUrl} alt="bukti" className="w-12 h-12 rounded object-cover border hover:opacity-80 transition-opacity" />
        </a>
      ) : (
        <div className="w-12 h-12 rounded bg-slate-100 flex items-center justify-center text-slate-300 border shrink-0">
          <Upload className="w-4 h-4" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm text-slate-800">{agentName}</span>
          <span className={`inline-flex items-center gap-1 text-[10.5px] px-1.5 py-0.5 rounded-full font-semibold ${sts.cls}`}>
            {sts.icon} {sts.label}
          </span>
        </div>
        {sub.notes && <p className="text-xs text-slate-500 mt-0.5 italic">"{sub.notes}"</p>}
        <p className="text-[10.5px] text-slate-400 mt-0.5">
          {format(new Date(sub.submittedAt), "d MMM yyyy, HH:mm", { locale: idLocale })}
        </p>
      </div>
      {sub.status === "pending" && (
        <div className="flex gap-1.5 shrink-0">
          <Button
            size="sm"
            className="h-7 bg-emerald-500 hover:bg-emerald-600 text-white text-xs px-2"
            onClick={() => onReview(sub.id, "approved")}
          >
            <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Approve
          </Button>
          <Button
            size="sm" variant="outline"
            className="h-7 text-red-500 border-red-200 hover:bg-red-50 text-xs px-2"
            onClick={() => onReview(sub.id, "rejected")}
          >
            <XCircle className="w-3.5 h-3.5 mr-1" /> Tolak
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function MissionCreatorSection({ agencyId, ownerId, agentNames, agentCount }: Props) {
  const [missions, setMissions] = useState<DailyMission[]>([]);
  const [submissions, setSubmissions] = useState<MissionSubmission[]>([]);
  const [templates, setTemplates] = useState<MissionTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("templates");
  const [expandedMission, setExpandedMission] = useState<string | null>(null);

  // Deploy-from-template state
  const [deployingTemplateId, setDeployingTemplateId] = useState<string | null>(null);
  const [deploying, setDeploying] = useState(false);

  // New template form
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [tmplTitle, setTmplTitle] = useState("");
  const [tmplDesc, setTmplDesc] = useState("");
  const [tmplPts, setTmplPts] = useState("20");
  const [savingTemplate, setSavingTemplate] = useState(false);

  // Direct-create form
  const [createTitle, setCreateTitle] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [createPts, setCreatePts] = useState("20");
  const [createDeadline, setCreateDeadline] = useState(deadlineDefault());
  const [saving, setSaving] = useState(false);

  async function reload() {
    setLoading(true);
    const [m, s, t] = await Promise.all([
      listMissions(agencyId),
      listSubmissions(agencyId),
      listTemplates(agencyId),
    ]);
    setMissions(m);
    setSubmissions(s);
    setTemplates(t);
    setLoading(false);
  }

  useEffect(() => { void reload(); }, [agencyId]);

  // ── Derived ─────────────────────────────────────────────────────────────────
  const activeMissions = useMemo(
    () => missions.filter((m) => !isPast(new Date(m.deadline))),
    [missions],
  );
  const totalPending = submissions.filter((s) => s.status === "pending").length;

  function missionSubs(missionId: string) {
    return submissions.filter((s) => s.missionId === missionId);
  }

  // ── Actions ──────────────────────────────────────────────────────────────────
  async function handleDeploy(title: string, description: string, points: number, deadline: string) {
    if (!title.trim()) { toast.error("Judul wajib diisi"); return; }
    if (isNaN(points) || points < 1) { toast.error("Poin minimal 1"); return; }
    setDeploying(true);
    const result = await createMission(
      agencyId,
      { title: title.trim(), description: description.trim(), rewardPoints: points, deadline: new Date(deadline).toISOString() },
      ownerId,
    );
    setDeploying(false);
    if (result) {
      toast.success(`Misi di-deploy ke ${agentCount} agen!`);
      setDeployingTemplateId(null);
      void reload();
    } else {
      toast.error("Gagal deploy misi. Pastikan SQL migration sudah dijalankan.");
    }
  }

  async function handleDeleteTemplate(id: string) {
    if (!confirm("Hapus template ini?")) return;
    const ok = await deleteTemplate(id);
    if (ok) { toast.success("Template dihapus"); void reload(); }
    else toast.error("Gagal hapus template");
  }

  async function handleDeleteMission(id: string) {
    if (!confirm("Hapus misi ini?")) return;
    const ok = await deleteMission(id);
    if (ok) { toast.success("Misi dihapus"); void reload(); }
    else toast.error("Gagal hapus misi");
  }

  async function handleSaveTemplate() {
    if (!tmplTitle.trim()) { toast.error("Judul wajib diisi"); return; }
    const pts = parseInt(tmplPts, 10);
    if (isNaN(pts) || pts < 1) { toast.error("Poin minimal 1"); return; }
    setSavingTemplate(true);
    const result = await createTemplate(
      agencyId,
      { title: tmplTitle.trim(), description: tmplDesc.trim(), defaultPoints: pts },
      ownerId,
    );
    setSavingTemplate(false);
    if (result) {
      toast.success("Template disimpan!");
      setTmplTitle(""); setTmplDesc(""); setTmplPts("20");
      setShowTemplateForm(false);
      void reload();
    } else {
      toast.error("Gagal simpan template. Pastikan SQL migration sudah dijalankan.");
    }
  }

  async function handleDirectCreate() {
    if (!createTitle.trim()) { toast.error("Judul wajib diisi"); return; }
    const pts = parseInt(createPts, 10);
    if (isNaN(pts) || pts < 1) { toast.error("Poin minimal 1"); return; }
    setSaving(true);
    const result = await createMission(
      agencyId,
      { title: createTitle.trim(), description: createDesc.trim(), rewardPoints: pts, deadline: new Date(createDeadline).toISOString() },
      ownerId,
    );
    setSaving(false);
    if (result) {
      toast.success(`Misi di-deploy ke ${agentCount} agen!`);
      setCreateTitle(""); setCreateDesc(""); setCreatePts("20"); setCreateDeadline(deadlineDefault());
      setTab("active");
      void reload();
    } else {
      toast.error("Gagal membuat misi. Cek SQL migration sudah dijalankan.");
    }
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

  // ── Render ───────────────────────────────────────────────────────────────────
  const TABS: { id: Tab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: "templates", label: "Library Template",  icon: <BookOpen className="w-3.5 h-3.5" />, badge: templates.length },
    { id: "active",   label: "Misi Aktif",         icon: <BarChart3 className="w-3.5 h-3.5" />, badge: totalPending || undefined },
    { id: "create",   label: "Buat Manual",         icon: <Plus className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="w-5 h-5 text-sky-600" />
          <h2 className="font-bold text-slate-800 text-lg">Manajemen Misi</h2>
        </div>
        <Button
          variant="ghost" size="sm"
          className="text-slate-400 hover:text-slate-600 gap-1"
          onClick={() => void reload()}
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              tab === t.id
                ? "bg-white text-sky-700 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.icon}
            <span className="hidden sm:inline">{t.label}</span>
            {t.badge != null && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${tab === t.id ? "bg-sky-100 text-sky-700" : "bg-slate-200 text-slate-600"}`}>
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-slate-400 py-6 text-center">Memuat data…</p>
      ) : (
        <AnimatePresence mode="wait">
          {/* ── Tab: Template Library ───────────────────────────────────── */}
          {tab === "templates" && (
            <motion.div key="templates" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500">{templates.length} template tersimpan</p>
                <Button
                  size="sm" variant="outline"
                  className="h-7 text-xs gap-1 border-sky-300 text-sky-700 hover:bg-sky-50"
                  onClick={() => setShowTemplateForm((v) => !v)}
                >
                  <Plus className="w-3.5 h-3.5" /> Template Baru
                </Button>
              </div>

              {/* New template form */}
              <AnimatePresence>
                {showTemplateForm && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="bg-sky-50/60 border border-sky-200 rounded-xl p-3.5 space-y-2.5">
                      <p className="text-xs font-semibold text-sky-700">Template Baru</p>
                      <Input
                        placeholder="Judul template misi"
                        value={tmplTitle}
                        onChange={(e) => setTmplTitle(e.target.value)}
                        className="bg-white text-sm"
                      />
                      <Textarea
                        placeholder="Deskripsi / instruksi misi"
                        value={tmplDesc}
                        onChange={(e) => setTmplDesc(e.target.value)}
                        rows={2}
                        className="bg-white text-sm"
                      />
                      <div className="flex items-end gap-2">
                        <div className="flex-1">
                          <label className="text-[11px] text-slate-500 mb-1 block">Default Poin</label>
                          <div className="relative">
                            <Star className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-amber-400" />
                            <Input type="number" min={1} value={tmplPts} onChange={(e) => setTmplPts(e.target.value)} className="pl-7 bg-white text-sm" />
                          </div>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => setShowTemplateForm(false)}>Batal</Button>
                        <Button
                          size="sm"
                          className="bg-sky-600 hover:bg-sky-700 text-white"
                          disabled={savingTemplate}
                          onClick={handleSaveTemplate}
                        >
                          {savingTemplate ? "Menyimpan…" : "Simpan"}
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {templates.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-sm border-2 border-dashed rounded-xl">
                  Belum ada template. Buat template pertama untuk mempercepat pembuatan misi!
                </div>
              ) : (
                <div className="space-y-2">
                  {templates.map((t) => (
                    <Card key={t.id} className="overflow-hidden">
                      <div className="p-3.5">
                        <div className="flex items-start gap-3">
                          <div className="w-9 h-9 rounded-lg bg-sky-100 flex items-center justify-center shrink-0">
                            <BookOpen className="w-4 h-4 text-sky-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-sm text-slate-800">{t.title}</span>
                              <span className="flex items-center gap-0.5 text-[10.5px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-bold">
                                <Star className="w-3 h-3" /> {t.defaultPoints} poin
                              </span>
                              {t.useCount > 0 && (
                                <span className="text-[10px] text-slate-400">Dipakai {t.useCount}×</span>
                              )}
                            </div>
                            {t.description && (
                              <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{t.description}</p>
                            )}
                          </div>
                          <div className="flex gap-1.5 shrink-0">
                            <Button
                              size="sm"
                              className="h-7 bg-sky-600 hover:bg-sky-700 text-white text-xs px-2.5 gap-1"
                              onClick={() => setDeployingTemplateId(deployingTemplateId === t.id ? null : t.id)}
                            >
                              <Zap className="w-3 h-3" /> Gunakan
                            </Button>
                            <Button
                              variant="ghost" size="icon"
                              className="h-7 w-7 text-red-400 hover:bg-red-50 hover:text-red-600"
                              onClick={() => void handleDeleteTemplate(t.id)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>

                        {/* Deploy form */}
                        <AnimatePresence>
                          {deployingTemplateId === t.id && (
                            <DeployForm
                              key={t.id}
                              initialTitle={t.title}
                              initialDescription={t.description}
                              initialPoints={t.defaultPoints}
                              deploying={deploying}
                              onDeploy={handleDeploy}
                              onCancel={() => setDeployingTemplateId(null)}
                            />
                          )}
                        </AnimatePresence>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* ── Tab: Misi Aktif ─────────────────────────────────────────── */}
          {tab === "active" && (
            <motion.div key="active" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
              {/* Summary row */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Misi Aktif", value: activeMissions.length, color: "bg-sky-50 text-sky-700 border-sky-100" },
                  { label: "Menunggu Review", value: totalPending, color: "bg-amber-50 text-amber-700 border-amber-100" },
                  { label: "Total Misi", value: missions.length, color: "bg-slate-50 text-slate-700 border-slate-100" },
                ].map((s) => (
                  <div key={s.label} className={`rounded-xl border p-2.5 text-center ${s.color}`}>
                    <p className="text-xl font-extrabold font-mono">{s.value}</p>
                    <p className="text-[10px] font-medium">{s.label}</p>
                  </div>
                ))}
              </div>

              {missions.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-sm border-2 border-dashed rounded-xl">
                  Belum ada misi. Gunakan template atau buat misi manual.
                </div>
              ) : (
                <div className="space-y-3">
                  {missions.map((m) => {
                    const subs = missionSubs(m.id);
                    const isExpanded = expandedMission === m.id;
                    const expired = isPast(new Date(m.deadline));
                    const approvedCount = subs.filter((s) => s.status === "approved").length;
                    const pendingCount = subs.filter((s) => s.status === "pending").length;
                    const pct = agentCount > 0 ? Math.round((approvedCount / agentCount) * 100) : 0;

                    return (
                      <Card key={m.id} className="overflow-hidden">
                        <div
                          className="flex items-start gap-3 p-4 cursor-pointer hover:bg-slate-50 transition-colors"
                          onClick={() => setExpandedMission(isExpanded ? null : m.id)}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-slate-800 text-sm">{m.title}</span>
                              {expired
                                ? <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-medium">Kedaluwarsa</span>
                                : <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-semibold">Aktif</span>
                              }
                              {pendingCount > 0 && (
                                <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-semibold">
                                  {pendingCount} menunggu
                                </span>
                              )}
                            </div>
                            {m.description && (
                              <p className="text-xs text-slate-500 mt-0.5 truncate">{m.description}</p>
                            )}
                            {/* Completion bar */}
                            <div className="mt-2 space-y-1">
                              <div className="flex items-center justify-between text-[10.5px] text-slate-500">
                                <span>{approvedCount} / {agentCount} agen selesai</span>
                                <span className="flex items-center gap-1">
                                  <Star className="w-3 h-3 text-amber-400" /> {m.rewardPoints} poin
                                </span>
                              </div>
                              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-emerald-500 rounded-full transition-all"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Button
                              variant="ghost" size="icon"
                              className="h-7 w-7 text-red-400 hover:bg-red-50 hover:text-red-600"
                              onClick={(e) => { e.stopPropagation(); void handleDeleteMission(m.id); }}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                            {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                          </div>
                        </div>

                        {/* Submissions */}
                        {isExpanded && (
                          <div className="border-t bg-slate-50/60 p-4 space-y-2">
                            {subs.length === 0 ? (
                              <p className="text-sm text-slate-400 text-center py-2">Belum ada agen yang submit bukti.</p>
                            ) : (
                              subs.map((s) => (
                                <SubmissionRow
                                  key={s.id}
                                  sub={s}
                                  agentNames={agentNames}
                                  onReview={(id, status) => void handleReview(id, status)}
                                />
                              ))
                            )}
                          </div>
                        )}
                      </Card>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}

          {/* ── Tab: Buat Manual ────────────────────────────────────────── */}
          {tab === "create" && (
            <motion.div key="create" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="bg-slate-50 border rounded-xl p-4 space-y-3">
                <p className="text-xs font-semibold text-slate-600">Buat misi baru dan deploy langsung ke semua agen.</p>
                <Input
                  placeholder="Judul Misi"
                  value={createTitle}
                  onChange={(e) => setCreateTitle(e.target.value)}
                  className="bg-white"
                />
                <Textarea
                  placeholder="Deskripsi / instruksi misi (opsional)"
                  value={createDesc}
                  onChange={(e) => setCreateDesc(e.target.value)}
                  rows={3}
                  className="bg-white text-sm"
                />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">Reward Poin</label>
                    <div className="relative">
                      <Star className="absolute left-2.5 top-2.5 w-4 h-4 text-amber-400" />
                      <Input type="number" min={1} value={createPts} onChange={(e) => setCreatePts(e.target.value)} className="pl-8 bg-white" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">Deadline</label>
                    <Input type="datetime-local" value={createDeadline} onChange={(e) => setCreateDeadline(e.target.value)} className="bg-white text-sm" />
                  </div>
                </div>
                <div className="pt-1 flex justify-end">
                  <Button
                    className="bg-sky-600 hover:bg-sky-700 text-white gap-2"
                    disabled={saving}
                    onClick={handleDirectCreate}
                  >
                    <Send className="w-4 h-4" />
                    {saving ? "Deploying…" : `Deploy ke Semua Agen (${agentCount})`}
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
}
