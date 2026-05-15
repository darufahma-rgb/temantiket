import { useEffect, useState, useMemo } from "react";
import {
  Target, Plus, Trash2, CheckCircle2, XCircle, Clock, ChevronDown,
  ChevronUp, Upload, Star, BookOpen, Zap, BarChart3, Send, RefreshCw,
  Wallet, Users, User, CalendarClock, Settings2,
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
  incrementTemplateUseCount,
} from "./missionsRepo";
import type { DailyMission, MissionSubmission, MissionTemplate } from "./types";
import {
  pullMissionMeta, saveMissionMetaEntry, removeMissionMetaEntry,
  type MissionMetaMap,
} from "@/lib/missionMeta";
import {
  pullTemplateMeta, saveTemplateMetaEntry, removeTemplateMetaEntry,
  type TemplateMetaMap,
} from "@/lib/templateMeta";
import { addWalletTx } from "@/lib/agentWallet";

const fmtIDR = (v: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(v);

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

function deadlineToday() {
  const d = new Date();
  d.setHours(23, 59, 0, 0);
  return d.toISOString();
}

// ── TargetSelector ────────────────────────────────────────────────────────────

interface TargetSelectorProps {
  agentNames: Map<string, string>;
  mode: "all" | "specific";
  selected: Set<string>;
  onModeChange: (m: "all" | "specific") => void;
  onToggle: (id: string) => void;
}

function TargetSelector({ agentNames, mode, selected, onModeChange, onToggle }: TargetSelectorProps) {
  return (
    <div className="space-y-2">
      <label className="text-[11px] text-slate-500 mb-1 block font-semibold">Target Agen</label>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onModeChange("all")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
            mode === "all"
              ? "bg-sky-600 border-sky-600 text-white"
              : "border-slate-200 text-slate-500 hover:border-sky-300"
          }`}
        >
          <Users className="w-3.5 h-3.5" /> Semua Agen
        </button>
        <button
          type="button"
          onClick={() => onModeChange("specific")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
            mode === "specific"
              ? "bg-sky-600 border-sky-600 text-white"
              : "border-slate-200 text-slate-500 hover:border-sky-300"
          }`}
        >
          <User className="w-3.5 h-3.5" /> Pilih Agen
        </button>
      </div>
      <AnimatePresence>
        {mode === "specific" && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-40 overflow-y-auto bg-white">
              {agentNames.size === 0 ? (
                <p className="text-xs text-slate-400 py-3 text-center">Belum ada agen terdaftar.</p>
              ) : (
                Array.from(agentNames.entries()).map(([id, name]) => (
                  <label
                    key={id}
                    className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-sky-50/50 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(id)}
                      onChange={() => onToggle(id)}
                      className="rounded accent-sky-600"
                    />
                    <span className="text-xs text-slate-700 font-medium">{name}</span>
                  </label>
                ))
              )}
            </div>
            {selected.size > 0 && (
              <p className="text-[10.5px] text-sky-600 font-semibold mt-1">
                {selected.size} agen dipilih
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── DeployForm (kustomisasi sebelum deploy) ───────────────────────────────────

interface DeployFormProps {
  initialTitle: string;
  initialDescription: string;
  initialPoints: number;
  initialFee?: number;
  initialTargetMode?: "all" | "specific";
  initialTargetAgentIds?: string[];
  agentNames: Map<string, string>;
  onDeploy: (
    title: string,
    description: string,
    points: number,
    deadline: string,
    feeIDR: number,
    targetAgentIds: string[] | "all",
  ) => Promise<void>;
  onCancel: () => void;
  deploying: boolean;
}

function DeployForm({
  initialTitle, initialDescription, initialPoints,
  initialFee = 0, initialTargetMode = "all", initialTargetAgentIds = [],
  agentNames, onDeploy, onCancel, deploying,
}: DeployFormProps) {
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [pts, setPts] = useState(String(initialPoints));
  const [deadline, setDeadline] = useState(deadlineDefault());
  const [fee, setFee] = useState(String(initialFee));
  const [targetMode, setTargetMode] = useState<"all" | "specific">(initialTargetMode);
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(new Set(initialTargetAgentIds));

  function toggleAgent(id: string) {
    setSelectedAgents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const targetAgentIds: string[] | "all" =
    targetMode === "all" ? "all" : Array.from(selectedAgents);

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden"
    >
      <div className="mt-3 pt-3 border-t border-sky-200 space-y-2.5">
        <p className="text-xs font-semibold text-sky-700">Kustomisasi sebelum deploy:</p>
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
            <label className="text-[11px] text-slate-500 mb-1 block">Fee IDR (opsional)</label>
            <div className="relative">
              <Wallet className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-emerald-500" />
              <Input
                type="number" min={0} value={fee} onChange={(e) => setFee(e.target.value)}
                placeholder="0"
                className="pl-7 bg-white text-sm"
              />
            </div>
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
        <TargetSelector
          agentNames={agentNames}
          mode={targetMode}
          selected={selectedAgents}
          onModeChange={setTargetMode}
          onToggle={toggleAgent}
        />
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={onCancel}>Batal</Button>
          <Button
            size="sm"
            className="bg-sky-600 hover:bg-sky-700 text-white gap-1.5"
            disabled={deploying || (targetMode === "specific" && selectedAgents.size === 0)}
            onClick={() => void onDeploy(
              title,
              description,
              parseInt(pts, 10) || initialPoints,
              deadline,
              Number(fee) || 0,
              targetAgentIds,
            )}
          >
            <Send className="w-3.5 h-3.5" />
            {deploying
              ? "Deploying…"
              : targetMode === "all"
                ? "Deploy ke Semua Agen"
                : `Deploy ke ${selectedAgents.size} Agen`}
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

// ── SubmissionRow ─────────────────────────────────────────────────────────────

interface SubmissionRowProps {
  sub: MissionSubmission;
  agentNames: Map<string, string>;
  feeIDR: number;
  onReview: (id: string, status: "approved" | "rejected") => void;
}

function SubmissionRow({ sub, agentNames, feeIDR, onReview }: SubmissionRowProps) {
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
          {sub.status === "approved" && feeIDR > 0 && (
            <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-100 px-1.5 py-0.5 rounded-full font-semibold">
              <Wallet className="w-2.5 h-2.5" /> {fmtIDR(feeIDR)}
            </span>
          )}
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
  const [missionMeta, setMissionMeta] = useState<MissionMetaMap>({});
  const [templateMeta, setTemplateMeta] = useState<TemplateMetaMap>({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("templates");
  const [expandedMission, setExpandedMission] = useState<string | null>(null);

  const [deployingTemplateId, setDeployingTemplateId] = useState<string | null>(null);
  const [deploying, setDeploying] = useState(false);
  const [injectingTemplateId, setInjectingTemplateId] = useState<string | null>(null);
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<Set<string>>(new Set());
  const [bulkInjecting, setBulkInjecting] = useState(false);

  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [tmplTitle, setTmplTitle] = useState("");
  const [tmplDesc, setTmplDesc] = useState("");
  const [tmplPts, setTmplPts] = useState("20");
  const [tmplFee, setTmplFee] = useState("0");
  const [tmplTargetMode, setTmplTargetMode] = useState<"all" | "specific">("all");
  const [tmplTargetAgents, setTmplTargetAgents] = useState<Set<string>>(new Set());
  const [savingTemplate, setSavingTemplate] = useState(false);

  const [createTitle, setCreateTitle] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [createPts, setCreatePts] = useState("20");
  const [createFee, setCreateFee] = useState("0");
  const [createDeadline, setCreateDeadline] = useState(deadlineDefault());
  const [createTargetMode, setCreateTargetMode] = useState<"all" | "specific">("all");
  const [createSelectedAgents, setCreateSelectedAgents] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  async function reload() {
    setLoading(true);
    const [m, s, t, meta, tmplMeta] = await Promise.all([
      listMissions(agencyId),
      listSubmissions(agencyId),
      listTemplates(agencyId),
      pullMissionMeta(),
      pullTemplateMeta(),
    ]);
    setMissions(m);
    setSubmissions(s);
    setTemplates(t);
    setMissionMeta(meta);
    setTemplateMeta(tmplMeta);
    setLoading(false);
  }

  useEffect(() => { void reload(); }, [agencyId]);

  const activeMissions = useMemo(
    () => missions.filter((m) => !isPast(new Date(m.deadline))),
    [missions],
  );
  const totalPending = submissions.filter((s) => s.status === "pending").length;

  function missionSubs(missionId: string) {
    return submissions.filter((s) => s.missionId === missionId);
  }

  function toggleCreateAgent(id: string) {
    setCreateSelectedAgents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleTmplTargetAgent(id: string) {
    setTmplTargetAgents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // ── Actions ──────────────────────────────────────────────────────────────────

  async function handleDeploy(
    title: string,
    description: string,
    points: number,
    deadline: string,
    feeIDR: number,
    targetAgentIds: string[] | "all",
    templateId?: string,
  ) {
    if (!title.trim()) { toast.error("Judul wajib diisi"); return; }
    if (isNaN(points) || points < 1) { toast.error("Poin minimal 1"); return; }
    setDeploying(true);
    const result = await createMission(
      agencyId,
      { title: title.trim(), description: description.trim(), rewardPoints: points, deadline: new Date(deadline).toISOString() },
      ownerId,
    );
    if (result) {
      const newMeta = await saveMissionMetaEntry(missionMeta, result.id, { feeIDR, targetAgentIds });
      setMissionMeta(newMeta);
      if (templateId) {
        await incrementTemplateUseCount(templateId);
      }
      const targetLabel = targetAgentIds === "all"
        ? `${agentCount} agen`
        : `${(targetAgentIds as string[]).length} agen terpilih`;
      toast.success(`Misi di-deploy ke ${targetLabel}!`);
      setDeployingTemplateId(null);
      void reload();
    } else {
      toast.error("Gagal deploy misi. Pastikan SQL migration sudah dijalankan.");
    }
    setDeploying(false);
  }

  async function handleInjectToday(template: MissionTemplate) {
    const meta = templateMeta[template.id];
    const feeIDR = meta?.feeIDR ?? 0;
    const targetMode = meta?.targetMode ?? "all";
    const targetAgentIds: string[] | "all" =
      targetMode === "all" ? "all" : (meta?.targetAgentIds ?? []);

    if (targetMode === "specific" && (meta?.targetAgentIds ?? []).length === 0) {
      toast.error("Template ini belum ada target agen. Edit dulu lewat tombol Kustomisasi.");
      return;
    }

    setInjectingTemplateId(template.id);
    const deadline = deadlineToday();
    const result = await createMission(
      agencyId,
      {
        title: template.title,
        description: template.description,
        rewardPoints: template.defaultPoints,
        deadline,
      },
      ownerId,
    );
    if (result) {
      const newMeta = await saveMissionMetaEntry(missionMeta, result.id, { feeIDR, targetAgentIds });
      setMissionMeta(newMeta);
      await incrementTemplateUseCount(template.id);
      const targetLabel = targetAgentIds === "all"
        ? `${agentCount} agen`
        : `${(targetAgentIds as string[]).length} agen`;
      toast.success(`"${template.title}" diinjeksi ke ${targetLabel}! Deadline hari ini 23:59.`);
      void reload();
    } else {
      toast.error("Gagal injeksi misi. Cek SQL migration sudah dijalankan.");
    }
    setInjectingTemplateId(null);
  }

  async function handleBulkInject() {
    if (selectedTemplateIds.size === 0) {
      toast.error("Pilih setidaknya satu template untuk di-inject.");
      return;
    }
    const targets = templates.filter((t) => selectedTemplateIds.has(t.id));
    setBulkInjecting(true);
    let successCount = 0;
    let updatedMeta = { ...missionMeta };
    for (const template of targets) {
      const meta = templateMeta[template.id];
      const feeIDR = meta?.feeIDR ?? 0;
      const targetMode = meta?.targetMode ?? "all";
      const targetAgentIds: string[] | "all" =
        targetMode === "all" ? "all" : (meta?.targetAgentIds ?? []);
      if (targetMode === "specific" && (meta?.targetAgentIds ?? []).length === 0) {
        toast.warning(`"${template.title}" dilewati — belum ada target agen.`);
        continue;
      }
      const result = await createMission(
        agencyId,
        {
          title: template.title,
          description: template.description,
          rewardPoints: template.defaultPoints,
          deadline: deadlineToday(),
        },
        ownerId,
      );
      if (result) {
        updatedMeta = await saveMissionMetaEntry(updatedMeta, result.id, { feeIDR, targetAgentIds });
        await incrementTemplateUseCount(template.id);
        successCount++;
      } else {
        toast.error(`Gagal injeksi "${template.title}".`);
      }
    }
    setMissionMeta(updatedMeta);
    setBulkInjecting(false);
    setSelectedTemplateIds(new Set());
    if (successCount > 0) {
      toast.success(`${successCount} misi berhasil diinjeksi! Deadline hari ini 23:59.`);
    }
    void reload();
  }

  async function handleDeleteTemplate(id: string) {
    if (!confirm("Hapus template ini?")) return;
    const ok = await deleteTemplate(id);
    if (ok) {
      const newTmplMeta = await removeTemplateMetaEntry(templateMeta, id);
      setTemplateMeta(newTmplMeta);
      toast.success("Template dihapus");
      void reload();
    }
    else toast.error("Gagal hapus template");
  }

  async function handleDeleteMission(id: string) {
    if (!confirm("Hapus misi ini?")) return;
    const ok = await deleteMission(id);
    if (ok) {
      const newMeta = await removeMissionMetaEntry(missionMeta, id);
      setMissionMeta(newMeta);
      toast.success("Misi dihapus");
      void reload();
    } else {
      toast.error("Gagal hapus misi");
    }
  }

  async function handleSaveTemplate() {
    if (!tmplTitle.trim()) { toast.error("Judul wajib diisi"); return; }
    const pts = parseInt(tmplPts, 10);
    if (isNaN(pts) || pts < 1) { toast.error("Poin minimal 1"); return; }
    if (tmplTargetMode === "specific" && tmplTargetAgents.size === 0) {
      toast.error("Pilih minimal 1 agen atau pilih 'Semua Agen'");
      return;
    }
    setSavingTemplate(true);
    const result = await createTemplate(
      agencyId,
      { title: tmplTitle.trim(), description: tmplDesc.trim(), defaultPoints: pts },
      ownerId,
    );
    if (result) {
      const fee = Number(tmplFee) || 0;
      const newTmplMeta = await saveTemplateMetaEntry(templateMeta, result.id, {
        feeIDR: fee,
        targetMode: tmplTargetMode,
        targetAgentIds: Array.from(tmplTargetAgents),
      });
      setTemplateMeta(newTmplMeta);
      toast.success("Template disimpan! Tinggal klik ⚡ Inject untuk deploy kapanpun.");
      setTmplTitle(""); setTmplDesc(""); setTmplPts("20"); setTmplFee("0");
      setTmplTargetMode("all"); setTmplTargetAgents(new Set());
      setShowTemplateForm(false);
      void reload();
    } else {
      toast.error("Gagal simpan template. Pastikan SQL migration sudah dijalankan.");
    }
    setSavingTemplate(false);
  }

  async function handleDirectCreate() {
    if (!createTitle.trim()) { toast.error("Judul wajib diisi"); return; }
    const pts = parseInt(createPts, 10);
    if (isNaN(pts) || pts < 1) { toast.error("Poin minimal 1"); return; }
    if (createTargetMode === "specific" && createSelectedAgents.size === 0) {
      toast.error("Pilih minimal 1 agen atau pilih 'Semua Agen'");
      return;
    }
    setSaving(true);
    const result = await createMission(
      agencyId,
      { title: createTitle.trim(), description: createDesc.trim(), rewardPoints: pts, deadline: new Date(createDeadline).toISOString() },
      ownerId,
    );
    if (result) {
      const feeIDR = Number(createFee) || 0;
      const targetAgentIds: string[] | "all" =
        createTargetMode === "all" ? "all" : Array.from(createSelectedAgents);
      const newMeta = await saveMissionMetaEntry(missionMeta, result.id, { feeIDR, targetAgentIds });
      setMissionMeta(newMeta);
      const targetLabel = targetAgentIds === "all"
        ? `${agentCount} agen`
        : `${(targetAgentIds as string[]).length} agen terpilih`;
      toast.success(`Misi di-deploy ke ${targetLabel}!`);
      setCreateTitle(""); setCreateDesc(""); setCreatePts("20"); setCreateFee("0");
      setCreateDeadline(deadlineDefault());
      setCreateTargetMode("all"); setCreateSelectedAgents(new Set());
      setTab("active");
      void reload();
    } else {
      toast.error("Gagal membuat misi. Cek SQL migration sudah dijalankan.");
    }
    setSaving(false);
  }

  async function handleReview(subId: string, status: "approved" | "rejected") {
    const ok = await reviewSubmission(subId, status, ownerId);
    if (ok) {
      if (status === "approved") {
        const sub = submissions.find((s) => s.id === subId);
        if (sub) {
          const meta = missionMeta[sub.missionId];
          if (meta?.feeIDR && meta.feeIDR > 0) {
            const mission = missions.find((m) => m.id === sub.missionId);
            addWalletTx(sub.agentId, {
              agentId:     sub.agentId,
              type:        "mission_fee",
              pointsDelta: 0,
              amountIDR:   meta.feeIDR,
              description: `Fee side job: "${mission?.title ?? "Misi"}"`,
              createdBy:   ownerId,
            });
          }
        }
        toast.success("Disetujui! Poin + fee ditambahkan ke agen.");
      } else {
        toast.success("Ditolak.");
      }
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

              {/* ── Callout cara pakai ─────────────────────────────────── */}
              <div className="bg-sky-50 border border-sky-200 rounded-xl px-3.5 py-2.5 flex items-start gap-2.5">
                <CalendarClock className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-sky-800">Sistem Misi Harian</p>
                  <p className="text-[11px] text-sky-700 mt-0.5 leading-relaxed">
                    Setiap hari, klik <strong>⚡ Inject</strong> untuk mengaktifkan misi dengan deadline <strong>23:59 malam ini</strong>. Misi otomatis <strong>hangus</strong> di tengah malam — agen hanya melihat misi yang diinjeksi hari ini.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-slate-500">{templates.length} template tersimpan</p>
                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm" variant="outline"
                    className="h-7 text-xs gap-1 border-slate-200 text-slate-600 hover:bg-slate-50"
                    onClick={() => setShowTemplateForm((v) => !v)}
                  >
                    <Plus className="w-3.5 h-3.5" /> Template Baru
                  </Button>
                </div>
              </div>

              {/* ── Bulk Inject Bar ─────────────────────────────────────── */}
              {templates.length > 0 && (
                <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 transition-colors ${
                  selectedTemplateIds.size > 0
                    ? "bg-sky-50 border-sky-200"
                    : "bg-slate-50 border-slate-200"
                }`}>
                  <button
                    className="flex items-center gap-2 flex-1 text-left"
                    onClick={() => {
                      if (selectedTemplateIds.size === templates.length) {
                        setSelectedTemplateIds(new Set());
                      } else {
                        setSelectedTemplateIds(new Set(templates.map((t) => t.id)));
                      }
                    }}
                  >
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                      selectedTemplateIds.size === templates.length
                        ? "bg-sky-600 border-sky-600"
                        : selectedTemplateIds.size > 0
                          ? "bg-sky-200 border-sky-400"
                          : "border-slate-300 bg-white"
                    }`}>
                      {selectedTemplateIds.size > 0 && (
                        <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 10">
                          {selectedTemplateIds.size === templates.length
                            ? <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            : <path d="M2 5h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                          }
                        </svg>
                      )}
                    </div>
                    <span className="text-xs font-medium text-slate-600">
                      {selectedTemplateIds.size === 0
                        ? "Pilih semua untuk Bulk Inject"
                        : selectedTemplateIds.size === templates.length
                          ? "Semua dipilih"
                          : `${selectedTemplateIds.size} dari ${templates.length} dipilih`}
                    </span>
                  </button>
                  {selectedTemplateIds.size > 0 && (
                    <Button
                      size="sm"
                      className="h-7 bg-sky-600 hover:bg-sky-700 text-white text-xs px-3 gap-1.5 shrink-0"
                      disabled={bulkInjecting}
                      onClick={() => void handleBulkInject()}
                    >
                      <Zap className="w-3 h-3" />
                      {bulkInjecting
                        ? "Menginjeksi…"
                        : `Inject ${selectedTemplateIds.size} Misi`}
                    </Button>
                  )}
                </div>
              )}

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
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[11px] text-slate-500 mb-1 block">Default Poin</label>
                          <div className="relative">
                            <Star className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-amber-400" />
                            <Input type="number" min={1} value={tmplPts} onChange={(e) => setTmplPts(e.target.value)} className="pl-7 bg-white text-sm" />
                          </div>
                        </div>
                        <div>
                          <label className="text-[11px] text-slate-500 mb-1 block">Default Fee IDR</label>
                          <div className="relative">
                            <Wallet className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-emerald-500" />
                            <Input type="number" min={0} value={tmplFee} onChange={(e) => setTmplFee(e.target.value)} placeholder="0" className="pl-7 bg-white text-sm" />
                          </div>
                        </div>
                      </div>
                      <TargetSelector
                        agentNames={agentNames}
                        mode={tmplTargetMode}
                        selected={tmplTargetAgents}
                        onModeChange={setTmplTargetMode}
                        onToggle={toggleTmplTargetAgent}
                      />
                      <div className="flex items-center gap-2 justify-end pt-1">
                        <Button variant="ghost" size="sm" onClick={() => setShowTemplateForm(false)}>Batal</Button>
                        <Button
                          size="sm"
                          className="bg-sky-600 hover:bg-sky-700 text-white gap-1"
                          disabled={savingTemplate}
                          onClick={handleSaveTemplate}
                        >
                          <BookOpen className="w-3.5 h-3.5" />
                          {savingTemplate ? "Menyimpan…" : "Simpan Template"}
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
                  {templates.map((t) => {
                    const meta = templateMeta[t.id];
                    const savedFee = meta?.feeIDR ?? 0;
                    const savedTargetMode = meta?.targetMode ?? "all";
                    const savedTargetIds = meta?.targetAgentIds ?? [];
                    const targetLabel = savedTargetMode === "all"
                      ? `Semua (${agentCount})`
                      : savedTargetIds.length > 0
                        ? `${savedTargetIds.length} agen`
                        : "Belum diset";
                    const isInjecting = injectingTemplateId === t.id;
                    const isCustomizing = deployingTemplateId === t.id;

                    return (
                      <Card key={t.id} className={`overflow-hidden transition-colors ${selectedTemplateIds.has(t.id) ? "border-sky-300 bg-sky-50/40" : ""}`}>
                        <div className="p-3.5">
                          <div className="flex items-start gap-3">
                            <button
                              className={`mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                                selectedTemplateIds.has(t.id)
                                  ? "bg-sky-600 border-sky-600"
                                  : "border-slate-300 bg-white hover:border-sky-400"
                              }`}
                              onClick={() => {
                                setSelectedTemplateIds((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(t.id)) next.delete(t.id);
                                  else next.add(t.id);
                                  return next;
                                });
                              }}
                            >
                              {selectedTemplateIds.has(t.id) && (
                                <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 10">
                                  <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              )}
                            </button>
                            <div className="w-9 h-9 rounded-lg bg-sky-100 flex items-center justify-center shrink-0">
                              <BookOpen className="w-4 h-4 text-sky-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-sm text-slate-800">{t.title}</span>
                                <span className="flex items-center gap-0.5 text-[10.5px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-bold">
                                  <Star className="w-3 h-3" /> {t.defaultPoints} poin
                                </span>
                                {savedFee > 0 && (
                                  <span className="flex items-center gap-0.5 text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-100 px-1.5 py-0.5 rounded-full font-bold">
                                    <Wallet className="w-2.5 h-2.5" /> {fmtIDR(savedFee)}
                                  </span>
                                )}
                                <span className="flex items-center gap-0.5 text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">
                                  <Users className="w-2.5 h-2.5" /> {targetLabel}
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
                                disabled={isInjecting || deploying}
                                onClick={() => void handleInjectToday(t)}
                              >
                                <Zap className="w-3 h-3" />
                                {isInjecting ? "…" : "Inject"}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 border-slate-200 text-slate-600 hover:bg-slate-50 text-xs px-2 gap-1"
                                onClick={() => setDeployingTemplateId(isCustomizing ? null : t.id)}
                              >
                                <Settings2 className="w-3 h-3" />
                                <span className="hidden sm:inline">Kustom</span>
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

                          <AnimatePresence>
                            {isCustomizing && (
                              <DeployForm
                                key={t.id}
                                initialTitle={t.title}
                                initialDescription={t.description}
                                initialPoints={t.defaultPoints}
                                initialFee={savedFee}
                                initialTargetMode={savedTargetMode}
                                initialTargetAgentIds={savedTargetIds}
                                agentNames={agentNames}
                                deploying={deploying}
                                onDeploy={(title, desc, pts, dl, fee, target) =>
                                  handleDeploy(title, desc, pts, dl, fee, target, t.id)
                                }
                                onCancel={() => setDeployingTemplateId(null)}
                              />
                            )}
                          </AnimatePresence>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}

          {/* ── Tab: Misi Aktif ─────────────────────────────────────────── */}
          {tab === "active" && (
            <motion.div key="active" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
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
                    const meta = missionMeta[m.id];
                    const feeIDR = meta?.feeIDR ?? 0;
                    const targets = meta?.targetAgentIds ?? "all";
                    const targetLabel =
                      targets === "all"
                        ? `Semua (${agentCount})`
                        : `${(targets as string[]).length} agen`;
                    const denominator = targets === "all"
                      ? agentCount
                      : (targets as string[]).length;
                    const pct = denominator > 0 ? Math.round((approvedCount / denominator) * 100) : 0;

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
                            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                              <span className="flex items-center gap-1 text-[10.5px] text-slate-500">
                                <Star className="w-3 h-3 text-amber-400" /> {m.rewardPoints} poin
                              </span>
                              {feeIDR > 0 && (
                                <span className="flex items-center gap-1 text-[10.5px] text-emerald-700 font-semibold">
                                  <Wallet className="w-3 h-3" /> {fmtIDR(feeIDR)}
                                </span>
                              )}
                              <span className="flex items-center gap-1 text-[10.5px] text-slate-400">
                                <Users className="w-3 h-3" /> {targetLabel}
                              </span>
                            </div>
                            <div className="mt-2 space-y-1">
                              <div className="flex items-center justify-between text-[10.5px] text-slate-500">
                                <span>{approvedCount} / {denominator} agen selesai</span>
                                <span>{pct}%</span>
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
                                  feeIDR={feeIDR}
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
                <p className="text-xs font-semibold text-slate-600">Buat side job baru dan deploy ke agen pilihan.</p>
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
                    <label className="text-xs text-slate-500 mb-1 block">Fee IDR (opsional)</label>
                    <div className="relative">
                      <Wallet className="absolute left-2.5 top-2.5 w-4 h-4 text-emerald-500" />
                      <Input type="number" min={0} value={createFee} onChange={(e) => setCreateFee(e.target.value)} placeholder="0" className="pl-8 bg-white" />
                    </div>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Deadline</label>
                  <Input type="datetime-local" value={createDeadline} onChange={(e) => setCreateDeadline(e.target.value)} className="bg-white text-sm" />
                </div>
                <TargetSelector
                  agentNames={agentNames}
                  mode={createTargetMode}
                  selected={createSelectedAgents}
                  onModeChange={setCreateTargetMode}
                  onToggle={toggleCreateAgent}
                />
                <div className="pt-1 flex justify-end">
                  <Button
                    className="bg-sky-600 hover:bg-sky-700 text-white gap-2"
                    disabled={saving || (createTargetMode === "specific" && createSelectedAgents.size === 0)}
                    onClick={handleDirectCreate}
                  >
                    <Send className="w-4 h-4" />
                    {saving
                      ? "Deploying…"
                      : createTargetMode === "all"
                        ? `Deploy ke Semua (${agentCount})`
                        : `Deploy ke ${createSelectedAgents.size} Agen`}
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
