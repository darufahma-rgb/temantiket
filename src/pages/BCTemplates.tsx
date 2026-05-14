import { useEffect, useMemo, useRef, useState } from "react";
import {
  Copy, Plus, Pencil, Trash2, Check, Search, MessageSquare,
  ChevronDown, ChevronUp, Sparkles, X, Rocket,
  LayoutGrid, Moon, Stamp, BookOpen, Plane, MessageCircle, type LucideProps,
  ArrowLeft, SlidersHorizontal, ChevronRight, TrendingUp, MoreVertical,
  ChevronLeft, FileText, Layers, Tag, Eye, Send,
} from "lucide-react";
import { PieChart, Pie, Cell } from "recharts";
import type { ComponentType } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { MarkdownContent } from "@/components/MarkdownContent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  listTemplates, createTemplate, updateTemplate, deleteTemplate,
  extractVariables, applyVariables,
  BC_CATEGORIES, type BCTemplate, type BCTemplateDraft, type BCCategory,
} from "@/features/bcTemplates/bcTemplatesRepo";
import { useAuthStore } from "@/store/authStore";
import { useAIContextStore } from "@/store/aiContextStore";

const CATEGORY_ICONS: Record<string, ComponentType<LucideProps>> = {
  all:             LayoutGrid,
  umrah:           Moon,
  haji:            Moon,
  visa_on_arrival: Stamp,
  visa_pelajar:    BookOpen,
  tiket_pesawat:   Plane,
  general:         MessageCircle,
};

const EMPTY_DRAFT: BCTemplateDraft = {
  title: "",
  category: "umrah",
  body: "",
};

const VAR_SUGGESTIONS: { label: string; var: string }[] = [
  { label: "Nama Klien",        var: "NAMA_KLIEN" },
  { label: "No. Order",         var: "NO_ORDER" },
  { label: "Jenis Visa",        var: "JENIS_VISA" },
  { label: "No. Penerbangan",   var: "NO_PENERBANGAN" },
  { label: "Tanggal Terbang",   var: "TGL_BERANGKAT" },
  { label: "Tanggal Pulang",    var: "TGL_PULANG" },
  { label: "Maskapai",          var: "MASKAPAI" },
  { label: "Rute",              var: "RUTE" },
  { label: "Status Visa",       var: "STATUS_VISA" },
  { label: "No. Paspor",        var: "NO_PASPOR" },
  { label: "Nama Paket",        var: "NAMA_PAKET" },
  { label: "Harga",             var: "HARGA" },
  { label: "Tanggal Kedaluwarsa", var: "TGL_EXPIRED" },
  { label: "Link Pembayaran",   var: "LINK_BAYAR" },
  { label: "Nama Agen",         var: "NAMA_AGEN" },
  { label: "WA Agen",           var: "WA_AGEN" },
];

export default function BCTemplates() {
  const user = useAuthStore((s) => s.user);
  const isAgent = user?.role === "agent";
  const canEdit = !isAgent;

  const [templates, setTemplates] = useState<BCTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<BCCategory | "all">("all");

  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<BCTemplate | null>(null);
  const [draft, setDraft] = useState<BCTemplateDraft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);

  const [copyTarget, setCopyTarget] = useState<BCTemplate | null>(null);
  const [varValues, setVarValues] = useState<Record<string, string>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<BCTemplate | null>(null);
  const [deleting, setDeleting] = useState(false);

  const tabsRef = useRef<HTMLDivElement>(null);

  // ── AITEM context wiring ─────────────────────────────────────────────────
  const { setPageContext, setActiveItem, setOnApplyEdit, setPageData, clearContext } = useAIContextStore();

  useEffect(() => {
    setPageContext({ pageId: "bc-templates", pageTitle: "Template Broadcast" });
    return () => clearContext();
  }, [setPageContext, clearContext]);

  useEffect(() => {
    if (formOpen && editTarget) {
      setActiveItem({
        id: editTarget.id,
        title: editTarget.title,
        content: editTarget.body,
        type: "bc_template",
      });
      setOnApplyEdit((newBody: string) => {
        setDraft((prev) => ({ ...prev, body: newBody }));
        toast.success("Template diperbarui oleh AITEM — klik Simpan untuk menyimpan 💾");
      });
    } else if (copyTarget) {
      setActiveItem({
        id: copyTarget.id,
        title: copyTarget.title,
        content: copyTarget.body,
        type: "bc_template",
      });
      setOnApplyEdit(null);
    } else {
      setActiveItem(null);
      setOnApplyEdit(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formOpen, editTarget?.id, copyTarget?.id]);

  const refresh = async () => {
    try {
      const list = await listTemplates();
      setTemplates(list);
    } catch (err) {
      toast.error(`Gagal load template: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  useEffect(() => {
    setPageData({
      totalTemplates: templates.length,
      templates: templates.slice(0, 15).map((t) => ({
        id: t.id,
        title: t.title,
        category: t.category,
        bodyPreview: t.body.slice(0, 100),
      })),
    });
  }, [templates.length, setPageData]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return templates.filter((t) => {
      const matchSearch = !q || t.title.toLowerCase().includes(q) || t.body.toLowerCase().includes(q);
      const matchTab = activeTab === "all" || t.category === activeTab;
      return matchSearch && matchTab;
    });
  }, [templates, search, activeTab]);

  const grouped = useMemo(() => {
    const map = new Map<BCCategory, BCTemplate[]>();
    for (const t of filtered) {
      const arr = map.get(t.category) ?? [];
      arr.push(t);
      map.set(t.category, arr);
    }
    return map;
  }, [filtered]);

  const counts = useMemo(() => {
    const m = new Map<BCCategory | "all", number>();
    m.set("all", templates.length);
    for (const cat of BC_CATEGORIES) {
      m.set(cat.key, templates.filter((t) => t.category === cat.key).length);
    }
    return m;
  }, [templates]);

  const openAdd = () => {
    setEditTarget(null);
    setDraft(EMPTY_DRAFT);
    setFormOpen(true);
  };
  const openEdit = (t: BCTemplate) => {
    setEditTarget(t);
    setDraft({ title: t.title, category: t.category, body: t.body, sortOrder: t.sortOrder });
    setFormOpen(true);
  };
  const handleSave = async () => {
    if (!draft.title.trim()) { toast.error("Judul template wajib diisi."); return; }
    if (!draft.body.trim()) { toast.error("Isi template wajib diisi."); return; }

    const now = new Date().toISOString();

    if (editTarget) {
      // Optimistic update: patch state instantly, close form, sync in background
      const optimistic: BCTemplate = { ...editTarget, ...draft, updatedAt: now };
      setTemplates((prev) => prev.map((t) => t.id === editTarget.id ? optimistic : t));
      setFormOpen(false);
      setSaving(true);
      try {
        const real = await updateTemplate(editTarget.id, draft);
        setTemplates((prev) => prev.map((t) => t.id === editTarget.id ? real : t));
        toast.success("Template diperbarui!");
      } catch (err) {
        // Revert on failure
        setTemplates((prev) => prev.map((t) => t.id === editTarget.id ? editTarget : t));
        toast.error(`Gagal simpan: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setSaving(false);
      }
    } else {
      // Optimistic insert: add temp item instantly, close form, sync in background
      const tempId = `bct-opt-${Date.now()}`;
      const optimistic: BCTemplate = {
        ...draft,
        id: tempId,
        agencyId: user?.agencyId ?? "local",
        sortOrder: draft.sortOrder ?? 0,
        createdAt: now,
        updatedAt: now,
      };
      setTemplates((prev) => [optimistic, ...prev]);
      setFormOpen(false);
      setSaving(true);
      try {
        const real = await createTemplate(draft);
        setTemplates((prev) => prev.map((t) => t.id === tempId ? real : t));
        toast.success("Template baru disimpan!");
      } catch (err) {
        // Revert on failure
        setTemplates((prev) => prev.filter((t) => t.id !== tempId));
        toast.error(`Gagal simpan: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setSaving(false);
      }
    }
  };

  const handleCopyClick = (t: BCTemplate) => {
    const vars = extractVariables(t.body);
    if (vars.length === 0) {
      copyToClipboard(t.body, t.id);
    } else {
      setCopyTarget(t);
      setVarValues(Object.fromEntries(vars.map((v) => [v, ""])));
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      toast.success("Template tercopy! Tinggal paste ke WA. ✅");
      setTimeout(() => setCopiedId(null), 2500);
    }).catch(() => {
      toast.error("Gagal copy — coba manual Ctrl+C dari preview.");
    });
  };

  const handleCopyWithVars = () => {
    if (!copyTarget) return;
    const filled = applyVariables(copyTarget.body, varValues);
    copyToClipboard(filled, copyTarget.id);
    setCopyTarget(null);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    // Optimistic remove: dismiss dialog & remove instantly
    setTemplates((prev) => prev.filter((t) => t.id !== target.id));
    setDeleteTarget(null);
    setDeleting(true);
    try {
      await deleteTemplate(target.id);
      toast.success(`Template "${target.title}" dihapus.`);
    } catch (err) {
      // Revert on failure
      setTemplates((prev) => [target, ...prev]);
      toast.error(`Gagal hapus: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDeleting(false);
    }
  };

  const livePreview = copyTarget ? applyVariables(copyTarget.body, varValues) : "";

  // ── Mobile-only UI state ────────────────────────────────────────────────
  const [showMobileFilter, setShowMobileFilter] = useState(false);
  const [mobileMoreMenu, setMobileMoreMenu] = useState<string | null>(null);
  const [mobilePage, setMobilePage] = useState(1);
  const MOBILE_PAGE_SIZE = 5;

  useEffect(() => { setMobilePage(1); }, [search, activeTab]);

  const mobilePaged = filtered.slice((mobilePage - 1) * MOBILE_PAGE_SIZE, mobilePage * MOBILE_PAGE_SIZE);
  const mobilePageCount = Math.ceil(filtered.length / MOBILE_PAGE_SIZE);

  const CAT_GRADIENTS: Record<string, string> = {
    umrah:           "linear-gradient(135deg,#1d4ed8,#7c3aed)",
    haji:            "linear-gradient(135deg,#059669,#065f46)",
    visa_on_arrival: "linear-gradient(135deg,#d97706,#b45309)",
    visa_pelajar:    "linear-gradient(135deg,#4f46e5,#2563eb)",
    tiket_pesawat:   "linear-gradient(135deg,#0284c7,#0369a1)",
    general:         "linear-gradient(135deg,#475569,#334155)",
  };

  return (
    <>
    {/* ══════════════════════════════════════════════════════════
        MOBILE LAYOUT — md:hidden
    ══════════════════════════════════════════════════════════ */}
    <div className="md:hidden min-h-screen bg-[#F0F4FB] pb-28">

      {/* ── TOP HEADER ── */}
      <div className="bg-white px-4 pt-12 pb-4 shadow-sm">
        <div className="flex items-start justify-between gap-3 mb-1">
          <div className="flex items-center gap-3">
            <button
              onClick={() => window.history.back()}
              className="h-9 w-9 rounded-2xl bg-[#F0F4FB] flex items-center justify-center active:opacity-60 transition-opacity shrink-0"
              style={{ WebkitTapHighlightColor: "transparent" }}
            >
              <ArrowLeft className="h-4 w-4 text-[#0f1c3f]" strokeWidth={2} />
            </button>
            <div>
              <h1 className="text-[22px] font-extrabold text-[#0f1c3f] leading-tight">Template Broadcast</h1>
              <p className="text-[11px] text-slate-400 font-medium mt-0.5">Kelola template BC untuk mempermudah pembuatan broadcast.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 mt-1">
            <button
              onClick={() => { setSearch(""); setActiveTab("all"); }}
              className="h-9 px-3 rounded-2xl bg-[#F0F4FB] flex items-center gap-1.5 text-[11px] font-bold text-[#0f1c3f] active:opacity-60 transition-opacity"
              style={{ WebkitTapHighlightColor: "transparent" }}
            >
              Reset
            </button>
            {canEdit && (
              <button
                onClick={openAdd}
                className="h-9 w-9 rounded-2xl flex items-center justify-center text-white shadow-sm active:opacity-80 transition-opacity"
                style={{ background: "linear-gradient(135deg,#0066FF,#0038B8)", WebkitTapHighlightColor: "transparent" }}
              >
                <Plus className="h-4 w-4" strokeWidth={2.5} />
              </button>
            )}
          </div>
        </div>

        {/* Search row */}
        <div className="flex items-center gap-2 mt-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari template berdasarkan nama atau kategori…"
              className="w-full h-11 pl-10 pr-10 rounded-2xl text-[13px] outline-none bg-[#F0F4FB] border border-transparent text-[#0f1c3f] placeholder-slate-400 focus:border-sky-300 focus:ring-2 focus:ring-sky-100 transition-all"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 rounded-full bg-slate-300/40 flex items-center justify-center active:opacity-60">
                <X className="h-3 w-3 text-slate-500" />
              </button>
            )}
          </div>
          <button
            onClick={() => setShowMobileFilter((s) => !s)}
            className={cn(
              "h-11 px-3 rounded-2xl flex items-center gap-1.5 text-[11px] font-bold transition-all active:opacity-60 shrink-0",
              showMobileFilter || activeTab !== "all" ? "bg-[#0066FF] text-white" : "bg-[#F0F4FB] text-[#0f1c3f]"
            )}
            style={{ WebkitTapHighlightColor: "transparent" }}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={2} />
            Filter
            {activeTab !== "all" && (
              <span className="h-4 w-4 rounded-full bg-white text-[#0066FF] text-[9px] font-black flex items-center justify-center">1</span>
            )}
          </button>
        </div>

        {/* Filter panel */}
        <AnimatePresence>
          {showMobileFilter && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.22 }}
              className="overflow-hidden"
            >
              <div className="mt-3 pt-3 border-t border-slate-100">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Filter Kategori</p>
                  {activeTab !== "all" && (
                    <button onClick={() => setActiveTab("all")} className="text-[11px] text-[#0066FF] font-semibold active:opacity-60">
                      Reset Filter
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => { setActiveTab("all"); setShowMobileFilter(false); }}
                    className={cn("h-8 px-3 rounded-full text-[11px] font-bold border transition-all active:scale-95", activeTab === "all" ? "bg-[#0066FF] text-white border-transparent" : "bg-white text-slate-600 border-slate-200")}
                    style={{ WebkitTapHighlightColor: "transparent" }}
                  >
                    Semua
                  </button>
                  {BC_CATEGORIES.map((cat) => (
                    <button
                      key={cat.key}
                      onClick={() => { setActiveTab(cat.key); setShowMobileFilter(false); }}
                      className={cn("h-8 px-3 rounded-full text-[11px] font-bold border transition-all active:scale-95", activeTab === cat.key ? "bg-[#0066FF] text-white border-transparent" : "bg-white text-slate-600 border-slate-200")}
                      style={{ WebkitTapHighlightColor: "transparent" }}
                    >
                      {cat.emoji} {cat.label}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── CATEGORY TABS ── */}
      <div className="bg-white mt-px px-4 pb-3 shadow-sm">
        <div className="flex gap-2 overflow-x-auto scrollbar-none pt-3">
          {([{ key: "all", label: "Semua", emoji: "📋" }, ...BC_CATEGORIES] as { key: BCCategory | "all"; label: string; emoji: string }[]).map((cat) => {
            const count = cat.key === "all" ? templates.length : counts.get(cat.key as BCCategory) ?? 0;
            const active = activeTab === cat.key;
            return (
              <button
                key={cat.key}
                onClick={() => setActiveTab(cat.key)}
                className={cn(
                  "shrink-0 h-9 px-4 rounded-full text-[12px] font-bold flex items-center gap-1.5 whitespace-nowrap transition-all active:scale-95",
                  active ? "text-white shadow-md" : "bg-[#F0F4FB] text-slate-500"
                )}
                style={active ? { background: "linear-gradient(135deg,#0066FF,#0038B8)", WebkitTapHighlightColor: "transparent" } : { WebkitTapHighlightColor: "transparent" }}
              >
                {cat.emoji} {cat.label}
                <span className={cn("text-[9px] font-extrabold px-1.5 py-0.5 rounded-full", active ? "bg-white/25 text-white" : "bg-slate-200 text-slate-500")}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── CONTENT AREA ── */}
      <div className="px-4 pt-5 space-y-5">

        {/* ── STATS CARD ── */}
        <div className="bg-white rounded-3xl px-5 py-4 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[15px] font-extrabold text-[#0f1c3f]">Ringkasan Template</h3>
            <span className="text-[11px] text-slate-400 font-medium">
              {new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" }).format(new Date())}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: "Total",      value: templates.length,  iconBg: "#dbeafe", color: "#0066FF" },
              { label: "Aktif",      value: templates.length,  iconBg: "#d1fae5", color: "#10b981" },
              { label: "Draft",      value: 0,                 iconBg: "#fef3c7", color: "#f59e0b" },
              { label: "Diarsipkan", value: 0,                 iconBg: "#fee2e2", color: "#ef4444" },
            ].map((stat, i) => (
              <div key={i} className="flex flex-col items-center gap-1.5">
                <div className="h-9 w-9 rounded-2xl flex items-center justify-center" style={{ backgroundColor: stat.iconBg }}>
                  <MessageSquare className="h-4 w-4" style={{ color: stat.color }} strokeWidth={1.8} />
                </div>
                <p className="text-[22px] font-black text-[#0f1c3f] tabular-nums leading-none">{stat.value}</p>
                <p className="text-[9px] font-semibold text-slate-400 text-center leading-tight uppercase tracking-wide">{stat.label}</p>
                <div className="flex items-center gap-0.5">
                  <TrendingUp className="h-2.5 w-2.5 text-emerald-400" strokeWidth={2.5} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── DAFTAR TEMPLATE ── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[15px] font-extrabold text-[#0f1c3f]">Daftar Template</h3>
            <span className="text-[11px] font-semibold text-slate-400">
              {filtered.length} template
            </span>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-white rounded-3xl p-4 animate-pulse flex items-start gap-3">
                  <div className="h-14 w-14 rounded-2xl bg-slate-200 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-slate-200 rounded-full w-3/4" />
                    <div className="h-3 bg-slate-100 rounded-full w-1/2" />
                    <div className="h-3 bg-slate-100 rounded-full w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="bg-white rounded-3xl p-8 text-center shadow-sm">
              <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-20 text-slate-400" />
              <p className="text-[13px] font-semibold text-slate-400">
                {search || activeTab !== "all" ? "Template tidak ditemukan" : "Belum ada template"}
              </p>
              {canEdit && !search && activeTab === "all" && (
                <button
                  onClick={openAdd}
                  className="mt-3 text-[12px] text-[#0066FF] font-bold active:opacity-60"
                  style={{ WebkitTapHighlightColor: "transparent" }}
                >
                  + Tambah template pertama
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {mobilePaged.map((t) => {
                const cat = BC_CATEGORIES.find((c) => c.key === t.category);
                const vars = extractVariables(t.body);
                const gradient = CAT_GRADIENTS[t.category] ?? CAT_GRADIENTS.general;
                const previewLines = t.body.split("\n").filter((l) => l.trim()).slice(0, 2).join(" • ");

                return (
                  <div key={t.id} className="bg-white rounded-3xl shadow-sm overflow-hidden">
                    <div className="flex items-stretch gap-0">
                      {/* Thumbnail */}
                      <div
                        className="w-[72px] shrink-0 flex flex-col items-center justify-center px-2 py-3"
                        style={{ background: gradient }}
                      >
                        <MessageSquare className="h-6 w-6 text-white/80 mb-1" strokeWidth={1.5} />
                        <p className="text-white text-[8px] font-extrabold text-center leading-tight uppercase tracking-wide line-clamp-3 px-1">
                          {cat?.label ?? t.category}
                        </p>
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0 p-3">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              {cat && (
                                <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded-full border", cat.color)}>
                                  {cat.emoji} {cat.label}
                                </span>
                              )}
                              {vars.length > 0 && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                                  {vars.length} var
                                </span>
                              )}
                            </div>
                            <h3 className="text-[13px] font-extrabold text-[#0f1c3f] leading-tight line-clamp-2">
                              {t.title}
                            </h3>
                          </div>
                          {/* More menu */}
                          <div className="relative shrink-0">
                            <button
                              onClick={(e) => { e.stopPropagation(); setMobileMoreMenu(mobileMoreMenu === t.id ? null : t.id); }}
                              className="h-7 w-7 rounded-xl flex items-center justify-center text-slate-300 hover:bg-slate-50 hover:text-slate-500 transition-all active:scale-90"
                              style={{ WebkitTapHighlightColor: "transparent" }}
                            >
                              <MoreVertical className="h-3.5 w-3.5" strokeWidth={2} />
                            </button>
                            {mobileMoreMenu === t.id && (
                              <div className="absolute right-0 top-8 z-20 bg-white rounded-2xl shadow-xl border border-slate-100 py-1 min-w-[150px]" onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={() => { handleCopyClick(t); setMobileMoreMenu(null); }}
                                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[12px] font-semibold text-slate-700 hover:bg-[#F0F4FB] transition-colors"
                                >
                                  <Copy className="h-3.5 w-3.5 text-blue-500" /> Copy Template
                                </button>
                                {canEdit && (
                                  <>
                                    <button
                                      onClick={() => { openEdit(t); setMobileMoreMenu(null); }}
                                      className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[12px] font-semibold text-slate-700 hover:bg-[#F0F4FB] transition-colors"
                                    >
                                      <Pencil className="h-3.5 w-3.5 text-sky-500" /> Edit
                                    </button>
                                    <div className="mx-3 border-t border-slate-100 my-1" />
                                    <button
                                      onClick={() => { setDeleteTarget(t); setMobileMoreMenu(null); }}
                                      className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[12px] font-semibold text-red-500 hover:bg-red-50 transition-colors"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" /> Hapus
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {previewLines && (
                          <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-2 mb-2">
                            {previewLines}
                          </p>
                        )}

                        {/* Footer actions */}
                        <div className="flex items-center gap-2 mt-1">
                          <button
                            onClick={() => handleCopyClick(t)}
                            className={cn(
                              "flex items-center gap-1.5 h-7 px-3 rounded-xl text-[11px] font-bold transition-all active:scale-95 flex-1 justify-center",
                              "bg-[#0066FF] text-white"
                            )}
                            style={{ WebkitTapHighlightColor: "transparent" }}
                          >
                            <Copy className="h-3 w-3" strokeWidth={2.5} />
                            {vars.length > 0 ? "Copy & Isi Var" : "Copy"}
                          </button>
                          {canEdit && (
                            <button
                              onClick={() => openEdit(t)}
                              className="h-7 w-7 rounded-xl flex items-center justify-center bg-[#F0F4FB] text-slate-500 active:scale-95 transition-all"
                              style={{ WebkitTapHighlightColor: "transparent" }}
                            >
                              <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── PAGINATION ── */}
          {mobilePageCount > 1 && (
            <div className="flex items-center justify-center gap-3 mt-4 pt-2">
              <button
                onClick={() => setMobilePage((p) => Math.max(1, p - 1))}
                disabled={mobilePage === 1}
                className="h-9 w-9 rounded-2xl bg-white shadow-sm flex items-center justify-center disabled:opacity-40 active:opacity-60 transition-opacity"
                style={{ WebkitTapHighlightColor: "transparent" }}
              >
                <ChevronLeft className="h-4 w-4 text-[#0f1c3f]" strokeWidth={2} />
              </button>
              <div className="flex items-center gap-1.5">
                {Array.from({ length: mobilePageCount }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    onClick={() => setMobilePage(p)}
                    className={cn(
                      "h-8 w-8 rounded-xl text-[12px] font-bold transition-all active:scale-95",
                      p === mobilePage ? "text-white shadow-sm" : "bg-white text-slate-500 shadow-sm"
                    )}
                    style={p === mobilePage ? { background: "linear-gradient(135deg,#0066FF,#0038B8)", WebkitTapHighlightColor: "transparent" } : { WebkitTapHighlightColor: "transparent" }}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setMobilePage((p) => Math.min(mobilePageCount, p + 1))}
                disabled={mobilePage === mobilePageCount}
                className="h-9 w-9 rounded-2xl bg-white shadow-sm flex items-center justify-center disabled:opacity-40 active:opacity-60 transition-opacity"
                style={{ WebkitTapHighlightColor: "transparent" }}
              >
                <ChevronRight className="h-4 w-4 text-[#0f1c3f]" strokeWidth={2} />
              </button>
            </div>
          )}
        </div>

        {/* ── AKSI CEPAT ── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[15px] font-extrabold text-[#0f1c3f]">Aksi Cepat</h3>
            <span className="text-[11px] font-semibold text-[#0066FF] active:opacity-60 cursor-pointer">Lihat Semua</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              {
                icon: <Plus className="h-5 w-5" style={{ color: "#0066FF" }} strokeWidth={1.8} />,
                iconBg: "#dbeafe",
                title: "Template Baru",
                subtitle: "Buat template BC baru",
                action: () => canEdit ? openAdd() : toast.error("Hanya admin yang bisa membuat template"),
              },
              {
                icon: <Layers className="h-5 w-5" style={{ color: "#10b981" }} strokeWidth={1.8} />,
                iconBg: "#d1fae5",
                title: "Duplikasi Template",
                subtitle: "Salin template yang ada",
                action: () => toast.info("Segera hadir"),
              },
              {
                icon: <FileText className="h-5 w-5" style={{ color: "#f59e0b" }} strokeWidth={1.8} />,
                iconBg: "#fef3c7",
                title: "Import Template",
                subtitle: "Import dari file atau teks",
                action: () => toast.info("Segera hadir"),
              },
              {
                icon: <Tag className="h-5 w-5" style={{ color: "#8b5cf6" }} strokeWidth={1.8} />,
                iconBg: "#ede9fe",
                title: "Kelola Kategori",
                subtitle: "Atur kategori template",
                action: () => toast.info("Segera hadir"),
              },
            ].map((item, i) => (
              <button
                key={i}
                onClick={item.action}
                className="bg-white rounded-2xl p-4 shadow-sm flex items-start gap-3 text-left active:opacity-70 transition-opacity"
                style={{ WebkitTapHighlightColor: "transparent" }}
              >
                <div className="h-10 w-10 rounded-2xl flex items-center justify-center shrink-0" style={{ backgroundColor: item.iconBg }}>
                  {item.icon}
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] font-extrabold text-[#0f1c3f] leading-tight">{item.title}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">{item.subtitle}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

      </div>{/* end content area */}

      {/* Backdrop to close more menu */}
      {mobileMoreMenu && (
        <div className="fixed inset-0 z-[9]" onClick={() => setMobileMoreMenu(null)} />
      )}

    </div>{/* end md:hidden */}

    {/* ══════════════════════════════════════════════════════════
        DESKTOP LAYOUT — hidden md:flex — Redesigned 2-col
    ══════════════════════════════════════════════════════════ */}
    <div className="hidden md:flex gap-5 p-5 xl:p-6 max-w-[1440px] mx-auto w-full">

      {/* ─── MAIN COLUMN ─────────────────────────────────────────────── */}
      <motion.div
        className="flex-1 min-w-0"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-blue-100 flex items-center justify-center shrink-0">
              <MessageSquare className="h-7 w-7 text-blue-600" strokeWidth={1.8} />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-[28px] font-black text-slate-900 leading-tight tracking-tight">Template Broadcast</h1>
                <span className="bg-blue-600 text-white text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0">Kelola Template</span>
              </div>
              <p className="text-[13px] text-slate-500">Kelola template pesan siap kirim untuk follow-up, closing &amp; broadcast klien. 🚀</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {canEdit && (
              <button
                onClick={openAdd}
                className="flex items-center gap-2 h-10 pl-4 pr-3 rounded-xl text-white text-[13px] font-bold shadow-md hover:opacity-90 active:scale-95 transition-all"
                style={{ background: "linear-gradient(135deg,#2563eb,#1d4ed8)" }}
              >
                <Plus className="h-4 w-4" strokeWidth={2.5} />
                Tambah Template
                <span className="w-px h-5 bg-white/30 mx-0.5" />
                <ChevronDown className="h-3.5 w-3.5 opacity-80" />
              </button>
            )}
            <button
              onClick={() => toast.info("Import template — segera hadir")}
              className="flex items-center gap-2 h-10 px-4 rounded-xl bg-white border border-slate-200 text-[13px] font-semibold text-slate-600 hover:bg-slate-50 transition-colors shrink-0"
            >
              <FileText className="h-3.5 w-3.5" />
              Import Template
            </button>
          </div>
        </div>

        {/* Search + Filter */}
        <div className="flex items-center gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari template berdasarkan judul atau kategori..."
              className="w-full h-10 pl-9 pr-10 rounded-xl text-[13px] bg-white border border-slate-200 text-slate-700 placeholder-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 rounded-full bg-slate-200 flex items-center justify-center hover:bg-slate-300 transition-colors">
                <X className="h-3 w-3 text-slate-500" />
              </button>
            )}
          </div>
          <button className="flex items-center gap-1.5 h-10 px-3.5 rounded-xl bg-white border border-slate-200 text-[12.5px] font-semibold text-slate-600 hover:bg-slate-50 transition-colors shrink-0">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filter
          </button>
        </div>

        {/* Category tabs */}
        <div className="flex items-center gap-2 mb-5 overflow-x-auto scrollbar-none pb-0.5">
          <button
            onClick={() => setActiveTab("all")}
            className={cn(
              "shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-[12.5px] font-semibold border transition-colors whitespace-nowrap",
              activeTab === "all" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:border-blue-300"
            )}
          >
            Semua
            <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-full", activeTab === "all" ? "bg-white/25 text-white" : "bg-slate-100 text-slate-500")}>
              {templates.length}
            </span>
          </button>
          {BC_CATEGORIES.map((cat) => {
            const count = counts.get(cat.key) ?? 0;
            const active = activeTab === cat.key;
            return (
              <button
                key={cat.key}
                onClick={() => setActiveTab(cat.key)}
                className={cn(
                  "shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-[12.5px] font-semibold border transition-colors whitespace-nowrap",
                  active ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:border-blue-300"
                )}
              >
                {cat.emoji} {cat.label}
                <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-full", active ? "bg-white/25 text-white" : "bg-slate-100 text-slate-500")}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Template list */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 animate-pulse flex items-start gap-4">
                <div className="h-20 w-20 rounded-xl bg-slate-100 shrink-0" />
                <div className="flex-1 space-y-2.5">
                  <div className="h-4 bg-slate-100 rounded w-2/5" />
                  <div className="h-3 bg-slate-100 rounded w-1/3" />
                  <div className="h-3 bg-slate-100 rounded w-full" />
                  <div className="h-3 bg-slate-100 rounded w-3/4" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-slate-300 p-14 text-center">
            <div className="h-14 w-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-3">
              <MessageSquare className="h-6 w-6 text-blue-500" strokeWidth={1.8} />
            </div>
            <p className="text-[14px] font-bold text-slate-700">Tidak ada template</p>
            <p className="text-[12px] text-slate-400 mt-1">
              {search ? "Coba kata kunci lain atau hapus filter." : "Buat template baru untuk memulai."}
            </p>
            {canEdit && !search && (
              <button onClick={openAdd} className="mt-4 inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-[12px] font-bold text-white" style={{ background: "linear-gradient(135deg,#2563eb,#1d4ed8)" }}>
                <Plus className="h-3.5 w-3.5" /> Tambah Template
              </button>
            )}
          </div>
        ) : activeTab === "all" ? (
          <div className="space-y-5">
            {BC_CATEGORIES.map((cat) => {
              const items = grouped.get(cat.key);
              if (!items?.length) return null;
              return (
                <DesktopCategorySection
                  key={cat.key}
                  cat={cat}
                  items={items}
                  canEdit={canEdit}
                  copiedId={copiedId}
                  onCopy={handleCopyClick}
                  onEdit={openEdit}
                  onDelete={setDeleteTarget}
                />
              );
            })}
          </div>
        ) : (
          <div className="space-y-2.5">
            {filtered.map((t) => (
              <DesktopTemplateCard
                key={t.id}
                template={t}
                canEdit={canEdit}
                isCopied={copiedId === t.id}
                onCopy={() => handleCopyClick(t)}
                onEdit={() => openEdit(t)}
                onDelete={() => setDeleteTarget(t)}
              />
            ))}
          </div>
        )}
      </motion.div>

      {/* ─── RIGHT SIDEBAR ───────────────────────────────────────────── */}
      <div className="w-[276px] xl:w-[292px] shrink-0 space-y-4">

        {/* Ringkasan Template */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[13px] font-extrabold text-slate-800">Ringkasan Template</h3>
            <span className="text-[10.5px] text-slate-500 border border-slate-200 px-2 py-0.5 rounded-lg font-medium cursor-pointer hover:bg-slate-50">
              30 Hari Terakhir ▾
            </span>
          </div>
          {templates.length > 0 ? (
            <div className="flex items-center gap-3">
              <div className="shrink-0 relative">
                <PieChart width={116} height={116}>
                  <Pie
                    data={[
                      { value: Math.max(templates.length, 0.01), color: "#10b981" },
                      { value: 0.01, color: "#f59e0b" },
                      { value: 0.01, color: "#94a3b8" },
                    ]}
                    cx={52} cy={52} innerRadius={30} outerRadius={50}
                    paddingAngle={2} dataKey="value" stroke="none"
                  >
                    {["#10b981", "#f59e0b", "#94a3b8"].map((color, i) => (
                      <Cell key={i} fill={color} />
                    ))}
                  </Pie>
                </PieChart>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-[20px] font-black text-slate-800 leading-none">{templates.length}</span>
                  <span className="text-[9px] text-slate-400 font-medium">Total</span>
                </div>
              </div>
              <div className="flex-1 space-y-2">
                {[
                  { label: "Aktif", value: templates.length, color: "#10b981" },
                  { label: "Draft", value: 0, color: "#f59e0b" },
                  { label: "Tidak Aktif", value: 0, color: "#94a3b8" },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                      <span className="text-[11px] text-slate-600">{item.label}</span>
                    </div>
                    <span className="text-[11px] font-bold text-slate-700">
                      {item.value} ({templates.length > 0 ? Math.round((item.value / templates.length) * 100) : 0}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-center text-[12px] text-slate-400 py-6">Belum ada template</p>
          )}
        </div>

        {/* Stat cards */}
        {([
          { label: "Total Digunakan", value: "—", growth: 18, icon: <TrendingUp className="h-4 w-4" style={{ color: "#10b981" }} strokeWidth={1.8} />, iconBg: "#ecfdf5" },
          { label: "Total Terkirim", value: "—", growth: 21, icon: <Send className="h-4 w-4" style={{ color: "#3b82f6" }} strokeWidth={1.8} />, iconBg: "#eff6ff" },
          { label: "Template Dibuat", value: String(templates.length), growth: 14, icon: <Layers className="h-4 w-4" style={{ color: "#8b5cf6" }} strokeWidth={1.8} />, iconBg: "#f5f3ff" },
        ] as Array<{ label: string; value: string; growth: number; icon: React.ReactNode; iconBg: string }>).map((card) => (
          <div key={card.label} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <div className="flex items-start justify-between mb-2">
              <div className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: card.iconBg }}>
                {card.icon}
              </div>
              <TrendingUp className="h-3.5 w-3.5 text-slate-300" />
            </div>
            <p className="text-[11px] text-slate-500 font-medium mb-0.5">{card.label}</p>
            <p className="text-[24px] font-black text-slate-900 leading-none tabular-nums">{card.value}</p>
            <div className="flex items-center gap-1 mt-1.5">
              <span className="text-[10px] font-bold text-emerald-600">+{card.growth}%</span>
              <span className="text-[10px] text-slate-400">vs periode lalu</span>
            </div>
          </div>
        ))}

        {/* AI Promo */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <p className="text-[12.5px] font-extrabold text-slate-800 mb-1">Kelola Template Lebih Cepat</p>
              <p className="text-[11px] text-slate-500 leading-snug">Gunakan AI untuk membuat template pesan yang lebih efektif dan menarik.</p>
              <button
                onClick={() => toast.info("Fitur AI template segera hadir")}
                className="mt-3 flex items-center gap-1.5 h-8 px-3 rounded-lg text-[11px] font-bold text-white transition-all hover:opacity-90 active:scale-95"
                style={{ background: "linear-gradient(135deg,#2563eb,#7c3aed)" }}
              >
                <Sparkles className="h-3 w-3" />
                Buat dengan AI
              </button>
            </div>
            <Sparkles className="h-8 w-8 text-purple-300 shrink-0 opacity-70" />
          </div>
        </div>
      </div>

      {/* ── Form Dialog (Add / Edit) ───────────────────────────────────── */}
      <Dialog open={formOpen} onOpenChange={(v) => !v && setFormOpen(false)}>
        <DialogContent className="max-w-2xl max-h-[92vh] flex flex-col rounded-2xl mx-4 sm:mx-auto p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-slate-100 flex-shrink-0">
            <DialogTitle className="flex items-center gap-2 text-[15px]">
              <div className="w-7 h-7 rounded-xl bg-blue-50 flex items-center justify-center">
                <MessageSquare className="h-3.5 w-3.5 text-blue-600" />
              </div>
              {editTarget ? "Edit Template" : "Tambah Template Baru"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4 px-5 overflow-y-auto flex-1">
            <div className="grid grid-cols-1 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Judul Template *
                </Label>
                <Input
                  value={draft.title}
                  onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                  placeholder="Contoh: Info Visa on Arrival Turki"
                  className="h-11 text-[13px] rounded-xl"
                  maxLength={120}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Kategori *
                </Label>
                <Select
                  value={draft.category}
                  onValueChange={(v) => setDraft((d) => ({ ...d, category: v as BCCategory }))}
                >
                  <SelectTrigger className="h-11 text-[13px] rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BC_CATEGORIES.map((c) => (
                      <SelectItem key={c.key} value={c.key}>
                        {c.emoji} {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Sparkles className="h-3 w-3 text-amber-500" />
                Variabel Dinamis
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {VAR_SUGGESTIONS.map((v) => (
                  <button
                    key={v.var}
                    type="button"
                    onClick={() =>
                      setDraft((d) => ({ ...d, body: d.body + `{{${v.var}}}` }))
                    }
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 active:bg-amber-100 transition-colors"
                  >
                    + {v.label}
                  </button>
                ))}
              </div>
              <p className="text-[10.5px] text-slate-400 italic">
                Format: <code className="bg-slate-100 px-1 rounded">{"{{NAMA_VARIABEL}}"}</code> — saat copy, isi nilainya dulu sebelum paste ke WA.
              </p>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Isi Template *
                </Label>
                <span className="text-[10.5px] text-slate-400">
                  {draft.body.length} karakter
                  {extractVariables(draft.body).length > 0 && (
                    <> · <span className="text-amber-600 font-bold">{extractVariables(draft.body).length} variabel</span></>
                  )}
                </span>
              </div>
              <Textarea
                value={draft.body}
                onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
                placeholder={"Halo {{NAMA_KLIEN}} 👋\n\nVisa Anda sudah siap!\n\n📋 Detail:\n- Jenis: {{JENIS_VISA}}\n- Status: {{STATUS_VISA}}\n\nTerima kasih 🙏"}
                className="min-h-[180px] text-[13px] font-mono resize-y leading-relaxed rounded-xl"
              />
            </div>

            {draft.body && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2.5">
                  Preview
                </p>
                <MarkdownContent content={draft.body} size="sm" />
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 px-5 py-4 border-t border-slate-100 flex-shrink-0 bg-white">
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving} className="rounded-xl h-11">
              Batal
            </Button>
            <Button
              onClick={() => void handleSave()}
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-700 rounded-xl h-11 flex-1"
            >
              {saving ? "Menyimpan…" : editTarget ? "Simpan Perubahan" : "Simpan Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Copy Dialog ───────────────────────────────────────────────── */}
      <Dialog open={!!copyTarget} onOpenChange={(v) => !v && setCopyTarget(null)}>
        <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto rounded-2xl mx-4 sm:mx-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[15px]">
              <div className="w-7 h-7 rounded-xl bg-blue-50 flex items-center justify-center">
                <Copy className="h-3.5 w-3.5 text-blue-600" />
              </div>
              {copyTarget?.title}
            </DialogTitle>
          </DialogHeader>

          {copyTarget && (
            <div className="space-y-3 py-1">
              <p className="text-[12px] text-slate-500">
                Isi variabel untuk personalisasi pesan sebelum di-copy ke WA.
              </p>
              <div className="space-y-2.5">
                {extractVariables(copyTarget.body).map((varName) => (
                  <div key={varName} className="space-y-1">
                    <Label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 font-mono">
                      {varName.replace(/_/g, " ")}
                    </Label>
                    <Input
                      value={varValues[varName] ?? ""}
                      onChange={(e) =>
                        setVarValues((v) => ({ ...v, [varName]: e.target.value }))
                      }
                      placeholder={`Isi ${varName.replace(/_/g, " ").toLowerCase()}…`}
                      className="h-11 text-[13px] rounded-xl"
                    />
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-blue-700 mb-2.5">
                  Preview Pesan
                </p>
                <MarkdownContent content={livePreview} size="sm" />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 pt-1">
            <Button variant="outline" onClick={() => setCopyTarget(null)} className="rounded-xl h-11">
              Batal
            </Button>
            <Button
              onClick={handleCopyWithVars}
              className="bg-blue-600 hover:bg-blue-700 rounded-xl h-11 flex-1"
            >
              <Copy className="h-4 w-4 mr-1.5" />
              Copy Pesan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm ────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent className="rounded-2xl mx-4 sm:mx-auto">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[15px]">Hapus Template?</AlertDialogTitle>
            <AlertDialogDescription className="text-[13px]">
              Template <strong>"{deleteTarget?.title}"</strong> akan dihapus permanen dan tidak bisa dikembalikan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting} className="rounded-xl h-11">Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); void handleDelete(); }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl h-11"
            >
              {deleting ? "Menghapus…" : "Ya, Hapus"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </>
  );
}

// ── TabChip ──────────────────────────────────────────────────────────────────

function TabChip({
  active, onClick, label, categoryKey, count,
}: { active: boolean; onClick: () => void; label: string; categoryKey: string; count: number }) {
  const Icon = CATEGORY_ICONS[categoryKey] ?? MessageCircle;
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 px-3.5 py-2 rounded-2xl text-[12.5px] font-semibold border whitespace-nowrap transition-all flex-shrink-0",
        active
          ? "bg-blue-600 text-white border-blue-600 shadow-sm"
          : "bg-white text-slate-600 border-slate-200 active:border-blue-400",
      )}
    >
      <Icon className={cn("h-3.5 w-3.5 shrink-0", active ? "text-white" : "text-blue-500")} />
      {label}
      <span
        className={cn(
          "text-[10.5px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center",
          active ? "bg-white/25 text-white" : "bg-slate-100 text-slate-500",
        )}
      >
        {count}
      </span>
    </button>
  );
}

// ── EmptyState ───────────────────────────────────────────────────────────────

function EmptyState({
  hasSearch, canEdit, onAdd,
}: { hasSearch: boolean; canEdit: boolean; onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
      <div className="w-16 h-16 rounded-3xl bg-slate-100 flex items-center justify-center mb-4">
        <MessageSquare className="h-7 w-7 text-slate-400" />
      </div>
      <p className="text-[15px] font-bold text-slate-700 mb-1">
        {hasSearch ? "Tidak ada hasil" : "Belum ada template"}
      </p>
      <p className="text-[12.5px] text-slate-500 leading-relaxed max-w-[260px]">
        {hasSearch
          ? "Coba kata kunci lain atau hapus filter pencarian."
          : canEdit
          ? "Buat template BC pertama untuk mempercepat broadcast ke klien."
          : "Hubungi admin agency untuk menambahkan template."}
      </p>
      {canEdit && !hasSearch && (
        <button
          onClick={onAdd}
          className="mt-5 inline-flex items-center gap-2 h-11 px-5 rounded-2xl bg-blue-600 text-white text-[13px] font-bold active:bg-blue-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Tambah Template
        </button>
      )}
    </div>
  );
}

// ── CategorySection ──────────────────────────────────────────────────────────

function CategorySection({
  cat, items, canEdit, copiedId, onCopy, onEdit, onDelete,
}: {
  cat: typeof BC_CATEGORIES[number];
  items: BCTemplate[];
  canEdit: boolean;
  copiedId: string | null;
  onCopy: (t: BCTemplate) => void;
  onEdit: (t: BCTemplate) => void;
  onDelete: (t: BCTemplate) => void;
}) {
  const [open, setOpen] = useState(true);
  const Icon = CATEGORY_ICONS[cat.key] ?? MessageCircle;
  return (
    <div>
      {/* Section header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-1 py-1.5 mb-2 group"
      >
        <ChevronDown className={cn(
          "h-3.5 w-3.5 text-slate-400 transition-transform shrink-0",
          !open && "-rotate-90"
        )} />
        <Icon className="h-3.5 w-3.5 text-slate-500 shrink-0" />
        <span className="text-[12px] font-semibold text-slate-500 uppercase tracking-wider">{cat.label}</span>
        <span className="text-[11px] text-slate-400">{items.length}</span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="space-y-2 mb-3">
              {items.map((t) => (
                <TemplateCard
                  key={t.id}
                  template={t}
                  canEdit={canEdit}
                  isCopied={copiedId === t.id}
                  onCopy={() => onCopy(t)}
                  onEdit={() => onEdit(t)}
                  onDelete={() => onDelete(t)}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── WA Markdown Renderer ─────────────────────────────────────────────────────

function parseInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|`[^`\n]+`)/g;
  let last = 0;
  let match;
  let key = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const raw = match[0];
    if (raw.startsWith("*") && raw.endsWith("*"))
      parts.push(<strong key={key++} className="font-bold text-slate-800">{raw.slice(1, -1)}</strong>);
    else if (raw.startsWith("_") && raw.endsWith("_"))
      parts.push(<em key={key++} className="italic">{raw.slice(1, -1)}</em>);
    else if (raw.startsWith("~") && raw.endsWith("~"))
      parts.push(<s key={key++} className="line-through opacity-60">{raw.slice(1, -1)}</s>);
    else if (raw.startsWith("`") && raw.endsWith("`"))
      parts.push(<code key={key++} className="bg-slate-100 text-blue-700 px-1 py-0.5 rounded text-[10px] font-mono">{raw.slice(1, -1)}</code>);
    last = match.index + raw.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function WAMarkdown({ text, className }: { text: string; className?: string }) {
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];
  let key = 0;

  for (const line of lines) {
    const numberedMatch = line.match(/^(\d+)\.\s(.*)$/);
    const bulletMatch   = line.match(/^[-•]\s(.*)$/);

    if (numberedMatch) {
      nodes.push(
        <div key={key++} className="flex gap-1.5 leading-snug">
          <span className="font-bold text-slate-500 shrink-0 tabular-nums">{numberedMatch[1]}.</span>
          <span>{parseInline(numberedMatch[2])}</span>
        </div>
      );
    } else if (bulletMatch) {
      nodes.push(
        <div key={key++} className="flex gap-1.5 leading-snug">
          <span className="text-slate-400 shrink-0 mt-px">•</span>
          <span>{parseInline(bulletMatch[1])}</span>
        </div>
      );
    } else if (line.trim() === "") {
      nodes.push(<div key={key++} className="h-1.5" />);
    } else {
      nodes.push(
        <div key={key++} className="leading-snug">{parseInline(line)}</div>
      );
    }
  }
  return <div className={cn("text-[11.5px] text-slate-600 space-y-0.5", className)}>{nodes}</div>;
}

// ── TemplateCard ─────────────────────────────────────────────────────────────

function TemplateCard({
  template, canEdit, isCopied, onCopy, onEdit, onDelete,
}: {
  template: BCTemplate;
  canEdit: boolean;
  isCopied: boolean;
  onCopy: () => void;
  onEdit: () => void;
  onDelete: () => void;
  isLast?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const cat = BC_CATEGORIES.find((c) => c.key === template.category)!;
  const vars = extractVariables(template.body);
  const CatIcon = CATEGORY_ICONS[cat.key] ?? MessageCircle;

  const PREVIEW_LINES = 4;
  const allLines = template.body.split("\n");
  const nonEmptyLines = allLines.filter((l) => l.trim() !== "");
  const isLong = nonEmptyLines.length > PREVIEW_LINES;
  const previewText = expanded
    ? template.body
    : allLines.slice(0, PREVIEW_LINES + 2).join("\n");

  return (
    <div className="group rounded-xl border border-slate-200 bg-white overflow-hidden hover:border-slate-300 hover:shadow-sm transition-all">

      {/* ── Body text (notes area) ── */}
      <div className="px-3.5 pt-3 pb-2">
        {/* Title */}
        <p className="text-[13px] font-semibold text-slate-800 leading-snug mb-1.5 line-clamp-1">
          {template.title}
        </p>

        {/* Body preview — rendered markdown */}
        <div className={cn(!expanded && "max-h-[5.5rem] overflow-hidden relative")}>
          <MarkdownContent content={previewText} size="xs" />
          {!expanded && (
            <div className="absolute bottom-0 left-0 right-0 h-5 bg-gradient-to-t from-white to-transparent pointer-events-none" />
          )}
        </div>

        {isLong && !expanded && (
          <button
            onClick={() => setExpanded(true)}
            className="text-[11px] text-blue-500 font-medium mt-1 hover:text-blue-700 transition-colors"
          >
            Lihat semua ↓
          </button>
        )}
        {expanded && (
          <button
            onClick={() => setExpanded(false)}
            className="text-[11px] text-blue-500 font-medium mt-1 hover:text-blue-700 transition-colors"
          >
            Sembunyikan ↑
          </button>
        )}
      </div>

      {/* ── Footer: badge + actions ── */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-slate-100">
        {/* Category badge */}
        <span className={cn(
          "inline-flex items-center gap-1 text-[9.5px] font-semibold px-1.5 py-0.5 rounded border leading-none shrink-0",
          cat.color,
        )}>
          <CatIcon className="h-2.5 w-2.5 shrink-0" />
          {cat.label}
          {vars.length > 0 && (
            <span className="ml-1 text-amber-600">· {vars.length} var</span>
          )}
        </span>

        {/* Action buttons */}
        <div className="flex items-center gap-1 shrink-0">
          {canEdit && (
            <>
              <button
                onClick={onEdit}
                title="Edit"
                className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 active:bg-slate-200 transition-colors"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={onDelete}
                title="Hapus"
                className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-500 active:bg-red-100 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}

          <button
            onClick={onCopy}
            title={vars.length > 0 ? "Copy & Isi Variabel" : "Copy"}
            className={cn(
              "inline-flex items-center gap-1.5 h-7 px-3 rounded-lg text-[11.5px] font-semibold transition-colors",
              isCopied
                ? "bg-emerald-500 text-white"
                : "bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white",
            )}
          >
            {isCopied
              ? <><Check className="h-3.5 w-3.5" />Copied</>
              : <><Copy className="h-3.5 w-3.5" />Copy</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Desktop thumbnail gradients ───────────────────────────────────────────────
const THUMB_GRADIENT: Record<string, string> = {
  umrah:           "linear-gradient(135deg,#0ea5e9,#6366f1)",
  haji:            "linear-gradient(135deg,#10b981,#059669)",
  visa_on_arrival: "linear-gradient(135deg,#8b5cf6,#6d28d9)",
  visa_pelajar:    "linear-gradient(135deg,#4f46e5,#2563eb)",
  tiket_pesawat:   "linear-gradient(135deg,#f97316,#dc2626)",
  general:         "linear-gradient(135deg,#64748b,#334155)",
};

// ── DesktopTemplateCard ───────────────────────────────────────────────────────

function DesktopTemplateCard({
  template, canEdit, isCopied, onCopy, onEdit, onDelete,
}: {
  template: BCTemplate;
  canEdit: boolean;
  isCopied: boolean;
  onCopy: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const cat = BC_CATEGORIES.find((c) => c.key === template.category)!;
  const vars = extractVariables(template.body);

  const plainPreview = template.body
    .replace(/\{\{[A-Z0-9_]+\}\}/g, "...")
    .replace(/[*_~`]/g, "")
    .split("\n")
    .filter((l) => l.trim())
    .slice(0, 3)
    .join(" · ")
    .slice(0, 140);

  const fmtDateTime = (iso: string) =>
    new Intl.DateTimeFormat("id-ID", {
      day: "numeric", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    }).format(new Date(iso));

  const fmtDate = (iso: string) =>
    new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden hover:shadow-md hover:border-blue-200 transition-all group">
      <div className="flex items-stretch">
        {/* Thumbnail */}
        <div
          className="w-[90px] shrink-0 flex items-center justify-center text-[36px] select-none"
          style={{ background: THUMB_GRADIENT[cat.key] ?? THUMB_GRADIENT.general }}
        >
          {cat.emoji}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 px-4 py-3">
          {/* Row 1: title + status */}
          <div className="flex items-start justify-between gap-3 mb-1">
            <p className="text-[14px] font-extrabold text-slate-800 leading-snug line-clamp-1 flex-1">
              {template.title}
            </p>
            <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              Aktif
            </span>
          </div>

          {/* Row 2: category badge + last used */}
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className={cn("inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded border", cat.color)}>
              {cat.label}
            </span>
            <span className="text-[10.5px] text-slate-400">
              Terakhir digunakan: {fmtDateTime(template.updatedAt)}
            </span>
            {vars.length > 0 && (
              <span className="text-[10px] text-amber-600 font-medium">{vars.length} variabel</span>
            )}
          </div>

          {/* Row 3: plain preview */}
          <p className="text-[12px] text-slate-500 leading-snug line-clamp-2 mb-2.5">
            {plainPreview || "(Template kosong)"}
          </p>

          {/* Row 4: stats */}
          <div className="flex items-center gap-5 text-[11px] border-t border-slate-100 pt-2">
            <div className="flex items-center gap-1">
              <span className="text-slate-400">Digunakan</span>
              <span className="font-bold text-slate-700">—</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-slate-400">Terkirim</span>
              <span className="font-bold text-slate-700">—</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-slate-400">Dibuat</span>
              <span className="font-bold text-slate-700">{fmtDate(template.createdAt)}</span>
            </div>
          </div>
        </div>

        {/* Action column */}
        <div className="flex flex-col items-center justify-center gap-1 px-3 border-l border-slate-100 shrink-0">
          <button
            onClick={() => toast.info("Preview template")}
            title="Preview"
            className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <Eye className="h-4 w-4" />
          </button>
          <button
            onClick={onCopy}
            title={vars.length > 0 ? "Copy & Isi Variabel" : "Copy"}
            className={cn(
              "h-8 w-8 rounded-lg flex items-center justify-center transition-colors",
              isCopied
                ? "bg-emerald-500 text-white"
                : "text-slate-400 hover:bg-slate-100 hover:text-slate-600",
            )}
          >
            {isCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </button>
          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              title="Lainnya"
              className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-1 w-36 bg-white rounded-xl border border-slate-200 shadow-lg z-20 overflow-hidden">
                  {canEdit && (
                    <button
                      onClick={() => { onEdit(); setMenuOpen(false); }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-[12px] font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5 text-slate-400" /> Edit
                    </button>
                  )}
                  {canEdit && (
                    <button
                      onClick={() => { onDelete(); setMenuOpen(false); }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-[12px] font-medium text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Hapus
                    </button>
                  )}
                  <button
                    onClick={() => { onCopy(); setMenuOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-[12px] font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <Copy className="h-3.5 w-3.5 text-slate-400" /> Copy
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── DesktopCategorySection ────────────────────────────────────────────────────

function DesktopCategorySection({
  cat, items, canEdit, copiedId, onCopy, onEdit, onDelete,
}: {
  cat: typeof BC_CATEGORIES[number];
  items: BCTemplate[];
  canEdit: boolean;
  copiedId: string | null;
  onCopy: (t: BCTemplate) => void;
  onEdit: (t: BCTemplate) => void;
  onDelete: (t: BCTemplate) => void;
}) {
  const [open, setOpen] = useState(true);
  const Icon = CATEGORY_ICONS[cat.key] ?? MessageCircle;

  return (
    <div>
      {/* Section header */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 group"
        >
          <ChevronDown className={cn(
            "h-4 w-4 text-slate-400 transition-transform shrink-0",
            !open && "-rotate-90"
          )} />
          <Icon className="h-4 w-4 text-slate-500 shrink-0" />
          <span className="text-[12px] font-bold text-slate-600 uppercase tracking-wider">
            {cat.label.toUpperCase()}
          </span>
          <span className="text-[11.5px] font-bold text-slate-400">{items.length}</span>
        </button>
        <button className="text-[11px] text-blue-600 font-semibold hover:text-blue-700 transition-colors">
          Lihat semua
        </button>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="space-y-2.5 mb-2">
              {items.map((t) => (
                <DesktopTemplateCard
                  key={t.id}
                  template={t}
                  canEdit={canEdit}
                  isCopied={copiedId === t.id}
                  onCopy={() => onCopy(t)}
                  onEdit={() => onEdit(t)}
                  onDelete={() => onDelete(t)}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
