import { useEffect, useMemo, useRef, useState } from "react";
import {
  Copy, Plus, Pencil, Trash2, Check, Search, MessageSquare,
  ChevronDown, ChevronUp, Sparkles, X, Rocket,
} from "lucide-react";
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
    setSaving(true);
    try {
      if (editTarget) {
        await updateTemplate(editTarget.id, draft);
        toast.success("Template diperbarui!");
      } else {
        await createTemplate(draft);
        toast.success("Template baru disimpan!");
      }
      setFormOpen(false);
      await refresh();
    } catch (err) {
      toast.error(`Gagal simpan: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
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
    setDeleting(true);
    try {
      await deleteTemplate(deleteTarget.id);
      toast.success(`Template "${deleteTarget.title}" dihapus.`);
      setDeleteTarget(null);
      await refresh();
    } catch (err) {
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
          <div className="w-10 h-10 rounded-2xl bg-emerald-50 flex items-center justify-center flex-shrink-0 mt-0.5">
            <MessageSquare className="h-5 w-5 text-emerald-600" />
          </div>
          <div className="min-w-0">
            <h1 className="text-[18px] font-extrabold text-slate-900 leading-tight">
              Template Broadcast
              <span className="text-emerald-600"> Temantiket</span>
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
            className="w-full flex items-center justify-center gap-2 h-11 rounded-2xl bg-emerald-600 active:bg-emerald-700 text-white text-[14px] font-bold shadow-sm transition-colors"
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
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari judul atau isi template..."
              className="w-full h-11 pl-10 pr-10 rounded-2xl border border-slate-200 bg-white text-[14px] text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent shadow-sm transition-all"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center"
              >
                <X className="h-3 w-3 text-slate-600" />
              </button>
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
            emoji="📋"
            count={counts.get("all") ?? 0}
          />
          {BC_CATEGORIES.map((cat) => (
            <TabChip
              key={cat.key}
              active={activeTab === cat.key}
              onClick={() => setActiveTab(cat.key)}
              label={cat.label}
              emoji={cat.emoji}
              count={counts.get(cat.key) ?? 0}
            />
          ))}
        </div>
      </div>

      {/* ── Content ───────────────────────────────────────────────────── */}
      <div className="flex-1 px-4 py-3 pb-24">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
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
          <div className="space-y-2.5">
            {filtered.map((t) => (
              <TemplateCard
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
      </div>

      {/* ── Form Dialog (Add / Edit) ───────────────────────────────────── */}
      <Dialog open={formOpen} onOpenChange={(v) => !v && setFormOpen(false)}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl mx-4 sm:mx-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[15px]">
              <div className="w-7 h-7 rounded-xl bg-emerald-50 flex items-center justify-center">
                <MessageSquare className="h-3.5 w-3.5 text-emerald-600" />
              </div>
              {editTarget ? "Edit Template" : "Tambah Template Baru"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
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

          <DialogFooter className="gap-2 pt-1">
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving} className="rounded-xl h-11">
              Batal
            </Button>
            <Button
              onClick={() => void handleSave()}
              disabled={saving}
              className="bg-emerald-600 hover:bg-emerald-700 rounded-xl h-11 flex-1"
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
              <div className="w-7 h-7 rounded-xl bg-emerald-50 flex items-center justify-center">
                <Copy className="h-3.5 w-3.5 text-emerald-600" />
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

              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 mb-2">
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
              className="bg-emerald-600 hover:bg-emerald-700 rounded-xl h-11 flex-1"
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
  active, onClick, label, emoji, count,
}: { active: boolean; onClick: () => void; label: string; emoji: string; count: number }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 px-3.5 py-2 rounded-2xl text-[12.5px] font-semibold border whitespace-nowrap transition-all flex-shrink-0",
        active
          ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
          : "bg-white text-slate-600 border-slate-200 active:border-emerald-400",
      )}
    >
      <span className="text-[13px]">{emoji}</span>
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
          className="mt-5 inline-flex items-center gap-2 h-11 px-5 rounded-2xl bg-emerald-600 text-white text-[13px] font-bold active:bg-emerald-700 transition-colors"
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
  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3.5 active:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <span className="text-[18px] leading-none">{cat.emoji}</span>
          <span className="text-[13.5px] font-bold text-slate-800">{cat.label}</span>
          <span className={cn("text-[10.5px] font-bold px-2 py-0.5 rounded-full border", cat.color)}>
            {items.length}
          </span>
        </div>
        <div className={cn(
          "w-6 h-6 rounded-full flex items-center justify-center transition-colors",
          open ? "bg-slate-100" : "bg-slate-50",
        )}>
          {open
            ? <ChevronUp className="h-3.5 w-3.5 text-slate-500" />
            : <ChevronDown className="h-3.5 w-3.5 text-slate-500" />}
        </div>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 pt-0.5 space-y-2.5">
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
}) {
  const [expanded, setExpanded] = useState(false);
  const cat = BC_CATEGORIES.find((c) => c.key === template.category)!;
  const vars = extractVariables(template.body);
  const preview = template.body.slice(0, 160);
  const isLong = template.body.length > 160;

  return (
    <motion.div
      layout
      className="rounded-2xl border border-slate-200 bg-slate-50 overflow-hidden"
    >
      {/* Card header */}
      <div className="px-3.5 pt-3 pb-2">
        <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
          <span className={cn("text-[10.5px] font-bold px-2 py-0.5 rounded-full border", cat.color)}>
            {cat.emoji} {cat.label}
          </span>
          {vars.length > 0 && (
            <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
              🔧 {vars.length} var
            </span>
          )}
        </div>
        <h3 className="text-[13.5px] font-bold text-slate-900 leading-snug">
          {template.title}
        </h3>
      </div>

      {/* Body preview */}
      <div className="mx-3.5 mb-2.5 rounded-xl border border-slate-200 bg-white p-3">
        <pre className="text-[11.5px] text-slate-600 whitespace-pre-wrap break-words leading-relaxed font-mono">
          {expanded ? template.body : preview}
          {isLong && !expanded && "…"}
        </pre>
        {isLong && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-[11px] text-emerald-600 font-semibold mt-1.5"
          >
            {expanded ? "Sembunyikan ↑" : "Lihat selengkapnya ↓"}
          </button>
        )}
      </div>

      {/* Actions row */}
      <div className="px-3.5 pb-3.5 flex items-center gap-2">
        {/* Copy button — takes most space */}
        <button
          onClick={onCopy}
          className={cn(
            "flex-1 h-10 rounded-xl flex items-center justify-center gap-1.5 text-[13px] font-bold text-white transition-colors",
            isCopied
              ? "bg-emerald-600"
              : "bg-gradient-to-r from-emerald-500 to-green-600 active:from-emerald-600 active:to-green-700",
          )}
        >
          {isCopied ? (
            <><Check className="h-4 w-4" /> Tercopy!</>
          ) : (
            <><Copy className="h-4 w-4" /> {vars.length > 0 ? "Copy & Isi" : "Copy"}</>
          )}
        </button>

        {/* Edit + Delete — icon only, compact */}
        {canEdit && (
          <>
            <button
              onClick={onEdit}
              className="w-10 h-10 rounded-xl border border-slate-200 bg-white flex items-center justify-center active:bg-slate-50 transition-colors"
              title="Edit"
            >
              <Pencil className="h-4 w-4 text-slate-600" />
            </button>
            <button
              onClick={onDelete}
              className="w-10 h-10 rounded-xl border border-red-100 bg-red-50 flex items-center justify-center active:bg-red-100 transition-colors"
              title="Hapus"
            >
              <Trash2 className="h-4 w-4 text-red-500" />
            </button>
          </>
        )}
      </div>
    </motion.div>
  );
}
