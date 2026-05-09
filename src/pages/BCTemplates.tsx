import { useEffect, useMemo, useRef, useState } from "react";
import {
  Copy, Plus, Pencil, Trash2, Check, Search, MessageSquare,
  ChevronDown, ChevronUp, Sparkles, X, Rocket,
  LayoutGrid, Moon, Stamp, BookOpen, Plane, MessageCircle, type LucideProps,
} from "lucide-react";
import type { ComponentType } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
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

  return (
    <div className="flex flex-col min-h-full bg-[#f0f4f8]">

      {/* ── Hero Section ──────────────────────────────────────────────── */}
      <div className="bg-white px-4 pt-5 pb-4 border-b border-slate-100">
        {/* Icon + title */}
        <div className="flex items-start gap-3 mb-3">
          <div className="w-10 h-10 rounded-2xl bg-blue-50 flex items-center justify-center flex-shrink-0 mt-0.5">
            <MessageSquare className="h-5 w-5 text-blue-600" />
          </div>
          <div className="min-w-0">
            <h1 className="text-[18px] font-extrabold text-slate-900 leading-tight">
              Template Broadcast
              <span className="text-blue-600"> Temantiket</span>
            </h1>
            <p className="text-[12px] text-slate-500 mt-0.5 leading-relaxed">
              Pesan siap kirim untuk follow-up, closing & broadcast klien Umrah, Haji & tiket. 🚀
            </p>
          </div>
        </div>

        {/* Add button — full width on mobile */}
        {canEdit && (
          <button
            onClick={openAdd}
            className="w-full flex items-center justify-center gap-2 h-11 rounded-2xl bg-blue-600 active:bg-blue-700 text-white text-[14px] font-bold shadow-sm transition-colors"
          >
            <Plus className="h-4 w-4" />
            Tambah Template
          </button>
        )}
      </div>

      {/* ── Sticky Search + Tabs ───────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-[#f0f4f8] shadow-[0_1px_0_0_rgba(0,0,0,0.06)]">

        {/* Search bar */}
        <div className="px-4 pt-3 pb-2">
          <div className="relative flex items-center">
            <div className="absolute left-3.5 flex items-center justify-center w-7 h-7 rounded-xl bg-blue-50 pointer-events-none">
              <Search className="h-3.5 w-3.5 text-blue-500" />
            </div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari template…"
              className="w-full h-12 pl-12 pr-10 rounded-2xl border border-slate-200 bg-white text-[13.5px] font-medium text-slate-800 placeholder:text-slate-400 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm transition-all"
            />
            {search ? (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 w-6 h-6 rounded-full bg-slate-200 hover:bg-slate-300 flex items-center justify-center transition-colors"
              >
                <X className="h-3 w-3 text-slate-600" />
              </button>
            ) : (
              <span className="absolute right-3.5 text-[10px] font-semibold text-slate-300 select-none hidden sm:block">
                ⌘K
              </span>
            )}
          </div>
        </div>

        {/* Category tabs — horizontal scroll, no wrap */}
        <div
          ref={tabsRef}
          className="flex gap-2 px-4 pb-3 overflow-x-auto scrollbar-none"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          <TabChip
            active={activeTab === "all"}
            onClick={() => setActiveTab("all")}
            label="Semua"
            categoryKey="all"
            count={counts.get("all") ?? 0}
          />
          {BC_CATEGORIES.map((cat) => (
            <TabChip
              key={cat.key}
              active={activeTab === cat.key}
              onClick={() => setActiveTab(cat.key)}
              label={cat.label}
              categoryKey={cat.key}
              count={counts.get(cat.key) ?? 0}
            />
          ))}
        </div>
      </div>

      {/* ── Content ───────────────────────────────────────────────────── */}
      <div className="flex-1 px-4 py-3 pb-24">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-[13px] text-slate-500">Memuat template…</p>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            hasSearch={!!search}
            canEdit={canEdit}
            onAdd={openAdd}
          />
        ) : activeTab === "all" ? (
          <div className="space-y-3">
            {BC_CATEGORIES.map((cat) => {
              const items = grouped.get(cat.key);
              if (!items?.length) return null;
              return (
                <CategorySection
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
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            {filtered.map((t, i) => (
              <TemplateCard
                key={t.id}
                template={t}
                canEdit={canEdit}
                isCopied={copiedId === t.id}
                onCopy={() => handleCopyClick(t)}
                onEdit={() => openEdit(t)}
                onDelete={() => setDeleteTarget(t)}
                isLast={i === filtered.length - 1}
              />
            ))}
          </div>
        )}
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
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                  Preview
                </p>
                <pre className="text-[12px] whitespace-pre-wrap leading-relaxed text-slate-700 break-words">
                  {draft.body}
                </pre>
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
                <p className="text-[10px] font-bold uppercase tracking-wider text-blue-700 mb-2">
                  Preview Pesan
                </p>
                <pre className="text-[12px] whitespace-pre-wrap leading-relaxed text-slate-800 break-words">
                  {livePreview}
                </pre>
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
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      {/* Section header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 transition-colors group"
      >
        <ChevronDown className={cn(
          "h-3.5 w-3.5 text-slate-400 transition-transform shrink-0",
          !open && "-rotate-90"
        )} />
        <Icon className="h-3.5 w-3.5 text-slate-500 shrink-0" />
        <span className="text-[12px] font-semibold text-slate-600 uppercase tracking-wide">{cat.label}</span>
        <span className="text-[11px] text-slate-400 font-medium">{items.length}</span>
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
            <div className="border-t border-slate-100">
              {items.map((t, i) => (
                <TemplateCard
                  key={t.id}
                  template={t}
                  canEdit={canEdit}
                  isCopied={copiedId === t.id}
                  onCopy={() => onCopy(t)}
                  onEdit={() => onEdit(t)}
                  onDelete={() => onDelete(t)}
                  isLast={i === items.length - 1}
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
  template, canEdit, isCopied, onCopy, onEdit, onDelete, isLast,
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
  const lines = template.body.split("\n").filter((l) => l.trim() !== "");
  const isLong = lines.length > PREVIEW_LINES;
  const previewText = expanded ? template.body : lines.slice(0, PREVIEW_LINES).join("\n");

  return (
    <div className={cn("group", !isLast && "border-b border-slate-100")}>
      {/* ── Main row ── */}
      <div className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50/70 transition-colors">

        {/* Page icon */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 w-5 h-5 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
        >
          <ChevronDown className={cn(
            "h-3.5 w-3.5 transition-transform",
            !expanded && "-rotate-90"
          )} />
        </button>

        {/* Title — click row to expand */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex-1 min-w-0 text-left flex items-center gap-2"
        >
          <span className="text-[13px] font-medium text-slate-800 truncate leading-none">
            {template.title}
          </span>
          {vars.length > 0 && (
            <span className="shrink-0 text-[9.5px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 border border-amber-200 leading-none">
              {vars.length} var
            </span>
          )}
        </button>

        {/* Actions — always visible on mobile, visible on hover desktop */}
        <div className="flex items-center gap-1 shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
          {canEdit && (
            <>
              <button
                onClick={onEdit}
                title="Edit"
                className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-slate-100 active:bg-slate-200 transition-colors"
              >
                <Pencil className="h-3.5 w-3.5 text-slate-400" />
              </button>
              <button
                onClick={onDelete}
                title="Hapus"
                className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-red-50 active:bg-red-100 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5 text-slate-400 hover:text-red-500" />
              </button>
            </>
          )}

          {/* Copy button */}
          <button
            onClick={onCopy}
            title={vars.length > 0 ? "Copy & Isi Variabel" : "Copy ke clipboard"}
            className={cn(
              "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[11px] font-semibold transition-colors",
              isCopied
                ? "bg-emerald-500 text-white"
                : "bg-blue-500 hover:bg-blue-600 text-white active:bg-blue-700",
            )}
          >
            {isCopied
              ? <><Check className="h-3 w-3" /> Copied</>
              : <><Copy className="h-3 w-3" /> Copy</>}
          </button>
        </div>
      </div>

      {/* ── Expanded body ── */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="pl-10 pr-4 pb-3">
              {/* Category badge */}
              <div className="flex items-center gap-1.5 mb-2">
                <span className={cn(
                  "inline-flex items-center gap-1 text-[9.5px] font-semibold px-1.5 py-0.5 rounded border leading-none",
                  cat.color,
                )}>
                  <CatIcon className="h-2.5 w-2.5" />
                  {cat.label}
                </span>
              </div>

              {/* Body */}
              <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5">
                <WAMarkdown text={previewText} />
                {isLong && (
                  <button
                    onClick={() => setExpanded((v) => !v)}
                    className="text-[10.5px] text-blue-500 font-semibold mt-2 block hover:text-blue-700 transition-colors"
                  >
                    {expanded ? "Sembunyikan ↑" : "Lihat selengkapnya ↓"}
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
