import { useEffect, useRef, useState } from "react";
import { FileUp, Trash2, Download, MessageCircle, FolderOpen, X, Loader2, Eye } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  listClientDocs, createClientDoc, deleteClientDoc,
  CLIENT_DOC_CATEGORIES, type ClientDoc, type ClientDocCategory,
} from "@/features/clients/clientDocsRepo";
import {
  normalizePhoneForWa, buildMemberSlug, buildPublicMemberUrl,
} from "@/lib/memberSlug";
import type { Client } from "@/store/clientsStore";

const MAX_FILE_BYTES = 4 * 1024 * 1024; // 4 MB

function buildDocWhatsAppText(opts: {
  clientName: string;
  category: ClientDocCategory;
  memberCardUrl: string;
}): string {
  const firstName = opts.clientName.trim().split(/\s+/)[0] || "Sahabat";
  const catLabel = CLIENT_DOC_CATEGORIES.find((c) => c.key === opts.category)?.label ?? "Dokumen";
  return (
    `Halo ${firstName}! 👋\n\n` +
    `Berikut dokumen *${catLabel}* kamu yang sudah kami proses. ` +
    `Silakan simpan baik-baik ya!\n\n` +
    `📋 Cek semua dokumen & riwayat perjalanan kamu di Member Card Temantiket:\n` +
    `🔗 ${memberCardUrl}\n\n` +
    `Ada pertanyaan? Hubungi kami kapan saja. ✈️\n` +
    `— Temantiket`
  );
}

function buildDocWhatsAppUrl(opts: {
  phone?: string | null;
  clientName: string;
  category: ClientDocCategory;
  memberCardUrl: string;
}): string {
  const text = buildDocWhatsAppText(opts);
  const recipient = normalizePhoneForWa(opts.phone);
  const encoded = encodeURIComponent(text);
  return recipient
    ? `https://wa.me/${recipient}?text=${encoded}`
    : `https://wa.me/?text=${encoded}`;
}

function downloadDoc(doc: ClientDoc) {
  const link = document.createElement("a");
  link.href = doc.dataUrl;
  link.download = doc.fileName || `${doc.category}-${doc.id}`;
  link.click();
}

// ── Upload dialog ──────────────────────────────────────────────────────────
function UploadDialog({
  open,
  clientId,
  onOpenChange,
  onUploaded,
}: {
  open: boolean;
  clientId: string;
  onOpenChange: (v: boolean) => void;
  onUploaded: (doc: ClientDoc) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState<ClientDocCategory>("paspor");
  const [label, setLabel] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setCategory("paspor");
      setLabel("");
      setFile(null);
      setPreview("");
      setSaving(false);
    }
  }, [open]);

  const handleFile = (f: File) => {
    if (f.size > MAX_FILE_BYTES) {
      toast.error("File terlalu besar", { description: "Maksimal 4 MB per dokumen." });
      return;
    }
    setFile(f);
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(f);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const catInfo = CLIENT_DOC_CATEGORIES.find((c) => c.key === category)!;

  const handleSave = async () => {
    if (!file || !preview) { toast.error("Pilih file terlebih dahulu"); return; }
    setSaving(true);
    try {
      const isImg = file.type.startsWith("image/");
      const doc = await createClientDoc({
        clientId,
        category,
        label: label.trim() || catInfo.label,
        fileName: file.name,
        fileType: isImg ? "image" : "pdf",
        dataUrl: preview,
      });
      toast.success(`Dokumen ${catInfo.label} berhasil disimpan!`);
      onUploaded(doc);
      onOpenChange(false);
    } catch (e) {
      toast.error("Gagal simpan dokumen", { description: e instanceof Error ? e.message : "Coba lagi." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Upload Dokumen Klien</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Kategori</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as ClientDocCategory)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CLIENT_DOC_CATEGORIES.map((c) => (
                    <SelectItem key={c.key} value={c.key}>
                      {c.emoji} {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Label (opsional)</Label>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={`Mis. "Paspor Baru"`}
                className="h-9"
              />
            </div>
          </div>

          <div
            role="button"
            tabIndex={0}
            className={cn(
              "relative rounded-xl border-2 border-dashed p-4 text-center cursor-pointer transition-colors",
              file
                ? "border-sky-300 bg-sky-50"
                : "border-border hover:border-sky-300 hover:bg-sky-50/50",
            )}
            onClick={() => fileRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onKeyDown={(e) => e.key === "Enter" && fileRef.current?.click()}
          >
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
            {preview && file?.type.startsWith("image/") ? (
              <div className="relative">
                <img src={preview} alt="preview" className="max-h-40 mx-auto rounded-lg object-contain" />
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setFile(null); setPreview(""); }}
                  className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-red-500 text-white flex items-center justify-center"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : file ? (
              <div className="flex items-center justify-center gap-2 py-2">
                <span className="text-2xl">📄</span>
                <span className="text-sm font-medium text-sky-700">{file.name}</span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setFile(null); setPreview(""); }}
                  className="h-5 w-5 rounded-full bg-red-100 text-red-600 flex items-center justify-center ml-1"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <div className="py-4">
                <FileUp className="h-7 w-7 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm font-medium text-muted-foreground">
                  Klik atau drag & drop file
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  JPG, PNG, atau PDF · Maks. 4 MB
                </p>
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button disabled={!file || saving} onClick={handleSave}>
            {saving ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Menyimpan…</> : "Simpan Dokumen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Preview dialog ──────────────────────────────────────────────────────────
function PreviewDialog({ doc, open, onOpenChange }: { doc: ClientDoc | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  if (!doc) return null;
  const isImg = doc.fileType === "image";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {CLIENT_DOC_CATEGORIES.find((c) => c.key === doc.category)?.emoji} {doc.label || doc.fileName}
          </DialogTitle>
        </DialogHeader>
        <div className="flex items-center justify-center bg-secondary/40 rounded-xl min-h-[200px] max-h-[480px] overflow-auto p-2">
          {isImg ? (
            <img src={doc.dataUrl} alt={doc.label} className="max-w-full max-h-[460px] rounded-lg object-contain" />
          ) : (
            <div className="text-center p-8">
              <span className="text-5xl">📄</span>
              <p className="text-sm text-muted-foreground mt-3">{doc.fileName}</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => downloadDoc(doc)}>
            <Download className="h-3.5 w-3.5 mr-1.5" /> Download
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main component ──────────────────────────────────────────────────────────
interface ClientDocVaultProps {
  client: Client;
  memberIndex: number;
}

export function ClientDocVault({ client, memberIndex }: ClientDocVaultProps) {
  const [docs, setDocs] = useState<ClientDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ClientDoc | null>(null);
  const [previewDoc, setPreviewDoc] = useState<ClientDoc | null>(null);

  const memberCardUrl = buildPublicMemberUrl(buildMemberSlug(client.name, memberIndex));

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listClientDocs(client.id)
      .then((d) => { if (!cancelled) { setDocs(d); setLoading(false); } })
      .catch((e) => {
        if (!cancelled) setLoading(false);
        console.error("[ClientDocVault]", e);
      });
    return () => { cancelled = true; };
  }, [client.id]);

  const handleUploaded = (doc: ClientDoc) => setDocs((prev) => [doc, ...prev]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteClientDoc(deleteTarget.id);
      setDocs((prev) => prev.filter((d) => d.id !== deleteTarget.id));
      toast.success("Dokumen dihapus");
    } catch (e) {
      toast.error("Gagal hapus", { description: e instanceof Error ? e.message : "Coba lagi." });
    } finally {
      setDeleteTarget(null);
    }
  };

  const groupedByCategory = CLIENT_DOC_CATEGORIES.map((cat) => ({
    ...cat,
    docs: docs.filter((d) => d.category === cat.key),
  })).filter((g) => g.docs.length > 0);

  return (
    <section className="rounded-2xl border border-border bg-white p-4 md:p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-xl bg-sky-100 flex items-center justify-center">
            <FolderOpen className="h-4 w-4 text-sky-600" />
          </div>
          <div>
            <h2 className="text-[14px] font-bold text-foreground">Dokumen Klien</h2>
            <p className="text-[11px] text-muted-foreground">Paspor, Visa, Tiket & dokumen penting lainnya</p>
          </div>
        </div>
        <Button size="sm" onClick={() => setUploadOpen(true)}>
          <FileUp className="h-3.5 w-3.5 mr-1.5" /> Upload
        </Button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : docs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-center">
          <FolderOpen className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">Belum ada dokumen tersimpan.</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Upload paspor, visa, atau tiket klien di sini.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => setUploadOpen(true)}>
            <FileUp className="h-3.5 w-3.5 mr-1.5" /> Upload Pertama
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {groupedByCategory.map((cat) => (
            <div key={cat.key}>
              <div className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border mb-2.5", cat.color)}>
                {cat.emoji} {cat.label} ({cat.docs.length})
              </div>
              <AnimatePresence initial={false}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {cat.docs.map((doc) => (
                    <motion.div
                      key={doc.id}
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.18 }}
                      className="flex items-center gap-3 rounded-xl border border-border bg-secondary/30 p-3 group hover:border-sky-200 hover:bg-sky-50/50 transition-colors"
                    >
                      {/* Thumbnail or icon */}
                      <button
                        type="button"
                        onClick={() => { setPreviewDoc(doc); }}
                        className="shrink-0 h-12 w-12 rounded-lg overflow-hidden bg-white border border-border flex items-center justify-center hover:opacity-80 transition-opacity"
                        title="Lihat dokumen"
                      >
                        {doc.fileType === "image" ? (
                          <img src={doc.dataUrl} alt={doc.label} className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-2xl">📄</span>
                        )}
                      </button>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-[12.5px] font-semibold truncate">{doc.label || cat.label}</p>
                        <p className="text-[10.5px] text-muted-foreground truncate">{doc.fileName}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {new Date(doc.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-col gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => { setPreviewDoc(doc); }}
                          title="Lihat"
                          className="h-7 w-7 rounded-lg bg-white border border-border flex items-center justify-center text-muted-foreground hover:text-sky-600 hover:border-sky-300 transition-colors"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => downloadDoc(doc)}
                          title="Download"
                          className="h-7 w-7 rounded-lg bg-white border border-border flex items-center justify-center text-muted-foreground hover:text-sky-600 hover:border-sky-300 transition-colors"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(doc)}
                          title="Hapus"
                          className="h-7 w-7 rounded-lg bg-white border border-border flex items-center justify-center text-muted-foreground hover:text-red-600 hover:border-red-300 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </AnimatePresence>

              {/* WhatsApp send per category */}
              <a
                href={buildDocWhatsAppUrl({
                  phone: client.phone,
                  clientName: client.name,
                  category: cat.key,
                  memberCardUrl,
                })}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 w-full flex items-center justify-center gap-2 h-8 rounded-lg bg-[#25D366]/10 text-[#128C7E] text-[12px] font-semibold border border-[#25D366]/30 hover:bg-[#25D366]/20 transition-colors"
              >
                <MessageCircle className="h-3.5 w-3.5" />
                Kirim Notif {cat.label} ke WhatsApp Klien
              </a>
            </div>
          ))}
        </div>
      )}

      <UploadDialog
        open={uploadOpen}
        clientId={client.id}
        onOpenChange={setUploadOpen}
        onUploaded={handleUploaded}
      />

      <PreviewDialog
        doc={previewDoc}
        open={!!previewDoc}
        onOpenChange={(v) => { if (!v) setPreviewDoc(null); }}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus dokumen ini?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>"{deleteTarget?.label || deleteTarget?.fileName}"</strong> akan dihapus permanen dan tidak bisa dikembalikan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={handleDelete}>
              Ya, Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
