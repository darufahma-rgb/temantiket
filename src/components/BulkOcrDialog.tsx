import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileImage, Loader2, ScanLine, Trash2, Upload, X, Database } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { scanPassport, failedChecksumLabels, disposeOcrWorkerPool } from "@/lib/ocrPassport";
import { useJamaahStore } from "@/store/tripsStore";

// ── Client-side image pre-compression ────────────────────────────────────────
// Resize foto paspor ke maks 1200px width sebelum dikirim ke OCR. MRZ tetap
// terbaca jelas di resolusi ini, tapi waktu Tesseract & ukuran upload turun
// drastis (foto HP 4-8 MB → ~120-250 KB).
async function compressImage(file: File, maxW = 1200, quality = 0.85): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  // Skip kalau file sudah kecil & format JPEG (kemungkinan sudah di-compress).
  if (file.size < 350_000 && /jpe?g/i.test(file.type)) return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file; // fallback: file aneh, biarin OCR yg handle
  }
  const ratio = bitmap.width > maxW ? maxW / bitmap.width : 1;
  const w = Math.max(1, Math.round(bitmap.width * ratio));
  const h = Math.max(1, Math.round(bitmap.height * ratio));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close?.();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  const blob: Blob | null = await new Promise((res) =>
    canvas.toBlob((b) => res(b), "image/jpeg", quality),
  );
  if (!blob || blob.size >= file.size) return file; // gak ada gain → pakai aslinya
  return new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}

interface ScanRow {
  id: string;
  file: File;
  previewUrl: string;
  status: "queued" | "scanning" | "done" | "error";
  progress: number;
  errorMsg?: string;
  mrzValid?: boolean;
  failedChecks?: string[];
  source?: "tesseract" | "openai";
  data: {
    name: string;
    passportNumber: string;
    birthDate: string;
    gender: "L" | "P" | "";
    expiryDate: string;
  };
}

function isRowValid(row: ScanRow): boolean {
  return row.data.name.trim().length > 0 && row.data.passportNumber.trim().length > 0;
}

interface Props {
  open: boolean;
  tripId: string;
  onClose: () => void;
}

// ── Draft persistence ───────────────────────────────────────────────────────
// Simpan hasil scan tahap "review" ke localStorage per-trip biar gak ilang
// kalau user ke-refresh, tutup tab gak sengaja, atau Save All gagal di tengah.
// File foto gak bisa di-serialize ke localStorage → cuma data text yg disimpan.
// Saat restore, baris muncul di tahap review tanpa preview foto (placeholder).
const DRAFT_KEY_PREFIX = "igh:bulk-ocr-draft:";
const DRAFT_VERSION = 1;

interface PersistedRow {
  data: ScanRow["data"];
  mrzValid?: boolean;
  failedChecks?: string[];
  source?: ScanRow["source"];
}
interface PersistedDraft {
  version: number;
  savedAt: number;
  rows: PersistedRow[];
}

function loadDraft(tripId: string): PersistedDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY_PREFIX + tripId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedDraft;
    if (parsed?.version !== DRAFT_VERSION || !Array.isArray(parsed.rows)) return null;
    return parsed;
  } catch {
    return null;
  }
}
function saveDraft(tripId: string, rows: ScanRow[]) {
  try {
    const payload: PersistedDraft = {
      version: DRAFT_VERSION,
      savedAt: Date.now(),
      rows: rows.map((r) => ({
        data: r.data,
        mrzValid: r.mrzValid,
        failedChecks: r.failedChecks,
        source: r.source,
      })),
    };
    localStorage.setItem(DRAFT_KEY_PREFIX + tripId, JSON.stringify(payload));
  } catch {
    /* quota / private mode → silent */
  }
}
function clearDraft(tripId: string) {
  try {
    localStorage.removeItem(DRAFT_KEY_PREFIX + tripId);
  } catch {
    /* noop */
  }
}

const STEPS = [
  { key: "upload", label: "Upload" },
  { key: "scanning", label: "Scanning" },
  { key: "review", label: "Review" },
];

export default function BulkOcrDialog({ open, tripId, onClose }: Props) {
  const addJamaahBulk = useJamaahStore((s) => s.addJamaahBulk);
  const [phase, setPhase] = useState<"upload" | "scanning" | "review">("upload");
  const [rows, setRows] = useState<ScanRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [compressing, setCompressing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    rows.forEach((r) => {
      // PLACEHOLDER_PREVIEW (untuk row dari draft restore) bukan blob URL,
      // jadi gak perlu (dan gak boleh) di-revoke.
      if (r.previewUrl.startsWith("blob:")) URL.revokeObjectURL(r.previewUrl);
    });
    setRows([]);
    setPhase("upload");
    setSaving(false);
    setSaveProgress({ done: 0, total: 0 });
    setCompressing(false);
  }, [rows]);

  const handleClose = () => {
    if (saving) {
      toast.info("Tunggu sampai proses simpan selesai dulu.");
      return;
    }
    // PENTING: jangan hapus draft di sini — user mungkin nutup tab/dialog
    // tanpa save. Draft baru di-clear di handleSaveAll setelah sukses, atau
    // saat user explicitly klik tombol "Hapus semua" di tahap upload.
    reset();
    // Bebasin Tesseract worker pool (free WASM memory) sehabis sesi batch.
    // Async, fire-and-forget — gak block UI close.
    void disposeOcrWorkerPool().catch((e) =>
      console.warn("[bulk-ocr] dispose worker pool failed", e),
    );
    onClose();
  };

  // ── Restore draft saat dialog dibuka ──
  // Cuma restore kalau: dialog baru dibuka + ada draft + state masih kosong.
  // File foto gak bisa di-restore → row muncul di tahap review tanpa preview.
  useEffect(() => {
    if (!open) return;
    if (rows.length > 0) return; // sudah ada data di sesi ini, jangan timpa
    const draft = loadDraft(tripId);
    if (!draft || draft.rows.length === 0) return;
    const restored: ScanRow[] = draft.rows.map((r, i) => ({
      id: `restored-${draft.savedAt}-${i}`,
      // Placeholder file (1x1 transparent png blob) supaya type ScanRow tetap valid;
      // gak akan di-upload karena draft restore lewatin tahap scan & save langsung
      // pakai data text yg ada.
      file: new File([new Uint8Array()], "restored.txt", { type: "text/plain" }),
      previewUrl: "",
      status: "done",
      progress: 100,
      mrzValid: r.mrzValid,
      failedChecks: r.failedChecks,
      source: r.source,
      data: r.data,
    }));
    setRows(restored);
    setPhase("review");
    const ageMin = Math.max(1, Math.round((Date.now() - draft.savedAt) / 60000));
    toast.info(
      `Draft dipulihkan: ${restored.length} jamaah (${ageMin} mnt lalu). Foto perlu di-upload ulang kalau mau diganti.`,
      { duration: 6000 },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tripId]);

  // ── Auto-save draft saat di tahap review ──
  // Debounce 600ms supaya edit cell gak nge-spam localStorage write.
  useEffect(() => {
    if (!open || phase !== "review" || rows.length === 0) return;
    const t = window.setTimeout(() => saveDraft(tripId, rows), 600);
    return () => window.clearTimeout(t);
  }, [open, phase, rows, tripId]);

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (arr.length === 0) { toast.error("Pilih file gambar (JPG/PNG/WEBP)."); return; }
    setCompressing(true);
    const compressId = toast.loading(`Mengoptimasi ${arr.length} foto…`);
    try {
      // ⚡ Compress semua file paralel sebelum dipakai untuk OCR/upload.
      const compressed = await Promise.all(
        arr.map((f) => compressImage(f).catch(() => f)),
      );
      const newRows: ScanRow[] = compressed.map((file, i) => ({
        id: `scan-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
        file,
        previewUrl: URL.createObjectURL(file),
        status: "queued",
        progress: 0,
        data: { name: "", passportNumber: "", birthDate: "", gender: "", expiryDate: "" },
      }));
      setRows((prev) => [...prev, ...newRows]);
      const totalSavedKB = arr.reduce((s, f, i) => s + Math.max(0, f.size - compressed[i].size), 0) / 1024;
      toast.success(
        `${arr.length} foto siap diproses${totalSavedKB > 50 ? ` · hemat ${Math.round(totalSavedKB)} KB` : ""}`,
        { id: compressId },
      );
    } catch (err) {
      console.error(err);
      toast.error("Gagal mengoptimasi sebagian foto.", { id: compressId });
    } finally {
      setCompressing(false);
    }
  }, []);

  const removeRow = (id: string) => {
    setRows((prev) => {
      const row = prev.find((r) => r.id === id);
      if (row) URL.revokeObjectURL(row.previewUrl);
      return prev.filter((r) => r.id !== id);
    });
  };

  const updateRowData = (id: string, field: keyof ScanRow["data"], value: string) => {
    setRows((prev) =>
      prev.map((r) => r.id === id ? { ...r, data: { ...r.data, [field]: value } } : r)
    );
  };

  // ⚡ Parallel scanner: spawn N worker promises that pull from a shared queue.
  // 4 concurrent gives ~2x speedup vs old MAX=2 tanpa risiko OOM Tesseract.
  const startScanning = async () => {
    if (rows.length === 0) { toast.error("Pilih minimal 1 foto paspor."); return; }
    setPhase("scanning");
    const MAX_CONCURRENT = 4;
    const queue = rows.map((r) => ({ id: r.id, file: r.file }));

    const scanOne = async (item: { id: string; file: File }) => {
      setRows((prev) => prev.map((r) => r.id === item.id ? { ...r, status: "scanning", progress: 0 } : r));
      try {
        const result = await scanPassport(item.file, (pct) => {
          setRows((prev) => prev.map((r) => r.id === item.id ? { ...r, progress: pct } : r));
        });
        setRows((prev) => prev.map((r) =>
          r.id === item.id
            ? {
                ...r,
                status: "done",
                progress: 100,
                mrzValid: result.mrzValid,
                failedChecks: failedChecksumLabels(result),
                source: result.source,
                data: { name: result.name || "", passportNumber: result.passportNumber || "", birthDate: result.birthDate || "", gender: result.gender || "", expiryDate: result.expiryDate || "" },
              }
            : r,
        ));
      } catch {
        setRows((prev) => prev.map((r) =>
          r.id === item.id ? { ...r, status: "error", progress: 0, errorMsg: "Gagal scan" } : r,
        ));
      }
    };

    // N worker loops menjalankan Promise.all — semua tetap "paralel" tapi dibatasi ke MAX_CONCURRENT.
    const worker = async () => {
      while (queue.length > 0) {
        const next = queue.shift();
        if (!next) return;
        await scanOne(next);
      }
    };
    await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT, rows.length) }, worker));
  };

  const handleSaveAll = async () => {
    const validRows = rows.filter((r) => r.data.name.trim());
    if (validRows.length === 0) { toast.error("Minimal satu jamaah harus memiliki nama."); return; }
    setSaving(true);
    setSaveProgress({ done: 0, total: validRows.length });
    const drafts = validRows.map((row) => ({
      tripId,
      name: row.data.name.trim(),
      phone: "",
      birthDate: row.data.birthDate,
      passportNumber: row.data.passportNumber.trim(),
      passportExpiry: row.data.expiryDate || undefined,
      gender: row.data.gender,
      photoDataUrl: undefined as string | undefined,
      needsReview: row.mrzValid === false,
    }));
    try {
      // ⚡ SATU kali batch insert (1 round-trip ke Supabase, bukan N kali).
      await addJamaahBulk(drafts, (done, total) => setSaveProgress({ done, total }));
      toast.success(`${drafts.length} jamaah berhasil disimpan.`);
      // Hapus draft hanya setelah save sukses — kalau gagal, draft dipertahanin
      // supaya user bisa retry tanpa kehilangan data.
      clearDraft(tripId);
      setSaving(false);
      reset();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Gagal menyimpan jamaah.";
      toast.error(msg);
      setSaving(false);
    }
  };

  const doneCount = rows.filter((r) => r.status === "done" || r.status === "error").length;
  const validCount = rows.filter(isRowValid).length;
  const phaseIdx = STEPS.findIndex((s) => s.key === phase);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-3xl w-full p-0 overflow-hidden rounded-2xl border border-[hsl(var(--border))] shadow-2xl bg-white flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="px-5 pt-4 pb-3 border-b border-[hsl(var(--border))] shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-xl gradient-primary flex items-center justify-center shrink-0">
              <ScanLine className="h-4 w-4 text-white" />
            </div>
            <div>
              <DialogTitle className="text-[13.5px] font-bold">Bulk OCR Scan Paspor</DialogTitle>
              <p className="text-[10.5px] text-muted-foreground mt-0.5">Upload banyak foto paspor — data otomatis terbaca & bisa dikoreksi</p>
            </div>
          </div>

          {/* Phase stepper */}
          <div className="flex items-center gap-1.5 mt-3">
            {STEPS.map((step, i) => (
              <div key={step.key} className="flex items-center gap-1.5">
                {i > 0 && <div className="h-px w-5 bg-[hsl(var(--border))]" />}
                <div className={cn(
                  "flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-semibold border transition-all",
                  phase === step.key
                    ? "bg-orange-100 text-orange-700 border-orange-200"
                    : phaseIdx > i
                      ? "bg-green-100 text-green-700 border-green-200"
                      : "bg-[hsl(var(--secondary))] text-muted-foreground border-[hsl(var(--border))]"
                )}>
                  {phaseIdx > i
                    ? <CheckCircle2 className="h-2.5 w-2.5" />
                    : <span className="text-[9px] font-bold">{i + 1}</span>
                  }
                  {step.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">

          {/* Upload phase */}
          {phase === "upload" && (
            <div className="space-y-3">
              <div
                className={cn(
                  "border-2 border-dashed rounded-xl cursor-pointer flex flex-col items-center justify-center gap-2 py-8 px-5 text-center transition-all",
                  dragOver ? "border-orange-400 bg-orange-50" : "border-[hsl(var(--border))] hover:border-orange-300 hover:bg-orange-50/30"
                )}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="h-10 w-10 rounded-xl bg-orange-100 flex items-center justify-center">
                  <Upload className="h-4.5 w-4.5 text-orange-600" style={{ height: 18, width: 18 }} />
                </div>
                <div>
                  <p className="text-[12.5px] font-semibold text-[hsl(var(--foreground))]">Drag & drop foto paspor, atau klik untuk pilih</p>
                  <p className="text-[10.5px] text-muted-foreground mt-0.5">Bisa multi-file · JPG, PNG, WEBP · MRZ harus terlihat jelas</p>
                </div>
                <button type="button"
                  className="h-7 px-3 rounded-xl text-[11px] font-semibold border border-orange-200 text-orange-700 bg-white hover:bg-orange-50 transition-colors pointer-events-none flex items-center gap-1.5">
                  <FileImage className="h-3.5 w-3.5" /> Pilih File
                </button>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
                onChange={(e) => e.target.files && addFiles(e.target.files)} />

              {rows.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[11.5px] font-semibold">{rows.length} file dipilih</p>
                    <button type="button" onClick={() => {
                      rows.forEach((r) => { if (r.previewUrl.startsWith("blob:")) URL.revokeObjectURL(r.previewUrl); });
                      setRows([]);
                      // User explicit "Hapus semua" → buang juga draft tersimpan.
                      clearDraft(tripId);
                    }}
                      className="text-[10.5px] text-red-500 hover:text-red-700">Hapus semua</button>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                    {rows.map((row) => (
                      <div key={row.id} className="relative group rounded-xl overflow-hidden border border-[hsl(var(--border))] aspect-[3/4] bg-gray-50">
                        <img src={row.previewUrl} alt="passport" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-1.5">
                          <p className="text-white text-[9px] font-medium truncate w-full">{row.file.name}</p>
                        </div>
                        <button type="button" onClick={(e) => { e.stopPropagation(); removeRow(row.id); }}
                          className="absolute top-1 right-1 h-4 w-4 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Scanning phase */}
          {phase === "scanning" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[12.5px] font-semibold">
                  Memproses… <span className="text-orange-600">{doneCount}/{rows.length}</span>
                </p>
                <div className="flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin text-orange-500" />
                  Maks. 4 scan sekaligus
                </div>
              </div>
              <div className="h-1.5 rounded-full bg-[hsl(var(--secondary))] overflow-hidden">
                <div className="h-full rounded-full bg-orange-400 transition-all duration-300"
                  style={{ width: `${rows.length ? (doneCount / rows.length) * 100 : 0}%` }} />
              </div>
              <div className="space-y-1.5">
                {rows.map((row, idx) => (
                  <div key={row.id} className={cn(
                    "flex items-center gap-3 rounded-xl border px-3 py-2 transition-all",
                    row.status === "scanning" && "border-orange-200 bg-orange-50",
                    row.status === "done" && "border-green-200 bg-green-50",
                    row.status === "error" && "border-red-200 bg-red-50",
                    row.status === "queued" && "border-[hsl(var(--border))] bg-white opacity-50",
                  )}>
                    <img src={row.previewUrl} alt="" className="h-12 w-9 object-cover rounded-lg shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[11px] font-semibold truncate">File {idx + 1}: {row.file.name}</p>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className={cn(
                            "text-[9.5px] font-bold px-1.5 py-0.5 rounded-full",
                            row.status === "queued" && "bg-gray-100 text-gray-500",
                            row.status === "scanning" && "bg-orange-100 text-orange-700",
                            row.status === "done" && "bg-green-100 text-green-700",
                            row.status === "error" && "bg-red-100 text-red-600",
                          )}>
                            {row.status === "queued" && "Antri"}
                            {row.status === "scanning" && (row.progress >= 96 ? "AI…" : row.progress < 28 ? "Init…" : `${row.progress}%`)}
                            {row.status === "done" && (row.source === "openai" ? "✓ AI" : "✓ Selesai")}
                            {row.status === "error" && "✗ Gagal"}
                          </span>
                          {(row.status === "done" || row.status === "error") && (
                            <button type="button" onClick={() => removeRow(row.id)}
                              className="h-5 w-5 rounded-md flex items-center justify-center text-muted-foreground hover:bg-red-50 hover:text-red-500 transition-colors">
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </div>
                      {row.status === "scanning" && (
                        <div className="mt-1 h-1 rounded-full bg-orange-100 overflow-hidden">
                          <div className="h-full rounded-full bg-orange-400 transition-all" style={{ width: `${row.progress}%` }} />
                        </div>
                      )}
                      {(row.status === "done" || row.status === "error") && (
                        <>
                          <div className="mt-1.5 grid grid-cols-1 sm:grid-cols-12 gap-1.5">
                            <Input
                              value={row.data.name}
                              onChange={(e) => updateRowData(row.id, "name", e.target.value)}
                              placeholder="Nama (sesuai paspor) *"
                              className={cn("h-7 text-[11px] rounded-lg sm:col-span-5", !row.data.name.trim() && "border-red-300 bg-red-50/40")}
                            />
                            <Input
                              value={row.data.passportNumber}
                              onChange={(e) => updateRowData(row.id, "passportNumber", e.target.value)}
                              placeholder="No. Paspor *"
                              className={cn("h-7 text-[11px] rounded-lg font-mono sm:col-span-3", !row.data.passportNumber.trim() && "border-orange-300 bg-orange-50/30")}
                            />
                            <Input
                              type="date"
                              value={row.data.birthDate}
                              onChange={(e) => updateRowData(row.id, "birthDate", e.target.value)}
                              title="Tgl. Lahir"
                              className="h-7 text-[11px] rounded-lg sm:col-span-2"
                            />
                            <Input
                              type="date"
                              value={row.data.expiryDate}
                              onChange={(e) => updateRowData(row.id, "expiryDate", e.target.value)}
                              title="Tgl. Expired"
                              className="h-7 text-[11px] rounded-lg sm:col-span-2"
                            />
                          </div>
                          {row.status === "done" && row.mrzValid === false && row.failedChecks && row.failedChecks.length > 0 && (
                            <p className="text-[9.5px] text-red-600 mt-1 flex items-center gap-1">
                              <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
                              MRZ checksum gagal: {row.failedChecks.join(", ")} — cek manual
                            </p>
                          )}
                          {row.status === "error" && (
                            <p className="text-[9.5px] text-red-600 mt-1">Gagal baca MRZ — isi manual di kolom atas</p>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Review phase */}
          {phase === "review" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[12.5px] font-semibold">Review & Koreksi Data</p>
                  <p className="text-[10.5px] text-muted-foreground mt-0.5">
                    {validCount}/{rows.length} baris valid. Klik sel untuk edit.
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                  <span className="text-[10.5px] text-green-700 font-semibold">{validCount} siap simpan</span>
                </div>
              </div>

              <div className="rounded-xl border border-[hsl(var(--border))] overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-[11.5px]">
                    <thead>
                      <tr className="bg-[hsl(var(--secondary))] border-b border-[hsl(var(--border))]">
                        <th className="text-left px-2.5 py-2 text-[10px] font-semibold text-muted-foreground w-12">Foto</th>
                        <th className="text-left px-2.5 py-2 text-[10px] font-semibold text-muted-foreground">Nama *</th>
                        <th className="text-left px-2.5 py-2 text-[10px] font-semibold text-muted-foreground w-32">No. Paspor *</th>
                        <th className="text-left px-2.5 py-2 text-[10px] font-semibold text-muted-foreground w-32">Tgl. Lahir</th>
                        <th className="text-left px-2.5 py-2 text-[10px] font-semibold text-muted-foreground w-24">Gender</th>
                        <th className="text-left px-2.5 py-2 text-[10px] font-semibold text-muted-foreground w-32">Tgl. Expired</th>
                        <th className="px-2.5 py-2 w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[hsl(var(--border))]">
                      {rows.map((row) => {
                        const valid = isRowValid(row);
                        return (
                          <tr key={row.id} className={cn(
                            "group transition-colors",
                            valid ? "bg-white hover:bg-green-50/20" : "bg-red-50/20 hover:bg-red-50/40"
                          )}>
                            <td className="px-2.5 py-1.5">
                              <div className="relative">
                                <img src={row.previewUrl} alt="" className="h-10 w-8 object-cover rounded-lg border border-[hsl(var(--border))]" />
                                {valid && row.mrzValid !== false && <CheckCircle2 className="h-3.5 w-3.5 text-green-500 bg-white rounded-full absolute -top-1 -right-1 shadow-sm" />}
                                {row.mrzValid === false && (
                                  <span
                                    className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-white shadow-sm flex items-center justify-center"
                                    title={`MRZ checksum gagal: ${row.failedChecks?.join(", ")}`}
                                  >
                                    <AlertTriangle className="h-3 w-3 text-red-500" />
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-1.5 py-1.5">
                              <Input value={row.data.name} onChange={(e) => updateRowData(row.id, "name", e.target.value)}
                                placeholder="Nama sesuai paspor"
                                className={cn("h-7 text-[11.5px] rounded-lg", !row.data.name.trim() && "border-red-300 bg-red-50/40")} />
                            </td>
                            <td className="px-1.5 py-1.5">
                              <Input value={row.data.passportNumber} onChange={(e) => updateRowData(row.id, "passportNumber", e.target.value)}
                                placeholder="A1234567"
                                className={cn("h-7 text-[11.5px] rounded-lg font-mono", !row.data.passportNumber.trim() && "border-orange-300 bg-orange-50/30")} />
                            </td>
                            <td className="px-1.5 py-1.5">
                              <Input type="date" value={row.data.birthDate} onChange={(e) => updateRowData(row.id, "birthDate", e.target.value)}
                                className="h-7 text-[11.5px] rounded-lg" />
                            </td>
                            <td className="px-1.5 py-1.5">
                              <Select value={row.data.gender || ""} onValueChange={(v) => updateRowData(row.id, "gender", v)}>
                                <SelectTrigger className="h-7 text-[11.5px] rounded-lg"><SelectValue placeholder="Pilih" /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="L">Laki-laki</SelectItem>
                                  <SelectItem value="P">Perempuan</SelectItem>
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="px-1.5 py-1.5">
                              <Input type="date" value={row.data.expiryDate} onChange={(e) => updateRowData(row.id, "expiryDate", e.target.value)}
                                className="h-7 text-[11.5px] rounded-lg" />
                            </td>
                            <td className="px-1.5 py-1.5">
                              <button type="button" onClick={() => removeRow(row.id)}
                                className="h-6 w-6 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-red-50 hover:text-red-500 transition-colors">
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Save progress bar — muncul cuma pas batch save jalan */}
        {saving && saveProgress.total > 0 && (
          <div className="px-5 py-2 border-t border-[hsl(var(--border))] bg-emerald-50/60 shrink-0">
            <div className="flex items-center justify-between text-[11px] font-semibold text-emerald-800 mb-1.5">
              <span className="flex items-center gap-1.5">
                <Database className="h-3.5 w-3.5 animate-pulse" />
                Menyimpan ke database…
              </span>
              <span className="tabular-nums">
                {saveProgress.done}/{saveProgress.total}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-emerald-100 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-emerald-600 transition-all"
                style={{ width: `${Math.round((saveProgress.done / saveProgress.total) * 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[hsl(var(--border))] flex items-center justify-between gap-3 shrink-0 bg-white/80 backdrop-blur-sm">
          <button type="button" onClick={handleClose} disabled={saving}
            className="h-8 px-4 rounded-xl text-[12px] font-semibold bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--border))] transition-colors disabled:opacity-40">
            Tutup
          </button>

          <div className="flex gap-2">
            {phase === "upload" && (
              <button type="button" onClick={startScanning} disabled={rows.length === 0 || compressing}
                className="h-8 px-4 rounded-xl text-[12px] font-bold text-white flex items-center gap-1.5 transition-all disabled:opacity-40"
                style={{ background: "linear-gradient(135deg,#f97316,#ea580c)" }}>
                {compressing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanLine className="h-3.5 w-3.5" />}
                {compressing ? "Mengoptimasi foto…" : `Mulai Scan (${rows.length} foto)`}
              </button>
            )}
            {phase === "scanning" && (() => {
              const allFinished = rows.length > 0 && rows.every((r) => r.status === "done" || r.status === "error");
              return (
                <button
                  type="button"
                  onClick={() => setPhase("review")}
                  disabled={!allFinished || validCount === 0}
                  className="h-8 px-4 rounded-xl text-[12px] font-bold text-white flex items-center gap-1.5 transition-all disabled:opacity-40"
                  style={{ background: "linear-gradient(135deg,#f97316,#ea580c)" }}
                >
                  {allFinished ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Lanjut ke Review ({validCount}/{rows.length})
                    </>
                  ) : (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Menunggu scan selesai…
                    </>
                  )}
                </button>
              );
            })()}
            {phase === "review" && (
              <button type="button" onClick={handleSaveAll} disabled={saving || validCount === 0}
                className="h-8 px-4 rounded-xl text-[12px] font-bold text-white flex items-center gap-1.5 transition-all disabled:opacity-40"
                style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                {saving ? "Menyimpan…" : `Simpan ${validCount} Jamaah`}
              </button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
