import { useEffect, useMemo, useRef, useState } from "react";
import {
  Copy, Plus, Pencil, Trash2, Check, Search, MessageSquare,
  ChevronDown, ChevronUp, Sparkles, X,
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

// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────

export default function BCTemplates() {
  const user = useAuthStore((s) => s.user);
  const isAgent = user?.role === "agent";
  const canEdit = !isAgent;

  const [templates, setTemplates] = useState<BCTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<BCCategory | "all">("all");

  // Form dialog
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<BCTemplate | null>(null);
  const [draft, setDraft] = useState<BCTemplateDraft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);

  // Copy dialog (untuk isi variabel)
  const [copyTarget, setCopyTarget] = useState<BCTemplate | null>(null);
  const [varValues, setVarValues] = useState<Record<string, string>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<BCTemplate | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── Load ────────────────────────────────────────────────────────────────
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

  // ── Filter & group ───────────────────────────────────────────────────────
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

  // ── Form handlers ────────────────────────────────────────────────────────
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

  // ── Copy handlers ────────────────────────────────────────────────────────
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

  // ── Delete ───────────────────────────────────────────────────────────────
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

  // ── Preview (live) di copy dialog ────────────────────────────────────────
  const livePreview = copyTarget ? applyVariables(copyTarget.body, varValues) : "";

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-extrabold flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-emerald-600" />
            Template BC WhatsApp
          </h1>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            Simpan semua template broadcast WA — visa, tiket, umrah, dll. Klik Copy → langsung paste ke WA.
          </p>
        </div>
        {canEdit && (
          <Button onClick={openAdd} className="bg-emerald-600 hover:bg-emerald-700">
            <Plus className="h-4 w-4 mr-1.5" /> Tambah Template
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari judul atau isi template…"
          className="pl-9 h-9 text-[13px]"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Category tabs */}
      <div className="flex gap-2 flex-wrap">
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

      {/* Content */}
      {loading ? (
        <div className="py-16 text-center text-[12px] text-muted-foreground italic">
          Memuat template…
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <MessageSquare className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-[14px] font-semibold">
            {search ? "Tidak ada template yang cocok" : "Belum ada template"}
          </p>
          <p className="text-[11.5px] text-muted-foreground mt-1">
            {canEdit
              ? "Klik \"Tambah Template\" untuk bikin template BC pertama lo."
              : "Hubungi admin agency lo untuk tambah template."}
          </p>
          {canEdit && !search && (
            <Button onClick={openAdd} className="mt-4 bg-emerald-600 hover:bg-emerald-700">
              <Plus className="h-4 w-4 mr-1.5" /> Tambah Template
            </Button>
          )}
        </div>
      ) : activeTab === "all" ? (
        // Grouped by category
        <div className="space-y-5">
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
        // Single category flat list
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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

      {/* ── Form Dialog (Add / Edit) ─────────────────────────────────────── */}
      <Dialog open={formOpen} onOpenChange={(v) => !v && setFormOpen(false)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-emerald-600" />
              {editTarget ? "Edit Template" : "Tambah Template Baru"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Title + Category */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  Judul Template *
                </Label>
                <Input
                  value={draft.title}
                  onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                  placeholder="Contoh: Info Visa on Arrival Turki"
                  className="h-9 text-[13px]"
                  maxLength={120}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  Kategori *
                </Label>
                <Select
                  value={draft.category}
                  onValueChange={(v) => setDraft((d) => ({ ...d, category: v as BCCategory }))}
                >
                  <SelectTrigger className="h-9 text-[13px]">
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

            {/* Variable suggestions */}
            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                <Sparkles className="h-3 w-3 text-amber-500" />
                Variabel Dinamis — klik untuk sisipkan ke body
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {VAR_SUGGESTIONS.map((v) => (
                  <button
                    key={v.var}
                    type="button"
                    onClick={() =>
                      setDraft((d) => ({ ...d, body: d.body + `{{${v.var}}}` }))
                    }
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-mono font-semibold bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 transition-colors"
                    title={`Sisipkan {{${v.var}}}`}
                  >
                    + {v.label}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground italic">
                Format: <code className="bg-muted px-1 rounded">{"{{NAMA_VARIABEL}}"}</code> — saat
                copy, lo bisa isi nilainya dulu sebelum template di-paste ke WA.
              </p>
            </div>

            {/* Body textarea */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  Isi Template *
                </Label>
                <span className="text-[10px] text-muted-foreground">
                  {draft.body.length} karakter
                  {extractVariables(draft.body).length > 0 && (
                    <> · <span className="text-amber-700 font-bold">{extractVariables(draft.body).length} variabel</span></>
                  )}
                </span>
              </div>
              <Textarea
                value={draft.body}
                onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
                placeholder={"Halo {{NAMA_KLIEN}} 👋\n\nKami ingin menginformasikan bahwa visa Anda sudah siap!\n\n📋 Detail:\n- Jenis Visa: {{JENIS_VISA}}\n- Status: {{STATUS_VISA}}\n\nSilahkan hubungi kami jika ada pertanyaan.\n\nTerima kasih 🙏"}
                className="min-h-[200px] text-[13px] font-mono resize-y leading-relaxed"
              />
            </div>

            {/* Live preview */}
            {draft.body && (
              <div className="rounded-xl border bg-muted/20 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-2">
                  Preview
                </p>
                <pre className="text-[12px] whitespace-pre-wrap leading-relaxed text-foreground break-words">
                  {draft.body}
                </pre>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>
              Batal
            </Button>
            <Button
              onClick={() => void handleSave()}
              disabled={saving}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {saving ? "Menyimpan…" : editTarget ? "Simpan Perubahan" : "Simpan Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Copy Dialog (isi variabel) ───────────────────────────────────── */}
      <Dialog open={!!copyTarget} onOpenChange={(v) => !v && setCopyTarget(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Copy className="h-4 w-4 text-emerald-600" />
              Isi Variabel — {copyTarget?.title}
            </DialogTitle>
          </DialogHeader>

          {copyTarget && (
            <div className="space-y-4 py-2">
              <p className="text-[11.5px] text-muted-foreground">
                Isi variabel di bawah ini untuk personalisasi pesan sebelum di-copy.
              </p>

              {/* Variable inputs */}
              <div className="grid grid-cols-1 gap-2.5">
                {extractVariables(copyTarget.body).map((varName) => (
                  <div key={varName} className="space-y-1">
                    <Label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground font-mono">
                      {varName.replace(/_/g, " ")}
                    </Label>
                    <Input
                      value={varValues[varName] ?? ""}
                      onChange={(e) =>
                        setVarValues((v) => ({ ...v, [varName]: e.target.value }))
                      }
                      placeholder={`Isi ${varName.replace(/_/g, " ").toLowerCase()}…`}
                      className="h-9 text-[13px]"
                    />
                  </div>
                ))}
              </div>

              {/* Live preview */}
              <div className="rounded-xl border bg-emerald-50 border-emerald-200 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700 mb-2">
                  Preview Pesan
                </p>
                <pre className="text-[12px] whitespace-pre-wrap leading-relaxed text-foreground break-words">
                  {livePreview}
                </pre>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCopyTarget(null)}>
              Batal
            </Button>
            <Button
              onClick={handleCopyWithVars}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Copy className="h-4 w-4 mr-1.5" />
              Copy Pesan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm ───────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Template?</AlertDialogTitle>
            <AlertDialogDescription>
              Template <strong>"{deleteTarget?.title}"</strong> akan dihapus permanen.
              Tindakan ini tidak bisa dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); void handleDelete(); }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Menghapus…" : "Ya, Hapus"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function TabChip({
  active, onClick, label, emoji, count,
}: { active: boolean; onClick: () => void; label: string; emoji: string; count: number }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11.5px] font-semibold border transition-all",
        active
          ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
          : "bg-white text-muted-foreground border-border hover:border-emerald-400 hover:text-emerald-700",
      )}
    >
      <span>{emoji}</span>
      {label}
      <span
        className={cn(
          "ml-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full",
          active ? "bg-white/25 text-white" : "bg-muted text-muted-foreground",
        )}
      >
        {count}
      </span>
    </button>
  );
}

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
    <div className="rounded-2xl border overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between p-3 bg-muted/30 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">{cat.emoji}</span>
          <span className="text-[13px] font-bold">{cat.label}</span>
          <span className={cn("text-[10.5px] font-bold px-2 py-0.5 rounded-full border", cat.color)}>
            {items.length} template
          </span>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-2.5">
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
  const preview = template.body.slice(0, 180);
  const isLong = template.body.length > 180;

  return (
    <motion.div
      layout
      className="rounded-xl border bg-white p-3 hover:shadow-md transition-shadow flex flex-col gap-2.5"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-full border", cat.color)}>
              {cat.emoji} {cat.label}
            </span>
            {vars.length > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                🔧 {vars.length} variabel
              </span>
            )}
          </div>
          <h3 className="text-[13px] font-bold mt-1 leading-tight">{template.title}</h3>
        </div>
      </div>

      {/* Body preview */}
      <div
        className="text-[11.5px] text-muted-foreground leading-relaxed bg-muted/20 rounded-lg p-2.5 border font-mono cursor-pointer"
        onClick={() => isLong && setExpanded((v) => !v)}
      >
        <pre className="whitespace-pre-wrap break-words">
          {expanded ? template.body : preview}
          {isLong && !expanded && "…"}
        </pre>
        {isLong && (
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
            className="text-[10.5px] text-primary font-semibold mt-1 hover:underline"
          >
            {expanded ? "Sembunyikan ↑" : "Lihat selengkapnya ↓"}
          </button>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 mt-auto">
        <Button
          size="sm"
          onClick={onCopy}
          className={cn(
            "flex-1 h-8 text-[11.5px]",
            isCopied
              ? "bg-emerald-600 hover:bg-emerald-700"
              : "bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700",
          )}
        >
          {isCopied ? (
            <><Check className="h-3.5 w-3.5 mr-1" /> Tercopy!</>
          ) : (
            <><Copy className="h-3.5 w-3.5 mr-1" /> {vars.length > 0 ? "Copy & Isi" : "Copy"}</>
          )}
        </Button>
        {canEdit && (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={onEdit}
              className="h-8 w-8 p-0"
              title="Edit"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onDelete}
              className="h-8 w-8 p-0 hover:border-destructive hover:text-destructive"
              title="Hapus"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
      </div>
    </motion.div>
  );
}
