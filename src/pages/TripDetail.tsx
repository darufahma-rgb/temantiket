import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ArrowLeft, Plus, Phone, CalendarDays, CreditCard, Trash2, Users, Camera, Upload, X, FileText, ImageIcon, MapPin, ScanLine, Pencil, Save, ExternalLink, ShieldCheck, Copy, Check, Megaphone } from "lucide-react";
import FlyerDialog from "@/components/FlyerDialog";
import { useTripsStore, useJamaahStore, useDocsStore, type Jamaah, type DocCategory } from "@/store/tripsStore";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { scanPassport, countPassportDataFields, failedChecksumLabels } from "@/lib/ocrPassport";
import { useRegional } from "@/lib/regional";

const DOC_CATEGORIES: { value: DocCategory; label: string }[] = [
  { value: "passport", label: "Paspor / KTP" },
  { value: "visa", label: "Visa" },
  { value: "ticket", label: "Tiket Pesawat" },
  { value: "medical", label: "Dokumen Kesehatan" },
  { value: "other", label: "Lainnya" },
];

function fileToBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

interface UploadedDoc {
  id: string;
  category: DocCategory;
  label: string;
  fileName: string;
  fileType: "image" | "pdf";
  dataUrl: string;
}


// ── ADD JAMAAH DIALOG ──────────────────────────────────────────────────────────
function AddJamaahDialog({ open, tripId, onClose }: { open: boolean; tripId: string; onClose: () => void }) {
  const addJamaah = useJamaahStore((s) => s.addJamaah);
  const addDocument = useDocsStore((s) => s.addDocument);
  const trips = useTripsStore((s) => s.trips);
  const jamaahList = useJamaahStore((s) => s.jamaah);
  const trip = trips.find((t) => t.id === tripId);
  const quotaFull = trip?.quotaPax != null && jamaahList.length >= trip.quotaPax;

  const [form, setForm] = useState({ name: "", phone: "", birthDate: "", passportNumber: "", gender: "" as "L" | "P" | "" });
  const [photoDataUrl, setPhotoDataUrl] = useState<string | undefined>();
  const [uploadedDocs, setUploadedDocs] = useState<UploadedDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [pendingCategory, setPendingCategory] = useState<DocCategory>("passport");
  const [ocrLoading, setOcrLoading] = useState(false);
  const [mrzInvalid, setMrzInvalid] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);

  const photoRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);
  const ocrRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setForm({ name: "", phone: "", birthDate: "", passportNumber: "", gender: "" });
    setPhotoDataUrl(undefined);
    setUploadedDocs([]);
    setPendingCategory("passport");
    setOcrLoading(false);
    setOcrProgress(0);
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) { toast.error("Foto maks. 12 MB."); return; }
    const dataUrl = await fileToBase64(file);
    setPhotoDataUrl(dataUrl);
    e.target.value = "";
  };

  const handleOcrScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setOcrLoading(true);
    setOcrProgress(0);
    try {
      const result = await scanPassport(file, setOcrProgress, { aiOnly: true });
      if (result.checksums && !result.mrzValid) {
        toast.warning(`MRZ checksum gagal: ${failedChecksumLabels(result).join(", ")}. Cek ulang manual sebelum simpan.`, { duration: 6000 });
      }
      setForm((f) => ({
        ...f,
        name: result.name || f.name,
        birthDate: result.birthDate || f.birthDate,
        passportNumber: result.passportNumber || f.passportNumber,
        gender: result.gender || f.gender,
      }));
      setMrzInvalid(result.checksums ? !result.mrzValid : false);
      const fieldsFound = countPassportDataFields(result);
      if (fieldsFound > 0) toast.success(`OCR berhasil! ${fieldsFound} field terisi otomatis.`);
      else toast.warning("Teks MRZ tidak terbaca. Pastikan foto paspor jelas dan terbuka.");
    } catch (err) {
      toast.error(`Gagal memproses paspor: ${(err as Error).message}`, { duration: 7000 });
    } finally {
      setOcrLoading(false);
      e.target.value = "";
    }
  };

  const handleDocChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    for (const file of files) {
      if (file.size > 5 * 1024 * 1024) { toast.error(`File "${file.name}" maks. 5 MB.`); continue; }
      const dataUrl = await fileToBase64(file);
      const fileType: "image" | "pdf" = file.type === "application/pdf" ? "pdf" : "image";
      const label = file.name.replace(/\.[^.]+$/, "");
      setUploadedDocs((prev) => [...prev, {
        id: crypto.randomUUID(),
        category: pendingCategory,
        label,
        fileName: file.name,
        fileType,
        dataUrl,
      }]);
    }
    e.target.value = "";
  };

  const removeDoc = (id: string) => setUploadedDocs((prev) => prev.filter((d) => d.id !== id));
  const changeDocCategory = (id: string, cat: DocCategory) =>
    setUploadedDocs((prev) => prev.map((d) => d.id === id ? { ...d, category: cat } : d));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) { toast.error("Nama jamaah wajib diisi."); return; }
    if (trip?.quotaPax != null && jamaahList.length >= trip.quotaPax) {
      toast.error(`Kuota paket "${trip.name}" sudah penuh (${trip.quotaPax} pax). Tambah kuota dulu di pengaturan paket.`);
      return;
    }
    const snapshot = { ...form };
    const docsSnap = [...uploadedDocs];
    const photoSnap = photoDataUrl;
    const mrzSnap = mrzInvalid;
    // Tutup dialog langsung — save jalan di background
    reset();
    onClose();
    void (async () => {
      try {
        const j = await addJamaah({ ...snapshot, tripId, photoDataUrl: photoSnap, needsReview: mrzSnap });
        for (const doc of docsSnap) {
          await addDocument({
            jamaahId: j.id,
            category: doc.category,
            label: doc.label,
            fileName: doc.fileName,
            fileType: doc.fileType,
            dataUrl: doc.dataUrl,
          });
        }
        toast.success(`Jamaah "${snapshot.name}" ditambahkan${docsSnap.length ? ` dengan ${docsSnap.length} dokumen.` : "."}`);
      } catch {
        toast.error(`Gagal menyimpan "${snapshot.name}". Coba lagi.`);
      }
    })();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="max-w-md p-0 overflow-hidden rounded-2xl border border-[hsl(var(--border))] shadow-xl bg-white">
        {/* Header */}
        <div className="px-5 pt-4 pb-3 border-b border-[hsl(var(--border))] shrink-0">
          <DialogTitle className="text-[14px] font-bold text-[hsl(var(--foreground))]">Tambah Jamaah</DialogTitle>
          <p className="text-[11px] text-[hsl(var(--muted-foreground))] mt-0.5">Data jamaah untuk trip ini</p>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto max-h-[78vh]">
          <div className="px-5 py-4 space-y-3">
            {/* OCR + Photo row */}
            <div className="flex items-center gap-3">
              {/* Avatar */}
              <div className="relative group cursor-pointer shrink-0" onClick={() => photoRef.current?.click()}>
                <div className={cn(
                  "h-14 w-14 rounded-xl flex items-center justify-center overflow-hidden text-white font-bold text-xl",
                  form.gender === "P" ? "bg-gradient-to-br from-pink-400 to-rose-500" : "bg-gradient-to-br from-blue-400 to-indigo-500"
                )}>
                  {photoDataUrl
                    ? <img src={photoDataUrl} className="h-full w-full object-cover" alt="foto" />
                    : <span>{form.name ? form.name.charAt(0).toUpperCase() : "?"}</span>
                  }
                </div>
                <div className="absolute inset-0 rounded-xl bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <Camera strokeWidth={1.5} className="h-4 w-4 text-white" />
                </div>
                {photoDataUrl && (
                  <button type="button"
                    className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600"
                    onClick={(e) => { e.stopPropagation(); setPhotoDataUrl(undefined); }}>
                    <X strokeWidth={2} className="h-2.5 w-2.5" />
                  </button>
                )}
                <input ref={photoRef} type="file" accept="image/png,image/jpeg,image/jpg" className="hidden" onChange={handlePhotoChange} />
              </div>

              {/* OCR banner */}
              <div className="flex-1 rounded-xl border border-orange-200 bg-orange-50/60 px-3 py-2 flex items-center justify-between gap-2">
                <div>
                  <p className="text-[11.5px] font-semibold text-orange-800">Scan Paspor OCR</p>
                  <p className="text-[10px] text-orange-700/80 leading-tight">Isi otomatis dari foto MRZ</p>
                </div>
                <input ref={ocrRef} type="file" accept="image/*" className="hidden" onChange={handleOcrScan} />
                <button type="button"
                  onClick={() => ocrRef.current?.click()}
                  disabled={ocrLoading}
                  className="h-10 sm:h-8 min-w-[64px] px-3 rounded-lg text-[12px] sm:text-[11px] font-semibold border border-orange-200 bg-white text-orange-700 hover:bg-orange-50 active:bg-orange-100 transition-colors disabled:opacity-60 flex items-center gap-1.5 shrink-0 touch-manipulation"
                >
                  <ScanLine strokeWidth={1.5} className="h-4 w-4 sm:h-3 sm:w-3" />
                  {ocrLoading ? (ocrProgress < 35 ? "Memuat…" : `${ocrProgress}%`) : "Scan"}
                </button>
              </div>
            </div>

            {/* Nama */}
            <div className="space-y-1">
              <Label className="text-[10px] font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">Nama Lengkap *</Label>
              <Input className="h-8 text-[12.5px] rounded-xl" placeholder="Nama sesuai paspor" value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} autoFocus />
            </div>

            {/* Gender + No HP */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <Label className="text-[10px] font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">Kelamin</Label>
                <Select value={form.gender} onValueChange={(v) => setForm((f) => ({ ...f, gender: v as "L" | "P" }))}>
                  <SelectTrigger className="h-8 text-[12.5px] rounded-xl"><SelectValue placeholder="Pilih" /></SelectTrigger>
                  <SelectContent style={{ background: "#fff" }}>
                    <SelectItem value="L">Laki-laki</SelectItem>
                    <SelectItem value="P">Perempuan</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">No. HP</Label>
                <Input className="h-8 text-[12.5px] rounded-xl" placeholder="08xx-xxxx" value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
              </div>
            </div>

            {/* Birth + Passport */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <Label className="text-[10px] font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">Tgl. Lahir</Label>
                <Input className="h-8 text-[12.5px] rounded-xl" type="date" value={form.birthDate}
                  onChange={(e) => setForm((f) => ({ ...f, birthDate: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">No. Paspor</Label>
                <Input className="h-8 text-[12.5px] rounded-xl font-mono" placeholder="A1234567" value={form.passportNumber}
                  onChange={(e) => setForm((f) => ({ ...f, passportNumber: e.target.value }))} />
              </div>
            </div>

            {/* Documents */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-[10px] font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">Dokumen</Label>
              </div>
              <div className="flex gap-2">
                <Select value={pendingCategory} onValueChange={(v) => setPendingCategory(v as DocCategory)}>
                  <SelectTrigger className="flex-1 h-8 text-[12px] rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent style={{ background: "#fff" }}>
                    {DOC_CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <button type="button"
                  onClick={() => docRef.current?.click()}
                  className="h-8 px-3 rounded-xl text-[11.5px] font-semibold border border-[hsl(var(--border))] bg-white hover:bg-[hsl(var(--secondary))] transition-colors flex items-center gap-1.5 shrink-0"
                >
                  <Upload strokeWidth={1.5} className="h-3 w-3" /> Upload
                </button>
                <input ref={docRef} type="file" accept="image/png,image/jpeg,image/jpg" multiple className="hidden" onChange={handleDocChange} />
              </div>

              {uploadedDocs.length > 0 ? (
                <div className="space-y-1.5">
                  {uploadedDocs.map((doc) => (
                    <div key={doc.id} className="flex items-center gap-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] p-1.5">
                      <div className="h-8 w-8 rounded-lg overflow-hidden shrink-0 border border-[hsl(var(--border))] bg-white flex items-center justify-center">
                        {doc.fileType === "image"
                          ? <img src={doc.dataUrl} className="h-full w-full object-cover" alt={doc.fileName} />
                          : <FileText strokeWidth={1.5} className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-medium text-[hsl(var(--foreground))] truncate">{doc.fileName}</p>
                        <Select value={doc.category} onValueChange={(v) => changeDocCategory(doc.id, v as DocCategory)}>
                          <SelectTrigger className="h-5 text-[10px] border-0 bg-transparent p-0 shadow-none gap-1 w-auto">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent style={{ background: "#fff" }}>
                            {DOC_CATEGORIES.map((c) => (
                              <SelectItem key={c.value} value={c.value} className="text-xs">{c.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <button type="button" onClick={() => removeDoc(doc.id)}
                        className="h-6 w-6 rounded-lg hover:bg-red-50 hover:text-red-500 flex items-center justify-center text-[hsl(var(--muted-foreground))] transition-colors shrink-0">
                        <X strokeWidth={1.5} className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border-2 border-dashed border-[hsl(var(--border))] py-3 text-center text-[11px] text-[hsl(var(--muted-foreground))]">
                  <ImageIcon strokeWidth={1.5} className="h-5 w-5 mx-auto mb-1 opacity-40" />
                  Belum ada dokumen
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 pb-4 flex gap-2 border-t border-[hsl(var(--border))] pt-3">
            <button type="button" onClick={() => { reset(); onClose(); }}
              className="flex-1 h-9 rounded-xl text-[12.5px] font-semibold bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--border))] transition-colors">
              Batal
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 h-9 rounded-xl text-[12.5px] font-bold text-white transition-all disabled:opacity-50"
              style={{ background: "linear-gradient(135deg,#f97316,#ea580c)" }}>
              {loading ? "Menyimpan…" : "Tambah Jamaah"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── JAMAAH PREVIEW DIALOG ──────────────────────────────────────────────────────
function JamaahPreviewDialog({
  jamaah: person,
  tripId,
  open,
  onClose,
}: {
  jamaah: Jamaah | null;
  tripId: string;
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const { patchJamaah } = useJamaahStore();
  const { docs, fetchDocs } = useDocsStore();
  const { formatDate } = useRegional();
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<Jamaah>>({});
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (person) {
      setForm({ name: person.name, phone: person.phone, birthDate: person.birthDate, passportNumber: person.passportNumber, gender: person.gender });
      fetchDocs(person.id);
    }
    setEditing(false);
    setCopied(false);
  }, [person?.id]);

  if (!person) return null;

  const passportDocs = docs.filter((d) => d.jamaahId === person.id && d.category === "passport");

  const handleSave = () => {
    if (!form.name) { toast.error("Nama wajib diisi."); return; }
    const snapshot = { ...form };
    const personId = person.id;
    // Keluar mode edit langsung — save di background
    setEditing(false);
    void (async () => {
      try {
        await patchJamaah(personId, snapshot);
        toast.success("Data diperbarui.");
      } catch {
        toast.error("Gagal memperbarui data.");
      }
    })();
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) { toast.error("Foto maks. 12 MB."); return; }
    const dataUrl = await fileToBase64(file);
    await patchJamaah(person.id, { photoDataUrl: dataUrl });
    toast.success("Foto diperbarui.");
    e.target.value = "";
  };

  const copyPassport = () => {
    if (!person.passportNumber) return;
    navigator.clipboard.writeText(person.passportNumber).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { setEditing(false); onClose(); } }}>
      <DialogContent className="max-w-sm p-0 overflow-hidden rounded-2xl border border-[hsl(var(--border))] shadow-xl bg-white">
        {/* Gradient banner */}
        <div className={cn(
          "h-20 relative",
          person.gender === "P" ? "bg-gradient-to-r from-pink-400 to-rose-500" : "bg-gradient-to-r from-blue-400 to-indigo-500"
        )}>
          {/* Close button */}
          <button
            onClick={() => { setEditing(false); onClose(); }}
            className="absolute top-3 right-3 h-7 w-7 rounded-full bg-white/20 hover:bg-white/40 flex items-center justify-center transition-colors"
          >
            <X className="h-3.5 w-3.5 text-white" />
          </button>
        </div>

        <div className="px-5 pb-5">
          {/* Avatar row */}
          <div className="flex items-end justify-between -mt-10 mb-4">
            <div className="relative group">
              <div className={cn(
                "h-20 w-20 rounded-2xl border-4 border-white shadow-md overflow-hidden flex items-center justify-center text-white text-3xl font-bold",
                person.gender === "P" ? "bg-gradient-to-br from-pink-400 to-rose-500" : "bg-gradient-to-br from-blue-400 to-indigo-500"
              )}>
                {person.photoDataUrl
                  ? <img src={person.photoDataUrl} alt={person.name} className="h-full w-full object-cover" />
                  : person.name.charAt(0).toUpperCase()}
              </div>
              <button
                onClick={() => photoInputRef.current?.click()}
                className="absolute inset-0 rounded-2xl bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Camera className="h-4 w-4 text-white" />
              </button>
              <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
            </div>

            <div className="flex gap-2 mb-1">
              {editing ? (
                <>
                  <button
                    onClick={() => setEditing(false)}
                    className="h-8 px-3 rounded-xl text-[11.5px] font-semibold border border-[hsl(var(--border))] bg-white hover:bg-[hsl(var(--secondary))] transition-colors"
                  >
                    Batal
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="h-8 px-3 rounded-xl text-[11.5px] font-bold text-white flex items-center gap-1.5 disabled:opacity-60"
                    style={{ background: "linear-gradient(135deg,#f97316,#ea580c)" }}
                  >
                    <Save className="h-3 w-3" />
                    {saving ? "Menyimpan…" : "Simpan"}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setEditing(true)}
                  className="h-8 px-3 rounded-xl text-[11.5px] font-semibold border border-[hsl(var(--border))] bg-white hover:bg-[hsl(var(--secondary))] transition-colors flex items-center gap-1.5"
                >
                  <Pencil className="h-3 w-3" /> Edit
                </button>
              )}
            </div>
          </div>

          {editing ? (
            /* ── Edit form ── */
            <div className="space-y-2.5">
              <div className="space-y-1">
                <Label className="text-[10px] font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">Nama Lengkap *</Label>
                <Input className="h-8 text-[12.5px] rounded-xl" value={form.name ?? ""} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} autoFocus />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px] font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">Kelamin</Label>
                  <Select value={form.gender ?? ""} onValueChange={(v) => setForm((f) => ({ ...f, gender: v as "L" | "P" }))}>
                    <SelectTrigger className="h-8 text-[12.5px] rounded-xl"><SelectValue placeholder="Pilih" /></SelectTrigger>
                    <SelectContent style={{ background: "#fff" }}>
                      <SelectItem value="L">Laki-laki</SelectItem>
                      <SelectItem value="P">Perempuan</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">No. HP</Label>
                  <Input className="h-8 text-[12.5px] rounded-xl" placeholder="08xx" value={form.phone ?? ""} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px] font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">Tgl. Lahir</Label>
                  <Input type="date" className="h-8 text-[12.5px] rounded-xl" value={form.birthDate ?? ""} onChange={(e) => setForm((f) => ({ ...f, birthDate: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">No. Paspor</Label>
                  <Input className="h-8 text-[12.5px] rounded-xl font-mono" placeholder="A1234567" value={form.passportNumber ?? ""} onChange={(e) => setForm((f) => ({ ...f, passportNumber: e.target.value }))} />
                </div>
              </div>
            </div>
          ) : (
            /* ── View mode ── */
            <div className="space-y-3">
              <div>
                <h2 className="text-lg font-bold text-[hsl(var(--card-foreground))] leading-tight">{person.name}</h2>
                {person.gender && (
                  <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full mt-0.5 inline-block",
                    person.gender === "P" ? "bg-pink-50 text-pink-500" : "bg-blue-50 text-blue-500")}>
                    {person.gender === "P" ? "Perempuan" : "Laki-laki"}
                  </span>
                )}
              </div>

              {/* Passport number — prominent */}
              {person.passportNumber && (
                <div className="flex items-center gap-3 rounded-xl bg-orange-50 border border-orange-200 px-3.5 py-2.5">
                  <ShieldCheck className="h-4 w-4 text-orange-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-orange-500 font-semibold uppercase tracking-wide">No. Paspor</p>
                    <p className="font-mono font-bold text-[15px] text-orange-800 tracking-widest">{person.passportNumber}</p>
                  </div>
                  <button
                    onClick={copyPassport}
                    className="h-7 w-7 rounded-lg hover:bg-orange-100 flex items-center justify-center transition-colors shrink-0"
                    title="Salin nomor paspor"
                  >
                    {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5 text-orange-400" />}
                  </button>
                </div>
              )}

              {/* Other info */}
              <div className="grid grid-cols-1 gap-1.5">
                {person.phone && (
                  <div className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))]">
                    <Phone strokeWidth={1.5} className="h-3.5 w-3.5 shrink-0" />
                    <span>{person.phone}</span>
                  </div>
                )}
                {person.birthDate && (
                  <div className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))]">
                    <CalendarDays strokeWidth={1.5} className="h-3.5 w-3.5 shrink-0" />
                    <span>{formatDate(person.birthDate, "full")}</span>
                  </div>
                )}
              </div>

              {/* Passport doc preview */}
              {passportDocs.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">Dokumen Paspor</p>
                  <div className="flex flex-wrap gap-2">
                    {passportDocs.map((doc) => (
                      <button
                        key={doc.id}
                        onClick={() => {
                          const w = window.open();
                          if (!w) return;
                          if (doc.fileType === "image") {
                            w.document.write(`<img src="${doc.dataUrl}" style="max-width:100%;"/>`);
                          } else {
                            w.document.write(`<iframe src="${doc.dataUrl}" style="width:100%;height:100vh;border:none;"></iframe>`);
                          }
                        }}
                        className="relative rounded-xl overflow-hidden border border-[hsl(var(--border))] hover:border-orange-300 transition-all group"
                      >
                        {doc.fileType === "image" ? (
                          <img src={doc.dataUrl} alt={doc.label} className="h-20 w-20 object-cover" />
                        ) : (
                          <div className="h-20 w-20 flex flex-col items-center justify-center bg-[hsl(var(--secondary))] gap-1">
                            <FileText className="h-6 w-6 text-[hsl(var(--muted-foreground))]" />
                            <span className="text-[9px] text-[hsl(var(--muted-foreground))] px-1 text-center truncate w-full">PDF</span>
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <ExternalLink className="h-4 w-4 text-white" />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Footer */}
          {!editing && (
            <div className="mt-4 pt-3 border-t border-[hsl(var(--border))]">
              <button
                onClick={() => { onClose(); navigate(`/trips/${tripId}/jamaah/${person.id}`); }}
                className="w-full h-9 rounded-xl text-[12.5px] font-semibold border border-[hsl(var(--border))] bg-white hover:bg-[hsl(var(--secondary))] transition-colors flex items-center justify-center gap-2"
              >
                <ExternalLink strokeWidth={1.5} className="h-3.5 w-3.5" />
                Lihat Profil & Dokumen Lengkap
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── JAMAAH CARD ────────────────────────────────────────────────────────────────
function JamaahCard({ jamaah, tripId, onDelete, onPreview }: { jamaah: Jamaah; tripId: string; onDelete: (j: Jamaah) => void; onPreview: (j: Jamaah) => void }) {
  const { formatDate } = useRegional();
  const navigate = useNavigate();

  return (
    <div
      className="group relative rounded-2xl border border-[hsl(var(--border))] bg-white p-4 flex gap-4 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer"
      onClick={() => onPreview(jamaah)}
      data-testid={`card-jamaah-${jamaah.id}`}
    >
      {/* Avatar */}
      <div className={cn(
        "h-14 w-14 rounded-2xl flex items-center justify-center shrink-0 text-white font-bold text-xl",
        jamaah.gender === "P" ? "bg-gradient-to-br from-pink-400 to-rose-500" : "bg-gradient-to-br from-blue-400 to-indigo-500"
      )}>
        {jamaah.photoDataUrl ? (
          <img src={jamaah.photoDataUrl} alt={jamaah.name} className="h-full w-full rounded-2xl object-cover" />
        ) : (
          <span>{jamaah.name.charAt(0).toUpperCase()}</span>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <h4 className="font-semibold text-sm text-[hsl(var(--card-foreground))] truncate">{jamaah.name}</h4>
          {jamaah.needsReview && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-700 border border-amber-200" title="MRZ checksum gagal — cek ulang manual">
              REVIEW
            </span>
          )}
        </div>
        {jamaah.passportNumber && (
          <div className="flex items-center gap-1 text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
            <CreditCard strokeWidth={1.5} className="h-3 w-3" />
            <span>{jamaah.passportNumber}</span>
          </div>
        )}
        {jamaah.phone && (
          <div className="flex items-center gap-1 text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
            <Phone strokeWidth={1.5} className="h-3 w-3" />
            <span>{jamaah.phone}</span>
          </div>
        )}
        {jamaah.birthDate && (
          <div className="flex items-center gap-1 text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
            <CalendarDays strokeWidth={1.5} className="h-3 w-3" />
            <span>{jamaah.birthDate ? formatDate(jamaah.birthDate) : "—"}</span>
          </div>
        )}
      </div>

      {/* Gender badge */}
      {jamaah.gender && (
        <span className={cn(
          "absolute top-3 right-10 text-[10px] font-semibold px-1.5 py-0.5 rounded-full",
          jamaah.gender === "P" ? "bg-pink-50 text-pink-500" : "bg-blue-50 text-blue-500"
        )}>
          {jamaah.gender === "P" ? "Perempuan" : "Laki-laki"}
        </span>
      )}

      {/* Action buttons (edit + delete) */}
      <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
        <button
          className="h-6 w-6 rounded-full flex items-center justify-center hover:bg-orange-50 hover:text-[hsl(var(--primary))] text-[hsl(var(--muted-foreground))] transition-colors"
          onClick={(e) => { e.stopPropagation(); navigate(`/paket/${tripId}/jamaah/${jamaah.id}`); }}
          title="Edit data jamaah"
          data-testid={`btn-edit-jamaah-${jamaah.id}`}
        >
          <Pencil strokeWidth={1.5} className="h-3.5 w-3.5" />
        </button>
        <button
          className="h-6 w-6 rounded-full flex items-center justify-center hover:bg-red-50 hover:text-red-500 text-[hsl(var(--muted-foreground))] transition-colors"
          onClick={(e) => { e.stopPropagation(); onDelete(jamaah); }}
          data-testid={`btn-delete-jamaah-${jamaah.id}`}
        >
          <Trash2 strokeWidth={1.5} className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ── TRIP DETAIL PAGE ───────────────────────────────────────────────────────────
export default function TripDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const trips = useTripsStore((s) => s.trips);
  const { formatDate } = useRegional();
  const { jamaah, loadingJamaah, fetchJamaah, removeJamaah } = useJamaahStore();
  const [addOpen, setAddOpen] = useState(false);
  const [flyerOpen, setFlyerOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Jamaah | null>(null);
  const [previewTarget, setPreviewTarget] = useState<Jamaah | null>(null);

  const trip = trips.find((t) => t.id === id);
  const quotaFull = trip?.quotaPax != null && jamaah.length >= trip.quotaPax;

  useEffect(() => {
    if (id) fetchJamaah(id);
  }, [id, fetchJamaah]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await removeJamaah(deleteTarget.id);
    toast.success(`Jamaah "${deleteTarget.name}" dihapus.`);
    setDeleteTarget(null);
  };

  if (!trip) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-[hsl(var(--muted-foreground))]">Paket tidak ditemukan.</p>
        <Button variant="outline" onClick={() => navigate("/")} className="mt-4">← Kembali</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back + header */}
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/")}
          className="rounded-xl h-9 w-9 shrink-0 hover:bg-[hsl(var(--secondary))]">
          <ArrowLeft strokeWidth={1.5} className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-3xl">{trip.emoji}</span>
            <h1 className="text-2xl font-bold tracking-tight text-[hsl(var(--card-foreground))] truncate">{trip.name}</h1>
          </div>
          <div className="flex flex-wrap gap-3 mt-1.5 text-sm text-[hsl(var(--muted-foreground))]">
            <span className="flex items-center gap-1"><MapPin strokeWidth={1.5} className="h-3.5 w-3.5" /> {trip.destination}</span>
            <span className="flex items-center gap-1"><CalendarDays strokeWidth={1.5} className="h-3.5 w-3.5" /> {trip.startDate ? formatDate(trip.startDate) : "—"} – {trip.endDate ? formatDate(trip.endDate) : "—"}</span>
            <span className="flex items-center gap-1">
              <Users strokeWidth={1.5} className="h-3.5 w-3.5" />
              {jamaah.length}{trip.quotaPax ? `/${trip.quotaPax}` : ""} jamaah
              {trip.quotaPax && (
                <span className={cn(
                  "ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md",
                  quotaFull ? "bg-red-100 text-red-700" : jamaah.length / trip.quotaPax >= 0.8 ? "bg-amber-100 text-amber-700" : "bg-emerald-50 text-emerald-700"
                )}>
                  {quotaFull ? "PENUH" : `${trip.quotaPax - jamaah.length} slot`}
                </span>
              )}
            </span>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button onClick={() => setFlyerOpen(true)} variant="outline"
            className="h-9 px-3 text-sm rounded-xl border-orange-200 text-orange-700 hover:bg-orange-50">
            <Megaphone strokeWidth={1.5} className="h-4 w-4 mr-1.5" /> Flyer
          </Button>
          <Button onClick={() => setAddOpen(true)} disabled={quotaFull}
            title={quotaFull ? "Kuota penuh" : ""}
            className="gradient-primary text-white shadow-glow hover:opacity-90 rounded-xl h-9 px-4 text-sm disabled:opacity-50 disabled:cursor-not-allowed">
            <Plus strokeWidth={1.5} className="h-4 w-4 mr-1.5" /> Tambah Jamaah
          </Button>
        </div>
      </div>

      {/* Jamaah grid */}
      {loadingJamaah ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl border border-[hsl(var(--border))] p-4 flex gap-3 animate-pulse">
              <div className="h-14 w-14 rounded-2xl bg-[hsl(var(--secondary))] shrink-0" />
              <div className="flex-1 space-y-2 pt-1">
                <div className="h-3.5 bg-[hsl(var(--secondary))] rounded w-2/3" />
                <div className="h-3 bg-[hsl(var(--secondary))] rounded w-1/2" />
                <div className="h-3 bg-[hsl(var(--secondary))] rounded w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : jamaah.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="h-16 w-16 flex items-center justify-center mb-4">
            <Users strokeWidth={1.5} className="h-8 w-8 text-[hsl(var(--muted-foreground))]" />
          </div>
          <h2 className="text-base font-semibold text-[hsl(var(--card-foreground))]">Belum ada jamaah</h2>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
            Tambahkan jamaah untuk mulai mengelola pemberkasan.
          </p>
          <Button onClick={() => setAddOpen(true)}
            className="mt-5 gradient-primary text-white shadow-glow hover:opacity-90 rounded-xl">
            <Plus strokeWidth={1.5} className="h-4 w-4 mr-2" /> Tambah Jamaah Pertama
          </Button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {jamaah.map((j) => (
            <JamaahCard key={j.id} jamaah={j} tripId={id!} onDelete={setDeleteTarget} onPreview={setPreviewTarget} />
          ))}
          <button onClick={() => setAddOpen(true)}
            className="rounded-2xl border-2 border-dashed border-[hsl(var(--border))] flex flex-col items-center justify-center gap-2 py-10 hover:border-[hsl(var(--primary))] hover:bg-[hsl(var(--accent))] transition-all group">
            <div className="h-9 w-9 flex items-center justify-center transition-colors">
              <Plus strokeWidth={1.5} className="h-4 w-4 text-[hsl(var(--muted-foreground))] group-hover:text-[hsl(var(--primary))]" />
            </div>
            <span className="text-sm text-[hsl(var(--muted-foreground))] group-hover:text-[hsl(var(--primary))] font-medium">Tambah Jamaah</span>
          </button>
        </div>
      )}

      {id && <AddJamaahDialog open={addOpen} tripId={id} onClose={() => setAddOpen(false)} />}

      <FlyerDialog
        open={flyerOpen}
        onClose={() => setFlyerOpen(false)}
        trip={trip}
        jamaahCount={jamaah.length}
      />

      <JamaahPreviewDialog
        jamaah={previewTarget}
        tripId={id!}
        open={!!previewTarget}
        onClose={() => setPreviewTarget(null)}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent style={{ background: "#fff", color: "hsl(var(--foreground))" }}>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Jamaah?</AlertDialogTitle>
            <AlertDialogDescription>
              Data jamaah <strong>"{deleteTarget?.name}"</strong> dan seluruh dokumennya akan dihapus permanen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-500 hover:bg-red-600 text-white">Hapus</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
